document.addEventListener('DOMContentLoaded', () => {
    const inputEquipo = document.getElementById('equipo-input');
    const datalistEquipos = document.getElementById('lista-equipos');
    const detalleContenedor = document.getElementById('detalle-equipo-contenido');
    const btnGuardar = document.getElementById('btn-guardar-inspeccion');

    if (!inputEquipo || !datalistEquipos || !detalleContenedor) {
        // No estamos en inspeccion.html
        return;
    }

    let equipos = [];
    let headers = [];
    let formatosPorCodigo = {};

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

            equipos = lineas.slice(1).map(linea => parseCSVLine(linea));

            // Poblar datalist
            equipos.forEach(cols => {
                const equipoId = idxEquipo >= 0 ? cols[idxEquipo] : '';
                const descripcion = idxDescripcion >= 0 ? cols[idxDescripcion] : '';
                if (!equipoId) return;

                const option = document.createElement('option');
                option.value = equipoId;
                option.label = `${equipoId} - ${descripcion}`;
                datalistEquipos.appendChild(option);
            });
        })
        .catch(err => {
            console.error(err);
            detalleContenedor.innerHTML = '<p>No se pudo cargar el inventario de equipos.</p>';
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
            let formatoActual = null;

            lineas.forEach(linea => {
                const cols = parseCSVLine(linea);
                const nombre = (cols[0] || '').trim();

                if (!nombre) {
                    formatoActual = null;
                    return;
                }

                if (!formatoActual) {
                    // Primera línea no vacía de un bloque: nombre del formato
                    formatoActual = nombre;
                    if (!formatosPorCodigo[formatoActual]) {
                        formatosPorCodigo[formatoActual] = [];
                    }
                } else {
                    // Líneas siguientes: parámetros del formato
                    formatosPorCodigo[formatoActual].push(nombre);
                }
            });
        })
        .catch(err => {
            console.error(err);
        });
    
    // Cuando el usuario escribe y elige un equipo en el input/datalist
    function actualizarDetalleDesdeInput() {
        const valor = inputEquipo.value.trim();
        if (!valor) {
            detalleContenedor.innerHTML = '<p>Seleccione un equipo para ver su información.</p>';
            if (btnGuardar) btnGuardar.disabled = true;
            return;
        }

        const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
        const idxReporte = headers.indexOf('REPORTE P/P');
        const fila = equipos.find(cols => idxEquipo >= 0 && cols[idxEquipo] === valor);
        if (!fila) {
            detalleContenedor.innerHTML = '<p>No se encontró información para el equipo seleccionado.</p>';
            if (btnGuardar) btnGuardar.disabled = true;
            return;
        }

        // Índices de columnas relevantes
        const idxProducto = headers.indexOf('PRODUCTO');
        const idxSerial = headers.indexOf('SERIAL');
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
        const parametrosBrutos = reporte && formatosPorCodigo[reporte]
            ? formatosPorCodigo[reporte].filter(p => p && p.length > 0)
            : [];

        // Parámetros que ya están autocompletados en la ficha del equipo y no deben inspeccionarse
        const nombresAuto = ['activo', 'serial', 'descripción', 'descripcion', 'diámetro', 'diametro', 'conexión', 'conexion', 'longitud'];

        const parametrosInspeccion = parametrosBrutos.filter(p => {
            const base = p.toLowerCase();
            return !nombresAuto.some(auto => base.startsWith(auto));
        });

        const tiposDano = [
            '',
            'DEFORMADO',
            'NO LEGIBLE',
            'SIN FLEJE',
            'DEFORMACION',
            'ABRASION',
            'LAVADURA',
            'CORTADO',
            'RESECO',
            'DEGRADADO',
            'HINCHADO',
            'OTRO'
        ];

        const parametrosHtml = parametrosInspeccion.length
            ? `
                <div class="parametros-inspeccion">
                    <h3>Parámetros de inspección (${reporte})</h3>
                    <div class="parametros-tabla">
                        <div class="parametros-header">
                            <div class="col-nombre">Parámetro</div>
                            <div class="col-estado">Estado</div>
                            <div class="col-dano">Tipo de daño</div>
                        </div>
                        ${parametrosInspeccion.map((p, idx) => `
                            <div class="parametros-fila">
                                <div class="col-nombre">${p}</div>
                                <div class="col-estado">
                                    <label><input type="radio" name="param-${idx}-estado" value="BUENO" checked> BUENO</label>
                                    <label><input type="radio" name="param-${idx}-estado" value="MALO"> MALO</label>
                                    <label><input type="radio" name="param-${idx}-estado" value="NO APLICA"> N/A</label>
                                </div>
                                <div class="col-dano">
                                    <select name="param-${idx}-dano">
                                        ${tiposDano.map(op => op ? `<option value="${op}">${op}</option>` : '<option value="">(Sin daño)</option>').join('')}
                                    </select>
                                </div>
                            </div>
                        `).join('')}
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
        `;

        if (btnGuardar) btnGuardar.disabled = false;
    }

    inputEquipo.addEventListener('change', actualizarDetalleDesdeInput);
    inputEquipo.addEventListener('blur', actualizarDetalleDesdeInput);

    if (btnGuardar) {
        btnGuardar.addEventListener('click', () => {
            const valor = inputEquipo.value.trim();
            if (!valor) return;

            const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
            const idxReporte = headers.indexOf('REPORTE P/P');
            const fila = equipos.find(cols => idxEquipo >= 0 && cols[idxEquipo] === valor);
            if (!fila) return;

            const idxProducto = headers.indexOf('PRODUCTO');
            const idxSerial = headers.indexOf('SERIAL');
            const idxDescripcion = headers.indexOf('DESCRIPCION');

            const get = (idx) => (idx >= 0 && idx < fila.length ? fila[idx] : '');

            const parametrosCapturados = [];
            const filas = document.querySelectorAll('.parametros-fila');
            filas.forEach((filaHtml, idx) => {
                const nombre = filaHtml.querySelector('.col-nombre')?.textContent?.trim() || '';
                const estadoInput = filaHtml.querySelector(`input[name="param-${idx}-estado"]:checked`);
                const estado = estadoInput ? estadoInput.value : '';
                const danoSelect = filaHtml.querySelector(`select[name="param-${idx}-dano"]`);
                const tipoDano = danoSelect ? danoSelect.value : '';
                parametrosCapturados.push({ nombre, estado, tipoDano });
            });

            const registro = {
                fecha: new Date().toISOString(),
                equipo: get(idxEquipo),
                producto: get(idxProducto),
                serial: get(idxSerial),
                descripcion: get(idxDescripcion),
                reporte: get(idxReporte),
                parametros: parametrosCapturados
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
            localStorage.setItem(clave, JSON.stringify(lista));

            btnGuardar.textContent = 'Inspección guardada';
            btnGuardar.disabled = true;
            setTimeout(() => {
                btnGuardar.textContent = 'Guardar inspección';
                btnGuardar.disabled = false;
            }, 1200);
        });
    }
});

