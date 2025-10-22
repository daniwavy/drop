/**
 * Firebase Auth onCreate Cloud Function
 * Triggers when a new user account is created (especially via Google Sign-In)
 * 
 * Deployment:
 * 1. Copy this file to functions/
 * 2. Export it in functions/index.ts or deploy separately
 * 3. Set up Auth trigger in Firebase Console
 */

import * as admin from 'firebase-admin';

// Initialize if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Auth onCreate trigger handler
// Called automatically when a new Firebase Auth user is created
export async function onUserCreateHandler(user: admin.auth.UserRecord) {
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
  } catch (err) {
    console.error('[onUserCreate] error initializing user', err);
    // Don't block user creation if this fails
    throw err;
  }
}

// For local testing/direct invocation
import { onCall, HttpsError } from 'firebase-functions/v2/https';

export const onUserCreateTest = onCall(
  { cors: true, region: 'us-central1' },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'login required');

    const user = await admin.auth().getUser(uid);
    await onUserCreateHandler(user);
    return { ok: true };
  }
);
