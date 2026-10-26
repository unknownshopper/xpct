import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
await admin.auth().setCustomUserClaims('G84D4rL6vkPRQWupoQl7NsNSAv53', { role: 'director' });
const u = await admin.auth().getUser('G84D4rL6vkPRQWupoQl7NsNSAv53');
console.log('email:', u.email, '| claims:', JSON.stringify(u.customClaims), '| disabled:', u.disabled);
process.exit(0);
