// Lógica principal para inspeccion.html (selector de equipo, detalle y guardado de inspecciones)
document.addEventListener('DOMContentLoaded', () => {
    const inputEquipo = document.getElementById('equipo-input');
    const datalistEquipos = document.getElementById('lista-equipos');
    const equipoDropdown = document.getElementById('equipo-dropdown');
    const detalleContenedor = document.getElementById('detalle-equipo-contenido');
    const btnGuardar = document.getElementById('btn-guardar-inspeccion');
    const tipoInspeccionSelect = document.getElementById('inspeccion-tipo');
    const tipoInspeccionChips = Array.from(document.querySelectorAll('.tipo-inspeccion-chip'));

    let isViewMode = false;
    try {
        const paramsUrl = new URLSearchParams(window.location.search || '');
        isViewMode = (paramsUrl.get('view') || '').trim() === '1';
    } catch {}

    if (!inputEquipo || !detalleContenedor) {
        // No estamos en inspeccion.html
        return;
    }

    let equipos = [];
    let headers = [];
    let formatosPorCodigo = {};
    let mapaDanos = []; // [{ match: 'recubrimiento', opciones: [...] }]
    let inventarioCargado = false;
    let formatosCargados = false;
    let equiposActivos = []; // [{ equipoId, descripcion, equipoKey, descKey }]
    let guardandoInspeccion = false; // evita doble guardado
    const fotosTomadas = {}; // idx -> { blob }
    let fotoObs = null; // { blob }

    const isAndroid = (() => {
        try { return /android/i.test(navigator.userAgent || ''); } catch { return false; }
    })();

    const isChromeLike = (() => {
        try { return /(chrome|crios|chromium)/i.test(navigator.userAgent || ''); } catch { return false; }
    })();

    const usarDropdownEquipos = !!(equipoDropdown && inputEquipo && isAndroid && isChromeLike);

    if (usarDropdownEquipos) {
        try { inputEquipo.removeAttribute('list'); } catch {}
        try { if (datalistEquipos) datalistEquipos.style.display = 'none'; } catch {}
    } else {
        // Desktop/otros: usar datalist nativo para sugerencias
        try { if (datalistEquipos) datalistEquipos.style.display = ''; } catch {}
        try { if (datalistEquipos) inputEquipo.setAttribute('list', 'lista-equipos'); } catch {}
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normHeaderKey(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '')
            .trim();
    }

    function findHeaderIndex(headersArr, candidates) {
        try {
            const hs = Array.isArray(headersArr) ? headersArr : [];
            const cands = Array.isArray(candidates) ? candidates : [];
            if (!hs.length || !cands.length) return -1;
            const map = new Map();
            for (let i = 0; i < hs.length; i++) map.set(normHeaderKey(hs[i]), i);
            for (const c of cands) {
                const idx = map.get(normHeaderKey(c));
                if (typeof idx === 'number') return idx;
            }
        } catch {}
        return -1;
    }

    function normFormatoKey(s) {
        try {
            return String(s || '')
                .toUpperCase()
                .replace(/\s+/g, ' ')
                .replace(/\s*\/\s*/g, '/')
                .trim();
        } catch {
            return String(s || '').trim().toUpperCase();
        }
    }

    function findHeaderIndexContains(headersArr, containsAny) {
        try {
            const hs = Array.isArray(headersArr) ? headersArr : [];
            const pats = Array.isArray(containsAny) ? containsAny : [];
            if (!hs.length || !pats.length) return -1;
            const patsNorm = pats.map(normHeaderKey).filter(Boolean);
            for (let i = 0; i < hs.length; i++) {
                const hk = normHeaderKey(hs[i]);
                if (!hk) continue;
                for (const p of patsNorm) {
                    if (p && hk.includes(p)) return i;
                }
            }
        } catch {}
        return -1;
    }

    function getIdxSerial(headersArr) {
        try {
            const hs = Array.isArray(headersArr) ? headersArr : [];
            if (!hs.length) return -1;
            const exact = hs.indexOf('SERIAL');
            if (exact >= 0) return exact;
            const idx = findHeaderIndex(hs, [
                'NO. SERIE',
                'NO SERIE',
                'N° SERIE',
                'NUMERO DE SERIE',
                'NÚMERO DE SERIE',
                'SERIE',
                'SERIAL'
            ]);
            if (idx >= 0) return idx;
            return findHeaderIndexContains(hs, ['serial', 'serie']);
        } catch {}
        return -1;
    }

    function hideEquipoDropdown() {
        if (!equipoDropdown) return;
        equipoDropdown.style.display = 'none';
        equipoDropdown.innerHTML = '';
    }

    function showEquipoDropdown(items) {
        if (!equipoDropdown) return;
        if (!Array.isArray(items) || !items.length) {
            hideEquipoDropdown();
            return;
        }
        equipoDropdown.innerHTML = items
            .map(it => {
                const equipoId = (it && it.equipoId) ? String(it.equipoId) : '';
                const serial = (it && it.serial) ? String(it.serial) : '';
                const safeEquipo = escapeHtml(equipoId);
                const equipoTxt = escapeHtml(equipoId);
                const serialTxt = serial ? escapeHtml(serial) : '';
                const header = serialTxt
                    ? `<div><strong>${equipoTxt}</strong> <span style="margin-left:8px; font-size:0.88em; color:#0f172a;">${serialTxt}</span></div>`
                    : `<div><strong>${equipoTxt}</strong></div>`;
                return `<div class="equipo-dropdown-item" data-equipo="${safeEquipo}">${header}</div>`;
            })
            .join('');
        equipoDropdown.style.display = '';
    }

    function filtrarEquiposActivos(query) {
        const q = String(query || '').trim();
        if (!q) return [];
        const qKey = normKey(q);
        if (!qKey) return [];

        const out = [];
        for (const it of equiposActivos) {
            if (!it) continue;
            if (it.equipoKey && it.equipoKey.includes(qKey)) out.push(it);
            else if (it.descKey && it.descKey.includes(qKey)) out.push(it);
            else if (it.serialKey && it.serialKey.includes(qKey)) out.push(it);
            if (out.length >= 120) break;
        }
        return out;
    }

    if (usarDropdownEquipos) {
        try {
            document.addEventListener('click', (ev) => {
                try {
                    if (!equipoDropdown || !inputEquipo) return;
                    const t = ev && ev.target ? ev.target : null;
                    if (!t) return;
                    if (t === inputEquipo) return;
                    if (equipoDropdown.contains(t)) return;
                    hideEquipoDropdown();
                } catch {}
            });
        } catch {}

        if (equipoDropdown) {
            // Usar mousedown para seleccionar antes de que el input pierda foco
            equipoDropdown.addEventListener('mousedown', (ev) => {
                try {
                    const item = ev && ev.target ? ev.target.closest('.equipo-dropdown-item') : null;
                    if (!item) return;
                    ev.preventDefault();
                    const equipo = item.getAttribute('data-equipo') || '';
                    if (!equipo) return;
                    inputEquipo.value = equipo;
                    hideEquipoDropdown();
                    inputEquipo.dispatchEvent(new Event('change', { bubbles: true }));
                } catch {}
            });
        }

        inputEquipo.addEventListener('focus', () => {
            try {
                const items = filtrarEquiposActivos(inputEquipo.value);
                showEquipoDropdown(items);
            } catch {}
        });

        inputEquipo.addEventListener('input', () => {
            try {
                const items = filtrarEquiposActivos(inputEquipo.value);
                showEquipoDropdown(items);
            } catch {}
        });
    }

    function generarIdLocal(prefix = 'insp') {
        try {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                return `${prefix}_${window.crypto.randomUUID()}`;
            }
        } catch {}
        return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    function leerListaInspeccionesLocal() {
        const clave = 'pct_inspecciones';
        try {
            const raw = JSON.parse(localStorage.getItem(clave) || '[]');
            return Array.isArray(raw) ? raw : [];
        } catch {
            return [];
        }
    }

    function escribirListaInspeccionesLocal(lista) {
        const clave = 'pct_inspecciones';
        try {
            localStorage.setItem(clave, JSON.stringify(Array.isArray(lista) ? lista : []));
        } catch {}
    }

    function patchInspeccionLocalPorId(localId, patch) {
        if (!localId) return;
        const lista = leerListaInspeccionesLocal();
        const idx = lista.findIndex(r => r && (r.localId === localId || r.id === localId));
        if (idx < 0) return;
        lista[idx] = { ...(lista[idx] || {}), ...(patch || {}) };
        escribirListaInspeccionesLocal(lista);
    }

    function asegurarEstilosLoader() {
        try {
            if (document.getElementById('pct-loader-style')) return;
            const st = document.createElement('style');
            st.id = 'pct-loader-style';
            st.textContent = `
                @keyframes pctSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .pct-spinner { display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,0.45); border-top-color: rgba(255,255,255,0.95); border-radius:50%; animation: pctSpin 0.8s linear infinite; vertical-align:middle; margin-right:8px; }
            `;
            document.head.appendChild(st);
        } catch {}
    }

    async function intentarSyncInspeccionesPendientes() {
        try {
            if (!window.auth || !window.auth.currentUser) return;
            if (!window.db) return;
        } catch {
            return;
        }

        const lista = leerListaInspeccionesLocal();
        const pendientes = lista.filter(r => r && r.syncStatus === 'PENDING' && (r.localId || r.id));
        if (!pendientes.length) return;

        try {
            const { getFirestore, doc, setDoc, serverTimestamp } = await import(
                'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
            );
            const db = getFirestore();
            for (const r of pendientes) {
                const localId = String(r.localId || r.id || '').trim();
                if (!localId) continue;
                const payload = { ...r, creadoEn: serverTimestamp(), syncStatus: 'SYNCED' };
                try {
                    await setDoc(doc(db, 'inspecciones', localId), payload, { merge: true });
                    patchInspeccionLocalPorId(localId, { syncStatus: 'SYNCED' });
                } catch {}
            }
        } catch {}
    }

    const normKey = (s) => (s || '').toString().trim().toUpperCase().replace(/[\s\u200B-\u200D\uFEFF]+/g, '');

    async function capturarGpsTexto() {
        try {
            if (!navigator.geolocation) return 'Sin GPS';
            const LS_KEY = 'pct_last_gps_txt';
            const LS_TS_KEY = 'pct_last_gps_ts';
            function toStr(pos) {
                const { latitude, longitude, accuracy } = pos.coords || {};
                return (latitude != null && longitude != null)
                    ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}${accuracy ? ` (±${Math.round(accuracy)}m)` : ''}`
                    : 'Sin GPS';
            }
            const getCached = () => {
                try {
                    const txt = String(localStorage.getItem(LS_KEY) || '').trim();
                    const ts = Number(localStorage.getItem(LS_TS_KEY) || 0);
                    if (!txt || !ts) return '';
                    // Reutilizar último GPS si es relativamente reciente
                    const ageMs = Date.now() - ts;
                    if (ageMs > 12 * 60 * 60 * 1000) return '';
                    return txt;
                } catch {
                    return '';
                }
            };

            const getPosition = () => new Promise(resolve => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const txt = toStr(pos);
                        // Cachear último GPS válido
                        try {
                            if (txt && txt.toUpperCase() !== 'SIN GPS') {
                                localStorage.setItem(LS_KEY, txt);
                                localStorage.setItem(LS_TS_KEY, String(Date.now()));
                            }
                        } catch {}
                        resolve(txt);
                    },
                    (err) => {
                        try {
                            console.warn('Geolocalización falló', { code: err && err.code, message: err && err.message });
                        } catch {}
                        const cached = getCached();
                        resolve(cached || 'Sin GPS');
                    },
                    // iPad/campo: permitir valores cacheados y dar más tiempo
                    { enableHighAccuracy: true, timeout: 60000, maximumAge: 5 * 60 * 1000 }
                );
            });
            try {
                if (navigator.permissions && navigator.permissions.query) {
                    const status = await navigator.permissions.query({ name: 'geolocation' });
                    if (status.state === 'denied') return 'Sin GPS';
                    return await getPosition();
                }
            } catch {}
            return await getPosition();
        } catch {
            return 'Sin GPS';
        }
    }

    async function aplicarInspeccionExistenteSoloLectura() {
        try {
            if (!isViewMode) return;

            const paramsUrl = new URLSearchParams(window.location.search || '');
            const inspIdUrl = (paramsUrl.get('inspId') || '').trim();
            const actividadIdUrl = (paramsUrl.get('actividadId') || '').trim();
            if (!inspIdUrl && !actividadIdUrl) return;

            const esperar = async (cond, msTotal = 6000, paso = 120) => {
                const t0 = Date.now();
                while (Date.now() - t0 < msTotal) {
                    try {
                        if (cond()) return true;
                    } catch {}
                    await new Promise(r => setTimeout(r, paso));
                }
                return false;
            };
            await esperar(() => inventarioCargado && formatosCargados);

            const { getFirestore, doc, getDoc, collection, query, where, getDocs, limit } = await import(
                'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
            );
            const db = getFirestore();

            let insp = null;
            if (inspIdUrl) {
                const ref = doc(db, 'inspecciones', inspIdUrl);
                const snap = await getDoc(ref);
                if (snap.exists()) insp = { id: snap.id, ...snap.data() };
            }
            if (!insp && actividadIdUrl) {
                const colRef = collection(db, 'inspecciones');
                const q = query(colRef, where('actividadId', '==', actividadIdUrl), limit(1));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const d = snap.docs[0];
                    insp = { id: d.id, ...d.data() };
                }
            }
            if (!insp) return;

            // Resolver URLs de evidencias si solo viene evidenciaNombre (para mostrar thumbnails)
            try {
                const params = Array.isArray(insp.parametros) ? insp.parametros : [];
                const needs = params.some(p => p && ((p.evidenciaPath) || (p.evidenciaNombre)) && !p.evidenciaUrl);
                if (needs && insp && insp.id) {
                    const { getStorage, ref: stRef, getDownloadURL } = await import(
                        'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'
                    );
                    const storage = getStorage();
                    const inspId = String(insp.id || '').trim();
                    const actId = String(insp.actividadId || '').trim();
                    const localId = String(insp.localId || '').trim();
                    const inspIdQs = String(inspIdUrl || '').trim();
                    const actIdQs = String(actividadIdUrl || '').trim();
                    const nextParams = await Promise.all(params.map(async (p) => {
                        try {
                            if (!p || p.evidenciaUrl) return p;
                            const candidatos = [];
                            const pathDirecto = String(p.evidenciaPath || '').trim();
                            if (pathDirecto) candidatos.push(pathDirecto);

                            const name = String(p.evidenciaNombre || '').trim();
                            if (name) {
                                if (inspId) candidatos.push(`inspecciones/${inspId}/${name}`);
                                if (localId) candidatos.push(`inspecciones/${localId}/${name}`);
                                if (actId) candidatos.push(`inspecciones/${actId}/${name}`);
                                if (inspIdQs) candidatos.push(`inspecciones/${inspIdQs}/${name}`);
                                if (actIdQs) candidatos.push(`inspecciones/${actIdQs}/${name}`);
                            }

                            if (!candidatos.length) return p;

                            for (let pass = 0; pass < 2; pass++) {
                                for (const path of candidatos) {
                                    try {
                                        const url = await getDownloadURL(stRef(storage, path));
                                        if (url) return { ...(p || {}), evidenciaUrl: url };
                                    } catch (e) {
                                        const code = (e && (e.code || e.name)) ? String(e.code || e.name) : '';
                                        console.warn('No se pudo resolver evidencia desde Storage', { path, code });
                                    }
                                }
                                if (pass === 0) {
                                    await new Promise(r => setTimeout(r, 350));
                                }
                            }
                            return p;
                        } catch (e) {
                            const code = (e && (e.code || e.name)) ? String(e.code || e.name) : '';
                            console.warn('No se pudo resolver evidencia (inesperado)', { code });
                            return p;
                        }
                    }));
                    insp = { ...(insp || {}), parametros: nextParams };
                }
            } catch {}

            const renderDocumento = (data) => {
                try {
                    const panel = document.getElementById('detalle-equipo-contenido');
                    if (!panel) return;

                    const equipo = (data.equipo || '').toString();
                    const serial = (data.serial || '').toString();
                    const cliente = (data.cliente || '').toString();
                    const areaCliente = (data.areaCliente || '').toString();
                    const ubicacion = (data.ubicacion || '').toString();
                    const ubicacionGps = (data.ubicacionGps || '').toString();
                    const usuario = (data.usuarioInspeccion || '').toString();
                    const tipo = (data.tipoInspeccion || '').toString();
                    const fecha = (data.fecha || data.creadoEn || '').toString();

                    const params = Array.isArray(data.parametros) ? data.parametros : [];
                    const ok = (v) => (v == null ? '' : String(v));

                    const blocks = params.map((p) => {
                        const nombre = ok(p && p.nombre);
                        const estado = ok(p && p.estado).toUpperCase();
                        const tipoDano = ok(p && p.tipoDano);
                        const detalleOtro = ok(p && p.detalleOtro);
                        const evidenciaUrl = ok(p && p.evidenciaUrl);
                        const evidenciaNombre = ok(p && p.evidenciaNombre);
                        const evidenciaPath = ok(p && p.evidenciaPath);
                        const danoTxt = (estado === 'MALO') ? (detalleOtro || tipoDano || '') : '';
                        const badge = estado === 'MALO'
                            ? '<span style="display:inline-block; padding:2px 8px; border-radius:999px; background:#fef2f2; border:1px solid #fecaca; color:#991b1b; font-size:12px; font-weight:700;">MALO</span>'
                            : (estado === 'NO LEGIBLE'
                                ? '<span style="display:inline-block; padding:2px 8px; border-radius:999px; background:#fffbeb; border:1px solid #fde68a; color:#92400e; font-size:12px; font-weight:700;">NO LEGIBLE</span>'
                                : '<span style="display:inline-block; padding:2px 8px; border-radius:999px; background:#ecfdf5; border:1px solid #bbf7d0; color:#166534; font-size:12px; font-weight:700;">BUENO</span>');

                        const evidenciaHtml = (evidenciaUrl || evidenciaNombre || evidenciaPath)
                            ? `
                                <div style="margin-top:8px;">
                                    <div style="font-size:12px; color:#475569; margin-bottom:6px;">Evidencia</div>
                                    <img
                                        src="${evidenciaUrl ? evidenciaUrl : ''}"
                                        alt="Evidencia"
                                        class="insp-evid-thumb"
                                        data-full="${evidenciaUrl ? evidenciaUrl : ''}"
                                        data-evidencia-path="${evidenciaPath}"
                                        data-evidencia-nombre="${evidenciaNombre}"
                                        crossorigin="anonymous"
                                        referrerpolicy="no-referrer"
                                        loading="eager"
                                        decoding="sync"
                                        style="max-width:220px; width:100%; height:auto; border-radius:10px; border:1px solid #e5e7eb; cursor:zoom-in; ${evidenciaUrl ? '' : 'display:none;'}"
                                        onerror="try{if(window.__pctEvidFallback){window.__pctEvidFallback(this);} }catch(e){}"
                                    />
                                    <div class="insp-evid-fallback" style="margin-top:6px; font-size:12px; color:#64748b; ${evidenciaUrl ? 'display:none;' : ''}">
                                        ${evidenciaNombre ? `Evidencia: ${evidenciaNombre}` : (evidenciaPath ? 'Evidencia' : '')}
                                    </div>
                                </div>
                              `
                            : '';

                        return `
                            <div style="border:1px solid #e5e7eb; border-radius:12px; padding:12px; background:#ffffff; break-inside:avoid;">
                                <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                                    <div style="font-weight:800; color:#0f172a;">${nombre}</div>
                                    <div>${badge}</div>
                                </div>
                                ${danoTxt ? `<div style="margin-top:6px; font-size:13px; color:#0f172a;"><span style="color:#64748b; font-weight:700;">Hallazgo:</span> ${danoTxt}</div>` : ''}
                                ${evidenciaHtml}
                            </div>
                        `;
                    }).join('');

                    const obsManual = (data.observacionesManual || '').toString().trim();
                    const obsFotoUrl = (data.observacionesFotoUrl || '').toString().trim();
                    const obsFotoPath = (data.observacionesFotoPath || '').toString().trim();
                    const obsFotoNombre = (data.observacionesFotoNombre || '').toString().trim();
                    const obsHtml = (obsManual || obsFotoUrl || obsFotoPath || obsFotoNombre)
                        ? `
                            <div style="margin: 10px 0 12px; border:1px solid #e5e7eb; border-radius:12px; padding:12px; background:#ffffff;">
                                <div style="font-weight:900; color:#0f172a; margin-bottom:6px;">OBSERVACIONES</div>
                                ${obsManual ? `<div style="white-space:pre-wrap; color:#0f172a;">${escapeHtml(obsManual)}</div>` : '<div style="color:#6b7280;">(Sin observaciones)</div>'}
                                ${(obsFotoUrl || obsFotoPath || obsFotoNombre) ? `
                                    <div style="margin-top:8px;">
                                        <img
                                            src="${obsFotoUrl ? obsFotoUrl : ''}"
                                            alt="Foto observaciones"
                                            class="insp-evid-thumb"
                                            data-full="${obsFotoUrl ? obsFotoUrl : ''}"
                                            data-evidencia-path="${escapeHtml(obsFotoPath)}"
                                            data-evidencia-nombre="${escapeHtml(obsFotoNombre)}"
                                            crossorigin="anonymous"
                                            referrerpolicy="no-referrer"
                                            loading="eager"
                                            decoding="sync"
                                            style="max-width:260px; width:100%; height:auto; border-radius:10px; border:1px solid #e5e7eb; cursor:zoom-in; ${obsFotoUrl ? '' : 'display:none;'}"
                                            onerror="try{if(window.__pctEvidFallback){window.__pctEvidFallback(this);} }catch(e){}"
                                        />
                                        <div class="insp-evid-fallback" style="margin-top:6px; font-size:12px; color:#64748b; ${obsFotoUrl ? 'display:none;' : ''}">
                                            ${(obsFotoNombre ? `Evidencia: ${escapeHtml(obsFotoNombre)}` : (obsFotoPath ? 'Evidencia' : ''))}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                          `
                        : '';

                    panel.innerHTML = `
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <img src="img/logopctch.png" alt="PCT" style="height:36px; width:auto;" crossorigin="anonymous" />
                                <div>
                                    <div style="font-weight:900; font-size:16px;">Inspección de equipo</div>
                                    <div style="font-size:12px; color:#64748b;">Documento digital</div>
                                </div>
                            </div>
                            <div style="text-align:right; font-size:12px; color:#334155;">
                                <div><strong>Tipo:</strong> ${tipo}</div>
                                <div><strong>Fecha:</strong> ${fecha}</div>
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:12px;">
                            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:10px 12px;">
                                <div style="font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.06em;">Equipo</div>
                                <div style="font-size:14px; font-weight:900; color:#0f172a; margin-top:2px;">${equipo}</div>
                                ${serial ? `<div style="font-size:12px; color:#475569; margin-top:2px;"><strong>Serial:</strong> ${serial}</div>` : ''}
                            </div>
                            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:10px 12px;">
                                <div style="font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.06em;">Cliente</div>
                                <div style="font-size:14px; font-weight:900; color:#0f172a; margin-top:2px;">${cliente}</div>
                                <div style="font-size:12px; color:#475569; margin-top:2px;">${areaCliente}${ubicacion ? ` · ${ubicacion}` : ''}</div>
                                ${ubicacionGps ? `<div style="font-size:12px; color:#64748b; margin-top:2px;"><strong>GPS:</strong> ${ubicacionGps}</div>` : ''}
                            </div>
                        </div>

                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
                            <span style="display:inline-flex; gap:6px; align-items:center; padding:5px 10px; border-radius:999px; border:1px solid #e2e8f0; background:#fff; font-size:12px; color:#0f172a;"><span style="color:#64748b; text-transform:uppercase; letter-spacing:0.06em; font-size:10px;">Usuario</span><strong>${usuario}</strong></span>
                            ${data.actividadId ? `<span style="display:inline-flex; gap:6px; align-items:center; padding:5px 10px; border-radius:999px; border:1px solid #e2e8f0; background:#fff; font-size:12px; color:#0f172a;"><span style="color:#64748b; text-transform:uppercase; letter-spacing:0.06em; font-size:10px;">Actividad</span><strong>${ok(data.actividadId)}</strong></span>` : ''}
                        </div>

                        ${obsHtml}
                        <div style="font-weight:900; color:#0f172a; margin: 6px 0 8px;">Checklist</div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">${blocks}</div>
                    `;

                    try {
                        panel.dataset.equipo = (equipo || '').toString().trim();
                        panel.dataset.tipo = (tipo || '').toString().trim();
                        panel.dataset.inspId = (data && data.id ? String(data.id) : '').trim();
                        panel.dataset.localId = (data && data.localId ? String(data.localId) : '').trim();
                        panel.dataset.actividadId = (data && data.actividadId ? String(data.actividadId) : '').trim();
                    } catch {}

                    // Lightbox
                    try {
                        const prev = document.getElementById('insp-lightbox');
                        if (prev) prev.remove();
                    } catch {}

                    // Fallback para thumbnails bloqueadas por CORS/403 en localhost: leer bytes vía SDK y usar blob: URL local.
                    // Esto restaura: thumbnail visible, click-to-expand, e inclusión en PDF (html2canvas).
                    window.__pctEvidFallback = async (imgEl) => {
                        try {
                            if (!imgEl) return;
                            if (imgEl.dataset && imgEl.dataset.pctBlobOk === '1') return;

                            const data = (panel && panel.dataset) ? panel.dataset : {};
                            const inspId = String(data.inspId || '').trim();
                            const localId = String(data.localId || '').trim();
                            const actId = String(data.actividadId || '').trim();

                            const pathDirecto = String(imgEl.getAttribute('data-evidencia-path') || '').trim();
                            const nombre = String(imgEl.getAttribute('data-evidencia-nombre') || '').trim();

                            const candidatos = [];
                            if (pathDirecto) candidatos.push(pathDirecto);
                            if (nombre) {
                                if (inspId) candidatos.push(`inspecciones/${inspId}/${nombre}`);
                                if (localId) candidatos.push(`inspecciones/${localId}/${nombre}`);
                                if (actId) candidatos.push(`inspecciones/${actId}/${nombre}`);
                            }
                            if (!candidatos.length) return;

                            const { getStorage, ref: stRef, getBytes } = await import(
                                'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'
                            );
                            const storage = getStorage();

                            let bytes = null;
                            let lastErrCode = '';
                            let lastPath = '';
                            for (const pth of candidatos) {
                                try {
                                    lastPath = pth;
                                    bytes = await getBytes(stRef(storage, pth));
                                    if (bytes) break;
                                } catch (e) {
                                    const code = (e && (e.code || e.name)) ? String(e.code || e.name) : '';
                                    lastErrCode = code;
                                    try {
                                        console.warn('No se pudo cargar evidencia (getBytes)', { path: pth, code });
                                    } catch {}
                                }
                            }
                            if (!bytes) return;

                            const blob = new Blob([bytes], { type: 'image/jpeg' });
                            const blobUrl = URL.createObjectURL(blob);
                            imgEl.src = blobUrl;
                            imgEl.setAttribute('data-full', blobUrl);
                            imgEl.dataset.pctBlobOk = '1';
                            try {
                                const fb = imgEl.parentElement && imgEl.parentElement.querySelector('.insp-evid-fallback');
                                if (fb) fb.style.display = 'none';
                                imgEl.style.display = '';
                            } catch {}
                        } catch {}
                    };

                    const lb = document.createElement('div');
                    lb.id = 'insp-lightbox';
                    lb.style.cssText = 'position:fixed; inset:0; background:rgba(15,23,42,0.75); display:none; align-items:center; justify-content:center; z-index:10000; padding:18px;';
                    lb.innerHTML = `
                        <div style="background:#fff; border-radius:14px; max-width:1100px; width:100%; max-height:92vh; overflow:auto; box-shadow:0 18px 50px rgba(0,0,0,0.35);">
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-bottom:1px solid #e5e7eb;">
                                <div style="font-weight:900; color:#0f172a;">Evidencia</div>
                                <div style="display:flex; gap:8px;">
                                    <a id="insp-lightbox-open" href="#" target="_blank" rel="noopener" style="padding:6px 10px; border:1px solid #d1d5db; border-radius:10px; text-decoration:none; color:#0f172a; background:#fff; font-weight:700; font-size:12px;">Abrir</a>
                                    <button id="insp-lightbox-close" type="button" style="padding:6px 10px; border:1px solid #d1d5db; border-radius:10px; background:#0f172a; color:#fff; font-weight:800; font-size:12px; cursor:pointer;">Cerrar</button>
                                </div>
                            </div>
                            <div style="padding:12px;">
                                <img id="insp-lightbox-img" alt="Evidencia" style="max-width:100%; height:auto; border-radius:12px; border:1px solid #e5e7eb;" />
                                <div style="margin-top:8px; font-size:12px; color:#64748b;">Tip: en iPad puedes hacer zoom con gesto de pellizco. También puedes usar “Abrir”.</div>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(lb);
                    const btnClose = lb.querySelector('#insp-lightbox-close');
                    const openA = lb.querySelector('#insp-lightbox-open');
                    const img = lb.querySelector('#insp-lightbox-img');
                    if (btnClose) btnClose.addEventListener('click', () => { lb.style.display = 'none'; });
                    lb.addEventListener('click', (ev) => {
                        if (ev.target === lb) lb.style.display = 'none';
                    });
                    panel.querySelectorAll('.insp-evid-thumb').forEach(el => {
                        el.addEventListener('click', () => {
                            const url = el.getAttribute('data-full') || el.getAttribute('src') || '';
                            if (!url) return;
                            if (openA) openA.href = url;
                            if (img) img.src = url;
                            lb.style.display = 'flex';
                        });

                        // Si ya viene rota por CORS/403, disparar fallback inmediatamente
                        try {
                            const src = String(el.getAttribute('src') || '').trim();
                            if (src && /^https?:\/\//i.test(src) && el.naturalWidth === 0) {
                                window.__pctEvidFallback(el);
                            }
                        } catch {}
                    });

                    // Si no había evidenciaUrl (o está bloqueada), intentar poblarla vía SDK inmediatamente
                    try {
                        panel.querySelectorAll('.insp-evid-thumb').forEach(el => {
                            const src = String(el.getAttribute('src') || '').trim();
                            if (!src || (/^https?:\/\//i.test(src) && el.naturalWidth === 0)) {
                                window.__pctEvidFallback(el);
                            }
                        });
                    } catch {}
                } catch {}
            };

            // Render documento (visor) y salir temprano para evitar lógica de formulario
            try { renderDocumento(insp); } catch {}

            // Sincronizar valores a los inputs (la exportación valida contra estos)
            try {
                const equipo = (insp && insp.equipo ? String(insp.equipo) : '').trim();
                if (equipo) inputEquipo.value = equipo;
            } catch {}
            try {
                const selTipo = document.getElementById('inspeccion-tipo');
                const tipo = (insp && insp.tipoInspeccion ? String(insp.tipoInspeccion) : '').trim();
                if (selTipo && tipo) selTipo.value = tipo;
            } catch {}

            // Deshabilitar edición, permitir exportación
            try {
                const selTipo = document.getElementById('inspeccion-tipo');
                if (selTipo) selTipo.disabled = true;
                try { inputEquipo.disabled = true; } catch {}
                if (btnGuardar) {
                    btnGuardar.disabled = true;
                    btnGuardar.style.display = 'none';
                }
            } catch {}

            return;
        } catch (e) {
            console.warn('No se pudo aplicar modo solo lectura', e);
        }
    }

    const claveEstadoOverride = 'pct_invre_estado_override';
    let mapaEstadoOverride = {};
    try {
        const crudo = localStorage.getItem(claveEstadoOverride) || '{}';
        const parsed = JSON.parse(crudo);
        if (parsed && typeof parsed === 'object') {
            const normalizado = {};
            Object.entries(parsed).forEach(([k, v]) => {
                const kk = normKey(k);
                if (kk) normalizado[kk] = v;
            });
            mapaEstadoOverride = normalizado;
        }
    } catch {
        mapaEstadoOverride = {};
    }

    (async () => {
        try {
            if (window.db) {
                const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
                const db = getFirestore();
                const colRef = collection(db, 'inventarioEstados');
                const snap = await getDocs(colRef);
                snap.forEach(docSnap => {
                    const data = docSnap.data() || {};
                    const equipoId = docSnap.id || data.equipoId || '';
                    let edo = (data.edo || '').toString().trim().toUpperCase();
                    if (!edo) edo = 'ON';
                    const k = normKey(equipoId);
                    if (k) {
                        mapaEstadoOverride[k] = edo;
                    }
                });
                try {
                    localStorage.setItem(claveEstadoOverride, JSON.stringify(mapaEstadoOverride));
                } catch (e) {
                    console.warn('No se pudo cachear overrides de estado desde Firestore (inspeccion)', e);
                }
            }
        } catch (e) {
            console.warn('No se pudieron cargar estados de inventario desde Firestore (inspeccion)', e);
        }
    })();

    try { window.addEventListener('online', () => { intentarSyncInspeccionesPendientes(); }); } catch {}
    try {
        setTimeout(() => {
            intentarSyncInspeccionesPendientes();
        }, 1200);
    } catch {}

    async function obtenerEstadoPruebasPorEquipo(equipoId) {
        if (!equipoId) return null;

        const claveLocal = 'pct_pruebas';
        let pruebas = [];

        function hoySinHora() {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            return d;
        }

        function parseProxima(str) {
            if (!str) return null;

            const s = String(str).trim();
            if (!s) return null;

            // Preferir formatos no ambiguos
            // 1) ISO: YYYY-MM-DD
            const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (mIso) {
                const y = parseInt(mIso[1], 10);
                const mo = parseInt(mIso[2], 10);
                const d = parseInt(mIso[3], 10);
                if (!y || !mo || !d) return null;
                const dt = new Date(y, mo - 1, d);
                dt.setHours(0, 0, 0, 0);
                return isNaN(dt.getTime()) ? null : dt;
            }

            // 2) Regla del sistema: DD/MM/YY o DD/MM/YYYY
            const partes = s.split('/');
            if (partes.length === 3) {
                const [ddStr, mmStr, aaStr] = partes;
                const dd = parseInt(ddStr, 10);
                const mm = parseInt(mmStr, 10);
                const aa = parseInt(aaStr, 10);
                if (!dd || !mm || isNaN(aa)) return null;
                const year = aa < 100 ? 2000 + aa : aa;
                const dt = new Date(year, mm - 1, dd);
                dt.setHours(0, 0, 0, 0);
                return isNaN(dt.getTime()) ? null : dt;
            }

            // 3) Fallback: intentar Date.parse solo si no hay separadores tipo DD/MM
            // (evita que 01/08/2026 se interprete como MM/DD/YYYY)
            if (!s.includes('/')) {
                const dt = new Date(s);
                if (!isNaN(dt.getTime())) {
                    dt.setHours(0, 0, 0, 0);
                    return dt;
                }
            }

            return null;
        }

        function parseFechaRealizacion(str) {
            if (!str) return null;
            const partes = String(str).split('/');
            if (partes.length !== 3) return null;
            const [ddStr, mmStr, aaStr] = partes;
            const dd = parseInt(ddStr, 10);
            const mm = parseInt(mmStr, 10);
            const aa = parseInt(aaStr, 10);
            if (!dd || !mm || isNaN(aa)) return null;
            const year = aa < 100 ? 2000 + aa : aa;
            const d = new Date(year, mm - 1, dd);
            return isNaN(d.getTime()) ? null : d;
        }

        function clasificar(reg) {
            const proxima = parseProxima(reg.proxima || '');
            if (!proxima) return { estado: 'SIN_FECHA', proxima: null };
            const hoy = hoySinHora();
            if (proxima < hoy) return { estado: 'VENCIDA', proxima };
            return { estado: 'VIGENTE', proxima };
        }

        async function leerDesdeFirestore() {
            try {
                if (!window.db) return null;
                const { getFirestore, collection, query, where, getDocs } = await import(
                    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                );

                const db = getFirestore();
                const colRef = collection(db, 'pruebas');
                // Intento 1: coincidencia exacta
                const qExact = query(colRef, where('equipo', '==', equipoId));
                let snap = await getDocs(qExact);
                let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                if (rows && rows.length) return rows;

                // Fallback: cargar todas y filtrar por normalización (trim + case-insensitive)
                snap = await getDocs(colRef);
                const norm = (s) => (s || '').toString().trim().toUpperCase();
                const target = norm(equipoId);
                rows = snap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(r => norm(r.equipo) === target);
                return rows;
            } catch (e) {
                console.warn('No se pudieron leer pruebas desde Firestore (inspeccion)', e);
                return null;
            }
        }

        const desdeFs = await leerDesdeFirestore();
        if (desdeFs && Array.isArray(desdeFs)) {
            pruebas = desdeFs;
        } else {
            try {
                const crudo = JSON.parse(localStorage.getItem(claveLocal) || '[]');
                if (Array.isArray(crudo)) {
                    pruebas = crudo.filter(r => (r.equipo || '') === equipoId);
                }
            } catch {
                pruebas = [];
            }
        }

        if (!pruebas.length) return null;

        const enriquecidas = pruebas.map(reg => {
            const c = clasificar(reg);
            const fReal = parseFechaRealizacion(reg.fechaRealizacion || '') || hoySinHora();
            return { ...reg, _clasif: c, _fechaReal: fReal };
        });

        // Última prueba por fecha de realización
        enriquecidas.sort((a, b) => b._fechaReal.getTime() - a._fechaReal.getTime());
        const ultima = enriquecidas[0];

        const total = enriquecidas.length;
        const vigentes = enriquecidas.filter(r => r._clasif.estado === 'VIGENTE').length;
        const vencidas = enriquecidas.filter(r => r._clasif.estado === 'VENCIDA').length;

        return {
            total,
            vigentes,
            vencidas,
            ultima,
        };
    }

    async function mostrarEstadoPruebasEnDetalle(equipoId) {
        const panelDetalle = document.getElementById('detalle-equipo');
        if (!panelDetalle) return;

        let panelEstado = document.getElementById('panel-estado-pruebas');
        if (!panelEstado) {
            panelEstado = document.createElement('div');
            panelEstado.id = 'panel-estado-pruebas';
            panelEstado.style.marginTop = '0.75rem';
            panelEstado.style.padding = '0.6rem 0.75rem';
            panelEstado.style.borderRadius = '0.75rem';
            panelEstado.style.border = '1px solid #e5e7eb';
            panelEstado.style.fontSize = '0.85rem';
            panelEstado.style.display = 'none';
            panelDetalle.appendChild(panelEstado);
        }

        if (!equipoId) {
            panelEstado.style.display = 'none';
            return;
        }

        panelEstado.style.display = 'block';
        panelEstado.style.background = '#f9fafb';
        panelEstado.style.borderColor = '#e5e7eb';
        panelEstado.style.color = '#374151';
        panelEstado.textContent = 'Consultando estado de pruebas...';

        const info = await obtenerEstadoPruebasPorEquipo(equipoId);
        if (!info) {
            panelEstado.style.display = 'block';
            panelEstado.style.background = '#fef2f2';
            panelEstado.style.borderColor = '#fecaca';
            panelEstado.style.color = '#b91c1c';
            panelEstado.textContent = 'Sin pruebas registradas para este equipo.';
            return;
        }

        const { total, vigentes, vencidas, ultima } = info;
        const estado = ultima._clasif.estado;

        if (estado === 'VIGENTE') {
            panelEstado.style.background = '#ecfdf5';
            panelEstado.style.borderColor = '#22c55e';
            panelEstado.style.color = '#166534';
        } else if (estado === 'VENCIDA') {
            panelEstado.style.background = '#fef2f2';
            panelEstado.style.borderColor = '#fecaca';
            panelEstado.style.color = '#b91c1c';
        } else {
            panelEstado.style.background = '#f9fafb';
            panelEstado.style.borderColor = '#e5e7eb';
            panelEstado.style.color = '#374151';
        }

        const proximaTxt = ultima.proxima || '';
        const resTxt = ultima.resultado || '';
        const noRep = ultima.noReporte || '';

        panelEstado.innerHTML = `
            <div style="font-weight:600; margin-bottom:0.15rem;">Estado de pruebas para el equipo ${equipoId}</div>
            <div style="margin-bottom:0.1rem;">
                Última prueba: <strong>${ultima.fechaRealizacion || ultima.fechaPrueba || ''}</strong>
                ${resTxt ? ` · Resultado: <strong>${resTxt}</strong>` : ''}
            </div>
            <div style="margin-bottom:0.1rem;">
                Próxima prueba: <strong>${proximaTxt || 'Sin fecha'}</strong>
                ${estado === 'VIGENTE' ? ' (vigente)' : estado === 'VENCIDA' ? ' (vencida)' : ''}
            </div>
            <div style="margin-bottom:0.1rem;">
                Total registradas: <strong>${total}</strong>
                · Vigentes: <strong>${vigentes}</strong>
                · Vencidas: <strong>${vencidas}</strong>
            </div>
            ${noRep ? `<div>No. reporte / cert.: <strong>${noRep}</strong></div>` : ''}
        `;
    }

    async function inicializarDesdeActividadUrl() {
        // Solo intentamos cuando inventario y formatos estén listos
        if (!inventarioCargado || !formatosCargados) return;

        try {
            const paramsUrl = new URLSearchParams(window.location.search || '');
            const actividadIdUrl = paramsUrl.get('actividadId');
            if (!actividadIdUrl) return;

            const { getFirestore, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
            const db = getFirestore();
            const ref = doc(db, 'actividades', actividadIdUrl);
            const snap = await getDoc(ref);
            if (!snap.exists()) return;

            const data = snap.data() || {};
            let codigoEquipo = '';
            if (Array.isArray(data.equipos) && data.equipos.length) {
                codigoEquipo = data.equipos[0] || '';
            } else if (data.equipo) {
                codigoEquipo = data.equipo || '';
            }

            if (!codigoEquipo) return;

            inputEquipo.value = codigoEquipo;
            // Mostrar ficha y parámetros para ese equipo
            actualizarDetalleDesdeInput();
        } catch (e) {
            console.warn('No se pudo inicializar inspección desde actividadId en URL', e);
        }
    }

    async function aplicarInspeccionExistenteAutoPdf() {
        try {
            const paramsUrl = new URLSearchParams(window.location.search || '');
            const autoPdf = (paramsUrl.get('autoPdf') || '').trim();
            if (autoPdf !== '1') return;

            const autoClose = (paramsUrl.get('autoClose') || '').trim();

            // Esperar a que inventario y formatos estén listos para que se rendericen los parámetros
            const esperar = async (cond, msTotal = 6000, paso = 120) => {
                const t0 = Date.now();
                while (Date.now() - t0 < msTotal) {
                    try {
                        if (cond()) return true;
                    } catch {}
                    await new Promise(r => setTimeout(r, paso));
                }
                return false;
            };

            await esperar(() => inventarioCargado && formatosCargados);

            const inspIdUrl = (paramsUrl.get('inspId') || '').trim();
            const actividadIdUrl = (paramsUrl.get('actividadId') || '').trim();
            if (!inspIdUrl && !actividadIdUrl) return;

            const { getFirestore, doc, getDoc, collection, query, where, getDocs, limit } = await import(
                'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
            );
            const db = getFirestore();

            let insp = null;
            if (inspIdUrl) {
                const ref = doc(db, 'inspecciones', inspIdUrl);
                const snap = await getDoc(ref);
                if (snap.exists()) insp = { id: snap.id, ...snap.data() };
            }

            if (!insp && actividadIdUrl) {
                const colRef = collection(db, 'inspecciones');
                const q = query(colRef, where('actividadId', '==', actividadIdUrl), limit(1));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const d = snap.docs[0];
                    insp = { id: d.id, ...d.data() };
                }
            }

            if (!insp) return;

            // Asegurar que el equipo esté seleccionado y renderizado
            let equipo = (insp.equipo || '').toString().trim();
            if (!equipo && actividadIdUrl) {
                try {
                    const actRef = doc(db, 'actividades', actividadIdUrl);
                    const actSnap = await getDoc(actRef);
                    if (actSnap.exists()) {
                        const act = actSnap.data() || {};
                        if (Array.isArray(act.equipos) && act.equipos.length) {
                            equipo = String(act.equipos[0] || '').trim();
                        } else if (act.equipo) {
                            equipo = String(act.equipo || '').trim();
                        }
                    }
                } catch (e) {
                    console.warn('No se pudo resolver equipo desde actividad para autoPdf', e);
                }
            }
            if (equipo) {
                inputEquipo.value = equipo;
                actualizarDetalleDesdeInput();
            }

            // Aplicar tipo de inspección si existe
            try {
                const selTipo = document.getElementById('inspeccion-tipo');
                if (selTipo && insp.tipoInspeccion) {
                    selTipo.value = String(insp.tipoInspeccion).trim();
                    selTipo.dispatchEvent(new Event('change'));
                }
            } catch {}

            await esperar(() => {
                const panel = document.getElementById('detalle-equipo-contenido');
                return !!(panel && panel.querySelector('.parametros-inspeccion'));
            });

            // Rellenar estados guardados
            try {
                const params = Array.isArray(insp.parametros) ? insp.parametros : [];
                params.forEach((p, idx) => {
                    const estado = (p && p.estado) ? String(p.estado) : '';
                    const tipoDano = (p && p.tipoDano) ? String(p.tipoDano) : '';
                    const detalleOtro = (p && p.detalleOtro) ? String(p.detalleOtro) : '';
                    const selEstado = document.querySelector(`select[name="param-${idx}-estado"]`);
                    if (selEstado && estado) {
                        selEstado.value = estado;
                        selEstado.dispatchEvent(new Event('change'));
                    }
                    const selTipo = document.querySelector(`select[name="param-${idx}-tipo-dano"]`);
                    if (selTipo && tipoDano) {
                        selTipo.value = tipoDano;
                        selTipo.dispatchEvent(new Event('change'));
                    }
                    const inpOtro = document.querySelector(`input[name="param-${idx}-detalle-otro"]`);
                    if (inpOtro && detalleOtro) {
                        inpOtro.value = detalleOtro;
                        inpOtro.dispatchEvent(new Event('input'));
                    }
                });
            } catch {}

            // Disparar exportación PDF automática
            await new Promise(r => setTimeout(r, 250));
            const btnPdf = document.getElementById('btn-exportar-jpg');
            if (btnPdf) btnPdf.click();

            // Intentar cerrar la pestaña solo si se solicita explícitamente (puede cancelar la descarga en Safari/iPad)
            if (autoClose === '1') {
                await new Promise(r => setTimeout(r, 8000));
                try { window.close(); } catch {}
            }
        } catch (e) {
            console.warn('No se pudo ejecutar autoPdf', e);
        }
    }

    // Cargar inventario de equipos
    fetch('docs/invre.csv')
        .then(response => {
            if (!response.ok) {
                throw new Error('No se pudo cargar invre.csv');
            }
            return response.text();
        })
        .then(texto => {
            const lineas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
            if (lineas.length === 0) return;

            headers = parseCSVLine(lineas[0]);
            const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
            const idxDescripcion = headers.indexOf('DESCRIPCION');
            const idxEdo = headers.indexOf('EDO');
            const idxSerial = getIdxSerial(headers);

            equipos = lineas.slice(1).map(linea => parseCSVLine(linea));

            // Poblar datalist (usar overrides de estado; solo equipos con estado efectivo ON)
            equiposActivos = [];
            equipos.forEach(cols => {
                const equipoId = idxEquipo >= 0 ? (cols[idxEquipo] || '') : '';
                const equipoIdKey = normKey(equipoId);
                const descripcion = idxDescripcion >= 0 ? (cols[idxDescripcion] || '') : '';
                const serial = idxSerial >= 0 ? (cols[idxSerial] || '') : '';
                const edo = idxEdo >= 0 ? (cols[idxEdo] || '') : '';
                if (!equipoIdKey) return;
                let edoEfectivo = edo.trim().toUpperCase();
                const override = mapaEstadoOverride[equipoIdKey];
                if (override) edoEfectivo = String(override).trim().toUpperCase();
                if (edoEfectivo !== 'ON' && edoEfectivo !== 'ACTIVO') return;

                equiposActivos.push({
                    equipoId: (equipoId || '').toString().trim(),
                    descripcion: (descripcion || '').toString().trim(),
                    serial: (serial || '').toString().trim(),
                    equipoKey: equipoIdKey,
                    descKey: normKey(descripcion),
                    serialKey: normKey(serial)
                });

                if (datalistEquipos) {
                    const option = document.createElement('option');
                    option.value = (equipoId || '').toString().trim();
                    option.label = (serial || '').toString().trim() || (descripcion || '').toString().trim();
                    datalistEquipos.appendChild(option);
                }
            });

            inventarioCargado = true;
            // Intentar inicializar desde actividadId si aplica
            inicializarDesdeActividadUrl();
            // Intentar auto-PDF si viene en la URL (usa la inspección existente)
            aplicarInspeccionExistenteAutoPdf();
            // Solo lectura (si viene view=1)
            aplicarInspeccionExistenteSoloLectura();
        })
        .catch(err => {
            console.error(err);
            alert('Error al cargar el inventario.');
        });

    // Cargar formatos de inspección
    fetch('docs/forxmat.csv')
        .then(response => {
            if (!response.ok) {
                throw new Error('No se pudo cargar forxmat.csv');
            }
            return response.text();
        })
        .then(texto => {
            const lineas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
            let formatoActual = '';

            Object.keys(formatosPorCodigo).forEach(k => delete formatosPorCodigo[k]);
            formatosPorCodigo = {};

            lineas.forEach(linea => {
                const cols = parseCSVLine(linea);
                const nombre = (cols[0] || '').toString().trim();
                if (!nombre) return;

                // Encabezado de formato: en forxmat.csv los bloques empiezan con algo como 'PCT-FR-...'
                if (/^PCT\b/i.test(nombre)) {
                    formatoActual = nombre;
                    if (!formatosPorCodigo[formatoActual]) {
                        formatosPorCodigo[formatoActual] = [];
                    }

                    // También indexar por clave normalizada para tolerar variantes (p.ej. DSA/SSA)
                    const kNorm = normFormatoKey(formatoActual);
                    if (kNorm && kNorm !== formatoActual && !formatosPorCodigo[kNorm]) {
                        formatosPorCodigo[kNorm] = formatosPorCodigo[formatoActual];
                    }
                    return;
                }

                // Parámetro dentro del formato actual
                if (formatoActual && formatosPorCodigo[formatoActual]) {
                    formatosPorCodigo[formatoActual].push(nombre);
                }
            });

            formatosCargados = true;
            // Intentar auto-PDF si viene en la URL (por si el inventario ya cargó antes)
            aplicarInspeccionExistenteAutoPdf();
            // Solo lectura (si viene view=1)
            aplicarInspeccionExistenteSoloLectura();
        })
        .catch(err => {
            console.error(err);
        });

    // Cargar catálogo de daños (solo para diagnóstico de cobertura inicialmente)
    fetch('docs/danos.csv')
        .then(r => r.ok ? r.text() : Promise.reject(new Error('No se pudo cargar danos.csv')))
        .then(txt => {
            const lineas = txt.split(/\r?\n/).filter(l => l.trim() !== '');
            if (lineas.length <= 1) return;
            const header = parseCSVLine(lineas[0]).map(h => (h || '').toLowerCase().trim());
            const idxParam = header.indexOf('parametro');
            const idxOpc = header.indexOf('opciones');
            if (idxParam < 0 || idxOpc < 0) return;
            const normalize = (s) => (s || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim();
            mapaDanos = lineas.slice(1)
                .map(l => parseCSVLine(l))
                .map(cols => {
                    const m = normalize(cols[idxParam] || '');
                    const opciones = String(cols[idxOpc] || '')
                        .split('|').map(x => x.trim()).filter(Boolean);
                    return m ? { match: m, opciones } : null;
                })
                .filter(Boolean);
        })
        .catch(err => {
            console.warn('No se pudo cargar docs/danos.csv para diagnóstico', err);
        });
    
    // Cuando el usuario escribe y elige un equipo en el input/datalist
    function actualizarDetalleDesdeInput() {
        const valor = inputEquipo.value.trim();
        if (!valor) {
            detalleContenedor.innerHTML = '<p>Seleccione un equipo para ver su información.</p>';
            if (btnGuardar) btnGuardar.disabled = true;
            mostrarEstadoPruebasEnDetalle('');
            return;
        }

        const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
        const idxReporte = headers.indexOf('REPORTE P/P');
        const idxSerial = getIdxSerial(headers);
        const norm = (s) => (s || '').toString().trim().toUpperCase().replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
        const target = norm(valor);

        let fila = equipos.find(cols => idxEquipo >= 0 && norm(cols[idxEquipo]) === target);
        if (!fila && idxSerial >= 0) {
            const matchSerial = (s) => {
                const a = norm(s);
                if (!a) return false;
                if (a === target) return true;
                // Permitir buscar por serial sin prefijo PCT-
                const aNoPct = a.replace(/^PCT-/, '');
                const tNoPct = target.replace(/^PCT-/, '');
                if (aNoPct && aNoPct === tNoPct) return true;
                // Si el usuario pega solo la parte final del serial
                if (tNoPct && aNoPct.endsWith(tNoPct)) return true;
                return false;
            };

            const filaPorSerial = equipos.find(cols => matchSerial(cols[idxSerial] || ''));
            if (filaPorSerial) {
                fila = filaPorSerial;
                try {
                    const equipoDetectado = idxEquipo >= 0 ? (fila[idxEquipo] || '') : '';
                    if (equipoDetectado) inputEquipo.value = equipoDetectado;
                } catch {}
            }
        }
        if (!fila) {
            detalleContenedor.innerHTML = '<p>No se encontró información para el equipo seleccionado.</p>';
            if (btnGuardar) btnGuardar.disabled = true;
            mostrarEstadoPruebasEnDetalle(valor);
            return;
        }

        // Índices de columnas relevantes
        const idxProducto = headers.indexOf('PRODUCTO');
        const idxDescripcion = headers.indexOf('DESCRIPCION');
        const idxDiam1 = headers.indexOf('DIAMETRO 1');
        const idxTipo1 = headers.indexOf('TIPO 1');
        const idxCon1 = headers.indexOf('CONEXIÓN 1');
        const idxPres1 = headers.indexOf('PRESION 1');
        const idxX1 = headers.indexOf('X 1');
        const idxServicio = headers.indexOf('SERVICIO');
        const idxAL = headers.indexOf('A / L');
        const idxTemp = headers.indexOf('TEMP');
        const idxTipoEquipo = headers.indexOf('TIPO EQUIPO');
        const idxAcero = headers.indexOf('ACERO');

        const get = (idx) => (idx >= 0 && idx < fila.length ? fila[idx] : '');

        const reporte = get(idxReporte);
        const reporteNorm = normFormatoKey(reporte);
        const formatoLista = (reporte && formatosPorCodigo[reporte])
            ? formatosPorCodigo[reporte]
            : (reporteNorm && formatosPorCodigo[reporteNorm])
                ? formatosPorCodigo[reporteNorm]
                : null;
        const parametrosBrutos = Array.isArray(formatoLista)
            ? formatoLista.filter(p => p && p.length > 0)
            : [];

        // Parámetros que ya están autocompletados en la ficha del equipo y no deben inspeccionarse
        const nombresAuto = ['activo', 'serial', 'descripción', 'descripcion', 'diámetro', 'diametro', 'conexión', 'conexion', 'longitud'];

        // Filtrar automáticos y eliminar duplicados por nombre normalizado
        const normDedupeKey = (s) => (s || '')
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
        const vistos = new Set();
        const parametrosInspeccion = parametrosBrutos.filter(p => {
            const base = normDedupeKey(p);
            if (!base) return false;
            if (nombresAuto.some(auto => base.startsWith(auto))) return false;
            if (vistos.has(base)) return false;
            vistos.add(base);
            return true;
        });

        // Duplicar 'Área de sellado' -> 'Área de sellado A' y 'Área de sellado B' para productos aplicables (CA, CE, DSA, Brida de paso)
        const productoStr = (get(idxProducto) || '').toString().toUpperCase();
        const equipoStr = String(valor || '').toUpperCase();
        const descripcionStr = (get(idxDescripcion) || '').toString().toUpperCase();
        const textoEquipo = `${productoStr} ${equipoStr} ${descripcionStr}`;
        const esTee = /\bTEE\b|TEES/.test(textoEquipo);
        const aplicaCaraAB = !esTee && /CARRETE ADAPTADOR|CARRETE ESPACIADOR|BRIDA ADAPTADORA|BRIDA DE PASO|\bXO\b|\bDSA\b|\bSSA\b/.test(
            textoEquipo
        );
        const normParam = (s) => (s || '')
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
        const parametrosRender = (() => {
            if (!esTee && !aplicaCaraAB) return parametrosInspeccion.slice();

            const tipoTeeRaw = (get(idxTipo1) || '').toString().toUpperCase().trim();
            const teeLados = /^[A-Z]{3}$/.test(tipoTeeRaw) ? tipoTeeRaw.split('') : ['1', '2', '3'];

            // Normalizar detección de parámetros base
            const isAreaSellado = (np) => np.startsWith('area de sellado');
            const isEsparragosTuercas = (np) => {
                if (!np) return false;
                if (np.includes('esparragos') && np.includes('tuercas')) return true;
                if (np.startsWith('esparragosytuercas')) return true;
                if (np.includes('esparragosytuercas')) return true;
                return false;
            };

            // Para equipos A/B: intercalar Área de sellado y Espárragos/Tuercas como A luego B
            if (aplicaCaraAB) {
                const resto = [];
                let tieneSellado = false;
                let tieneEsp = false;

                parametrosInspeccion.forEach(p => {
                    const np = normParam(p);
                    if (isAreaSellado(np)) {
                        tieneSellado = true;
                        return;
                    }
                    if (isEsparragosTuercas(np)) {
                        tieneEsp = true;
                        return;
                    }
                    resto.push(p);
                });

                const out = [];
                if (tieneSellado) out.push('Área de sellado A');
                if (tieneEsp) out.push('Espárragos y tuercas A');
                if (tieneSellado) out.push('Área de sellado B');
                if (tieneEsp) out.push('Espárragos y tuercas B');
                return out.concat(resto);
            }

            // TEES: 3 lados desde el tipo (p.ej. HMH)
            const out = [];
            parametrosInspeccion.forEach(p => {
                const np = normParam(p);
                if (isAreaSellado(np)) {
                    out.push(`Área de sellado 1 (${teeLados[0] || '1'})`);
                    out.push(`Área de sellado 2 (${teeLados[1] || '2'})`);
                    out.push(`Área de sellado 3 (${teeLados[2] || '3'})`);
                    return;
                }
                out.push(p);
            });
            return out;
        })();

        // Diagnóstico: detectar parámetros sin match en danos.csv (normalizado)
        (function diagnosticarCoberturaDanos() {
            if (!Array.isArray(mapaDanos) || !mapaDanos.length) return;
            const normalize = (s) => (s || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim();
            const faltantes = [];
            parametrosRender.forEach(p => {
                const np = normalize(p);
                // Ignorar Fleje (sin catálogo por diseño)
                if (np.includes('fleje')) return;
                const tiene = mapaDanos.some(row => np.includes(row.match));
                if (!tiene) faltantes.push(p);
            });
            if (faltantes.length) {
                console.warn('[danos.csv] Parámetros sin match:', faltantes);
            }
        })();

        // Catálogos de tipo de daño según el nombre del parámetro
        function obtenerTiposDano(nombreParametro) {
            const base = (nombreParametro || '').toLowerCase();

            // Fleje: usar BUENO/MALO y si es MALO, permitir seleccionar tipo de daño
            if (base.includes('fleje')) {
                return [
                    '',
                    'DEFORMADO',
                    'NO LEGIBLE',
                    'SIN FLEJE'
                ];
            }

            // Estado del Elastómero
            if (base.includes('elastómero') || base.includes('elastomero')) {
                return [
                    '',
                    'SIN ELASTOMERO',
                    'DEFORMADO',
                    'CORTADO',
                    'RESECO',
                    'DEGRADADO',
                    'HINCHADO',
                    'OTRO'
                ];
            }

            // Recubrimiento (según catálogo proporcionado)
            if (base.includes('recubrimiento')) {
                return [
                    '',
                    'DESPRENDIDO',
                    'AMPOLLADO',
                    'CORROSION',
                    'OXIDACION',
                    'DEGRADADO',
                    'ABRASION',
                    'OTRO'
                ];
            }

            // Cuerpo
            if (base.includes('cuerpo')) {
                return [
                    '',
                    'GOLPE',
                    'DEFORMACION',
                    'ABRASION',
                    'LAVADURA',
                    'CORTADO',
                    'OTRO'
                ];
            }

            // Área de sellado, rosca, puerto, espárragos
            if (
                base.includes('área de sellado') || base.includes('area de sellado') ||
                base.includes('rosca') ||
                base.includes('estado del puerto') ||
                base.includes('esparragos') || base.includes('espárragos') || base.includes('esparragos')
            ) {
                return [
                    '',
                    'GOLPE',
                    'DEFORMACION',
                    'ABRASION',
                    'LAVADURA',
                    'CORTADO',
                    'OTRO'
                ];
            }

            // Anillo retenedor, insertos, mariposa, piñón
            if (
                base.includes('anillo retenedor') ||
                base.includes('insertos') ||
                base.includes('mariposa') ||
                base.includes('piñón') || base.includes('piñon') || base.includes('pinon')
            ) {
                return [
                    '',
                    'GOLPE',
                    'DEFORMACION',
                    'ABRASION',
                    'LAVADURA',
                    'CORTADO',
                    'OTRO'
                ];
            }

            // Default para otros parámetros de inspección
            return [
                '',
                'GOLPE',
                'DEFORMACION',
                'ABRASION',
                'LAVADURA',
                'CORTADO',
                'OTRO'
            ];
        }

        const parametrosHtml = parametrosRender.length
            ? `
                <div class="parametros-inspeccion">
                    <h3>Parámetros de inspección (${reporte})</h3>
                    <div class="parametros-tabla">
                        <div class="parametros-header">
                            <div class="col-nombre">Parámetro</div>
                            <div class="col-estado">Estado</div>
                            <div class="col-dano">Tipo de daño</div>
                            <div class="col-evidencia">Evidencia</div>
                        </div>
                        ${parametrosRender.map((p, idx) => {
                            const baseNombre = (p || '').toLowerCase();
                            // Caso especial: Recubrimiento no lleva selector de daños, solo BUENO/MALO
                            if (baseNombre.includes('recubrimiento')) {
                                return `
                            <div class="parametros-fila">
                                <div class="col-nombre">${p}</div>
                                <div class="col-estado">
                                    <div class="estado-switch" data-param-idx="${idx}">
                                        <input type="checkbox" class="estado-switch-input" aria-label="Estado malo" data-idx="${idx}">
                                        <span class="estado-switch-track" aria-hidden="true"></span>
                                        <span class="estado-switch-label estado-switch-label-bueno">BUENO</span>
                                        <span class="estado-switch-label estado-switch-label-malo">MALO</span>
                                    </div>
                                    <div class="estado-radios" style="display:none;">
                                        <label><input type="radio" name="param-${idx}-estado" value="BUENO" checked> BUENO</label>
                                        <label><input type="radio" name="param-${idx}-estado" value="MALO"> MALO</label>
                                    </div>
                                </div>
                                <div class="col-dano" data-param-idx="${idx}" style="display:none;"></div>
                                <div class="col-evidencia" data-param-idx="${idx}" style="display:none;">
                                    <button type="button" class="btn btn-tomar-foto" data-idx="${idx}">Tomar foto</button>
                                    <button type="button" class="btn btn-subir-foto" data-idx="${idx}">Subir foto</button>
                                    <input type="file" name="param-${idx}-foto" accept="image/*" style="display:none;">
                                    <img alt="preview" id="preview-foto-${idx}" style="display:none; max-height:64px; border-radius:6px; margin-top:4px; border:1px solid #e5e7eb;" />
                                </div>
                            </div>
                        `;
                            }

                            const tiposDano = obtenerTiposDano(p);
                            return `
                            <div class="parametros-fila">
                                <div class="col-nombre">${p}</div>
                                <div class="col-estado">
                                    <div class="estado-switch" data-param-idx="${idx}">
                                        <input type="checkbox" class="estado-switch-input" aria-label="Estado malo" data-idx="${idx}">
                                        <span class="estado-switch-track" aria-hidden="true"></span>
                                        <span class="estado-switch-label estado-switch-label-bueno">BUENO</span>
                                        <span class="estado-switch-label estado-switch-label-malo">MALO</span>
                                    </div>
                                    <div class="estado-radios" style="display:none;">
                                        <label><input type="radio" name="param-${idx}-estado" value="BUENO" checked> BUENO</label>
                                        <label><input type="radio" name="param-${idx}-estado" value="MALO"> MALO</label>
                                    </div>
                                </div>
                                <div class="col-dano" data-param-idx="${idx}" style="display:none;">
                                    <div class="dano-chips" role="group" aria-label="Tipos de daño">
                                        ${tiposDano.filter(op => !!op).map(op => `<button type="button" class="dano-chip" data-val="${op}" disabled>${op}</button>`).join('')}
                                    </div>
                                    <select name="param-${idx}-dano" disabled style="display:none;">
                                        ${tiposDano.map(op => op ? `<option value="${op}">${op}</option>` : '<option value="">Daños</option>').join('')}
                                    </select>
                                    <input type="text" name="param-${idx}-dano-otro" placeholder="Describa el hallazgo" style="display:none; margin-top:0.25rem; font-size:0.8rem; width:100%;" disabled>
                                </div>
                                <div class="col-evidencia" data-param-idx="${idx}" style="display:none;">
                                    <button type="button" class="btn btn-tomar-foto" data-idx="${idx}">Tomar foto</button>
                                    <button type="button" class="btn btn-subir-foto" data-idx="${idx}">Subir foto</button>
                                    <input type="file" name="param-${idx}-foto" accept="image/*" style="display:none;">
                                    <img alt="preview" id="preview-foto-${idx}" style="display:none; max-height:64px; border-radius:6px; margin-top:4px; border:1px solid #e5e7eb;" />
                                </div>
                            </div>
                        `;
                        }).join('')}
                    </div>
                </div>
            `
            : '';

        detalleContenedor.innerHTML = `
            <div class="detalle-grid">
                <div class="detalle-item">
                    <div class="detalle-item-label">Equipo / activo</div>
                    <div class="detalle-item-valor">${get(idxEquipo)}</div>
                </div>
                <div class="detalle-item">
                    <div class="detalle-item-label">Producto</div>
                    <div class="detalle-item-valor">${get(idxProducto)}</div>
                </div>
                <div class="detalle-item">
                    <div class="detalle-item-label">Serial</div>
                    <div class="detalle-item-valor">${get(idxSerial)}</div>
                </div>
                <div class="detalle-item" style="grid-column: 1 / -1;">
                    <div class="detalle-item-label">Descripción</div>
                    <div class="detalle-item-valor">${get(idxDescripcion)}</div>
                </div>
                <div class="detalle-item">
                    <div class="detalle-item-label">Diámetro 1</div>
                    <div class="detalle-item-valor">${get(idxDiam1)}</div>
                </div>
                <div class="detalle-item">
                    <div class="detalle-item-label">Tipo 1</div>
                    <div class="detalle-item-valor">${get(idxTipo1)}</div>
                </div>
                <div class="detalle-item">
                    <div class="detalle-item-label">Conexión 1</div>
                    <div class="detalle-item-valor">${get(idxCon1)}</div>
                </div>
                <div class="detalle-item">
                    <div class="detalle-item-label">Presión 1</div>
                    <div class="detalle-item-valor">${get(idxPres1)}</div>
                </div>
                <div class="detalle-item">
                    <div class="detalle-item-label">Longitud (X1)</div>
                    <div class="detalle-item-valor">${get(idxX1)}</div>
                </div>
                <div class="detalle-item">
                    <div class="detalle-item-label">Servicio</div>
                    <div class="detalle-item-valor">${get(idxServicio)}</div>
                </div>
                <div class="detalle-item">
                    <div class="detalle-item-label">A / L</div>
                    <div class="detalle-item-valor">${get(idxAL)}</div>
                </div>
                <div class="detalle-item">
                    <div class="detalle-item-label">Temperatura</div>
                    <div class="detalle-item-valor">${get(idxTemp)}</div>
                </div>
                <div class="detalle-item">
                    <div class="detalle-item-label">Tipo de equipo</div>
                    <div class="detalle-item-valor">${get(idxTipoEquipo)}</div>
                </div>
                <div class="detalle-item">
                    <div class="detalle-item-label">Acero</div>
                    <div class="detalle-item-valor">${get(idxAcero)}</div>
                </div>
            </div>
            ${parametrosHtml}
            <div class="insp-observaciones" style="margin-top:14px; border:1px solid #e5e7eb; border-radius:12px; padding:12px; background:#ffffff;">
                <h3 style="margin:0 0 8px; font-size:1rem;">OBSERVACIONES</h3>
                <textarea id="insp-obs-text" rows="3" placeholder="Escribe observaciones generales (opcional)" style="width:100%; resize:vertical; padding:0.6rem; border:1px solid #e5e7eb; border-radius:10px; font-size:0.9rem;"></textarea>
                <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:10px;">
                    <button type="button" class="btn" id="insp-obs-tomar-foto">Tomar foto</button>
                    <button type="button" class="btn" id="insp-obs-subir-foto">Subir foto</button>
                    <input type="file" id="insp-obs-foto" accept="image/*" style="display:none;">
                </div>
                <img alt="preview" id="insp-obs-preview" style="display:none; max-height:96px; border-radius:10px; margin-top:8px; border:1px solid #e5e7eb;" />
            </div>
        `;

        try { fotoObs = null; } catch {}
        try {
            const btnTomarObs = document.getElementById('insp-obs-tomar-foto');
            const btnSubirObs = document.getElementById('insp-obs-subir-foto');
            const inputObsFoto = document.getElementById('insp-obs-foto');
            const imgObsPrev = document.getElementById('insp-obs-preview');

            if (btnTomarObs) {
                btnTomarObs.addEventListener('click', async () => {
                    try {
                        await abrirCamaraParaIndice(-1, (blob) => {
                            fotoObs = { blob };
                            try { if (inputObsFoto) inputObsFoto.value = ''; } catch {}
                            if (imgObsPrev) {
                                imgObsPrev.src = URL.createObjectURL(blob);
                                imgObsPrev.style.display = '';
                            }
                        });
                    } catch (e) {
                        console.warn('No se pudo capturar foto (observaciones)', e);
                    }
                });
            }

            if (btnSubirObs && inputObsFoto) {
                btnSubirObs.addEventListener('click', () => {
                    try { inputObsFoto.click(); } catch {}
                });
            }

            if (inputObsFoto) {
                inputObsFoto.addEventListener('change', () => {
                    try {
                        const file = inputObsFoto.files && inputObsFoto.files[0] ? inputObsFoto.files[0] : null;
                        if (!file) return;
                        fotoObs = null;
                        if (imgObsPrev) {
                            imgObsPrev.src = URL.createObjectURL(file);
                            imgObsPrev.style.display = '';
                        }
                    } catch (e) {
                        console.warn('No se pudo leer la foto seleccionada (observaciones)', e);
                    }
                });
            }
        } catch {}

        // Mostrar selector de daño y evidencia solo cuando el estado sea MALO
        detalleContenedor.querySelectorAll('.parametros-fila').forEach((filaHtml, idx) => {
            const radios = filaHtml.querySelectorAll(`input[name="param-${idx}-estado"]`);
            const estadoSwitch = filaHtml.querySelector('.estado-switch-input');
            const colDano = filaHtml.querySelector('.col-dano');
            const selectDano = colDano ? colDano.querySelector('select') : null;
            const danoChips = colDano ? colDano.querySelector('.dano-chips') : null;
            const danoChipBtns = danoChips ? Array.from(danoChips.querySelectorAll('.dano-chip')) : [];
            const inputOtro = colDano ? colDano.querySelector(`input[name="param-${idx}-dano-otro"]`) : null;
            const colEvid = filaHtml.querySelector('.col-evidencia');
            const inputFoto = colEvid ? colEvid.querySelector(`input[name="param-${idx}-foto"]`) : null;
            const btnTomar = colEvid ? colEvid.querySelector('.btn-tomar-foto') : null;
            const btnSubir = colEvid ? colEvid.querySelector('.btn-subir-foto') : null;
            const imgPrev = document.getElementById(`preview-foto-${idx}`);

            const getEstadoActual = () => {
                let estado = '';
                radios.forEach(r => { if (r.checked) estado = r.value; });
                return String(estado || '').trim().toUpperCase();
            };

            const syncSwitchDesdeRadios = () => {
                if (!estadoSwitch) return;
                estadoSwitch.checked = getEstadoActual() === 'MALO';
            };

            const setEstadoDesdeSwitch = () => {
                if (!estadoSwitch) return;
                const esMalo = !!estadoSwitch.checked;
                radios.forEach(r => {
                    if (String(r.value || '').toUpperCase() === (esMalo ? 'MALO' : 'BUENO')) {
                        r.checked = true;
                    }
                });
            };

            const actualizarSeleccionChips = () => {
                if (!selectDano || !danoChipBtns.length) return;
                const val = (selectDano.value || '').trim().toUpperCase();
                danoChipBtns.forEach(btn => {
                    const btnVal = (btn.getAttribute('data-val') || '').trim().toUpperCase();
                    if (val && btnVal === val) btn.classList.add('is-selected');
                    else btn.classList.remove('is-selected');
                });
            };

            const setTipoDanoDesdeChip = (val) => {
                if (!selectDano) return;
                selectDano.value = val;
                actualizarSeleccionChips();
                actualizarVisibilidadOtro();
            };

            const actualizarVisibilidadOtro = () => {
                if (!selectDano || !inputOtro) return;
                const val = (selectDano.value || '').trim().toUpperCase();
                if (val === 'OTRO') {
                    inputOtro.style.display = '';
                    inputOtro.disabled = false;
                } else {
                    inputOtro.style.display = 'none';
                    inputOtro.disabled = true;
                    inputOtro.value = '';
                }
            };

            const actualizarVisibilidadDano = () => {
                let estado = '';
                radios.forEach(r => { if (r.checked) estado = r.value; });
                if (estado === 'MALO') {
                    if (colDano) colDano.style.display = '';
                    if (selectDano) {
                        selectDano.disabled = false;
                        actualizarVisibilidadOtro();
                    }
                    if (danoChipBtns.length) {
                        danoChipBtns.forEach(b => { b.disabled = false; });
                        actualizarSeleccionChips();
                    }
                    if (colEvid) {
                        colEvid.style.display = '';
                        if (inputFoto) inputFoto.disabled = false;
                        if (btnTomar) btnTomar.disabled = false;
                        if (btnSubir) btnSubir.disabled = false;
                    }
                } else {
                    if (colDano) colDano.style.display = 'none';
                    if (selectDano) {
                        selectDano.disabled = true;
                        selectDano.value = '';
                    }
                    if (danoChipBtns.length) {
                        danoChipBtns.forEach(b => { b.disabled = true; b.classList.remove('is-selected'); });
                    }
                    if (inputOtro) {
                        inputOtro.style.display = 'none';
                        inputOtro.disabled = true;
                        inputOtro.value = '';
                    }
                    if (colEvid) {
                        colEvid.style.display = 'none';
                        if (inputFoto) { inputFoto.disabled = true; try { inputFoto.value = ''; } catch {} }
                        if (btnTomar) btnTomar.disabled = true;
                        if (btnSubir) btnSubir.disabled = true;
                        if (imgPrev) { imgPrev.src = ''; imgPrev.style.display = 'none'; }
                        delete fotosTomadas[idx];
                    }
                }
            };

            radios.forEach(r => {
                r.addEventListener('change', actualizarVisibilidadDano);
                r.addEventListener('change', syncSwitchDesdeRadios);
            });

            if (estadoSwitch) {
                estadoSwitch.addEventListener('change', () => {
                    setEstadoDesdeSwitch();
                    syncSwitchDesdeRadios();
                    actualizarVisibilidadDano();
                });
                syncSwitchDesdeRadios();
            }

            if (selectDano) {
                selectDano.addEventListener('change', actualizarVisibilidadOtro);
                selectDano.addEventListener('change', actualizarSeleccionChips);
            }

            if (danoChipBtns.length) {
                danoChipBtns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const val = btn.getAttribute('data-val') || '';
                        setTipoDanoDesdeChip(val);
                    });
                });
            }

            actualizarVisibilidadDano();

            // Handler para tomar foto con cámara
            if (btnTomar) {
                btnTomar.addEventListener('click', async () => {
                    try {
                        await abrirCamaraParaIndice(idx, (blob) => {
                            fotosTomadas[idx] = { blob };
                            try { if (inputFoto) inputFoto.value = ''; } catch {}
                            if (imgPrev) {
                                imgPrev.src = URL.createObjectURL(blob);
                                imgPrev.style.display = '';
                            }
                        });
                    } catch (e) {
                        console.warn('No se pudo capturar foto', e);
                    }
                });
            }

            // Handler para subir foto desde galería / archivos
            if (btnSubir && inputFoto) {
                btnSubir.addEventListener('click', () => {
                    try { inputFoto.click(); } catch {}
                });
            }
            if (inputFoto) {
                inputFoto.addEventListener('change', () => {
                    try {
                        const file = inputFoto.files && inputFoto.files[0] ? inputFoto.files[0] : null;
                        if (!file) return;
                        delete fotosTomadas[idx];
                        if (imgPrev) {
                            imgPrev.src = URL.createObjectURL(file);
                            imgPrev.style.display = '';
                        }
                    } catch (e) {
                        console.warn('No se pudo leer la foto seleccionada', e);
                    }
                });
            }
        });

        // Función para abrir la cámara y capturar una foto
        async function abrirCamaraParaIndice(idx, onCapture) {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert('La cámara no está disponible en este dispositivo/navegador.');
                throw new Error('getUserMedia no soportado');
            }
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;';
            const box = document.createElement('div');
            box.style.cssText = 'background:#fff;padding:12px;border-radius:10px;max-width:90vw;width:520px;';
            const video = document.createElement('video');
            video.autoplay = true; video.playsInline = true;
            video.style.cssText = 'width:100%;border-radius:8px;background:#000;';
            const ctrls = document.createElement('div');
            ctrls.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px;';
            const btnSwitch = document.createElement('button');
            btnSwitch.textContent = 'Cambiar cámara';
            btnSwitch.style.display = 'none';
            const btnCancel = document.createElement('button'); btnCancel.textContent = 'Cancelar';
            const btnSnap = document.createElement('button'); btnSnap.textContent = 'Capturar';
            ctrls.appendChild(btnSwitch); ctrls.appendChild(btnCancel); ctrls.appendChild(btnSnap);
            box.appendChild(video); box.appendChild(ctrls); overlay.appendChild(box); document.body.appendChild(overlay);

            let currentFacing = 'environment'; // 'environment' (trasera) | 'user' (frontal)
            let currentStream = null;
            let videoInputs = [];
            let currentDeviceId = '';

            async function refreshDevices() {
                try {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    videoInputs = (devices || []).filter(d => d && d.kind === 'videoinput');
                } catch {
                    videoInputs = [];
                }
                btnSwitch.style.display = videoInputs.length >= 2 ? '' : 'none';
            }

            function pickPreferredDeviceId(facing) {
                try {
                    if (!videoInputs || !videoInputs.length) return '';
                    const wantEnv = String(facing || '').toLowerCase() === 'environment';
                    const reBack = /(back|rear|environment|traser)/i;
                    const reFront = /(front|user|frontal)/i;
                    const byLabel = (d) => String(d && d.label ? d.label : '');

                    const labeled = videoInputs.filter(d => byLabel(d));
                    const list = labeled.length ? labeled : videoInputs;

                    if (wantEnv) {
                        const hit = list.find(d => reBack.test(byLabel(d)));
                        if (hit && hit.deviceId) return hit.deviceId;
                        // Heurística: muchas veces la trasera es la última
                        const last = list[list.length - 1];
                        return last && last.deviceId ? last.deviceId : '';
                    }

                    const hit = list.find(d => reFront.test(byLabel(d)));
                    if (hit && hit.deviceId) return hit.deviceId;
                    const first = list[0];
                    return first && first.deviceId ? first.deviceId : '';
                } catch {
                    return '';
                }
            }

            function nextDeviceId() {
                try {
                    if (!videoInputs || videoInputs.length < 2) return '';
                    const ids = videoInputs.map(d => d.deviceId).filter(Boolean);
                    if (!ids.length) return '';
                    const idx = currentDeviceId ? ids.indexOf(currentDeviceId) : -1;
                    const next = ids[(idx + 1 + ids.length) % ids.length];
                    return next || '';
                } catch {
                    return '';
                }
            }

            function stopStream() {
                try {
                    if (currentStream) currentStream.getTracks().forEach(t => t.stop());
                } catch {}
                currentStream = null;
            }

            async function startStream() {
                stopStream();
                // En iOS/Safari: primero intentar deviceId explícito (si está disponible)
                const preferredId = currentDeviceId || pickPreferredDeviceId(currentFacing);
                let constraints = {
                    audio: false,
                    video: {
                        facingMode: { ideal: currentFacing },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                };
                if (preferredId) {
                    constraints = {
                        audio: false,
                        video: {
                            deviceId: { exact: preferredId },
                            width: { ideal: 1280 },
                            height: { ideal: 720 }
                        }
                    };
                }

                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                video.srcObject = currentStream;
                try { await video.play(); } catch {}

                // Después de permisos, ahora sí suelen aparecer labels. Refrescar lista y deviceId actual.
                try {
                    await refreshDevices();
                    const track = currentStream && currentStream.getVideoTracks ? currentStream.getVideoTracks()[0] : null;
                    const settings = track && track.getSettings ? track.getSettings() : null;
                    const did = settings && settings.deviceId ? String(settings.deviceId) : '';
                    if (did) currentDeviceId = did;
                } catch {}
            }

            await refreshDevices();
            try {
                await startStream();
            } catch (e) {
                // Fallback: si falla, intentar sin facingMode (algunos devices fallan constraints)
                try {
                    stopStream();
                    currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                    video.srcObject = currentStream;
                    try { await video.play(); } catch {}
                } catch {
                    throw e;
                }
            }

            function stop() { stopStream(); document.body.removeChild(overlay); }
            btnCancel.onclick = () => stop();
            btnSwitch.onclick = async () => {
                // Preferir alternar por deviceId (más confiable que facingMode en iOS)
                const nxt = nextDeviceId();
                if (nxt) {
                    currentDeviceId = nxt;
                    // Best-effort: inferir facing por label
                    try {
                        const dev = videoInputs.find(d => d.deviceId === nxt);
                        const label = String(dev && dev.label ? dev.label : '');
                        if (/(back|rear|environment|traser)/i.test(label)) currentFacing = 'environment';
                        else if (/(front|user|frontal)/i.test(label)) currentFacing = 'user';
                        else currentFacing = (currentFacing === 'environment' ? 'user' : 'environment');
                    } catch {
                        currentFacing = (currentFacing === 'environment' ? 'user' : 'environment');
                    }
                } else {
                    currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
                    currentDeviceId = '';
                }
                try {
                    await startStream();
                } catch (e) {
                    console.warn('No se pudo cambiar de cámara', e);
                }
            };
            btnSnap.onclick = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob((blob) => { if (blob) onCapture(blob); stop(); }, 'image/jpeg', 0.9);
                } catch { stop(); }
            };
        }

        if (btnGuardar) btnGuardar.disabled = false;

        // Mostrar estado de pruebas/calibraciones para este equipo
        mostrarEstadoPruebasEnDetalle(valor);
    }

    inputEquipo.addEventListener('change', actualizarDetalleDesdeInput);
    inputEquipo.addEventListener('blur', actualizarDetalleDesdeInput);

    // Exportar ejemplo JPG del panel de detalle (sin guardar en base de datos)
    const btnExportarJpg = document.getElementById('btn-exportar-jpg');
    if (btnExportarJpg) {
        btnExportarJpg.addEventListener('click', async () => {
            try {
                let equipoSel = (document.getElementById('equipo-input')?.value || '').trim();
                const panel = document.getElementById('detalle-equipo-contenido');
                if (!equipoSel && panel && panel.dataset && panel.dataset.equipo) {
                    equipoSel = String(panel.dataset.equipo || '').trim();
                    try {
                        if (equipoSel) {
                            const equipoInput = document.getElementById('equipo-input');
                            if (equipoInput) equipoInput.value = equipoSel;
                        }
                    } catch {}
                }
                if (!equipoSel) { alert('Selecciona un equipo antes de exportar.'); return; }

                let tipoSelVal = (document.getElementById('inspeccion-tipo')?.value || '').trim();
                if (!tipoSelVal && panel && panel.dataset && panel.dataset.tipo) {
                    tipoSelVal = String(panel.dataset.tipo || '').trim();
                    try {
                        const sel = document.getElementById('inspeccion-tipo');
                        if (sel && tipoSelVal) sel.value = tipoSelVal;
                    } catch {}
                }
                if (!tipoSelVal) { alert('Selecciona el Tipo de inspección antes de exportar.'); return; }
                if (!panel) return;
                // Verificar que haya parámetros renderizados
                if (!panel.querySelector('.parametros-inspeccion')) {
                    // En modo view=1 se renderiza el documento digital (checklist) y no existe el bloque
                    // .parametros-inspeccion del modo editable. En ese caso, exportamos tal cual lo mostrado.
                    if (!isViewMode) {
                        alert('Primero genera la inspección del equipo (parámetros) para exportar el ejemplo.');
                        return;
                    }
                }
                // Cargar html2canvas si no está presente
                async function ensureHtml2Canvas() {
                    if (window.html2canvas) return;
                    await new Promise((resolve, reject) => {
                        const s = document.createElement('script');
                        s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
                        s.onload = resolve;
                        s.onerror = reject;
                        document.head.appendChild(s);
                    });
                }

                async function ensureJsPDF() {
                    if (window.jspdf && window.jspdf.jsPDF) return;
                    await new Promise((resolve, reject) => {
                        const s = document.createElement('script');
                        s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
                        s.onload = resolve;
                        s.onerror = reject;
                        document.head.appendChild(s);
                    });
                }

                await ensureHtml2Canvas();

                // Construir un wrapper temporal con encabezado (usuario, fecha/hora, ubicación) + contenido de inspección
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'background:#ffffff; color:#111827; padding:24px; width:794px; min-width:794px; max-width:none; font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu;';

                const logoWrap = document.createElement('div');
                logoWrap.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:10px;';
                const logo = document.createElement('img');
                logo.src = 'img/logopctch.png';
                logo.alt = 'PCT';
                logo.style.cssText = 'height:40px; width:auto; display:block;';
                logo.crossOrigin = 'anonymous';
                logoWrap.appendChild(logo);

                const headerRight = document.createElement('div');
                headerRight.style.cssText = 'text-align:right; line-height:1.2;';
                headerRight.innerHTML = `
                    <div style="font-weight:700; font-size:14px; letter-spacing:0.2px;">PCT</div>
                    <div style="font-size:11px; color:#6b7280;">Reporte de inspección</div>
                `;
                logoWrap.appendChild(headerRight);
                wrapper.appendChild(logoWrap);

                const titleBar = document.createElement('div');
                titleBar.style.cssText = 'border-top:2px solid #111827; border-bottom:1px solid #e5e7eb; padding:10px 0; margin-bottom:12px;';
                titleBar.innerHTML = `
                    <div style="font-size:16px; font-weight:800;">REPORTE DE INSPECCIÓN</div>
                    <div style="font-size:12px; color:#4b5563; margin-top:2px;">Formato de evidencia y control de condición del equipo</div>
                `;
                wrapper.appendChild(titleBar);

                await new Promise((resolve) => {
                    try {
                        if (logo.complete) { resolve(); return; }
                        logo.onload = () => resolve();
                        logo.onerror = () => resolve();
                    } catch {
                        resolve();
                    }
                });

                const encabezado = document.createElement('div');
                encabezado.style.cssText = 'font-size:12px; margin-bottom:12px; border:1px solid #e5e7eb; border-radius:10px; padding:12px; background:#f9fafb;';

                // Datos de encabezado
                const ahora = new Date();
                const dd = String(ahora.getDate()).padStart(2, '0');
                const mm = String(ahora.getMonth() + 1).padStart(2, '0');
                const yy = String(ahora.getFullYear()).slice(-2);
                const HH = String(ahora.getHours()).padStart(2, '0');
                const MM = String(ahora.getMinutes()).padStart(2, '0');
                const fechaSafe = `${dd}-${mm}-${yy}`;
                const horaSafe = `${HH}:${MM}`;
                const equipo = equipoSel || 'SIN_EQUIPO';
                const tipoInspeccionSel = (document.getElementById('inspeccion-tipo')?.value || '').toString();
                let usuario = '';
                try { usuario = (window.auth?.currentUser?.email || '').toLowerCase(); } catch {}

                // Calcular resultado (sin guardar): si existe al menos un parámetro en MALO => NO APROBADA
                let totalParametros = 0;
                let totalMalos = 0;
                const listaMalos = [];
                try {
                    const filasO = panel.querySelectorAll('.parametros-fila');
                    totalParametros = filasO.length;
                    filasO.forEach((fila, i) => {
                        const nombre = fila.querySelector('.col-nombre')?.textContent?.trim() || `Parámetro ${i + 1}`;
                        const sel = fila.querySelector(`input[name="param-${i}-estado"]:checked`);
                        const estado = sel ? String(sel.value || '').toUpperCase() : '';
                        if (estado === 'MALO') {
                            totalMalos += 1;
                            listaMalos.push(nombre);
                        }
                    });
                } catch {}
                const resultadoInspeccion = totalMalos > 0 ? 'NO APROBADA' : 'APROBADA';
                const colorResultado = totalMalos > 0 ? '#b91c1c' : '#166534';
                const bgResultado = totalMalos > 0 ? '#fef2f2' : '#ecfdf5';

                // Capturar geolocalización: esperar a que el usuario autorice o rechace
                const gps = await capturarGpsTexto();

                const obsManualPdf = (document.getElementById('insp-obs-text')?.value || '').toString().trim();
                const inputObsPdf = document.getElementById('insp-obs-foto');
                const obsFotoPdf = (fotoObs && fotoObs.blob) ? fotoObs.blob : (inputObsPdf && inputObsPdf.files && inputObsPdf.files[0] ? inputObsPdf.files[0] : null);

                encabezado.innerHTML = `
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px 16px; align-items:start;">
                        <div>
                            <div style="margin-bottom:8px;">
                                <span style="display:inline-block; padding:6px 10px; border-radius:999px; border:1px solid #e5e7eb; background:${bgResultado}; color:${colorResultado}; font-weight:800; letter-spacing:0.2px;">
                                    RESULTADO: ${resultadoInspeccion}
                                </span>
                            </div>
                            <div style="margin-bottom:4px;"><strong>Equipo:</strong> ${equipo}</div>
                            ${tipoInspeccionSel ? `<div style="margin-bottom:4px;"><strong>Tipo de inspección:</strong> ${tipoInspeccionSel}</div>` : ''}
                            <div><strong>Ubicación:</strong> ${gps}</div>
                            <div style="margin-top:8px; color:#6b7280; font-size:11px; line-height:1.35;">
                                <strong>Criterio:</strong> Si existe al menos 1 parámetro en <strong>MALO</strong>, la inspección se considera <strong>NO APROBADA</strong>.
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="margin-bottom:4px;"><strong>Fecha:</strong> ${dd}/${mm}/20${yy}</div>
                            <div style="margin-bottom:4px;"><strong>Hora:</strong> ${horaSafe} hrs</div>
                            ${usuario ? `<div><strong>Usuario:</strong> ${usuario}</div>` : ''}
                            <div style="margin-top:8px; font-size:11px; color:#4b5563;">
                                <div><strong>Parámetros:</strong> ${totalParametros}</div>
                                <div><strong>En MALO:</strong> ${totalMalos}</div>
                                ${totalMalos > 0 ? `<div style="margin-top:4px; color:#991b1b;"><strong>Hallazgos:</strong> ${listaMalos.slice(0, 6).join(', ')}${listaMalos.length > 6 ? '…' : ''}</div>` : ''}
                            </div>
                        </div>
                    </div>
                `;

                if (obsManualPdf || obsFotoPdf) {
                    const obsWrap = document.createElement('div');
                    obsWrap.style.cssText = 'margin-top:10px; padding-top:10px; border-top:1px solid #e5e7eb;';
                    obsWrap.innerHTML = `
                        <div style="font-weight:800; color:#111827; margin-bottom:6px;">OBSERVACIONES</div>
                        ${obsManualPdf ? `<div style="white-space:pre-wrap; color:#111827;">${escapeHtml(obsManualPdf)}</div>` : '<div style="color:#6b7280;">(Sin observaciones)</div>'}
                    `;
                    if (obsFotoPdf) {
                        try {
                            const url = URL.createObjectURL(obsFotoPdf);
                            const img = document.createElement('img');
                            img.src = url;
                            img.alt = 'Foto observaciones';
                            img.style.cssText = 'display:block; margin-top:8px; max-height:140px; border-radius:10px; border:1px solid #e5e7eb;';
                            obsWrap.appendChild(img);
                        } catch {}
                    }
                    encabezado.appendChild(obsWrap);
                }

                const contenidoClonado = panel.cloneNode(true);
                contenidoClonado.style.backgroundColor = '#ffffff';
                contenidoClonado.style.overflow = 'visible';

                // Las observaciones se renderizan en el encabezado del PDF; evitar duplicarlas abajo.
                try {
                    const obsForm = contenidoClonado.querySelector('.insp-observaciones');
                    if (obsForm && obsForm.parentNode) obsForm.parentNode.removeChild(obsForm);
                } catch {}

                // Asegurar que la tabla de parámetros se renderice completa (sin scroll) en el PDF
                try {
                    const contParams = contenidoClonado.querySelector('.parametros-inspeccion');
                    if (contParams) {
                        contParams.style.maxHeight = 'none';
                        contParams.style.overflow = 'visible';
                    }
                } catch {}

                // Normalizar contenido para testimonio: mostrar estados/daños como texto y ocultar controles de evidencia
                try {
                    const filasOriginal = panel.querySelectorAll('.parametros-fila');
                    const filasClon = contenidoClonado.querySelectorAll('.parametros-fila');
                    // Quitar columna 'Evidencia' del header en el clon
                    const headerClon = contenidoClonado.querySelector('.parametros-header');
                    if (headerClon) {
                        const evidHead = headerClon.querySelector('.col-evidencia');
                        if (evidHead && evidHead.parentNode) evidHead.parentNode.removeChild(evidHead);
                    }
                    filasClon.forEach((filaC, i) => {
                        const filaO = filasOriginal[i];
                        if (!filaO) return;
                        // Estado seleccionado
                        const estadoSel = filaO.querySelector(`input[name="param-${i}-estado"]:checked`);
                        const estadoVal = estadoSel ? String(estadoSel.value || '').toUpperCase() : '';
                        const colEstadoC = filaC.querySelector('.col-estado');
                        if (colEstadoC) {
                            colEstadoC.innerHTML = estadoVal || '';
                        }
                        // Tipo de daño seleccionado y detalle 'OTRO'
                        const selDanoO = filaO.querySelector(`select[name="param-${i}-dano"]`);
                        const danoVal = selDanoO ? (selDanoO.value || '') : '';
                        const inputOtroO = filaO.querySelector(`input[name="param-${i}-dano-otro"]`);
                        const otroVal = inputOtroO ? (inputOtroO.value || '').trim() : '';
                        const colDanoC = filaC.querySelector('.col-dano');
                        if (colDanoC) {
                            if (estadoVal === 'MALO') {
                                const texto = (otroVal || danoVal || '').toString();
                                colDanoC.style.display = '';
                                colDanoC.innerHTML = texto ? texto : '';
                            } else {
                                colDanoC.style.display = 'none';
                                colDanoC.innerHTML = '';
                            }
                        }
                        // Eliminar columna evidencia y controles en el clon
                        const colEvidC = filaC.querySelector('.col-evidencia');
                        if (colEvidC && colEvidC.parentNode) {
                            colEvidC.parentNode.removeChild(colEvidC);
                        }

                        // Insertar miniatura de evidencia si existe (solo si estado es MALO)
                        if (estadoVal === 'MALO') {
                            const blobCam = (typeof fotosTomadas !== 'undefined' && fotosTomadas[i] && fotosTomadas[i].blob) ? fotosTomadas[i].blob : null;
                            const inputArchivo = filaO.querySelector(`input[name="param-${i}-foto"]`);
                            const fileSel = inputArchivo && inputArchivo.files && inputArchivo.files[0] ? inputArchivo.files[0] : null;
                            const fuente = blobCam || fileSel;
                            if (fuente) {
                                const url = URL.createObjectURL(fuente);
                                const evidenciaDiv = document.createElement('div');
                                evidenciaDiv.className = 'col-evidencia-print';
                                evidenciaDiv.style.cssText = 'grid-column: 1 / -1; margin-top: 6px;';
                                const img = document.createElement('img');
                                img.src = url;
                                img.alt = 'Evidencia';
                                img.style.cssText = 'max-height:120px; border-radius:8px; border:1px solid #e5e7eb;';
                                evidenciaDiv.appendChild(img);
                                filaC.appendChild(evidenciaDiv);
                                // Nota: no revocamos inmediatamente para no invalidar antes de html2canvas; el GC lo limpiará luego.
                            }
                        }
                    });
                } catch {}

                wrapper.appendChild(encabezado);
                wrapper.appendChild(contenidoClonado);

                // Agregar el panel de 'Estado de pruebas' si existe y está visible
                const panelEstado = document.getElementById('panel-estado-pruebas');
                if (panelEstado && panelEstado.style.display !== 'none') {
                    const estadoClonado = panelEstado.cloneNode(true);
                    estadoClonado.style.marginTop = '12px';
                    wrapper.appendChild(estadoClonado);
                }
                document.body.appendChild(wrapper);

                // Asegurar que imágenes (evidencias/brand) queden embebidas para que html2canvas las incluya en el PDF.
                // Problema típico: CORS/timing con URLs de Firebase Storage => salen en pantalla pero no en el canvas.
                async function embedRemoteImages(rootEl) {
                    const imgs = Array.from(rootEl.querySelectorAll('img'));
                    if (!imgs.length) return;

                    const toDataUrl = async (url) => {
                        try {
                            const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
                            if (!res.ok) return null;
                            const blob = await res.blob();
                            const dataUrl = await new Promise((resolve) => {
                                try {
                                    const fr = new FileReader();
                                    fr.onload = () => resolve(String(fr.result || ''));
                                    fr.onerror = () => resolve('');
                                    fr.readAsDataURL(blob);
                                } catch {
                                    resolve('');
                                }
                            });
                            return dataUrl || null;
                        } catch {
                            return null;
                        }
                    };

                    // 1) Forzar eager + esperar load para evitar capturar antes de que pinten
                    await Promise.allSettled(imgs.map(img => new Promise((resolve) => {
                        try {
                            img.loading = 'eager';
                            img.decoding = 'sync';
                            img.crossOrigin = 'anonymous';
                            if (img.complete) return resolve();
                            img.onload = () => resolve();
                            img.onerror = () => resolve();
                        } catch {
                            resolve();
                        }
                    })));

                    // 2) Convertir remotas a dataURL (solo si no son data: / blob:)
                    for (const img of imgs) {
                        try {
                            const src = String(img.getAttribute('src') || '').trim();
                            if (!src) continue;
                            if (src.startsWith('data:') || src.startsWith('blob:')) continue;
                            if (!/^https?:\/\//i.test(src)) continue;
                            const data = await toDataUrl(src);
                            if (data && data.startsWith('data:')) {
                                img.setAttribute('src', data);
                            }
                        } catch {}
                    }

                    // 3) Esperar nuevamente por si el reemplazo tarda en decodificar
                    await Promise.allSettled(imgs.map(img => new Promise((resolve) => {
                        try {
                            if (img.complete) return resolve();
                            img.onload = () => resolve();
                            img.onerror = () => resolve();
                        } catch {
                            resolve();
                        }
                    })));
                }

                await embedRemoteImages(wrapper);

                // Preparar rangos (en px CSS) de elementos que NO deben cortarse entre páginas
                // Nota: html2canvas escala el canvas; convertimos estos rangos a px del canvas después de capturar.
                const wrapperWidthCss = wrapper.offsetWidth || 1;
                const avoidRangesCss = (() => {
                    try {
                        const wrapRect = wrapper.getBoundingClientRect();
                        const selectors = [
                            '.parametros-header',
                            '.parametros-fila',
                            '.col-evidencia-print',
                            '.col-evidencia-print img',
                            'h3',
                            '#panel-estado-pruebas',
                            'img'
                        ];
                        const nodes = wrapper.querySelectorAll(selectors.join(','));
                        const ranges = [];
                        nodes.forEach((el) => {
                            const r = el.getBoundingClientRect();
                            const start = Math.max(0, r.top - wrapRect.top);
                            const end = Math.max(0, r.bottom - wrapRect.top);
                            const h = end - start;
                            // Ignorar rangos demasiado pequeños para no generar ruido
                            if (h >= 24) ranges.push({ start, end });
                        });
                        ranges.sort((a, b) => a.start - b.start);
                        // Merge de rangos superpuestos
                        const merged = [];
                        for (const rg of ranges) {
                            const last = merged[merged.length - 1];
                            if (!last || rg.start > last.end) {
                                merged.push({ start: rg.start, end: rg.end });
                            } else {
                                last.end = Math.max(last.end, rg.end);
                            }
                        }
                        return merged;
                    } catch {
                        return [];
                    }
                })();

                const canvas = await window.html2canvas(wrapper, {
                    backgroundColor: '#ffffff',
                    scale: 2,
                    useCORS: true,
                });
                const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

                // Limpiar wrapper temporal
                document.body.removeChild(wrapper);

                await ensureJsPDF();

                const fileName = `${equipo}-${fechaSafe}.pdf`;

                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

                const pageWidthMm = pdf.internal.pageSize.getWidth();
                const pageHeightMm = pdf.internal.pageSize.getHeight();

                const marginMm = 10;
                const usableWidthMm = pageWidthMm - marginMm * 2;
                const footerReserveMm = 10;
                const usableHeightMm = pageHeightMm - marginMm * 2 - footerReserveMm;

                const pxPerMm = canvas.width / usableWidthMm;
                const pageHeightPx = Math.floor(usableHeightMm * pxPerMm);

                const totalPages = Math.max(1, Math.ceil(canvas.height / pageHeightPx));

                const scaleFactor = canvas.width / wrapperWidthCss;
                const avoidRanges = avoidRangesCss.map(r => ({
                    start: Math.floor(r.start * scaleFactor),
                    end: Math.ceil(r.end * scaleFactor)
                }));

                function nextSafeBreak(yStart, yTarget) {
                    const minSlice = Math.max(220, Math.floor(pageHeightPx * 0.25));
                    const target = Math.min(yTarget, canvas.height);
                    if (!avoidRanges.length) return target;

                    // Si el target cae dentro de un rango a evitar, intentar romper antes (inicio del rango)
                    // o después (fin del rango) si el inicio queda demasiado cerca del comienzo de página.
                    for (const rg of avoidRanges) {
                        if (rg.start < target && rg.end > target) {
                            const before = rg.start;
                            const after = rg.end;

                            // Nunca permitir un slice mayor que la altura de página.
                            // Si el bloque completo no cabe, forzar el corte ANTES del bloque para no partirlo.
                            if (after - yStart > pageHeightPx) {
                                if (before > yStart) return before;
                                return target;
                            }

                            if (before - yStart >= minSlice) return before;
                            // Aunque quede poco espacio, preferimos cortar antes para evitar que el bloque se "coma" la página
                            if (before > yStart) return before;
                            if (after - yStart >= minSlice) return Math.min(after, canvas.height);
                            return target;
                        }
                    }

                    // Si no cae dentro, también evitamos romper justo encima de un bloque grande:
                    // buscar el siguiente bloque que empieza poco antes del target y empujarlo a la siguiente página.
                    const threshold = Math.floor(pageHeightPx * 0.12);
                    for (const rg of avoidRanges) {
                        if (rg.start >= yStart && rg.start <= target && (target - rg.start) <= threshold) {
                            if (rg.start - yStart >= minSlice) return rg.start;
                        }
                    }

                    return target;
                }

                let yPx = 0;
                let pageIndex = 0;
                while (yPx < canvas.height) {
                    pageIndex += 1;
                    const yTarget = yPx + pageHeightPx;
                    let yEnd = nextSafeBreak(yPx, yTarget);
                    if (yEnd <= yPx) yEnd = Math.min(yTarget, canvas.height);
                    // Asegurar que el corte nunca exceda el alto útil de página
                    yEnd = Math.min(yEnd, yPx + pageHeightPx, canvas.height);
                    const sliceHeightPx = Math.min(yEnd - yPx, canvas.height - yPx);
                    const pageCanvas = document.createElement('canvas');
                    pageCanvas.width = canvas.width;
                    pageCanvas.height = sliceHeightPx;
                    const pageCtx = pageCanvas.getContext('2d');
                    pageCtx.fillStyle = '#ffffff';
                    pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
                    pageCtx.drawImage(canvas, 0, yPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

                    const pageDataUrl = pageCanvas.toDataURL('image/jpeg', 0.92);
                    const imgHeightMm = (sliceHeightPx / pxPerMm);

                    if (yPx > 0) pdf.addPage();
                    pdf.addImage(pageDataUrl, 'JPEG', marginMm, marginMm, usableWidthMm, imgHeightMm);

                    // Footer: línea + texto + paginación
                    try {
                        const footerY = pageHeightMm - 6;
                        pdf.setDrawColor(229, 231, 235);
                        pdf.line(marginMm, footerY - 3, pageWidthMm - marginMm, footerY - 3);

                        pdf.setFontSize(9);
                        pdf.setTextColor(107, 114, 128);
                        pdf.text('PCT | Reporte de inspección', marginMm, footerY);

                        const pageLabel = `Página ${pageIndex} de ${totalPages}`;
                        const pageLabelW = pdf.getTextWidth(pageLabel);
                        pdf.text(pageLabel, pageWidthMm - marginMm - pageLabelW, footerY);
                    } catch {}

                    yPx += sliceHeightPx;
                }

                // Descargar / retornar el PDF
                let isEmbedded = false;
                let pdfToken = '';
                try {
                    const paramsUrl = new URLSearchParams(window.location.search || '');
                    isEmbedded = String(paramsUrl.get('embedded') || '').trim() === '1';
                    pdfToken = String(paramsUrl.get('pdfToken') || '').trim();
                } catch {}

                if (isEmbedded && window.parent && typeof window.parent.postMessage === 'function') {
                    try {
                        const blob = pdf.output('blob');
                        const buf = await blob.arrayBuffer();
                        window.parent.postMessage(
                            { type: 'pct_pdf_blob', kind: 'inspeccion', fileName, data: buf, pdfToken },
                            '*',
                            [buf]
                        );
                    } catch (e) {
                        console.warn('No se pudo enviar el PDF al parent (embedded)', e);
                    }
                } else {
                    try { pdf.save(fileName); } catch {}
                }

            } catch (e) {
                console.warn('No se pudo exportar el PDF:', e);
            }
        });
    }

    if (tipoInspeccionSelect && tipoInspeccionChips && tipoInspeccionChips.length) {
        const normalizarTipo = (v) => String(v || '').trim().toUpperCase();

        const actualizarSeleccionTipo = () => {
            const val = normalizarTipo(tipoInspeccionSelect.value);
            tipoInspeccionChips.forEach(btn => {
                const btnVal = normalizarTipo(btn.getAttribute('data-val'));
                if (val && btnVal === val) btn.classList.add('is-selected');
                else btn.classList.remove('is-selected');
            });
        };

        tipoInspeccionChips.forEach(btn => {
            btn.addEventListener('click', () => {
                const v = normalizarTipo(btn.getAttribute('data-val'));
                tipoInspeccionSelect.value = v;
                actualizarSeleccionTipo();
            });
        });

        tipoInspeccionSelect.addEventListener('change', actualizarSeleccionTipo);
        actualizarSeleccionTipo();
    }

    if (btnGuardar) {
        btnGuardar.addEventListener('click', async () => {
            if (isViewMode) return;
            if (guardandoInspeccion) return;
            guardandoInspeccion = true;

            asegurarEstilosLoader();
            const prevBtnHtml = btnGuardar.innerHTML;
            const prevBtnDisabled = btnGuardar.disabled;
            try {
                btnGuardar.disabled = true;
                btnGuardar.innerHTML = `<span class="pct-spinner" aria-hidden="true"></span>Guardando…`;
            } catch {}
            const valor = inputEquipo.value.trim();
            if (!valor) {
                try {
                    btnGuardar.innerHTML = prevBtnHtml;
                    btnGuardar.disabled = prevBtnDisabled;
                } catch {}
                guardandoInspeccion = false;
                return;
            }

            // Validar Tipo de inspección (requerido)
            const selTipo = document.getElementById('inspeccion-tipo');
            const tipoInspeccion = selTipo ? String(selTipo.value || '').trim().toUpperCase() : '';
            if (!tipoInspeccion) {
                alert('Selecciona el Tipo de inspección');
                try {
                    btnGuardar.innerHTML = prevBtnHtml;
                    btnGuardar.disabled = prevBtnDisabled;
                } catch {}
                guardandoInspeccion = false;
                return;
            }

            const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
            const idxReporte = headers.indexOf('REPORTE P/P');
            const fila = equipos.find(cols => idxEquipo >= 0 && cols[idxEquipo] === valor);
            if (!fila) {
                try {
                    btnGuardar.innerHTML = prevBtnHtml;
                    btnGuardar.disabled = prevBtnDisabled;
                } catch {}
                guardandoInspeccion = false;
                return;
            }

            const idxProducto = headers.indexOf('PRODUCTO');
            const idxSerial = getIdxSerial(headers);
            const idxDescripcion = headers.indexOf('DESCRIPCION');

            const get = (idx) => (idx >= 0 && idx < fila.length ? fila[idx] : '');

            const localId = generarIdLocal('insp');
            const parametrosCapturados = [];
            const fotosParaSubir = [];
            const obsTextoManual = (document.getElementById('insp-obs-text')?.value || '').toString().trim();
            const inputObsFoto = document.getElementById('insp-obs-foto');
            const obsFotoBlob = (fotoObs && fotoObs.blob) ? fotoObs.blob : (inputObsFoto && inputObsFoto.files && inputObsFoto.files[0] ? inputObsFoto.files[0] : null);
            let obsFotoNombre = '';
            let obsFotoPath = '';
            const filas = document.querySelectorAll('.parametros-fila');
            filas.forEach((filaHtml, idx) => {
                const nombre = filaHtml.querySelector('.col-nombre')?.textContent?.trim() || '';
                const estadoInput = filaHtml.querySelector(`input[name="param-${idx}-estado"]:checked`);
                const estado = estadoInput ? estadoInput.value : '';
                const danoSelect = filaHtml.querySelector(`select[name="param-${idx}-dano"]`);
                const tipoDano = danoSelect ? danoSelect.value : '';
                const inputOtro = filaHtml.querySelector(`input[name="param-${idx}-dano-otro"]`);
                const detalleOtro = inputOtro ? (inputOtro.value || '').trim() : '';
                const inputFoto = filaHtml.querySelector(`input[name="param-${idx}-foto"]`);
                let evidenciaNombre = '';
                let evidenciaPath = '';
                if (estado && estado.toUpperCase() === 'MALO') {
                    const fotoBlob = (fotosTomadas[idx]?.blob) || (inputFoto && inputFoto.files && inputFoto.files[0]) || null;
                    if (fotoBlob) {
                        // Nombre de evidencia: debe ser ÚNICO por parámetro para evitar sobreescritura en Storage
                        const ahora = new Date();
                        const dd = String(ahora.getDate()).padStart(2, '0');
                        const mm = String(ahora.getMonth() + 1).padStart(2, '0');
                        const yy = String(ahora.getFullYear()).slice(-2);
                        const fechaSafe = `${dd}-${mm}-${yy}`;
                        const equipoId = get(idxEquipo) || 'SIN_EQUIPO';
                        const slug = String(nombre || '')
                            .toLowerCase()
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/^-+|-+$/g, '')
                            .slice(0, 28);
                        const idxSafe = String(idx).padStart(2, '0');
                        evidenciaNombre = `${equipoId}-${fechaSafe}-${idxSafe}${slug ? '-' + slug : ''}.jpg`;
                        evidenciaPath = `inspecciones/${localId}/${evidenciaNombre}`;
                        fotosParaSubir.push({ idx, nombre, file: fotoBlob, evidenciaNombre });
                    }
                }
                parametrosCapturados.push({ nombre, estado, tipoDano, detalleOtro, hasEvidencia: !!evidenciaNombre, evidenciaNombre, evidenciaPath });
            });

            if (obsFotoBlob) {
                const ahoraObs = new Date();
                const ddObs = String(ahoraObs.getDate()).padStart(2, '0');
                const mmObs = String(ahoraObs.getMonth() + 1).padStart(2, '0');
                const yyObs = String(ahoraObs.getFullYear()).slice(-2);
                const HHObs = String(ahoraObs.getHours()).padStart(2, '0');
                const MMObs = String(ahoraObs.getMinutes()).padStart(2, '0');
                const SSObs = String(ahoraObs.getSeconds()).padStart(2, '0');
                const equipoIdObs = get(idxEquipo) || 'SIN_EQUIPO';
                obsFotoNombre = `${equipoIdObs}-${ddObs}${mmObs}${yyObs}-${HHObs}${MMObs}${SSObs}-observaciones.jpg`;
                obsFotoPath = `inspecciones/${localId}/${obsFotoNombre}`;
            }

            // Validaciones requeridas por parámetro
            for (let i = 0; i < parametrosCapturados.length; i++) {
                const p = parametrosCapturados[i];
                if (!p.estado) {
                    alert(`Selecciona el estado para el parámetro: ${p.nombre}`);
                    try {
                        btnGuardar.innerHTML = prevBtnHtml;
                        btnGuardar.disabled = prevBtnDisabled;
                    } catch {}
                    guardandoInspeccion = false;
                    return;
                }
                if (p.estado.toUpperCase() === 'MALO') {
                    // Exigir tipo de daño solo si el parámetro no es Recubrimiento (o similar sin selector de daño)
                    const baseNombre = (p.nombre || '').toLowerCase();
                    const tieneSelectorDanos = !baseNombre.includes('recubrimiento');
                    if (tieneSelectorDanos && !p.tipoDano) {
                        alert(`Selecciona el tipo de daño para: ${p.nombre}`);
                        try {
                            btnGuardar.innerHTML = prevBtnHtml;
                            btnGuardar.disabled = prevBtnDisabled;
                        } catch {}
                        guardandoInspeccion = false;
                        return;
                    }
                    if (p.tipoDano.toUpperCase() === 'OTRO' && !p.detalleOtro) {
                        alert(`Describe el hallazgo en 'OTRO' para: ${p.nombre}`);
                        try {
                            btnGuardar.innerHTML = prevBtnHtml;
                            btnGuardar.disabled = prevBtnDisabled;
                        } catch {}
                        guardandoInspeccion = false;
                        return;
                    }
                    // Foto obligatoria cuando el parámetro es MALO
                    const inputFoto = document.querySelector(`input[name="param-${i}-foto"]`);
                    const tieneFoto = !!(fotosTomadas[i]?.blob || (inputFoto && inputFoto.files && inputFoto.files[0]));
                    if (!tieneFoto) {
                        alert(`Adjunta fotografía de evidencia para: ${p.nombre}`);
                        try {
                            btnGuardar.innerHTML = prevBtnHtml;
                            btnGuardar.disabled = prevBtnDisabled;
                        } catch {}
                        guardandoInspeccion = false;
                        return;
                    }
                }
            }

            // Construir un resumen de observaciones con los hallazgos (parámetros en estado MALO o NO LEGIBLE)
            const hallazgos = parametrosCapturados
                .filter(p => {
                    const est = (p.estado || '').toUpperCase();
                    return est === 'MALO' || est === 'NO LEGIBLE';
                })
                .map(p => {
                    const base = p.nombre || '';
                    const detalle = (p.detalleOtro || p.tipoDano || '').trim();
                    return detalle ? `${base}: ${detalle}` : base;
                });
            const observacionesResumen = hallazgos.join(' | ');

            // Intentar recuperar datos desde la actividad en Firestore
            let fechaEmbarque = '';
            let inicioServicio = '';
            let terminacionServicio = '';
            let cliente = '';
            let areaCliente = '';
            let ubicacion = '';
            let actividadId = '';
            let ubicacionGps = '';

            try {
                const { getFirestore, collection, query, where, orderBy, limit, getDocs, doc, getDoc } = await import(
                    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                );

                const db = getFirestore();
                const colRef = collection(db, 'actividades');

                // 1) Si venimos con actividadId en la URL (desde inspectlist), usar directamente esa actividad
                const paramsUrl = new URLSearchParams(window.location.search || '');
                const actividadIdUrl = paramsUrl.get('actividadId');

                if (actividadIdUrl) {
                    const ref = doc(db, 'actividades', actividadIdUrl);
                    const snap = await getDoc(ref);
                    if (snap.exists()) {
                        const data = snap.data() || {};
                        fechaEmbarque = data.fechaEmbarque || '';
                        inicioServicio = data.inicioServicio || '';
                        terminacionServicio = data.terminacionServicio || '';
                        cliente = data.cliente || '';
                        areaCliente = data.areaCliente || '';
                        ubicacion = data.ubicacion || '';
                        actividadId = actividadIdUrl;
                    }
                }

                // 2) Si no hubo actividadId en URL o no se encontró, buscar por equipo como respaldo
                if (!actividadId) {
                    const q = query(
                        colRef,
                        where('equipo', '==', get(idxEquipo)),
                        orderBy('fechaRegistro', 'desc'),
                        limit(1)
                    );

                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        const docAct = snap.docs[0];
                        const data = docAct.data() || {};
                        fechaEmbarque = data.fechaEmbarque || '';
                        inicioServicio = data.inicioServicio || '';
                        terminacionServicio = data.terminacionServicio || '';
                        cliente = data.cliente || '';
                        areaCliente = data.areaCliente || '';
                        ubicacion = data.ubicacion || '';
                        actividadId = docAct.id || '';
                    }
                }
            } catch (e) {
                console.warn('No se pudieron leer fechas de actividad para la inspección', e);
            }

            // Capturar GPS para persistir locación (tablets suelen no tener ubicacion en actividad)
            try {
                ubicacionGps = await capturarGpsTexto();
            } catch {
                ubicacionGps = '';
            }

            // Normalizar: no persistir el literal "Sin GPS" como valor de ubicación
            try {
                const gpsTxt = (ubicacionGps || '').toString().trim();
                if (gpsTxt.toUpperCase() === 'SIN GPS') ubicacionGps = '';
            } catch {}

            if (!ubicacion) ubicacion = ubicacionGps || ubicacion;

            // Usuario actual (correo) para registrar quién hizo la inspección
            let usuarioInspeccion = '';
            try {
                if (window.auth && window.auth.currentUser && window.auth.currentUser.email) {
                    usuarioInspeccion = String(window.auth.currentUser.email).toLowerCase();
                }
            } catch (e) {
                console.warn('No se pudo leer el usuario actual para la inspección', e);
            }

            const registro = {
                fecha: new Date().toISOString(),
                localId,
                equipo: get(idxEquipo),
                producto: get(idxProducto),
                serial: get(idxSerial),
                descripcion: get(idxDescripcion),
                reporte: get(idxReporte),
                tipoInspeccion,
                parametros: parametrosCapturados,
                fechaEmbarque,
                inicioServicio,
                terminacionServicio,
                cliente,
                areaCliente,
                ubicacion,
                ubicacionGps,
                usuarioInspeccion,
                actividadId,
                observaciones: observacionesResumen,
                observacionesManual: obsTextoManual,
                observacionesFotoNombre: obsFotoNombre,
                observacionesFotoPath: obsFotoPath,
                syncStatus: 'PENDING',
            };

            const clave = 'pct_inspecciones';
            let lista = [];
            try {
                lista = JSON.parse(localStorage.getItem(clave) || '[]');
                if (!Array.isArray(lista)) lista = [];
            } catch (e) {
                lista = [];
            }

            lista.push(registro);
            escribirListaInspeccionesLocal(lista);

            
            let guardadoFirestoreOk = false;
            try {
                const { getFirestore, serverTimestamp, doc, setDoc, updateDoc } = await import(
                    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                );
                const { getStorage, ref, uploadBytes, getDownloadURL } = await import(
                    'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'
                );

                const db = getFirestore();
                const localId = String(registro.localId || '').trim();
                const docRef = doc(db, 'inspecciones', localId);
                const payload = {
                    ...registro,
                    creadoEn: serverTimestamp(),
                    syncStatus: 'SYNCED',
                };

                await setDoc(docRef, payload, { merge: true });
                guardadoFirestoreOk = true;
                patchInspeccionLocalPorId(localId, { syncStatus: 'SYNCED' });

                try {
                    // Subir evidencias (fotos) a Storage y luego persistir evidenciaUrl/evidenciaPath en Firestore
                    const storage = getStorage();
                    if (Array.isArray(fotosParaSubir) && fotosParaSubir.length) {
                        const urlsPorIdx = {};
                        for (const f of fotosParaSubir) {
                            const name = (f && f.evidenciaNombre)
                                ? String(f.evidenciaNombre)
                                : `foto-${String(f && f.idx != null ? f.idx : '')}.jpg`;
                            // Usar la misma carpeta que evidenciaPath (localId)
                            const pth = `inspecciones/${localId}/${name}`;
                            const stRef = ref(storage, pth);
                            await uploadBytes(stRef, f.file);
                            const url = await getDownloadURL(stRef);
                            urlsPorIdx[String(f.idx)] = url;
                        }

                        const nextParams = (parametrosCapturados || []).map((p, idx) => {
                            const u = urlsPorIdx[String(idx)] || '';
                            if (!u) return p;
                            const name = (p && p.evidenciaNombre) ? String(p.evidenciaNombre) : '';
                            const evidenciaPath = (p && p.evidenciaPath)
                                ? String(p.evidenciaPath)
                                : (name ? `inspecciones/${localId}/${name}` : '');
                            return { ...(p || {}), evidenciaUrl: u, evidenciaPath };
                        });

                        // Guardar URLs resueltas en el documento (merge)
                        await updateDoc(docRef, { parametros: nextParams });
                        try {
                            patchInspeccionLocalPorId(localId, { parametros: nextParams });
                        } catch {}
                    }

                    if (obsFotoBlob && obsFotoNombre) {
                        const pthObs = `inspecciones/${localId}/${obsFotoNombre}`;
                        const stRefObs = ref(storage, pthObs);
                        await uploadBytes(stRefObs, obsFotoBlob);
                        const urlObs = await getDownloadURL(stRefObs);
                        await updateDoc(docRef, {
                            observacionesFotoUrl: urlObs,
                            observacionesFotoPath: pthObs,
                            observacionesFotoNombre: obsFotoNombre,
                        });
                        try {
                            patchInspeccionLocalPorId(localId, {
                                observacionesFotoUrl: urlObs,
                                observacionesFotoPath: pthObs,
                                observacionesFotoNombre: obsFotoNombre,
                            });
                        } catch {}
                    }
                } catch (e) {
                    console.warn('No se pudieron subir evidencias a Storage:', e);
                }
                try {
                    if (typeof window.pctAudit === 'function') {
                        const equipo = (registro && registro.equipo ? String(registro.equipo) : '').trim();
                        const actividadId = (registro && registro.actividadId ? String(registro.actividadId) : '').trim();
                        await window.pctAudit('inspecciones_create', { equipo, actividadId });
                    }
                } catch {}
            } catch (e) {
                console.warn('No se pudo guardar la inspección en Firestore, solo local:', e);
            }

            // Carga opcional a Dropbox si hay configuración
            (async () => {
                try {
                    const cfg = (window.dropboxConfig || {});
                    const token = (cfg.accessToken || '').trim();
                    const basePath = (cfg.basePath || '/inspecciones');
                    if (!token) return;

                    const ts = new Date();
                    const y = ts.getFullYear();
                    const m = String(ts.getMonth() + 1).padStart(2, '0');
                    const d = String(ts.getDate()).padStart(2, '0');
                    const hh = String(ts.getHours()).padStart(2, '0');
                    const mmn = String(ts.getMinutes()).padStart(2, '0');
                    const ss = String(ts.getSeconds()).padStart(2, '0');
                    const stamp = `${y}${m}${d}-${hh}${mmn}${ss}`;

                    const carpeta = `${basePath}/${registro.equipo || 'SIN_EQUIPO'}/${stamp}`;

                    async function subirArchivo(ruta, blob) {
                        const args = { path: ruta, mode: 'add', autorename: true, mute: false, strict_conflict: false };
                        const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/octet-stream',
                                'Dropbox-API-Arg': JSON.stringify(args),
                            },
                            body: blob,
                        });
                        if (!res.ok) throw new Error('Dropbox upload falló');
                    }

                    const jsonBlob = new Blob([JSON.stringify(registro, null, 2)], { type: 'application/json' });
                    await subirArchivo(`${carpeta}/inspeccion.json`, jsonBlob);

                    for (const f of fotosParaSubir) {
                        await subirArchivo(`${carpeta}/${f.evidenciaNombre || ('foto-' + f.idx + '.jpg')}`, f.file);
                    }
                } catch (e) {
                    console.warn('No se pudieron subir archivos a Dropbox (opcional):', e);
                }
            })();

            const panelDetalle = document.getElementById('detalle-equipo');
            if (panelDetalle && panelDetalle.scrollIntoView) {
                panelDetalle.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            if (guardadoFirestoreOk) {
                inputEquipo.value = '';
                try {
                    const selTipo = document.getElementById('inspeccion-tipo');
                    if (selTipo) selTipo.value = '';
                } catch {}

                try {
                    Object.keys(fotosTomadas || {}).forEach(k => {
                        try { delete fotosTomadas[k]; } catch {}
                    });
                } catch {}

                detalleContenedor.innerHTML = `
                    <div style="padding:0.9rem 1rem; border-radius:0.75rem; border:1px solid #22c55e; background:#ecfdf5; text-align:center; font-size:1rem; font-weight:600; color:#166534; margin-bottom:0.5rem;">
                        Inspección guardada
                    </div>
                    <p style="font-size:0.85rem; color:#4b5563; text-align:center;">
                        Seleccione otro equipo para realizar una nueva inspección.
                    </p>
                `;

                try { alert('Inspección guardada'); } catch {}

                btnGuardar.textContent = 'Guardar inspección';
                btnGuardar.disabled = true;
            } else {
                detalleContenedor.innerHTML = `
                    <div style="padding:0.9rem 1rem; border-radius:0.75rem; border:1px solid #f59e0b; background:#fffbeb; text-align:center; font-size:1rem; font-weight:700; color:#92400e; margin-bottom:0.5rem;">
                        Inspección pendiente de sincronizar
                    </div>
                    <p style="font-size:0.85rem; color:#4b5563; text-align:center;">
                        No se pudo guardar en el sistema (Firestore). Mantén la sesión abierta y revisa conexión/inicio de sesión.
                    </p>
                `;

                try {
                    btnGuardar.innerHTML = prevBtnHtml;
                } catch {
                    try { btnGuardar.textContent = 'Guardar inspección'; } catch {}
                }
                btnGuardar.disabled = false;
                guardandoInspeccion = false;
                return;
            }

            try {
                btnGuardar.innerHTML = prevBtnHtml;
            } catch {
                try { btnGuardar.textContent = 'Guardar inspección'; } catch {}
            }
            guardandoInspeccion = false;
        });
    }
});
