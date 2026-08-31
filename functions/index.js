import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { onRequest } from 'firebase-functions/v2/https';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import { DateTime } from 'luxon';

import fs from 'fs';
import path from 'path';

setGlobalOptions({ region: 'us-central1' });

export const importEquipos = onRequest(
  {
    secrets: ['EQUIPOS_IMPORT_KEY'],
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      const key = (req.query.key || req.get('x-equipos-key') || '').toString();
      const expected = (process.env.EQUIPOS_IMPORT_KEY || '').toString();
      if (!expected || key !== expected) {
        res.status(401).send('Unauthorized');
        return;
      }

      ensureAdmin();
      const db = admin.firestore();

      const csvUrl = (req.query.csvUrl || '').toString().trim();
      const body = req.body || {};
      const csvInline = (body && typeof body.csv === 'string') ? body.csv : '';
      const rawInline = (!csvInline && req.rawBody)
        ? Buffer.from(req.rawBody).toString('utf8')
        : '';

      let csvText = '';
      if (csvInline && csvInline.trim()) {
        csvText = csvInline;
      } else if (rawInline && rawInline.trim()) {
        csvText = rawInline;
      } else if (csvUrl) {
        const r = await fetch(csvUrl, { method: 'GET', headers: { 'cache-control': 'no-store' } });
        if (!r.ok) throw new Error(`No se pudo cargar csvUrl (${r.status})`);
        csvText = await r.text();
      } else {
        res.status(400).send('Missing csvUrl query param or {csv} body');
        return;
      }

      const lines = String(csvText || '')
        .split(/\r?\n/)
        .map(l => String(l || ''))
        .filter(l => l.trim() !== '');
      if (!lines.length) {
        res.status(400).send('CSV vacío');
        return;
      }

      const headers = parseCSVLine(lines[0]).map(h => String(h || '').trim());
      const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
      const idxSerial = headers.indexOf('SERIAL');
      const idxDesc = headers.indexOf('DESCRIPCION');
      const idxReporte = headers.indexOf('REPORTE P/P');
      const idxProp = headers.indexOf('PROPIEDAD');
      const idxProducto = headers.indexOf('PRODUCTO');
      const idxAcero = headers.indexOf('ACERO');
      const idxTipoEquipo = headers.indexOf('TIPO EQUIPO');
      const idxEdo = headers.indexOf('EDO');
      const idxDiam1 = headers.indexOf('DIAMETRO 1');
      const idxTipo1 = headers.indexOf('TIPO 1');
      const idxCon1 = headers.indexOf('CONEXIÓN 1');
      const idxPres1 = headers.indexOf('PRESION 1');
      const idxX1 = headers.indexOf('X 1');
      const idxDiam2 = headers.indexOf('DIAMETRO 2');
      const idxTipo2 = headers.indexOf('TIPO 2');
      const idxCon2 = headers.indexOf('CONEXIÓN 2');
      const idxPres2 = headers.indexOf('PRESION 2');
      const idxX2 = headers.indexOf('X 2');
      const idxDiam3 = headers.indexOf('DIAMETRO 3');
      const idxTipo3 = headers.indexOf('TIPO 3');
      const idxCon3 = headers.indexOf('CONEXIÓN 3');
      const idxPres3 = headers.indexOf('PRESION 3');
      const idxPT = headers.indexOf('P.T.');
      const idxServicio = headers.indexOf('SERVICIO');
      const idxAL = headers.indexOf('A / L');
      const idxTemp = headers.indexOf('TEMP');
      const idxFlejeCompleta = headers.indexOf('INFORMACION FLEJE COMPLETA');
      const idxFleje = headers.indexOf('INFORMACION FLEJE');

      if (idxEquipo < 0) {
        res.status(400).send('Cabecera inválida: falta columna EQUIPO / ACTIVO');
        return;
      }

      const { aliasMap, serialPorEquipoInv } = await getCanonicalMaps();

      const importedAt = admin.firestore.FieldValue.serverTimestamp();
      const batchLimit = 400;
      let processed = 0;
      let written = 0;
      const samples = [];

      const edoRank = (v) => {
        const s = String(v || '').trim().toUpperCase();
        if (s === 'ON') return 3;
        if (s === 'OFF') return 2;
        if (s === 'WIP') return 1;
        return 0;
      };

      const scoreRow = (p) => {
        const edo = edoRank(p.edo);
        const hasProd = p.producto ? 1 : 0;
        const hasDesc = p.descripcion ? 1 : 0;
        const hasSerial = p.serial ? 1 : 0;
        const descLen = Math.min(2000, String(p.descripcion || '').length);
        return (edo * 1000000) + (hasProd * 10000) + (hasDesc * 8000) + (hasSerial * 4000) + descLen;
      };

      const rows = lines.slice(1);
      const bestByEquipo = new Map();
      const conflicts = [];

      for (let i = 0; i < rows.length; i++) {
        const line = rows[i];
        const cols = parseCSVLine(line);
        const equipoRaw = (idxEquipo >= 0 && idxEquipo < cols.length) ? String(cols[idxEquipo] || '').trim() : '';
        if (!equipoRaw) continue;

        const serialRaw = (idxSerial >= 0 && idxSerial < cols.length) ? String(cols[idxSerial] || '').trim() : '';
        const resolved = resolveEquipoYSerialCanon({ equipoRaw, serialRaw, aliasMap, serialPorEquipoInv });
        const equipoKey = resolved.equipoCanon || normEquipoKey(equipoRaw);
        if (!equipoKey) continue;

        const payload = {
          version: 1,
          updatedAt: importedAt,
          equipoKey,
          equipoDisplay: equipoRaw,
          serial: resolved.serialCanon || serialRaw || '',
          descripcion: (idxDesc >= 0 && idxDesc < cols.length) ? String(cols[idxDesc] || '').trim() : '',
          reportePP: (idxReporte >= 0 && idxReporte < cols.length) ? String(cols[idxReporte] || '').trim() : '',
          propiedad: (idxProp >= 0 && idxProp < cols.length) ? String(cols[idxProp] || '').trim() : '',
          producto: (idxProducto >= 0 && idxProducto < cols.length) ? String(cols[idxProducto] || '').trim() : '',
          acero: (idxAcero >= 0 && idxAcero < cols.length) ? String(cols[idxAcero] || '').trim() : '',
          tipoEquipo: (idxTipoEquipo >= 0 && idxTipoEquipo < cols.length) ? String(cols[idxTipoEquipo] || '').trim() : '',
          edo: (idxEdo >= 0 && idxEdo < cols.length) ? String(cols[idxEdo] || '').trim() : '',
          diametro1: (idxDiam1 >= 0 && idxDiam1 < cols.length) ? String(cols[idxDiam1] || '').trim() : '',
          tipo1: (idxTipo1 >= 0 && idxTipo1 < cols.length) ? String(cols[idxTipo1] || '').trim() : '',
          conexion1: (idxCon1 >= 0 && idxCon1 < cols.length) ? String(cols[idxCon1] || '').trim() : '',
          presion1: (idxPres1 >= 0 && idxPres1 < cols.length) ? String(cols[idxPres1] || '').trim() : '',
          x1: (idxX1 >= 0 && idxX1 < cols.length) ? String(cols[idxX1] || '').trim() : '',
          diametro2: (idxDiam2 >= 0 && idxDiam2 < cols.length) ? String(cols[idxDiam2] || '').trim() : '',
          tipo2: (idxTipo2 >= 0 && idxTipo2 < cols.length) ? String(cols[idxTipo2] || '').trim() : '',
          conexion2: (idxCon2 >= 0 && idxCon2 < cols.length) ? String(cols[idxCon2] || '').trim() : '',
          presion2: (idxPres2 >= 0 && idxPres2 < cols.length) ? String(cols[idxPres2] || '').trim() : '',
          x2: (idxX2 >= 0 && idxX2 < cols.length) ? String(cols[idxX2] || '').trim() : '',
          diametro3: (idxDiam3 >= 0 && idxDiam3 < cols.length) ? String(cols[idxDiam3] || '').trim() : '',
          tipo3: (idxTipo3 >= 0 && idxTipo3 < cols.length) ? String(cols[idxTipo3] || '').trim() : '',
          conexion3: (idxCon3 >= 0 && idxCon3 < cols.length) ? String(cols[idxCon3] || '').trim() : '',
          presion3: (idxPres3 >= 0 && idxPres3 < cols.length) ? String(cols[idxPres3] || '').trim() : '',
          pt: (idxPT >= 0 && idxPT < cols.length) ? String(cols[idxPT] || '').trim() : '',
          servicio: (idxServicio >= 0 && idxServicio < cols.length) ? String(cols[idxServicio] || '').trim() : '',
          al: (idxAL >= 0 && idxAL < cols.length) ? String(cols[idxAL] || '').trim() : '',
          temp: (idxTemp >= 0 && idxTemp < cols.length) ? String(cols[idxTemp] || '').trim() : '',
          infoFlejeCompleta: (idxFlejeCompleta >= 0 && idxFlejeCompleta < cols.length) ? String(cols[idxFlejeCompleta] || '').trim() : '',
          infoFleje: (idxFleje >= 0 && idxFleje < cols.length) ? String(cols[idxFleje] || '').trim() : '',
          source: 'INVENTARIOTOTAL',
        };

        processed += 1;
        const score = scoreRow(payload);
        const prev = bestByEquipo.get(String(equipoKey));
        if (!prev) {
          bestByEquipo.set(String(equipoKey), { score, payload, lineNo: i + 2 });
          continue;
        }

        const prevPayload = prev.payload || {};
        const isDifferent = (
          String(prevPayload.serial || '').trim() !== String(payload.serial || '').trim() ||
          String(prevPayload.descripcion || '').trim() !== String(payload.descripcion || '').trim() ||
          String(prevPayload.producto || '').trim() !== String(payload.producto || '').trim() ||
          String(prevPayload.edo || '').trim().toUpperCase() !== String(payload.edo || '').trim().toUpperCase()
        );
        if (isDifferent && conflicts.length < 250) {
          conflicts.push({
            equipoKey,
            keepLine: prev.lineNo,
            dropLine: i + 2,
            keepEdo: String(prevPayload.edo || '').trim(),
            dropEdo: String(payload.edo || '').trim(),
            keepSerial: String(prevPayload.serial || '').trim(),
            dropSerial: String(payload.serial || '').trim(),
          });
        }

        if (score > prev.score) {
          bestByEquipo.set(String(equipoKey), { score, payload, lineNo: i + 2 });
        }
      }

      const winners = Array.from(bestByEquipo.values()).map(x => x.payload);
      written = winners.length;

      for (let i = 0; i < winners.length; i += batchLimit) {
        const chunk = winners.slice(i, i + batchLimit);
        const batch = db.batch();
        for (const payload of chunk) {
          const equipoKey = String(payload.equipoKey || '').trim();
          if (!equipoKey) continue;
          batch.set(db.collection('equipos').doc(equipoKey), payload, { merge: true });
          if (samples.length < 20) {
            samples.push({ equipoKey, equipoDisplay: payload.equipoDisplay || '', reportePP: payload.reportePP || '' });
          }
        }
        await batch.commit();
      }

      res.status(200).json({ ok: true, processed, written, samples, conflictsCount: conflicts.length, conflicts });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  }
);

