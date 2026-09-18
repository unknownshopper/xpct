import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const actSnap = await db.collection('actividades').get();
const equiposCheck = ['PCT-PUP-0241','PCT-PUP-0242','PCT-PUP-0171','PCT-PUP-0204','PCT-PUP-0211','PCT-XO-212','PCT-XO-096','PCT-CAP-007','PCT-90-268','PCT-PUP-0062','PCT-PUP-0237','PCT-PUP-0203','PCT-XO-211','PCT-90-026','PCT-90-043'];
const porEq = new Map();
actSnap.forEach(d => {
  const x = d.data();
  const lista = Array.isArray(x.equipos) && x.equipos.length ? x.equipos : [x.equipo];
  lista.filter(Boolean).forEach(eq => {
    const k = String(eq).toUpperCase().replace(/\s+/g,'');
    if (!porEq.has(k)) porEq.set(k, []);
    porEq.get(k).push({ id: d.id, cliente: x.cliente, fecha: x.fechaRegistro || x.creadoEn, equipo: eq });
  });
});
equiposCheck.forEach(eq => {
  const k = eq.toUpperCase().replace(/\s+/g,'');
  // variantes con ceros
  const m = k.match(/^PCT-?([A-Z]{2,4})-?(\d{1,4})$/);
  const keys = [k];
  if (m) { const n = parseInt(m[2],10); keys.push(`PCT-${m[1]}-${n}`,`PCT-${m[1]}-${String(n).padStart(3,'0')}`,`${m[1]}-${n}`); }
  const hits = [];
  keys.forEach(kk => (porEq.get(kk)||[]).forEach(h => hits.push(h)));
  console.log(eq, '→', hits.length ? hits.map(h=>`${h.cliente||'?'}(${h.id.slice(0,6)})`).join(', ') : 'SIN ACTIVIDADES');
});
process.exit(0);
