import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const res = await admin.auth().listUsers(1000);
for (const u of res.users) {
  if (/soporte|lgmt/i.test(u.email || '') || u.uid === 'c8CLw2PCSCgWRJEbM1CjgJ6vjop1') {
    console.log(u.email, '| uid:', u.uid, '| claims:', JSON.stringify(u.customClaims || {}), '| disabled:', u.disabled);
  }
}
console.log('---done---');
process.exit(0);
