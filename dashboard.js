document.addEventListener('DOMContentLoaded', () => {
    const spanPruebas = document.getElementById('dash-pruebas');
    const spanInspecciones = document.getElementById('dash-inspecciones');
    const spanInvre = document.getElementById('dash-equipos-invre');
    const spanInvre2 = document.getElementById('dash-registros-invre2');
    const spanActividades = document.getElementById('dash-actividades');

    if (!spanPruebas && !spanInspecciones && !spanInvre && !spanInvre2 && !spanActividades) return; // No estamos en index.html

    // Pruebas guardadas (localStorage)
    if (spanPruebas) {
        try {
            const lista = JSON.parse(localStorage.getItem('pct_pruebas') || '[]');
            spanPruebas.textContent = Array.isArray(lista) ? String(lista.length) : '0';
        } catch {
            spanPruebas.textContent = '0';
        }
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
                    <div style="font-size:0.85rem; line-height:1.4;">
                        Por realizar: <strong>${pendientes}</strong><br>
                        Realizadas: <strong>${realizadas}</strong>
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
                    <div style="font-size:0.85rem; line-height:1.4;">
                        Registradas: <strong>${total}</strong><br>
                        Concluidas: <strong>${concluidas}</strong><br>
                        Pendientes: <strong>${pendientes}</strong>
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
