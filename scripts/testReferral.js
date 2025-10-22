const admin = require('firebase-admin');
const serviceAccount = require('../firebase-key.json'); // or load from env

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'drop-1c4ea'
});

const db = admin.firestore();

async function test() {
  const testUid = 'test-ref-' + Date.now();
  console.log('Creating test user:', testUid);
  
  // Write test user
  await db.doc(`users/${testUid}`).set({
    referredBy: 'Ds06kcQn',
    coins: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log('✓ Test user created');
  
  // Wait for function to process
  console.log('Waiting 3s for function to process...');
  await new Promise(r => setTimeout(r, 3000));
  
  // Check debug docs
  console.log('\nChecking debug collections...');
  const runDocs = await db.collection('debug').doc('processReferralReward').collection('runs').get();
  console.log(`✓ Found ${runDocs.size} run docs`);
  
  const resDocs = await db.collection('debug').doc('processReferralReward').collection('resolution').get();
  console.log(`✓ Found ${resDocs.size} resolution docs`);
  
  if (resDocs.size > 0) {
    const latest = resDocs.docs[resDocs.docs.length - 1];
    const data = latest.data();
    console.log('Latest resolution:', JSON.stringify(data, null, 2));
    
    if (data.inviterUid) {
      // Check if partner doc was updated
      const partner = await db.doc(`partners/${data.inviterUid}`).get();
      console.log(`\nPartner ${data.inviterUid}:`, partner.data());
      
      // Check referral credits
      const credits = await db.doc(`users/${data.inviterUid}/referralCredits/${testUid}`).get();
      console.log(`Referral credit ${testUid}:`, credits.data());
    }
  }
  
  process.exit(0);
}

test().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
