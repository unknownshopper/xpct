// Lógica principal para inspeccion.html (selector de equipo, detalle y guardado de inspecciones)
document.addEventListener('DOMContentLoaded', () => {
    const inputEquipo = document.getElementById('equipo-input');
    const datalistEquipos = document.getElementById('lista-equipos');
    const equipoDropdown = document.getElementById('equipo-dropdown');
    const detalleContenedor = document.getElementById('detalle-equipo-contenido');
    const btnGuardar = document.getElementById('btn-guardar-inspeccion');
    const tipoInspeccionSelect = document.getElementById('inspeccion-tipo');
    const tipoInspeccionChips = Array.from(document.querySelectorAll('.tipo-inspeccion-chip'));

    let esEquipoTercero = false;
    let terceroPropiedadUrl = '';
    let terceroConfiguracionUrl = '';
    let terceroDescripcionUrl = '';
    let terceroEquipoUrl = '';
    try {
        const p = new URLSearchParams(window.location.search || '');
        terceroPropiedadUrl = (p.get('terceroPropiedad') || '').toString().trim();
        terceroConfiguracionUrl = (p.get('terceroConfiguracion') || '').toString().trim();
        terceroDescripcionUrl = (p.get('terceroDescripcion') || '').toString().trim();
        terceroEquipoUrl = (p.get('terceroEquipo') || '').toString().trim();
    } catch {}

    let isViewMode = false;
    try {
        const paramsUrl = new URLSearchParams(window.location.search || '');
        isViewMode = (paramsUrl.get('view') || '').trim() === '1';
    } catch {}

    if (!inputEquipo || !detalleContenedor) {
        // No estamos en inspeccion.html
        return;
    }

    // Permitir deep-link desde inspectlist con ?equipo=...
    try {
        const paramsEq = new URLSearchParams(window.location.search || '');
        const eqUrl = (paramsEq.get('equipo') || '').toString().trim();
        if (inputEquipo) {
            if (eqUrl) {
                inputEquipo.value = eqUrl;
            } else if (terceroEquipoUrl) {
                inputEquipo.value = `TERCERO ${terceroEquipoUrl}`;
            }
            try { inputEquipo.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
        }
    } catch {}

    try {
        window.addEventListener('online', () => {
            try { processEvidQueue(); } catch {}
        });
    } catch {}

    const puedeOmitirFotos = () => {
        try {
            if (esEquipoTercero) return false;
            return !!window.isSgi;
        } catch {
            return false;
        }
    };

    function fixMojibakeCommon(s) {
        // Corrige casos típicos de UTF-8 mal interpretado como Latin-1.
        // Esto evita resultados como "MAGAÃ‘A" en PDFs/listados.
        try {
            let t = (s || '').toString();
            const reps = {
                'Ã‘': 'Ñ',
                'Ã±': 'ñ',
                'Ã': 'Ñ',
                'Ã': 'Ñ',
                'Ã¡': 'á',
                'ÃÁ': 'Á',
                'Ã©': 'é',
                'Ã‰': 'É',
                'Ã­': 'í',
                'ÃÍ': 'Í',
                'Ã³': 'ó',
                'Ã“': 'Ó',
                'Ãº': 'ú',
                'Ãš': 'Ú',
                'Ã¼': 'ü',
                'Ãœ': 'Ü',
            };
            Object.keys(reps).forEach(k => {
                if (t.includes(k)) t = t.split(k).join(reps[k]);
            });
            return t;
        } catch {
            return (s || '').toString();
        }
    }

    function normalizarNombreUsuario(raw) {
        try {
            let t = (raw || '').toString();
            t = fixMojibakeCommon(t);
            // Quitar caracteres de reemplazo y controles
            t = t.replace(/\uFFFD/g, '');
            t = t.replace(/[\u0000-\u001F\u007F]/g, ' ');
            t = t.normalize('NFC');
            t = t.replace(/\s+/g, ' ').trim();
            if (!t) return '';
            return t.toUpperCase();
        } catch {
            return (raw || '').toString().toUpperCase().trim();
        }
    }

    function resolverNombreUsuarioActual() {
        try {
            const u = window.auth && window.auth.currentUser ? window.auth.currentUser : null;
            const dn = u && u.displayName ? String(u.displayName).trim() : '';
            if (dn) return normalizarNombreUsuario(dn);
        } catch {}
        try {
            const email = window.auth && window.auth.currentUser && window.auth.currentUser.email
                ? String(window.auth.currentUser.email)
                : '';
            const local = email.split('@')[0] || '';
            const guess = local.replace(/[._-]+/g, ' ').trim();
            return normalizarNombreUsuario(guess || email);
        } catch {}
        return '';
    }

    function normKeySimple(s) {
        return (s || '')
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isEstadoGeneralFila(filaHtml) {
        try {
            if (!filaHtml) return false;
            if (String(filaHtml.dataset.estadoGeneral || '') === '1') return true;
            const nombre = filaHtml.querySelector('.col-nombre')?.textContent?.trim() || '';
            return normKeySimple(nombre) === 'estado general';
        } catch {}
        return false;
    }

    function calcularEstadoGeneralDesdeUI() {
        try {
            const filas = Array.from(document.querySelectorAll('.parametros-fila'));
            const filasEval = filas.filter(f => !isEstadoGeneralFila(f));
            const hayFallo = filasEval.some((fila, idx) => {
                const estadoInput = fila.querySelector(`input[name="param-${idx}-estado"]:checked`);
                const est = estadoInput ? String(estadoInput.value || '').trim().toUpperCase() : '';
                return est === 'MALO' || est === 'NO LEGIBLE';
            });
            return hayFallo ? 'MALO' : 'BUENO';
        } catch {}
        return 'BUENO';
    }

    function actualizarEstadoGeneralUI() {
        try {
            const filaGen = document.querySelector('.parametros-fila[data-estado-general="1"]');
            if (!filaGen) return;
            const estado = calcularEstadoGeneralDesdeUI();
            filaGen.dataset.estadoCalc = estado;
            const el = filaGen.querySelector('[data-estado-general-label]');
            if (el) {
                el.textContent = estado;
                el.style.color = (estado === 'MALO') ? '#b91c1c' : '#065f46';
            }
        } catch {}
    }

    let equipos = [];
    let headers = [];
    let formatosPorCodigo = {};
    let mapaDanos = []; // [{ match: 'recubrimiento', opciones: [...] }]
    let anilloRetenedorPorActivo = new Map();
    let inventarioCargado = false;
    let formatosCargados = false;
    let equiposActivos = []; // [{ equipoId, descripcion, equipoKey, descKey }]
    let guardandoInspeccion = false; // evita doble guardado
    const fotosTomadas = {}; // idx -> { blob } o { danos: { [DANO]: { blob1, blob2, del1, del2 } } }
    let fotoObs = null; // { blob }
    let fotoObs2 = null; // { blob }
    let borrarFotoObs = false;
    let borrarFotoObs2 = false;

    let inspeccionEditData = null;
    let inspeccionIsEditingExisting = false;

    const claveEvidQueue = 'pct_evid_queue_v1';
    const evidDbName = 'pct_evid_db_v1';
    const evidStore = 'uploads';

    function safeJsonParse(s, fallback) {
        try {
            const v = JSON.parse(String(s || ''));
            return (v == null) ? fallback : v;
        } catch {
            return fallback;
        }
    }

    function evidKeyFromItem(item) {
        const docId = String(item?.docId || '').trim();
        const kind = String(item?.kind || '').trim();
        const idx = (item?.idx != null) ? String(item.idx) : '';
        const dano = String(item?.dano || '').trim().toUpperCase();
        const slot = (item?.slot != null) ? String(item.slot) : '';
        const nombre = String(item?.evidenciaNombre || '').trim();
        const seed = String(item?.seed || '').trim();
        return [docId, kind, idx, dano, slot, nombre, seed].filter(Boolean).join('|');
    }

    function openEvidDb() {
        return new Promise((resolve, reject) => {
            try {
                const req = indexedDB.open(evidDbName, 1);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(evidStore)) {
                        db.createObjectStore(evidStore);
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    async function idbSet(key, value) {
        const db = await openEvidDb();
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(evidStore, 'readwrite');
                tx.objectStore(evidStore).put(value, key);
                tx.oncomplete = () => { try { db.close(); } catch {} resolve(); };
                tx.onerror = () => { try { db.close(); } catch {} reject(tx.error); };
            } catch (e) {
                try { db.close(); } catch {}
                reject(e);
            }
        });
    }

    async function idbGet(key) {
        const db = await openEvidDb();
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(evidStore, 'readonly');
                const req = tx.objectStore(evidStore).get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
                tx.oncomplete = () => { try { db.close(); } catch {} };
            } catch (e) {
                try { db.close(); } catch {}
                reject(e);
            }
        });
    }

    async function idbDel(key) {
        const db = await openEvidDb();
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(evidStore, 'readwrite');
                tx.objectStore(evidStore).delete(key);
                tx.oncomplete = () => { try { db.close(); } catch {} resolve(); };
                tx.onerror = () => { try { db.close(); } catch {} reject(tx.error); };
            } catch (e) {
                try { db.close(); } catch {}
                reject(e);
            }
        });
    }

    function loadEvidQueue() {
        const raw = localStorage.getItem(claveEvidQueue);
        const arr = safeJsonParse(raw, []);
        return Array.isArray(arr) ? arr : [];
    }

    function saveEvidQueue(arr) {
        try { localStorage.setItem(claveEvidQueue, JSON.stringify(arr || [])); } catch {}
    }

    async function enqueueEvidenceUpload(item, blobOrFile) {
        const key = evidKeyFromItem(item);
        if (!key) return;
        const payload = {
            ...item,
            _key: key,
            createdAt: Date.now(),
        };
        try {
            await idbSet(key, blobOrFile);
        } catch (e) {
            console.warn('No se pudo guardar evidencia pendiente en IndexedDB', e);
            return;
        }
        const q = loadEvidQueue();
        const exists = q.some(x => x && x._key === key);
        if (!exists) {
            q.unshift(payload);
            saveEvidQueue(q);
        }
    }

    let processingEvidQueue = false;
    async function processEvidQueue() {
        try {
            if (processingEvidQueue) return;
            if (!navigator.onLine) return;
            if (!window.auth || !window.auth.currentUser) return;
            const q = loadEvidQueue();
            if (!q.length) return;
            processingEvidQueue = true;

            const { getFirestore, doc, updateDoc, getDoc } = await import(
                'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
            );
            const { getStorage, ref, uploadBytes, getDownloadURL } = await import(
                'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'
            );
            const db = getFirestore();
            const storage = getStorage();

            const nextQueue = [];

            for (const it of q) {
                try {
                    const docId = String(it?.docId || '').trim();
                    const evidenciaNombre = String(it?.evidenciaNombre || '').trim();
                    const storagePath = String(it?.storagePath || '').trim();
                    const kind = String(it?.kind || '').trim();
                    const idx = (it?.idx != null) ? Number(it.idx) : null;
                    const slot = (it?.slot != null) ? Number(it.slot) : null;
                    const dano = String(it?.dano || '').trim().toUpperCase();
                    if (!docId || !storagePath || !evidenciaNombre || !kind || slot == null) {
                        await idbDel(it?._key);
                        continue;
                    }

                    const blob = await idbGet(it._key);
                    if (!blob) {
                        await idbDel(it._key);
                        continue;
                    }

                    const stRef = ref(storage, storagePath);
                    await uploadBytes(stRef, blob);
                    const url = await getDownloadURL(stRef);

                    const docRef = doc(db, 'inspecciones', docId);

                    if (kind === 'obs') {
                        const patch = {
                            syncStatus: 'SYNCED',
                        };
                        if (slot === 2) {
                            patch.observacionesFotoUrl2 = url;
                            patch.observacionesFotoPath2 = storagePath;
                            patch.observacionesFotoNombre2 = evidenciaNombre;
                        } else {
                            patch.observacionesFotoUrl = url;
                            patch.observacionesFotoPath = storagePath;
                            patch.observacionesFotoNombre = evidenciaNombre;
                        }
                        await updateDoc(docRef, patch);
                        await idbDel(it._key);
                        continue;
                    }

                    if (kind === 'sin_dano') {
                        // Compatibilidad: si existen evidencias antiguas en cola, permitir que sincronicen.
                        const patch = { syncStatus: 'SYNCED' };
                        if (slot === 2) {
                            patch.sinDanoFotoUrl2 = url;
                            patch.sinDanoFotoPath2 = storagePath;
                            patch.sinDanoFotoNombre2 = evidenciaNombre;
                        } else {
                            patch.sinDanoFotoUrl = url;
                            patch.sinDanoFotoPath = storagePath;
                            patch.sinDanoFotoNombre = evidenciaNombre;
                        }
                        await updateDoc(docRef, patch);
                        await idbDel(it._key);
                        continue;
                    }

                    // Releer documento, mutar en cliente y guardar parametros completos
                    const snap = await getDoc(docRef);
                    if (!snap.exists()) {
                        await idbDel(it._key);
                        continue;
                    }
                    const data = snap.data() || {};
                    const params = Array.isArray(data.parametros) ? data.parametros.slice() : [];
                    if (idx == null || idx < 0 || idx >= params.length) {
                        await idbDel(it._key);
                        continue;
                    }
                    const p = params[idx] ? { ...(params[idx] || {}) } : null;
                    if (!p) {
                        await idbDel(it._key);
                        continue;
                    }

                    if (kind === 'param') {
                        if (slot === 1) {
                            p.evidenciaUrl = url;
                            p.evidenciaPath = storagePath;
                            p.evidenciaNombre = evidenciaNombre;
                        } else {
                            p.evidenciaUrl2 = url;
                            p.evidenciaPath2 = storagePath;
                            p.evidenciaNombre2 = evidenciaNombre;
                        }
                    } else if (kind === 'dano') {
                        const by = (p.evidenciasPorDano && typeof p.evidenciasPorDano === 'object') ? { ...(p.evidenciasPorDano || {}) } : {};
                        by[dano] = { ...(by[dano] || {}) };
                        if (slot === 1) {
                            by[dano].evidenciaUrl = url;
                            by[dano].evidenciaPath = storagePath;
                            by[dano].evidenciaNombre = evidenciaNombre;
                        } else {
                            by[dano].evidenciaUrl2 = url;
                            by[dano].evidenciaPath2 = storagePath;
                            by[dano].evidenciaNombre2 = evidenciaNombre;
                        }
                        p.evidenciasPorDano = by;
                    }

                    params[idx] = p;
                    await updateDoc(docRef, { parametros: params, syncStatus: 'SYNCED' });

                    await idbDel(it._key);
                } catch (e) {
                    nextQueue.push(it);
                    continue;
                }
            }

            saveEvidQueue(nextQueue);
        } catch (e) {
            console.warn('processEvidQueue error', e);
        } finally {
            processingEvidQueue = false;
        }
    }

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
            let out = String(s || '')
                .toUpperCase()
                .replace(/\u00A0/g, ' ')
                .replace(/[\u200B-\u200D\uFEFF]+/g, '')
                .replace(/\s+/g, ' ')
                .replace(/\s*\/\s*/g, '/')
                .trim();

            // Normalizar variantes de TEE:
            // Inventario: "TEE 1 (HXMXM)" -> Formato: "TEE H X M X M"
            // Inventario: "TEE 2 (MXHXH)" -> Formato: "TEE M X H X H"
            out = out.replace(/\bTEE\s*\d+\s*\(([^)]+)\)/g, (_m, grupo) => {
                // Si viene como "HXMXH O MXHXH", tomar el primer patrón.
                const g0 = String(grupo || '').toUpperCase();
                const first = g0.split(/\bO\b/)[0] || g0;
                const raw = String(first || '').replace(/[^A-Z]/g, '');
                const chars = raw.split('').filter(c => c === 'H' || c === 'M');
                if (!chars.length) return 'TEE';
                return `TEE ${chars.join(' X ')}`;
            });
            return out;
        } catch {
            return String(s || '').trim().toUpperCase();
        }
    }

    async function aplicarInspeccionExistenteEditable() {
        try {
            if (isViewMode) return;

            const paramsUrl = new URLSearchParams(window.location.search || '');
            const inspIdUrl = (paramsUrl.get('inspId') || '').trim();
            if (!inspIdUrl) return;

            inspeccionIsEditingExisting = true;

            // Esperar a que inventario y formatos estén listos para que se rendericen los parámetros
            const esperar = async (cond, msTotal = 6500, paso = 120) => {
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

            // Esperar a que el módulo de auth (inspeccion.html) haya poblado roles/claims.
            // Si no esperamos, puede ocultar controles de Foto 2 (SGI) y desactivar el auto-enrutado.
            await esperar(() => {
                try {
                    return (typeof window.userRole !== 'undefined') && (typeof window.isSupervisor === 'boolean' || typeof window.isAdmin === 'boolean');
                } catch { return false; }
            }, 6500, 120);

            const { getFirestore, doc, getDoc } = await import(
                'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
            );
            const db = getFirestore();

            const refInsp = doc(db, 'inspecciones', inspIdUrl);
            const snap = await getDoc(refInsp);
            if (!snap.exists()) return;

            const insp = { id: snap.id, ...snap.data() };
            inspeccionEditData = insp;

            // Resolver URLs de evidencias/testimonio cuando el documento solo tiene path/nombre (sin URL)
            let inspConUrls = insp;
            try {
                const params = Array.isArray(inspConUrls.parametros) ? inspConUrls.parametros : [];
                const needsParams = params.some(p => p && (
                    (((p.evidenciaPath) || (p.evidenciaNombre)) && !p.evidenciaUrl) ||
                    (((p.evidenciaPath2) || (p.evidenciaNombre2)) && !p.evidenciaUrl2)
                ));
                const needsObs = !!(
                    ((inspConUrls.observacionesFotoPath || inspConUrls.observacionesFotoNombre) && !inspConUrls.observacionesFotoUrl)
                    || ((inspConUrls.observacionesFotoPath2 || inspConUrls.observacionesFotoNombre2) && !inspConUrls.observacionesFotoUrl2)
                );

                const needsSinDano = !!(
                    ((inspConUrls.sinDanoFotoPath || inspConUrls.sinDanoFotoNombre) && !inspConUrls.sinDanoFotoUrl)
                    || ((inspConUrls.sinDanoFotoPath2 || inspConUrls.sinDanoFotoNombre2) && !inspConUrls.sinDanoFotoUrl2)
                );

                if (needsParams || needsObs || needsSinDano) {
                    const { getStorage, ref: stRef, getDownloadURL } = await import(
                        'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'
                    );
                    const storage = getStorage();

                    const inspId = String(inspConUrls.id || '').trim();
                    const actId = String(inspConUrls.actividadId || '').trim();
                    const localId = String(inspConUrls.localId || '').trim();
                    const inspIdQs = String(inspIdUrl || '').trim();

                    const resolverDesdeCandidatos = async (candidatos) => {
                        const cands = Array.isArray(candidatos) ? candidatos.filter(Boolean) : [];
                        if (!cands.length) return '';
                        for (const path of cands) {
                            try {
                                const url = await getDownloadURL(stRef(storage, path));
                                if (url) return url;
                            } catch {}
                        }
                        return '';
                    };

                    if (needsParams) {
                        const nextParams = await Promise.all(params.map(async (p) => {
                            try {
                                if (!p) return p;

                                const next = { ...(p || {}) };

                                if (!next.evidenciaUrl && (next.evidenciaPath || next.evidenciaNombre)) {
                                    const candidatos = [];
                                    const pathDirecto = String(next.evidenciaPath || '').trim();
                                    if (pathDirecto) candidatos.push(pathDirecto);

                                    const name = String(next.evidenciaNombre || '').trim();
                                    if (name) {
                                        if (inspId) candidatos.push(`inspecciones/${inspId}/${name}`);
                                        if (localId) candidatos.push(`inspecciones/${localId}/${name}`);
                                        if (actId) candidatos.push(`inspecciones/${actId}/${name}`);
                                        if (inspIdQs) candidatos.push(`inspecciones/${inspIdQs}/${name}`);
                                    }
                                    const url = await resolverDesdeCandidatos(candidatos);
                                    if (url) next.evidenciaUrl = url;
                                }

                                if (!next.evidenciaUrl2 && (next.evidenciaPath2 || next.evidenciaNombre2)) {
                                    const candidatos = [];
                                    const pathDirecto = String(next.evidenciaPath2 || '').trim();
                                    if (pathDirecto) candidatos.push(pathDirecto);

                                    const name = String(next.evidenciaNombre2 || '').trim();
                                    if (name) {
                                        if (inspId) candidatos.push(`inspecciones/${inspId}/${name}`);
                                        if (localId) candidatos.push(`inspecciones/${localId}/${name}`);
                                        if (actId) candidatos.push(`inspecciones/${actId}/${name}`);
                                        if (inspIdQs) candidatos.push(`inspecciones/${inspIdQs}/${name}`);
                                    }
                                    const url = await resolverDesdeCandidatos(candidatos);
                                    if (url) next.evidenciaUrl2 = url;
                                }

                                return next;
                            } catch {
                                return p;
                            }
                        }));
                        inspConUrls = { ...(inspConUrls || {}), parametros: nextParams };
                    }

                    if (needsObs) {
                        const resolveOne = async (pathField, nameField, urlField) => {
                            const candidatos = [];
                            const pathDirecto = String(inspConUrls[pathField] || '').trim();
                            if (pathDirecto) candidatos.push(pathDirecto);

                            const name = String(inspConUrls[nameField] || '').trim();
                            if (name) {
                                if (inspId) candidatos.push(`inspecciones/${inspId}/${name}`);
                                if (localId) candidatos.push(`inspecciones/${localId}/${name}`);
                                if (actId) candidatos.push(`inspecciones/${actId}/${name}`);
                                if (inspIdQs) candidatos.push(`inspecciones/${inspIdQs}/${name}`);
                            }

                            const url = await resolverDesdeCandidatos(candidatos);
                            if (url) inspConUrls = { ...(inspConUrls || {}), [urlField]: url };
                        };

                        if ((inspConUrls.observacionesFotoPath || inspConUrls.observacionesFotoNombre) && !inspConUrls.observacionesFotoUrl) {
                            await resolveOne('observacionesFotoPath', 'observacionesFotoNombre', 'observacionesFotoUrl');
                        }
                        if ((inspConUrls.observacionesFotoPath2 || inspConUrls.observacionesFotoNombre2) && !inspConUrls.observacionesFotoUrl2) {
                            await resolveOne('observacionesFotoPath2', 'observacionesFotoNombre2', 'observacionesFotoUrl2');
                        }
                    }

                    // Nota: sinDaño fue removido del UI; se deja compatibilidad de datos pero no se resuelven URLs aquí.
                }
            } catch {}

            const equipo = (insp.equipo || '').toString().trim();
            if (equipo) {
                inputEquipo.value = equipo;
                try { inputEquipo.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
                try { actualizarDetalleDesdeInput(); } catch {}
            }

            if (tipoInspeccionSelect) {
                const t = (insp.tipoInspeccion || '').toString().trim().toUpperCase();
                if (t) {
                    tipoInspeccionSelect.value = t;
                    try { tipoInspeccionSelect.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
                }
            }

            await esperar(() => {
                try {
                    return !!(detalleContenedor && detalleContenedor.querySelectorAll('.parametros-fila').length);
                } catch { return false; }
            }, 6500, 120);

            const prevParams = Array.isArray(inspConUrls.parametros) ? inspConUrls.parametros : [];
            const normKey = (s) => String(s || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            const prevByName = new Map(prevParams.map(p => [normKey(p && p.nombre), p]));

            const findPrevParam = (nombreUi, idx) => {
                try {
                    const k = normKey(nombreUi);
                    if (k && prevByName.has(k)) return prevByName.get(k);
                    // Fuzzy: algunos históricos guardaron nombres con variantes (e.g. acentos, sufijos)
                    if (k) {
                        const list = Array.isArray(prevParams) ? prevParams : [];
                        const hit = list.find(p => {
                            const kn = normKey(p && p.nombre);
                            if (!kn) return false;
                            return kn.includes(k) || k.includes(kn);
                        });
                        if (hit) return hit;
                    }
                    if (typeof idx === 'number' && idx >= 0 && idx < prevParams.length) {
                        const cand = prevParams[idx];
                        const kn = normKey(cand && cand.nombre);
                        // Solo permitir fallback por índice si el nombre coincide razonablemente.
                        // Evita marcar evidencias en parámetros equivocados cuando cambia el orden entre versiones.
                        if (!k || !kn) return null;
                        if (kn === k || kn.includes(k) || k.includes(kn)) return cand;
                        return null;
                    }
                } catch {}
                return null;
            };

            const filas = Array.from(detalleContenedor.querySelectorAll('.parametros-fila'));
            filas.forEach((filaHtml, idx) => {
                try {
                    // Resetear flags por fila para evitar heredar evidencias de otro parámetro por re-render u órdenes distintos
                    try {
                        filaHtml.dataset.evid1Exists = '0';
                        filaHtml.dataset.evid2Exists = '0';
                        filaHtml.dataset.forceReplaceEvid1 = '0';
                    } catch {}

                    const nombreUi = filaHtml.querySelector('.col-nombre')?.textContent?.trim() || '';
                    const prev = findPrevParam(nombreUi, idx);
                    if (!prev) return;

                    try {
                        filaHtml.__prevParam = prev;
                    } catch {}

                    try {
                        filaHtml.__prevEvidenciasPorDano = (prev && prev.evidenciasPorDano && typeof prev.evidenciasPorDano === 'object') ? prev.evidenciasPorDano : {};
                    } catch {
                        filaHtml.__prevEvidenciasPorDano = {};
                    }
                    try {
                        const arr = Array.isArray(prev && prev.danosSeleccionados) ? prev.danosSeleccionados : [];
                        filaHtml.dataset.danosSel = JSON.stringify(arr.map(x => String(x || '').trim().toUpperCase()).filter(Boolean));
                    } catch {
                        filaHtml.dataset.danosSel = '[]';
                    }
                    try {
                        // Si viene legacy con un solo tipoDano, usarlo como seleccionado
                        const legacy = String(prev && prev.tipoDano ? prev.tipoDano : '').trim().toUpperCase();
                        if (legacy) {
                            const cur = JSON.parse(filaHtml.dataset.danosSel || '[]');
                            if (Array.isArray(cur) && !cur.includes(legacy)) {
                                cur.push(legacy);
                                filaHtml.dataset.danosSel = JSON.stringify(cur);
                            }
                        }
                    } catch {}

                    // Marcar existencia de evidencias aunque el preview no cargue (para evitar reemplazos accidentales)
                    try {
                        const has1 = !!(prev.evidenciaUrl || prev.evidenciaNombre || prev.evidenciaPath);
                        const has2 = !!(prev.evidenciaUrl2 || prev.evidenciaNombre2 || prev.evidenciaPath2);
                        filaHtml.dataset.evid1Exists = has1 ? '1' : '0';
                        filaHtml.dataset.evid2Exists = has2 ? '1' : '0';
                    } catch {}

                    const estado = String(prev.estado || '').trim().toUpperCase();
                    const sw = filaHtml.querySelector('.estado-switch-input');
                    if (sw) {
                        sw.checked = (estado === 'MALO');
                        try { sw.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
                    }

                    const colDano = filaHtml.querySelector('.col-dano');
                    const selDano = colDano ? colDano.querySelector(`select[name="param-${idx}-dano"]`) : null;
                    const inpOtro = colDano ? colDano.querySelector(`input[name="param-${idx}-dano-otro"]`) : null;
                    const tipoDano = String(prev.tipoDano || '').trim();
                    if (selDano && tipoDano) {
                        selDano.value = tipoDano;
                        try { selDano.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
                    }
                    if (inpOtro) {
                        const det = String(prev.detalleOtro || '').trim();
                        if (det) inpOtro.value = det;
                    }

                    const evidUrl = String(prev.evidenciaUrl || '').trim();
                    const imgPrev = document.getElementById(`preview-foto-${idx}`);
                    if (imgPrev && evidUrl) {
                        imgPrev.src = evidUrl;
                        imgPrev.style.display = '';
                    }

                    try {
                        if (imgPrev) {
                            imgPrev.setAttribute('data-evidencia-path', String(prev.evidenciaPath || '').trim());
                            imgPrev.setAttribute('data-evidencia-nombre', String(prev.evidenciaNombre || '').trim());
                        }
                    } catch {}

                    const evidUrl2 = String(prev.evidenciaUrl2 || '').trim();
                    const imgPrev2 = document.getElementById(`preview-foto2-${idx}`);
                    if (imgPrev2 && evidUrl2) {
                        imgPrev2.src = evidUrl2;
                        imgPrev2.style.display = '';
                        try { imgPrev2.dataset.evidenciaPath = String(prev.evidenciaPath2 || ''); } catch {}
                        try { imgPrev2.dataset.evidenciaNombre = String(prev.evidenciaNombre2 || ''); } catch {}
                    }
                } catch {}
            });

            // Fallback de previews en modo edición: si una foto no carga por URL/CORS, traer bytes vía SDK y mostrar blob:
            try {
                const { getStorage, ref: stRef, getBytes } = await import(
                    'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'
                );
                const storage = getStorage();
                const inspId = String(inspConUrls && inspConUrls.id ? inspConUrls.id : inspIdUrl).trim();
                const localId = String(inspConUrls && inspConUrls.localId ? inspConUrls.localId : '').trim();
                const actId = String(inspConUrls && inspConUrls.actividadId ? inspConUrls.actividadId : '').trim();

                const buildCandidatos = (imgEl, filaHtml) => {
                    const pathDirecto = String(imgEl.getAttribute('data-evidencia-path') || '').trim();
                    const nombre = String(imgEl.getAttribute('data-evidencia-nombre') || '').trim();
                    const candidatos = [];
                    if (pathDirecto) candidatos.push(pathDirecto);
                    if (nombre) {
                        if (inspId) candidatos.push(`inspecciones/${inspId}/${nombre}`);
                        if (localId) candidatos.push(`inspecciones/${localId}/${nombre}`);
                        if (actId) candidatos.push(`inspecciones/${actId}/${nombre}`);
                    }
                    // Si no hay metadata, pero sabemos que existe, intentar por convención localId/<nombre>
                    if (!candidatos.length) {
                        try {
                            const has1 = filaHtml && filaHtml.dataset && filaHtml.dataset.evid1Exists === '1';
                            const has2 = filaHtml && filaHtml.dataset && filaHtml.dataset.evid2Exists === '1';
                            if (has1 || has2) {
                                // sin nombre no podemos adivinar
                            }
                        } catch {}
                    }
                    return candidatos;
                };

                const intentarFallbackImg = async (imgEl, filaHtml) => {
                    try {
                        if (!imgEl) return;
                        if (imgEl.dataset && imgEl.dataset.pctBlobOk === '1') return;
                        const candidatos = buildCandidatos(imgEl, filaHtml);
                        if (!candidatos.length) return;

                        let bytes = null;
                        for (const pth of candidatos) {
                            try {
                                bytes = await getBytes(stRef(storage, pth));
                                if (bytes) break;
                            } catch {}
                        }
                        if (!bytes) return;
                        const blob = new Blob([bytes], { type: 'image/jpeg' });
                        const blobUrl = URL.createObjectURL(blob);
                        imgEl.src = blobUrl;
                        imgEl.dataset.pctBlobOk = '1';
                        imgEl.style.display = '';
                    } catch {}
                };

                filas.forEach((filaHtml, idx) => {
                    try {
                        const img1 = document.getElementById(`preview-foto-${idx}`);
                        const img2 = document.getElementById(`preview-foto2-${idx}`);

                        if (img1) {
                            img1.addEventListener('error', () => { intentarFallbackImg(img1, filaHtml); }, { once: true });
                            // Si ya debería existir pero no se ve, intentar inmediatamente
                            if (filaHtml.dataset.evid1Exists === '1' && (img1.naturalWidth === 0)) {
                                intentarFallbackImg(img1, filaHtml);
                            }
                        }
                        if (img2) {
                            img2.addEventListener('error', () => { intentarFallbackImg(img2, filaHtml); }, { once: true });
                            if (filaHtml.dataset.evid2Exists === '1' && (img2.naturalWidth === 0)) {
                                intentarFallbackImg(img2, filaHtml);
                            }
                        }
                    } catch {}
                });
            } catch {}

            try {
                const obsTxt = (inspConUrls.observacionesManual || '').toString();
                const inpObs = document.getElementById('insp-obs-text');
                if (inpObs) inpObs.value = obsTxt;
            } catch {}
            try {
                const obsUrl = (inspConUrls.observacionesFotoUrl || '').toString().trim();
                const imgObsPrev = document.getElementById('insp-obs-preview');
                if (imgObsPrev && obsUrl) {
                    imgObsPrev.src = obsUrl;
                    imgObsPrev.style.display = '';
                }
            } catch {}
            try {
                const obsUrl2 = (inspConUrls.observacionesFotoUrl2 || '').toString().trim();
                const imgObsPrev2 = document.getElementById('insp-obs-preview2');
                if (imgObsPrev2 && obsUrl2) {
                    imgObsPrev2.src = obsUrl2;
                    imgObsPrev2.style.display = '';
                }
            } catch {}
            try {
                if (typeof window.__pctSyncObsDeleteButtons === 'function') {
                    window.__pctSyncObsDeleteButtons();
                }
            } catch {}
            // sinDaño removido del UI
        } catch (e) {
            console.warn('No se pudo aplicar inspección existente en modo edición', e);
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
                const serialLine = serialTxt
                    ? `<div style="margin-top:2px; font-size:0.88em; color:#0f172a;">SERIAL: ${serialTxt}</div>`
                    : `<div style="margin-top:2px; font-size:0.88em; color:#64748b;">SIN SERIAL</div>`;
                const header = `<div><strong>${equipoTxt}</strong></div>${serialLine}`;
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

        inputEquipo.addEventListener('change', () => {
            try { hideEquipoDropdown(); } catch {}
        });

        inputEquipo.addEventListener('blur', () => {
            try { hideEquipoDropdown(); } catch {}
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
                const needs = params.some(p => p && (
                    (((p.evidenciaPath) || (p.evidenciaNombre)) && !p.evidenciaUrl) ||
                    (((p.evidenciaPath2) || (p.evidenciaNombre2)) && !p.evidenciaUrl2) ||
                    (p.evidenciasPorDano && Object.values(p.evidenciasPorDano || {}).some(ed => ed && (
                        (((ed.evidenciaPath) || (ed.evidenciaNombre)) && !ed.evidenciaUrl) ||
                        (((ed.evidenciaPath2) || (ed.evidenciaNombre2)) && !ed.evidenciaUrl2)
                    )))
                ));
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
                            if (!p) return p;

                            const next = { ...(p || {}) };

                            const resolver = async (candidatos) => {
                                const cands = Array.isArray(candidatos) ? candidatos.filter(Boolean) : [];
                                if (!cands.length) return '';
                                for (let pass = 0; pass < 2; pass++) {
                                    for (const path of cands) {
                                        try {
                                            const url = await getDownloadURL(stRef(storage, path));
                                            if (url) return url;
                                        } catch (e) {
                                            const code = (e && (e.code || e.name)) ? String(e.code || e.name) : '';
                                            console.warn('No se pudo resolver evidencia desde Storage', { path, code });
                                        }
                                    }
                                    if (pass === 0) await new Promise(r => setTimeout(r, 350));
                                }
                                return '';
                            };

                            if (!next.evidenciaUrl && (next.evidenciaPath || next.evidenciaNombre)) {
                                const candidatos = [];
                                const pathDirecto = String(next.evidenciaPath || '').trim();
                                if (pathDirecto) candidatos.push(pathDirecto);
                                const name = String(next.evidenciaNombre || '').trim();
                                if (name) {
                                    if (inspId) candidatos.push(`inspecciones/${inspId}/${name}`);
                                    if (localId) candidatos.push(`inspecciones/${localId}/${name}`);
                                    if (actId) candidatos.push(`inspecciones/${actId}/${name}`);
                                    if (inspIdQs) candidatos.push(`inspecciones/${inspIdQs}/${name}`);
                                    if (actIdQs) candidatos.push(`inspecciones/${actIdQs}/${name}`);
                                }
                                const url = await resolver(candidatos);
                                if (url) next.evidenciaUrl = url;
                            }

                            if (!next.evidenciaUrl2 && (next.evidenciaPath2 || next.evidenciaNombre2)) {
                                const candidatos = [];
                                const pathDirecto = String(next.evidenciaPath2 || '').trim();
                                if (pathDirecto) candidatos.push(pathDirecto);
                                const name = String(next.evidenciaNombre2 || '').trim();
                                if (name) {
                                    if (inspId) candidatos.push(`inspecciones/${inspId}/${name}`);
                                    if (localId) candidatos.push(`inspecciones/${localId}/${name}`);
                                    if (actId) candidatos.push(`inspecciones/${actId}/${name}`);
                                    if (inspIdQs) candidatos.push(`inspecciones/${inspIdQs}/${name}`);
                                    if (actIdQs) candidatos.push(`inspecciones/${actIdQs}/${name}`);
                                }
                                const url = await resolver(candidatos);
                                if (url) next.evidenciaUrl2 = url;
                            }

                            try {
                                const by = (next.evidenciasPorDano && typeof next.evidenciasPorDano === 'object') ? next.evidenciasPorDano : null;
                                if (by) {
                                    const nextBy = { ...(by || {}) };
                                    for (const k of Object.keys(nextBy)) {
                                        const ed = nextBy[k];
                                        if (!ed || typeof ed !== 'object') continue;
                                        const nextEd = { ...(ed || {}) };

                                        if (!nextEd.evidenciaUrl && (nextEd.evidenciaPath || nextEd.evidenciaNombre)) {
                                            const candidatos = [];
                                            const pathDirecto = String(nextEd.evidenciaPath || '').trim();
                                            if (pathDirecto) candidatos.push(pathDirecto);
                                            const name = String(nextEd.evidenciaNombre || '').trim();
                                            if (name) {
                                                if (inspId) candidatos.push(`inspecciones/${inspId}/${name}`);
                                                if (localId) candidatos.push(`inspecciones/${localId}/${name}`);
                                                if (actId) candidatos.push(`inspecciones/${actId}/${name}`);
                                                if (inspIdQs) candidatos.push(`inspecciones/${inspIdQs}/${name}`);
                                                if (actIdQs) candidatos.push(`inspecciones/${actIdQs}/${name}`);
                                            }
                                            const url = await resolver(candidatos);
                                            if (url) nextEd.evidenciaUrl = url;
                                        }

                                        if (!nextEd.evidenciaUrl2 && (nextEd.evidenciaPath2 || nextEd.evidenciaNombre2)) {
                                            const candidatos = [];
                                            const pathDirecto = String(nextEd.evidenciaPath2 || '').trim();
                                            if (pathDirecto) candidatos.push(pathDirecto);
                                            const name = String(nextEd.evidenciaNombre2 || '').trim();
                                            if (name) {
                                                if (inspId) candidatos.push(`inspecciones/${inspId}/${name}`);
                                                if (localId) candidatos.push(`inspecciones/${localId}/${name}`);
                                                if (actId) candidatos.push(`inspecciones/${actId}/${name}`);
                                                if (inspIdQs) candidatos.push(`inspecciones/${inspIdQs}/${name}`);
                                                if (actIdQs) candidatos.push(`inspecciones/${actIdQs}/${name}`);
                                            }
                                            const url = await resolver(candidatos);
                                            if (url) nextEd.evidenciaUrl2 = url;
                                        }

                                        nextBy[k] = nextEd;
                                    }
                                    next.evidenciasPorDano = nextBy;
                                }
                            } catch {}

                            return next;
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
                        const evidenciaUrl2 = ok(p && p.evidenciaUrl2);
                        const evidenciaNombre2 = ok(p && p.evidenciaNombre2);
                        const evidenciaPath2 = ok(p && p.evidenciaPath2);
                        const danosSel = Array.isArray(p && p.danosSeleccionados)
                            ? p.danosSeleccionados.map(x => String(x || '').trim()).filter(Boolean)
                            : [];
                        const by = (p && p.evidenciasPorDano && typeof p.evidenciasPorDano === 'object') ? p.evidenciasPorDano : null;
                        const danoTxt = (estado === 'MALO') ? (detalleOtro || (danosSel.length ? danosSel.join(', ') : (tipoDano || '')) || '') : '';
                        const badge = estado === 'MALO'
                            ? '<span style="display:inline-block; padding:2px 8px; border-radius:999px; background:#fef2f2; border:1px solid #fecaca; color:#991b1b; font-size:12px; font-weight:700;">MALO</span>'
                            : (estado === 'NO LEGIBLE'
                                ? '<span style="display:inline-block; padding:2px 8px; border-radius:999px; background:#fffbeb; border:1px solid #fde68a; color:#92400e; font-size:12px; font-weight:700;">NO LEGIBLE</span>'
                                : '<span style="display:inline-block; padding:2px 8px; border-radius:999px; background:#ecfdf5; border:1px solid #bbf7d0; color:#166534; font-size:12px; font-weight:700;">BUENO</span>');

                        const renderEvidSlot = ({ url, path, nombre, label }) => {
                            const u = ok(url).trim();
                            const pth = ok(path);
                            const nm = ok(nombre);
                            return `
                                <div style="min-width:220px; max-width:220px; flex:1;">
                                    <div style="font-size:11px; color:#64748b; margin-bottom:4px;">${label}</div>
                                    <img
                                        src="${u ? u : ''}"
                                        alt="Evidencia"
                                        class="insp-evid-thumb"
                                        data-full="${u ? u : ''}"
                                        data-evidencia-path="${pth}"
                                        data-evidencia-nombre="${nm}"
                                        crossorigin="anonymous"
                                        referrerpolicy="no-referrer"
                                        loading="eager"
                                        decoding="sync"
                                        style="max-width:220px; width:100%; height:auto; border-radius:10px; border:1px solid #e5e7eb; cursor:zoom-in; ${u ? '' : 'display:none;'}"
                                        onerror="try{if(window.__pctEvidFallback){window.__pctEvidFallback(this);} }catch(e){}"
                                    />
                                    <div class="insp-evid-fallback" style="margin-top:6px; font-size:12px; color:#64748b; ${u ? 'display:none;' : ''}">
                                        ${nm ? `Evidencia: ${nm}` : (pth ? 'Evidencia' : '')}
                                    </div>
                                </div>
                            `;
                        };

                        const renderEvidencia = ({ titulo, u1, n1, p1, u2, n2, p2 }) => {
                            const has = !!(ok(u1).trim() || ok(n1).trim() || ok(p1).trim() || ok(u2).trim() || ok(n2).trim() || ok(p2).trim());
                            if (!has) return '';
                            return `
                                <div style="margin-top:8px;">
                                    <div style="font-size:12px; color:#475569; margin-bottom:6px;">${titulo}</div>
                                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                                        ${renderEvidSlot({ url: u1, path: p1, nombre: n1, label: 'Foto 1' })}
                                        ${(ok(u2).trim() || ok(n2).trim() || ok(p2).trim()) ? renderEvidSlot({ url: u2, path: p2, nombre: n2, label: 'Foto 2' }) : ''}
                                    </div>
                                </div>
                            `;
                        };

                        let evidenciaHtml = '';
                        if (estado === 'MALO' && by && danosSel.length) {
                            const pieces = [];
                            danosSel.forEach((dkRaw) => {
                                const dk = String(dkRaw || '').trim().toUpperCase();
                                if (!dk) return;
                                const ed = by && by[dk] ? by[dk] : null;
                                if (!ed) return;
                                pieces.push(renderEvidencia({
                                    titulo: `Evidencia · ${dk}`,
                                    u1: ed.evidenciaUrl,
                                    n1: ed.evidenciaNombre,
                                    p1: ed.evidenciaPath,
                                    u2: ed.evidenciaUrl2,
                                    n2: ed.evidenciaNombre2,
                                    p2: ed.evidenciaPath2,
                                }));
                            });
                            evidenciaHtml = pieces.filter(Boolean).join('');
                        }

                        if (!evidenciaHtml) {
                            evidenciaHtml = renderEvidencia({
                                titulo: 'Evidencia',
                                u1: evidenciaUrl,
                                n1: evidenciaNombre,
                                p1: evidenciaPath,
                                u2: evidenciaUrl2,
                                n2: evidenciaNombre2,
                                p2: evidenciaPath2,
                            });
                        }

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
                    const obsFotoUrl2 = (data.observacionesFotoUrl2 || '').toString().trim();
                    const obsFotoPath2 = (data.observacionesFotoPath2 || '').toString().trim();
                    const obsFotoNombre2 = (data.observacionesFotoNombre2 || '').toString().trim();

                    const obsHtml = (obsManual || obsFotoUrl || obsFotoPath || obsFotoNombre || obsFotoUrl2 || obsFotoPath2 || obsFotoNombre2)
                        ? `
                            <div style="margin: 10px 0 12px; border:1px solid #e5e7eb; border-radius:12px; padding:12px; background:#ffffff;">
                                <div style="font-weight:900; color:#0f172a; margin-bottom:6px;">OBSERVACIONES</div>
                                ${obsManual ? `<div style="white-space:pre-wrap; color:#0f172a;">${escapeHtml(obsManual)}</div>` : '<div style="color:#6b7280;">(Sin observaciones)</div>'}
                                <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:10px;">
                                    ${(obsFotoUrl || obsFotoPath || obsFotoNombre) ? `
                                        <div>
                                            <img
                                                src="${obsFotoUrl ? obsFotoUrl : ''}"
                                                alt="Foto observaciones 1"
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
                                    ${(obsFotoUrl2 || obsFotoPath2 || obsFotoNombre2) ? `
                                        <div>
                                            <img
                                                src="${obsFotoUrl2 ? obsFotoUrl2 : ''}"
                                                alt="Foto observaciones 2"
                                                class="insp-evid-thumb"
                                                data-full="${obsFotoUrl2 ? obsFotoUrl2 : ''}"
                                                data-evidencia-path="${escapeHtml(obsFotoPath2)}"
                                                data-evidencia-nombre="${escapeHtml(obsFotoNombre2)}"
                                                crossorigin="anonymous"
                                                referrerpolicy="no-referrer"
                                                loading="eager"
                                                decoding="sync"
                                                style="max-width:260px; width:100%; height:auto; border-radius:10px; border:1px solid #e5e7eb; cursor:zoom-in; ${obsFotoUrl2 ? '' : 'display:none;'}"
                                                onerror="try{if(window.__pctEvidFallback){window.__pctEvidFallback(this);} }catch(e){}"
                                            />
                                            <div class="insp-evid-fallback" style="margin-top:6px; font-size:12px; color:#64748b; ${obsFotoUrl2 ? 'display:none;' : ''}">
                                                ${(obsFotoNombre2 ? `Evidencia: ${escapeHtml(obsFotoNombre2)}` : (obsFotoPath2 ? 'Evidencia' : ''))}
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
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
    fetch('docs/INVENTARIOTOTAL04-202602.csv', { cache: 'no-store' })
        .then(response => {
            if (!response.ok) {
                throw new Error('No se pudo cargar INVENTARIOTOTAL04-202602.csv');
            }
            return response.text();
        })
        .then(texto => {
            const lineas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
            if (lineas.length === 0) return;

            const cleanStr = (v) => {
                try {
                    return String(v || '')
                        .replace(/\u00A0/g, ' ')
                        .replace(/[\u200B-\u200D\uFEFF]+/g, '')
                        .trim();
                } catch {
                    return '';
                }
            };

            headers = parseCSVLine(lineas[0]);
            const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
            const idxDescripcion = headers.indexOf('DESCRIPCION');
            const idxEdo = headers.indexOf('EDO');
            const idxSerial = getIdxSerial(headers);

            equipos = lineas.slice(1).map(linea => {
                const cols = parseCSVLine(linea);
                // Asegurar que todas las filas tengan el mismo número de columnas que el header.
                // Evita que índices como SERIAL queden fuera de rango cuando la fila termina "corta".
                if (cols.length < headers.length) {
                    cols.length = headers.length;
                    for (let i = 0; i < cols.length; i++) {
                        if (typeof cols[i] === 'undefined') cols[i] = '';
                    }
                }
                return cols;
            });

            try {
                window.__invHeaders = headers;
                window.__invEquipos = equipos;
            } catch {}

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

                const equipoIdClean = cleanStr(equipoId);
                const descripcionClean = cleanStr(descripcion);
                const serialCleanRaw = cleanStr(serial);
                const serialClean = serialCleanRaw || equipoIdClean;

                equiposActivos.push({
                    equipoId: equipoIdClean,
                    descripcion: descripcionClean,
                    serial: serialClean,
                    equipoKey: equipoIdKey,
                    descKey: normKey(descripcionClean),
                    serialKey: normKey(serialClean)
                });

                if (datalistEquipos) {
                    const option = document.createElement('option');
                    option.value = equipoIdClean;
                    option.label = serialClean ? `SERIAL: ${serialClean}` : 'SIN SERIAL';
                    datalistEquipos.appendChild(option);
                }
            });

            inventarioCargado = true;
            // Intentar inicializar desde actividadId si aplica
            inicializarDesdeActividadUrl();
            // Si el usuario ya seleccionó/escribió un equipo antes de terminar de cargar el CSV,
            // refrescar la ficha y parámetros ahora que el inventario ya está listo.
            try {
                if (inputEquipo && inputEquipo.value && inputEquipo.value.trim()) {
                    actualizarDetalleDesdeInput();
                }
            } catch {}
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
        .then(r => r.ok ? r.text() : Promise.reject(new Error('No se pudo cargar forxmat.csv')))
        .then(txt => {
            const lineas = txt.split(/\r?\n/).filter(l => l.trim() !== '');
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
            // Edición (si viene inspId sin view=1)
            aplicarInspeccionExistenteEditable();
            // Si el usuario ya seleccionó/escribió un equipo antes de terminar de cargar forxmat.csv,
            // refrescar la ficha y parámetros ahora que los formatos ya están listos.
            try {
                if (inputEquipo && inputEquipo.value && inputEquipo.value.trim()) {
                    actualizarDetalleDesdeInput();
                }
            } catch {}
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

    // Cargar tabla de Anillo retenedor por activo (override de parámetros)
    fetch('docs/TUBERIA4206conanilloretenedor.csv', { cache: 'no-store' })
        .then(r => r.ok ? r.text() : Promise.reject(new Error('No se pudo cargar TUBERIA4206conanilloretenedor.csv')))
        .then(txt => {
            try {
                const lineas = String(txt || '').split(/\r?\n/).filter(l => l.trim() !== '');
                if (!lineas.length) {
                    anilloRetenedorPorActivo = new Map();
                    return;
                }
                const h = parseCSVLine(lineas[0]).map(x => String(x || '').trim().toUpperCase());
                const idxActivo = h.indexOf('ACTIVO');
                const idxAnillo = h.indexOf('ANILLO RETENEDOR');
                if (idxActivo < 0 || idxAnillo < 0) {
                    anilloRetenedorPorActivo = new Map();
                    return;
                }
                const normKey = (s) => (s || '').toString().trim().toUpperCase().replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
                const m = new Map();
                lineas.slice(1).forEach(l => {
                    const cols = parseCSVLine(l);
                    const activo = idxActivo >= 0 ? (cols[idxActivo] || '') : '';
                    const anillo = idxAnillo >= 0 ? (cols[idxAnillo] || '') : '';
                    const k = normKey(activo);
                    if (!k) return;
                    const v = String(anillo || '').trim().toUpperCase();
                    if (v === 'SI' || v === 'S' || v === 'YES' || v === 'Y' || v === '1' || v === 'TRUE') m.set(k, true);
                    else if (v === 'NO' || v === 'N' || v === '0' || v === 'FALSE') m.set(k, false);
                });
                anilloRetenedorPorActivo = m;
            } catch {
                anilloRetenedorPorActivo = new Map();
            }
        })
        .catch(err => {
            console.warn('No se pudo cargar docs/TUBERIA4206conanilloretenedor.csv', err);
            anilloRetenedorPorActivo = new Map();
        });
    
    // Cuando el usuario escribe y elige un equipo en el input/datalist
    function actualizarDetalleDesdeInput() {
        const valor = inputEquipo.value.trim();
        try {
            const vUp = (valor || '').toString().trim().toUpperCase();
            esEquipoTercero = (vUp === 'TERCERO') || vUp.startsWith('TERCERO ' ) || vUp.startsWith('TERCERO·') || vUp.startsWith('TERCERO-') || vUp.startsWith('TERCERO·') || vUp.startsWith('TERCERO');
        } catch {
            esEquipoTercero = (valor || '').toString().trim().toUpperCase() === 'TERCERO';
        }
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
            // Regla: si no existe en inventario, tratarlo como TERCERO automáticamente
            if (!esEquipoTercero) {
                esEquipoTercero = true;
                try { terceroEquipoUrl = String(valor || '').trim(); } catch {}
                try {
                    if (inputEquipo) {
                        const ref = String(valor || '').trim();
                        inputEquipo.value = ref ? `TERCERO ${ref}` : 'TERCERO';
                    }
                } catch {}
            }
            // Para TERCERO: permitir capturar inspección (datos tercero + estado general + observaciones)
            fila = [];
        }

        // Índices de columnas relevantes
        const idxProducto = headers.indexOf('PRODUCTO');
        const idxDescripcion = headers.indexOf('DESCRIPCION');
        const idxDiam1 = headers.indexOf('DIAMETRO 1');
        const idxTipo1 = headers.indexOf('TIPO 1');
        const idxCon1 = headers.indexOf('CONEXIÓN 1');
        const idxCon2 = headers.indexOf('CONEXIÓN 2');
        const idxCon3 = headers.indexOf('CONEXIÓN 3');
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
        let formatoLista = (reporte && formatosPorCodigo[reporte])
            ? formatosPorCodigo[reporte]
            : (reporteNorm && formatosPorCodigo[reporteNorm])
                ? formatosPorCodigo[reporteNorm]
                : null;

        // TEEs: algunos reportes vienen como "TEE 2 (HXMXH O MXHXH)" y el catálogo de formatos
        // puede existir solo para una de las variantes (p.ej. "TEE M X H X H").
        // Intentar ambas variantes antes de concluir que no hay parámetros.
        if (!formatoLista) {
            try {
                const repStr = String(reporte || '').toUpperCase();
                const m = repStr.match(/\bTEE\s*\d+\s*\(([^)]+)\)/);
                if (m && m[0] && m[1] && /\bO\b/.test(m[1])) {
                    const parts = m[1].split(/\bO\b/).map(p => String(p || '').trim()).filter(Boolean);
                    const toPattern = (p) => {
                        const raw = String(p || '').toUpperCase().replace(/[^A-Z]/g, '');
                        const chars = raw.split('').filter(c => c === 'H' || c === 'M');
                        return chars.length ? `TEE ${chars.join(' X ')}` : 'TEE';
                    };
                    for (const p of parts) {
                        const repAlt = repStr.replace(m[0], toPattern(p));
                        const k = normFormatoKey(repAlt);
                        if (k && formatosPorCodigo[k]) {
                            formatoLista = formatosPorCodigo[k];
                            break;
                        }
                    }
                }
            } catch {}
        }
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

        const normParam = (s) => (s || '')
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();

        // Regla: parámetro "Anillo retenedor" definido por CSV (SI/NO) por activo
        const kActivo = norm(valor);
        const tieneAnillo = (anilloRetenedorPorActivo && anilloRetenedorPorActivo.has(kActivo))
            ? !!anilloRetenedorPorActivo.get(kActivo)
            : false;
        const baseSinAnillo = parametrosInspeccion.filter(p => {
            const np = normParam(p);
            if (!np) return true;
            return !np.includes('anillo retenedor');
        });
        const yaTraeAnillo = parametrosInspeccion.some(p => {
            const np = normParam(p);
            return !!(np && np.includes('anillo retenedor'));
        });
        let parametrosInspeccionFiltrados = tieneAnillo
            ? (yaTraeAnillo ? parametrosInspeccion : baseSinAnillo.concat(['Anillo retenedor']))
            : baseSinAnillo;

        // Regla TERCERO: no se inspeccionan/evalúan parámetros del formato.
        // Solo se captura Estado General (con foto) y observaciones (obligatorias).
        if (esEquipoTercero) {
            parametrosInspeccionFiltrados = ['Estado General'];
        }

        // Regla: Insertos
        // - Para todos los TUBO 4206: quitar el parámetro de insertos
        // - Para TUBO 1502 y 602: asegurar que sí exista el parámetro de insertos
        try {
            const productoUpper = (get(idxProducto) || '').toString().toUpperCase().trim();
            const descUpper = (get(idxDescripcion) || '').toString().toUpperCase();
            const esTubo = productoUpper.includes('TUBO') || /^TUBO\b/.test(productoUpper);
            const es4206 = /\b4206\b/.test(descUpper) || /\b4\s*206\b/.test(descUpper);
            const es1502 = /\b1502\b/.test(descUpper) || /\b1\s*502\b/.test(descUpper);
            const es602 = /\b602\b/.test(descUpper) || /\b6\s*02\b/.test(descUpper);

            const isInsertos = (p) => {
                const np = normParam(p);
                return !!(np && (np.includes('insertos') || np.includes('inserto')));
            };
            const sinInsertos = (arr) => (arr || []).filter(p => !isInsertos(p));
            const traeInsertos = (arr) => (arr || []).some(p => isInsertos(p));

            if (esTubo && es4206) {
                parametrosInspeccionFiltrados = sinInsertos(parametrosInspeccionFiltrados);
            } else if (esTubo && (es1502 || es602)) {
                if (!traeInsertos(parametrosInspeccionFiltrados)) {
                    parametrosInspeccionFiltrados = parametrosInspeccionFiltrados.concat(['Insertos']);
                }
            }
        } catch {}

        // Duplicar 'Área de sellado' -> 'Área de sellado A' y 'Área de sellado B' para productos aplicables (CA, CE, DSA, Brida de paso)
        const productoStr = (get(idxProducto) || '').toString().toUpperCase();
        const equipoStr = String(valor || '').toUpperCase();
        const descripcionStr = (get(idxDescripcion) || '').toString().toUpperCase();
        const textoEquipo = `${productoStr} ${equipoStr} ${descripcionStr}`;
        const esTee = /\bTEE\b|TEES/.test(textoEquipo);
        const aplicaCaraAB = !esTee && /CARRETE ADAPTADOR|CARRETE ESPACIADOR|BRIDA ADAPTADORA|BRIDA DE PASO|\bXO\b|\bDSA\b|\bSSA\b/.test(
            textoEquipo
        );
        const parametrosRender = (() => {
            if (!esTee && !aplicaCaraAB) return parametrosInspeccionFiltrados.slice();

            const connLetters = (v) => {
                const t = (v || '').toString().toUpperCase().trim();
                if (t === 'H' || t === 'M') return t;
                return '';
            };

            // Para TEEs, preferir las letras H/M desde CONEXIÓN 1/2/3 (como vienen en el CSV).
            // Fallback: intentar inferir desde TIPO 1 si viniera como 'HMH' (caso antiguo).
            const c1 = connLetters(get(idxCon1));
            const c2 = connLetters(get(idxCon2));
            const c3 = connLetters(get(idxCon3));
            const tipoTeeRaw = (get(idxTipo1) || '').toString().toUpperCase().trim();
            const fromTipo = /^[A-Z]{3}$/.test(tipoTeeRaw) ? tipoTeeRaw.split('') : [];
            const teeLados = (c1 && c2 && c3)
                ? [c1, c2, c3]
                : (fromTipo.length === 3 ? fromTipo : ['1', '2', '3']);

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
                const esXO = /\bXO\b/.test(textoEquipo);
                const resto = [];
                let tieneSellado = false;
                let tieneEsp = false;
                let tieneRosca = false;
                let tienePinon = false;

                parametrosInspeccionFiltrados.forEach(p => {
                    const np = normParam(p);
                    if (isAreaSellado(np)) {
                        tieneSellado = true;
                        return;
                    }
                    if (isEsparragosTuercas(np)) {
                        tieneEsp = true;
                        return;
                    }
                    if (esXO && np && np.includes('rosca')) {
                        tieneRosca = true;
                        return;
                    }
                    if (esXO && np && (np.includes('piñon') || np.includes('pinon'))) {
                        tienePinon = true;
                        return;
                    }
                    resto.push(p);
                });

                const out = [];
                if (tieneSellado) out.push('Área de sellado A');
                if (tieneEsp) out.push('Espárragos y tuercas A');

                // XO: expandir rosca/piñón por lado (A/B) según CONEXIÓN 1/2 (H/M)
                if (esXO) {
                    const ladoA = String(c1 || 'A').toUpperCase();
                    const ladoB = String(c2 || 'B').toUpperCase();
                    const roscaOut = [];
                    const pinonOut = [];
                    try {
                        if (ladoA === 'H') roscaOut.push('Rosca A (H)');
                        if (ladoA === 'M') pinonOut.push('Piñón A (M)');
                        if (ladoB === 'H') roscaOut.push('Rosca B (H)');
                        if (ladoB === 'M') pinonOut.push('Piñón B (M)');
                    } catch {}

                    // Si el formato traía rosca/piñón, reemplazar por el bloque completo.
                    // Si no lo traía pero el tipo lo requiere, también agregarlo.
                    if ((tieneRosca || tienePinon) || roscaOut.length || pinonOut.length) {
                        roscaOut.forEach(x => out.push(x));
                        pinonOut.forEach(x => out.push(x));
                    }
                }

                if (tieneSellado) out.push('Área de sellado B');
                if (tieneEsp) out.push('Espárragos y tuercas B');
                return out.concat(resto);
            }

            // TEES: 3 lados desde el tipo (p.ej. HMH)
            const out = [];
            const isRosca = (np) => !!(np && np.includes('rosca'));
            const isPinon = (np) => !!(np && (np.includes('piñon') || np.includes('pinon')));
            const roscaLabels = [];
            const pinonLabels = [];
            try {
                for (let i = 0; i < 3; i++) {
                    const lado = String(teeLados[i] || '').toUpperCase();
                    if (lado === 'H') roscaLabels.push(`Rosca ${roscaLabels.length + 1} (H)`);
                    if (lado === 'M') pinonLabels.push(`Piñón ${pinonLabels.length + 1} (M)`);
                }
            } catch {}

            let roscaEmitted = false;
            let pinonEmitted = false;
            parametrosInspeccionFiltrados.forEach(p => {
                const np = normParam(p);
                if (isAreaSellado(np)) {
                    out.push(`Área de sellado 1 (${teeLados[0] || '1'})`);
                    out.push(`Área de sellado 2 (${teeLados[1] || '2'})`);
                    out.push(`Área de sellado 3 (${teeLados[2] || '3'})`);
                    return;
                }

                // TEEs: repetir roscas/piñones según configuración H/M.
                if (isRosca(np)) {
                    // Emitir el bloque completo (roscas + piñones) en la primera aparición
                    // para mantenerlos juntos operativamente.
                    if (!roscaEmitted || !pinonEmitted) {
                        if (!roscaEmitted) roscaLabels.forEach(lbl => out.push(lbl));
                        if (!pinonEmitted) pinonLabels.forEach(lbl => out.push(lbl));
                        roscaEmitted = true;
                        pinonEmitted = true;
                    }
                    return;
                }
                if (isPinon(np)) {
                    if (!roscaEmitted || !pinonEmitted) {
                        if (!roscaEmitted) roscaLabels.forEach(lbl => out.push(lbl));
                        if (!pinonEmitted) pinonLabels.forEach(lbl => out.push(lbl));
                        roscaEmitted = true;
                        pinonEmitted = true;
                    }
                    return;
                }

                out.push(p);
            });

            // Si el formato no traía explícitamente rosca/piñón, pero el tipo H/M lo requiere, agregarlos.
            if ((!roscaEmitted || !pinonEmitted) && (roscaLabels.length || pinonLabels.length)) {
                if (!roscaEmitted) roscaLabels.forEach(lbl => out.push(lbl));
                if (!pinonEmitted) pinonLabels.forEach(lbl => out.push(lbl));
            }
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
        function obtenerTiposDano(nombreParametro, opts) {
            const base = (nombreParametro || '').toLowerCase();
            const o = opts || {};

            // Fleje: usar BUENO/MALO y si es MALO, permitir seleccionar tipo de daño
            if (base.includes('fleje')) {
                // Algunos equipos no llevan fleje pero sí rótulo/identificador
                if (o.usarRotuloEnLugarDeFleje) {
                    return [
                        '',
                        'DEFORMADO',
                        'NO LEGIBLE',
                        'SIN ROTULO'
                    ];
                }
                return [
                    '',
                    'DEFORMADO',
                    'NO LEGIBLE',
                    'SIN FLEJE'
                ];
            }

            // Rótulo / Identificador
            if (base.includes('rotulo') || base.includes('rótulo') || base.includes('identificador')) {
                return [
                    '',
                    'DEFORMADO',
                    'NO LEGIBLE',
                    'SIN ROTULO'
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

        const equipoSinFlejeConRotulo = /BRIDA CIEGA|BRIDA DE PRUEBA|BRIDA DE PASO|BRIDA ADAPTADORA/.test(textoEquipo);

        const puedeSubirEvidencia2 = !!(window.isAdmin || window.isDirector || window.isSgi);

        const esNuevaInspeccion = !inspeccionIsEditingExisting;
        const parametrosRenderFinal = (esNuevaInspeccion && parametrosRender.length)
            ? ['Estado General'].concat(parametrosRender)
            : parametrosRender;

        let parametrosHtml = parametrosRenderFinal.length
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
                        ${parametrosRenderFinal.map((p, idx) => {
                            const baseNombre = (p || '').toLowerCase();
                            const esEstadoGeneral = baseNombre.trim() === 'estado general';
                            const esFleje = baseNombre.includes('fleje');
                            const nombreMostrar = (esFleje && equipoSinFlejeConRotulo) ? 'Rótulo / Identificador' : p;

                            if (esEstadoGeneral) {
                                return `
                            <div class="parametros-fila" data-estado-general="1" data-estado-calc="BUENO">
                                <div class="col-nombre">${nombreMostrar}</div>
                                <div class="col-estado" style="font-weight:700;">
                                    <span data-estado-general-label>BUENO</span>
                                </div>
                                <div class="col-dano" data-param-idx="${idx}" style="display:none;"></div>
                                <div class="col-evidencia" data-param-idx="${idx}">
                                    <button type="button" class="btn btn-tomar-foto" data-idx="${idx}">Tomar foto</button>
                                    <button type="button" class="btn btn-subir-foto" data-idx="${idx}">Subir foto</button>
                                    <input type="file" name="param-${idx}-foto" accept="image/*" style="display:none;">
                                    <img alt="preview" id="preview-foto-${idx}" style="display:none; max-height:64px; border-radius:6px; margin-top:4px; border:1px solid #e5e7eb;" />
                                    <button type="button" class="btn btn-eliminar-foto" data-idx="${idx}" style="display:none; margin-top:4px;">Eliminar foto 1</button>
                                    <button type="button" class="btn btn-modificar-foto" data-idx="${idx}" style="display:none; margin-top:4px;">Modificar foto 1</button>

                                    <div style="margin-top:8px; ${puedeSubirEvidencia2 ? '' : 'display:none;'}">
                                        <button type="button" class="btn btn-tomar-foto2" data-idx="${idx}">Tomar foto 2</button>
                                        <button type="button" class="btn btn-subir-foto2" data-idx="${idx}">Subir foto 2</button>
                                        <input type="file" name="param-${idx}-foto2" accept="image/*" style="display:none;">
                                    </div>
                                    <img alt="preview" id="preview-foto2-${idx}" style="display:none; max-height:64px; border-radius:6px; margin-top:4px; border:1px solid #e5e7eb;" />
                                    <button type="button" class="btn btn-eliminar-foto2" data-idx="${idx}" style="display:none; margin-top:4px;">Eliminar foto 2</button>
                                </div>
                            </div>
                        `;
                            }
                            // Caso especial: Recubrimiento no lleva selector de daños, solo BUENO/MALO
                            if (baseNombre.includes('recubrimiento')) {
                                return `
                            <div class="parametros-fila">
                                <div class="col-nombre">${nombreMostrar}</div>
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
                                    <button type="button" class="btn btn-eliminar-foto" data-idx="${idx}" style="display:none; margin-top:4px;">Eliminar foto 1</button>
                                    <button type="button" class="btn btn-modificar-foto" data-idx="${idx}" style="display:none; margin-top:4px;">Modificar foto 1</button>

                                    <div style="margin-top:8px; ${puedeSubirEvidencia2 ? '' : 'display:none;'}">
                                        <button type="button" class="btn btn-tomar-foto2" data-idx="${idx}">Tomar foto 2</button>
                                        <button type="button" class="btn btn-subir-foto2" data-idx="${idx}">Subir foto 2</button>
                                        <input type="file" name="param-${idx}-foto2" accept="image/*" style="display:none;">
                                    </div>
                                    <img alt="preview" id="preview-foto2-${idx}" style="display:none; max-height:64px; border-radius:6px; margin-top:4px; border:1px solid #e5e7eb;" />
                                    <button type="button" class="btn btn-eliminar-foto2" data-idx="${idx}" style="display:none; margin-top:4px; ${puedeSubirEvidencia2 ? '' : 'display:none;'}">Eliminar foto 2</button>
                                </div>
                            </div>
                        `;
                            }

                            const tiposDano = obtenerTiposDano(p, { usarRotuloEnLugarDeFleje: (esFleje && equipoSinFlejeConRotulo) });
                            return `
                            <div class="parametros-fila">
                                <div class="col-nombre">${nombreMostrar}</div>
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
                                    <button type="button" class="btn btn-eliminar-foto" data-idx="${idx}" style="display:none; margin-top:4px;">Eliminar foto 1</button>

                                    <button type="button" class="btn btn-modificar-foto" data-idx="${idx}" style="display:none; margin-top:4px;">Modificar foto 1</button>

                                    <div style="margin-top:8px; ${puedeSubirEvidencia2 ? '' : 'display:none;'}">
                                        <button type="button" class="btn btn-tomar-foto2" data-idx="${idx}">Tomar foto 2</button>
                                        <button type="button" class="btn btn-subir-foto2" data-idx="${idx}">Subir foto 2</button>
                                        <input type="file" name="param-${idx}-foto2" accept="image/*" style="display:none;">
                                    </div>
                                    <img alt="preview" id="preview-foto2-${idx}" style="display:none; max-height:64px; border-radius:6px; margin-top:4px; border:1px solid #e5e7eb;" />
                                    <button type="button" class="btn btn-eliminar-foto2" data-idx="${idx}" style="display:none; margin-top:4px; ${puedeSubirEvidencia2 ? '' : 'display:none;'}">Eliminar foto 2</button>
                                </div>
                            </div>
                        `;
                        }).join('')}
                    </div>
                </div>
            `
            : '';

        if (esEquipoTercero) {
            const escAttr = (s) => (s == null ? '' : String(s)).replace(/"/g, '&quot;');
            parametrosHtml = `
                <div class="parametros-inspeccion">
                    <h3>Datos de tercero</h3>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                        <div>
                            <label style="display:block; font-size:0.85rem; font-weight:700; color:#374151; margin-bottom:4px;">Compañía de tercero</label>
                            <input id="insp-tercero-compania" type="text" value="${escAttr(terceroPropiedadUrl)}" placeholder="Empresa propietaria" style="width:100%; padding:0.55rem; border:1px solid #e5e7eb; border-radius:10px; font-size:0.9rem;">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.85rem; font-weight:700; color:#374151; margin-bottom:4px;">Configuración del equipo</label>
                            <input id="insp-tercero-config" type="text" value="${escAttr(terceroConfiguracionUrl)}" placeholder="Ej. 3\" 1502, HMH, etc." style="width:100%; padding:0.55rem; border:1px solid #e5e7eb; border-radius:10px; font-size:0.9rem;">
                        </div>
                        <div style="grid-column:1 / -1;">
                            <label style="display:block; font-size:0.85rem; font-weight:700; color:#374151; margin-bottom:4px;">Descripción</label>
                            <input id="insp-tercero-desc" type="text" value="${escAttr(terceroDescripcionUrl)}" placeholder="Describe el equipo" style="width:100%; padding:0.55rem; border:1px solid #e5e7eb; border-radius:10px; font-size:0.9rem;">
                        </div>
                    </div>

                    <h3 style="margin:0 0 8px;">Estado general</h3>
                    <div class="parametros-tabla">
                        <div class="parametros-header">
                            <div class="col-nombre">Parámetro</div>
                            <div class="col-estado">Estado</div>
                            <div class="col-dano">Tipo de daño</div>
                            <div class="col-evidencia">Evidencia</div>
                        </div>
                        <div class="parametros-fila" data-estado-general="1" data-estado-calc="BUENO">
                            <div class="col-nombre">Estado General</div>
                            <div class="col-estado" style="font-weight:700;">
                                <span data-estado-general-label>BUENO</span>
                            </div>
                            <div class="col-dano" data-param-idx="0" style="display:none;"></div>
                            <div class="col-evidencia" data-param-idx="0">
                                <button type="button" class="btn btn-tomar-foto" data-idx="0">Tomar foto</button>
                                <button type="button" class="btn btn-subir-foto" data-idx="0">Subir foto</button>
                                <input type="file" name="param-0-foto" accept="image/*" style="display:none;">
                                <img alt="preview" id="preview-foto-0" style="display:none; max-height:64px; border-radius:6px; margin-top:4px; border:1px solid #e5e7eb;" />
                                <button type="button" class="btn btn-eliminar-foto" data-idx="0" style="display:none; margin-top:4px;">Eliminar foto 1</button>
                                <button type="button" class="btn btn-modificar-foto" data-idx="0" style="display:none; margin-top:4px;">Modificar foto 1</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        const con1Val = get(idxCon1);
        const con2Val = get(idxCon2);
        const con3Val = get(idxCon3);
        const showVal = (v) => {
            const s = (v == null) ? '' : String(v);
            const t = s.trim();
            return t ? t : '—';
        };
        const hasVal = (v) => {
            const s = (v == null) ? '' : String(v);
            return !!s.trim();
        };

        const equipoDisplay = esEquipoTercero
            ? `TERCERO${terceroEquipoUrl ? ` ${terceroEquipoUrl}` : ''}`
            : get(idxEquipo);
        const productoDisplay = esEquipoTercero ? '—' : get(idxProducto);
        const serialDisplay = esEquipoTercero ? '—' : get(idxSerial);
        const descBase = esEquipoTercero ? (terceroDescripcionUrl || 'EQUIPO DE TERCERO') : get(idxDescripcion);
        const descExtra = esEquipoTercero
            ? `
                ${(terceroPropiedadUrl || '').trim() ? `<div style="color:#6b7280; font-size:0.85rem; margin-top:4px;">Propiedad: ${terceroPropiedadUrl}</div>` : ''}
            `
            : '';

        detalleContenedor.innerHTML = `
            <div class="detalle-grid">
                <div class="detalle-item">
                    <div class="detalle-item-label">Equipo / activo</div>
                    <div class="detalle-item-valor">${equipoDisplay}</div>
                </div>
                <div class="detalle-item">
                    <div class="detalle-item-label">Producto</div>
                    <div class="detalle-item-valor">${productoDisplay}</div>
                </div>
                <div class="detalle-item">
                    <div class="detalle-item-label">Serial</div>
                    <div class="detalle-item-valor">${serialDisplay}</div>
                </div>
                <div class="detalle-item" style="grid-column: 1 / -1;">
                    <div class="detalle-item-label">Descripción</div>
                    <div class="detalle-item-valor">${descBase}${descExtra}</div>
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
                    <div class="detalle-item-valor">${showVal(con1Val)}</div>
                </div>
                ${hasVal(con2Val) ? `
                <div class="detalle-item">
                    <div class="detalle-item-label">Conexión 2</div>
                    <div class="detalle-item-valor">${showVal(con2Val)}</div>
                </div>
                ` : ''}
                ${hasVal(con3Val) ? `
                <div class="detalle-item">
                    <div class="detalle-item-label">Conexión 3</div>
                    <div class="detalle-item-valor">${showVal(con3Val)}</div>
                </div>
                ` : ''}
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
                <textarea id="insp-obs-text" rows="3" placeholder="${esEquipoTercero ? 'Comentarios (requerido para TERCERO)' : 'Escribe observaciones generales (opcional)'}" style="width:100%; resize:vertical; padding:0.6rem; border:1px solid #e5e7eb; border-radius:10px; font-size:0.9rem;"></textarea>
                <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap; align-items:flex-start;">
                    <div>
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                            <button type="button" class="btn" id="insp-obs-tomar-foto">Tomar foto 1</button>
                            <button type="button" class="btn" id="insp-obs-subir-foto">Subir foto 1</button>
                            <input type="file" id="insp-obs-foto" accept="image/*" style="display:none;">
                        </div>
                        <img alt="preview" id="insp-obs-preview" style="display:none; max-height:80px; border-radius:10px; margin-top:6px; border:1px solid #e5e7eb;" />
                    </div>
                    <div>
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                            <button type="button" class="btn" id="insp-obs-tomar-foto2">Tomar foto 2</button>
                            <button type="button" class="btn" id="insp-obs-subir-foto2">Subir foto 2</button>
                            <input type="file" id="insp-obs-foto2" accept="image/*" style="display:none;">
                        </div>
                        <img alt="preview" id="insp-obs-preview2" style="display:none; max-height:80px; border-radius:10px; margin-top:6px; border:1px solid #e5e7eb;" />
                    </div>
                </div>
            </div>
        `;

        try { fotoObs = null; } catch {}
        try { fotoObs2 = null; } catch {}
        try { borrarFotoObs = false; } catch {}
        try { borrarFotoObs2 = false; } catch {}
        try {
            const btnTomarObs = document.getElementById('insp-obs-tomar-foto');
            const btnSubirObs = document.getElementById('insp-obs-subir-foto');
            const inputObsFoto = document.getElementById('insp-obs-foto');
            const imgObsPrev = document.getElementById('insp-obs-preview');
            const puedeEliminarObs = !!(window.isAdmin || window.isSgi);
            const puedeSubirArchivoObs = !!(window.isAdmin || window.isSgi);

            const btnTomarObs2 = document.getElementById('insp-obs-tomar-foto2');
            const btnSubirObs2 = document.getElementById('insp-obs-subir-foto2');
            const inputObsFoto2 = document.getElementById('insp-obs-foto2');
            const imgObsPrev2 = document.getElementById('insp-obs-preview2');
            let btnDelObs = document.getElementById('insp-obs-eliminar-foto');
            let btnDelObs2 = document.getElementById('insp-obs-eliminar-foto2');

            try {
                if (btnSubirObs) btnSubirObs.style.display = puedeSubirArchivoObs ? '' : 'none';
                if (btnSubirObs2) btnSubirObs2.style.display = puedeSubirArchivoObs ? '' : 'none';
                if (inputObsFoto) inputObsFoto.disabled = !puedeSubirArchivoObs;
                if (inputObsFoto2) inputObsFoto2.disabled = !puedeSubirArchivoObs;
            } catch {}

            if (puedeEliminarObs && imgObsPrev && !btnDelObs) {
                btnDelObs = document.createElement('button');
                btnDelObs.type = 'button';
                btnDelObs.id = 'insp-obs-eliminar-foto';
                btnDelObs.className = 'btn';
                btnDelObs.textContent = 'Eliminar foto 1';
                btnDelObs.style.cssText = 'display:none; margin-top:6px; background:#fef2f2; color:#b91c1c; border-color:#fecaca;';
                imgObsPrev.insertAdjacentElement('afterend', btnDelObs);
            }
            if (puedeEliminarObs && imgObsPrev2 && !btnDelObs2) {
                btnDelObs2 = document.createElement('button');
                btnDelObs2.type = 'button';
                btnDelObs2.id = 'insp-obs-eliminar-foto2';
                btnDelObs2.className = 'btn';
                btnDelObs2.textContent = 'Eliminar foto 2';
                btnDelObs2.style.cssText = 'display:none; margin-top:6px; background:#fef2f2; color:#b91c1c; border-color:#fecaca;';
                imgObsPrev2.insertAdjacentElement('afterend', btnDelObs2);
            }

            const syncObsDeleteButtons = () => {
                try {
                    if (btnDelObs && imgObsPrev) {
                        const has = !!String(imgObsPrev.getAttribute('src') || '').trim() && imgObsPrev.style.display !== 'none';
                        btnDelObs.style.display = (puedeEliminarObs && has) ? '' : 'none';
                    }
                    if (btnDelObs2 && imgObsPrev2) {
                        const has2 = !!String(imgObsPrev2.getAttribute('src') || '').trim() && imgObsPrev2.style.display !== 'none';
                        btnDelObs2.style.display = (puedeEliminarObs && has2) ? '' : 'none';
                    }
                } catch {}
            };
            try { window.__pctSyncObsDeleteButtons = syncObsDeleteButtons; } catch {}

            if (btnTomarObs) {
                btnTomarObs.addEventListener('click', async () => {
                    try {
                        await abrirCamaraParaIndice(-1, (blob) => {
                            fotoObs = { blob };
                            borrarFotoObs = false;
                            try { if (inputObsFoto) inputObsFoto.value = ''; } catch {}
                            if (imgObsPrev) {
                                imgObsPrev.src = URL.createObjectURL(blob);
                                imgObsPrev.style.display = '';
                            }
                            syncObsDeleteButtons();
                        });
                    } catch (e) {
                        console.warn('No se pudo capturar foto (observaciones)', e);
                    }
                });
            }

            if (btnTomarObs2) {
                btnTomarObs2.addEventListener('click', async () => {
                    try {
                        await abrirCamaraParaIndice(-2, (blob) => {
                            fotoObs2 = { blob };
                            borrarFotoObs2 = false;
                            try { if (inputObsFoto2) inputObsFoto2.value = ''; } catch {}
                            if (imgObsPrev2) {
                                imgObsPrev2.src = URL.createObjectURL(blob);
                                imgObsPrev2.style.display = '';
                            }
                            syncObsDeleteButtons();
                        });
                    } catch (e) {
                        console.warn('No se pudo capturar foto 2 (observaciones)', e);
                    }
                });
            }

            if (btnSubirObs && inputObsFoto) {
                btnSubirObs.addEventListener('click', () => {
                    if (!puedeSubirArchivoObs) return;
                    try { inputObsFoto.click(); } catch {}
                });
            }

            if (btnSubirObs2 && inputObsFoto2) {
                btnSubirObs2.addEventListener('click', () => {
                    if (!puedeSubirArchivoObs) return;
                    try { inputObsFoto2.click(); } catch {}
                });
            }

            if (inputObsFoto) {
                inputObsFoto.addEventListener('change', () => {
                    try {
                        if (!puedeSubirArchivoObs) {
                            try { inputObsFoto.value = ''; } catch {}
                            return;
                        }
                        const file = inputObsFoto.files && inputObsFoto.files[0] ? inputObsFoto.files[0] : null;
                        if (!file) return;
                        fotoObs = null;
                        borrarFotoObs = false;
                        if (imgObsPrev) {
                            imgObsPrev.src = URL.createObjectURL(file);
                            imgObsPrev.style.display = '';
                        }
                        syncObsDeleteButtons();
                    } catch (e) {
                        console.warn('No se pudo leer la foto seleccionada (observaciones)', e);
                    }
                });
            }

            if (inputObsFoto2) {
                inputObsFoto2.addEventListener('change', () => {
                    try {
                        if (!puedeSubirArchivoObs) {
                            try { inputObsFoto2.value = ''; } catch {}
                            return;
                        }
                        const file = inputObsFoto2.files && inputObsFoto2.files[0] ? inputObsFoto2.files[0] : null;
                        if (!file) return;
                        fotoObs2 = null;
                        borrarFotoObs2 = false;
                        if (imgObsPrev2) {
                            imgObsPrev2.src = URL.createObjectURL(file);
                            imgObsPrev2.style.display = '';
                        }
                        syncObsDeleteButtons();
                    } catch (e) {
                        console.warn('No se pudo leer la foto 2 seleccionada (observaciones)', e);
                    }
                });
            }
            if (btnDelObs) {
                btnDelObs.addEventListener('click', () => {
                    if (!confirm('¿Eliminar foto 1 de observaciones? Se aplicará al guardar.')) return;
                    borrarFotoObs = true;
                    fotoObs = null;
                    try { if (inputObsFoto) inputObsFoto.value = ''; } catch {}
                    if (imgObsPrev) {
                        imgObsPrev.removeAttribute('src');
                        imgObsPrev.style.display = 'none';
                    }
                    syncObsDeleteButtons();
                });
            }
            if (btnDelObs2) {
                btnDelObs2.addEventListener('click', () => {
                    if (!confirm('¿Eliminar foto 2 de observaciones? Se aplicará al guardar.')) return;
                    borrarFotoObs2 = true;
                    fotoObs2 = null;
                    try { if (inputObsFoto2) inputObsFoto2.value = ''; } catch {}
                    if (imgObsPrev2) {
                        imgObsPrev2.removeAttribute('src');
                        imgObsPrev2.style.display = 'none';
                    }
                    syncObsDeleteButtons();
                });
            }
            syncObsDeleteButtons();
        } catch {}

        // Mostrar selector de daño y evidencia (en PRE-TRABAJO permitimos evidencias aunque esté BUENO)
        detalleContenedor.querySelectorAll('.parametros-fila').forEach((filaHtml, idx) => {
            const esEstadoGeneral = isEstadoGeneralFila(filaHtml);
            const radios = filaHtml.querySelectorAll(`input[name="param-${idx}-estado"]`);
            const estadoSwitch = filaHtml.querySelector('.estado-switch-input');
            const colDano = filaHtml.querySelector('.col-dano');
            const selectDano = colDano ? colDano.querySelector('select') : null;
            const danoChips = colDano ? colDano.querySelector('.dano-chips') : null;
            const danoChipBtns = danoChips ? Array.from(danoChips.querySelectorAll('.dano-chip')) : [];
            const inputOtro = colDano ? colDano.querySelector(`input[name="param-${idx}-dano-otro"]`) : null;
            const colEvid = filaHtml.querySelector('.col-evidencia');
            // Algunos despliegues/estilos han mostrado "Estado General" sin controles de evidencia.
            // Para evitar bloqueo por validación, asegurar que los controles existan.
            try {
                if (esEstadoGeneral && colEvid) {
                    const hasTomar = !!colEvid.querySelector('.btn-tomar-foto');
                    const hasSubir = !!colEvid.querySelector('.btn-subir-foto');
                    const hasInput = !!colEvid.querySelector(`input[name="param-${idx}-foto"]`);
                    if (!hasTomar || !hasSubir || !hasInput) {
                        colEvid.innerHTML = `
                            <button type="button" class="btn btn-tomar-foto" data-idx="${idx}">Tomar foto</button>
                            <button type="button" class="btn btn-subir-foto" data-idx="${idx}">Subir foto</button>
                            <input type="file" name="param-${idx}-foto" accept="image/*" style="display:none;">
                            <img alt="preview" id="preview-foto-${idx}" style="display:none; max-height:64px; border-radius:6px; margin-top:4px; border:1px solid #e5e7eb;" />
                            <button type="button" class="btn btn-eliminar-foto" data-idx="${idx}" style="display:none; margin-top:4px;">Eliminar foto 1</button>
                            <button type="button" class="btn btn-modificar-foto" data-idx="${idx}" style="display:none; margin-top:4px;">Modificar foto 1</button>
                        `;
                    }
                }
            } catch {}

            const inputFoto = colEvid ? colEvid.querySelector(`input[name="param-${idx}-foto"]`) : null;
            const btnTomar = colEvid ? colEvid.querySelector('.btn-tomar-foto') : null;
            const btnSubir = colEvid ? colEvid.querySelector('.btn-subir-foto') : null;
            const imgPrev = document.getElementById(`preview-foto-${idx}`);
            const btnDel1 = colEvid ? colEvid.querySelector('.btn-eliminar-foto') : null;
            let btnMod1 = colEvid ? colEvid.querySelector('.btn-modificar-foto') : null;

            const puedeSubirEvidencia2Now = () => {
                try {
                    return !!(window.isAdmin || window.isDirector || window.isSgi);
                } catch {
                    return false;
                }
            };
            const puedeEliminarEvidenciaNow = () => {
                try {
                    return !!(window.isAdmin || window.isSgi);
                } catch {
                    return false;
                }
            };
            const puedeSubirArchivoNow = () => {
                try {
                    return !!(window.isAdmin || window.isSgi);
                } catch {
                    return false;
                }
            };
            const inputFoto2 = colEvid ? colEvid.querySelector(`input[name="param-${idx}-foto2"]`) : null;
            const btnTomar2 = colEvid ? colEvid.querySelector('.btn-tomar-foto2') : null;
            const btnSubir2 = colEvid ? colEvid.querySelector('.btn-subir-foto2') : null;
            const imgPrev2 = document.getElementById(`preview-foto2-${idx}`);
            const btnDel2 = colEvid ? colEvid.querySelector('.btn-eliminar-foto2') : null;

            const tieneChipsDano = !!(danoChipBtns && danoChipBtns.length);
            try {
                if (btnSubir) btnSubir.style.display = puedeSubirArchivoNow() ? '' : 'none';
                if (btnSubir2) btnSubir2.style.display = puedeSubirArchivoNow() ? '' : 'none';
                if (inputFoto) inputFoto.disabled = !puedeSubirArchivoNow();
                if (inputFoto2) inputFoto2.disabled = !puedeSubirArchivoNow();
            } catch {}

            if (esEstadoGeneral) {
                try {
                    if (colDano) colDano.style.display = 'none';
                    if (colEvid) colEvid.style.display = '';
                } catch {}
            }

            const getTipoInspeccionNow = () => {
                try {
                    const sel = document.getElementById('inspeccion-tipo');
                    return sel ? String(sel.value || '').trim().toUpperCase() : '';
                } catch {
                    return '';
                }
            };

            const syncMostrarEvidencia = () => {
                try {
                    if (!colEvid) return;
                    const tipo = getTipoInspeccionNow();
                    const allowByTipo = (tipo === 'PRE-TRABAJO');
                    const estadoSel = filaHtml.querySelector(`input[name="param-${idx}-estado"]:checked`);
                    const estadoVal = estadoSel ? String(estadoSel.value || '').trim().toUpperCase() : '';
                    const show = !!(esEstadoGeneral || estadoVal === 'MALO' || allowByTipo);
                    colEvid.style.display = show ? '' : 'none';
                } catch {}
            };

            try { syncMostrarEvidencia(); } catch {}
            try {
                if (estadoSwitch) estadoSwitch.addEventListener('change', () => syncMostrarEvidencia());
                radios.forEach(r => r.addEventListener('change', () => syncMostrarEvidencia()));
                const selTipo = document.getElementById('inspeccion-tipo');
                if (selTipo) selTipo.addEventListener('change', () => syncMostrarEvidencia());
            } catch {}

            const normDano = (s) => String(s || '').trim().toUpperCase();
            const danoSlug = (s) => String(s || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 24);

            const getPrevEvidPorDano = () => {
                try { return (filaHtml && filaHtml.__prevEvidenciasPorDano) ? filaHtml.__prevEvidenciasPorDano : {}; } catch { return {}; }
            };

            const getSelDanos = () => {
                try {
                    const raw = String(filaHtml.dataset.danosSel || '[]');
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr)) return arr.map(normDano).filter(Boolean);
                } catch {}
                return [];
            };
            const setSelDanos = (arr) => {
                try {
                    const next = Array.isArray(arr) ? arr.map(normDano).filter(Boolean) : [];
                    filaHtml.dataset.danosSel = JSON.stringify(Array.from(new Set(next)));
                } catch {
                    filaHtml.dataset.danosSel = '[]';
                }
            };
            const getActiveDano = () => {
                try { return normDano(filaHtml.dataset.danoActivo || ''); } catch { return ''; }
            };
            const setActiveDano = (d) => {
                try {
                    const v = normDano(d);
                    filaHtml.dataset.danoActivo = v;
                    if (selectDano) selectDano.value = v;
                } catch {}
            };

            // Mantener actualizado el estado general cuando se cambien estados
            try {
                if (!esEstadoGeneral) {
                    if (estadoSwitch) estadoSwitch.addEventListener('change', () => actualizarEstadoGeneralUI());
                    radios.forEach(r => r.addEventListener('change', () => actualizarEstadoGeneralUI()));
                }
            } catch {}

            const ensureDanoBucket = (d) => {
                const key = normDano(d);
                if (!key) return null;
                fotosTomadas[idx] = { ...(fotosTomadas[idx] || {}) };
                fotosTomadas[idx].danos = { ...((fotosTomadas[idx] && fotosTomadas[idx].danos) ? fotosTomadas[idx].danos : {}) };
                fotosTomadas[idx].danos[key] = { ...((fotosTomadas[idx].danos && fotosTomadas[idx].danos[key]) ? fotosTomadas[idx].danos[key] : {}) };
                return fotosTomadas[idx].danos[key];
            };

            const danoTieneFoto1 = (d) => {
                const key = normDano(d);
                if (!key) return false;
                try {
                    const b = fotosTomadas[idx]?.danos?.[key];
                    if (b && b.del1) return false;
                    if (b && b.blob1) return true;
                    const prev = getPrevEvidPorDano();
                    const p = prev && prev[key];
                    return !!(p && (p.evidenciaUrl || p.evidenciaNombre || p.evidenciaPath));
                } catch { return false; }
            };
            const danoTieneFoto2 = (d) => {
                const key = normDano(d);
                if (!key) return false;
                try {
                    const b = fotosTomadas[idx]?.danos?.[key];
                    if (b && b.del2) return false;
                    if (b && b.blob2) return true;
                    const prev = getPrevEvidPorDano();
                    const p = prev && prev[key];
                    return !!(p && (p.evidenciaUrl2 || p.evidenciaNombre2 || p.evidenciaPath2));
                } catch { return false; }
            };

            const getChipThumbUrls = (d) => {
                const key = normDano(d);
                const prev = getPrevEvidPorDano();
                const p = prev && prev[key] ? prev[key] : null;
                const b = fotosTomadas[idx]?.danos?.[key] || null;

                const out = { u1: '', u2: '' };
                try {
                    if (b && b.blob1) out.u1 = URL.createObjectURL(b.blob1);
                    else if (p && p.evidenciaUrl) out.u1 = String(p.evidenciaUrl);
                } catch {}
                try {
                    if (b && b.blob2) out.u2 = URL.createObjectURL(b.blob2);
                    else if (p && p.evidenciaUrl2) out.u2 = String(p.evidenciaUrl2);
                } catch {}
                return out;
            };

            const renderChipThumbs = () => {
                if (!tieneChipsDano) return;
                try {
                    danoChipBtns.forEach(btn => {
                        const v = normDano(btn.getAttribute('data-val') || '');
                        if (!v) return;
                        const has = danoTieneFoto1(v) || danoTieneFoto2(v);

                        let wrap = btn.querySelector('.chip-thumbs');
                        if (!wrap) {
                            wrap = document.createElement('span');
                            wrap.className = 'chip-thumbs';
                            wrap.style.cssText = 'display:inline-flex; gap:4px; margin-left:8px; vertical-align:middle;';
                            btn.appendChild(wrap);
                        }

                        if (!has) {
                            wrap.innerHTML = '';
                            wrap.style.display = 'none';
                            btn.classList.remove('is-occupied');
                            return;
                        }

                        wrap.style.display = 'inline-flex';
                        btn.classList.add('is-occupied');

                        const { u1, u2 } = getChipThumbUrls(v);
                        const mk = (u) => {
                            const img = document.createElement('img');
                            img.src = u;
                            img.alt = 'thumb';
                            img.style.cssText = 'width:18px; height:18px; object-fit:cover; border-radius:4px; border:1px solid #e5e7eb;';
                            img.addEventListener('click', (ev) => {
                                try { ev.stopPropagation(); } catch {}
                                try {
                                    if (!u) return;
                                    const w = window.open('', '_blank');
                                    if (w) w.document.write(`<img src="${u}" style="max-width:100%;height:auto;"/>`);
                                } catch {}
                            });
                            return img;
                        };

                        wrap.innerHTML = '';
                        if (u1) wrap.appendChild(mk(u1));
                        if (u2) wrap.appendChild(mk(u2));
                    });
                } catch {}
            };

            const foto1YaExiste = () => {
                try {
                    if (filaHtml && filaHtml.dataset && filaHtml.dataset.evid1Exists === '1') return true;
                    if (!imgPrev) return false;
                    const src = String(imgPrev.getAttribute('src') || '').trim();
                    const visible = imgPrev.style.display !== 'none';
                    return !!(src && visible);
                } catch { return false; }
            };
            const foto2Vacia = () => {
                try {
                    if (filaHtml && filaHtml.dataset && filaHtml.dataset.evid2Exists === '1') return false;
                    if (!imgPrev2) return true;
                    const src = String(imgPrev2.getAttribute('src') || '').trim();
                    const visible = imgPrev2.style.display !== 'none';
                    if (!src) return true;
                    return !visible;
                } catch { return true; }
            };

            const syncUiEvidencias = () => {
                try {
                    if (!colEvid) return;
                    const can2 = puedeSubirEvidencia2Now();

                    if (tieneChipsDano) {
                        const act = getActiveDano();
                        // En modo chips, siempre permitir agregar evidencia al chip activo.
                        if (btnTomar) btnTomar.style.display = '';
                        if (btnSubir) btnSubir.style.display = '';

                        const has1Act = act ? danoTieneFoto1(act) : false;
                        const has2Act = act ? danoTieneFoto2(act) : false;
                        if (btnDel1) btnDel1.style.display = (puedeEliminarEvidenciaNow() && has1Act) ? '' : 'none';
                        if (btnMod1) btnMod1.style.display = (can2 && has1Act) ? '' : 'none';
                        if (btnDel2) btnDel2.style.display = (puedeEliminarEvidenciaNow() && has2Act) ? '' : 'none';

                        // Botones del slot 2: siempre visibles en chip mode si el rol lo permite
                        if (btnTomar2) btnTomar2.style.display = can2 ? '' : 'none';
                        if (btnSubir2) btnSubir2.style.display = can2 ? '' : 'none';
                    } else {
                        const has1 = foto1YaExiste();
                        if (btnTomar) btnTomar.style.display = has1 ? 'none' : '';
                        if (btnSubir) btnSubir.style.display = has1 ? 'none' : '';
                        if (btnDel1) btnDel1.style.display = (puedeEliminarEvidenciaNow() && has1) ? '' : 'none';
                        if (btnMod1) btnMod1.style.display = (can2 && has1) ? '' : 'none';
                        const has2 = !foto2Vacia();
                        if (btnDel2) btnDel2.style.display = (puedeEliminarEvidenciaNow() && has2) ? '' : 'none';
                    }
                } catch {}
            };

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
                if (!danoChipBtns.length) return;
                const sel = tieneChipsDano ? getSelDanos() : [];
                const act = getActiveDano();
                danoChipBtns.forEach(btn => {
                    const btnVal = normDano(btn.getAttribute('data-val') || '');
                    if (sel.includes(btnVal)) btn.classList.add('is-selected');
                    else btn.classList.remove('is-selected');
                    if (act && btnVal === act) btn.classList.add('is-active');
                    else btn.classList.remove('is-active');
                });
                renderChipThumbs();
            };

            const setTipoDanoDesdeChip = (val) => {
                const v = normDano(val);
                if (!v) return;
                setActiveDano(v);
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
                if (esEstadoGeneral) {
                    try {
                        if (colDano) colDano.style.display = 'none';
                        if (colEvid) {
                            colEvid.style.display = '';
                            if (inputFoto) inputFoto.disabled = false;
                            if (btnTomar) btnTomar.disabled = false;
                            if (btnSubir) btnSubir.disabled = false;
                            if (btnDel1) btnDel1.disabled = !puedeEliminarEvidenciaNow();
                            try { syncUiEvidencias(); } catch {}

                            const can2 = puedeSubirEvidencia2Now();
                            if (inputFoto2) inputFoto2.disabled = !can2;
                            if (btnTomar2) btnTomar2.disabled = !can2;
                            if (btnSubir2) btnSubir2.disabled = !can2;
                            if (btnDel2) btnDel2.disabled = !puedeEliminarEvidenciaNow();
                            try {
                                if (btnTomar2) btnTomar2.style.display = can2 ? '' : 'none';
                                if (btnSubir2) btnSubir2.style.display = can2 ? '' : 'none';
                                if (btnDel2) btnDel2.style.display = 'none';
                                if (imgPrev2) imgPrev2.style.display = 'none';
                            } catch {}
                        }
                    } catch {}
                    return;
                }
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

                        if (btnDel1) btnDel1.disabled = !puedeEliminarEvidenciaNow();
                        syncUiEvidencias();

                        // Slot 2 solo si rol lo permite
                        const can2 = puedeSubirEvidencia2Now();
                        if (inputFoto2) inputFoto2.disabled = !can2;
                        if (btnTomar2) btnTomar2.disabled = !can2;
                        if (btnSubir2) btnSubir2.disabled = !can2;
                        if (btnDel2) {
                            btnDel2.disabled = !puedeEliminarEvidenciaNow();
                            const has2 = !foto2Vacia();
                            btnDel2.style.display = (puedeEliminarEvidenciaNow() && has2) ? '' : 'none';
                        }
                    }
                } else {
                    const tipoActual = (() => {
                        try {
                            const sel = document.getElementById('inspeccion-tipo');
                            return sel ? String(sel.value || '').trim().toUpperCase() : '';
                        } catch { return ''; }
                    })();
                    const permitirEvidenciaBueno = (tipoActual === 'PRE-TRABAJO');

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
                        if (permitirEvidenciaBueno) {
                            try {
                                setActiveDano('');
                                setSelDanos([]);
                            } catch {}
                            colEvid.style.display = '';
                            if (inputFoto) inputFoto.disabled = !puedeSubirArchivoNow();
                            if (btnTomar) btnTomar.disabled = false;
                            if (btnSubir) {
                                btnSubir.disabled = !puedeSubirArchivoNow();
                                btnSubir.style.display = puedeSubirArchivoNow() ? '' : 'none';
                            }
                            if (btnDel1) btnDel1.disabled = !puedeEliminarEvidenciaNow();
                            try { syncUiEvidencias(); } catch {}

                            const can2 = puedeSubirEvidencia2Now();
                            if (inputFoto2) inputFoto2.disabled = !puedeSubirArchivoNow();
                            if (btnTomar2) btnTomar2.disabled = !can2;
                            if (btnSubir2) {
                                btnSubir2.disabled = !puedeSubirArchivoNow();
                                btnSubir2.style.display = puedeSubirArchivoNow() ? '' : 'none';
                            }
                            if (btnDel2) btnDel2.disabled = !puedeEliminarEvidenciaNow();
                        } else {
                            colEvid.style.display = 'none';
                            if (inputFoto) { inputFoto.disabled = true; try { inputFoto.value = ''; } catch {} }
                            if (btnTomar) btnTomar.disabled = true;
                            if (btnSubir) btnSubir.disabled = true;
                            if (imgPrev) { imgPrev.src = ''; imgPrev.style.display = 'none'; }
                            if (btnDel1) { btnDel1.disabled = true; btnDel1.style.display = 'none'; }

                            try {
                                if (btnTomar) btnTomar.style.display = '';
                                if (btnSubir) btnSubir.style.display = '';
                            } catch {}

                            if (inputFoto2) { inputFoto2.disabled = true; try { inputFoto2.value = ''; } catch {} }
                            if (btnTomar2) btnTomar2.disabled = true;
                            if (btnSubir2) btnSubir2.disabled = true;
                            if (imgPrev2) { imgPrev2.src = ''; imgPrev2.style.display = 'none'; }
                            if (btnDel2) { btnDel2.disabled = true; btnDel2.style.display = 'none'; }

                            delete fotosTomadas[idx];
                        }
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
                        const val = normDano(btn.getAttribute('data-val') || '');
                        if (!val) return;
                        const sel = getSelDanos();
                        const ya = sel.includes(val);

                        // Si ya está ocupado (tiene evidencia), solo Admin/SGI pueden desmarcar y marcar evidencia para borrado
                        if (ya && (danoTieneFoto1(val) || danoTieneFoto2(val))) {
                            if (!puedeEliminarEvidenciaNow()) {
                                alert('Solo Admin o SGI pueden eliminar evidencias existentes.');
                                return;
                            }
                            try {
                                const b = ensureDanoBucket(val);
                                if (b) {
                                    b.blob1 = null;
                                    b.blob2 = null;
                                    b.del1 = true;
                                    b.del2 = true;
                                }
                            } catch {}
                            setSelDanos(sel.filter(x => x !== val));
                            const act = getActiveDano();
                            if (act === val) setActiveDano('');
                            actualizarSeleccionChips();
                            renderChipThumbs();
                            syncUiEvidencias();
                            return;
                        }

                        if (ya) {
                            setSelDanos(sel.filter(x => x !== val));
                            const act = getActiveDano();
                            if (act === val) setActiveDano('');
                            actualizarSeleccionChips();
                            return;
                        }

                        // Marcar daño y volverlo activo
                        sel.push(val);
                        setSelDanos(sel);
                        setTipoDanoDesdeChip(val);
                        actualizarSeleccionChips();

                        // Opción B: al marcar un daño, exigir inmediatamente Foto 1
                        if (!danoTieneFoto1(val)) {
                            try {
                                filaHtml.dataset.targetDano = val;
                                filaHtml.dataset.forceChipFoto1 = '1';
                                if (inputFoto) inputFoto.click();
                            } catch {}
                        }
                    });
                });
            }

            actualizarVisibilidadDano();

            // Handler para tomar foto con cámara
            if (btnTomar) {
                btnTomar.addEventListener('click', async () => {
                    try {
                        await abrirCamaraParaIndice(idx, (blob) => {
                            try {
                                const act = getActiveDano();
                                if (tieneChipsDano && act) {
                                    const b = ensureDanoBucket(act);
                                    if (!b) return;
                                    const can2 = puedeSubirEvidencia2Now();
                                    const has1 = danoTieneFoto1(act);
                                    const has2 = danoTieneFoto2(act);
                                    if (can2 && has1 && !has2) {
                                        b.blob2 = blob;
                                        b.del2 = false;
                                    } else {
                                        b.blob1 = blob;
                                        b.del1 = false;
                                    }
                                    try { if (inputFoto) inputFoto.value = ''; } catch {}
                                    try { if (inputFoto2) inputFoto2.value = ''; } catch {}
                                    renderChipThumbs();
                                    actualizarSeleccionChips();
                                    syncUiEvidencias();
                                    return;
                                }
                            } catch {}
                            // Si ya existe Foto 1 y Foto 2 está vacía (y el rol lo permite), mandar a slot 2 automáticamente
                            if (puedeSubirEvidencia2Now() && foto1YaExiste() && foto2Vacia()) {
                                fotosTomadas[idx] = { ...(fotosTomadas[idx] || {}), blob2: blob, del2: false };
                                try { if (inputFoto2) inputFoto2.value = ''; } catch {}
                                if (imgPrev2) {
                                    imgPrev2.src = URL.createObjectURL(blob);
                                    imgPrev2.style.display = '';
                                }
                                try { filaHtml.dataset.evid2Exists = '1'; } catch {}
                                if (btnDel2) btnDel2.style.display = '';
                                syncUiEvidencias();
                            } else {
                                fotosTomadas[idx] = { ...(fotosTomadas[idx] || {}), blob, del1: false };
                                try { if (inputFoto) inputFoto.value = ''; } catch {}
                                if (imgPrev) {
                                    imgPrev.src = URL.createObjectURL(blob);
                                    imgPrev.style.display = '';
                                }
                                try { filaHtml.dataset.evid1Exists = '1'; } catch {}
                                if (btnDel1) btnDel1.style.display = '';
                                syncUiEvidencias();
                            }
                        });
                    } catch (e) {
                        console.warn('No se pudo capturar foto', e);
                    }
                });
            }

            // Handler para tomar foto 2 con cámara (solo SGI/supervisor/director/admin)
            if (btnTomar2) {
                btnTomar2.addEventListener('click', async () => {
                    try {
                        if (!puedeSubirEvidencia2) return;
                        await abrirCamaraParaIndice(idx, (blob) => {
                            try {
                                const act = getActiveDano();
                                if (tieneChipsDano && act) {
                                    const b = ensureDanoBucket(act);
                                    if (b) {
                                        b.blob2 = blob;
                                        b.del2 = false;
                                    }
                                    try { if (inputFoto2) inputFoto2.value = ''; } catch {}
                                    renderChipThumbs();
                                    actualizarSeleccionChips();
                                    syncUiEvidencias();
                                    return;
                                }
                            } catch {}
                            fotosTomadas[idx] = { ...(fotosTomadas[idx] || {}), blob2: blob };
                            try { if (inputFoto2) inputFoto2.value = ''; } catch {}
                            if (imgPrev2) {
                                imgPrev2.src = URL.createObjectURL(blob);
                                imgPrev2.style.display = '';
                            }
                        });
                    } catch (e) {
                        console.warn('No se pudo capturar foto 2', e);
                    }
                });
            }

            // Handler para subir foto desde galería / archivos
            if (btnSubir && inputFoto) {
                btnSubir.addEventListener('click', () => {
                    if (!puedeSubirArchivoNow()) return;
                    try { inputFoto.click(); } catch {}
                });
            }

            // Modificar foto 1: reemplazar explícitamente el slot 1 (solo SGI/supervisor/director/admin)
            if (!btnMod1 && colEvid) {
                btnMod1 = colEvid.querySelector('.btn-modificar-foto');
            }
            if (btnMod1 && inputFoto) {
                btnMod1.addEventListener('click', () => {
                    try {
                        if (!puedeSubirEvidencia2Now()) return;
                        // En modo chips, el reemplazo aplica al chip activo
                        const act = getActiveDano();
                        if (tieneChipsDano && act) {
                            filaHtml.dataset.targetDano = act;
                            filaHtml.dataset.forceReplaceChipFoto1 = '1';
                        } else {
                            filaHtml.dataset.forceReplaceEvid1 = '1';
                        }
                        inputFoto.click();
                    } catch {}
                });
            }
            if (inputFoto) {
                inputFoto.addEventListener('change', () => {
                    try {
                        if (!puedeSubirArchivoNow()) {
                            try { inputFoto.value = ''; } catch {}
                            return;
                        }
                        const file = inputFoto.files && inputFoto.files[0] ? inputFoto.files[0] : null;
                        if (!file) return;
                        const targetD = normDano(filaHtml.dataset.targetDano || '');
                        const isChipMode = !!(tieneChipsDano && targetD);

                        // Caso chips: asignar al daño target
                        if (isChipMode) {
                            const forceReplaceChip = (filaHtml.dataset.forceReplaceChipFoto1 === '1');
                            filaHtml.dataset.forceReplaceChipFoto1 = '0';
                            filaHtml.dataset.forceChipFoto1 = '0';
                            const bucket = ensureDanoBucket(targetD);
                            if (!bucket) return;

                            const can2 = puedeSubirEvidencia2Now();
                            const has1 = danoTieneFoto1(targetD);
                            const has2 = danoTieneFoto2(targetD);

                            if (!forceReplaceChip && can2 && has1 && !has2) {
                                bucket.blob2 = file;
                                bucket.del2 = false;
                            } else {
                                bucket.blob1 = file;
                                bucket.del1 = false;
                            }

                            try { inputFoto.value = ''; } catch {}
                            try { filaHtml.dataset.targetDano = ''; } catch {}

                            // Actualizar thumbs y dejar activo
                            setActiveDano(targetD);
                            actualizarSeleccionChips();
                            renderChipThumbs();
                            return;
                        }

                        const forceReplace = (filaHtml && filaHtml.dataset && filaHtml.dataset.forceReplaceEvid1 === '1');
                        if (forceReplace) {
                            filaHtml.dataset.forceReplaceEvid1 = '0';
                            fotosTomadas[idx] = { ...(fotosTomadas[idx] || {}), blob: file, del1: false };
                            try { inputFoto.value = ''; } catch {}
                            if (imgPrev) {
                                imgPrev.src = URL.createObjectURL(file);
                                imgPrev.style.display = '';
                            }
                            try { filaHtml.dataset.evid1Exists = '1'; } catch {}
                            syncUiEvidencias();
                            return;
                        }
                        // Si ya existe Foto 1 y Foto 2 está vacía (y el rol lo permite), mandar a slot 2 automáticamente
                        if (puedeSubirEvidencia2Now() && foto1YaExiste() && foto2Vacia()) {
                            fotosTomadas[idx] = { ...(fotosTomadas[idx] || {}), blob2: file, del2: false };
                            try { inputFoto.value = ''; } catch {}
                            try { if (inputFoto2) inputFoto2.value = ''; } catch {}
                            if (imgPrev2) {
                                imgPrev2.src = URL.createObjectURL(file);
                                imgPrev2.style.display = '';
                            }
                            try { filaHtml.dataset.evid2Exists = '1'; } catch {}
                            if (btnDel2) btnDel2.style.display = '';
                            syncUiEvidencias();
                        } else {
                            fotosTomadas[idx] = { ...(fotosTomadas[idx] || {}), blob: file, del1: false };
                            try { inputFoto.value = ''; } catch {}
                            if (imgPrev) {
                                imgPrev.src = URL.createObjectURL(file);
                                imgPrev.style.display = '';
                            }
                            try { filaHtml.dataset.evid1Exists = '1'; } catch {}
                            if (btnDel1) btnDel1.style.display = '';
                            syncUiEvidencias();
                        }
                    } catch (e) {
                        console.warn('No se pudo leer la foto seleccionada', e);
                    }
                });
            }

            // Handler para subir foto 2 desde galería / archivos
            if (btnSubir2 && inputFoto2) {
                btnSubir2.addEventListener('click', () => {
                    if (!puedeSubirArchivoNow()) return;
                    try { inputFoto2.click(); } catch {}
                });
            }
            if (inputFoto2) {
                inputFoto2.addEventListener('change', () => {
                    try {
                        if (!puedeSubirArchivoNow()) {
                            try { inputFoto2.value = ''; } catch {}
                            return;
                        }
                        const file = inputFoto2.files && inputFoto2.files[0] ? inputFoto2.files[0] : null;
                        if (!file) return;
                        try {
                            const act = getActiveDano();
                            if (tieneChipsDano && act) {
                                const b = ensureDanoBucket(act);
                                if (b) {
                                    b.blob2 = file;
                                    b.del2 = false;
                                }
                                try { inputFoto2.value = ''; } catch {}
                                renderChipThumbs();
                                actualizarSeleccionChips();
                                syncUiEvidencias();
                                return;
                            }
                        } catch {}
                        fotosTomadas[idx] = { ...(fotosTomadas[idx] || {}), blob2: file, del2: false };
                        try { inputFoto2.value = ''; } catch {}
                        if (imgPrev2) {
                            imgPrev2.src = URL.createObjectURL(file);
                            imgPrev2.style.display = '';
                        }
                        try { filaHtml.dataset.evid2Exists = '1'; } catch {}
                        if (btnDel2) btnDel2.style.display = '';
                        syncUiEvidencias();
                    } catch (e) {
                        console.warn('No se pudo leer la foto 2 seleccionada', e);
                    }
                });
            }

            // Eliminar fotos (marcar para borrar en guardado)
            if (btnDel1) {
                btnDel1.addEventListener('click', () => {
                    try {
                        if (!puedeEliminarEvidenciaNow()) {
                            alert('Solo Admin o SGI pueden eliminar evidencias existentes.');
                            return;
                        }
                        const act = getActiveDano();
                        if (tieneChipsDano && act) {
                            const b = ensureDanoBucket(act);
                            if (b) {
                                b.blob1 = null;
                                b.del1 = true;
                            }
                            // Si ya no hay evidencia, permitir desmarcar luego
                            renderChipThumbs();
                            actualizarSeleccionChips();
                            return;
                        }

                        fotosTomadas[idx] = { ...(fotosTomadas[idx] || {}), blob: null, del1: true };
                        if (inputFoto) { try { inputFoto.value = ''; } catch {} }
                        if (imgPrev) { imgPrev.src = ''; imgPrev.style.display = 'none'; }
                        try { filaHtml.dataset.evid1Exists = '0'; } catch {}
                        btnDel1.style.display = 'none';
                        syncUiEvidencias();
                    } catch {}
                });
            }
            if (btnDel2) {
                btnDel2.addEventListener('click', () => {
                    try {
                        if (!puedeEliminarEvidenciaNow()) {
                            alert('Solo Admin o SGI pueden eliminar evidencias existentes.');
                            return;
                        }
                        const act = getActiveDano();
                        if (tieneChipsDano && act) {
                            const b = ensureDanoBucket(act);
                            if (b) {
                                b.blob2 = null;
                                b.del2 = true;
                            }
                            renderChipThumbs();
                            actualizarSeleccionChips();
                            return;
                        }

                        fotosTomadas[idx] = { ...(fotosTomadas[idx] || {}), blob2: null, del2: true };
                        if (inputFoto2) { try { inputFoto2.value = ''; } catch {} }
                        if (imgPrev2) { imgPrev2.src = ''; imgPrev2.style.display = 'none'; }
                        try { filaHtml.dataset.evid2Exists = '0'; } catch {}
                        btnDel2.style.display = 'none';
                        syncUiEvidencias();
                    } catch {}
                });
            }

            // Primera sincronización (si venimos de prefill)
            try { syncUiEvidencias(); } catch {}
            try { actualizarSeleccionChips(); } catch {}
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
            const btnNative = document.createElement('button');
            btnNative.textContent = 'Cámara del dispositivo';
            const btnCancel = document.createElement('button'); btnCancel.textContent = 'Cancelar';
            const btnSnap = document.createElement('button'); btnSnap.textContent = 'Capturar';
            btnSnap.disabled = true;
            ctrls.appendChild(btnSwitch); ctrls.appendChild(btnNative); ctrls.appendChild(btnCancel); ctrls.appendChild(btnSnap);
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
                try { video.pause(); } catch {}
                try { video.srcObject = null; } catch {}
                currentStream = null;
            }

            function abrirCamaraNativa() {
                try {
                    const nativeInput = document.createElement('input');
                    nativeInput.type = 'file';
                    nativeInput.accept = 'image/*';
                    nativeInput.setAttribute('capture', 'environment');
                    nativeInput.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;';
                    document.body.appendChild(nativeInput);
                    nativeInput.addEventListener('change', () => {
                        try {
                            const file = nativeInput.files && nativeInput.files[0] ? nativeInput.files[0] : null;
                            if (file) {
                                onCapture(file);
                                stop();
                            }
                        } catch {}
                        try { nativeInput.remove(); } catch {}
                    }, { once: true });
                    nativeInput.click();
                } catch (e) {
                    console.warn('No se pudo abrir cámara nativa', e);
                    alert('No se pudo abrir la cámara del dispositivo.');
                }
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

                // Esperar a que el video tenga dimensiones listas (evita capturas en negro en tablets).
                try {
                    await new Promise((resolve) => {
                        let done = false;
                        const finish = () => {
                            if (done) return;
                            done = true;
                            try { video.removeEventListener('loadedmetadata', finish); } catch {}
                            try { video.removeEventListener('canplay', finish); } catch {}
                            resolve();
                        };
                        if (video.videoWidth && video.videoHeight) return finish();
                        video.addEventListener('loadedmetadata', finish, { once: true });
                        video.addEventListener('canplay', finish, { once: true });
                        setTimeout(finish, 1200);
                    });
                } catch {}

                // Después de permisos, ahora sí suelen aparecer labels. Refrescar lista y deviceId actual.
                try {
                    await refreshDevices();
                    const track = currentStream && currentStream.getVideoTracks ? currentStream.getVideoTracks()[0] : null;
                    const settings = track && track.getSettings ? track.getSettings() : null;
                    const did = settings && settings.deviceId ? String(settings.deviceId) : '';
                    if (did) currentDeviceId = did;
                } catch {}

                try {
                    if (video.videoWidth && video.videoHeight) btnSnap.disabled = false;
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
                    try {
                        if (video.videoWidth && video.videoHeight) btnSnap.disabled = false;
                        else {
                            // Esperar un poco y habilitar si ya hay dimensiones
                            setTimeout(() => {
                                try { if (video.videoWidth && video.videoHeight) btnSnap.disabled = false; } catch {}
                            }, 800);
                        }
                    } catch {}
                } catch {
                    try { abrirCamaraNativa(); } catch {}
                    throw e;
                }
            }

            function stop() { stopStream(); document.body.removeChild(overlay); }
            btnCancel.onclick = () => stop();
            btnNative.onclick = () => abrirCamaraNativa();
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
                        currentDeviceId = '';
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
                    if (!video.videoWidth || !video.videoHeight) {
                        alert('Espera a que cargue la cámara y vuelve a intentar.');
                        return;
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    canvas.toBlob((blob) => {
                        try {
                            if (blob && blob.size) {
                                onCapture(blob);
                                stop();
                                return;
                            }
                        } catch {}

                        // Fallback para navegadores/tablets donde toBlob regresa null o blob vacío.
                        try {
                            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                            const arr = dataUrl.split(',');
                            const mime = (arr[0] || '').match(/:(.*?);/);
                            const bstr = atob(arr[1] || '');
                            let n = bstr.length;
                            const u8arr = new Uint8Array(n);
                            while (n--) u8arr[n] = bstr.charCodeAt(n);
                            const b = new Blob([u8arr], { type: (mime && mime[1]) ? mime[1] : 'image/jpeg' });
                            if (b && b.size) onCapture(b);
                        } catch {}
                        stop();
                    }, 'image/jpeg', 0.9);
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
                const equipo = equipoSel || 'SIN_EQUIPO';
                const tipoInspeccionSel = (document.getElementById('inspeccion-tipo')?.value || '').toString();
                let usuario = '';
                try { usuario = resolverNombreUsuarioActual(); } catch {}

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
                const inputObsPdf2 = document.getElementById('insp-obs-foto2');
                const obsFotoPdf = (fotoObs && fotoObs.blob) ? fotoObs.blob : (inputObsPdf && inputObsPdf.files && inputObsPdf.files[0] ? inputObsPdf.files[0] : null);
                const obsFotoPdf2 = (fotoObs2 && fotoObs2.blob) ? fotoObs2.blob : (inputObsPdf2 && inputObsPdf2.files && inputObsPdf2.files[0] ? inputObsPdf2.files[0] : null);

                const toDataUrl = async (blob) => {
                    if (!blob) return '';
                    return await new Promise((resolve) => {
                        try {
                            const r = new FileReader();
                            r.onload = () => resolve(String(r.result || ''));
                            r.onerror = () => resolve('');
                            r.readAsDataURL(blob);
                        } catch {
                            resolve('');
                        }
                    });
                };

                const obsFotoDataUrl = obsFotoPdf ? await toDataUrl(obsFotoPdf) : '';
                const obsFotoDataUrl2 = obsFotoPdf2 ? await toDataUrl(obsFotoPdf2) : '';

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
                            <div style="margin-bottom:4px;"><strong>Hora:</strong> ${HH}:${MM}</div>
                            ${usuario ? `<div><strong>Usuario:</strong> ${usuario}</div>` : ''}
                            <div style="margin-top:8px; font-size:11px; color:#4b5563;">
                                <div><strong>Parámetros:</strong> ${totalParametros}</div>
                                <div><strong>En MALO:</strong> ${totalMalos}</div>
                                ${totalMalos > 0 ? `<div style="margin-top:4px; color:#991b1b;"><strong>Hallazgos:</strong> ${listaMalos.slice(0, 6).join(', ')}${listaMalos.length > 6 ? '…' : ''}</div>` : ''}
                            </div>
                        </div>
                    </div>
                `;

                if (obsManualPdf || obsFotoPdf || obsFotoPdf2) {
                    const obsWrap = document.createElement('div');
                    obsWrap.style.cssText = 'margin-top:10px; padding-top:10px; border-top:1px solid #e5e7eb;';

                    const parts = [];
                    parts.push('<div style="font-weight:800; color:#111827; margin:10px 0 6px;">OBSERVACIONES</div>');
                    parts.push(obsManualPdf
                        ? `<div style="white-space:pre-wrap; color:#111827;">${escapeHtml(obsManualPdf)}</div>`
                        : '<div style="color:#6b7280;">(Sin observaciones)</div>'
                    );

                    const obsImgs = [];
                    if (obsFotoDataUrl) obsImgs.push(`<img src="${obsFotoDataUrl}" alt="Foto observaciones 1" style="max-height:140px; border-radius:10px; border:1px solid #e5e7eb;" />`);
                    if (obsFotoDataUrl2) obsImgs.push(`<img src="${obsFotoDataUrl2}" alt="Foto observaciones 2" style="max-height:140px; border-radius:10px; border:1px solid #e5e7eb;" />`);
                    if (obsImgs.length) parts.push(`<div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:10px;">${obsImgs.join('')}</div>`);

                    obsWrap.innerHTML = parts.join('');
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
                const scaleFactor = canvas.width / wrapperWidthCss;
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
                try { alert('No se pudo generar el PDF. Revisa la consola para más detalle.'); } catch {}
            }
        });
    }

    if (tipoInspeccionSelect && tipoInspeccionChips && tipoInspeccionChips.length) {
        const normalizarTipo = (v) => String(v || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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
            let fila = equipos.find(cols => idxEquipo >= 0 && cols[idxEquipo] === valor);
            if (!fila) {
                // Para TERCERO: permitir guardar inspección mínima aunque no exista en inventario
                if (esEquipoTercero && String(valor || '').toUpperCase().trim() === 'TERCERO') {
                    fila = [];
                } else {
                    try {
                        btnGuardar.innerHTML = prevBtnHtml;
                        btnGuardar.disabled = prevBtnDisabled;
                    } catch {}
                    guardandoInspeccion = false;
                    return;
                }
            }

            const idxProducto = headers.indexOf('PRODUCTO');
            const idxSerial = getIdxSerial(headers);
            const idxDescripcion = headers.indexOf('DESCRIPCION');

            const get = (idx) => (idx >= 0 && idx < fila.length ? fila[idx] : '');

            const paramsUrlSave = new URLSearchParams(window.location.search || '');
            const inspIdUrlSave = (paramsUrlSave.get('inspId') || '').trim();
            // Para nueva inspección, siempre generar un ID único.
            // (Reusar un ID en el botón puede provocar overwrite de inspecciones distintas.)
            let localId = inspIdUrlSave;
            if (!localId) {
                localId = generarIdLocal('insp');
            }
            const isEditingExisting = !!inspIdUrlSave;
            const parametrosCapturados = [];
            const fotosParaSubir = [];
            const obsTextoManual = (document.getElementById('insp-obs-text')?.value || '').toString().trim();
            const terceroPropiedad = (document.getElementById('insp-tercero-compania')?.value || '').toString().trim();
            const terceroConfiguracion = (document.getElementById('insp-tercero-config')?.value || '').toString().trim();
            const terceroDescripcion = (document.getElementById('insp-tercero-desc')?.value || '').toString().trim();
            if (esEquipoTercero && !obsTextoManual) {
                alert('Para equipos de TERCERO, captura comentarios en OBSERVACIONES.');
                try {
                    btnGuardar.innerHTML = prevBtnHtml;
                    btnGuardar.disabled = prevBtnDisabled;
                } catch {}
                guardandoInspeccion = false;
                return;
            }
            if (esEquipoTercero) {
                if (!terceroPropiedad) {
                    alert('Para equipos de TERCERO, captura la Compañía de tercero.');
                    try {
                        btnGuardar.innerHTML = prevBtnHtml;
                        btnGuardar.disabled = prevBtnDisabled;
                    } catch {}
                    guardandoInspeccion = false;
                    return;
                }
                if (!terceroConfiguracion) {
                    alert('Para equipos de TERCERO, captura la Configuración del equipo.');
                    try {
                        btnGuardar.innerHTML = prevBtnHtml;
                        btnGuardar.disabled = prevBtnDisabled;
                    } catch {}
                    guardandoInspeccion = false;
                    return;
                }
                if (!terceroDescripcion) {
                    alert('Para equipos de TERCERO, captura la Descripción.');
                    try {
                        btnGuardar.innerHTML = prevBtnHtml;
                        btnGuardar.disabled = prevBtnDisabled;
                    } catch {}
                    guardandoInspeccion = false;
                    return;
                }
            }
            const inputObsFoto = document.getElementById('insp-obs-foto');
            const inputObsFoto2 = document.getElementById('insp-obs-foto2');
            const obsFotoBlob = (fotoObs && fotoObs.blob) ? fotoObs.blob : (inputObsFoto && inputObsFoto.files && inputObsFoto.files[0] ? inputObsFoto.files[0] : null);
            const obsFotoBlob2 = (fotoObs2 && fotoObs2.blob) ? fotoObs2.blob : (inputObsFoto2 && inputObsFoto2.files && inputObsFoto2.files[0] ? inputObsFoto2.files[0] : null);
            let obsFotoNombre = '';
            let obsFotoPath = '';
            let obsFotoNombre2 = '';
            let obsFotoPath2 = '';

            const prevParams = Array.isArray(inspeccionEditData && inspeccionEditData.parametros) ? inspeccionEditData.parametros : [];
            const prevObsFotoNombre = (inspeccionEditData && inspeccionEditData.observacionesFotoNombre) ? String(inspeccionEditData.observacionesFotoNombre) : '';
            const prevObsFotoPath = (inspeccionEditData && inspeccionEditData.observacionesFotoPath) ? String(inspeccionEditData.observacionesFotoPath) : '';
            const prevObsFotoUrl = (inspeccionEditData && inspeccionEditData.observacionesFotoUrl) ? String(inspeccionEditData.observacionesFotoUrl) : '';
            const prevObsFotoNombre2 = (inspeccionEditData && inspeccionEditData.observacionesFotoNombre2) ? String(inspeccionEditData.observacionesFotoNombre2) : '';
            const prevObsFotoPath2 = (inspeccionEditData && inspeccionEditData.observacionesFotoPath2) ? String(inspeccionEditData.observacionesFotoPath2) : '';
            const prevObsFotoUrl2 = (inspeccionEditData && inspeccionEditData.observacionesFotoUrl2) ? String(inspeccionEditData.observacionesFotoUrl2) : '';
            const filas = document.querySelectorAll('.parametros-fila');
            filas.forEach((filaHtml, idx) => {
                const nombre = filaHtml.querySelector('.col-nombre')?.textContent?.trim() || '';
                const esEstadoGeneral = isEstadoGeneralFila(filaHtml);
                const estadoInput = filaHtml.querySelector(`input[name="param-${idx}-estado"]:checked`);
                const estado = esEstadoGeneral
                    ? String(filaHtml.dataset.estadoCalc || calcularEstadoGeneralDesdeUI() || 'BUENO').toUpperCase()
                    : (estadoInput ? estadoInput.value : '');
                const danoSelect = filaHtml.querySelector(`select[name="param-${idx}-dano"]`);
                const tipoDano = danoSelect ? danoSelect.value : '';
                const inputOtro = filaHtml.querySelector(`input[name="param-${idx}-dano-otro"]`);
                const detalleOtro = inputOtro ? (inputOtro.value || '').trim() : '';
                const inputFoto = filaHtml.querySelector(`input[name="param-${idx}-foto"]`);
                const inputFoto2 = filaHtml.querySelector(`input[name="param-${idx}-foto2"]`);
                const danoChips = filaHtml.querySelector('.dano-chips');
                const chipBtns = danoChips ? Array.from(danoChips.querySelectorAll('.dano-chip')) : [];
                const tieneChipsDano = !!(chipBtns && chipBtns.length);
                const getSelDanos = () => {
                    try {
                        const raw = String(filaHtml.dataset.danosSel || '[]');
                        const arr = JSON.parse(raw);
                        if (Array.isArray(arr)) return arr.map(x => String(x || '').trim().toUpperCase()).filter(Boolean);
                    } catch {}
                    return [];
                };
                let evidenciaNombre = '';
                let evidenciaPath = '';
                let evidenciaUrl = '';
                let evidenciaNombre2 = '';
                let evidenciaPath2 = '';
                let evidenciaUrl2 = '';
                let borrarEvid1 = false;
                let borrarEvid2 = false;
                const danosSeleccionados = (tieneChipsDano && (estado || '').toUpperCase() === 'MALO') ? getSelDanos() : [];
                const evidenciasPorDano = {};

                const allowEvidOnBueno = (tipoInspeccion === 'PRE-TRABAJO');
                if (esEstadoGeneral || (estado && estado.toUpperCase() === 'MALO') || allowEvidOnBueno) {
                    if (tieneChipsDano) {
                        // PRE-TRABAJO (BUENO) sin chips seleccionados: permitir evidencia por parámetro (legacy)
                        // en lugar de evidenciasPorDano.
                        if (allowEvidOnBueno && (!Array.isArray(danosSeleccionados) || !danosSeleccionados.length)) {
                            borrarEvid1 = !!(fotosTomadas[idx] && fotosTomadas[idx].del1);
                            borrarEvid2 = !!(fotosTomadas[idx] && fotosTomadas[idx].del2);

                            const fotoBlob = (fotosTomadas[idx]?.blob) || (inputFoto && inputFoto.files && inputFoto.files[0]) || null;
                            if (fotoBlob) {
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
                                fotosParaSubir.push({ idx, dano: '', slot: 1, nombre, file: fotoBlob, evidenciaNombre });
                            }

                            const puedeSubirEvidencia2 = esEstadoGeneral ? true : !!(window.isAdmin || window.isDirector || window.isSupervisor);
                            const fotoBlob2 = puedeSubirEvidencia2
                                ? ((fotosTomadas[idx]?.blob2) || (inputFoto2 && inputFoto2.files && inputFoto2.files[0]) || null)
                                : null;
                            if (fotoBlob2) {
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
                                evidenciaNombre2 = `${equipoId}-${fechaSafe}-${idxSafe}${slug ? '-' + slug : ''}-2.jpg`;
                                evidenciaPath2 = `inspecciones/${localId}/${evidenciaNombre2}`;
                                fotosParaSubir.push({ idx, dano: '', slot: 2, nombre, file: fotoBlob2, evidenciaNombre: evidenciaNombre2 });
                            }
                        } else {
                        // Por chip: cada daño tiene evidencia propia
                        const prevByDano = (filaHtml && filaHtml.__prevEvidenciasPorDano && typeof filaHtml.__prevEvidenciasPorDano === 'object') ? filaHtml.__prevEvidenciasPorDano : {};
                        const puedeSubirEvidencia2 = !!(window.isAdmin || window.isDirector || window.isSupervisor);

                        const ahora = new Date();
                        const dd = String(ahora.getDate()).padStart(2, '0');
                        const mm = String(ahora.getMonth() + 1).padStart(2, '0');
                        const yy = String(ahora.getFullYear()).slice(-2);
                        const fechaSafe = `${dd}-${mm}-${yy}`;
                        const equipoId = get(idxEquipo) || 'SIN_EQUIPO';
                        const slugParam = String(nombre || '')
                            .toLowerCase()
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/^-+|-+$/g, '')
                            .slice(0, 18);
                        const idxSafe = String(idx).padStart(2, '0');

                        const slugDano = (s) => String(s || '')
                            .toLowerCase()
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/^-+|-+$/g, '')
                            .slice(0, 16);

                        const danosIter = (allowEvidOnBueno && (!Array.isArray(danosSeleccionados) || !danosSeleccionados.length))
                            ? ['']
                            : (danosSeleccionados || []);

                        (danosIter || []).forEach((danoKey) => {
                            const dk = String(danoKey || '').trim().toUpperCase();
                            // En PRE-TRABAJO (BUENO) permitimos evidencias sin daño seleccionado.
                            let prevD = prevByDano && prevByDano[dk] ? prevByDano[dk] : {};
                            try {
                                if ((!prevD || typeof prevD !== 'object' || (!prevD.evidenciaNombre && !prevD.evidenciaPath && !prevD.evidenciaUrl)) && isEditingExisting) {
                                    const prevParam = (prevParams && prevParams[idx]) ? prevParams[idx] : null;
                                    const legacyDano = String(prevParam && prevParam.tipoDano ? prevParam.tipoDano : '').trim().toUpperCase();
                                    if (prevParam && legacyDano && legacyDano === dk) {
                                        const ln = String(prevParam.evidenciaNombre || '').trim();
                                        const lp = String(prevParam.evidenciaPath || '').trim();
                                        const lu = String(prevParam.evidenciaUrl || '').trim();
                                        const ln2 = String(prevParam.evidenciaNombre2 || '').trim();
                                        const lp2 = String(prevParam.evidenciaPath2 || '').trim();
                                        const lu2 = String(prevParam.evidenciaUrl2 || '').trim();
                                        if (ln || lp || lu || ln2 || lp2 || lu2) {
                                            prevD = {
                                                evidenciaNombre: ln,
                                                evidenciaPath: lp,
                                                evidenciaUrl: lu,
                                                evidenciaNombre2: ln2,
                                                evidenciaPath2: lp2,
                                                evidenciaUrl2: lu2,
                                            };
                                        }
                                    }
                                }
                            } catch {}
                            const bucket = fotosTomadas[idx]?.danos?.[dk] || {};

                            const del1 = !!bucket.del1;
                            const del2 = !!bucket.del2;

                            const foto1 = bucket.blob1 || null;
                            const foto2 = puedeSubirEvidencia2 ? (bucket.blob2 || null) : null;

                            let evidenciaNombre1 = '';
                            let evidenciaPath1 = '';
                            let evidenciaNombre22 = '';
                            let evidenciaPath22 = '';

                            if (foto1) {
                                const danoPart = dk ? `-${slugDano(dk)}` : '';
                                evidenciaNombre1 = `${equipoId}-${fechaSafe}-${idxSafe}${slugParam ? '-' + slugParam : ''}${danoPart}.jpg`;
                                evidenciaPath1 = `inspecciones/${localId}/${evidenciaNombre1}`;
                                fotosParaSubir.push({ idx, dano: dk, slot: 1, nombre, file: foto1, evidenciaNombre: evidenciaNombre1 });
                            }

                            if (foto2) {
                                const danoPart = dk ? `-${slugDano(dk)}` : '';
                                evidenciaNombre22 = `${equipoId}-${fechaSafe}-${idxSafe}${slugParam ? '-' + slugParam : ''}${danoPart}-2.jpg`;
                                evidenciaPath22 = `inspecciones/${localId}/${evidenciaNombre22}`;
                                fotosParaSubir.push({ idx, dano: dk, slot: 2, nombre, file: foto2, evidenciaNombre: evidenciaNombre22 });
                            }

                            // Preservar si no viene nueva y no se borró
                            const out = {
                                evidenciaNombre: del1 ? '' : (evidenciaNombre1 || String(prevD.evidenciaNombre || '')),
                                evidenciaPath: del1 ? '' : (evidenciaPath1 || String(prevD.evidenciaPath || '')),
                                evidenciaNombre2: del2 ? '' : (evidenciaNombre22 || String(prevD.evidenciaNombre2 || '')),
                                evidenciaPath2: del2 ? '' : (evidenciaPath22 || String(prevD.evidenciaPath2 || '')),
                                borrarEvid1: del1,
                                borrarEvid2: del2,
                            };
                            evidenciasPorDano[dk] = out;
                        });
                        }
                    } else {
                        // Legacy por parámetro (sin chips)
                        borrarEvid1 = !!(fotosTomadas[idx] && fotosTomadas[idx].del1);
                        borrarEvid2 = !!(fotosTomadas[idx] && fotosTomadas[idx].del2);

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
                            fotosParaSubir.push({ idx, slot: 1, nombre, file: fotoBlob, evidenciaNombre });
                        }

                        // Foto 2
                        const puedeSubirEvidencia2 = esEstadoGeneral ? true : !!(window.isAdmin || window.isDirector || window.isSupervisor);
                        const fotoBlob2 = puedeSubirEvidencia2
                            ? ((fotosTomadas[idx]?.blob2) || (inputFoto2 && inputFoto2.files && inputFoto2.files[0]) || null)
                            : null;
                        if (fotoBlob2) {
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
                            evidenciaNombre2 = `${equipoId}-${fechaSafe}-${idxSafe}${slug ? '-' + slug : ''}-2.jpg`;
                            evidenciaPath2 = `inspecciones/${localId}/${evidenciaNombre2}`;
                            fotosParaSubir.push({ idx, slot: 2, nombre, file: fotoBlob2, evidenciaNombre: evidenciaNombre2 });
                        }
                    }
                }

                // Preservar evidencia previa si estamos editando y no se adjuntó una nueva
                if (isEditingExisting && (esEstadoGeneral || (estado && estado.toUpperCase() === 'MALO') || allowEvidOnBueno) && !evidenciaNombre && !borrarEvid1) {
                    const prev = (prevParams && prevParams[idx]) ? prevParams[idx] : null;
                    if (prev) {
                        const prevNombre = (prev.evidenciaNombre != null) ? String(prev.evidenciaNombre) : '';
                        const prevPath = (prev.evidenciaPath != null) ? String(prev.evidenciaPath) : '';
                        const prevUrl = (prev.evidenciaUrl != null) ? String(prev.evidenciaUrl) : '';
                        if (prevNombre || prevPath || prevUrl) {
                            evidenciaNombre = prevNombre;
                            evidenciaPath = prevPath;
                            evidenciaUrl = prevUrl;
                        }
                    }
                }

                // Preservar evidencia 2 previa si estamos editando y no se adjuntó una nueva
                if (isEditingExisting && (esEstadoGeneral || (estado && estado.toUpperCase() === 'MALO') || allowEvidOnBueno) && !evidenciaNombre2 && !borrarEvid2) {
                    const prev = (prevParams && prevParams[idx]) ? prevParams[idx] : null;
                    if (prev) {
                        const prevNombre2 = (prev.evidenciaNombre2 != null) ? String(prev.evidenciaNombre2) : '';
                        const prevPath2 = (prev.evidenciaPath2 != null) ? String(prev.evidenciaPath2) : '';
                        const prevUrl2 = (prev.evidenciaUrl2 != null) ? String(prev.evidenciaUrl2) : '';
                        if (prevNombre2 || prevPath2 || prevUrl2) {
                            evidenciaNombre2 = prevNombre2;
                            evidenciaPath2 = prevPath2;
                            evidenciaUrl2 = prevUrl2;
                        }
                    }
                }

                // Si se marcó borrar, forzar vaciado
                if (borrarEvid1) {
                    evidenciaNombre = '';
                    evidenciaPath = '';
                    evidenciaUrl = '';
                }
                if (borrarEvid2) {
                    evidenciaNombre2 = '';
                    evidenciaPath2 = '';
                    evidenciaUrl2 = '';
                }

                parametrosCapturados.push({
                    nombre,
                    estado,
                    tipoDano,
                    detalleOtro,
                    hasEvidencia: !!evidenciaNombre,
                    evidenciaNombre,
                    evidenciaPath,
                    evidenciaUrl,
                    evidenciaNombre2,
                    evidenciaPath2,
                    evidenciaUrl2,
                    borrarEvid1,
                    borrarEvid2,
                    danosSeleccionados,
                    evidenciasPorDano,
                });
            });

            try {
                if (isEditingExisting && Array.isArray(prevParams) && prevParams.length && Array.isArray(parametrosCapturados)) {
                    const normParamName = (s) => String(s || '')
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    const prevByNameSave = new Map();
                    prevParams.forEach((p) => {
                        const k = normParamName(p && p.nombre);
                        if (k && !prevByNameSave.has(k)) prevByNameSave.set(k, p);
                    });
                    const hasAnyEvidence = (obj) => {
                        if (!obj) return false;
                        if (
                            obj.evidenciaNombre || obj.evidenciaPath || obj.evidenciaUrl ||
                            obj.evidenciaNombre2 || obj.evidenciaPath2 || obj.evidenciaUrl2
                        ) return true;
                        try {
                            const by = (obj.evidenciasPorDano && typeof obj.evidenciasPorDano === 'object') ? obj.evidenciasPorDano : null;
                            return !!(by && Object.values(by).some(hasAnyEvidence));
                        } catch {
                            return false;
                        }
                    };
                    const mergeEvidenceBucket = (nextBucket, prevBucket) => {
                        const n = { ...(nextBucket || {}) };
                        const p = (prevBucket && typeof prevBucket === 'object') ? prevBucket : {};
                        if (!n.borrarEvid1) {
                            if (!n.evidenciaNombre && p.evidenciaNombre) n.evidenciaNombre = p.evidenciaNombre;
                            if (!n.evidenciaPath && p.evidenciaPath) n.evidenciaPath = p.evidenciaPath;
                            if (!n.evidenciaUrl && p.evidenciaUrl) n.evidenciaUrl = p.evidenciaUrl;
                        }
                        if (!n.borrarEvid2) {
                            if (!n.evidenciaNombre2 && p.evidenciaNombre2) n.evidenciaNombre2 = p.evidenciaNombre2;
                            if (!n.evidenciaPath2 && p.evidenciaPath2) n.evidenciaPath2 = p.evidenciaPath2;
                            if (!n.evidenciaUrl2 && p.evidenciaUrl2) n.evidenciaUrl2 = p.evidenciaUrl2;
                        }
                        return n;
                    };
                    for (let i = 0; i < parametrosCapturados.length; i++) {
                        const next = parametrosCapturados[i] || {};
                        const k = normParamName(next.nombre);
                        const prev = (k && prevByNameSave.get(k)) || prevParams[i] || null;
                        if (!prev) continue;

                        const merged = mergeEvidenceBucket(next, prev);
                        const prevByDano = (prev.evidenciasPorDano && typeof prev.evidenciasPorDano === 'object') ? prev.evidenciasPorDano : {};
                        const nextByDano = (merged.evidenciasPorDano && typeof merged.evidenciasPorDano === 'object') ? merged.evidenciasPorDano : {};
                        const outByDano = { ...(prevByDano || {}) };
                        Object.keys(nextByDano || {}).forEach((dk) => {
                            outByDano[dk] = mergeEvidenceBucket(nextByDano[dk], prevByDano[dk]);
                        });
                        if (Object.keys(outByDano).length) merged.evidenciasPorDano = outByDano;
                        if (!Array.isArray(merged.danosSeleccionados) || !merged.danosSeleccionados.length) {
                            if (Array.isArray(prev.danosSeleccionados) && prev.danosSeleccionados.length && hasAnyEvidence({ evidenciasPorDano: prevByDano })) {
                                merged.danosSeleccionados = prev.danosSeleccionados.slice();
                            }
                        }
                        merged.hasEvidencia = !!(
                            merged.evidenciaNombre || merged.evidenciaPath || merged.evidenciaUrl ||
                            merged.evidenciaNombre2 || merged.evidenciaPath2 || merged.evidenciaUrl2 ||
                            (merged.evidenciasPorDano && Object.values(merged.evidenciasPorDano).some(hasAnyEvidence))
                        );
                        parametrosCapturados[i] = merged;
                    }
                }
            } catch (e) {
                console.warn('No se pudo preservar evidencias previas al guardar', e);
            }

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

            if (obsFotoBlob2) {
                const ahoraObs = new Date();
                const ddObs = String(ahoraObs.getDate()).padStart(2, '0');
                const mmObs = String(ahoraObs.getMonth() + 1).padStart(2, '0');
                const yyObs = String(ahoraObs.getFullYear()).slice(-2);
                const HHObs = String(ahoraObs.getHours()).padStart(2, '0');
                const MMObs = String(ahoraObs.getMinutes()).padStart(2, '0');
                const SSObs = String(ahoraObs.getSeconds()).padStart(2, '0');
                const equipoIdObs = get(idxEquipo) || 'SIN_EQUIPO';
                obsFotoNombre2 = `${equipoIdObs}-${ddObs}${mmObs}${yyObs}-${HHObs}${MMObs}${SSObs}-observaciones-2.jpg`;
                obsFotoPath2 = `inspecciones/${localId}/${obsFotoNombre2}`;
            }

            // Preservar evidencia de observaciones previa si no se adjuntó nueva
            if (!obsFotoBlob && !borrarFotoObs && isEditingExisting && (prevObsFotoNombre || prevObsFotoPath || prevObsFotoUrl)) {
                if (!obsFotoNombre) obsFotoNombre = prevObsFotoNombre;
                if (!obsFotoPath) obsFotoPath = prevObsFotoPath;
            }

            if (!obsFotoBlob2 && !borrarFotoObs2 && isEditingExisting && (prevObsFotoNombre2 || prevObsFotoPath2 || prevObsFotoUrl2)) {
                if (!obsFotoNombre2) obsFotoNombre2 = prevObsFotoNombre2;
                if (!obsFotoPath2) obsFotoPath2 = prevObsFotoPath2;
            }

            // Validaciones requeridas por parámetro
            for (let i = 0; i < parametrosCapturados.length; i++) {
                const p = parametrosCapturados[i];
                const filaHtml = document.querySelectorAll('.parametros-fila')[i];
                const esEstadoGeneral = isEstadoGeneralFila(filaHtml);

                if (!p.estado) {
                    alert(`Selecciona el estado para el parámetro: ${p.nombre}`);
                    try {
                        btnGuardar.innerHTML = prevBtnHtml;
                        btnGuardar.disabled = prevBtnDisabled;
                    } catch {}
                    guardandoInspeccion = false;
                    return;
                }

                if (esEstadoGeneral && !isEditingExisting) {
                    const inputFoto = document.querySelector(`input[name="param-${i}-foto"]`);
                    const inputFoto2 = document.querySelector(`input[name="param-${i}-foto2"]`);
                    const del1 = !!(fotosTomadas[i] && fotosTomadas[i].del1);
                    const del2 = !!(fotosTomadas[i] && fotosTomadas[i].del2);

                    const tieneNueva1 = !!(fotosTomadas[i]?.blob || (inputFoto && inputFoto.files && inputFoto.files[0]));
                    const tieneNueva2 = !!(fotosTomadas[i]?.blob2 || (inputFoto2 && inputFoto2.files && inputFoto2.files[0]));
                    const tieneFoto = !!((tieneNueva1 && !del1) || (tieneNueva2 && !del2));
                    if (!tieneFoto && !puedeOmitirFotos()) {
                        try {
                            const filaEg = filaHtml || (document.querySelectorAll('.parametros-fila')[i] || null);
                            if (filaEg && filaEg.scrollIntoView) {
                                filaEg.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                            if (filaEg && filaEg.style) {
                                const prevOutline = filaEg.style.outline;
                                const prevOutlineOffset = filaEg.style.outlineOffset;
                                filaEg.style.outline = '3px solid #ef4444';
                                filaEg.style.outlineOffset = '4px';
                                setTimeout(() => {
                                    try {
                                        filaEg.style.outline = prevOutline;
                                        filaEg.style.outlineOffset = prevOutlineOffset;
                                    } catch {}
                                }, 2400);
                            }
                        } catch {}

                        alert('Adjunta fotografía (Foto 1) de Estado General. Es obligatoria.\n\nLa foto se sube en la fila "Estado General" (arriba, en Parámetros), NO en Observaciones.');
                        try {
                            btnGuardar.innerHTML = prevBtnHtml;
                            btnGuardar.disabled = prevBtnDisabled;
                        } catch {}
                        guardandoInspeccion = false;
                        return;
                    }
                }
                if (p.estado.toUpperCase() === 'MALO') {
                    // Exigir tipo de daño solo si el parámetro no es Recubrimiento (o similar sin selector de daño)
                    const baseNombre = (p.nombre || '').toLowerCase();
                    const tieneSelectorDanos = !baseNombre.includes('recubrimiento');
                    if (tieneSelectorDanos && !p.tipoDano && (!Array.isArray(p.danosSeleccionados) || !p.danosSeleccionados.length)) {
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
                    const danoChips = document.querySelectorAll('.parametros-fila')[i]?.querySelector('.dano-chips');
                    const chipBtns = danoChips ? Array.from(danoChips.querySelectorAll('.dano-chip')) : [];
                    const tieneChips = !!(chipBtns && chipBtns.length);
                    if (tieneChips) {
                        const sel = Array.isArray(p.danosSeleccionados) ? p.danosSeleccionados.map(x => String(x || '').trim().toUpperCase()).filter(Boolean) : [];
                        for (const dk of sel) {
                            const bucket = fotosTomadas[i]?.danos?.[dk] || {};
                            const row = document.querySelectorAll('.parametros-fila')[i];
                            let prevParam = (row && row.__prevParam) ? row.__prevParam : null;
                            if (!prevParam) {
                                try {
                                    const nombreUi = row ? (row.querySelector('.col-nombre')?.textContent?.trim() || '') : '';
                                    const normKey = (s) => String(s || '')
                                        .toLowerCase()
                                        .normalize('NFD')
                                        .replace(/[\u0300-\u036f]/g, '')
                                        .replace(/\s+/g, ' ')
                                        .trim();
                                    const k = normKey(nombreUi);
                                    const list = (inspeccionEditData && Array.isArray(inspeccionEditData.parametros)) ? inspeccionEditData.parametros : [];
                                    if (k && list.length) {
                                        const hit = list.find(pp => normKey(pp && pp.nombre) === k) || list.find(pp => {
                                            const kn = normKey(pp && pp.nombre);
                                            return kn && (kn.includes(k) || k.includes(kn));
                                        });
                                        if (hit) prevParam = hit;
                                    }
                                } catch {}
                            }
                            if (!prevParam) {
                                prevParam = (inspeccionEditData && Array.isArray(inspeccionEditData.parametros)) ? inspeccionEditData.parametros[i] : null;
                            }
                            const prev = (prevParam && prevParam.evidenciasPorDano && typeof prevParam.evidenciasPorDano === 'object') ? prevParam.evidenciasPorDano : {};
                            const prevD = prev && prev[dk] ? prev[dk] : {};
                            let has1 = !!(bucket.blob1 || (prevD.evidenciaNombre || prevD.evidenciaPath || prevD.evidenciaUrl)) && !bucket.del1;

                            // Modo sin migración: si la inspección es legacy (evidencia a nivel parámetro),
                            // permitir que satisfaga el chip correspondiente al tipoDano guardado.
                            if (!has1 && isEditingExisting && !bucket.del1) {
                                try {
                                    const legacyDano = String(prevParam && prevParam.tipoDano ? prevParam.tipoDano : '').trim().toUpperCase();
                                    const prevNombre = String(prevParam && prevParam.evidenciaNombre ? prevParam.evidenciaNombre : '').trim();
                                    const prevPath = String(prevParam && prevParam.evidenciaPath ? prevParam.evidenciaPath : '').trim();
                                    const prevUrl = String(prevParam && prevParam.evidenciaUrl ? prevParam.evidenciaUrl : '').trim();
                                    const tieneLegacy = !!(prevNombre || prevPath || prevUrl);
                                    if (tieneLegacy && (!legacyDano || legacyDano === dk)) {
                                        has1 = true;
                                    }
                                } catch {}
                            }
                            if (!has1 && !puedeOmitirFotos()) {
                                alert(`Adjunta fotografía de evidencia (Foto 1) para: ${p.nombre} - ${dk}`);
                                try {
                                    btnGuardar.innerHTML = prevBtnHtml;
                                    btnGuardar.disabled = prevBtnDisabled;
                                } catch {}
                                guardandoInspeccion = false;
                                return;
                            }
                        }
                    } else {
                        const inputFoto = document.querySelector(`input[name="param-${i}-foto"]`);
                        const del1 = !!(fotosTomadas[i] && fotosTomadas[i].del1);
                        const tieneNueva = !!(fotosTomadas[i]?.blob || (inputFoto && inputFoto.files && inputFoto.files[0]));
                        let tienePrevia = false;
                        if (isEditingExisting && !del1) {
                            try {
                                const prev = (inspeccionEditData && Array.isArray(inspeccionEditData.parametros)) ? inspeccionEditData.parametros[i] : null;
                                if (prev) {
                                    const prevNombre = String(prev.evidenciaNombre || '').trim();
                                    const prevPath = String(prev.evidenciaPath || '').trim();
                                    const prevUrl = String(prev.evidenciaUrl || '').trim();
                                    tienePrevia = !!(prevNombre || prevPath || prevUrl);
                                }
                            } catch {}
                        }
                        const tieneFoto = !!(tieneNueva || tienePrevia);
                        if (!tieneFoto && !puedeOmitirFotos()) {
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
                    const equipoRef = get(idxEquipo);

                    const buildEquipoVariants = (raw) => {
                        const out = [];
                        const base = String(raw || '').trim();
                        if (base) out.push(base);
                        try {
                            const up = base.toUpperCase();
                            const m = up.match(/^(?:PCT\s*[- ]?\s*)?([A-Z]{2,5})\s*[- ]?\s*(\d{1,4})\s*$/);
                            if (m) {
                                const pref = String(m[1] || '').trim().toUpperCase();
                                const numRaw = String(m[2] || '').trim();
                                const n = String(parseInt(numRaw, 10));
                                if (n && n !== 'NaN') {
                                    out.push(`${pref}-${n}`);
                                    out.push(`${pref}-${n.padStart(2, '0')}`);
                                    out.push(`${pref}-${n.padStart(3, '0')}`);
                                    out.push(`PCT-${pref}-${n.padStart(2, '0')}`);
                                    out.push(`PCT-${pref}-${n.padStart(3, '0')}`);
                                }
                            }
                        } catch {}
                        return Array.from(new Set(out.filter(Boolean)));
                    };
                    const eqCandidates = buildEquipoVariants(equipoRef);

                    // 2.1) Intentar primero por array "equipos" (actividades multi-equipo)
                    try {
                        for (const eqTry of eqCandidates) {
                            if (actividadId) break;
                            if (!eqTry) continue;
                            const qArr = query(
                                colRef,
                                where('equipos', 'array-contains', eqTry),
                                orderBy('fechaRegistro', 'desc'),
                                limit(1)
                            );
                            const snapArr = await getDocs(qArr);
                            if (!snapArr.empty) {
                                const docAct = snapArr.docs[0];
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
                    } catch {}

                    // 2.2) Fallback por campo "equipo" (actividades legacy / single-equipo)
                    if (!actividadId) {
                        try {
                            for (const eqTry of eqCandidates) {
                                if (actividadId) break;
                                if (!eqTry) continue;
                                const q = query(
                                    colRef,
                                    where('equipo', '==', eqTry),
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
                        } catch {}
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

            // Usuario actual: guardar email para trazabilidad y nombre normalizado para reporteo/PDF
            let usuarioInspeccionEmail = '';
            let usuarioInspeccion = '';
            try {
                if (window.auth && window.auth.currentUser && window.auth.currentUser.email) {
                    usuarioInspeccionEmail = String(window.auth.currentUser.email).toLowerCase();
                }
            } catch (e) {
                console.warn('No se pudo leer el usuario actual para la inspección', e);
            }
            try {
                usuarioInspeccion = resolverNombreUsuarioActual() || normalizarNombreUsuario(usuarioInspeccionEmail);
            } catch {}

            const equipoRegistro = (esEquipoTercero && String(valor || '').toUpperCase().trim() === 'TERCERO')
                ? 'TERCERO'
                : get(idxEquipo);
            const descripcionRegistro = (esEquipoTercero && String(valor || '').toUpperCase().trim() === 'TERCERO')
                ? (terceroDescripcion || terceroDescripcionUrl || 'EQUIPO DE TERCERO')
                : get(idxDescripcion);

            const registro = {
                fecha: new Date().toISOString(),
                localId,
                equipo: equipoRegistro,
                producto: get(idxProducto),
                serial: get(idxSerial),
                descripcion: descripcionRegistro,
                reporte: get(idxReporte),
                tipoInspeccion,
                parametros: parametrosCapturados,
                terceroPropiedad: esEquipoTercero ? terceroPropiedad : '',
                terceroConfiguracion: esEquipoTercero ? terceroConfiguracion : '',
                terceroDescripcion: esEquipoTercero ? terceroDescripcion : '',
                fechaEmbarque,
                inicioServicio,
                terminacionServicio,
                cliente,
                areaCliente,
                ubicacion,
                ubicacionGps,
                usuarioInspeccion,
                usuarioInspeccionEmail,
                actividadId,
                observaciones: observacionesResumen,
                observacionesManual: obsTextoManual,
                observacionesFotoNombre: obsFotoNombre,
                observacionesFotoPath: obsFotoPath,
                observacionesFotoUrl: borrarFotoObs ? '' : prevObsFotoUrl,
                observacionesFotoNombre2: obsFotoNombre2,
                observacionesFotoPath2: obsFotoPath2,
                observacionesFotoUrl2: borrarFotoObs2 ? '' : prevObsFotoUrl2,
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
            let lastFirestoreError = null;
            try {
                const { getFirestore, serverTimestamp, doc, setDoc, updateDoc } = await import(
                    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                );
                const { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } = await import(
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
                    if (borrarFotoObs || borrarFotoObs2) {
                        const patchObsDel = {};
                        if (borrarFotoObs) {
                            patchObsDel.observacionesFotoNombre = '';
                            patchObsDel.observacionesFotoPath = '';
                            patchObsDel.observacionesFotoUrl = '';
                            if (prevObsFotoPath) {
                                try { await deleteObject(ref(storage, prevObsFotoPath)); } catch {}
                            }
                        }
                        if (borrarFotoObs2) {
                            patchObsDel.observacionesFotoNombre2 = '';
                            patchObsDel.observacionesFotoPath2 = '';
                            patchObsDel.observacionesFotoUrl2 = '';
                            if (prevObsFotoPath2) {
                                try { await deleteObject(ref(storage, prevObsFotoPath2)); } catch {}
                            }
                        }
                        await updateDoc(docRef, patchObsDel);
                    }
                    if (Array.isArray(parametrosCapturados) && parametrosCapturados.length && Array.isArray(prevParams) && prevParams.length) {
                        for (let i = 0; i < parametrosCapturados.length; i++) {
                            const pNext = parametrosCapturados[i] || {};
                            const pPrev = prevParams[i] || {};
                            try {
                                if (pNext.borrarEvid1 && pPrev.evidenciaPath) {
                                    try { await deleteObject(ref(storage, String(pPrev.evidenciaPath))); } catch {}
                                }
                                if (pNext.borrarEvid2 && pPrev.evidenciaPath2) {
                                    try { await deleteObject(ref(storage, String(pPrev.evidenciaPath2))); } catch {}
                                }
                                const byNext = (pNext.evidenciasPorDano && typeof pNext.evidenciasPorDano === 'object') ? pNext.evidenciasPorDano : {};
                                const byPrev = (pPrev.evidenciasPorDano && typeof pPrev.evidenciasPorDano === 'object') ? pPrev.evidenciasPorDano : {};
                                for (const dk of Object.keys(byNext)) {
                                    try {
                                        const n = byNext[dk] || {};
                                        const o = byPrev[dk] || {};
                                        if (n.borrarEvid1 && o.evidenciaPath) {
                                            try { await deleteObject(ref(storage, String(o.evidenciaPath))); } catch {}
                                        }
                                        if (n.borrarEvid2 && o.evidenciaPath2) {
                                            try { await deleteObject(ref(storage, String(o.evidenciaPath2))); } catch {}
                                        }
                                    } catch {}
                                }
                            } catch {}
                        }
                    }
                    if (Array.isArray(fotosParaSubir) && fotosParaSubir.length) {
                        if (!navigator.onLine) {
                            throw new Error('OFFLINE');
                        }
                        const urlsPorKey = {};
                        for (const f of fotosParaSubir) {
                            const name = (f && f.evidenciaNombre)
                                ? String(f.evidenciaNombre)
                                : `foto-${String(f && f.idx != null ? f.idx : '')}.jpg`;
                            const slot = (f && f.slot != null) ? String(f.slot) : '1';
                            const danoKey = (f && f.dano != null) ? String(f.dano).trim().toUpperCase() : '';
                            // Usar la misma carpeta que evidenciaPath (localId)
                            const pth = `inspecciones/${localId}/${name}`;
                            const stRef = ref(storage, pth);
                            await uploadBytes(stRef, f.file);
                            const url = await getDownloadURL(stRef);
                            urlsPorKey[`${String(f.idx)}|${danoKey}|${slot}`] = url;
                        }

                        const nextParams = (parametrosCapturados || []).map((p, idx) => {
                    const next = { ...(p || {}) };

                    const hasChips = Array.isArray(next.danosSeleccionados) && next.danosSeleccionados.length;
                    if (hasChips) {
                        const sel = next.danosSeleccionados.map(x => String(x || '').trim().toUpperCase()).filter(Boolean);
                        const by = (next.evidenciasPorDano && typeof next.evidenciasPorDano === 'object') ? next.evidenciasPorDano : {};
                        try {
                            const pruned = {};
                            sel.forEach((dk) => {
                                if (by && by[dk]) pruned[dk] = by[dk];
                            });
                            next.evidenciasPorDano = pruned;
                        } catch {
                            next.evidenciasPorDano = by;
                        }
                        sel.forEach((dk) => {
                            const u1 = urlsPorKey[`${String(idx)}|${dk}|1`] || '';
                            const u2 = urlsPorKey[`${String(idx)}|${dk}|2`] || '';
                            if (!u1 && !u2) return;
                            next.evidenciasPorDano[dk] = { ...(next.evidenciasPorDano[dk] || {}) };
                            if (u1) {
                                const name = (next.evidenciasPorDano[dk] && next.evidenciasPorDano[dk].evidenciaNombre) ? String(next.evidenciasPorDano[dk].evidenciaNombre) : '';
                                const evidenciaPath = (next.evidenciasPorDano[dk] && next.evidenciasPorDano[dk].evidenciaPath)
                                    ? String(next.evidenciasPorDano[dk].evidenciaPath)
                                    : (name ? `inspecciones/${localId}/${name}` : '');
                                next.evidenciasPorDano[dk].evidenciaUrl = u1;
                                next.evidenciasPorDano[dk].evidenciaPath = evidenciaPath;
                            }
                            if (u2) {
                                const name2 = (next.evidenciasPorDano[dk] && next.evidenciasPorDano[dk].evidenciaNombre2) ? String(next.evidenciasPorDano[dk].evidenciaNombre2) : '';
                                const evidenciaPath2 = (next.evidenciasPorDano[dk] && next.evidenciasPorDano[dk].evidenciaPath2)
                                    ? String(next.evidenciasPorDano[dk].evidenciaPath2)
                                    : (name2 ? `inspecciones/${localId}/${name2}` : '');
                                next.evidenciasPorDano[dk].evidenciaUrl2 = u2;
                                next.evidenciasPorDano[dk].evidenciaPath2 = evidenciaPath2;
                            }
                        });
                        return next;
                    }

                            const u1 = urlsPorKey[`${String(idx)}||1`] || '';
                            const u2 = urlsPorKey[`${String(idx)}||2`] || '';
                            if (!u1 && !u2) return p;

                            if (u1) {
                                const name = (next && next.evidenciaNombre) ? String(next.evidenciaNombre) : '';
                                const evidenciaPath = (next && next.evidenciaPath)
                                    ? String(next.evidenciaPath)
                                    : (name ? `inspecciones/${localId}/${name}` : '');
                                next.evidenciaUrl = u1;
                                next.evidenciaPath = evidenciaPath;
                            }
                            if (u2) {
                                const name2 = (next && next.evidenciaNombre2) ? String(next.evidenciaNombre2) : '';
                                const evidenciaPath2 = (next && next.evidenciaPath2)
                                    ? String(next.evidenciaPath2)
                                    : (name2 ? `inspecciones/${localId}/${name2}` : '');
                                next.evidenciaUrl2 = u2;
                                next.evidenciaPath2 = evidenciaPath2;
                            }
                            return next;
                        });

                        // Guardar URLs resueltas en el documento (merge)
                        await updateDoc(docRef, { parametros: nextParams });
                        try {
                            patchInspeccionLocalPorId(localId, { parametros: nextParams });
                        } catch {}
                    }

                    if (obsFotoBlob && obsFotoNombre) {
                        if (!navigator.onLine) {
                            throw new Error('OFFLINE');
                        }
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

                    if (obsFotoBlob2 && obsFotoNombre2) {
                        if (!navigator.onLine) {
                            throw new Error('OFFLINE');
                        }
                        const pthObs2 = `inspecciones/${localId}/${obsFotoNombre2}`;
                        const stRefObs2 = ref(storage, pthObs2);
                        await uploadBytes(stRefObs2, obsFotoBlob2);
                        const urlObs2 = await getDownloadURL(stRefObs2);
                        await updateDoc(docRef, {
                            observacionesFotoUrl2: urlObs2,
                            observacionesFotoPath2: pthObs2,
                            observacionesFotoNombre2: obsFotoNombre2,
                        });
                        try {
                            patchInspeccionLocalPorId(localId, {
                                observacionesFotoUrl2: urlObs2,
                                observacionesFotoPath2: pthObs2,
                                observacionesFotoNombre2: obsFotoNombre2,
                            });
                        } catch {}
                    }

                    // sinDaño removido del UI
                } catch (e) {
                    console.warn('No se pudieron subir evidencias a Storage:', e);

                    // Encolar evidencias para reintento al reabrir la app
                    try {
                        const seed = String(Date.now());
                        for (const f of (Array.isArray(fotosParaSubir) ? fotosParaSubir : [])) {
                            const name = (f && f.evidenciaNombre) ? String(f.evidenciaNombre) : '';
                            if (!name || !f.file) continue;
                            const slot = (f && f.slot != null) ? Number(f.slot) : 1;
                            const danoKey = (f && f.dano != null) ? String(f.dano).trim().toUpperCase() : '';
                            const kind = danoKey ? 'dano' : 'param';
                            const storagePath = `inspecciones/${localId}/${name}`;
                            await enqueueEvidenceUpload({
                                docId: localId,
                                kind,
                                idx: f.idx,
                                dano: danoKey,
                                slot,
                                evidenciaNombre: name,
                                storagePath,
                                seed,
                            }, f.file);
                        }
                        if (obsFotoBlob && obsFotoNombre) {
                            const storagePath = `inspecciones/${localId}/${obsFotoNombre}`;
                            await enqueueEvidenceUpload({
                                docId: localId,
                                kind: 'obs',
                                idx: 0,
                                dano: '',
                                slot: 1,
                                evidenciaNombre: obsFotoNombre,
                                storagePath,
                                seed,
                            }, obsFotoBlob);
                        }

                        if (obsFotoBlob2 && obsFotoNombre2) {
                            const storagePath = `inspecciones/${localId}/${obsFotoNombre2}`;
                            await enqueueEvidenceUpload({
                                docId: localId,
                                kind: 'obs',
                                idx: 0,
                                dano: '',
                                slot: 2,
                                evidenciaNombre: obsFotoNombre2,
                                storagePath,
                                seed,
                            }, obsFotoBlob2);
                        }

                        // sinDaño removido del UI
                    } catch (qe) {
                        console.warn('No se pudo encolar evidencia pendiente', qe);
                    }

                    // Marcar como pendiente de evidencias
                    try {
                        await updateDoc(docRef, { syncStatus: 'PENDING_EVID' });
                        patchInspeccionLocalPorId(localId, { syncStatus: 'PENDING_EVID' });
                    } catch {}
                }
                try {
                    if (typeof window.pctAudit === 'function') {
                        const equipo = (registro && registro.equipo ? String(registro.equipo) : '').trim();
                        const actividadId = (registro && registro.actividadId ? String(registro.actividadId) : '').trim();
                        await window.pctAudit('inspecciones_create', { equipo, actividadId });
                    }
                } catch {}
            } catch (e) {
                lastFirestoreError = e;
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
                let detalleError = '';
                try {
                    const offline = (typeof navigator !== 'undefined') ? (navigator.onLine === false) : false;
                    const u = (window.auth && window.auth.currentUser) ? window.auth.currentUser : null;
                    const noSesion = !u;
                    const code = (lastFirestoreError && (lastFirestoreError.code || lastFirestoreError.name)) ? String(lastFirestoreError.code || lastFirestoreError.name) : '';
                    const msg = (lastFirestoreError && lastFirestoreError.message) ? String(lastFirestoreError.message) : '';
                    if (offline) detalleError = 'Sin conexión (offline).';
                    else if (noSesion) detalleError = 'Sesión no activa (vuelve a iniciar sesión).';
                    else if (code) detalleError = `Error: ${code}${msg ? ' - ' + msg : ''}`;
                } catch {}

                detalleContenedor.innerHTML = `
                    <div style="padding:0.9rem 1rem; border-radius:0.75rem; border:1px solid #f59e0b; background:#fffbeb; text-align:center; font-size:1rem; font-weight:700; color:#92400e; margin-bottom:0.5rem;">
                        Inspección pendiente de sincronizar
                    </div>
                    <p style="font-size:0.85rem; color:#4b5563; text-align:center;">
                        No se pudo guardar en el sistema (Firestore). Mantén la sesión abierta y revisa conexión/inicio de sesión.
                    </p>
                    ${detalleError ? `<p style="font-size:0.78rem; color:#6b7280; text-align:center; word-break:break-word;">${escapeHtml(detalleError)}</p>` : ''}
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
