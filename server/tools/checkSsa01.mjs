import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url)));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const equipo = process.argv[2] || 'PCT-SSA-01';
const snap = await db.collection('pruebas').where('equipo', '==', equipo).get();
const docs = snap.docs.map(d => {
  const r = d.data();
  const ce = r.creadoEn && r.creadoEn.toDate ? r.creadoEn.toDate().toISOString() : String(r.creadoEn || '');
  return { id: d.id, fecha: r.fechaRealizacion, periodo: r.periodo || 'ANUAL', resultado: r.resultado || '-', prueba: r.prueba || r.pruebaTipo || '', creadoEn: ce };
});
docs.sort((a, b) => String(a.creadoEn).localeCompare(String(b.creadoEn)));
docs.forEach(r => console.log([r.fecha, r.periodo, r.resultado, r.prueba, r.creadoEn, r.id.slice(0, 12)].join(' | ')));
console.log('total:', docs.length);
