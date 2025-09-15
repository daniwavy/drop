const functions = require("firebase-functions");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const berlinYMD = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

// Lose gutschreiben (berücksichtigt aktives double_tickets Effekt)
exports.grantTickets = functions.https.onCall(async (data, ctx) => {
  if (!ctx?.auth?.uid)
    throw new functions.https.HttpsError("unauthenticated", "login");
  const uid = ctx.auth.uid;
  const amount = Math.max(0, Math.floor(Number(data?.amount || 0)));
  if (!amount) return { ok: true, added: 0 };

  const grantId = String(data?.grantId || "");
  const day = berlinYMD();
  const counterRef = db.doc(`users/${uid}/counters/daily`);
  const userRef = db.doc(`users/${uid}`);

  await db.runTransaction(async (tx) => {
    // Load user to evaluate effects
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new functions.https.HttpsError('failed-precondition', 'user missing');
    const user = userSnap.data() || {};
    const eff = (user.effects && user.effects.double_tickets) || null;
    const now = Date.now();
    const untilMs = eff?.until?.toMillis ? eff.until.toMillis() : (eff?.until || 0);
    const isActive = !!eff?.active && (!untilMs || untilMs > now);

    const baseAmount = amount;
    const multiplier = isActive ? 2 : 1;
    const finalAmount = baseAmount * multiplier;

    // --- Enforce per-day cap: 3 normal, 6 with active 2x ---
    const cap = isActive ? 6 : 3;
    const snap = await tx.get(counterRef);
    const prev = snap.exists ? (snap.data() || {}) : {};
    const prevDay = prev.day || null;
    const prevTickets = prevDay === day ? Math.max(0, Number(prev.tickets || 0)) : 0;
    const remaining = Math.max(0, cap - prevTickets);
    const appliedAmount = Math.max(0, Math.min(finalAmount, remaining));

    if (grantId) {
      const gRef = db.doc(`users/${uid}/ticketGrants/${grantId}`);
      if ((await tx.get(gRef)).exists) return; // idempotent
      tx.set(gRef, {
        baseAmount,
        multiplier,
        finalAmount,      // theoretical amount based on effect
        appliedAmount,     // actually credited after cap
        cap,
        day,
        ts: admin.firestore.FieldValue.serverTimestamp(),
        source: data?.source || 'minigame',
      });
    }

    if (!appliedAmount) {
      // Nothing to add due to cap
      if (!snap.exists || prevDay !== day) {
        // start the day record if missing or old day
        tx.set(counterRef, { tickets: prevTickets, day });
      }
      return;
    }

    if (!snap.exists || prevDay !== day) {
      // new day or missing doc → set absolute value
      tx.set(counterRef, { tickets: appliedAmount, day });
    } else {
      // same day → increment
      tx.update(counterRef, {
        tickets: admin.firestore.FieldValue.increment(appliedAmount),
        day,
      });
    }
  });

  return { ok: true, base: amount, day, note: 'capped server-side (3/6 with 2x) if applicable' };
});

// Tagesgesamt aggregieren
exports.onDailyTicketsChange = functions.firestore
  .document("users/{uid}/counters/daily")
  .onWrite(async (change) => {
    const a = change.after.exists ? change.after.data() : {};
    const b = change.before.exists ? change.before.data() : {};
    const diff = Math.max(0, (a?.tickets || 0) - (b?.tickets || 0));
    if (!diff) return;

    const day = berlinYMD();
    await db.doc(`metrics_daily/${day}`).set(
      {
        ticketsTodayTotal: admin.firestore.FieldValue.increment(diff),
        date: day,
      },
      { merge: true }
    );
  });

  

  