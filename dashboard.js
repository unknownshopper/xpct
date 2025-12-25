document.addEventListener('DOMContentLoaded', () => {
    const spanPruebas = document.getElementById('dash-pruebas');
    const spanInspecciones = document.getElementById('dash-inspecciones');
    const spanInvre = document.getElementById('dash-equipos-invre');
    const spanInvre2 = document.getElementById('dash-registros-invre2');
    const spanActividades = document.getElementById('dash-actividades');

    if (!spanPruebas && !spanInspecciones && !spanInvre && !spanInvre2 && !spanActividades) return; // No estamos en index.html

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

            const d = new Date(s);
            if (isNaN(d.getTime())) return null;
            d.setHours(0, 0, 0, 0);
            return d;
        }

        (async () => {
            try {
                const { getFirestore, collection, getDocs } = await import(
                    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                );

                const db = getFirestore();
                const colRef = collection(db, 'pruebas');
                const snap = await getDocs(colRef);

                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);

                let total = 0;
                let porVencer60 = 0; // 60–30
                let porVencer30 = 0; // 30–15
                let porVencer15 = 0; // 15–0

                let totalAnual = 0;
                let totalPostTrabajo = 0;
                let totalReparacion = 0;

                snap.forEach(doc => {
                    total += 1;
                    const data = doc.data() || {};
                    const proximaStr = data.proxima || '';
                    const periodoStr = (data.periodo || '').toString().trim().toUpperCase();

                    if (periodoStr === 'ANUAL' || periodoStr === '') {
                        totalAnual += 1;
                    } else if (periodoStr === 'POST-TRABAJO') {
                        totalPostTrabajo += 1;
                    } else if (periodoStr === 'REPARACION') {
                        totalReparacion += 1;
                    }
                    const dProx = parseProxima(proximaStr);
                    if (!dProx) return;

                    const diffMs = dProx.getTime() - hoy.getTime();
                    let dias = Math.round(diffMs / (1000 * 60 * 60 * 24));
                    if (dias < 0) return; // ya vencidas, no cuentan como "por vencer"

                    if (dias >= 30 && dias <= 60) {
                        porVencer60 += 1; // 60–30
                    } else if (dias >= 15 && dias < 30) {
                        porVencer30 += 1; // 30–15
                    } else if (dias >= 0 && dias < 15) {
                        porVencer15 += 1; // 15–0
                    }
                });

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

        // 1) Determinar equipos "fuera de servicio" a partir de inspecciones locales
        //    Regla: si un equipo tiene al menos una inspección con algún parámetro en estado MALO,
        //    se considera fuera de servicio (independiente de OFF/WIP en inventario; se cruza con ON).
        const equiposFueraServicio = new Set();
        try {
            const listaInsp = JSON.parse(localStorage.getItem('pct_inspecciones') || '[]');
            if (Array.isArray(listaInsp)) {
                listaInsp.forEach(reg => {
                    const equipo = (reg && reg.equipo) ? String(reg.equipo).trim() : '';
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

        // 2) Contar equipos por estado (ON / OFF / WIP) en invre.csv y cruzar ON con "fuera de servicio"
        fetch('docs/invre.csv')
            .then(r => (r.ok ? r.text() : ''))
            .then(t => {
                if (!t) return;

                const lineas = t.split(/\r?\n/).filter(l => l.trim() !== '');
                if (!lineas.length) return;

                const headersLocal = parseCSVLine(lineas[0]);
                // En invre.csv la columna de estado se llama "EDO"
                const idxEstado = headersLocal.indexOf('EDO');
                const idxEquipo = headersLocal.indexOf('EQUIPO / ACTIVO');

                let onCount = 0;
                let offCount = 0;
                let wipCount = 0;
                let fueraServicioCount = 0;

                lineas.slice(1).forEach(linea => {
                    const cols = parseCSVLine(linea);
                    if (!cols.length || idxEstado < 0) return;

                    const valor = (cols[idxEstado] || '').trim().toUpperCase();
                    if (!valor) return;

                    const equipo = idxEquipo >= 0 ? (cols[idxEquipo] || '').trim() : '';

                    if (valor === 'ON') {
                        onCount += 1;
                        // Equipo ON que tiene alguna inspección con parámetro MALO
                        if (equipo && equiposFueraServicio.has(equipo)) {
                            fueraServicioCount += 1;
                        }
                    } else if (valor === 'OFF') {
                        offCount += 1;
                    } else if (valor === 'WIP') {
                        wipCount += 1;
                    }
                });

                elEquiposInvre.innerHTML = `
                    <div style="font-size:0.85rem; line-height:1.4;">
                        ON: <strong>${onCount}</strong><br>
                        OFF: <strong>${offCount}</strong><br>
                        WIP: <strong>${wipCount}</strong><br>
                        Fuera de servicio: <strong>${fueraServicioCount}</strong>
                    </div>
                `;
            })
            .catch(() => {
                elEquiposInvre.textContent = '--';
            });
    }

    // Inspecciones: mostrar en la tarjeta tanto las pendientes (por realizar) como las realizadas
    // "Pendientes" = actividades en Firestore que aún no tienen una inspección asociada
    // "Realizadas" = inspecciones guardadas en Firestore (o en localStorage como respaldo)
    if (spanInspecciones) {
        spanInspecciones.textContent = 'Cargando...';

        (async () => {
            try {
                // 1) Leer actividades desde Firestore para conocer el universo de actividades
                const { getFirestore, collection, getDocs } = await import(
                    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                );

                const db = getFirestore();
                const colRef = collection(db, 'actividades');
                const snap = await getDocs(colRef);

                const actividadIds = new Set();
                snap.forEach(doc => {
                    actividadIds.add(doc.id);
                });

                // 2) Leer inspecciones desde Firestore (con fallback a localStorage)
                let listaInspecciones = [];
                try {
                    const { collection: col, getDocs: getDocsInsp } = await import(
                        'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                    );

                    const colInsp = col(db, 'inspecciones');
                    const snapInsp = await getDocsInsp(colInsp);
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
                const { getFirestore, collection, getDocs } = await import(
                    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                );

                const db = getFirestore();
                const colRef = collection(db, 'actividades');
                const snap = await getDocs(colRef);

                let total = 0;
                let concluidas = 0;
                let pendientes = 0;

                snap.forEach(doc => {
                    total += 1;
                    const data = doc.data() || {};
                    const term = (data.terminacionServicio || '').trim();
                    if (term) {
                        concluidas += 1;
                    } else {
                        pendientes += 1;
                    }
                });

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
                            <span class="row-left">⏳ <span>Pendientes</span></span>
                            <span class="badge amber">${pendientes}</span>
                        </div>
                    </div>
                `;
            } catch (e) {
                console.error('Error al leer resumen de actividades para el dashboard', e);
                spanActividades.textContent = 'Error';
            }
        })();
    }

    // Para invre e invre2 dejamos -- por ahora o podemos calcular desde CSV más adelante
});
