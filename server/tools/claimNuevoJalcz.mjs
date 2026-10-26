import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
await admin.auth().setCustomUserClaims('QcS5OWvH4sYGiA0h40lg6Px4y582', { role: 'admin' });
const u = await admin.auth().getUser('QcS5OWvH4sYGiA0h40lg6Px4y582');
console.log('email:', u.email, '| claims:', JSON.stringify(u.customClaims), '| disabled:', u.disabled);
process.exit(0);
