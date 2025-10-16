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
  // Neue Implementierung: lese die Datei-Namen aus Firestore collection `minigames`
  // und verwende das Feld `previewImage` (z. B. "tap-rush.png"). Dadurch nutzen
  // wir lokale Dateien aus `public/minigame-previews/` anstatt Storage-Bucket.
  try {
    const snap = await db.collection("minigames").where("active", "==", true).get();
    const names = snap.docs
      .map((d) => d.data()?.previewImage)
      .filter((n) => typeof n === "string" && n.length > 0);
    console.info("listGameFiles: minigames found=", names.length);
    return names;
  } catch (err) {
    console.error("listGameFiles: error reading minigames from firestore:", err && err.stack ? err.stack : err);
    throw err;
  }
}

async function pickRandomExcludingPrev(prevPath) {
  const files = await listGameFiles();
  // prevPath kann ein voller Pfad (z. B. "/minigame-previews/tap-rush.png") oder nur ein Dateiname sein.
  const prevFile = prevPath ? prevPath.split("/").pop() : null;

  if (!files || files.length === 0) {
    console.warn("pickRandomExcludingPrev: no active minigames found - prevFile=", prevFile);
    // Rückgabe null signalisiert: keine Änderung
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

async function writeCurrent(storagePath) {
  const nowMs = Date.now();
  const now = admin.firestore.Timestamp.fromMillis(nowMs);
  const nextAt = admin.firestore.Timestamp.fromMillis(nowMs + 5 * 60 * 60 * 1000);

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
  { schedule: "0 0,5,10,15,20 * * *", timeZone: "Europe/Berlin" }, // 00,05,10,15,20 Uhr DE-Zeit
  async () => {
    try {
      const docRef = db.collection("config").doc("currentMinigame");

      // Transaction ensures we read the latest currentMinigame and write atomically.
      await db.runTransaction(async (tx) => {
        const curSnap = await tx.get(docRef);
        const prevPath = curSnap.exists ? curSnap.data()?.storagePath : null;

        // pickRandomExcludingPrev may list storage files; keep it inside transaction function
        // to ensure consistent behavior if transaction is retried.

        const chosenFile = await pickRandomExcludingPrev(prevPath);
        if (!chosenFile) {
          console.log("rotateMinigame: no valid minigame chosen, skipping update");
          return;
        }

        // build local public path
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

        // Log chosen storagePath (use safe template to avoid logger evaluating undefined vars)
        try {
          console.log(`rotateMinigame: will rotate from ${String(prevPath)} to ${String(storagePath)}`);
        } catch (logErr) {
          console.log('rotateMinigame: rotated (log failure) ' + String(logErr));
        }
      });
      console.log("rotateMinigame: rotation complete");
    } catch (err) {
      // Log full error for debugging/monitoring and rethrow so scheduler can report failure
      console.error("rotateMinigame: error during rotation:", err && err.stack ? err.stack : err);
      throw err;
    }
  }
);

// manueller Test: sofort rotieren
// callable function for manual testing. Supports optional { force: "storagePath" } but only
// if the caller is authorized (has custom claim `admin: true`). Returns structured error info.
exports.rotateMinigameNow = onCall(async (data, context) => {
  try {
    const docRef = db.collection("config").doc("currentMinigame");

    // If caller provided a force path, require an admin claim.
    const forcePath = data && typeof data.force === "string" ? data.force : null;
    const isAdmin = !!(context && context.auth && context.auth.token && context.auth.token.admin === true);

    if (forcePath && !isAdmin) {
      return { ok: false, error: "unauthorized: admin claim required to force rotation" };
    }

    // do transaction-like logic so we write consistent timestamps
    const result = await db.runTransaction(async (tx) => {
      const curSnap = await tx.get(docRef);
      const prevPath = curSnap.exists ? curSnap.data()?.storagePath : null;

      let chosenFile;
      if (forcePath) {
        // validate that the forced filename exists in minigames list
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
    console.error("rotateMinigameNow: error:", err && err.stack ? err.stack : err);
    const msg = err && err.message ? err.message : String(err);
    return { ok: false, error: msg };
  }
});