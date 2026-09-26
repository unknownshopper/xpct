import admin from 'firebase-admin';
import fs from 'fs';
const sa = JSON.parse(fs.readFileSync('/Users/albertogarcia/Sista/xpct/server/serviceAccount.json','utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const d = await db.collection('equipos').doc('PCT-CA-13').get();
console.log(JSON.stringify(d.data(), null, 1).slice(0, 1200));
process.exit(0);
