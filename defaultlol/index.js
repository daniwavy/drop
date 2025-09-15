// defaultlol/index.js
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

const PREFIX = "games/";                     // Ordner mit deinen Minigame-Bildern
const EXT_OK = [".png", ".jpg", ".jpeg", ".webp"]; // erlaubte Dateiendungen

function hasOkExt(name) {
  return EXT_OK.some((e) => name.toLowerCase().endsWith(e));
}

async function listGameFiles() {
  const [files] = await bucket.getFiles({ prefix: PREFIX });
  // nur echte Dateien im games/-Ordner, keine "Ordner"
  return files
    .map((f) => f.name)
    .filter((n) => n.startsWith(PREFIX) && !n.endsWith("/") && hasOkExt(n));
}

async function pickRandomExcludingPrev(prevPath) {
  const files = await listGameFiles();
  if (files.length === 0) throw new Error("no-files-in-games");
  if (files.length === 1) return files[0];

  // nicht direkt wiederholen
  const pool = files.filter((n) => n !== prevPath);
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return chosen;
}

async function writeCurrent(storagePath) {
  const nowMs = Date.now();
  const now = admin.firestore.Timestamp.fromMillis(nowMs);
  const nextAt = admin.firestore.Timestamp.fromMillis(nowMs + 3 * 60 * 60 * 1000);

  await db.collection("config").doc("currentMinigame").set(
    {
      id: storagePath,           // id = Dateiname; brauchst du nur, wenn du sie anzeigen willst
      storagePath,               // wichtig fürs Frontend
      updatedAt: now,
      nextAt,
    },
    { merge: true }
  );
}

exports.rotateMinigame = onSchedule(
  { schedule: "0 */3 * * *", timeZone: "Europe/Berlin" }, // volle Stunde, alle 3h, DE-Zeit
  async () => {
    const curSnap = await db.collection("config").doc("currentMinigame").get();
    const prevPath = curSnap.exists ? curSnap.data()?.storagePath : null;
    const nextPath = await pickRandomExcludingPrev(prevPath);
    await writeCurrent(nextPath);
    console.log("Rotated to:", nextPath);
  }
);

// manueller Test: sofort rotieren
exports.rotateMinigameNow = onCall(async () => {
  const curSnap = await db.collection("config").doc("currentMinigame").get();
  const prevPath = curSnap.exists ? curSnap.data()?.storagePath : null;
  const nextPath = await pickRandomExcludingPrev(prevPath);
  await writeCurrent(nextPath);
  return { ok: true, storagePath: nextPath };
});