export const importFormatosInspeccion = onRequest(
  {
    secrets: ['FORMATOS_IMPORT_KEY'],
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      const key = (req.query.key || req.get('x-formatos-key') || '').toString();
      const expected = (process.env.FORMATOS_IMPORT_KEY || '').toString();
      if (!expected || key !== expected) {
        res.status(401).send('Unauthorized');
        return;
      }

      ensureAdmin();
      const db = admin.firestore();

      const csvUrl = (req.query.csvUrl || '').toString().trim();
      const body = req.body || {};
      const csvInline = (body && typeof body.csv === 'string') ? body.csv : '';
      const rawInline = (!csvInline && req.rawBody)
        ? Buffer.from(req.rawBody).toString('utf8')
        : '';

      let csvText = '';
      if (csvInline && csvInline.trim()) {
        csvText = csvInline;
      } else if (rawInline && rawInline.trim()) {
        csvText = rawInline;
      } else if (csvUrl) {
        const r = await fetch(csvUrl, { method: 'GET', headers: { 'cache-control': 'no-store' } });
        if (!r.ok) throw new Error(`No se pudo cargar csvUrl (${r.status})`);
        csvText = await r.text();
      } else {
        res.status(400).send('Missing csvUrl query param or {csv} body');
        return;
      }

      const lines = String(csvText || '')
        .split(/\r?\n/)
        .map(l => String(l || ''))
        .filter(l => l.trim() !== '');
      if (!lines.length) {
        res.status(400).send('CSV vacío');
        return;
      }

      const formatos = new Map();
      let formatoActual = '';
      for (const line of lines) {
        const cols = parseCSVLine(line);
        const nombre = (cols[0] || '').toString().trim();
        if (!nombre) continue;

        if (/^PCT\b/i.test(nombre)) {
          formatoActual = nombre;
          const k = normFormatoKey(formatoActual);
          if (!formatos.has(k)) {
            formatos.set(k, { formatoKey: k, formatoDisplay: formatoActual, parametros: [] });
          }
          continue;
        }

        if (!formatoActual) continue;
        const k = normFormatoKey(formatoActual);
        const it = formatos.get(k);
        if (!it) continue;
        it.parametros.push(nombre);
      }

      const items = Array.from(formatos.values());
      if (!items.length) {
        res.status(400).send('No se detectaron formatos');
        return;
      }

      const importedAt = admin.firestore.FieldValue.serverTimestamp();
      const batchLimit = 400;
      let written = 0;
      const samples = [];

      for (let i = 0; i < items.length; i += batchLimit) {
        const chunk = items.slice(i, i + batchLimit);
        const batch = db.batch();
        chunk.forEach(it => {
          const docId = String(it.formatoKey).replace(/\//g, '_');
          batch.set(db.collection('formatos_inspeccion').doc(docId), {
            version: 1,
            updatedAt: importedAt,
            formatoKey: it.formatoKey,
            formatoDisplay: it.formatoDisplay,
            parametros: Array.from(it.parametros || []).map(x => String(x || '').trim()).filter(Boolean),
            source: 'FORXMAT',
          }, { merge: true });
          written += 1;
          if (samples.length < 20) samples.push({ formatoKey: it.formatoKey, parametros: (it.parametros || []).length });
        });
        await batch.commit();
      }

      res.status(200).json({ ok: true, formatos: items.length, written, samples });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  }
);

const TZ = process.env.TZ || 'America/Mexico_City';

function extractEmailAddress(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const m = s.match(/<\s*([^>\s]+@[^>\s]+)\s*>/);
  if (m && m[1]) return m[1].trim();
  if (s.includes('@') && !s.includes(' ')) return s;
  return s;
}

async function buildResumenGlobal() {
  ensureAdmin();
  const db = admin.firestore();

  const ultimas = await queryUltimasAnuales();

  const pruebasTotals = { totalDocs: 0, anualDocs: 0, postTrabajoDocs: 0, reparacionDocs: 0, otherDocs: 0 };
  try {
    const snapAll = await db.collection('pruebas').get();
    pruebasTotals.totalDocs = snapAll.size || 0;
    snapAll.forEach(d => {
      const data = d.data() || {};
      const periodoStr = String(data.periodo || '').trim().toUpperCase();
      if (!periodoStr || periodoStr === 'ANUAL') pruebasTotals.anualDocs += 1;
      else if (periodoStr === 'POST-TRABAJO') pruebasTotals.postTrabajoDocs += 1;
      else if (periodoStr === 'REPARACION') pruebasTotals.reparacionDocs += 1;
      else pruebasTotals.otherDocs += 1;
    });
  } catch {}

  let edoPorEquipo = {};
  try {
    const { edoPorEquipoInv } = await getCanonicalMaps();
    edoPorEquipo = { ...(edoPorEquipoInv || {}) };
  } catch {}
  try {
    const snapEdo = await db.collection('inventarioEstados').get();
    snapEdo.forEach(d => {
      const data = d.data() || {};
      const eqId = normEquipoKey(d.id || data.equipoId || '');
      if (!eqId) return;
      let edo = String(data.edo || '').trim().toUpperCase();
      if (!edo) edo = 'ON';
      edoPorEquipo[eqId] = edo;
    });
  } catch {}

  const edoCounts = { ON: 0, WIP: 0, OFF: 0, OTHER: 0, TOTAL: 0 };
  try {
    const keys = Object.keys(edoPorEquipo || {});
    edoCounts.TOTAL = keys.length;
    keys.forEach(k => {
      const e = String(edoPorEquipo[k] || '').trim().toUpperCase();
      if (!e) { edoCounts.OTHER += 1; return; }
      if (e === 'ON' || e === 'ACTIVO') edoCounts.ON += 1;
      else if (e === 'WIP') edoCounts.WIP += 1;
      else if (e === 'OFF' || e === 'INACTIVO') edoCounts.OFF += 1;
      else edoCounts.OTHER += 1;
    });
  } catch {}

  const pruebaCounts = {
    vencidas: 0,
    bucket60_30: 0,
    bucket30_15: 0,
    bucket15_0: 0,
    otras: 0,
    fail: 0,
    totalAnuales: 0,
  };

  const emptyBuckets = () => ({ gt60: 0, d60: 0, d30: 0, d15: 0, d0: 0, total: 0, fail: 0 });
  const pruebasAnualesByTipo = {
    LT: emptyBuckets(),
    UTT: emptyBuckets(),
    'VT/PT/MT': emptyBuckets(),
  };

  for (const reg of ultimas) {
    const equipoKey = reg.equipo || reg.docId;
    const eqK = normEquipoKey(equipoKey);
    const edo = (edoPorEquipo && eqK) ? edoPorEquipo[eqK] : '';
    if (edo && !equipoOperativoFromEdo(edo)) continue;

    const pruebaKey = normPruebaKey(reg.prueba || 'ANUAL');

     const tipoTarget = (pruebaKey === 'LT' || pruebaKey === 'UTT' || pruebaKey === 'VT/PT/MT') ? pruebaKey : null;

    if (reg.failReason) {
      pruebaCounts.fail += 1;
      if (tipoTarget && pruebasAnualesByTipo[tipoTarget]) pruebasAnualesByTipo[tipoTarget].fail += 1;
      continue;
    }
    pruebaCounts.totalAnuales += 1;
    if (tipoTarget && pruebasAnualesByTipo[tipoTarget]) pruebasAnualesByTipo[tipoTarget].total += 1;

    const { bucket } = clasificarDias(reg.proxima);
    if (bucket === 'vencidas') {
      pruebaCounts.vencidas += 1;
      if (tipoTarget && pruebasAnualesByTipo[tipoTarget]) pruebasAnualesByTipo[tipoTarget].d0 += 1;
    } else if (bucket === '60_30') {
      pruebaCounts.bucket60_30 += 1;
      if (tipoTarget && pruebasAnualesByTipo[tipoTarget]) pruebasAnualesByTipo[tipoTarget].d60 += 1;
    } else if (bucket === '30_15') {
      pruebaCounts.bucket30_15 += 1;
      if (tipoTarget && pruebasAnualesByTipo[tipoTarget]) pruebasAnualesByTipo[tipoTarget].d30 += 1;
    } else if (bucket === '15_0') {
      pruebaCounts.bucket15_0 += 1;
      if (tipoTarget && pruebasAnualesByTipo[tipoTarget]) pruebasAnualesByTipo[tipoTarget].d15 += 1;
    } else {
      pruebaCounts.otras += 1;
      if (tipoTarget && pruebasAnualesByTipo[tipoTarget]) pruebasAnualesByTipo[tipoTarget].gt60 += 1;
    }

    void pruebaKey;
  }

  return {
    version: 1,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    tz: TZ,
    edoCounts,
    pruebasAnuales: pruebaCounts,
    pruebasAnualesByTipo,
    pruebasTotals,
  };
}

export const rebuildResumenGlobal = onRequest(
  {
    secrets: ['RESUMEN_BUILD_KEY'],
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }
      const key = (req.query.key || req.get('x-resumen-key') || '').toString();
      const expected = (process.env.RESUMEN_BUILD_KEY || '').toString();
      if (!expected || key !== expected) {
        res.status(401).send('Unauthorized');
        return;
      }

      ensureAdmin();
      const db = admin.firestore();
      const payload = await buildResumenGlobal();
      await db.collection('resumenes').doc('global').set(payload, { merge: true });
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  }
);

