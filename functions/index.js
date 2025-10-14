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
exports.runRaffleDaily = exports.runRaffleNow = exports.onShardChangeAggregateDaily = exports.onDailyTicketsChange = exports.activateDoubleTickets = exports.grantTickets = exports.claimDaily = exports.dailySnapshot = exports.grantDiamonds = exports.grantCoins = exports.getStats = exports.awardTrophy = exports.enterDropCors = exports.enterDrop = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const ACTIVE_SEASON = "S1";
const MIN_TICKETS_FOR_RAFFLE = 50;
// Re-export functions implemented in src/index.ts so the deploy packager picks them up.
const index_1 = require("./src/index");
Object.defineProperty(exports, "enterDrop", { enumerable: true, get: function () { return index_1.enterDrop; } });
Object.defineProperty(exports, "enterDropCors", { enumerable: true, get: function () { return index_1.enterDropCors; } });
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
    // (note: src functions are re-exported at the top of this file)
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
    const requested = Math.max(1, Math.min(3, Math.floor(amountRaw))); // 1–3 pro Request
    const source = String(req.data?.source || 'tap-rush');
    const opId = req.data?.opId ? String(req.data.opId) : null; // optional Idempotenz-ID
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
                const prev = opSnap.data();
                return { ok: true, added: prev?.added || 0, capped: !!prev?.capped, day: todayId, idempotent: true };
            }
        }
        const [userSnap, daySnap] = await Promise.all([tx.get(userRef), tx.get(dayRef)]);
        const todaySoFar = daySnap.exists && typeof daySnap.get('diamonds') === 'number' ? daySnap.get('diamonds') : 0;
        const room = Math.max(0, DAY_CAP - todaySoFar);
        const added = Math.max(0, Math.min(requested, room));
        if (added <= 0) {
            if (opRef)
                tx.set(opRef, { uid, requested, added: 0, capped: true, day: todayId, source, ts: admin.firestore.FieldValue.serverTimestamp() });
            if (!daySnap.exists)
                tx.set(dayRef, { day: todayId, diamonds: 0 });
            return { ok: true, added: 0, capped: true, day: todayId };
        }
        // coins inkrementieren
        tx.set(userRef, { coins: admin.firestore.FieldValue.increment(added), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        // Tageszähler inkrementieren
        if (daySnap.exists) {
            tx.update(dayRef, { diamonds: admin.firestore.FieldValue.increment(added), day: todayId });
        }
        else {
            tx.set(dayRef, { diamonds: added, day: todayId });
        }
        // Operation protokollieren
        if (opRef)
            tx.set(opRef, { uid, requested, added, capped: added < requested, day: todayId, source, ts: admin.firestore.FieldValue.serverTimestamp() });
        return { ok: true, added, capped: added < requested, day: todayId };
    });
    return res;
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
const firestore_1 = require("firebase-functions/v2/firestore");
// Lose gutschreiben (callable, v2)
exports.grantTickets = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (req) => {
    try {
        const uid = req.auth?.uid;
        if (!uid)
            throw new https_1.HttpsError('unauthenticated', 'login required');
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
                    const eff0 = (u0.get('effects') || {});
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
            }
            catch { }
            const mult0 = tix2xZero ? 2 : 1;
            return { ok: true, added: 0, multiplier: mult0, capped: false, day: todayId, skipped: false, tix2x: tix2xZero };
        }
        const grantId = String(req.data?.grantId || '');
        const MAX_TICKETS_PER_DAY = null; // null = unlimited per day
        const userRef = db.doc(`users/${uid}`);
        const counterRef = db.doc(`users/${uid}/countersByDay/${todayId}`);
        const rtRef = db.doc(`users/${uid}/rt/lastTicketGrant`);
        const res = await db.runTransaction(async (tx) => {
            // IDEMPOTENCY: try to create op doc first, so concurrent transactions collide
            let gRef = null;
            if (grantId) {
                gRef = db.doc(`users/${uid}/ticketGrants/${grantId}`);
                const opExists = await tx.get(gRef);
                if (opExists.exists) {
                    const prev = opExists.data() || {};
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
                const dt = eff?.double_tickets || null;
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
                    return { applied: 0, multiplier: multSkip, capped: false, day: todayId, skipped: true, current: curr, room: roomRemain, effective: 0, base: amount, tix2x };
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
            }
            else {
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
        const roomReturn = res.room;
        return {
            ok: true,
            added: res.applied,
            multiplier: res.multiplier,
            capped: res.capped,
            day: res.day,
            skipped: res.skipped === true,
            current: res.current,
            room: roomReturn == null || roomReturn === undefined ? null : roomReturn,
            effective: res.effective,
            baseAmount: res.base,
            tix2x: res.tix2x,
        };
    }
    catch (err) {
        console.error('grantTickets error', err);
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err?.message || 'unknown error');
    }
});
// Activate double-tickets effect for N minutes (default 10)
exports.activateDoubleTickets = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'login required');
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
    }
    catch (err) {
        console.warn('[metrics_daily] pool level fallback', err);
    }
    await db.doc(`metrics_daily/${day}`).set({ date: day, ticketsTodayTotal: total, poolLevel }, { merge: true });
});
const berlinPartsFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
});
function berlinParts(d = new Date()) {
    const parts = berlinPartsFormatter.formatToParts(d);
    const map = {};
    for (const p of parts) {
        if (p.type !== 'literal')
            map[p.type] = p.value;
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
function formatBerlinDay(day) {
    return `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
}
function shiftBerlinDay(day, delta) {
    const base = new Date(Date.UTC(day.year, day.month - 1, day.day));
    base.setUTCDate(base.getUTCDate() + delta);
    return { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1, day: base.getUTCDate() };
}
function raffleCollectionDateId(d = new Date()) {
    const parts = berlinParts(d);
    const minutes = parts.hour * 60 + parts.minute + parts.second / 60;
    const cutoffMinutes = 20 * 60; // 20:00 Berlin time
    let target = { year: parts.year, month: parts.month, day: parts.day };
    if (minutes >= cutoffMinutes) {
        target = shiftBerlinDay(target, 1);
    }
    return formatBerlinDay(target);
}
function raffleDrawDateId(d = new Date()) {
    const parts = berlinParts(d);
    const minutes = parts.hour * 60 + parts.minute + parts.second / 60;
    const cutoffMinutes = 20 * 60;
    let target = { year: parts.year, month: parts.month, day: parts.day };
    if (minutes < cutoffMinutes) {
        target = shiftBerlinDay(target, -1);
    }
    return formatBerlinDay(target);
}
function detRand(uid, salt, seed) {
    const crypto = require('crypto');
    const hex = crypto.createHmac('sha256', seed).update(`${uid}|${salt}`).digest('hex').slice(0, 13);
    const int = parseInt(hex, 16);
    return int / Math.pow(2, 52); // [0,1)
}
function weightedSampleWithoutReplacement(entrants, k, seed, salt) {
    const scored = entrants.map(e => {
        const u = Math.max(Number.EPSILON, detRand(e.uid, salt, seed));
        const key = Math.pow(u, 1 / Math.max(1, e.w));
        return { uid: e.uid, key };
    });
    scored.sort((a, b) => b.key - a.key);
    return scored.slice(0, k).map(s => s.uid);
}
const PRIZE_POOL_CACHE_MS = 60 * 1000;
let prizePoolCache = null;
async function fetchPrizePoolsMap() {
    let pools = {};
    try {
        const curSnap = await db.doc('config/currentMinigame').get();
        if (curSnap.exists) {
            const curPools = curSnap.get('prizePools');
            if (curPools && typeof curPools === 'object')
                pools = curPools;
        }
    }
    catch (err) {
        console.warn('[prizePools] currentMinigame fetch failed', err);
    }
    if (!pools || Object.keys(pools).length === 0) {
        try {
            const poolsSnap = await db.doc('config/prizePools').get();
            if (poolsSnap.exists)
                pools = poolsSnap.data() || {};
        }
        catch (err) {
            console.warn('[prizePools] fallback fetch failed', err);
        }
    }
    return pools || {};
}
function parsePrizePoolLevels(pools) {
    const entries = Object.entries(pools || {})
        .filter(([k, v]) => /^level-\d{2}$/i.test(k) && v && typeof v === 'object');
    const parsed = entries.map(([levelKey, levelObj], idx) => {
        const numericIndex = Number.parseInt(levelKey.slice(6), 10);
        const levelIndex = Number.isFinite(numericIndex) ? numericIndex : idx;
        const lvlAny = levelObj;
        const rawTicketsNeeded = lvlAny?.['tickets-needed'];
        const parsedTicketsNeeded = Number(rawTicketsNeeded);
        const ticketsNeeded = Number.isFinite(parsedTicketsNeeded)
            ? parsedTicketsNeeded
            : levelIndex * 100;
        const items = [];
        const pushItem = (it) => {
            if (!it || typeof it !== 'object')
                return;
            const name = String(it.name ?? it.prize ?? it.title ?? '').trim();
            const qty = Number(it.totalRewards ?? it.count ?? it.qty ?? it.quantity ?? it.amount ?? it.total ?? 0);
            if (name.length > 0 && Number.isFinite(qty) && qty > 0) {
                items.push({ name, totalRewards: qty });
            }
        };
        const itemEntries = Object.entries(lvlAny)
            .filter(([k, v]) => /^item-\d{2}$/i.test(k) && v && typeof v === 'object')
            .sort((a, b) => Number.parseInt(a[0].slice(5), 10) - Number.parseInt(b[0].slice(5), 10));
        for (const [, it] of itemEntries)
            pushItem(it);
        if (Array.isArray(lvlAny.items))
            lvlAny.items.forEach(pushItem);
        if (Array.isArray(lvlAny.prizes))
            lvlAny.prizes.forEach(pushItem);
        return {
            key: levelKey,
            index: levelIndex,
            ticketsNeeded: Math.max(0, ticketsNeeded),
            items,
        };
    });
    parsed.sort((a, b) => {
        if (a.ticketsNeeded === b.ticketsNeeded)
            return a.index - b.index;
        return a.ticketsNeeded - b.ticketsNeeded;
    });
    return parsed;
}
async function getPrizePoolConfig() {
    const now = Date.now();
    if (prizePoolCache && now - prizePoolCache.ts < PRIZE_POOL_CACHE_MS) {
        return prizePoolCache.data;
    }
    const pools = await fetchPrizePoolsMap();
    const levels = parsePrizePoolLevels(pools);
    const data = { levels };
    prizePoolCache = { ts: now, data };
    return data;
}
function buildProgressLevels(levels) {
    const sorted = [...levels].sort((a, b) => a.index - b.index);
    let cumulative = 0;
    const out = [];
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
function resolveProgressLevel(levels, totalTickets) {
    if (levels.length === 0) {
        throw new https_1.HttpsError('failed-precondition', 'prize pools not configured');
    }
    let current = levels[0];
    let next = levels.length > 1 ? levels[1] : null;
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
async function choosePrizePoolLevel(_dayId, totalTickets) {
    const { levels } = await getPrizePoolConfig();
    if (!levels || levels.length === 0) {
        throw new https_1.HttpsError('failed-precondition', 'prizePools leer');
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
        throw new https_1.HttpsError('failed-precondition', 'keine items in prize pool');
    }
    return { levelKey: chosen.key, items: chosen.items, desiredLevel: (current?.index ?? chosen.index) };
}
async function runRaffleForDate(dateIdInput) {
    const debug = [];
    const step = (s) => { debug.push(s); console.log('[runRaffle]', s); };
    try {
        step('start');
        const dateId = dateIdInput ? String(dateIdInput) : raffleDrawDateId();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateId)) {
            throw new https_1.HttpsError('invalid-argument', 'bad dateId', { dateId });
        }
        step('query entrants');
        const q = db.collectionGroup('countersByDay').where('day', '==', dateId);
        const snap = await q.get();
        step(`counters=${snap.size}`);
        const entrants = [];
        let totalEligibleTickets = 0;
        let totalTicketsAll = 0;
        let excludedTooLow = 0;
        snap.forEach(d => {
            const docDay = String(d.get('day') ?? d.id);
            if (docDay !== dateId)
                return;
            const w = Math.max(0, Number(d.get('tickets') || 0));
            const uidRaw = d.ref.parent.parent?.id;
            const uid = uidRaw ? String(uidRaw) : null;
            if (uid && w > 0) {
                totalTicketsAll += w;
                if (w >= MIN_TICKETS_FOR_RAFFLE) {
                    entrants.push({ uid, w, ref: d.ref });
                    totalEligibleTickets += w;
                }
                else {
                    excludedTooLow += 1;
                }
            }
        });
        if (entrants.length === 0) {
            step('fallback scan countersByDay');
            const scan = await db.collectionGroup('countersByDay').get();
            scan.forEach(d => {
                if (d.id !== dateId)
                    return;
                const w = Math.max(0, Number(d.get('tickets') || 0));
                const uid = d.ref.parent.parent?.id;
                if (uid && w > 0) {
                    totalTicketsAll += w;
                    if (w >= MIN_TICKETS_FOR_RAFFLE) {
                        entrants.push({ uid, w, ref: d.ref });
                        totalEligibleTickets += w;
                    }
                    else {
                        excludedTooLow += 1;
                    }
                }
            });
            step(`fallback entrants=${entrants.length}`);
        }
        step(`eligibleEntrants=${entrants.length} excludedBelowMinimum=${excludedTooLow}`);
        if (entrants.length === 0) {
            throw new https_1.HttpsError('failed-precondition', `keine Teilnehmer (mindestens ${MIN_TICKETS_FOR_RAFFLE} Tickets erforderlich)`, { debug, excludedTooLow, minTickets: MIN_TICKETS_FOR_RAFFLE });
        }
        step('choose prize pool');
        const poolSel = await choosePrizePoolLevel(dateId, totalTicketsAll);
        const { levelKey, items, desiredLevel } = poolSel;
        step(`pool desired=${desiredLevel} chosen=${levelKey}`);
        const slots = [];
        for (const it of items) {
            for (let i = 0; i < it.totalRewards; i++)
                slots.push(it.name);
        }
        if (slots.length === 0)
            throw new https_1.HttpsError('failed-precondition', 'keine Preisslots', { debug });
        const k = Math.min(slots.length, entrants.length);
        const seed = `${dateId}:${totalEligibleTickets}`;
        const winnerUids = weightedSampleWithoutReplacement(entrants, k, seed, 'raffle');
        step('resolve names');
        const winnerRows = {};
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
    }
    catch (e) {
        console.error('[runRaffle] error', e);
        if (e instanceof https_1.HttpsError) {
            e.details = { ...(e.details || {}), debug };
            throw e;
        }
        throw new https_1.HttpsError('internal', e?.message || 'INTERNAL', { code: e?.code, stack: e?.stack, debug });
    }
}
exports.runRaffleNow = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (req) => {
    const override = req.data?.dateId ? String(req.data.dateId) : undefined;
    return runRaffleForDate(override);
});
exports.runRaffleDaily = (0, scheduler_1.onSchedule)({ schedule: '0 20 * * *', timeZone: 'Europe/Berlin' }, async () => {
    const today = raffleDrawDateId();
    console.log('[runRaffleDaily] trigger', today);
    try {
        const res = await runRaffleForDate(today);
        console.log('[runRaffleDaily] success', { dateId: res.dateId, winners: Object.keys(res.winners || {}).length });
    }
    catch (e) {
        console.error('[runRaffleDaily] failed', e);
        throw e;
    }
});
