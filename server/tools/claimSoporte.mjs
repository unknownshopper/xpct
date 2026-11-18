import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
for (const email of ['soporte@pc-t.com.mx', 'lgmt@pc-t.com.mx']) {
  const u = await admin.auth().getUserByEmail(email).catch(() => null);
  if (!u) { console.log(email, ': no existe'); continue; }
  await admin.auth().setCustomUserClaims(u.uid, { role: 'director' });
  await admin.auth().revokeRefreshTokens(u.uid);
  console.log(email, '| uid:', u.uid, '| claims:', JSON.stringify(u.customClaims));
}
process.exit(0);
