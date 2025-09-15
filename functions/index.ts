import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const ACTIVE_SEASON = "S1";

const SHARDS = 32;
function hashUidToShard(uid: string, mod = SHARDS) {
  let h = 5381;
  for (let i = 0; i < uid.length; i++) h = ((h << 5) + h) ^ uid.charCodeAt(i);
  h = h | 0;
  const idx = Math.abs(h) % mod;
  return idx;
}

export const awardTrophy = onCall({ cors: true }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new Error("unauthenticated");
  const code = String(req.data?.code || "");
  if (!code) throw new Error("invalid-argument");

  const tro = await db.doc(`trophies/${code}`).get();
  if (!tro.exists) throw new Error("not-found");
  const points = tro.get("points") || 0;

  const utId = `${uid}_${code}`;
  const utRef = db.doc(`userTrophies/${utId}`);
  const usRef = db.doc(`userStats/${uid}`);
  const lbRef = db.doc(`leaderboards/season_${ACTIVE_SEASON}/users/${uid}`);

  await db.runTransaction(async (tx) => {
    const ut = await tx.get(utRef);
    if (ut.exists) return;

    tx.set(utRef, { uid, code, earnedAt: FieldValue.serverTimestamp() });
    tx.set(
      usRef,
      {
        totalTrophies: FieldValue.increment(1),
        xp: FieldValue.increment(points),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    tx.set(lbRef, { score: FieldValue.increment(points) }, { merge: true });
  });

  return { ok: true };
});

export const getStats = onCall({ cors: true }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new Error("unauthenticated");
  const doc = await db.doc(`userStats/${uid}`).get();
  return { totalTrophies: doc.get("totalTrophies") || 0, xp: doc.get("xp") || 0 };
});

// Coins/Diamanten gutschreiben (Alias, v2)
export const grantCoins = onCall({ cors: true, region: 'us-central1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'login required');

  const amountRaw = req.data?.amount;
  if (typeof amountRaw !== 'number' || !Number.isFinite(amountRaw)) {
    throw new HttpsError('invalid-argument', 'amount must be number');
  }
  const amount = Math.max(1, Math.min(3, Math.floor(amountRaw)));

  const userRef = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const prev = (snap.exists && typeof snap.get('coins') === 'number') ? snap.get('coins') : 0;
    tx.set(userRef, { coins: prev + amount }, { merge: true });
  });

  return { ok: true, added: amount };
});

// Diamanten gutschreiben (callable, v2)Nee
export const grantDiamonds = onCall({ cors: true, region: 'us-central1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'login required');

  const amountRaw = req.data?.amount;
  if (typeof amountRaw !== 'number' || !Number.isFinite(amountRaw)) {
    throw new HttpsError('invalid-argument', 'amount must be number');
  }
  const requested = Math.max(1, Math.min(3, Math.floor(amountRaw))); // 1–3 pro Request

  const source: string = String(req.data?.source || 'tap-rush');
  const opId: string | null = req.data?.opId ? String(req.data.opId) : null; // optional Idempotenz-ID

  // Berlin-Tages-ID YYYY-MM-DD
  const todayId = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());

  const userRef = db.doc(`users/${uid}`);
  const dayRef = db.doc(`users/${uid}/countersByDay/${todayId}`);
  const opRef = opId ? db.doc(`users/${uid}/coinGrants/${opId}`) : null;

  const DAY_CAP = 30; // max Diamanten pro Tag

  const res = await db.runTransaction(async (tx) => {
    // Idempotenz prüfen
    if (opRef) {
      const opSnap = await tx.get(opRef);
      if (opSnap.exists) {
        const prev = opSnap.data() as any;
        return { ok: true, added: prev?.added || 0, capped: !!prev?.capped, day: todayId, idempotent: true };
      }
    }

    const [userSnap, daySnap] = await Promise.all([tx.get(userRef), tx.get(dayRef)]);
    const todaySoFar: number = daySnap.exists && typeof daySnap.get('diamonds') === 'number' ? daySnap.get('diamonds') : 0;
    const room = Math.max(0, DAY_CAP - todaySoFar);
    const added = Math.max(0, Math.min(requested, room));

    if (added <= 0) {
      if (opRef) tx.set(opRef, { uid, requested, added: 0, capped: true, day: todayId, source, ts: admin.firestore.FieldValue.serverTimestamp() });
      if (!daySnap.exists) tx.set(dayRef, { day: todayId, diamonds: 0 });
      return { ok: true, added: 0, capped: true, day: todayId };
    }

    // coins inkrementieren
    tx.set(userRef, { coins: admin.firestore.FieldValue.increment(added), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    // Tageszähler inkrementieren
    if (daySnap.exists) {
      tx.update(dayRef, { diamonds: admin.firestore.FieldValue.increment(added), day: todayId });
    } else {
      tx.set(dayRef, { diamonds: added, day: todayId });
    }

    // Operation protokollieren
    if (opRef) tx.set(opRef, { uid, requested, added, capped: added < requested, day: todayId, source, ts: admin.firestore.FieldValue.serverTimestamp() });

    return { ok: true, added, capped: added < requested, day: todayId };
  });

  return res;
});

export const dailySnapshot = onSchedule("0 0 * * *", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const seasonCol = db.collection(`leaderboards/season_${ACTIVE_SEASON}/users`);
  const snapCol = db.collection(`leaderboards/daily_${today}/users`);
  const top = await seasonCol.orderBy("score", "desc").limit(100).get();
  const batch = db.batch();
  top.forEach((d) => batch.set(snapCol.doc(d.id), { score: d.get("score") || 0 }));
  await batch.commit();
});

