import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
await admin.auth().deleteUser('UhCopjFUNShFCCwrB7doytlJull2');
console.log('Eliminado jalcz@pct.com');
const u = await admin.auth().getUserByEmail('jalcz@pct.com').catch(() => null);
console.log('Verificación:', u ? 'TODAVÍA EXISTE' : 'ya no existe');
process.exit(0);
