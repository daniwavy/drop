import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
// Silence console output in Cloud Functions to minimize noisy logs
// DISABLED FOR DEBUGGING — keep commented out so logs are visible
/*
const _consoleMethods = ['log','debug','info','warn','error'] as const;
for (const m of _consoleMethods) {
  // @ts-ignore
  console[m] = () => {};
}
*/
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const ACTIVE_SEASON = "S1";
const MIN_TICKETS_FOR_RAFFLE = 50;

// Re-export functions implemented in src/index.ts so the deploy packager picks them up.
import { enterDrop, trackActiveTodayUsers, resetActiveTodayUsers } from './src/index';
export { enterDrop, trackActiveTodayUsers, resetActiveTodayUsers };

// Import and re-export the Auth onCreate handler
import { onUserCreateTest } from './onUserCreate';
export { onUserCreateTest };

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
// (note: src functions are re-exported at the top of this file)

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

    // 7‑Tage‑Zyklus (Diamanten): ehem. 2×XP-Tag → 10 Diamanten
    const rewardTable = [5, 5, 5, 10, 5, 5, 10];
    // Legacy: falls ein Client noch 'double_xp' anfragt, mappe auf +10 Diamanten
    const requested = String(req.data?.requestItem || '');
    const legacyOverride = requested === 'double_xp' ? 10 : null;

    const addRaw = rewardTable[(streak - 1) % rewardTable.length];
    const add = legacyOverride ?? addRaw;

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

