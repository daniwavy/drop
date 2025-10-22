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
exports.resetActiveTodayUsers = exports.trackActiveTodayUsers = exports.enterDrop = exports.grantTickets = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const functions = __importStar(require("firebase-functions/v2"));
// Initialize Firebase Admin SDK
if (!admin.apps.length)
    admin.initializeApp();
// Füge die Berlin-Zeit Hilfsfunktionen hinzu
const berlinFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});
function berlinPartsFromMs(ms) {
    // Primary: use formatToParts
    try {
        const parts = berlinFormatter.formatToParts(new Date(ms));
        const map = {};
        for (const part of parts) {
            if (part.type !== 'literal')
                map[part.type] = part.value;
        }
        const year = Number(map.year || '0');
        const month = Number(map.month || '0');
        const day = Number(map.day || '0');
        const hour = Number(map.hour || '0');
        const minute = Number(map.minute || '0');
        const second = Number(map.second || '0');
        // If hour seems invalid (NaN), fall back to parsing an en-CA locale string
        if (!Number.isFinite(hour))
            throw new Error('invalid-hour');
        return { year, month, day, hour, minute, second };
    }
    catch (e) {
        // Fallback: parse a predictable en-CA formatted string (YYYY-MM-DD, HH:MM:SS)
        try {
            const s = new Date(ms).toLocaleString('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            // s expected like '2025-10-13, 20:48:00' or '2025-10-13, 20:48:00'
            const m = s.match(/(\d{4})-(\d{2})-(\d{2}).*?(\d{2}):(\d{2}):(\d{2})/);
            if (m) {
                const year = Number(m[1]);
                const month = Number(m[2]);
                const day = Number(m[3]);
                const hour = Number(m[4]);
                const minute = Number(m[5]);
                const second = Number(m[6]);
                return { year, month, day, hour, minute, second };
            }
        }
        catch (e2) {
            // ignore fallback errors
        }
        // As ultimate fallback, use UTC-derived components (not ideal)
        const d = new Date(ms);
        return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() };
    }
}
function formatBerlinDay(parts) {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
function shiftBerlinDay(parts, delta) {
    const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    base.setUTCDate(base.getUTCDate() + delta);
    return { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1, day: base.getUTCDate() };
}
function ticketsDateIdFromMs(ms) {
    const parts = berlinPartsFromMs(ms);
    const minutes = parts.hour * 60 + parts.minute + parts.second / 60;
    const cutoff = 20 * 60 + 15; // 20:15 Berlin time
    let target = { year: parts.year, month: parts.month, day: parts.day };
    // Move to next day if at or after 20:15 (i.e. minutes >= cutoff)
    if (minutes >= cutoff) {
        target = shiftBerlinDay(target, 1);
    }
    return formatBerlinDay(target);
}
// Grant Tickets Cloud Function
exports.grantTickets = functions.https.onCall(async (req) => {
    // v2 onCall: req.auth and req.data
    if (!req || !req.auth) {
        console.log('[grantTickets] unauthenticated call');
        return { ok: false, code: 'unauthenticated', message: 'Nicht authentifiziert' };
    }
    const uid = req.auth.uid;
    const now = Date.now();
    const dayId = ticketsDateIdFromMs(now);
    const db = (0, firestore_1.getFirestore)();
    // Debug: log detailed time information (local ISO, Berlin localized string, parts, minutes)
    try {
        const partsDebug = berlinPartsFromMs(now);
        const minutesDebug = partsDebug.hour * 60 + partsDebug.minute + partsDebug.second / 60;
        const cutoffDebug = 20 * 60 + 15;
        const berlinLocaleStr = new Date(now).toLocaleString('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        console.log('[grantTickets] DEBUG_TIME', JSON.stringify({ nowIso: new Date(now).toISOString(), localString: new Date(now).toString(), berlinLocale: berlinLocaleStr, parts: partsDebug, minutes: minutesDebug, cutoff: cutoffDebug, computedDayId: dayId }));
    }
    catch (dbg) {
        console.warn('[grantTickets] DEBUG_TIME_FAILED', String(dbg));
    }
    try {
        console.error('===TESTLOG=== STARTING TRANSACTION uid=' + uid);
        const userRef = db.collection('users').doc(uid);
        const counterRef = userRef.collection('countersByDay').doc(dayId);
        const res = await db.runTransaction(async (tx) => {
            const counterSnap = await tx.get(counterRef);
            const current = counterSnap.exists ? (counterSnap.data()?.tickets || 0) : 0;
            // Menge aus req.data lesen
            const base = Number(req.data?.amount) || 0;
            if (base <= 0) {
                throw new Error('invalid-amount');
            }
            // Prüfe ob double_tickets aktiv ist
            const userSnap = await tx.get(userRef);
            const effects = userSnap.exists ? (userSnap.data()?.effects || {}) : {};
            const doubleTickets = effects?.double_tickets?.active === true;
            const final = doubleTickets ? base * 2 : base;
            // Speichere unter dem korrekten Tag
            tx.set(counterRef, {
                tickets: current + final,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            // Aktualisiere auch die Gesamt-Statistik für den Tag
            const metricsRef = db.collection('metrics_daily').doc(dayId);
            const metricsSnap = await tx.get(metricsRef);
            const totalCurrent = metricsSnap.exists ? (metricsSnap.data()?.ticketsTodayTotal || 0) : 0;
            tx.set(metricsRef, {
                ticketsTodayTotal: totalCurrent + final,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            return { added: final, total: current + final };
        });
        const successMsg = `[grantTickets] TX_SUCCESS uid=${uid} dayId=${dayId} added=${res.added} total=${res.total}`;
        console.log(JSON.stringify({ msg: successMsg }));
        return { ok: true, day: dayId, added: res.added, total: res.total };
    }
    catch (e) {
        console.error('[grantTickets] error', e);
        return { ok: false, code: e.code || 'internal-error', message: e.message || 'Unbekannter Fehler' };
    }
});
// Enter a Drop giveaway: record participation per-user
// Shared helper: perform the participant transaction given uid and entryId
// Enter a Drop giveaway: record participation per-user
// Shared helper: perform the participant transaction given uid and entryId
async function performEnterDropTransaction(db, uid, entryId) {
    // New schema: write participant docs into top-level collection
    // Path: drop-vault-entries/{entryId}/participants/{uid}
    return await db.runTransaction(async (tx) => {
        const nowTs = firestore_1.Timestamp.now();
        console.log('[enterDrop.helper] using drop-vault-entries path for entryId', entryId);
        const entryDocRef = db.collection('drop-vault-entries').doc(entryId);
        const participantsDocRef = entryDocRef.collection('participants').doc(uid);
        const userRef = db.collection('users').doc(uid);
        // Read user coins and participant doc atomically
        const [userSnap, pSnap] = await Promise.all([tx.get(userRef), tx.get(participantsDocRef)]);
        const coins = (userSnap.exists && typeof userSnap.get('coins') === 'number') ? userSnap.get('coins') : 0;
        const current = pSnap.exists ? Number(pSnap.data()?.count || 0) : 0;
        // Cost to participate
        const COST = 10;
        if (coins < COST) {
            throw new Error('insufficient-coins');
        }
        // Deduct coins and write participant count
        tx.set(userRef, { coins: coins - COST }, { merge: true });
        const next = current + 1;
        tx.set(participantsDocRef, { count: next, lastParticipated: nowTs }, { merge: true });
        return { count: next, remainingCoins: coins - COST };
    });
}
// Original callable remains but delegates to the helper
exports.enterDrop = functions.https.onCall(async (req) => {
    console.log('[enterDrop] called', { auth: req?.auth, data: req?.data });
    if (!req || !req.auth) {
        console.log('[enterDrop] unauthenticated call');
        return { ok: false, code: 'unauthenticated', message: 'Nicht authentifiziert' };
    }
    const uid = req.auth.uid;
    const entryId = typeof req.data?.entryId === 'string' ? req.data.entryId : (typeof req.data?.id === 'string' ? req.data.id : null);
    console.log('[enterDrop] uid, entryId', { uid, entryId });
    if (!entryId) {
        return { ok: false, code: 'invalid-argument', message: 'Missing entryId' };
    }
    try {
        const db = (0, firestore_1.getFirestore)();
        const res = await performEnterDropTransaction(db, uid, entryId);
        return { ok: true, count: res.count };
    }
    catch (err) {
        console.error('[enterDrop] failed', err);
        return { ok: false, code: err?.code || 'internal', message: err?.message || String(err) };
    }
});
// Auto-Trigger: Wenn Tickets >= 50 werden, add zu activeTodayUsers
exports.trackActiveTodayUsers = functions.firestore.onDocumentWritten({ document: 'users/{uid}/countersByDay/{dayId}', region: 'us-central1' }, async (event) => {
    try {
        const uid = event.params.uid || '';
        const dayId = event.params.dayId || '';
        const after = event.data?.after?.data?.();
        if (!after)
            return;
        const tickets = after.tickets || 0;
        console.log(JSON.stringify({ msg: '[trackActiveTodayUsers] triggered', uid, dayId, tickets }));
        if (tickets < 50) {
            return; // Not enough tickets
        }
        const db = (0, firestore_1.getFirestore)();
        // Hole User um referredBy zu finden
        const userSnap = await db.collection('users').doc(uid).get();
        if (!userSnap.exists) {
            console.log(JSON.stringify({ msg: '[trackActiveTodayUsers] user not found', uid }));
            return;
        }
        const userData = userSnap.data();
        let referredBy = userData?.referredBy || userData?.referred_by;
        if (!referredBy || typeof referredBy !== 'string') {
            console.log(JSON.stringify({ msg: '[trackActiveTodayUsers] no referredBy', uid }));
            return;
        }
        // Parse referralCode
        referredBy = String(referredBy).trim();
        if (referredBy.startsWith('ref_'))
            referredBy = referredBy.slice(4);
        if (referredBy.includes('http')) {
            referredBy = referredBy.split(/[?#&/]/)[0];
        }
        referredBy = referredBy.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
        console.log(JSON.stringify({ msg: '[trackActiveTodayUsers] searching for partner', code: referredBy }));
        // Finde Partner
        const usersCol = db.collection('users');
        const start = referredBy;
        const end = referredBy + '\uf8ff';
        const q = await usersCol
            .where(admin.firestore.FieldPath.documentId(), '>=', start)
            .where(admin.firestore.FieldPath.documentId(), '<=', end)
            .limit(1)
            .get();
        let inviterUid = '';
        if (!q.empty) {
            inviterUid = q.docs[0].id;
        }
        else {
            // Fallback zu referralCode field
            const q2 = await usersCol.where('referralCode', '==', referredBy).limit(1).get();
            if (!q2.empty)
                inviterUid = q2.docs[0].id;
        }
        if (!inviterUid) {
            console.log(JSON.stringify({ msg: '[trackActiveTodayUsers] partner not found', code: referredBy }));
            return;
        }
        console.log(JSON.stringify({ msg: '[trackActiveTodayUsers] found partner, writing', inviterUid }));
        // Schreibe zu activeTodayUsers
        await db.collection('partners').doc(inviterUid).collection('activeTodayUsers').doc(uid).set({ addedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        console.log(JSON.stringify({ msg: '[trackActiveTodayUsers] SUCCESS', uid, inviterUid }));
    }
    catch (e) {
        console.error(JSON.stringify({ msg: '[trackActiveTodayUsers] error', error: String(e) }));
    }
});
// Reset activeTodayUsers jeden Tag um Mitternacht (Berlin Zeit)
exports.resetActiveTodayUsers = functions.scheduler.onSchedule({ schedule: '0 0 * * *', timeZone: 'Europe/Berlin', region: 'us-central1' }, async () => {
    try {
        console.log(JSON.stringify({ msg: '[resetActiveTodayUsers] starting daily reset' }));
        const db = (0, firestore_1.getFirestore)();
        const partnersRef = db.collection('partners');
        const partners = await partnersRef.get();
        let resetCount = 0;
        for (const partnerDoc of partners.docs) {
            const activeTodayUsersRef = partnerDoc.ref.collection('activeTodayUsers');
            const users = await activeTodayUsersRef.get();
            for (const userDoc of users.docs) {
                await userDoc.ref.delete();
                resetCount++;
            }
        }
        console.log(JSON.stringify({ msg: '[resetActiveTodayUsers] SUCCESS', deletedDocs: resetCount }));
    }
    catch (e) {
        console.error(JSON.stringify({ msg: '[resetActiveTodayUsers] error', error: String(e) }));
    }
});
