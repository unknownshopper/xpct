import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa), storageBucket: 'xpct-tab.firebasestorage.app' });
const bucket = admin.storage().bucket();
const ids = [
  'insp_df82446a-9778-4140-ac63-9fcc541574fe',
  'insp_f66b5992-ff22-4dac-966e-8d115447c449',
  'insp_1b2e5b19-a4a3-4b37-b123-d2eb278d5642',
  'APFGgtoaEKY9D2McHCjq',
];
for (const id of ids) {
  const [files] = await bucket.getFiles({ prefix: `inspecciones/${id}/`, maxResults: 10 });
  console.log(id, '->', files.length ? files.map(f => f.name.split('/').pop()) : '(carpeta vacía o inexistente)');
}
process.exit(0);
