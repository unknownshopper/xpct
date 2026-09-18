import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const [inspSnap, actSnap] = await Promise.all([
  db.collection('inspecciones').get(),
  db.collection('actividades').get(),
]);
const actMap = new Map();
actSnap.forEach(d => actMap.set(d.id, d.data()));

let total = 0, conCliente = 0, sinCliente = 0;
const sinConAct = [], sinDirectas = [];
const clientes = new Map();
inspSnap.forEach(d => {
  const x = d.data();
  total++;
  const act = x.actividadId ? actMap.get(String(x.actividadId)) : null;
  const cli = (x.cliente || (act && act.cliente) || '').toString().trim();
  if (cli) { conCliente++; clientes.set(cli.toUpperCase(), (clientes.get(cli.toUpperCase())||0)+1); }
  else {
    sinCliente++;
    if (x.actividadId) sinConAct.push({ id: d.id, eq: x.equipo, act: x.actividadId });
    else sinDirectas.push({ id: d.id, eq: x.equipo, fecha: x.fecha || x.creadoEn });
  }
});
console.log('total:', total, '| conCliente:', conCliente, '| sinCliente:', sinCliente);
console.log('  sinCliente con actividad (actividad sin cliente):', sinConAct.length);
console.log('  sinCliente directas (sin actividadId):', sinDirectas.length);
console.log('muestra directas:', sinDirectas.slice(0,10));
console.log('clientes distintos:', [...clientes.entries()].sort((a,b)=>b[1]-a[1]));
process.exit(0);
