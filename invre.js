// Listado completo del inventario en invre.html
document.addEventListener('DOMContentLoaded', () => {
    const tablaInvre = document.getElementById('tabla-invre');
    const thead = document.getElementById('thead-invre');
    const tbody = document.getElementById('tbody-invre');
    const wrapper = document.querySelector('.tabla-invre-wrapper');
    const inputFiltroTexto = document.getElementById('invre-filtro-texto');
    const selectFiltroReporte = document.getElementById('invre-filtro-reporte');
    if (!tablaInvre || !thead || !tbody || !wrapper) return; // No estamos en invre.html

    // Overrides de estado por equipo (ON/OFF/WIP) guardados en localStorage y sincronizados con Firestore
    const claveEstadoOverride = 'pct_invre_estado_override';
    let mapaEstadoOverride = {};
    try {
        const crudo = localStorage.getItem(claveEstadoOverride) || '{}';
        const parsed = JSON.parse(crudo);
        if (parsed && typeof parsed === 'object') mapaEstadoOverride = parsed;
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
                    if (equipoId) {
                        mapaEstadoOverride[equipoId] = edo;
                    }
                });
                try {
                    localStorage.setItem(claveEstadoOverride, JSON.stringify(mapaEstadoOverride));
                } catch (e) {
                    console.warn('No se pudo cachear overrides de estado desde Firestore', e);
                }
            }
        } catch (e) {
            console.warn('No se pudieron cargar estados de inventario desde Firestore', e);
        }
    })();

    fetch('docs/invre.csv')
        .then(response => {
            if (!response.ok) {
                throw new Error('No se pudo cargar invre.csv');
            }
            return response.text();
        })
        .then(texto => {
            const lineas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
            if (!lineas.length) return;

            const headersLocal = parseCSVLine(lineas[0]);

            // Construir cabecera con todos los campos
            const trHead = document.createElement('tr');
            trHead.style.background = '#f3f4f6';
            headersLocal.forEach(h => {
                const th = document.createElement('th');
                th.textContent = h;
                th.style.textAlign = 'left';
                th.style.padding = '0.3rem';
                trHead.appendChild(th);
            });
            thead.appendChild(trHead);

            // Guardar filas en memoria para poder filtrarlas
            const filasDatos = lineas.slice(1)
                .map(linea => parseCSVLine(linea))
                .filter(cols => cols.length);

            const idxEquipo = headersLocal.indexOf('EQUIPO / ACTIVO');
            const idxDescripcion = headersLocal.indexOf('DESCRIPCION');
            const idxSerial = headersLocal.indexOf('SERIAL');
            const idxReporte = headersLocal.indexOf('REPORTE P/P');
            const idxEdo = headersLocal.indexOf('EDO');

            // Llenar opciones de filtro de reporte P/P
            if (selectFiltroReporte && idxReporte >= 0) {
                const unicos = new Set();
                filasDatos.forEach(cols => {
                    const val = cols[idxReporte] || '';
                    if (val) unicos.add(val);
                });
                Array.from(unicos).sort().forEach(val => {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val;
                    selectFiltroReporte.appendChild(opt);
                });
            }

            function aplicaFiltrosYRender() {
                const texto = (inputFiltroTexto?.value || '').toLowerCase().trim();
                const repSel = selectFiltroReporte ? selectFiltroReporte.value : '';

                tbody.innerHTML = '';

                filasDatos.forEach(cols => {
                    if (!cols.length) return;

                    const equipo = idxEquipo >= 0 ? (cols[idxEquipo] || '') : '';
                    const desc = idxDescripcion >= 0 ? (cols[idxDescripcion] || '') : '';
                    const serial = idxSerial >= 0 ? (cols[idxSerial] || '') : '';
                    const rep = idxReporte >= 0 ? (cols[idxReporte] || '') : '';

                    if (texto) {
                        const conjunto = `${equipo} ${desc} ${serial}`.toLowerCase();
                        if (!conjunto.includes(texto)) return;
                    }

                    if (repSel && rep !== repSel) return;

                    const tr = document.createElement('tr');
                    cols.forEach((valor, idx) => {
                        const td = document.createElement('td');
                        td.style.padding = '0.3rem';
                        td.style.borderBottom = '1px solid #e5e7eb';
                        if (idx === 0 || idx === 1 || idx === 4) {
                            td.style.whiteSpace = 'nowrap';
                        }

                        // Columna de estado editable (EDO)
                        if (idx === idxEdo && equipo) {
                            let edoBase = (valor || '').toString().trim().toUpperCase();
                            if (!edoBase) edoBase = 'ON';
                            const override = mapaEstadoOverride[equipo];
                            const edoEfectivo = override ? String(override).trim().toUpperCase() : edoBase;

                            const select = document.createElement('select');
                            select.style.fontSize = '0.8rem';
                            select.style.padding = '0.15rem 0.3rem';
                            ['ON', 'OFF', 'WIP'].forEach(op => {
                                const opt = document.createElement('option');
                                opt.value = op;
                                opt.textContent = op;
                                if (op === edoEfectivo) opt.selected = true;
                                select.appendChild(opt);
                            });

                            select.addEventListener('change', async () => {
                                const previo = edoEfectivo;
                                const nuevo = (select.value || '').toUpperCase();

                                if (!window.isAdmin) {
                                    select.value = previo;
                                    return;
                                }

                                if (nuevo === edoBase) {
                                    delete mapaEstadoOverride[equipo];
                                } else {
                                    mapaEstadoOverride[equipo] = nuevo;
                                }

                                try {
                                    localStorage.setItem(claveEstadoOverride, JSON.stringify(mapaEstadoOverride));
                                } catch (e) {
                                    console.error('No se pudo guardar override de estado en localStorage', e);
                                }

                                try {
                                    const { getFirestore, doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
                                    const db = getFirestore();
                                    const ref = doc(db, 'inventarioEstados', equipo);
                                    await setDoc(ref, { edo: nuevo }, { merge: true });
                                } catch (e) {
                                    console.error('No se pudo guardar estado de inventario en Firestore', e);
                                }
                            });

                            td.appendChild(select);
                        } else {
                            td.textContent = valor;
                        }

                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });
            }

            // Render inicial
            aplicaFiltrosYRender();

            // Listeners de filtros
            if (inputFiltroTexto) {
                inputFiltroTexto.addEventListener('input', () => {
                    aplicaFiltrosYRender();
                });
            }
            if (selectFiltroReporte) {
                selectFiltroReporte.addEventListener('change', () => {
                    aplicaFiltrosYRender();
                });
            }

            // Permitir arrastrar con el mouse para hacer scroll
            let isDown = false;
            let startX = 0;
            let startY = 0;
            let scrollLeft = 0;
            let scrollTop = 0;

            wrapper.addEventListener('mousedown', (e) => {
                isDown = true;
                wrapper.classList.add('dragging');
                startX = e.pageX - wrapper.offsetLeft;
                startY = e.pageY - wrapper.offsetTop;
                scrollLeft = wrapper.scrollLeft;
                scrollTop = wrapper.scrollTop;
            });

            wrapper.addEventListener('mouseleave', () => {
                isDown = false;
                wrapper.classList.remove('dragging');
            });

            wrapper.addEventListener('mouseup', () => {
                isDown = false;
                wrapper.classList.remove('dragging');
            });

            wrapper.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - wrapper.offsetLeft;
                const y = e.pageY - wrapper.offsetTop;
                const walkX = x - startX;
                const walkY = y - startY;
                wrapper.scrollLeft = scrollLeft - walkX;
                wrapper.scrollTop = scrollTop - walkY;
            });
        })
        .catch(err => {
            console.error(err);
        });
});
