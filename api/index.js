const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();

const REWARDS = [5, 5, 5, 10, 5, 5, 20];
const TZ = "Europe/Berlin";

const ymdInTZ = (date) => {
  const d = new Date(date.toLocaleString("en-GB", { timeZone: TZ }));
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};
const sameYMD = (d1, d2) => ymdInTZ(d1) === ymdInTZ(d2);
const daysBetween = (d1, d2) => {
  const a = new Date(d1.toLocaleString("en-GB", { timeZone: TZ }));
  const b = new Date(d2.toLocaleString("en-GB", { timeZone: TZ }));
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
};

exports.claimDaily = onCall(async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new Error("unauthenticated");
  const db = admin.firestore();
  const uref = db.collection("users").doc(uid);

  return db.runTransaction(async (tx) => {
    const now = admin.firestore.Timestamp.now().toDate();
    const snap = await tx.get(uref);
    const cur = snap.exists ? snap.data() : {};

    const last = cur.lastClaim?.toDate?.() || null;
    const todayYmd = ymdInTZ(now);
    const lastYmd = typeof cur.lastClaimYmd === "number" ? cur.lastClaimYmd : last ? ymdInTZ(last) : null;
    if (lastYmd === todayYmd) return { ok: false, code: "already-claimed" };

    let streak = Number(cur.streak || 0);
    streak = !last ? 1 : daysBetween(last, now) === 1 ? streak + 1 : 1;
    const reward = REWARDS[(streak - 1) % 7];

    tx.set(
      uref,
      {
        coins: admin.firestore.FieldValue.increment(reward),
        streak,
        lastClaim: admin.firestore.Timestamp.now(),
        lastClaimYmd: todayYmd,
      },
      { merge: true }
    );

    tx.create(db.collection("events").doc(), {
      type: "daily-claim",
      uid,
      streak,
      reward,
      ymd: todayYmd,
      ts: admin.firestore.Timestamp.now(),
    });

    return { ok: true, streak, reward };
  });
});