import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const u = await admin.auth().getUserByEmail('soporte@pc-t.com.mx');
await admin.auth().setCustomUserClaims(u.uid, { role: 'director' });
await admin.auth().revokeRefreshTokens(u.uid);
console.log('email:', u.email, '| uid:', u.uid, '| claims:', JSON.stringify(u.customClaims));
process.exit(0);
