// Utilidades compartidas en el frontend

// parseCSVLine: divide una línea CSV simple en columnas, respetando comillas dobles básicas.
// Se asume un formato sin saltos de línea embebidos y separador coma.
function parseCSVLine(linea) {
    const resultado = [];
    let actual = '';
    let enComillas = false;

    for (let i = 0; i < linea.length; i++) {
        const ch = linea[i];

        if (ch === '"') {
            if (enComillas && i + 1 < linea.length && linea[i + 1] === '"') {
                actual += '"';
                i++;
            } else {
                enComillas = !enComillas;
            }
        } else if (ch === ',' && !enComillas) {
            resultado.push(actual);
            actual = '';
        } else {
            actual += ch;
        }
    }

    // Siempre empujar el último campo aunque venga vacío.
    resultado.push(actual.trim());
    actual = '';

    return resultado;
}

// Exponer en window para los scripts no-módulo que ya esperan parseCSVLine en global
if (typeof window !== 'undefined') {
    window.parseCSVLine = window.parseCSVLine || parseCSVLine;
}

function _normNoUttKey(v) {
    try {
        return String(v || '')
            .trim()
            // Normalizar guiones unicode a guión ASCII
            .replace(/[‐‑‒–—―]/g, '-')
            // Normalizar espacios alrededor de guiones
            .replace(/\s*-\s*/g, '-')
            // Colapsar whitespace restante
            .replace(/\s+/g, ' ')
            .toUpperCase();
    } catch {
        return '';
    }
}

async function loadNoUttExclusions(opts = {}) {
    try {
        if (typeof window === 'undefined') return { activos: new Set(), seriales: new Set() };
        const force = !!opts.force;
        window.__noUtt = window.__noUtt || { activos: new Set(), seriales: new Set(), loaded: false, loading: null };

        if (!force && window.__noUtt.loaded) return window.__noUtt;
        if (!force && window.__noUtt.loading) return await window.__noUtt.loading;

        const storageKey = 'pct_no_utt_v1';
        if (!force) {
            try {
                const cached = localStorage.getItem(storageKey) || '';
                if (cached) {
                    const parsed = JSON.parse(cached);
                    const a = Array.isArray(parsed && parsed.activos) ? parsed.activos : [];
                    const s = Array.isArray(parsed && parsed.seriales) ? parsed.seriales : [];
                    window.__noUtt.activos = new Set(a.map(_normNoUttKey).filter(Boolean));
                    window.__noUtt.seriales = new Set(s.map(_normNoUttKey).filter(Boolean));
                    window.__noUtt.loaded = true;
                    return window.__noUtt;
                }
            } catch {}
        }

        window.__noUtt.loading = (async () => {
            let activos = new Set();
            let seriales = new Set();
            try {
                // 1) Preferir Firestore (source of truth)
                try {
                    const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
                    const db = (window.db || (mod.getFirestore ? mod.getFirestore() : null));
                    if (db && mod.doc && mod.getDoc) {
                        const ref = mod.doc(db, 'config', 'no_utt');
                        const snap = await mod.getDoc(ref);
                        if (snap && snap.exists && snap.exists()) {
                            const data = snap.data() || {};
                            const a = Array.isArray(data.activos) ? data.activos : [];
                            const s = Array.isArray(data.seriales) ? data.seriales : [];
                            activos = new Set(a.map(_normNoUttKey).filter(Boolean));
                            seriales = new Set(s.map(_normNoUttKey).filter(Boolean));
                            // Guardar cache local
                            try {
                                localStorage.setItem(storageKey, JSON.stringify({
                                    activos: Array.from(activos),
                                    seriales: Array.from(seriales),
                                }));
                            } catch {}
                            // Marcar y retornar
                            window.__noUtt.activos = activos;
                            window.__noUtt.seriales = seriales;
                            window.__noUtt.loaded = true;
                            window.__noUtt.loading = null;
                            return window.__noUtt;
                        }
                        try { if (force) console.warn('[no_utt] Firestore doc config/no_utt no existe o está vacío'); } catch {}
                    }
                } catch (e) {
                    try { if (force) console.warn('[no_utt] Error leyendo Firestore config/no_utt', e); } catch {}
                }
            } catch {
                activos = new Set();
                seriales = new Set();
            }

            window.__noUtt.activos = activos;
            window.__noUtt.seriales = seriales;
            window.__noUtt.loaded = true;
            window.__noUtt.loading = null;

            try {
                localStorage.setItem(storageKey, JSON.stringify({
                    activos: Array.from(activos),
                    seriales: Array.from(seriales),
                }));
            } catch {}

            return window.__noUtt;
        })();

        return await window.__noUtt.loading;
    } catch {
        try {
            if (typeof window !== 'undefined') {
                window.__noUtt = window.__noUtt || { activos: new Set(), seriales: new Set(), loaded: true, loading: null };
                window.__noUtt.loaded = true;
            }
        } catch {}
        return { activos: new Set(), seriales: new Set(), loaded: true };
    }
}

