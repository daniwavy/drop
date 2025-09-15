"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onShardChangeAggregateDaily = exports.onDailyTicketsChange = exports.grantTickets = exports.claimDaily = exports.dailySnapshot = exports.grantDiamonds = exports.grantCoins = exports.getStats = exports.awardTrophy = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const ACTIVE_SEASON = "S1";
const SHARDS = 32;
function hashUidToShard(uid, mod = SHARDS) {
    let h = 5381;
    for (let i = 0; i < uid.length; i++)
        h = ((h << 5) + h) ^ uid.charCodeAt(i);
    h = h | 0;
    const idx = Math.abs(h) % mod;
    return idx;
}
exports.awardTrophy = (0, https_1.onCall)({ cors: true }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new Error("unauthenticated");
    const code = String(req.data?.code || "");
    if (!code)
        throw new Error("invalid-argument");
    const tro = await db.doc(`trophies/${code}`).get();
    if (!tro.exists)
        throw new Error("not-found");
    const points = tro.get("points") || 0;
    const utId = `${uid}_${code}`;
    const utRef = db.doc(`userTrophies/${utId}`);
    const usRef = db.doc(`userStats/${uid}`);
    const lbRef = db.doc(`leaderboards/season_${ACTIVE_SEASON}/users/${uid}`);
    await db.runTransaction(async (tx) => {
        const ut = await tx.get(utRef);
        if (ut.exists)
            return;
        tx.set(utRef, { uid, code, earnedAt: FieldValue.serverTimestamp() });
        tx.set(usRef, {
            totalTrophies: FieldValue.increment(1),
            xp: FieldValue.increment(points),
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        tx.set(lbRef, { score: FieldValue.increment(points) }, { merge: true });
    });
    return { ok: true };
});
exports.getStats = (0, https_1.onCall)({ cors: true }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new Error("unauthenticated");
    const doc = await db.doc(`userStats/${uid}`).get();
    return { totalTrophies: doc.get("totalTrophies") || 0, xp: doc.get("xp") || 0 };
});
// Coins/Diamanten gutschreiben (Alias, v2)
exports.grantCoins = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'login required');
    const amountRaw = req.data?.amount;
    if (typeof amountRaw !== 'number' || !Number.isFinite(amountRaw)) {
        throw new https_1.HttpsError('invalid-argument', 'amount must be number');
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
exports.grantDiamonds = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'login required');
    const amountRaw = req.data?.amount;
    if (typeof amountRaw !== 'number' || !Number.isFinite(amountRaw)) {
        throw new https_1.HttpsError('invalid-argument', 'amount must be number');
    }
    // clamp 1–3
    const amount = Math.max(1, Math.min(3, Math.floor(amountRaw)));
    const userRef = db.doc(`users/${uid}`);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        const prev = (snap.exists && typeof snap.get('coins') === 'number') ? snap.get('coins') : 0;
        tx.set(userRef, { coins: prev + amount }, { merge: true });
    });
    return { ok: true, added: amount };
});
exports.dailySnapshot = (0, scheduler_1.onSchedule)("0 0 * * *", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const seasonCol = db.collection(`leaderboards/season_${ACTIVE_SEASON}/users`);
    const snapCol = db.collection(`leaderboards/daily_${today}/users`);
    const top = await seasonCol.orderBy("score", "desc").limit(100).get();
    const batch = db.batch();
    top.forEach((d) => batch.set(snapCol.doc(d.id), { score: d.get("score") || 0 }));
    await batch.commit();
});
// Secure daily claim (atomic, idempotent per day)
exports.claimDaily = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'login required');
    const now = admin.firestore.Timestamp.now();
    const userRef = db.doc(`users/${uid}`);
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const todayId = fmt.format(now.toDate()); // YYYY-MM-DD
    const dayRef = userRef.collection('claims').doc(todayId);
    return db.runTransaction(async (tx) => {
        const [userSnap, daySnap] = await Promise.all([tx.get(userRef), tx.get(dayRef)]);
        if (daySnap.exists)
            throw new https_1.HttpsError('failed-precondition', 'already-claimed');
        const data = userSnap.exists ? userSnap.data() : {};
        const last = data.lastClaim instanceof admin.firestore.Timestamp ? data.lastClaim : null;
        const sameDay = (a, b) => !!a && fmt.format(a.toDate()) === fmt.format(b.toDate());
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
const firestore_1 = require("firebase-functions/v2/firestore");
// Lose gutschreiben (callable, v2)
exports.grantTickets = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (req) => {
    try {
        const uid = req.auth?.uid;
        if (!uid)
            throw new https_1.HttpsError('unauthenticated', 'login required');
        const amountRaw = req.data?.amount;
        const amount = Math.max(0, Math.floor(Number(amountRaw ?? 0)));
        if (!amount)
            return { ok: true, added: 0 };
        const grantId = String(req.data?.grantId || '');
        // Berlin day id
        const todayId = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());
        const counterRef = db.doc(`users/${uid}/countersByDay/${todayId}`);
        await db.runTransaction(async (tx) => {
            // READS FIRST
            let gRef = null;
            let gSnap = null;
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
            }
            else {
                tx.set(counterRef, { tickets: amount, day: todayId });
            }
            // shard write for aggregate scaling
            const shard = hashUidToShard(uid, SHARDS);
            const shardRef = db.doc(`metrics_daily_shards/${todayId}/shards/${shard}`);
            tx.set(shardRef, { tickets: admin.firestore.FieldValue.increment(amount) }, { merge: true });
        });
        return { ok: true, added: amount, day: todayId };
    }
    catch (err) {
        console.error('grantTickets error', err);
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err?.message || 'unknown error');
    }
});
// Tagesgesamt aggregieren (Trigger, v2)
exports.onDailyTicketsChange = (0, firestore_1.onDocumentWritten)({ document: 'users/{uid}/countersByDay/{dayId}', region: 'us-central1' }, async (event) => {
    const after = event.data?.after.data();
    const before = event.data?.before.data();
    const a = typeof after?.tickets === 'number' ? after.tickets : 0;
    const b = typeof before?.tickets === 'number' ? before.tickets : 0;
    const diff = Math.max(0, a - b);
    if (!diff)
        return;
    const dayId = String(event.params?.dayId || '');
    try {
        await db.doc(`metrics_daily/${dayId || 'unknown'}`).set({ ticketsTodayTotal: FieldValue.increment(diff), date: dayId }, { merge: true });
    }
    catch (e) {
        console.error('onDailyTicketsChange aggregate write failed', { dayId, diff, error: e });
        throw e;
    }
});
// Aggregate shard updates into metrics_daily/{day}
exports.onShardChangeAggregateDaily = (0, firestore_1.onDocumentWritten)({ document: 'metrics_daily_shards/{day}/shards/{shard}', region: 'us-central1' }, async (event) => {
    const day = String(event.params?.day || '');
    if (!day)
        return;
    const col = db.collection(`metrics_daily_shards/${day}/shards`);
    const snap = await col.get();
    let total = 0;
    snap.forEach((d) => {
        const t = d.get('tickets');
        if (typeof t === 'number')
            total += t;
    });
    const poolLevel = Math.floor(total / 100);
    await db.doc(`metrics_daily/${day}`).set({ date: day, ticketsTodayTotal: total, poolLevel }, { merge: true });
});