// Listado completo del inventario en invre.html
document.addEventListener('DOMContentLoaded', () => {
    const tablaInvre = document.getElementById('tabla-invre');
    const thead = document.getElementById('thead-invre');
    const tbody = document.getElementById('tbody-invre');
    const wrapper = document.querySelector('.tabla-invre-wrapper');
    const inputFiltroTexto = document.getElementById('invre-filtro-texto');
    const selectFiltroReporte = document.getElementById('invre-filtro-reporte');
    if (!tablaInvre || !thead || !tbody || !wrapper) return; // No estamos en invre.html

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
                        td.textContent = valor;
                        td.style.padding = '0.3rem';
                        td.style.borderBottom = '1px solid #e5e7eb';
                        if (idx === 0 || idx === 1 || idx === 4) {
                            td.style.whiteSpace = 'nowrap';
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

// Guardado de pruebas en pruebas.html
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-guardar-prueba');
    if (!btn) return; // No estamos en pruebas.html

    async function guardarPruebaEnFirestore(registro) {
        if (!window.db) {
            console.warn('Firestore no está inicializado (window.db)');
            return;
        }

        try {
            const { addDoc, collection, serverTimestamp } = await import(
                'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
            );

            const datos = {
                ...registro,
                creadoEn: serverTimestamp()
            };

            await addDoc(collection(window.db, 'pruebas'), datos);
            console.log('Prueba guardada en Firestore');
        } catch (e) {
            console.error('Error al guardar prueba en Firestore', e);
        }
    }

    btn.addEventListener('click', () => {
        const fechaPrueba = (document.getElementById('prueba-fecha') || {}).value || '';
        const resultado = (document.getElementById('prueba-resultado') || {}).value || '';

        const equipo = (document.getElementById('inv-equipo') || {}).value || '';
        const serial = (document.getElementById('inv-serial') || {}).value || '';
        const edo = (document.getElementById('inv-edo') || {}).value || '';
        const propiedad = (document.getElementById('inv-propiedad') || {}).value || '';
        const producto = (document.getElementById('inv-producto') || {}).value || '';
        const descripcion = (document.getElementById('inv-descripcion') || {}).value || '';
        const pruebaTipo = (document.getElementById('inv-prueba') || {}).value || '';
        const tipoEquipo = (document.getElementById('inv-tipo-equipo') || {}).value || '';
        const material = (document.getElementById('inv-material') || {}).value || '';
        const area = (document.getElementById('inv-area') || {}).value || '';
        const fechaReal = (document.getElementById('inv-fecha-realizacion') || {}).value || '';
        const noReporte = (document.getElementById('inv-no-reporte') || {}).value || '';
        const ejecucion = (document.getElementById('inv-ejecucion') || {}).value || '';
        const emisor = (document.getElementById('inv-emisor') || {}).value || '';
        const tecnico = (document.getElementById('inv-tecnico') || {}).value || '';
        const proxPrueba = (document.getElementById('inv-proxima') || {}).value || '';
        const contador = (document.getElementById('inv-contador') || {}).value || '';
        const observaciones = (document.getElementById('prueba-observaciones') || {}).value || '';

        const registro = {
            fechaRegistro: new Date().toISOString(),
            fechaPrueba,
            resultado,
            equipo,
            serial,
            edo,
            propiedad,
            producto,
            descripcion,
            pruebaTipo,
            tipoEquipo,
            material,
            area,
            fechaReal,
            noReporte,
            ejecucion,
            emisor,
            tecnico,
            proxPrueba,
            contador,
            observaciones
        };

        const clave = 'pct_pruebas';
        let lista = [];
        try {
            lista = JSON.parse(localStorage.getItem(clave) || '[]');
            if (!Array.isArray(lista)) lista = [];
        } catch (e) {
            lista = [];
        }

        lista.push(registro);
        localStorage.setItem(clave, JSON.stringify(lista));

        // Intentar guardar también en Firestore (si está disponible)
        guardarPruebaEnFirestore(registro);

        btn.textContent = 'Prueba guardada';
        btn.disabled = true;
        setTimeout(() => {
            btn.textContent = 'Guardar prueba';
            btn.disabled = false;
        }, 1200);
    });
});

// Dashboard en index.html
document.addEventListener('DOMContentLoaded', () => {
    const elEquiposInvre = document.getElementById('dash-equipos-invre');
    const elRegInvre2 = document.getElementById('dash-registros-invre2');
    const elInspecciones = document.getElementById('dash-inspecciones');
    const elPruebas = document.getElementById('dash-pruebas');
    if (!elEquiposInvre || !elRegInvre2 || !elInspecciones || !elPruebas) return; // No estamos en index

    // Contar equipos en invre.csv
    fetch('docs/invre.csv')
        .then(r => (r.ok ? r.text() : ''))
        .then(t => {
            if (!t) return;
            const lineas = t.split(/\r?\n/).filter(l => l.trim() !== '');
            const total = Math.max(lineas.length - 1, 0); // restar encabezado
            elEquiposInvre.textContent = total || '0';
        })
        .catch(() => {});

    // Contar registros en invre2.csv
    fetch('docs/invre2.csv')
        .then(r => (r.ok ? r.text() : ''))
        .then(t => {
            if (!t) return;
            const lineas = t.split(/\r?\n/).filter(l => l.trim() !== '');
            const total = Math.max(lineas.length - 1, 0);
            elRegInvre2.textContent = total || '0';
        })
        .catch(() => {});

    // Inspecciones y pruebas desde localStorage
    try {
        const insp = JSON.parse(localStorage.getItem('pct_inspecciones') || '[]');
        elInspecciones.textContent = Array.isArray(insp) ? insp.length : 0;
    } catch {
        elInspecciones.textContent = '0';
    }

    try {
        const pruebas = JSON.parse(localStorage.getItem('pct_pruebas') || '[]');
        elPruebas.textContent = Array.isArray(pruebas) ? pruebas.length : 0;
    } catch {
        elPruebas.textContent = '0';
    }
});

// Visualización de formatos en forxmat.html
document.addEventListener('DOMContentLoaded', () => {
    const contenedor = document.getElementById('forxmat-lista');
    const inputTexto = document.getElementById('forxmat-filtro-texto');
    const selectFormato = document.getElementById('forxmat-select-formato');
    if (!contenedor) return; // No estamos en forxmat.html

    fetch('docs/forxmat.csv')
        .then(response => {
            if (!response.ok) {
                throw new Error('No se pudo cargar forxmat.csv');
            }
            return response.text();
        })
        .then(texto => {
            const lineas = texto.split(/\r?\n/);
            const formatos = {};
            let formatoActual = null;

            lineas.forEach(linea => {
                const cols = parseCSVLine(linea);
                const nombre = (cols[0] || '').trim();

                if (!nombre) {
                    formatoActual = null;
                    return;
                }

                if (!formatoActual) {
                    formatoActual = nombre;
                    if (!formatos[formatoActual]) {
                        formatos[formatoActual] = [];
                    }
                } else {
                    formatos[formatoActual].push(nombre);
                }
            });

            const nombresFormatos = Object.keys(formatos);

            // Poblar combo de formatos
            if (selectFormato) {
                nombresFormatos.sort().forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f;
                    opt.textContent = f;
                    selectFormato.appendChild(opt);
                });
            }

            function renderForxmat() {
                const texto = (inputTexto?.value || '').toLowerCase().trim();
                const formatoSel = selectFormato ? selectFormato.value : '';

                contenedor.innerHTML = '';

                nombresFormatos.forEach(nombreFormato => {
                    if (formatoSel && nombreFormato !== formatoSel) return;

                    const parametros = (formatos[nombreFormato] || []).filter(p => p && p.trim().length);
                    if (texto) {
                        const cadena = `${nombreFormato} ${parametros.join(' ')}`.toLowerCase();
                        if (!cadena.includes(texto)) return;
                    }

                    const card = document.createElement('div');
                    card.className = 'forxmat-card';
                    card.innerHTML = `
                        <h3>${nombreFormato}</h3>
                        <small>${parametros.length} parámetros</small>
                        <div class="forxmat-parametros">
                            ${parametros.map(p => `<span class="forxmat-tag">${p}</span>`).join('')}
                        </div>
                    `;
                    contenedor.appendChild(card);
                });
            }

            renderForxmat();

            if (inputTexto) {
                inputTexto.addEventListener('input', renderForxmat);
            }
            if (selectFormato) {
                selectFormato.addEventListener('change', renderForxmat);
            }
        })
        .catch(err => {
            console.error(err);
        });
});

