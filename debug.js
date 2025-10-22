const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function debug() {
  const newUserUid = 'h2OroC1nYJR6RK0dgtKDnOpR3752';
  const referrerUid = 'Ds06kcQnsZerXc2sVL89R2hHd1O2';
  const refCode = 'Ds06kcQn';

  console.log('=== NEW USER ===');
  const newUserSnap = await db.doc(`users/${newUserUid}`).get();
  if (newUserSnap.exists) {
    const data = newUserSnap.data();
    console.log('coins:', data.coins);
    console.log('referralRewardGiven:', data.referralRewardGiven);
    console.log('referredBy/referralCode:', data.referredBy || data.referralCode);
  } else {
    console.log('USER DOES NOT EXIST');
  }

  console.log('\n=== REFERRER (PARTNER) ===');
  const referrerSnap = await db.doc(`users/${referrerUid}`).get();
  if (referrerSnap.exists) {
    const data = referrerSnap.data();
    console.log('coins:', data.coins);
    console.log('referralCode:', data.referralCode);
  }

  console.log('\n=== PARTNER DOC ===');
  const partnerSnap = await db.doc(`partners/${referrerUid}`).get();
  if (partnerSnap.exists) {
    const data = partnerSnap.data();
    console.log('ALL FIELDS:', JSON.stringify(data, null, 2));
    console.log('referralsCount:', data.referralsCount);
  } else {
    console.log('PARTNER DOC DOES NOT EXIST');
  }

  console.log('\n=== REFERRAL CREDITS LOG ===');
  const logsSnap = await db.collection(`users/${referrerUid}/referralCredits`).get();
  console.log('Found', logsSnap.size, 'referral credit entries');
  logsSnap.forEach(doc => {
    console.log(' -', doc.id, ':', doc.data());
  });

  process.exit(0);
}

debug().catch(e => {
  console.error('ERROR:', e);
  process.exit(1);
});