// Secure daily claim (atomic, idempotent per day)
export const claimDaily = onCall({ cors: true, region: 'us-central1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'login required');

  const now = admin.firestore.Timestamp.now();
  const userRef = db.doc(`users/${uid}`);

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const todayId = fmt.format(now.toDate()); // YYYY-MM-DD
  const dayRef = userRef.collection('claims').doc(todayId);

  return db.runTransaction(async (tx) => {
    const [userSnap, daySnap] = await Promise.all([tx.get(userRef), tx.get(dayRef)]);
    if (daySnap.exists) throw new HttpsError('failed-precondition', 'already-claimed');

    const data = userSnap.exists ? (userSnap.data() as any) : {};
    const last = data.lastClaim instanceof admin.firestore.Timestamp ? data.lastClaim : null;

    const sameDay = (a: admin.firestore.Timestamp | null, b: admin.firestore.Timestamp) => !!a && fmt.format(a.toDate()) === fmt.format(b.toDate());
    const yesterday = admin.firestore.Timestamp.fromMillis(now.toMillis() - 24 * 3600 * 1000);

    const prevStreak = typeof data.streak === 'number' ? data.streak : 0;
    const streak = last && sameDay(last, yesterday) ? prevStreak + 1 : 1;

    const rewardTable = [5, 5, 5, 10, 5, 5, 20];
    const add = rewardTable[(streak - 1) % rewardTable.length];

    tx.set(dayRef, { createdAt: now });
    tx.set(userRef, {
      coins: (typeof data.coins === 'number' ? data.coins : 0) + add,
      streak,
      lastClaim: now,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { ok: true, add, streak };
  });
});

import { onDocumentWritten } from "firebase-functions/v2/firestore";

// Lose gutschreiben (callable, v2)
export const grantTickets = onCall({ cors: true, region: 'us-central1' }, async (req) => {
  try {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'login required');

    const amountRaw = req.data?.amount;
    const amount = Math.max(0, Math.floor(Number(amountRaw ?? 0)));
    if (!amount) return { ok: true, added: 0 };

    const grantId: string = String(req.data?.grantId || '');

    // Berlin day id
    const todayId = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());

    const counterRef = db.doc(`users/${uid}/countersByDay/${todayId}`);

    await db.runTransaction(async (tx) => {
      // READS FIRST
      let gRef: FirebaseFirestore.DocumentReference | null = null;
      let gSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      if (grantId) {
        gRef = db.doc(`users/${uid}/ticketGrants/${grantId}`);
        gSnap = await tx.get(gRef);
      }
      const cSnap = await tx.get(counterRef);

      // WRITES AFTER ALL READS
      if (grantId && gRef && gSnap && !gSnap.exists) {
        tx.set(gRef, { amount, day: todayId, ts: admin.firestore.FieldValue.serverTimestamp() });
      }
      if (cSnap.exists) {
        tx.update(counterRef, { tickets: admin.firestore.FieldValue.increment(amount), day: todayId });
      } else {
        tx.set(counterRef, { tickets: amount, day: todayId });
      }

      // shard write for aggregate scaling
      const shard = hashUidToShard(uid, SHARDS);
      const shardRef = db.doc(`metrics_daily_shards/${todayId}/shards/${shard}`);
      tx.set(shardRef, { tickets: admin.firestore.FieldValue.increment(amount) }, { merge: true });
    });

    return { ok: true, added: amount, day: todayId };
  } catch (err: any) {
    console.error('grantTickets error', err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err?.message || 'unknown error');
  }
});

// Tagesgesamt aggregieren (Trigger, v2)
export const onDailyTicketsChange = onDocumentWritten({ document: 'users/{uid}/countersByDay/{dayId}', region: 'us-central1' }, async (event) => {
  const after = event.data?.after.data() as any | undefined;
  const before = event.data?.before.data() as any | undefined;
  const a = typeof after?.tickets === 'number' ? after.tickets : 0;
  const b = typeof before?.tickets === 'number' ? before.tickets : 0;
  const diff = Math.max(0, a - b);
  if (!diff) return;

  const dayId = String((event.params as any)?.dayId || '');

  try {
    await db.doc(`metrics_daily/${dayId || 'unknown'}`).set(
      { ticketsTodayTotal: FieldValue.increment(diff), date: dayId },
      { merge: true }
    );
  } catch (e) {
    console.error('onDailyTicketsChange aggregate write failed', { dayId, diff, error: e });
    throw e;
  }
});

// Aggregate shard updates into metrics_daily/{day}
export const onShardChangeAggregateDaily = onDocumentWritten({ document: 'metrics_daily_shards/{day}/shards/{shard}', region: 'us-central1' }, async (event) => {
  const day = String((event.params as any)?.day || '');
  if (!day) return;
  const col = db.collection(`metrics_daily_shards/${day}/shards`);
  const snap = await col.get();
  let total = 0;
  snap.forEach((d) => {
    const t = d.get('tickets');
    if (typeof t === 'number') total += t;
  });
  const poolLevel = Math.floor(total / 100);
  await db.doc(`metrics_daily/${day}`).set({ date: day, ticketsTodayTotal: total, poolLevel }, { merge: true });
});