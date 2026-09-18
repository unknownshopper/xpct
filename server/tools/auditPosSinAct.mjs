import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const inspSnap = await db.collection('inspecciones').get();
const porTipo = new Map();      // tipo -> {total, sinAct, conAct}
const sinActPorMes = new Map(); // 'YYYY-MM' -> count (solo sin actividad)
const posSinActRecientes = [];

inspSnap.forEach(d => {
  const x = d.data();
  const tipo = (x.tipoInspeccion || '(sin tipo)').toString().trim().toUpperCase();
  const t = porTipo.get(tipo) || { total: 0, sinAct: 0, conAct: 0 };
  t.total++;
  const sinAct = !x.actividadId;
  if (sinAct) {
    t.sinAct++;
    const f = x.fecha || x.creadoEn;
    let ms = null;
    try { ms = f && f.toDate ? f.toDate().getTime() : new Date(f).getTime(); } catch {}
    if (ms) {
      const k = new Date(ms).toISOString().slice(0, 7);
      sinActPorMes.set(k, (sinActPorMes.get(k) || 0) + 1);
      if (tipo === 'POST-TRABAJO') posSinActRecientes.push({ id: d.id, eq: x.equipo, fecha: new Date(ms).toISOString().slice(0,10), usuario: x.usuarioInspeccion });
    }
  } else t.conAct++;
  porTipo.set(tipo, t);
});

console.log('=== Por tipo (total | sin actividad | con actividad) ===');
[...porTipo.entries()].sort((a,b)=>b[1].total-a[1].total).forEach(([k,v]) =>
  console.log(`  ${k}: ${v.total} | ${v.sinAct} sin act | ${v.conAct} con act`));
console.log('\n=== Sin actividad por mes ===');
[...sinActPorMes.entries()].sort().forEach(([k,v]) => console.log(`  ${k}: ${v}`));
console.log('\n=== POST-TRABAJO sin actividad (muestra 15 más recientes) ===');
posSinActRecientes.sort((a,b)=>b.fecha.localeCompare(a.fecha)).slice(0,15).forEach(r => console.log(' ', r.fecha, r.eq, r.usuario||'', r.id));
process.exit(0);