export const rebuildResumenGlobalDaily = onSchedule(
  {
    schedule: 'every day 05:15',
    timeZone: TZ,
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async () => {
    ensureAdmin();
    const db = admin.firestore();
    const payload = await buildResumenGlobal();
    await db.collection('resumenes').doc('global').set(payload, { merge: true });
  }
);

function inspeccionEstadoGeneral(data) {
  try {
    const params = Array.isArray(data?.parametros) ? data.parametros : [];
    const hasBad = params.some(p => {
      const est = String(p?.estado || '').trim().toUpperCase();
      return est === 'MALO' || est === 'NO LEGIBLE';
    });
    return hasBad ? 'MALO' : 'BUENO';
  } catch {
    return 'BUENO';
  }
}

function pickWinnerPrueba(current, candidate) {
  if (!current) return candidate;
  const aProx = current.proxima || null;
  const bProx = candidate.proxima || null;
  if (bProx && (!aProx || bProx.getTime() > aProx.getTime())) return candidate;
  if (aProx && bProx && bProx.getTime() < aProx.getTime()) return current;
  const aFR = current.fechaReal || null;
  const bFR = candidate.fechaReal || null;
  if (bFR && (!aFR || bFR.getTime() > aFR.getTime())) return candidate;
  if (aFR && bFR && bFR.getTime() < aFR.getTime()) return current;
  const aC = current.creadoEn || null;
  const bC = candidate.creadoEn || null;
  if (bC && (!aC || bC.getTime() > aC.getTime())) return candidate;
  return current;
}

function pickWinnerInspeccion(current, candidate) {
  if (!current) return candidate;
  const a = current.fechaMs || 0;
  const b = candidate.fechaMs || 0;
  if (b > a) return candidate;
  return current;
}

async function buildResumenesEquiposAll() {
  ensureAdmin();
  const db = admin.firestore();

  const { aliasMap, serialPorEquipoInv } = await getCanonicalMaps();

  const edoMap = {};
  try {
    const snapEdo = await db.collection('inventarioEstados').get();
    snapEdo.forEach(d => {
      const data = d.data() || {};
      const eqK = normEquipoKey(d.id || data.equipoKey || data.equipoId || '');
      if (!eqK) return;
      let edo = String(data.edo || '').trim().toUpperCase();
      if (!edo) edo = 'ON';
      edoMap[eqK] = edo;
    });
  } catch {}

  const ultimasPorEquipoTipo = new Map();
  const equiposSet = new Set(Object.keys(edoMap || {}).filter(Boolean));

  // Incluir todos los equipos del catálogo aunque no tengan edo/pruebas/inspecciones.
  // Esto permite que `resumenes_equipos/{equipoKey}` exista y refleje "sin historial".
  try {
    const snapEq = await db.collection('equipos').get();
    snapEq.forEach(d => {
      const data = d.data() || {};
      const eqK = normEquipoKey(d.id || data.equipoKey || data.equipoId || data.equipoDisplay || '');
      if (!eqK) return;
      equiposSet.add(eqK);
    });
  } catch {}

  try {
    const snapPr = await db.collection('pruebas').get();
    snapPr.forEach(doc => {
      const data = doc.data() || {};
      const periodo = String(data.periodo || '').trim().toUpperCase();
      if (periodo && periodo !== 'ANUAL') return;

      const equipoRaw = (data.equipo || data.equipoId || data.activo || '').toString().trim();
      const serialRaw = (data.numeroSerie || data.serial || '').toString().trim();
      const resolved = resolveEquipoYSerialCanon({ equipoRaw, serialRaw, aliasMap, serialPorEquipoInv });
      const equipoCanon = resolved.equipoCanon;
      if (!equipoCanon) return;

      const pruebaKey = normPruebaKey((data.prueba || data.pruebaTipo || '') || 'ANUAL');
      if (!(pruebaKey === 'LT' || pruebaKey === 'UTT' || pruebaKey === 'VT/PT/MT' || pruebaKey === 'ANUAL')) return;

      const fechaReal = parseFecha(data.fechaRealizacion || data.fechaPrueba || data.fecha || '');
      let proxima = parseFecha(data.proxima || '');
      if (!proxima && fechaReal) {
        const d = new Date(fechaReal);
        d.setFullYear(d.getFullYear() + 1);
        d.setHours(0, 0, 0, 0);
        if (!isNaN(d.getTime())) proxima = d;
      }
      const creadoEn = parseFecha(data.creadoEn || data.createdAt || data.importedAt || data.fechaRegistro || data.created_on || '');

      const candidate = {
        docId: doc.id,
        equipoKey: equipoCanon,
        serial: resolved.serialCanon || '',
        prueba: pruebaKey,
        fechaReal,
        proxima,
        creadoEn,
        resultado: String(data.resultado || '').trim().toUpperCase(),
      };

      const key = `${equipoCanon}__${pruebaKey}`;
      const prev = ultimasPorEquipoTipo.get(key);
      ultimasPorEquipoTipo.set(key, pickWinnerPrueba(prev, candidate));
      equiposSet.add(equipoCanon);
    });
  } catch {}

  const ultimaInspPorEquipo = new Map();
  try {
    const snapInsp = await db.collection('inspecciones').get();
    snapInsp.forEach(doc => {
      const data = doc.data() || {};
      const equipoRaw = (data.equipo || data.equipoId || data.activo || '').toString().trim();
      if (!equipoRaw) return;
      const resolved = resolveEquipoYSerialCanon({ equipoRaw, serialRaw: '', aliasMap, serialPorEquipoInv });
      const equipoCanon = resolved.equipoCanon;
      if (!equipoCanon) return;

      const fecha = parseFecha(data.fecha || data.creadoEn || data.createdAt || data.fechaRegistro || '');
      const fechaMs = fecha ? fecha.getTime() : 0;
      const candidate = {
        docId: doc.id,
        equipoKey: equipoCanon,
        fechaMs,
        estadoGeneral: inspeccionEstadoGeneral(data),
        actividadId: String(data.actividadId || '').trim(),
      };
      const prev = ultimaInspPorEquipo.get(equipoCanon);
      ultimaInspPorEquipo.set(equipoCanon, pickWinnerInspeccion(prev, candidate));
      equiposSet.add(equipoCanon);
    });
  } catch {}

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const hoyMs = hoy.getTime();
  const isVigente = (d) => !!(d && !isNaN(d.getTime()) && d.getTime() > hoyMs);

  const out = [];
  for (const equipoKey of Array.from(equiposSet.values())) {
    const edo = String((edoMap && edoMap[equipoKey]) ? edoMap[equipoKey] : '').trim().toUpperCase();

    const lt = ultimasPorEquipoTipo.get(`${equipoKey}__LT`) || null;
    const utt = ultimasPorEquipoTipo.get(`${equipoKey}__UTT`) || null;
    const vpm = ultimasPorEquipoTipo.get(`${equipoKey}__VT/PT/MT`) || null;

    const ltVig = isVigente(lt ? lt.proxima : null);
    const uttVig = isVigente(utt ? utt.proxima : null);
    const vpmVig = isVigente(vpm ? vpm.proxima : null);

    const ltVigEfectivo = ltVig || uttVig || vpmVig;
    const ltOverride = (!ltVig) && (uttVig || vpmVig);
    const ltOverrideBy = uttVig ? 'UTT' : (vpmVig ? 'VT/PT/MT' : '');

    const insp = ultimaInspPorEquipo.get(equipoKey) || null;
    const inspOk = !insp || insp.estadoGeneral !== 'MALO';

    let aptoOperacion = true;
    let motivoBloqueo = '';
    if (edo === 'WIP') {
      aptoOperacion = false;
      motivoBloqueo = 'WIP';
    } else if (edo && !equipoOperativoFromEdo(edo)) {
      aptoOperacion = false;
      motivoBloqueo = 'EDO';
    } else if (!inspOk) {
      aptoOperacion = false;
      motivoBloqueo = 'INSPECCION_MALO';
    }

    const payload = {
      version: 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      equipoKey,
      serial: String((lt && lt.serial) || (utt && utt.serial) || (vpm && vpm.serial) || (serialPorEquipoInv && serialPorEquipoInv[equipoKey]) || '').trim(),
      edo: edo || 'ON',
      pruebas: {
        LT: lt ? {
          docId: lt.docId,
          proxima: lt.proxima ? admin.firestore.Timestamp.fromDate(lt.proxima) : null,
          fechaReal: lt.fechaReal ? admin.firestore.Timestamp.fromDate(lt.fechaReal) : null,
          vigente: ltVig,
          bucket: lt.proxima ? clasificarDias(lt.proxima).bucket : null,
          resultado: lt.resultado || '',
        } : null,
        UTT: utt ? {
          docId: utt.docId,
          proxima: utt.proxima ? admin.firestore.Timestamp.fromDate(utt.proxima) : null,
          fechaReal: utt.fechaReal ? admin.firestore.Timestamp.fromDate(utt.fechaReal) : null,
          vigente: uttVig,
          bucket: utt.proxima ? clasificarDias(utt.proxima).bucket : null,
          resultado: utt.resultado || '',
        } : null,
        'VT/PT/MT': vpm ? {
          docId: vpm.docId,
          proxima: vpm.proxima ? admin.firestore.Timestamp.fromDate(vpm.proxima) : null,
          fechaReal: vpm.fechaReal ? admin.firestore.Timestamp.fromDate(vpm.fechaReal) : null,
          vigente: vpmVig,
          bucket: vpm.proxima ? clasificarDias(vpm.proxima).bucket : null,
          resultado: vpm.resultado || '',
        } : null,
        ltVigenteEfectivo: ltVigEfectivo,
        ltOverride,
        ltOverrideBy,
      },
      inspeccion: insp ? {
        docId: insp.docId,
        fechaMs: insp.fechaMs || 0,
        estadoGeneral: insp.estadoGeneral || 'BUENO',
        actividadId: insp.actividadId || '',
      } : null,
      aptoOperacion,
      motivoBloqueo,
    };
    out.push(payload);
  }

  return out;
}

export const rebuildResumenesEquipos = onRequest(
  {
    secrets: ['RESUMEN_BUILD_KEY'],
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }
      const key = (req.query.key || req.get('x-resumen-key') || '').toString();
      const expected = (process.env.RESUMEN_BUILD_KEY || '').toString();
      if (!expected || key !== expected) {
        res.status(401).send('Unauthorized');
        return;
      }

      ensureAdmin();
      const db = admin.firestore();
      const lista = await buildResumenesEquiposAll();
      let idx = 0;
      let written = 0;
      while (idx < lista.length) {
        const batch = db.batch();
        let wrote = 0;
        while (idx < lista.length && wrote < 450) {
          const it = lista[idx];
          const ref = db.collection('resumenes_equipos').doc(String(it.equipoKey));
          batch.set(ref, it, { merge: true });
          idx += 1;
          wrote += 1;
          written += 1;
        }
        await batch.commit();
      }
      res.status(200).json({ ok: true, written, total: lista.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  }
);

export const rebuildResumenesEquiposDaily = onSchedule(
  {
    schedule: 'every day 05:35',
    timeZone: TZ,
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async () => {
    ensureAdmin();
    const db = admin.firestore();
    const lista = await buildResumenesEquiposAll();
    let idx = 0;
    while (idx < lista.length) {
      const batch = db.batch();
      let wrote = 0;
      while (idx < lista.length && wrote < 450) {
        const it = lista[idx];
        const ref = db.collection('resumenes_equipos').doc(String(it.equipoKey));
        batch.set(ref, it, { merge: true });
        idx += 1;
        wrote += 1;
      }
      await batch.commit();
    }
  }
);

function normEquipoKey(v) {
  let t = (v || '').toString();
  t = t.replace(/\u00A0/g, ' ');
  t = t.replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
  return t.toUpperCase().trim();
}

function normFormatoKey(v) {
  try {
    let out = String(v || '')
      .toUpperCase()
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]+/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*\/\s*/g, '/')
      .trim();
    return out;
  } catch {
    return String(v || '').toUpperCase().trim();
  }
}

function normPruebaKey(v) {
  const t = (v || '').toString().toUpperCase().trim();
  if (!t) return 'ANUAL';
  const compact = t.replace(/\s+/g, '');
  if (compact.includes('VT') && compact.includes('PT') && compact.includes('MT') && !compact.includes('UTT') && !compact.includes('LT')) return 'VT/PT/MT';
  if (compact.includes('UTT')) return 'UTT';
  if (compact.includes('LT')) return 'LT';
  return t;
}

function parseFecha(str) {
  if (!str) return null;
  if (str && typeof str === 'object' && typeof str.toDate === 'function') {
    const d = str.toDate();
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (str instanceof Date) {
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (typeof str === 'number' && isFinite(str)) {
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const s = String(str).trim();
  if (!s) return null;
  if (s.includes('/')) {
    const partes = s.split('/');
    if (partes.length !== 3) return null;
    const [ddStr, mmStr, aaStr] = partes;
    const dd = parseInt(ddStr, 10);
    const mm = parseInt(mmStr, 10);
    const aa = parseInt(aaStr, 10);
    if (!dd || !mm || isNaN(aa)) return null;
    const year = aaStr.length <= 2 ? (2000 + aa) : aa;
    const d = new Date(year, mm - 1, dd);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  const s = String(line ?? '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      if (inQuotes && s[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function safeReadLocalFile(relPath) {
  try {
    const cwd = process.cwd();
    const candidates = [
      path.resolve(cwd, relPath),
      path.resolve(cwd, '..', relPath),
      path.resolve(cwd, '..', '..', relPath),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
      } catch {}
    }
    return '';
  } catch {
    return '';
  }
}

async function fetchTextWithTimeout(url, timeoutMs = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: ac.signal });
    if (!resp.ok) return '';
    return await resp.text();
  } catch {
    return '';
  } finally {
    try { clearTimeout(t); } catch {}
  }
}

async function loadCanonicalMaps() {
  const invLocal = safeReadLocalFile('docs/INVENTARIOTOTAL04-202602.csv');
  const aliasLocal = safeReadLocalFile('docs/malescritos.csv');

  // Fallback: cargar desde hosting (si no se empaquetaron en Functions)
  const baseUrl = String(process.env.CANONICAL_CSV_BASE_URL || 'https://unknownshopper.github.io/xpct').replace(/\/+$/, '');
  const invText = invLocal || await fetchTextWithTimeout(`${baseUrl}/docs/INVENTARIOTOTAL04-202602.csv`);
  const aliasText = aliasLocal || await fetchTextWithTimeout(`${baseUrl}/docs/malescritos.csv`);

  return {
    aliasMap: loadAliasesFromCsvText(aliasText),
    serialPorEquipoInv: loadSerialPorEquipoFromInventarioCsvText(invText),
    edoPorEquipoInv: loadEdoPorEquipoFromInventarioCsvText(invText),
  };
}

let _canonicalMapsPromise = null;
function getCanonicalMaps() {
  if (!_canonicalMapsPromise) _canonicalMapsPromise = loadCanonicalMaps();
  return _canonicalMapsPromise;
}

function loadAliasesFromCsvText(text) {
  const map = {};
  try {
    const lines = String(text || '').split(/\r?\n/).filter(l => String(l || '').trim() !== '');
    if (!lines.length) return map;
    const headers = parseCSVLine(lines[0]).map(h => String(h || '').trim());
    const idxMal = headers.indexOf('Equipo mal escrito');
    const idxOk = headers.indexOf('Equipo correcto');
    if (idxMal < 0 || idxOk < 0) return map;
    lines.slice(1).forEach(l => {
      const cols = parseCSVLine(l);
      const mal = (idxMal >= 0 && idxMal < cols.length) ? cols[idxMal] : '';
      const ok = (idxOk >= 0 && idxOk < cols.length) ? cols[idxOk] : '';
      const kmal = normEquipoKey(mal);
      const kok = normEquipoKey(ok);
      if (!kmal || !kok) return;
      map[kmal] = kok;
    });
  } catch {}
  return map;
}

function loadSerialPorEquipoFromInventarioCsvText(text) {
  const serialPorEquipo = {};
  try {
    const lines = String(text || '').split(/\r?\n/).filter(l => String(l || '').trim() !== '');
    if (!lines.length) return serialPorEquipo;
    const headers = parseCSVLine(lines[0]).map(h => String(h || '').trim());
    const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
    const idxSerial = headers.indexOf('SERIAL');
    if (idxEquipo < 0) return serialPorEquipo;
    lines.slice(1).forEach(l => {
      const cols = parseCSVLine(l);
      const eq = (idxEquipo >= 0 && idxEquipo < cols.length) ? cols[idxEquipo] : '';
      const sr = (idxSerial >= 0 && idxSerial < cols.length) ? cols[idxSerial] : '';
      const eqK = normEquipoKey(eq);
      const srK = String(sr || '').trim();
      if (!eqK) return;
      if (srK && !serialPorEquipo[eqK]) serialPorEquipo[eqK] = srK;
    });
  } catch {}
  return serialPorEquipo;
}

function loadEdoPorEquipoFromInventarioCsvText(text) {
  const edoPorEquipo = {};
  try {
    const lines = String(text || '').split(/\r?\n/).filter(l => String(l || '').trim() !== '');
    if (!lines.length) return edoPorEquipo;
    const headers = parseCSVLine(lines[0]).map(h => String(h || '').trim());
    const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
    const idxEdo = headers.indexOf('EDO');
    if (idxEquipo < 0 || idxEdo < 0) return edoPorEquipo;
    lines.slice(1).forEach(l => {
      const cols = parseCSVLine(l);
      const eq = (idxEquipo >= 0 && idxEquipo < cols.length) ? cols[idxEquipo] : '';
      const edo = (idxEdo >= 0 && idxEdo < cols.length) ? cols[idxEdo] : '';
      const eqK = normEquipoKey(eq);
      let e = String(edo || '').trim().toUpperCase();
      if (!e) e = 'ON';
      if (!eqK) return;
      if (!edoPorEquipo[eqK]) edoPorEquipo[eqK] = e;
    });
  } catch {}
  return edoPorEquipo;
}

function equipoOperativoFromEdo(edo) {
  const e = String(edo || '').trim().toUpperCase();
  if (!e) return true;
  return (e === 'ON' || e === 'ACTIVO' || e === 'WIP');
}

function resolveEquipoYSerialCanon({ equipoRaw, serialRaw, aliasMap, serialPorEquipoInv }) {
  const eq0 = normEquipoKey(equipoRaw);
  const sr0 = String(serialRaw || '').trim();
  let eqCanon = (eq0 && aliasMap && aliasMap[eq0]) ? String(aliasMap[eq0] || '') : eq0;
  try {
    // Intentar canonicalización por inventario (ej: PCT-XO-77 => PCT-XO-077)
    if (eqCanon && !(serialPorEquipoInv && serialPorEquipoInv[eqCanon])) {
      const m = String(eqCanon).match(/^(.*-)(\d{1,3})$/);
      if (m && m[1] && m[2] && m[2].length < 3) {
        const padded = `${m[1]}${String(m[2]).padStart(3, '0')}`;
        const paddedKey = normEquipoKey(padded);
        if (paddedKey && serialPorEquipoInv && serialPorEquipoInv[paddedKey]) {
          eqCanon = paddedKey;
        }
      }
    }
  } catch {}
  let srCanon = sr0;
  try {
    const srInv = (eqCanon && serialPorEquipoInv && serialPorEquipoInv[eqCanon])
      ? String(serialPorEquipoInv[eqCanon] || '').trim()
      : '';
    if (srInv) srCanon = srInv;
  } catch {}
  return { equipoCanon: eqCanon, serialCanon: srCanon };
}

function fmtYYYYMMDD(d) {
  if (!d || isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function ensureAdmin() {
  if (admin.apps && admin.apps.length) return;
  admin.initializeApp();
}

async function queryUltimasAnuales() {
  const db = admin.firestore();
  const snap = await db.collection('pruebas').get();
  const porEquipoPrueba = new Map();

  // Canonicalización (Opción A): alias + inventario como fuente de verdad
  const { aliasMap, serialPorEquipoInv } = await getCanonicalMaps();

  snap.forEach(doc => {
    const data = doc.data() || {};
    const periodo = (data.periodo || '').toString().trim().toUpperCase();
    if (periodo && periodo !== 'ANUAL') return;

    const equipoRaw = (data.equipo || data.equipoId || data.activo || '').toString().trim();
    const serialRaw = (data.numeroSerie || data.serial || '').toString().trim();
    const resolved = resolveEquipoYSerialCanon({ equipoRaw, serialRaw, aliasMap, serialPorEquipoInv });
    const equipoCanon = resolved.equipoCanon;
    const serialCanon = resolved.serialCanon;

    const equipoDisplay = equipoCanon || equipoRaw || doc.id;
    const equipoKey = normEquipoKey(equipoDisplay);

    const prueba = (data.prueba || data.pruebaTipo || '').toString().trim();
    const pruebaKey = normPruebaKey(prueba || 'ANUAL');

    const serial = serialCanon;
    const fechaReal = parseFecha(data.fechaRealizacion || data.fechaPrueba || data.fecha || '');

    let proxima = parseFecha(data.proxima || '');
    if (!proxima && fechaReal) {
      const d = new Date(fechaReal);
      d.setFullYear(d.getFullYear() + 1);
      d.setHours(0, 0, 0, 0);
      const derived = !isNaN(d.getTime()) ? d : null;
      if (derived) proxima = derived;
    }

    const creadoEn = parseFecha(
      data.creadoEn || data.createdAt || data.importedAt || data.fechaRegistro || data.created_on || ''
    );

    let failReason = '';
    if (!equipoRaw) failReason = 'SIN_EQUIPO';
    if (!proxima) failReason = failReason || 'SIN_PROXIMA';

    const key = `${equipoKey || normEquipoKey(equipoDisplay)}__${pruebaKey}`;
    const current = porEquipoPrueba.get(key);
    const payload = {
      docId: doc.id,
      equipo: equipoDisplay,
      serial,
      prueba: pruebaKey,
      fechaReal,
      proxima,
      creadoEn,
      failReason,
      raw: data
    };

    if (!current) {
      porEquipoPrueba.set(key, payload);
    } else {
      const aProx = current.proxima || null;
      const bProx = proxima || null;
      if (bProx && (!aProx || bProx.getTime() > aProx.getTime())) {
        porEquipoPrueba.set(key, payload);
        return;
      }
      if (aProx && bProx && bProx.getTime() < aProx.getTime()) return;

      const aFR = current.fechaReal || null;
      const bFR = fechaReal || null;
      if (bFR && (!aFR || bFR.getTime() > aFR.getTime())) {
        porEquipoPrueba.set(key, payload);
        return;
      }
      if (aFR && bFR && bFR.getTime() < aFR.getTime()) return;

      const aC = current.creadoEn || null;
      const bC = creadoEn || null;
      if (bC && (!aC || bC.getTime() > aC.getTime())) {
        porEquipoPrueba.set(key, payload);
      }
    }
  });

  return Array.from(porEquipoPrueba.values());
}

function clasificarDias(proxima) {
  if (!proxima) return { dias: null, bucket: null };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diff = proxima.getTime() - hoy.getTime();
  const dias = Math.round(diff / (1000 * 60 * 60 * 24));
  if (dias <= 0) return { dias, bucket: 'vencidas' };
  if (dias >= 31 && dias <= 60) return { dias, bucket: '60_30' };
  if (dias >= 16 && dias <= 30) return { dias, bucket: '30_15' };
  if (dias >= 1 && dias <= 15) return { dias, bucket: '15_0' };
  return { dias, bucket: 'otras' };
}

function buildHtml({ lista60, lista30, lista15, lista0, listaFail }) {
  const fmt = d => (d ? DateTime.fromJSDate(d).setZone(TZ).toFormat('dd/LL/yyyy') : '-');
  const estadoFromDias = dias => (dias < 0 ? 'Vencida' : 'Vigente');
  const section = (titulo, items, opts = {}) => {
    if (!items.length) return '';
    const includeEstado = opts.includeEstado !== false;
    const includeMotivo = !!opts.includeMotivo;
    const rows = items
      .sort((a, b) => a.dias - b.dias)
      .map(x => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${x.equipo}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${x.serial || '-'}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${x.prueba || '-'}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${fmt(x.proxima)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${(x.dias ?? '-')}</td>
          ${includeEstado ? `<td style=\"padding:6px 8px;border-bottom:1px solid #e5e7eb;\">${typeof x.dias === 'number' ? estadoFromDias(x.dias) : '-'}</td>` : ''}
          ${includeMotivo ? `<td style=\"padding:6px 8px;border-bottom:1px solid #e5e7eb;\">${x.failReason || '-'}</td>` : ''}
        </tr>
      `).join('');
    return `
      <h3 style="margin:14px 0 6px; font-size:14px; color:#111827;">${titulo} (${items.length})</h3>
      <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Equipo</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Serial</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Prueba / Calib.</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Próxima</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Días</th>
            ${includeEstado ? '<th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Estado</th>' : ''}
            ${includeMotivo ? '<th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Motivo</th>' : ''}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  };

  const headerHtml = `
    <div style="padding:12px 0 8px; display:flex; align-items:center; gap:12px;">
      <div style="font-size:18px; font-weight:600; color:#111827;">Alertas de pruebas por vencer</div>
    </div>
  `;

  const mainHtml = `
    <div style="font-family:Arial, Helvetica, sans-serif; color:#111827;">
      ${headerHtml}
      <p style="margin:4px 0 12px; font-size:13px; color:#4b5563;">Solo se consideran pruebas ANUALES.</p>
      ${section('60-31 días', lista60)}
      ${section('30-16 días', lista30)}
      ${section('15-1 días (envío diario)', lista15)}
      ${section('💀 0 días (vencidas)', lista0)}
      ${section('Fallidos', listaFail, { includeMotivo: true })}
    </div>
  `;

  const footerHtml = `
    <div style="margin-top:16px; padding-top:10px; border-top:1px solid #e5e7eb;">
      <p style="margin:0; font-size:11px; color:#6b7280; line-height:1.35;">
        Aviso de confidencialidad: Este mensaje y sus anexos están dirigidos únicamente a su destinatario y pueden contener información confidencial y/o privilegiada. Si usted no es el destinatario, se le notifica que cualquier revisión, retransmisión, difusión o cualquier otro uso de, o tomar cualquier acción en base a esta información, queda estrictamente prohibido. Si recibió este mensaje por error, por favor elimínelo y notifique al remitente.
      </p>
    </div>
  `;

  return `
    <div style="font-family:Arial, Helvetica, sans-serif; color:#111827;">
      ${mainHtml}
      ${footerHtml}
    </div>
  `;
}

function getMailRecipients() {
  const toRaw = process.env.MAIL_TO || '';
  const extraRaw = process.env.MAIL_TO_EXTRA || '';

  const toList = Array.from(new Set(
    toRaw
      .split(/[;,]/)
      .map(s => s.trim())
      .filter(Boolean)
  ));

  const bccList = Array.from(new Set(
    extraRaw
      .split(/[;,]/)
      .map(s => s.trim())
      .filter(Boolean)
  ));

  return { toList, bccList };
}

function isMailDisabled() {
  const v = String(process.env.MAIL_DISABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function getMailOnlyHour() {
  const raw = String(process.env.MAIL_ONLY_HOUR || '').trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  if (n < 0 || n > 23) return null;
  return n;
}

function parseEmailList(raw) {
  return Array.from(new Set(
    String(raw || '')
      .split(/[;,]/)
      .map(s => s.trim())
      .filter(Boolean)
  ));
}

async function enviarCorreo({ html, subject, to, cc, bcc }) {
  const host = (process.env.SMTP_HOST || '').trim();
  const port = parseInt(String(process.env.SMTP_PORT || '587').trim(), 10);
  const user = (process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '');

  if (!host || !host.includes('.')) throw new Error('SMTP_HOST is invalid or empty');
  if (!port || Number.isNaN(port)) throw new Error('SMTP_PORT is invalid');
  if (!user) throw new Error('SMTP_USER is empty');

  const fromRaw = (process.env.MAIL_FROM || '').trim();
  const fromName = (process.env.MAIL_FROM_NAME || 'PCT Notificaciones').trim();
  const from = fromRaw ? fromRaw : { name: fromName, address: user };
  const fromAddress = extractEmailAddress(fromRaw || user);

  let toList = [];
  let bccList = [];
  let ccList = [];
  try {
    if (to != null) toList = Array.isArray(to) ? to : parseEmailList(to);
    if (bcc != null) bccList = Array.isArray(bcc) ? bcc : parseEmailList(bcc);
    if (cc != null) ccList = Array.isArray(cc) ? cc : parseEmailList(cc);
  } catch {}
  if (!toList.length) {
    const legacy = getMailRecipients();
    toList = legacy.toList;
    bccList = legacy.bccList;
  }
  if (!toList.length) throw new Error('MAIL_TO is empty or invalid');

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    logger: process.env.SMTP_DEBUG === '1',
    debug: process.env.SMTP_DEBUG === '1'
  });

  const envelopeTo = Array.from(new Set([...(toList || []), ...(ccList || []), ...(bccList || [])]));
  return transporter.sendMail({
    from,
    to: toList.join(', '),
    cc: ccList.length ? ccList.join(', ') : undefined,
    bcc: bccList.length ? bccList.join(', ') : undefined,
    subject,
    html,
    envelope: { from: fromAddress, to: envelopeTo }
  });
}

function canSendNoAtendidasByClaims({ role, email }) {
  const r = String(role || '').trim().toLowerCase();
  const em = String(email || '').trim().toLowerCase();
  return (r === 'admin' || r === 'director' || r === 'sgi' || em === 'sgi@pc-t.com.mx');
}

function buildNoAtendidasHtml({ items }) {
  const safe = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = (items || []).map(it => {
    return `
      <tr>
        <td align="left" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${safe(it.equipoDisplay)}</td>
        <td align="left" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${safe(it.serial)}</td>
        <td align="left" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${safe(it.tipo)}</td>
        <td align="left" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${safe(it.fecha)}</td>
        <td align="left" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#991b1b;">${safe(it.dias)}</td>
        <td align="left" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${safe(it.danos)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="font-family:Arial, Helvetica, sans-serif; color:#111827;">
      <div style="padding:12px 0 8px; display:flex; align-items:center; gap:12px;">
        <div style="font-size:18px; font-weight:700; color:#111827;">No atendidas (equipos con daño)</div>
      </div>
      <p style="margin:4px 0 12px; font-size:13px; color:#4b5563;">Se listan equipos cuya última inspección registrada resultó NO operativa (MALO / NO LEGIBLE).</p>
      <h3 style="margin:14px 0 6px; font-size:14px; color:#111827;">Equipos (${(items || []).length})</h3>
      <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Equipo</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Serial</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Tipo</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Última inspección</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Días</th>
            <th align="left" style="padding:6px 8px;border-bottom:1px solid #cbd5e1;color:#374151;font-weight:600;">Daños</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:16px; padding-top:10px; border-top:1px solid #e5e7eb;">
        <p style="margin:0; font-size:11px; color:#6b7280; line-height:1.35;">Aviso de confidencialidad: Este mensaje y sus anexos están dirigidos únicamente a su destinatario y pueden contener información confidencial y/o privilegiada.</p>
      </div>
    </div>
  `;
}

export const sendNoAtendidasEmail = onRequest(
  {
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ ok: false, error: 'Method Not Allowed' });
        return;
      }

      ensureAdmin();

      const authHeader = String(req.get('authorization') || '').trim();
      const m = authHeader.match(/^Bearer\s+(.+)$/i);
      const token = m && m[1] ? m[1].trim() : '';
      if (!token) {
        res.status(401).json({ ok: false, error: 'Missing Bearer token' });
        return;
      }

      let decoded = null;
      try {
        decoded = await admin.auth().verifyIdToken(token);
      } catch {
        res.status(401).json({ ok: false, error: 'Invalid token' });
        return;
      }

      const role = decoded?.role || decoded?.claims?.role || decoded?.customClaims?.role || null;
      const email = decoded?.email || '';
      if (!canSendNoAtendidasByClaims({ role, email })) {
        res.status(403).json({ ok: false, error: 'Forbidden' });
        return;
      }

      const db = admin.firestore();

      // 1) Traer inspecciones y quedarnos con la última por equipo
      const snap = await db.collection('inspecciones').get();
      const byEq = new Map();
      snap.forEach(doc => {
        const data = doc.data() || {};
        const eq = String(data.equipo || '').trim();
        if (!eq) return;
        const k = normEquipoKey(eq);
        if (!k) return;

        const ms = (() => {
          const f = data.fecha || data.creadoEn || data.createdAt || null;
          if (f && typeof f.toMillis === 'function') return f.toMillis();
          if (f && typeof f.seconds === 'number') return f.seconds * 1000;
          const d = new Date(f);
          return isNaN(d.getTime()) ? 0 : d.getTime();
        })();

        const prev = byEq.get(k);
        if (!prev || (ms && ms >= (prev._ms || 0))) {
          byEq.set(k, { id: doc.id, ...data, _ms: ms });
        }
      });

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const hoyMs = hoy.getTime();
      const diasDesde = (ms) => {
        try {
          if (!ms) return '';
          const d = new Date(ms);
          if (isNaN(d.getTime())) return '';
          d.setHours(0, 0, 0, 0);
          const diff = Math.floor((hoyMs - d.getTime()) / 86400000);
          return String(diff < 0 ? 0 : diff);
        } catch {
          return '';
        }
      };

      const isNoOperativa = (insp) => {
        const params = Array.isArray(insp?.parametros) ? insp.parametros : [];
        if (!params.length) return false;
        return params.some(p => {
          const est = String(p?.estado || '').trim().toUpperCase();
          return est === 'MALO' || est === 'NO LEGIBLE';
        });
      };

      const lista = Array.from(byEq.values())
        .filter(isNoOperativa)
        .sort((a, b) => (b._ms || 0) - (a._ms || 0));

      // 2) Enriquecer con serial desde equipos (best effort)
      const serialMap = new Map();
      try {
        const snapEq = await db.collection('equipos').get();
        snapEq.forEach(d => {
          const data = d.data() || {};
          const k = String(data.equipoKey || d.id || '').trim();
          if (!k) return;
          const sr = String(data.serial || '').trim();
          if (sr && !serialMap.has(k)) serialMap.set(k, sr);
        });
      } catch {}

      const items = lista.map(insp => {
        const eqRaw = String(insp?.equipo || '').trim();
        const eqK = normEquipoKey(eqRaw);
        const tipo = String(insp?.tipoInspeccion || '').trim();
        const ms = Number(insp?._ms || 0);
        const fecha = ms ? DateTime.fromMillis(ms).setZone(TZ).toFormat('dd/LL/yyyy') : '';
        const params = Array.isArray(insp?.parametros) ? insp.parametros : [];
        const danos = params
          .filter(p => {
            const est = String(p?.estado || '').trim().toUpperCase();
            return est === 'MALO' || est === 'NO LEGIBLE';
          })
          .map(p => String(p?.nombre || p?.parametro || p?.item || '').trim())
          .filter(Boolean);

        return {
          equipoDisplay: eqRaw,
          serial: String(insp?.serial || serialMap.get(eqK) || '').trim(),
          tipo,
          fecha,
          dias: diasDesde(ms),
          danos: danos.length ? danos.join(', ') : 'MALO',
        };
      });

      const html = buildNoAtendidasHtml({ items });
      const subject = `No atendidas (daño) - ${DateTime.now().setZone(TZ).toFormat('dd/LL/yyyy')}`;

      const to = parseEmailList(process.env.MAIL_NO_ATENDIDAS_TO || 'cops@pc-t.com.mx');
      const cc = parseEmailList(process.env.MAIL_NO_ATENDIDAS_CC || 'sgi@pc-t.com.mx, auxger@pc-t.com.mx, admin@pc-t.com.mx, lgmt@pc-t.com.mx, jalcz@pc-t.com.mx');
      const bcc = parseEmailList(process.env.MAIL_NO_ATENDIDAS_BCC || '');

      if (isMailDisabled()) {
        res.status(200).json({ ok: true, sent: false, disabled: true, count: items.length, to, cc, bcc });
        return;
      }

      await enviarCorreo({ html, subject, to, cc, bcc });
      res.status(200).json({ ok: true, sent: true, count: items.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }
);

async function calcularYEnviar({ testMode = false, force = false }) {
  ensureAdmin();
  const db = admin.firestore();
  const ultimas = await queryUltimasAnuales();

  let edoPorEquipo = {};
  try {
    const { edoPorEquipoInv } = await getCanonicalMaps();
    edoPorEquipo = { ...(edoPorEquipoInv || {}) };
  } catch {}

  try {
    const snapEdo = await db.collection('inventarioEstados').get();
    snapEdo.forEach(d => {
      const data = d.data() || {};
      const eqId = normEquipoKey(d.id || data.equipoId || '');
      if (!eqId) return;
      let edo = String(data.edo || '').trim().toUpperCase();
      if (!edo) edo = 'ON';
      edoPorEquipo[eqId] = edo;
    });
  } catch {}

  const { toList, bccList } = getMailRecipients();
  const mailDisabled = isMailDisabled();
  const onlyHour = getMailOnlyHour();

  const lista60 = [];
  const lista30 = [];
  const lista15 = [];
  const lista0 = [];
  const listaFail = [];

  for (const reg of ultimas) {
    const equipoKey = reg.equipo || reg.docId;
    try {
      const eqK = normEquipoKey(equipoKey);
      const edo = (edoPorEquipo && eqK) ? edoPorEquipo[eqK] : '';
      if (edo && !equipoOperativoFromEdo(edo)) continue;
    } catch {}
    const pruebaKey = normPruebaKey(reg.prueba || 'ANUAL');

    if (reg.failReason) {
      listaFail.push({ equipo: equipoKey, serial: reg.serial, prueba: pruebaKey, proxima: reg.proxima, dias: null, failReason: reg.failReason });
      continue;
    }

    const { dias, bucket } = clasificarDias(reg.proxima);
    if (bucket === 'vencidas') {
      lista0.push({ equipo: equipoKey, serial: reg.serial, prueba: pruebaKey, proxima: reg.proxima, dias });
      continue;
    }

    if (bucket === '60_30' || bucket === '30_15' || bucket === '15_0') {
      const trackId = `${normEquipoKey(equipoKey)}__${pruebaKey}`;
      const trackRef = db.collection('alertas_pruebas').doc(trackId);
      const trackSnap = await trackRef.get();
      const t = trackSnap.exists ? trackSnap.data() : {};

      if (bucket === '60_30') {
        lista60.push({ equipo: equipoKey, serial: reg.serial, prueba: pruebaKey, proxima: reg.proxima, dias });
        if ((force || !t.notif60At) && !testMode) {
          await trackRef.set({ ...t, notif60At: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
      } else if (bucket === '30_15') {
        lista30.push({ equipo: equipoKey, serial: reg.serial, prueba: pruebaKey, proxima: reg.proxima, dias });
        if ((force || !t.notif30At) && !testMode) {
          await trackRef.set({ ...t, notif30At: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
      } else if (bucket === '15_0') {
        lista15.push({ equipo: equipoKey, serial: reg.serial, prueba: pruebaKey, proxima: reg.proxima, dias });
        if (!testMode) await trackRef.set({ ...t, notif15LastAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  }

  const html = buildHtml({ lista60, lista30, lista15, lista0, listaFail });
  const subject = `Alertas pruebas por vencer - ${DateTime.now().setZone(TZ).toFormat('dd/LL/yyyy')}`;

  const empty = (!lista60.length && !lista30.length && !lista15.length && !lista0.length && !listaFail.length);

  if (mailDisabled) {
    return {
      sent: false,
      disabled: true,
      empty,
      counts: empty ? undefined : { c60: lista60.length, c30: lista30.length, c15: lista15.length, c0: lista0.length, cFail: listaFail.length },
      to: toList,
      bcc: bccList,
    };
  }

  if (!force && onlyHour != null) {
    const now = DateTime.now().setZone(TZ);
    if (now.hour !== onlyHour) {
      return {
        sent: false,
        gated: true,
        onlyHour,
        hourNow: now.hour,
        empty,
        counts: empty ? undefined : { c60: lista60.length, c30: lista30.length, c15: lista15.length, c0: lista0.length, cFail: listaFail.length },
        to: toList,
        bcc: bccList,
      };
    }
  }

  if (empty) {
    if (testMode) {
      await enviarCorreo({ html, subject });
      return { sent: true, empty: true, to: toList, bcc: bccList };
    }
    return { sent: false, empty: true };
  }

  await enviarCorreo({ html, subject });

  return {
    sent: true,
    empty: false,
    counts: { c60: lista60.length, c30: lista30.length, c15: lista15.length, c0: lista0.length, cFail: listaFail.length },
    to: toList,
    bcc: bccList
  };
}

export const sendAlertsDaily = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: TZ,
    retryCount: 2,
    memory: '512MiB',
    timeoutSeconds: 120,
    secrets: ['SMTP_PASS', 'SMTP_USER'],
  },
  async () => {
    const out = await calcularYEnviar({ testMode: false, force: false });
    console.log('sendAlertsDaily result:', out);
  }
);

export const normalizePruebasEquipos = onRequest(
  {
    secrets: ['NORMALIZE_KEY'],
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      const key = (req.query.key || req.get('x-normalize-key') || '').toString();
      const expected = (process.env.NORMALIZE_KEY || '').toString();
      if (!expected || key !== expected) {
        res.status(401).send('Unauthorized');
        return;
      }

      ensureAdmin();
      const db = admin.firestore();

      const dryRun = String(req.query.dryRun || '').trim() === '1';
      const limit = Math.max(1, Math.min(10000, parseInt(String(req.query.limit || '0'), 10) || 0));

      const { aliasMap, serialPorEquipoInv } = await getCanonicalMaps();

      const batchLimit = 400;
      let scanned = 0;
      let changed = 0;
      let applied = 0;
      const samples = [];

      const snap = await db.collection('pruebas').get();
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += batchLimit) {
        if (limit && scanned >= limit) break;
        const chunk = docs.slice(i, i + batchLimit);
        let batch = null;
        if (!dryRun) batch = db.batch();

        for (const d of chunk) {
          if (limit && scanned >= limit) break;
          scanned += 1;
          const data = d.data() || {};

          const equipoRaw = (data.equipo || data.equipoId || data.activo || '').toString().trim();
          const serialRaw = (data.numeroSerie || data.serial || '').toString().trim();
          if (!equipoRaw) continue;

          const resolved = resolveEquipoYSerialCanon({ equipoRaw, serialRaw, aliasMap, serialPorEquipoInv });
          const equipoCanon = resolved.equipoCanon;
          const serialCanon = resolved.serialCanon;

          const equipoCurrent = (data.equipo || '').toString().trim();
          const serialCurrent = (data.serial || '').toString().trim();
          const numeroSerieCurrent = (data.numeroSerie || '').toString().trim();

          const updates = {};
          if (equipoCanon && equipoCanon !== normEquipoKey(equipoCurrent)) {
            updates.equipo = equipoCanon;
          }
          if (serialCanon) {
            if (serialCurrent && serialCanon !== serialCurrent) updates.serial = serialCanon;
            if (numeroSerieCurrent && serialCanon !== numeroSerieCurrent) updates.numeroSerie = serialCanon;
            if (!serialCurrent && !numeroSerieCurrent) updates.serial = serialCanon;
          }

          const keys = Object.keys(updates);
          if (!keys.length) continue;

          changed += 1;
          if (samples.length < 30) {
            samples.push({ docId: d.id, from: { equipo: data.equipo || '', serial: data.serial || data.numeroSerie || '' }, to: { equipo: updates.equipo || data.equipo || '', serial: updates.serial || updates.numeroSerie || data.serial || data.numeroSerie || '' } });
          }

          if (!dryRun && batch) {
            batch.update(d.ref, updates);
          }
        }

        if (!dryRun && batch) {
          await batch.commit();
          applied += 1;
        }
      }

      res.status(200).json({ ok: true, dryRun, scanned, changed, batchesCommitted: applied, samples });
    } catch (e) {
      res.status(500).send(String(e && e.message ? e.message : e));
    }
  }
);

export const importPanual1 = onRequest(
  {
    secrets: ['PANUAL_IMPORT_KEY'],
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      const key = (req.query.key || req.get('x-panual-key') || '').toString();
      const expected = (process.env.PANUAL_IMPORT_KEY || '').toString();
      if (!expected || key !== expected) {
        res.status(401).send('Unauthorized');
        return;
      }

      ensureAdmin();
      const db = admin.firestore();

      // Pre-cargar los tipos de prueba ANUAL existentes por equipo para poder reiniciar
      // el cronómetro por cada tipo (LT/UTT/VT..., etc.) según lo que ya existe en el sistema.
      const tiposAnualPorEquipo = new Map();
      try {
        const snapAll = await db.collection('pruebas').get();
        snapAll.forEach(doc => {
          const data = doc.data() || {};
          const periodoStr = (data.periodo || '').toString().trim().toUpperCase();
          if (periodoStr && periodoStr !== 'ANUAL') return;
          const eq = (data.equipo || data.equipoId || data.activo || data['EQUIPO / ACTIVO'] || '').toString().trim();
          if (!eq) return;
          const tipo = normPruebaKey(data.pruebaTipo || data.prueba || 'ANUAL');
          const ek = normEquipoKey(eq);
          if (!ek) return;
          const set = tiposAnualPorEquipo.get(ek) || new Set();
          set.add(tipo || 'ANUAL');
          tiposAnualPorEquipo.set(ek, set);
        });
      } catch {
        // si falla, seguimos y creamos como ANUAL únicamente
      }

      const csvUrl = (req.query.csvUrl || '').toString().trim();
      const body = req.body || {};
      const csvInline = (body && typeof body.csv === 'string') ? body.csv : '';

      let csvText = '';
      if (csvInline && csvInline.trim()) {
        csvText = csvInline;
      } else if (csvUrl) {
        const r = await fetch(csvUrl, { method: 'GET', headers: { 'cache-control': 'no-store' } });
        if (!r.ok) throw new Error(`No se pudo cargar csvUrl (${r.status})`);
        csvText = await r.text();
      } else {
        res.status(400).send('Missing csvUrl query param or {csv} body');
        return;
      }

      const rawLines = csvText.split(/\r?\n/);
      const lines = rawLines
        .map(l => (l ?? '').toString())
        .filter(l => l.trim() !== '');

      if (!lines.length) {
        res.status(400).send('CSV vacío');
        return;
      }

      let headerIdx = -1;
      let headers = [];
      for (let i = 0; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]).map(x => String(x || '').trim());
        const h = cols.join(' ').toUpperCase();
        if (h.includes('NO. ACTIVO') && h.includes('FECHA')) {
          headerIdx = i;
          headers = cols;
          break;
        }
      }
      if (headerIdx < 0) {
        res.status(400).send('No se encontró cabecera con NO. ACTIVO y FECHA');
        return;
      }

      const idxTipo = headers.findIndex(h => h.toUpperCase() === 'TIPO');
      const idxActivo = headers.findIndex(h => h.toUpperCase().includes('NO. ACTIVO'));
      const idxSerial = headers.findIndex(h => h.toUpperCase().includes('NO. SERIAL'));
      const idxReporte = headers.findIndex(h => h.toUpperCase().includes('REPORTE'));
      const idxFecha = headers.findIndex(h => h.toUpperCase() === 'FECHA');
      const idxObs = headers.findIndex(h => h.toUpperCase().includes('OBSERV'));

      if (idxActivo < 0 || idxFecha < 0) {
        res.status(400).send('Cabecera inválida: faltan columnas NO. ACTIVO o FECHA');
        return;
      }

      const porEquipo = new Map();
      const errores = [];

      for (let i = headerIdx + 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const equipo = String(cols[idxActivo] || '').trim();
        if (!equipo) continue;
        const frStr = String(cols[idxFecha] || '').trim();
        const fr = parseFecha(frStr);
        if (!fr) {
          errores.push({ line: i + 1, equipo, reason: 'FECHA_INVALIDA', fecha: frStr });
          continue;
        }

        const keyEq = normEquipoKey(equipo);
        const prev = porEquipo.get(keyEq);
        if (!prev || (prev.fr && fr.getTime() > prev.fr.getTime())) {
          porEquipo.set(keyEq, {
            equipo,
            tipo: idxTipo >= 0 ? String(cols[idxTipo] || '').trim() : '',
            serial: idxSerial >= 0 ? String(cols[idxSerial] || '').trim() : '',
            noReporte: idxReporte >= 0 ? String(cols[idxReporte] || '').trim() : '',
            observaciones: idxObs >= 0 ? String(cols[idxObs] || '').trim() : '',
            fr,
            frStr,
            srcLine: i + 1,
          });
        }
      }

      const items = Array.from(porEquipo.values());
      if (!items.length) {
        res.status(400).json({ ok: false, message: 'No hubo filas válidas para importar', errores });
        return;
      }

      const importedAt = admin.firestore.FieldValue.serverTimestamp();
      const batchLimit = 400;
      let createdOrUpdated = 0;
      let batches = 0;

      for (let i = 0; i < items.length; i += batchLimit) {
        const chunk = items.slice(i, i + batchLimit);
        const batch = db.batch();
        chunk.forEach(it => {
          const equipoKey = normEquipoKey(it.equipo);
          const dayKey = fmtYYYYMMDD(it.fr);

          const tipos = tiposAnualPorEquipo.get(equipoKey);
          const listaTipos = (tipos && tipos.size) ? Array.from(tipos.values()) : ['ANUAL'];

          for (const tipo of listaTipos) {
            const tipoKey = normPruebaKey(tipo || 'ANUAL') || 'ANUAL';
            const docId = `panual1__${equipoKey}__${tipoKey}__${dayKey}`;
            const ref = db.collection('pruebas').doc(docId);

            const proxima = new Date(it.fr);
            proxima.setFullYear(proxima.getFullYear() + 1);
            proxima.setHours(0, 0, 0, 0);

            batch.set(ref, {
              equipo: it.equipo,
              periodo: 'ANUAL',
              pruebaTipo: tipoKey,
              fechaRealizacion: admin.firestore.Timestamp.fromDate(it.fr),
              proxima: !isNaN(proxima.getTime()) ? admin.firestore.Timestamp.fromDate(proxima) : null,
              noReporte: it.noReporte || '',
              numeroSerie: it.serial || '',
              serial: it.serial || '',
              tipoEquipo: it.tipo || '',
              observaciones: it.observaciones || '',
              importTag: 'panual1',
              importLine: it.srcLine,
              importSourceFecha: it.frStr,
              importAt: importedAt,
            }, { merge: true });
          }
        });

        await batch.commit();
        batches += 1;
        createdOrUpdated += chunk.length;
      }

      res.status(200).json({
        ok: true,
        mode: 'INSERT_DEDUP_MOST_RECENT',
        pruebaTipo: 'ANUAL',
        periodo: 'ANUAL',
        equiposInCsv: items.length,
        writes: createdOrUpdated,
        batches,
        errores,
      });
    } catch (err) {
      console.error('importPanual1 error:', err);
      res.status(500).send(err?.message || String(err));
    }
  }
);

export const sendAlertsManual = onRequest(
  {
    secrets: ['SMTP_PASS', 'SMTP_USER', 'ALERTS_RUN_KEY'],
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      const key = (req.query.key || req.get('x-alerts-key') || '').toString();
      const expected = (process.env.ALERTS_RUN_KEY || '').toString();
      if (!expected || key !== expected) {
        res.status(401).send('Unauthorized');
        return;
      }

      const out = await calcularYEnviar({ testMode: false, force: true });
      res.status(200).json(out);
    } catch (err) {
      console.error('sendAlertsManual error:', err);
      res.status(500).send(err?.message || String(err));
    }
  }
);

export const scanMissingInspectionEvidence = onRequest(
  {
    secrets: ['EVID_SCAN_KEY'],
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req, res) => {
    try {
      if (req.method !== 'GET') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      const key = (req.query.key || req.get('x-evid-scan-key') || '').toString();
      const expected = (process.env.EVID_SCAN_KEY || '').toString();
      if (!expected || key !== expected) {
        res.status(401).send('Unauthorized');
        return;
      }

      ensureAdmin();
      const db = admin.firestore();
      const bucket = admin.storage().bucket();

      const limitRaw = (req.query.limit || '').toString().trim();
      const limitN = limitRaw ? parseInt(limitRaw, 10) : 600;
      const limitFinal = (!limitN || Number.isNaN(limitN) || limitN < 1) ? 600 : Math.min(limitN, 3000);

      const sinceRaw = (req.query.since || '').toString().trim();
      const sinceMs = sinceRaw ? Date.parse(sinceRaw) : NaN;
      const sinceDate = (!sinceRaw || Number.isNaN(sinceMs)) ? null : new Date(sinceMs);

      let q = db.collection('inspecciones').orderBy('creadoEn', 'desc').limit(limitFinal);
      if (sinceDate) {
        q = db.collection('inspecciones').where('creadoEn', '>=', sinceDate).orderBy('creadoEn', 'desc').limit(limitFinal);
      }

      const snap = await q.get();

      const existsCache = new Map();
      const fileExists = async (path) => {
        const p = String(path || '').trim();
        if (!p) return false;
        if (existsCache.has(p)) return !!existsCache.get(p);
        try {
          const [ok] = await bucket.file(p).exists();
          existsCache.set(p, !!ok);
          return !!ok;
        } catch {
          existsCache.set(p, false);
          return false;
        }
      };

      const buildCandidates = ({ inspId, localId, actId, name, pathDirecto }) => {
        const out = [];
        const pd = String(pathDirecto || '').trim();
        if (pd) out.push(pd);
        const nm = String(name || '').trim();
        if (!nm) return out;
        if (inspId) out.push(`inspecciones/${inspId}/${nm}`);
        if (localId) out.push(`inspecciones/${localId}/${nm}`);
        if (actId) out.push(`inspecciones/${actId}/${nm}`);
        return Array.from(new Set(out));
      };

      const okStr = (v) => (v == null ? '' : String(v));

      const missing = [];
      const stats = {
        inspected: 0,
        inspectedParams: 0,
        missingCount: 0,
        missingDocs: 0,
      };

      for (const doc of snap.docs) {
        const data = doc.data() || {};
        const inspId = doc.id;
        const localId = okStr(data.localId).trim();
        const actId = okStr(data.actividadId).trim();
        const equipo = okStr(data.equipo).trim();
        const fecha = okStr(data.fecha || data.creadoEn).trim();
        const params = Array.isArray(data.parametros) ? data.parametros : [];

        stats.inspected += 1;
        let docHasMissing = false;

        const pushMissing = (payload) => {
          missing.push({
            inspId,
            equipo,
            fecha,
            linkView: `inspeccion.html?view=1&inspId=${encodeURIComponent(inspId)}`,
            linkEdit: `inspeccion.html?inspId=${encodeURIComponent(inspId)}`,
            ...payload,
          });
          docHasMissing = true;
          stats.missingCount += 1;
        };

        for (let i = 0; i < params.length; i++) {
          const p = params[i] || {};
          const nombre = okStr(p.nombre).trim();
          stats.inspectedParams += 1;

          const checkSlot = async ({ slot, evidenciaNombre, evidenciaPath }) => {
            const nm = okStr(evidenciaNombre).trim();
            const pd = okStr(evidenciaPath).trim();
            if (!nm && !pd) return;
            const cands = buildCandidates({ inspId, localId, actId, name: nm, pathDirecto: pd });
            for (const c of cands) {
              if (await fileExists(c)) return;
            }
            pushMissing({ tipo: 'parametro', parametro: nombre, idx: i, slot, evidenciaNombre: nm, evidenciaPath: pd, candidatos: cands });
          };

          await checkSlot({ slot: 1, evidenciaNombre: p.evidenciaNombre, evidenciaPath: p.evidenciaPath });
          await checkSlot({ slot: 2, evidenciaNombre: p.evidenciaNombre2, evidenciaPath: p.evidenciaPath2 });

          const by = (p.evidenciasPorDano && typeof p.evidenciasPorDano === 'object') ? p.evidenciasPorDano : null;
          if (by) {
            for (const danoKey of Object.keys(by)) {
              const ed = by[danoKey] || {};
              const dk = okStr(danoKey).trim().toUpperCase();
              const checkDanoSlot = async ({ slot, evidenciaNombre, evidenciaPath }) => {
                const nm = okStr(evidenciaNombre).trim();
                const pd = okStr(evidenciaPath).trim();
                if (!nm && !pd) return;
                const cands = buildCandidates({ inspId, localId, actId, name: nm, pathDirecto: pd });
                for (const c of cands) {
                  if (await fileExists(c)) return;
                }
                pushMissing({ tipo: 'dano', parametro: nombre, idx: i, dano: dk, slot, evidenciaNombre: nm, evidenciaPath: pd, candidatos: cands });
              };
              await checkDanoSlot({ slot: 1, evidenciaNombre: ed.evidenciaNombre, evidenciaPath: ed.evidenciaPath });
              await checkDanoSlot({ slot: 2, evidenciaNombre: ed.evidenciaNombre2, evidenciaPath: ed.evidenciaPath2 });
            }
          }
        }

        if (docHasMissing) stats.missingDocs += 1;
      }

      res.status(200).json({
        ok: true,
        stats,
        limit: limitFinal,
        since: sinceDate ? sinceDate.toISOString() : null,
        missing,
      });
    } catch (err) {
      console.error('scanMissingInspectionEvidence error:', err);
      res.status(500).send(err?.message || String(err));
    }
  }
);