// Migración: guardar exclusions en Firestore para dejar de depender del CSV.
// Usa los sets ya cargados en window.__noUtt.
async function syncNoUttToFirestore() {
    const st = (typeof window !== 'undefined' && window.__noUtt) ? window.__noUtt : null;
    const activos = st && st.activos ? Array.from(st.activos) : [];
    const seriales = st && st.seriales ? Array.from(st.seriales) : [];
    const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const db = (window.db || (mod.getFirestore ? mod.getFirestore() : null));
    if (!db) throw new Error('db_not_ready');
    if (!mod.doc || !mod.setDoc) throw new Error('firestore_sdk_missing');
    const ref = mod.doc(db, 'config', 'no_utt');
    await mod.setDoc(ref, { activos, seriales, updatedAt: mod.serverTimestamp ? mod.serverTimestamp() : undefined }, { merge: true });
    return { ok: true, activos: activos.length, seriales: seriales.length };
}

// Migración (one-shot): leer docs/noutt.csv y sembrar Firestore config/no_utt.
// Esto NO se ejecuta automáticamente: invócalo manualmente desde consola.
async function seedNoUttFromCsvToFirestore() {
    const storageKey = 'pct_no_utt_v1';
    const resp = await fetch('docs/noutt.csv', { cache: 'no-store' });
    if (!resp.ok) throw new Error('no-utt-csv-not-ok');
    const txt = await resp.text();
    const lines = String(txt || '').split(/\r?\n/);
    let idxActivo = -1;
    let idxSerial = -1;
    const activos = new Set();
    const seriales = new Set();
    for (let i = 0; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i] || '');
        const up = cols.map(c => _normNoUttKey(c));
        if (idxActivo < 0 || idxSerial < 0) {
            const a = up.indexOf('ACTIVO');
            const s = up.indexOf('SERIAL');
            if (a >= 0 && s >= 0) {
                idxActivo = a;
                idxSerial = s;
                continue;
            }
            continue;
        }
        const activo = _normNoUttKey(idxActivo >= 0 ? cols[idxActivo] : '');
        const serial = _normNoUttKey(idxSerial >= 0 ? cols[idxSerial] : '');
        if (activo) activos.add(activo);
        if (serial) seriales.add(serial);
    }

    const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const db = (window.db || (mod.getFirestore ? mod.getFirestore() : null));
    if (!db) throw new Error('db_not_ready');
    const ref = mod.doc(db, 'config', 'no_utt');
    await mod.setDoc(ref, {
        activos: Array.from(activos),
        seriales: Array.from(seriales),
        updatedAt: mod.serverTimestamp ? mod.serverTimestamp() : undefined,
        source: 'docs/noutt.csv'
    }, { merge: true });

    // Warm caches
    try {
        localStorage.setItem(storageKey, JSON.stringify({
            activos: Array.from(activos),
            seriales: Array.from(seriales),
        }));
    } catch {}
    try {
        window.__noUtt = window.__noUtt || { activos: new Set(), seriales: new Set(), loaded: false, loading: null };
        window.__noUtt.activos = new Set(Array.from(activos));
        window.__noUtt.seriales = new Set(Array.from(seriales));
        window.__noUtt.loaded = true;
        window.__noUtt.loading = null;
    } catch {}

    return { ok: true, activos: activos.size, seriales: seriales.size };
}

function isNoUttEquipo(activo, serial) {
    try {
        const a = _normNoUttKey(activo);
        const s = _normNoUttKey(serial);
        const st = (typeof window !== 'undefined' && window.__noUtt) ? window.__noUtt : null;
        const setA = st && st.activos ? st.activos : null;
        const setS = st && st.seriales ? st.seriales : null;
        const hasA = (set, v) => !!(v && set && typeof set.has === 'function' && set.has(v));
        // Algunos callers pasan (equipoKey, serialInventario) y el CSV puede listar el equipoKey en "SERIAL".
        // Para evitar falsos negativos, evaluar ambos inputs contra ambos sets.
        return (
            hasA(setA, a) ||
            hasA(setS, a) ||
            hasA(setA, s) ||
            hasA(setS, s)
        );
    } catch {
        return false;
    }
}

if (typeof window !== 'undefined') {
    window.loadNoUttExclusions = window.loadNoUttExclusions || loadNoUttExclusions;
    window.isNoUttEquipo = window.isNoUttEquipo || isNoUttEquipo;
    window.syncNoUttToFirestore = window.syncNoUttToFirestore || syncNoUttToFirestore;
    window.seedNoUttFromCsvToFirestore = window.seedNoUttFromCsvToFirestore || seedNoUttFromCsvToFirestore;
    try { window.loadNoUttExclusions().catch(() => {}); } catch {}
}
