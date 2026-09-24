import admin from 'firebase-admin';
import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../serviceAccount.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const snap = await db.collection('inspecciones').get();
const sin = [];
snap.forEach(d => { const x = d.data() || {}; if (!x.folio) sin.push({ id: d.id, equipo: x.equipo }); });
console.log('sin folio:', sin.map(s => s.equipo).join(', '));
if (!sin.length) process.exit(0);
// Touch el primero: el trigger deberia foliarlo solo
await db.collection('inspecciones').doc(sin[0].id).set({ triggerPing: Date.now() }, { merge: true });
console.log('touched:', sin[0].equipo, sin[0].id);
process.exit(0);