// Listado detallado en invre2.html (invre2.csv)
document.addEventListener('DOMContentLoaded', () => {
    const tabla = document.getElementById('tabla-invre2');
    const thead = document.getElementById('thead-invre2');
    const tbody = document.getElementById('tbody-invre2');
    const wrapper = document.querySelector('main .tabla-invre-wrapper');
    const inputTexto = document.getElementById('invre2-filtro-texto');
    const selectEstado = document.getElementById('invre2-filtro-estado');
    const selectPrueba = document.getElementById('invre2-filtro-prueba');
    if (!tabla || !thead || !tbody || !wrapper) return; // No estamos en invre2.html

    fetch('docs/invre2.csv')
        .then(response => {
            if (!response.ok) {
                throw new Error('No se pudo cargar invre2.csv');
            }
            return response.text();
        })
        .then(texto => {
            const lineas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
            if (!lineas.length) return;

            const headersLocal = parseCSVLine(lineas[0]);

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

            const filasDatos = lineas.slice(1)
                .map(linea => parseCSVLine(linea))
                .filter(cols => cols.length);

            const idxEstado = headersLocal.indexOf('ESTADO');
            const idxEquipo = headersLocal.indexOf('EQUIPO / ACTIVO');
            const idxProd = headersLocal.indexOf('PRODUCTO');
            const idxDesc = headersLocal.indexOf('DESCRIPCION');
            const idxPrueba = headersLocal.indexOf('PRUEBA / CALIBRACION');
            const idxArea = headersLocal.indexOf('ÁREA A INSPECIONAR');

            // Poblar combos de Estado y Prueba / Calibración
            if (selectEstado && idxEstado >= 0) {
                const unicos = new Set();
                filasDatos.forEach(cols => {
                    const val = cols[idxEstado] || '';
                    if (val) unicos.add(val);
                });
                Array.from(unicos).sort().forEach(val => {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val;
                    selectEstado.appendChild(opt);
                });
            }

            if (selectPrueba && idxPrueba >= 0) {
                const unicos = new Set();
                filasDatos.forEach(cols => {
                    const val = cols[idxPrueba] || '';
                    if (val) unicos.add(val);
                });
                Array.from(unicos).sort().forEach(val => {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val;
                    selectPrueba.appendChild(opt);
                });
            }

            function aplicaFiltrosYRender2() {
                const texto = (inputTexto?.value || '').toLowerCase().trim();
                const estSel = selectEstado ? selectEstado.value : '';
                const prSel = selectPrueba ? selectPrueba.value : '';

                tbody.innerHTML = '';

                filasDatos.forEach(cols => {
                    if (!cols.length) return;

                    const estado = idxEstado >= 0 ? (cols[idxEstado] || '') : '';
                    const equipo = idxEquipo >= 0 ? (cols[idxEquipo] || '') : '';
                    const prod = idxProd >= 0 ? (cols[idxProd] || '') : '';
                    const desc = idxDesc >= 0 ? (cols[idxDesc] || '') : '';
                    const prueba = idxPrueba >= 0 ? (cols[idxPrueba] || '') : '';
                    const area = idxArea >= 0 ? (cols[idxArea] || '') : '';

                    if (texto) {
                        const conjunto = `${equipo} ${prod} ${desc} ${area}`.toLowerCase();
                        if (!conjunto.includes(texto)) return;
                    }

                    if (estSel && estado !== estSel) return;
                    if (prSel && prueba !== prSel) return;

                    const tr = document.createElement('tr');
                    cols.forEach((valor, idx) => {
                        const td = document.createElement('td');
                        td.textContent = valor;
                        td.style.padding = '0.3rem';
                        td.style.borderBottom = '1px solid #e5e7eb';
                        if (idx === 0 || idx === 2) {
                            td.style.whiteSpace = 'nowrap';
                        }
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });
            }

            aplicaFiltrosYRender2();

            if (inputTexto) {
                inputTexto.addEventListener('input', aplicaFiltrosYRender2);
            }
            if (selectEstado) {
                selectEstado.addEventListener('change', aplicaFiltrosYRender2);
            }
            if (selectPrueba) {
                selectPrueba.addEventListener('change', aplicaFiltrosYRender2);
            }

            // Scroll por arrastre
            let isDown = false;
            let startX = 0;
            let startY = 0;
            let scrollLeft = 0;
            let scrollTop = 0;

            wrapper.addEventListener('mousedown', (e) => {
                isDown = true;
                startX = e.pageX - wrapper.offsetLeft;
                startY = e.pageY - wrapper.offsetTop;
                scrollLeft = wrapper.scrollLeft;
                scrollTop = wrapper.scrollTop;
            });

            wrapper.addEventListener('mouseleave', () => {
                isDown = false;
            });

            wrapper.addEventListener('mouseup', () => {
                isDown = false;
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

// Parser simple de una línea CSV que respeta comillas
function parseCSVLine(linea) {
    const resultado = [];
    let actual = '';
    let enComillas = false;

    for (let i = 0; i < linea.length; i++) {
        const c = linea[i];

        if (c === '"') {
            // Alternar estado de comillas
            enComillas = !enComillas;
            continue;
        }

        if (c === ',' && !enComillas) {
            resultado.push(actual.trim());
            actual = '';
        } else {
            actual += c;
        }
    }

    if (actual.length > 0) {
        resultado.push(actual.trim());
    }

    return resultado;
}

