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
            .toUpperCase()
            .replace(/\s+/g, ' ');
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
                const resp = await fetch('docs/noutt.csv', { cache: 'no-store' });
                if (!resp.ok) throw new Error('no-utt-csv-not-ok');
                const txt = await resp.text();
                const lines = String(txt || '').split(/\r?\n/);
                let idxActivo = -1;
                let idxSerial = -1;
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
                    if (!cols || !cols.length) continue;
                    const activo = _normNoUttKey(idxActivo >= 0 ? cols[idxActivo] : '');
                    const serial = _normNoUttKey(idxSerial >= 0 ? cols[idxSerial] : '');
                    if (activo) activos.add(activo);
                    if (serial) seriales.add(serial);
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

function isNoUttEquipo(activo, serial) {
    try {
        const a = _normNoUttKey(activo);
        const s = _normNoUttKey(serial);
        const st = (typeof window !== 'undefined' && window.__noUtt) ? window.__noUtt : null;
        const setA = st && st.activos ? st.activos : null;
        const setS = st && st.seriales ? st.seriales : null;
        const okA = !!(a && setA && typeof setA.has === 'function' && setA.has(a));
        const okS = !!(s && setS && typeof setS.has === 'function' && setS.has(s));
        return okA || okS;
    } catch {
        return false;
    }
}

if (typeof window !== 'undefined') {
    window.loadNoUttExclusions = window.loadNoUttExclusions || loadNoUttExclusions;
    window.isNoUttEquipo = window.isNoUttEquipo || isNoUttEquipo;
    try { window.loadNoUttExclusions().catch(() => {}); } catch {}
}
