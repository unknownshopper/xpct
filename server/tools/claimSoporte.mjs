import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
await admin.auth().setCustomUserClaims('c8CLw2PCSCgWRJEbM1CjgJ6vjop1', { role: 'director' });
const u = await admin.auth().getUser('c8CLw2PCSCgWRJEbM1CjgJ6vjop1');
console.log('email:', u.email, '| claims:', JSON.stringify(u.customClaims), '| disabled:', u.disabled);
// verificar si lgmt sigue existiendo
const lgmt = await admin.auth().getUserByEmail('lgmt@pc-t.com.mx').catch(() => null);
console.log('lgmt@pc-t.com.mx:', lgmt ? `existe (uid ${lgmt.uid}, claims ${JSON.stringify(lgmt.customClaims)})` : 'ya no existe');
process.exit(0);
