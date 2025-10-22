"use strict";
/**
 * Firebase Auth onCreate Cloud Function
 * Triggers when a new user account is created (especially via Google Sign-In)
 *
 * Deployment:
 * 1. Copy this file to functions/
 * 2. Export it in functions/index.ts or deploy separately
 * 3. Set up Auth trigger in Firebase Console
 */
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
exports.onUserCreateTest = void 0;
exports.onUserCreateHandler = onUserCreateHandler;
const admin = __importStar(require("firebase-admin"));
// Initialize if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
// Auth onCreate trigger handler
// Called automatically when a new Firebase Auth user is created
async function onUserCreateHandler(user) {
    try {
        const uid = user.uid;
        const email = user.email || null;
        const displayName = user.displayName || null;
        const photoURL = user.photoURL || null;
        // Create user document in Firestore with initial data
        // NOTE: Start with coins: 0 so referral rewards work correctly
        // The processReferralReward function will add 500 coins if there's a referral code
        await db.doc(`users/${uid}`).set({
            email,
            displayName,
            photoURL,
            // Start with 0 coins - let referral system handle rewards
            coins: 0,
            profileCompleted: false,
            gamesSelected: false,
            isPartner: false,
            items: {
                double_xp: 0,
                double_tickets: 0,
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log('[onUserCreate] initialized new user', {
            uid,
            email,
            hasDisplayName: !!displayName,
        });
    }
    catch (err) {
        console.error('[onUserCreate] error initializing user', err);
        // Don't block user creation if this fails
        throw err;
    }
}
// For local testing/direct invocation
const https_1 = require("firebase-functions/v2/https");
exports.onUserCreateTest = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'login required');
    const user = await admin.auth().getUser(uid);
    await onUserCreateHandler(user);
    return { ok: true };
});