// Defensive function deployed as the project's onUserDocumentCreate entry point.
// Purpose: if a new user doc is created without a referral, ensure they don't
// receive an unintended start balance. This will reset any non-zero coins on
// create for non-referred users and write an audit entry. Idempotent via
// `startCoinCorrectionApplied` flag.
// NOTE: This fixes the issue with legacy onUserCreate auth trigger setting coins to 1000.
// Now it properly resets coins to 0 for non-referred users.
export const onUserDocumentCreate = onDocumentWritten({ document: 'users/{uid}', region: 'us-central1' }, async (event) => {
  try {
    const before = event.data?.before?.data?.();
    const after = event.data?.after?.data?.();
    const uid = String(event.params?.uid || '');
    // Only act on create
    if (before) return;
    if (!after) return;

    const hasReferral = !!(after.referredBy || after.referred_by || after.referrer || after.referredCode || after.referralCode || after.referral_code);
    if (hasReferral) return; // let processReferralReward handle referrals

    const coins = typeof after.coins === 'number' ? after.coins : 0;
    if (coins <= 0) return;

    const userRef = db.doc(`users/${uid}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return;
      const already = !!snap.get('startCoinCorrectionApplied');
      if (already) return;
      const current = typeof snap.get('coins') === 'number' ? snap.get('coins') : 0;
      if (current <= 0) return;

      tx.set(userRef, {
        coins: 0,
        startCoinCorrectionApplied: true,
        startCoinCorrectionAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      const auditRef = db.collection(`users/${uid}/startCoinCorrections`).doc();
      tx.set(auditRef, {
        previousCoins: current,
        reason: 'non-referred-start-reset',
        appliedBy: 'onUserDocumentCreate',
        ts: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    return;
  } catch (err) {
    // Minimal logging; don't fail the create flow
    try { console.warn('[onUserDocumentCreate] error', String(err)); } catch {}
    return;
  }
});

// Lose gutschreiben (callable, v2)
export const grantTickets = onCall({ cors: true, region: 'us-central1' }, async (req) => {
  try {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'login required');

    // Treat client amount as BASE; allow zero (no reward)
    const amountRaw = req.data?.amount;
    const amount = Math.max(0, Math.floor(Number(amountRaw ?? 0)));
    const serverNowBase = admin.firestore.Timestamp.now();
    const todayId = raffleCollectionDateId(serverNowBase.toDate());
    if (amount === 0) {
      // Even with zero amount, expose tix2x so the UI can trigger animations correctly
      let tix2xZero = false;
      try {
        const userRef0 = db.doc(`users/${uid}`);
        const u0 = await userRef0.get();
        if (u0.exists) {
          const eff0 = (u0.get('effects') || {}) as any;
          const dt0 = eff0?.double_tickets || null;
          if (dt0) {
            const now0 = serverNowBase;
            const act0 = dt0.activatedAt instanceof admin.firestore.Timestamp ? dt0.activatedAt : null;
            const until0 = (dt0.until instanceof admin.firestore.Timestamp)
              ? dt0.until
              : (typeof dt0.until === 'number' ? admin.firestore.Timestamp.fromMillis(dt0.until) : null);
            if (act0 && until0) {
              const ms = now0.toMillis();
              tix2xZero = ms >= act0.toMillis() && ms < until0.toMillis();
            }
          }
        }
      } catch {}
      const mult0 = tix2xZero ? 2 : 1;
      return { ok: true, added: 0, multiplier: mult0, capped: false, day: todayId, skipped: false, tix2x: tix2xZero } as any;
    }

    const grantId: string = String(req.data?.grantId || '');

    const MAX_TICKETS_PER_DAY: number | null = null; // null = unlimited per day

    const userRef = db.doc(`users/${uid}`);
    const counterRef = db.doc(`users/${uid}/countersByDay/${todayId}`);
    const rtRef = db.doc(`users/${uid}/rt/lastTicketGrant`);

    const res = await db.runTransaction(async (tx) => {
      // IDEMPOTENCY: try to create op doc first, so concurrent transactions collide
      let gRef: FirebaseFirestore.DocumentReference | null = null;
      if (grantId) {
        gRef = db.doc(`users/${uid}/ticketGrants/${grantId}`);
        const opExists = await tx.get(gRef);
        if (opExists.exists) {
          const prev: any = opExists.data() || {};
          return { applied: Number(prev.amountApplied || 0), multiplier: Number(prev.multiplier || 1), capped: !!prev.capped, day: todayId };
        }
        // reserve this op id; if another tx tries to create it, commit will fail and retry will hit the early-return above
        tx.create(gRef, { status: 'pending', ts: admin.firestore.FieldValue.serverTimestamp(), day: todayId });
      }

      const [uSnap, cSnap, rtSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(counterRef),
        tx.get(rtRef)
      ]);

      // Time-window based double tickets: active only between activatedAt and until (server time)
      const nowTs = admin.firestore.Timestamp.now();
      let tix2x = false;
      if (uSnap.exists) {
        const eff = uSnap.get('effects') || {};
        const dt = (eff as any)?.double_tickets || null;
        if (dt) {
          const act = dt.activatedAt instanceof admin.firestore.Timestamp ? dt.activatedAt : null;
          const untilTs = (dt.until instanceof admin.firestore.Timestamp)
            ? dt.until
            : (typeof dt.until === 'number' ? admin.firestore.Timestamp.fromMillis(dt.until) : null);
          if (act && untilTs) {
            const nowMs = nowTs.toMillis();
            tix2x = nowMs >= act.toMillis() && nowMs < untilTs.toMillis();
          }
        }
      }

      // 250ms dedupe lock setup
      const WINDOW_MS = 250;
      const nowMsServer = nowTs.toMillis();
      const bucket = Math.floor(nowMsServer / WINDOW_MS);
      const lockRef = db.doc(`users/${uid}/grantLocks/${bucket}`);

      // Transactional dedupe: apply 250ms lock only if no grantId is present
      if (!grantId) {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists) {
        const curr = (cSnap.exists && typeof cSnap.get('tickets') === 'number') ? cSnap.get('tickets') : 0;
        const multSkip = tix2x ? 2 : 1;
        const roomRemain = MAX_TICKETS_PER_DAY == null ? null : Math.max(0, MAX_TICKETS_PER_DAY - curr);
        return { applied: 0, multiplier: multSkip, capped: false, day: todayId, skipped: true, current: curr, room: roomRemain, effective: 0, base: amount, tix2x } as any;
      }
      tx.create(lockRef, { atMs: nowMsServer, day: todayId });
    }
      // Server doubles only if client explicitly says amount is BASE (not pre-doubled)
      const clientIndicatesBase = (req.data?.effective === false) || (req.data?.alreadyEffective === false) || (req.data?.mode === 'base');
      const multiplier = (tix2x && clientIndicatesBase) ? 2 : 1;
      const effective = amount * multiplier;
      const current = (cSnap.exists && typeof cSnap.get('tickets') === 'number') ? cSnap.get('tickets') : 0;
      const roomRaw = MAX_TICKETS_PER_DAY == null ? Number.POSITIVE_INFINITY : Math.max(0, MAX_TICKETS_PER_DAY - current);
      const applied = Math.max(0, Math.min(effective, roomRaw));
      const capped = MAX_TICKETS_PER_DAY != null && applied < effective;
  const diag = { current, room: MAX_TICKETS_PER_DAY == null ? null : Math.max(0, MAX_TICKETS_PER_DAY - current), effective, base: amount, tix2x };

      // WRITES AFTER ALL READS
      if (grantId && gRef) {
        tx.set(gRef, {
          status: 'done', amountRequested: amount, amountApplied: applied, multiplier, capped, day: todayId,
          current,
          room: MAX_TICKETS_PER_DAY == null ? null : Math.max(0, MAX_TICKETS_PER_DAY - current),
          effective, base: amount, tix2x,
          ts: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
      if (cSnap.exists) {
        tx.update(counterRef, { tickets: admin.firestore.FieldValue.increment(applied), day: todayId });
      } else {
        tx.set(counterRef, { tickets: applied, day: todayId });
      }

      // shard write for aggregate scaling
      const shard = hashUidToShard(uid, SHARDS);
      const shardRef = db.doc(`metrics_daily_shards/${todayId}/shards/${shard}`);
      tx.set(shardRef, { tickets: admin.firestore.FieldValue.increment(applied) }, { merge: true });

      // set dedupe marker for next burst
      tx.set(rtRef, { atMs: nowMsServer, day: todayId, bucket }, { merge: true });

      return { applied, multiplier, capped, day: todayId, ...diag };
    });

    const roomReturn = (res as any).room;
    return {
      ok: true,
      added: res.applied,
      multiplier: res.multiplier,
      capped: res.capped,
      day: res.day,
      skipped: (res as any).skipped === true,
      current: (res as any).current,
      room: roomReturn == null || roomReturn === undefined ? null : roomReturn,
      effective: (res as any).effective,
      baseAmount: (res as any).base,
      tix2x: (res as any).tix2x,
    };
  } catch (err: any) {
    console.error('grantTickets error', err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err?.message || 'unknown error');
  }
});

// Activate double-tickets effect for N minutes (default 10)
export const activateDoubleTickets = onCall({ cors: true, region: 'us-central1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'login required');

  const minutesRaw = Number(req.data?.minutes ?? 10);
  const minutes = Math.max(1, Math.min(60, Math.floor(minutesRaw)));

  const now = admin.firestore.Timestamp.now();
  const until = admin.firestore.Timestamp.fromMillis(now.toMillis() + minutes * 60 * 1000);

  const userRef = db.doc(`users/${uid}`);
  await userRef.set({
    effects: {
      double_tickets: {
        activatedAt: now,
        until,
        active: true // legacy compatibility, server ignores this
      }
    }
  }, { merge: true });

  return { ok: true, minutes, activatedAt: now.toMillis(), until: until.toMillis() };
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
  let poolLevel = Math.floor(total / 100);
  try {
    const { levels } = await getPrizePoolConfig();
    if (levels.length > 0) {
      const progressLevels = buildProgressLevels(levels);
      const { current } = resolveProgressLevel(progressLevels, total);
      if (current) {
        poolLevel = current.index;
      }
    }
  } catch (err) {
    console.warn('[metrics_daily] pool level fallback', err);
  }
  await db.doc(`metrics_daily/${day}`).set({ date: day, ticketsTodayTotal: total, poolLevel }, { merge: true });
});

// ---------------- Raffle (weighted draw by tickets) ----------------
type BerlinDay = { year: number; month: number; day: number };

const berlinPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function berlinParts(d: Date = new Date()) {
  const parts = berlinPartsFormatter.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return {
    year: Number(map.year || '0'),
    month: Number(map.month || '0'),
    day: Number(map.day || '0'),
    hour: Number(map.hour || '0'),
    minute: Number(map.minute || '0'),
    second: Number(map.second || '0'),
  };
}

function formatBerlinDay(day: BerlinDay): string {
  return `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
}

function shiftBerlinDay(day: BerlinDay, delta: number): BerlinDay {
  const base = new Date(Date.UTC(day.year, day.month - 1, day.day));
  base.setUTCDate(base.getUTCDate() + delta);
  return { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1, day: base.getUTCDate() };
}

function raffleCollectionDateId(d: Date = new Date()): string {
  const parts = berlinParts(d);
  const minutes = parts.hour * 60 + parts.minute + parts.second / 60;
  const cutoffMinutes = 20 * 60; // 20:00 Berlin time
  let target: BerlinDay = { year: parts.year, month: parts.month, day: parts.day };
  if (minutes >= cutoffMinutes) {
    target = shiftBerlinDay(target, 1);
  }
  return formatBerlinDay(target);
}

function raffleDrawDateId(d: Date = new Date()): string {
  const parts = berlinParts(d);
  const minutes = parts.hour * 60 + parts.minute + parts.second / 60;
  const cutoffMinutes = 20 * 60;
  let target: BerlinDay = { year: parts.year, month: parts.month, day: parts.day };
  if (minutes < cutoffMinutes) {
    target = shiftBerlinDay(target, -1);
  }
  return formatBerlinDay(target);
}

// Return the current Berlin date id (YYYY-MM-DD) for the given instant.
// Unlike raffleDrawDateId which applies a cutoff, this returns the calendar day
// in Berlin for the provided moment — used so manual runs write to the day they
// actually take place.
function currentBerlinDateId(d: Date = new Date()): string {
  const parts = berlinParts(d);
  return formatBerlinDay({ year: parts.year, month: parts.month, day: parts.day });
}

function detRand(uid: string, salt: string, seed: string): number {
  const crypto = require('crypto') as typeof import('crypto');
  const hex = crypto.createHmac('sha256', seed).update(`${uid}|${salt}`).digest('hex').slice(0, 13);
  const int = parseInt(hex, 16);
  return int / Math.pow(2, 52); // [0,1)
}

function weightedSampleWithoutReplacement(
  entrants: Array<{ uid: string; w: number }>,
  k: number,
  seed: string,
  salt: string
): string[] {
  const scored = entrants.map(e => {
    const u = Math.max(Number.EPSILON, detRand(e.uid, salt, seed));
    const key = Math.pow(u, 1 / Math.max(1, e.w));
    return { uid: e.uid, key };
  });
  scored.sort((a, b) => b.key - a.key);
  return scored.slice(0, k).map(s => s.uid);
}

type PrizePoolLevelConfig = {
  key: string;
  index: number;
  ticketsNeeded: number;
  items: Array<{ name: string; totalRewards: number }>;
};

type PrizePoolConfig = {
  levels: PrizePoolLevelConfig[];
};

const PRIZE_POOL_CACHE_MS = 60 * 1000;
let prizePoolCache: { ts: number; data: PrizePoolConfig } | null = null;

type PrizePoolLevelProgress = PrizePoolLevelConfig & {
  start: number;
  end: number;
  required: number;
};

async function fetchPrizePoolsMap(): Promise<any> {
  let pools: any = {};
  try {
    const curSnap = await db.doc('config/currentMinigame').get();
    if (curSnap.exists) {
      const curPools = curSnap.get('prizePools');
      if (curPools && typeof curPools === 'object') pools = curPools;
    }
  } catch (err) {
    console.warn('[prizePools] currentMinigame fetch failed', err);
  }
  if (!pools || Object.keys(pools).length === 0) {
    try {
      const poolsSnap = await db.doc('config/prizePools').get();
      if (poolsSnap.exists) pools = poolsSnap.data() || {};
    } catch (err) {
      console.warn('[prizePools] fallback fetch failed', err);
    }
  }
  return pools || {};
}

function parsePrizePoolLevels(pools: any): PrizePoolLevelConfig[] {
  const entries = Object.entries(pools || {})
    .filter(([k, v]) => /^level-\d{2}$/i.test(k) && v && typeof v === 'object');

  const parsed = entries.map(([levelKey, levelObj], idx): PrizePoolLevelConfig => {
    const numericIndex = Number.parseInt(levelKey.slice(6), 10);
    const levelIndex = Number.isFinite(numericIndex) ? numericIndex : idx;
  const lvlAny: any = levelObj;
  const rawTicketsNeeded = lvlAny?.['tickets-needed'];
    const parsedTicketsNeeded = Number(rawTicketsNeeded);
    const ticketsNeeded = Number.isFinite(parsedTicketsNeeded)
      ? parsedTicketsNeeded
      : levelIndex * 100;

    const items: Array<{ name: string; totalRewards: number }> = [];
    const pushItem = (it: any) => {
      if (!it || typeof it !== 'object') return;
      const name = String(it.name ?? it.prize ?? it.title ?? '').trim();
      const qty = Number(it.totalRewards ?? it.count ?? it.qty ?? it.quantity ?? it.amount ?? it.total ?? 0);
      if (name.length > 0 && Number.isFinite(qty) && qty > 0) {
        items.push({ name, totalRewards: qty });
      }
    };

    const itemEntries = Object.entries(lvlAny)
      .filter(([k, v]) => /^item-\d{2}$/i.test(k) && v && typeof v === 'object')
      .sort((a, b) => Number.parseInt(a[0].slice(5), 10) - Number.parseInt(b[0].slice(5), 10));
    for (const [, it] of itemEntries) pushItem(it);
    if (Array.isArray(lvlAny.items)) lvlAny.items.forEach(pushItem);
    if (Array.isArray(lvlAny.prizes)) lvlAny.prizes.forEach(pushItem);

    return {
      key: levelKey,
      index: levelIndex,
      ticketsNeeded: Math.max(0, ticketsNeeded),
      items,
    };
  });

  parsed.sort((a, b) => {
    if (a.ticketsNeeded === b.ticketsNeeded) return a.index - b.index;
    return a.ticketsNeeded - b.ticketsNeeded;
  });
  return parsed;
}

async function getPrizePoolConfig(): Promise<PrizePoolConfig> {
  const now = Date.now();
  if (prizePoolCache && now - prizePoolCache.ts < PRIZE_POOL_CACHE_MS) {
    return prizePoolCache.data;
  }

  const pools = await fetchPrizePoolsMap();
  const levels = parsePrizePoolLevels(pools);
  const data: PrizePoolConfig = { levels };
  prizePoolCache = { ts: now, data };
  return data;
}

function buildProgressLevels(levels: PrizePoolLevelConfig[]): PrizePoolLevelProgress[] {
  const sorted = [...levels].sort((a, b) => a.index - b.index);
  let cumulative = 0;
  const out: PrizePoolLevelProgress[] = [];
  for (const lvl of sorted) {
    const incrementRaw = Number(lvl.ticketsNeeded);
    const increment = Number.isFinite(incrementRaw) && incrementRaw > 0 ? Math.floor(incrementRaw) : 100;
    const required = Math.max(1, increment);
    const start = cumulative;
    const end = start + required;
    cumulative = end;
    out.push({ ...lvl, start, end, required });
  }
  return out;
}

function resolveProgressLevel(levels: PrizePoolLevelProgress[], totalTickets: number): { current: PrizePoolLevelProgress; next: PrizePoolLevelProgress | null } {
  if (levels.length === 0) {
    throw new HttpsError('failed-precondition', 'prize pools not configured');
  }
  let current = levels[0];
  let next: PrizePoolLevelProgress | null = levels.length > 1 ? levels[1] : null;
  for (let i = 0; i < levels.length; i++) {
    const entry = levels[i];
    const nextEntry = levels[i + 1] ?? null;
    if (totalTickets >= entry.end && nextEntry) {
      current = nextEntry;
      next = levels[i + 2] ?? null;
      continue;
    }
    current = entry;
    next = nextEntry;
    return { current, next };
  }
  return { current: levels[levels.length - 1], next: null };
}

async function choosePrizePoolLevel(_dayId: string, totalTickets: number): Promise<{ levelKey: string; items: Array<{ name: string; totalRewards: number }>; desiredLevel: number }> {
  const { levels } = await getPrizePoolConfig();
  if (!levels || levels.length === 0) {
    throw new HttpsError('failed-precondition', 'prizePools leer');
  }

  const progressLevels = buildProgressLevels(levels);
  const { current } = resolveProgressLevel(progressLevels, totalTickets);

  let chosen = current;
  if (!chosen || chosen.items.length === 0) {
    const descending = [...progressLevels].sort((a, b) => b.start - a.start);
    for (const entry of descending) {
      if (totalTickets >= entry.start && entry.items.length > 0) {
        chosen = entry;
        break;
      }
    }
    if ((!chosen || chosen.items.length === 0)) {
      const fallbackWithItems = progressLevels.find(entry => entry.items.length > 0);
      if (fallbackWithItems) {
        chosen = fallbackWithItems;
      }
    }
  }

  if (!chosen || chosen.items.length === 0) {
    throw new HttpsError('failed-precondition', 'keine items in prize pool');
  }

  return { levelKey: chosen.key, items: chosen.items, desiredLevel: (current?.index ?? chosen.index) };
}

async function runRaffleForDate() {
  const debug: string[] = [];
  const step = (s: string) => { debug.push(s); console.log('[runRaffle]', s); };

  try {
    step('start');
    // ALWAYS use the server-side Berlin calendar day. Ignore any client overrides.
    const serverNow = admin.firestore.Timestamp.now();
    const dateId = currentBerlinDateId(serverNow.toDate());
    console.log('[runRaffle] using serverBerlinDateId =', dateId);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateId)) {
      throw new HttpsError('invalid-argument', 'bad dateId', { dateId });
    }

    step('query entrants');
    const q = db.collectionGroup('countersByDay').where('day', '==', dateId);
    const snap = await q.get();
    step(`counters=${snap.size}`);

    type Entrant = { uid: string; w: number; ref: FirebaseFirestore.DocumentReference };
    const entrants: Entrant[] = [];
    let totalEligibleTickets = 0;
    let totalTicketsAll = 0;
    let excludedTooLow = 0;

    snap.forEach(d => {
      const docDay = String(d.get('day') ?? d.id);
      if (docDay !== dateId) return;

      const w = Math.max(0, Number(d.get('tickets') || 0));
      const uidRaw = d.ref.parent.parent?.id;
      const uid = uidRaw ? String(uidRaw) : null;

      if (uid && w > 0) {
        totalTicketsAll += w;
        if (w >= MIN_TICKETS_FOR_RAFFLE) {
          entrants.push({ uid, w, ref: d.ref });
          totalEligibleTickets += w;
        } else {
          excludedTooLow += 1;
        }
      }
    });

    if (entrants.length === 0) {
      step('fallback scan countersByDay');
      const scan = await db.collectionGroup('countersByDay').get();
      scan.forEach(d => {
        if (d.id !== dateId) return;
        const w = Math.max(0, Number(d.get('tickets') || 0));
        const uid = d.ref.parent.parent?.id;
        if (uid && w > 0) {
          totalTicketsAll += w;
          if (w >= MIN_TICKETS_FOR_RAFFLE) {
            entrants.push({ uid, w, ref: d.ref });
            totalEligibleTickets += w;
          } else {
            excludedTooLow += 1;
          }
        }
      });
      step(`fallback entrants=${entrants.length}`);
    }

    step(`eligibleEntrants=${entrants.length} excludedBelowMinimum=${excludedTooLow}`);
    if (entrants.length === 0) {
      throw new HttpsError('failed-precondition', `keine Teilnehmer (mindestens ${MIN_TICKETS_FOR_RAFFLE} Tickets erforderlich)`, { debug, excludedTooLow, minTickets: MIN_TICKETS_FOR_RAFFLE });
    }

    step('choose prize pool');
    const poolSel = await choosePrizePoolLevel(dateId, totalTicketsAll);
    const { levelKey, items, desiredLevel } = poolSel;
    step(`pool desired=${desiredLevel} chosen=${levelKey}`);

    const slots: string[] = [];
    for (const it of items) {
      for (let i = 0; i < it.totalRewards; i++) slots.push(it.name);
    }
    if (slots.length === 0) throw new HttpsError('failed-precondition', 'keine Preisslots', { debug });

    const k = Math.min(slots.length, entrants.length);
    const seed = `${dateId}:${totalEligibleTickets}`;
    const winnerUids = weightedSampleWithoutReplacement(entrants, k, seed, 'raffle');

    step('resolve names');
    const winnerRows: Record<string, { name: string; prize: string }> = {};
    for (let i = 0; i < winnerUids.length; i++) {
      const uid = winnerUids[i];
      const userSnap = await db.doc(`users/${uid}`).get();
      const name = (userSnap.exists && (userSnap.get('displayName') || userSnap.get('name'))) || uid;
      winnerRows[String(i)] = { name: String(name), prize: slots[i] };
    }

    step('write winners');
    const winnersRef = db.doc('config/winners');
    await winnersRef.set({ [dateId]: winnerRows }, { merge: true });

    step('no clear (tickets kept)');
    step('done');

    return { ok: true, dateId, levelKey, totalTickets: totalTicketsAll, eligibleTickets: totalEligibleTickets, desiredLevel, winners: winnerRows, debug };
  } catch (e: unknown) {
    console.error('[runRaffle] error', e);
    if (e instanceof HttpsError) {
      // attach debug to details safely
      const err: any = e;
      err.details = { ...(err.details || {}), debug };
      throw err;
    }
    const errMsg = (e && typeof (e as any).message === 'string') ? (e as any).message : 'INTERNAL';
    throw new HttpsError('internal', errMsg, { debug });
  }
}

export const runRaffleNow = onCall({ cors: true, region: 'us-central1' }, async (req) => {
  // Ignore any client-supplied date. Always use server-side Berlin calendar day.
  console.log('[runRaffleNow] called by=', req.auth?.uid || req.auth?.token?.email || 'unknown', ' - ignoring client date overrides');
  return runRaffleForDate();
});

export const runRaffleDaily = onSchedule({ schedule: '0 20 * * *', timeZone: 'Europe/Berlin' }, async () => {
  // Use server-side calendar day in Berlin for scheduled raffles as well.
  // This ensures scheduled and manual raffles both write under the same
  // calendar day (no cutoff semantics).
  try {
  const nowTs = admin.firestore.Timestamp.now();
  const today = currentBerlinDateId(nowTs.toDate());
  console.log('[runRaffleDaily] trigger (server calendar day)', today);
  const res = await runRaffleForDate();
  console.log('[runRaffleDaily] success', { winners: Object.keys(res.winners || {}).length });
  } catch (e: unknown) {
    console.error('[runRaffleDaily] failed', e);
    throw e;
  }
});

// On new user document: if the doc contains a referral code, award both sides 500 coins.
// NOTE: onUserCreatedGrantReferral removed. Use processReferralReward instead.
// Centralized referral processing: creation-only, idempotent, inviter resolution + audit log.
export const processReferralReward = onDocumentWritten({ document: 'users/{uid}', region: 'us-central1' }, async (event) => {
  try {
  const before = event.data?.before?.data?.() as FirebaseFirestore.DocumentData | undefined;
  const after = event.data?.after?.data?.() as FirebaseFirestore.DocumentData | undefined;
  const uid = String((event.params as { uid?: string })?.uid || '');

  // Handle documents where the referral field is present on create OR was newly added on update.
  if (!after) return;
  const hadReferral = !!(before && (before.referredBy || before.referred_by || before.referrer || before.referredCode || before.referralCode || before.referral_code));
  const hasReferral = !!(after.referredBy || after.referred_by || after.referrer || after.referredCode || after.referralCode || after.referral_code);
  // If there's no referral info now, nothing to do
  if (!hasReferral) return;
  // If referral was already present before, don't re-apply
  if (hadReferral) return;

    // Normalize referral code from several possible fields
    let referredBy: string | null = null;
    const cand = after.referredBy || after.referred_by || after.referrer || after.referredCode || after.referralCode || after.referral_code;
    if (cand && typeof cand === 'string') referredBy = String(cand).trim();
    if (!referredBy) return;
    if (referredBy.startsWith('ref_')) referredBy = referredBy.slice(4);
    
    // Extract code from URL if it contains query params (e.g., "Ds06kcQnhttp://localhost:3000/drop?ref=ref_Ds06kcQn")
    // Take only the first part before any special chars
    if (referredBy.includes('http')) {
      referredBy = referredBy.split(/[?#&/]/)[0];
    }
    referredBy = referredBy.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20); // sanitize to 20 chars alphanumeric

    const REWARD = 500;

    // Resolve inviter UID: prefer documentId prefix, fallback to referralCode field
    let inviterUid: string | null = null;
    try {
      const usersCol = db.collection('users');
      // documentId prefix match
      const start = referredBy;
      const end = referredBy + '\uf8ff';
      const q = await usersCol.where(admin.firestore.FieldPath.documentId(), '>=', start).where(admin.firestore.FieldPath.documentId(), '<=', end).limit(1).get();
      if (!q.empty) inviterUid = q.docs[0].id;
      if (!inviterUid) {
        const q2 = await usersCol.where('referralCode', '==', referredBy).limit(1).get();
        if (!q2.empty) inviterUid = q2.docs[0].id;
      }
      console.log('[processReferralReward] resolved inviter', { referredBy, inviterUid });
    } catch (e) {
      console.warn('[processReferralReward] inviter resolution failed', e);
    }

    // Apply rewards transactionally with an idempotency flag on the new user doc
    try {
      await db.runTransaction(async (tx) => {
        const newRef = db.doc(`users/${uid}`);
        const newSnap = await tx.get(newRef);
        if (!newSnap.exists) {
          console.warn('[processReferralReward] newSnap does not exist', { uid });
          return;
        }

        // If flag present, don't re-apply
        const alreadyGiven = !!newSnap.get('referralRewardGiven');
        if (alreadyGiven) {
          console.warn('[processReferralReward] already given', { uid });
          return;
        }

        // Give coins to the new user and mark as given
        tx.set(newRef, {
          coins: admin.firestore.FieldValue.increment(REWARD),
          referralRewardGiven: true,
          referralRewardGivenAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        if (inviterUid) {
          const inviterRef = db.doc(`users/${inviterUid}`);
          tx.set(inviterRef, { coins: admin.firestore.FieldValue.increment(REWARD), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

          // Audit log under inviter's subcollection
          const logRef = db.doc(`users/${inviterUid}/referralCredits/${uid}`);
          tx.set(logRef, { referredUid: uid, amount: REWARD, ts: admin.firestore.FieldValue.serverTimestamp() });
        } else {
          console.warn('[processReferralReward] inviterUid is null', { uid, referredBy });
        }
      });
    } catch (txErr) {
      console.error('[processReferralReward] transaction failed', { uid, referredBy, inviterUid, error: String(txErr) });
      throw txErr;
    }

    console.log('[processReferralReward] applied referral reward for', uid, 'inviter=', inviterUid || 'unknown');
  } catch (err) {
    console.error('[processReferralReward] error', err);
    throw err;
  }
});

export const onNewUserReferred = onDocumentWritten({ document: 'users/{uid}/referralCredits/{newUid}', region: 'us-central1' }, async (event) => {
  try {
    const before = event.data?.before?.data?.();
    const after = event.data?.after?.data?.();
    if (before || !after) return;
    
    const inviterUid = String((event.params as any)?.uid || '');
    const newUid = String((event.params as any)?.newUid || '');
    
    console.log('[onNewUserReferred] incrementing partners/' + inviterUid);
    
    await db.doc(`partners/${inviterUid}`).set({
      referralsCount: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log('[onNewUserReferred] ✓ done', { inviterUid });
  } catch (err) {
    console.error('[onNewUserReferred] error', err);
  }
});

// rotateMinigame & rotateMinigameNow from defaultlol/index.js
const EXT_OK = [".png", ".jpg", ".jpeg", ".webp"];

async function listGameFiles() {
  try {
    const snap = await db.collection("minigames").where("active", "==", true).get();
    const names = snap.docs
      .map((d) => d.data()?.previewImage)
      .filter((n) => typeof n === "string" && n.length > 0);
    return names;
  } catch (err) {
    throw err;
  }
}

async function pickRandomExcludingPrev(prevPath: string | null) {
  const files = await listGameFiles();
  const prevFile = prevPath ? prevPath.split("/").pop() : null;

  if (!files || files.length === 0) {
    return null;
  }

  if (files.length === 1) {
    return files[0];
  }

  const pool = files.filter((n) => n !== prevFile);
  if (pool.length === 0) return files[0];
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return chosen;
}

export const rotateMinigame = onSchedule(
  { schedule: "0 0,5,10,15,20 * * *", timeZone: "Europe/Berlin" },
  async () => {
    try {
      const docRef = db.collection("config").doc("currentMinigame");

      await db.runTransaction(async (tx) => {
        const curSnap = await tx.get(docRef);
        const prevPath = curSnap.exists ? curSnap.data()?.storagePath : null;

        const chosenFile = await pickRandomExcludingPrev(prevPath);
        if (!chosenFile) {
          return;
        }

        const storagePath = `/minigame-previews/${chosenFile}`;
        const nowMs = Date.now();
        const now = admin.firestore.Timestamp.fromMillis(nowMs);
        const nextAt = admin.firestore.Timestamp.fromMillis(nowMs + 5 * 60 * 60 * 1000);

        tx.set(
          docRef,
          {
            id: chosenFile,
            storagePath,
            updatedAt: now,
            nextAt,
          },
          { merge: true }
        );
      });
    } catch (err) {
      throw err;
    }
  }
);

export const rotateMinigameNow = onCall(async (request: any) => {
  try {
    const docRef = db.collection("config").doc("currentMinigame");
    const data = request.data;
    const context = request;

    const forcePath = data && typeof data.force === "string" ? data.force : null;
    const isAdmin = !!(context && context.auth && (context.auth as any).token && (context.auth as any).token.admin === true);

    if (forcePath && !isAdmin) {
      return { ok: false, error: "unauthorized: admin claim required to force rotation" };
    }

    const result = await db.runTransaction(async (tx) => {
      const curSnap = await tx.get(docRef);
      const prevPath = curSnap.exists ? curSnap.data()?.storagePath : null;

      let chosenFile;
      if (forcePath) {
        const files = await listGameFiles();
        if (!files.includes(forcePath)) {
          throw new Error("force-path-not-found");
        }
        chosenFile = forcePath;
      } else {
        chosenFile = await pickRandomExcludingPrev(prevPath);
      }

      if (!chosenFile) {
        return { ok: false, error: "no-minigame-available" };
      }

      const storagePath = `/minigame-previews/${chosenFile}`;
      const nowMs = Date.now();
      const now = admin.firestore.Timestamp.fromMillis(nowMs);
      const nextAt = admin.firestore.Timestamp.fromMillis(nowMs + 5 * 60 * 60 * 1000);

      tx.set(
        docRef,
        {
          id: chosenFile,
          storagePath,
          updatedAt: now,
          nextAt,
        },
        { merge: true }
      );

      return { ok: true, storagePath };
    });

    return result;
  } catch (err) {
    const msg = err && (err as Error).message ? (err as Error).message : String(err);
    return { ok: false, error: msg };
  }
});
