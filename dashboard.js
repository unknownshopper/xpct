document.addEventListener('DOMContentLoaded', () => {
    const spanPruebas = document.getElementById('dash-pruebas');
    const spanInspecciones = document.getElementById('dash-inspecciones');
    const spanInvre = document.getElementById('dash-equipos-invre');
    const spanInvre2 = document.getElementById('dash-registros-invre2');
    const spanActividades = document.getElementById('dash-actividades');

    const dashModal = document.getElementById('dash-modal');
    const dashModalBody = document.getElementById('dash-modal-body');
    const dashModalClose = document.getElementById('dash-modal-cerrar');
    const dashModalTitle = document.getElementById('dash-modal-title');

    function abrirDashModal(titulo, htmlBody) {
        if (!dashModal || !dashModalBody) return;
        try {
            if (dashModalTitle) dashModalTitle.textContent = titulo || '';
            dashModalBody.innerHTML = htmlBody || '';
            dashModal.style.display = 'flex';
        } catch {}
    }

    function cerrarDashModal() {
        if (!dashModal) return;
        try { dashModal.style.display = 'none'; } catch {}
    }

    if (dashModalClose) {
        dashModalClose.addEventListener('click', () => cerrarDashModal());
    }
    if (dashModal) {
        dashModal.addEventListener('click', (ev) => {
            if (ev.target === dashModal) cerrarDashModal();
        });
    }

    if (!spanPruebas && !spanInspecciones && !spanInvre && !spanInvre2 && !spanActividades) return; // No estamos en index.html

    // Habilitar persistencia offline si está disponible (no falla en multi-tab)
    (async ()=>{
        try {
            // enableIndexedDbPersistence() muestra advertencia de deprecación en Firestore 10.x.
            // Se omite para evitar ruido en consola; Firestore seguirá usando caché en memoria.
        } catch {}
    })();

    const COOLDOWN_MS = 15 * 60 * 1000;
    function isRateLimitErr(err) {
        try {
            if (!err) return false;
            if (err.code === 'resource-exhausted') return true;
            const msg = String(err.message || '').toLowerCase();
            return msg.includes('429') || msg.includes('too many') || msg.includes('resource-exhausted');
        } catch { return false; }
    }
    function getCooldownUntil(key) {
        try {
            const v = Number(localStorage.getItem(key) || '0');
            return Number.isFinite(v) ? v : 0;
        } catch { return 0; }
    }
    function setCooldown(key) {
        try { localStorage.setItem(key, String(Date.now() + COOLDOWN_MS)); } catch {}
    }
    function getCachedNumber(key) {
        try {
            const raw = localStorage.getItem(key);
            if (raw == null) return null;
            const s = String(raw).trim();
            if (!s) return null;
            const n = Number(s);
            return Number.isFinite(n) ? n : null;
        } catch { return null; }
    }
    function setCachedNumber(key, val) {
        try {
            const n = (typeof val === 'number') ? val : Number(val);
            if (Number.isFinite(n) && n >= 0) localStorage.setItem(key, String(n));
        } catch {}
    }

    // Pruebas guardadas en Firestore (total y por vencer a 60/30/15 días)
    if (spanPruebas) {
        spanPruebas.textContent = 'Cargando...';

        function parseProxima(str) {
            if (!str) return null;
            const s = String(str).trim();
            if (!s) return null;

            // Formato dd/mm/aa
            if (s.includes('/')) {
                const partes = s.split('/');
                if (partes.length !== 3) return null;
                const [ddStr, mmStr, aaStr] = partes;
                const dd = parseInt(ddStr, 10);
                const mm = parseInt(mmStr, 10);
                const aa = parseInt(aaStr, 10);
                if (!dd || !mm || isNaN(aa)) return null;
                const year = aa < 100 ? 2000 + aa : aa;
                const d = new Date(year, mm - 1, dd);
                if (isNaN(d.getTime())) return null;
                d.setHours(0, 0, 0, 0);
                return d;
            }

        async function getSnapPreferCacheThenNetwork(colRef) {
            try {
                const sc = await (await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')).getDocsFromCache(colRef);
                if (sc && typeof sc.size === 'number' && sc.size > 0) return sc;
            } catch {}
            try {
                const sr = await (await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')).getDocs(colRef);
                return sr;
            } catch {}
            return null;
        }

            const d = new Date(s);
            if (isNaN(d.getTime())) return null;
            d.setHours(0, 0, 0, 0);
            return d;
        }

        (async () => {
            try {
                const { getFirestore, collection, getDocsFromCache, getDocs } = await import(
                    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                );

                const db = getFirestore();
                const colRef = collection(db, 'pruebas');

                // 1) Total sin agregación (evita 429 RunAggregationQuery)
                let total = '—';
                const cdKey = 'pct_dash_pruebas_count_cooldown_until';
                const cacheKey = 'pct_pruebas_total_cached';
                try {
                    // Si ya hay un total cacheado, úsalo siempre.
                    const cached = getCachedNumber(cacheKey);
                    if (cached != null) total = cached;
                    else {
                        try {
                            const snapCacheOnly = await getDocsFromCache(colRef);
                            total = snapCacheOnly.size;
                            setCachedNumber(cacheKey, total);
                        } catch {}
                    }
                } catch (err) {
                    // No se debería llegar aquí, pero mantenemos fallback silencioso.
                    try { setCooldown(cdKey); } catch {}
                }

                try { setCachedNumber(cacheKey, total); } catch {}

                // 2) Buckets y tipos desde caché únicamente (si no hay caché, mostramos —)
                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);

                let porVencer60 = '—';
                let porVencer30 = '—';
                let porVencer15 = '—';
                let totalAnual = '—';
                let totalPostTrabajo = '—';
                let totalReparacion = '—';

                try {
                    let snap = await getDocsFromCache(colRef);
                    if (snap && typeof snap.size === 'number' && snap.size === 0) {
                        try { snap = await getDocs(colRef); } catch {}
                    }
                    let pv60 = 0, pv30 = 0, pv15 = 0, tAn=0, tPT=0, tRep=0;
                    snap.forEach(doc => {
                        const data = doc.data() || {};
                        const proximaStr = data.proxima || '';
                        const periodoStr = (data.periodo || '').toString().trim().toUpperCase();
                        if (periodoStr === 'ANUAL' || periodoStr === '') tAn += 1;
                        else if (periodoStr === 'POST-TRABAJO') tPT += 1;
                        else if (periodoStr === 'REPARACION') tRep += 1;

                        // Rangos de vencimiento: solo aplican a ANUAL (evita contaminar con proxima residual en otros periodos)
                        if (!(periodoStr === 'ANUAL' || periodoStr === '')) return;
                        const dProx = parseProxima(proximaStr);
                        if (!dProx) return;
                        const diffMs = dProx.getTime() - hoy.getTime();
                        let dias = Math.round(diffMs / (1000 * 60 * 60 * 24));
                        if (dias < 0) return;
                        if (dias >= 30 && dias <= 60) pv60 += 1;
                        else if (dias >= 15 && dias < 30) pv30 += 1;
                        else if (dias >= 0 && dias < 15) pv15 += 1;
                    });
                    porVencer60 = pv60; porVencer30 = pv30; porVencer15 = pv15;
                    totalAnual = tAn; totalPostTrabajo = tPT; totalReparacion = tRep;
                } catch {}

                spanPruebas.innerHTML = `
                    <div class="dash-stats" aria-label="Resumen de pruebas">
                        <div class="dash-stat-row">
                            <span class="row-left">📦 <span>Total</span></span>
                            <span class="badge gray">${total}</span>
                        </div>
                        <div class="dash-stat-row">
                            <span class="row-left">🟦 <span>60–30 días</span></span>
                            <span class="badge blue">${porVencer60}</span>
                        </div>
                        <div class="dash-stat-row">
                            <span class="row-left">🟨 <span>30–15 días</span></span>
                            <span class="badge amber">${porVencer30}</span>
                        </div>
                        <div class="dash-stat-row">
                            <span class="row-left">🟥 <span>15–0 días</span></span>
                            <span class="badge red">${porVencer15}</span>
                        </div>
                        <div class="dash-stat-row small" style="margin-top:0.15rem;">
                            <span class="row-left">🧪 <span>Tipos</span></span>
                            <span class="dash-badges-inline">
                                <span class="badge gray" title="Pruebas anuales">Anual: ${totalAnual}</span>
                                <span class="badge gray" title="Post-trabajo">Post-trabajo: ${totalPostTrabajo}</span>
                                <span class="badge gray" title="Reparación">Reparación: ${totalReparacion}</span>
                            </span>
                        </div>
                    </div>
                `;
            } catch (e) {
                console.error('Error al leer resumen de pruebas para el dashboard', e);
                spanPruebas.textContent = 'Error';
            }
        })();
    }

    // Inventario de equipos (invre.csv + inspecciones locales para "fuera de servicio")
    if (spanInvre) {
        // Lógica tomada del bloque original de script.js (Dashboard en index.html)
        const elEquiposInvre = spanInvre;

        const LS_DASH_INVRE = 'pct_dash_invre_equipo_rows_v1';
        function setCachedInvreRows(rows) {
            try {
                localStorage.setItem(LS_DASH_INVRE, JSON.stringify(rows || []));
            } catch {}
        }
        function getCachedInvreRows() {
            try {
                const raw = localStorage.getItem(LS_DASH_INVRE) || '[]';
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch { return []; }
        }

        function renderListaEquiposModal(titulo, equipos) {
            const list = Array.isArray(equipos) ? equipos : [];
            if (!list.length) {
                abrirDashModal(titulo, '<div style="color:#6b7280;">Sin registros.</div>');
                return;
            }

            const rows = list
                .slice(0, 500)
                .map(r => {
                    const equipo = (r.equipo || '').toString();
                    const serial = (r.serial || '').toString();
                    const edo = (r.edo || '').toString();
                    return `
                        <tr>
                            <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb;">${equipo}</td>
                            <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb;">${serial}</td>
                            <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb; white-space:nowrap;">${edo}</td>
                        </tr>
                    `;
                })
                .join('');

            const html = `
                <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:0.5rem;">
                    <div style="font-size:0.85rem; color:#111827;">Total: <strong>${list.length}</strong></div>
                    <input id="dash-invre-buscar" type="text" placeholder="Buscar equipo o serial" style="flex:1; max-width:320px; padding:0.4rem 0.55rem; border:1px solid #d1d5db; border-radius:0.5rem;" />
                </div>
                <div style="max-height:60vh; overflow:auto; border:1px solid #e5e7eb; border-radius:0.5rem;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="background:#f9fafb;">
                                <th style="text-align:left; padding:0.45rem; border-bottom:1px solid #e5e7eb;">Equipo</th>
                                <th style="text-align:left; padding:0.45rem; border-bottom:1px solid #e5e7eb;">Serial</th>
                                <th style="text-align:left; padding:0.45rem; border-bottom:1px solid #e5e7eb;">Estado</th>
                            </tr>
                        </thead>
                        <tbody id="dash-invre-tbody">${rows}</tbody>
                    </table>
                </div>
                ${list.length > 500 ? '<div style="margin-top:0.4rem; color:#6b7280; font-size:0.8rem;">Mostrando primeros 500 registros.</div>' : ''}
            `;

            abrirDashModal(titulo, html);

            // Búsqueda simple en cliente
            try {
                const input = document.getElementById('dash-invre-buscar');
                const tbody = document.getElementById('dash-invre-tbody');
                if (input && tbody) {
                    input.addEventListener('input', () => {
                        const q = String(input.value || '').trim().toUpperCase();
                        const filtered = !q
                            ? list
                            : list.filter(r => {
                                const e = (r.equipo || '').toString().toUpperCase();
                                const s = (r.serial || '').toString().toUpperCase();
                                return e.includes(q) || s.includes(q);
                            });
                        tbody.innerHTML = filtered
                            .slice(0, 500)
                            .map(r => {
                                const equipo = (r.equipo || '').toString();
                                const serial = (r.serial || '').toString();
                                const edo = (r.edo || '').toString();
                                return `
                                    <tr>
                                        <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb;">${equipo}</td>
                                        <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb;">${serial}</td>
                                        <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb; white-space:nowrap;">${edo}</td>
                                    </tr>
                                `;
                            })
                            .join('');
                    });
                }
            } catch {}
        }

        function bindInvreVerButtons() {
            const btnOff = document.getElementById('dash-invre-ver-off');
            const btnWip = document.getElementById('dash-invre-ver-wip');
            const btnFs = document.getElementById('dash-invre-ver-fs');
            const rows = getCachedInvreRows();
            if (btnOff && !btnOff.dataset.bound) {
                btnOff.dataset.bound = '1';
                btnOff.addEventListener('click', () => {
                    renderListaEquiposModal('Equipos OFF', rows.filter(r => (r.edo || '').toUpperCase() === 'OFF'));
                });
            }
            if (btnWip && !btnWip.dataset.bound) {
                btnWip.dataset.bound = '1';
                btnWip.addEventListener('click', () => {
                    renderListaEquiposModal('Equipos WIP', rows.filter(r => (r.edo || '').toUpperCase() === 'WIP'));
                });
            }
            if (btnFs && !btnFs.dataset.bound) {
                btnFs.dataset.bound = '1';
                btnFs.addEventListener('click', () => {
                    renderListaEquiposModal('Fuera de servicio (por inspección)', rows.filter(r => (r.fueraServicio === true)));
                });
            }
        }

        // 1) Determinar equipos "fuera de servicio" a partir de inspecciones locales
        //    Regla: si un equipo tiene al menos una inspección con algún parámetro en estado MALO,
        //    se considera fuera de servicio (independiente de OFF/WIP en inventario; se cruza con ON).
        const equiposFueraServicio = new Set();
        try {
            const listaInsp = JSON.parse(localStorage.getItem('pct_inspecciones') || '[]');
            if (Array.isArray(listaInsp)) {
                listaInsp.forEach(reg => {
                    const equipo = (reg && reg.equipo) ? String(reg.equipo).trim().toUpperCase() : '';
                    const parametros = (reg && Array.isArray(reg.parametros)) ? reg.parametros : [];
                    if (!equipo || !parametros.length) return;

                    const tieneMalo = parametros.some(p => {
                        const est = (p && p.estado) ? String(p.estado).trim().toUpperCase() : '';
                        return est === 'MALO';
                    });
                    if (tieneMalo) {
                        equiposFueraServicio.add(equipo);
                    }
                });
            }
        } catch (e) {
            console.warn('No se pudo interpretar pct_inspecciones para fuera de servicio', e);
        }

        // 2) Contar equipos por estado (ON / OFF / WIP) en invre.csv.
        // Regla adicional: si un equipo está en WIP pero ya tiene al menos 1 prueba en Firestore,
        // se reclasifica como ON en el dashboard.
        (async () => {
            let equiposConPruebas = new Set();
            let serialesConPruebas = new Set();
            try {
                const { getFirestore, collection, getDocsFromCache, getDocs } = await import(
                    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                );
                const db = getFirestore();
                const colPr = collection(db, 'pruebas');
                let snapPr;
                try {
                    snapPr = await getDocsFromCache(colPr);
                    if (snapPr && typeof snapPr.size === 'number' && snapPr.size === 0) {
                        try { snapPr = await getDocs(colPr); } catch {}
                    }
                } catch {
                    try { snapPr = await getDocs(colPr); } catch {}
                }
                if (snapPr) {
                    snapPr.forEach(d => {
                        const data = d.data() || {};
                        const eq = (data.equipo || '').toString().trim().toUpperCase();
                        if (eq) equiposConPruebas.add(eq);

                        const sn = (data.serial || data.numeroSerie || '').toString().trim().toUpperCase();
                        if (sn) serialesConPruebas.add(sn);
                    });
                }
            } catch {}

            try {
                const r = await fetch('docs/invre.csv');
                const t = r.ok ? await r.text() : '';
                if (!t) return;

                const lineas = t.split(/\r?\n/).filter(l => l.trim() !== '');
                if (!lineas.length) return;

                const headersLocal = parseCSVLine(lineas[0]);
                // En invre.csv la columna de estado se llama "EDO"
                const idxEstado = headersLocal.indexOf('EDO');
                const idxEquipo = headersLocal.indexOf('EQUIPO / ACTIVO');
                const idxSerial = headersLocal.indexOf('SERIAL');

                const rowsAll = [];

                let onCount = 0;
                let offCount = 0;
                let wipCount = 0;
                let wipConPruebas = 0;
                let fueraServicioCount = 0;

                lineas.slice(1).forEach(linea => {
                    const cols = parseCSVLine(linea);
                    if (!cols.length || idxEstado < 0) return;

                    const valor = (cols[idxEstado] || '').trim().toUpperCase();
                    if (!valor) return;

                    const equipo = idxEquipo >= 0 ? (cols[idxEquipo] || '').trim().toUpperCase() : '';
                    const serial = idxSerial >= 0 ? (cols[idxSerial] || '').trim().toUpperCase() : '';

                    if (equipo || serial) {
                        rowsAll.push({
                            equipo,
                            serial,
                            edo: valor,
                            fueraServicio: (valor === 'ON' && equipo && equiposFueraServicio.has(equipo)),
                        });
                    }

                    if (valor === 'ON') {
                        onCount += 1;
                        if (equipo && equiposFueraServicio.has(equipo)) {
                            fueraServicioCount += 1;
                        }
                    } else if (valor === 'OFF') {
                        offCount += 1;
                    } else if (valor === 'WIP') {
                        const tienePrueba = (equipo && equiposConPruebas.has(equipo)) || (serial && serialesConPruebas.has(serial));
                        if (tienePrueba) {
                            onCount += 1;
                            wipConPruebas += 1;
                            if (equipo && equiposFueraServicio.has(equipo)) {
                                fueraServicioCount += 1;
                            }
                        } else {
                            wipCount += 1;
                        }
                    }
                });

                elEquiposInvre.innerHTML = `
                    <div style="font-size:0.85rem; line-height:1.4;">
                        ON: <strong>${onCount}</strong><br>
                        OFF: <strong>${offCount}</strong> <button id="dash-invre-ver-off" type="button" style="margin-left:6px; font-size:0.72rem; padding:0.05rem 0.4rem; border-radius:999px; border:1px solid #d1d5db; background:#fff; cursor:pointer;">Ver</button><br>
                        WIP: <strong>${wipCount}</strong> <button id="dash-invre-ver-wip" type="button" style="margin-left:6px; font-size:0.72rem; padding:0.05rem 0.4rem; border-radius:999px; border:1px solid #d1d5db; background:#fff; cursor:pointer;">Ver</button><br>
                        <span style="color:#6b7280;">WIP con pruebas: <strong>${wipConPruebas}</strong></span><br>
                        Fuera de servicio: <strong>${fueraServicioCount}</strong> <button id="dash-invre-ver-fs" type="button" style="margin-left:6px; font-size:0.72rem; padding:0.05rem 0.4rem; border-radius:999px; border:1px solid #d1d5db; background:#fff; cursor:pointer;">Ver</button>
                    </div>
                `;

                setCachedInvreRows(rowsAll);
                bindInvreVerButtons();
            } catch {
                elEquiposInvre.textContent = '--';
            }
        })();
    }

    // Inspecciones: mostrar en la tarjeta tanto las pendientes (por realizar) como las realizadas
    // "Pendientes" = actividades en Firestore que aún no tienen una inspección asociada
    // "Realizadas" = inspecciones guardadas en Firestore (o en localStorage como respaldo)
    if (spanInspecciones) {
        spanInspecciones.textContent = 'Cargando...';

        (async () => {
            try {
                // 1) Leer actividades desde Firestore para conocer el universo de actividades
                const { getFirestore, collection, getDocs, getDocsFromCache } = await import(
                    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                );

                const db = getFirestore();
                const colRef = collection(db, 'actividades');
                let snap;
                try {
                    snap = await getDocsFromCache(colRef);
                    if (snap && typeof snap.size === 'number' && snap.size === 0) {
                        try { snap = await getDocs(colRef); } catch {}
                    }
                } catch {
                    snap = await getDocs(colRef);
                }

                const actividadIds = new Set();
                snap.forEach(doc => {
                    actividadIds.add(doc.id);
                });

                // 2) Leer inspecciones desde Firestore (con fallback a localStorage)
                let listaInspecciones = [];
                try {
                    const { collection: col, getDocs: getDocsInsp, getDocsFromCache: getDocsFromCacheInsp } = await import(
                        'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                    );

                    const colInsp = col(db, 'inspecciones');
                    let snapInsp;
                    try { snapInsp = await getDocsFromCacheInsp(colInsp); }
                    catch { snapInsp = await getDocsInsp(colInsp); }
                    listaInspecciones = snapInsp.docs.map(d => ({ id: d.id, ...d.data() }));
                } catch {
                    // Si falla Firestore, usar localStorage como respaldo
                    try {
                        const crudo = JSON.parse(localStorage.getItem('pct_inspecciones') || '[]');
                        if (Array.isArray(crudo)) listaInspecciones = crudo;
                    } catch {
                        listaInspecciones = [];
                    }
                }

                // Filtrar solo inspecciones con actividadId válido
                listaInspecciones = listaInspecciones.filter(reg => reg && reg.actividadId && actividadIds.has(String(reg.actividadId)));

                const realizadas = listaInspecciones.length;

                // 3) Determinar qué actividades ya tienen al menos una inspección
                const actividadesConInspeccion = new Set();
                listaInspecciones.forEach(reg => {
                    const actId = (reg && reg.actividadId) ? String(reg.actividadId) : '';
                    if (actId) actividadesConInspeccion.add(actId);
                });

                // 4) Pendientes = actividades sin inspección asociada
                let pendientes = 0;
                actividadIds.forEach(id => {
                    if (!actividadesConInspeccion.has(id)) pendientes += 1;
                });

                spanInspecciones.innerHTML = `
                    <div class="dash-stats" aria-label="Resumen de inspecciones">
                        <div class="dash-stat-row">
                            <span class="row-left">⏳ <span>Por realizar</span></span>
                            <span class="badge amber">${pendientes}</span>
                        </div>
                        <div class="dash-stat-row">
                            <span class="row-left">✅ <span>Realizadas</span></span>
                            <span class="badge blue">${realizadas}</span>
                        </div>
                    </div>
                `;
            } catch (e) {
                console.error('Error al leer resumen de inspecciones para el dashboard', e);
                spanInspecciones.textContent = 'Error';
            }
        })();
    }

    // Actividades registradas: leer desde Firestore y clasificar en totales, concluidas y pendientes
    if (spanActividades) {
        spanActividades.textContent = 'Cargando...';

        (async () => {
            try {
                const { getFirestore, collection, getDocsFromCache, getDocs } = await import(
                    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                );

                const db = getFirestore();
                const colRef = collection(db, 'actividades');
                // Totales sin agregación (evita 429 RunAggregationQuery)
                let total = '—';
                let concluidas = '—';
                const cdKeyTot = 'pct_dash_actividades_count_cooldown_until';
                const cacheKeyTot = 'pct_actividades_total_cached';
                try {
                    const cached = getCachedNumber(cacheKeyTot);
                    if (cached != null) total = cached;
                    else {
                        try {
                            let sc = await getDocsFromCache(colRef);
                            if (sc && typeof sc.size === 'number' && sc.size === 0) {
                                try { sc = await getDocs(colRef); } catch {}
                            }
                            if (sc && typeof sc.size === 'number') {
                                total = sc.size;
                                setCachedNumber(cacheKeyTot, total);
                            }
                        } catch {}
                    }
                } catch (err) {
                    try { setCooldown(cdKeyTot); } catch {}
                }
                // Concluidas desde caché (sin agregación)
                try {
                    const cacheKeyCon = 'pct_actividades_concluidas_cached';
                    const cachedCon = getCachedNumber(cacheKeyCon);
                    if (cachedCon != null) concluidas = cachedCon;
                    else {
                        let sc = await getDocsFromCache(colRef);
                        if (sc && typeof sc.size === 'number' && sc.size === 0) {
                            try { sc = await getDocs(colRef); } catch {}
                        }
                        let c = 0; sc.forEach(d=>{ if ((d.data()||{}).terminacionEsFinal===true) c++; });
                        concluidas = c;
                        setCachedNumber(cacheKeyCon, concluidas);
                    }
                } catch {
                    // Si no hay caché, intentar red (sin agregación) para no dejar en blanco.
                    try {
                        const sr = await getDocs(colRef);
                        let c = 0; sr.forEach(d=>{ if ((d.data()||{}).terminacionEsFinal===true) c++; });
                        concluidas = c;
                        setCachedNumber('pct_actividades_concluidas_cached', concluidas);
                        if (typeof total !== 'number') {
                            try { total = sr.size; setCachedNumber('pct_actividades_total_cached', total); } catch {}
                        }
                    } catch {}
                }
                let pendientes = (typeof total==='number' && typeof concluidas==='number') ? (total - concluidas) : '—';

                // Top 2 pendientes desde caché únicamente
                const pendientesItems = [];
                try {
                    const sc = await getDocsFromCache(colRef);
                    sc.forEach(doc=>{
                        const data = doc.data()||{};
                        if (data.terminacionEsFinal!==true) pendientesItems.push({ id: doc.id, ...data });
                    });
                } catch {}

                // Ordenar pendientes por inicioServicio (más recientes primero)
                const parseDdMmAa = (s) => {
                    const str = (s || '').toString();
                    const p = str.split('/');
                    if (p.length !== 3) return null;
                    const dd = parseInt(p[0], 10), mm = parseInt(p[1], 10), aa = parseInt(p[2], 10);
                    if (!dd || !mm || isNaN(aa)) return null;
                    const yyyy = aa < 100 ? 2000 + aa : aa;
                    const d = new Date(yyyy, mm - 1, dd);
                    return isNaN(d.getTime()) ? null : d;
                };
                pendientesItems.sort((a,b)=>{
                    const da = parseDdMmAa(a.inicioServicio) || new Date(2000,0,1);
                    const dbd = parseDdMmAa(b.inicioServicio) || new Date(2000,0,1);
                    return dbd.getTime() - da.getTime();
                });
                const topPend = pendientesItems.slice(0, 2);

                spanActividades.innerHTML = `
                    <div class="dash-stats" aria-label="Resumen de actividades">
                        <div class="dash-stat-row">
                            <span class="row-left">🗂️ <span>Registradas</span></span>
                            <span class="badge gray">${total}</span>
                        </div>
                        <div class="dash-stat-row">
                            <span class="row-left">✅ <span>Concluidas</span></span>
                            <span class="badge blue">${concluidas}</span>
                        </div>
                        <div class="dash-stat-row">
                            <span class="row-left"><button id="dash-actividades-pend-link" type="button" style="all:unset; cursor:pointer;">⏳ <span>Pendientes</span></button></span>
                            <span class="badge amber" title="Abrir detalles">${pendientes}</span>
                        </div>
                    </div>
                `;

                // Modal handlers
                const modal = document.getElementById('dash-modal');
                const modalBody = document.getElementById('dash-modal-body');
                const btnCerrar = document.getElementById('dash-modal-cerrar');
                const openModal = () => { if (modal) modal.style.display = 'flex'; };
                const closeModal = () => { if (modal) modal.style.display = 'none'; };
                if (btnCerrar) btnCerrar.addEventListener('click', closeModal);
                if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

                const btnPend = document.getElementById('dash-actividades-pend-link');
                if (btnPend && modal && modalBody) {
                    btnPend.addEventListener('click', async () => {
                        try {
                            const { getFirestore, collection, getDocsFromCache, getDocs } = await import(
                                'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                            );
                            const db2 = getFirestore();
                            const col2 = collection(db2, 'actividades');
                            let lista = [];
                            try {
                                const sc = await getDocsFromCache(col2);
                                sc.forEach(d=>{ const data=d.data()||{}; if (data.terminacionEsFinal!==true) lista.push({ id:d.id, ...data }); });
                            } catch {}
                            // Intentar red para traer lista completa si la caché está incompleta
                            try {
                                const sr = await getDocs(col2);
                                const tmp = [];
                                sr.forEach(d=>{ const data=d.data()||{}; if (data.terminacionEsFinal!==true) tmp.push({ id:d.id, ...data }); });
                                if (tmp.length) lista = tmp;
                            } catch {}

                            if (!lista.length) {
                                modalBody.innerHTML = '<div>No hay actividades pendientes.</div>';
                                openModal();
                                return;
                            }
                            // Ordenar por inicio descendente
                            const parseDdMmAa = (s) => {
                                const str = (s || '').toString();
                                const p = str.split('/');
                                if (p.length !== 3) return null;
                                const dd = parseInt(p[0], 10), mm = parseInt(p[1], 10), aa = parseInt(p[2], 10);
                                if (!dd || !mm || isNaN(aa)) return null;
                                const yyyy = aa < 100 ? 2000 + aa : aa;
                                const d = new Date(yyyy, mm - 1, dd);
                                return isNaN(d.getTime()) ? null : d;
                            };
                            lista.sort((a,b)=>{
                                const da = parseDdMmAa(a.inicioServicio) || new Date(2000,0,1);
                                const dbd = parseDdMmAa(b.inicioServicio) || new Date(2000,0,1);
                                return dbd.getTime() - da.getTime();
                            });

                            const rows = lista.map(a => {
                                const cliente = (a.cliente || '').toString();
                                const area = (a.areaCliente || '').toString();
                                const ubic = (a.ubicacion || '').toString();
                                const equipo = (a.equipoNorm || a.equipo || (Array.isArray(a.equipos) && a.equipos[0]) || '').toString();
                                const inicio = (a.inicioServicio || '').toString();
                                return `<div style="padding:0.5rem 0; border-bottom:1px solid #e5e7eb;">
                                    <div style=\"font-weight:600;\">${cliente} · ${area} · ${ubic}</div>
                                    <div style=\"color:#4b5563; font-size:0.9rem;\">Equipo: ${equipo} · Inicio: ${inicio}</div>
                                </div>`;
                            }).join('');
                            modalBody.innerHTML = `<div style="max-height:60vh; overflow:auto;">${rows}</div>`;
                            openModal();
                        } catch (err) {
                            modalBody.innerHTML = '<div>Error al cargar pendientes.</div>';
                            openModal();
                        }
                    });
                }
            } catch (e) {
                console.error('Error al leer resumen de actividades para el dashboard', e);
                spanActividades.textContent = 'Error';
            }
        })();
    }

    // Para invre e invre2 dejamos -- por ahora o podemos calcular desde CSV más adelante
});
