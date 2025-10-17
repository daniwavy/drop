const admin = require('firebase-admin');

const PROJECT = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG && JSON.parse(process.env.FIREBASE_CONFIG).projectId || 'drop-1c4ea';

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

(async ()=>{
  try{
    console.log('Project:', PROJECT);
    // Create inviter
    const inviterUid = 'test_inviter_' + Date.now();
    const inviterRef = db.doc(`users/${inviterUid}`);
    const referralCode = 'rc_' + Math.floor(Math.random()*1000000);
    await inviterRef.set({ referralCode, coins: 0, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log('Created inviter', inviterUid, 'with referralCode', referralCode);

    // Create new user doc with referredBy = referralCode (simulate signup)
    const newUid = 'test_new_' + Date.now();
    const newRef = db.doc(`users/${newUid}`);
    await newRef.set({ referredBy: referralCode, coins: 0, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log('Created new user', newUid, 'with referredBy', referralCode);

    // Wait a bit for function to execute
    console.log('Waiting 8s for function to process...');
    await sleep(8000);

    // Read back
    const invSnap = await inviterRef.get();
    const newSnap = await newRef.get();
    console.log('Inviter coins:', invSnap.exists ? invSnap.get('coins') : 'no-doc');
    console.log('New user coins:', newSnap.exists ? newSnap.get('coins') : 'no-doc');

    const auditRef = db.doc(`users/${inviterUid}/referralCredits/${newUid}`);
    const auditSnap = await auditRef.get();
    console.log('Audit exists:', auditSnap.exists);

  }catch(e){
    console.error('Error', e);
  }
  process.exit(0);
})();
