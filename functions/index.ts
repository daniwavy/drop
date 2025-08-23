import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const ACTIVE_SEASON = "S1";

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

export const dailySnapshot = onSchedule("0 0 * * *", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const seasonCol = db.collection(`leaderboards/season_${ACTIVE_SEASON}/users`);
  const snapCol = db.collection(`leaderboards/daily_${today}/users`);
  const top = await seasonCol.orderBy("score", "desc").limit(100).get();
  const batch = db.batch();
  top.forEach((d) => batch.set(snapCol.doc(d.id), { score: d.get("score") || 0 }));
  await batch.commit();
});