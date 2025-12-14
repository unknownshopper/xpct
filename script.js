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

// Autocompletar información de inventario en pruebas.html desde invre2.csv
document.addEventListener('DOMContentLoaded', () => {
    const inputEquipo = document.getElementById('inv-equipo');
    const datalistEquipos = document.getElementById('lista-equipos-pruebas');
    if (!inputEquipo || !datalistEquipos) return; // No estamos en pruebas.html

    let filasInv = [];
    let headersInv = [];
    const infoPorEquipo = {}; // { serial, propiedad, material }

    fetch('docs/invre2.csv')
        .then(r => {
            if (!r.ok) throw new Error('No se pudo cargar invre2.csv');
            return r.text();
        })
        .then(texto => {
            const lineas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
            if (!lineas.length) return;

            headersInv = parseCSVLine(lineas[0]);
            filasInv = lineas.slice(1).map(l => parseCSVLine(l));

            const idxEquipo = headersInv.indexOf('EQUIPO / ACTIVO');
            const idxDesc = headersInv.indexOf('DESCRIPCION');

            const vistos = new Set();
            filasInv.forEach(cols => {
                const eq = idxEquipo >= 0 ? (cols[idxEquipo] || '') : '';
                const desc = idxDesc >= 0 ? (cols[idxDesc] || '') : '';
                if (!eq || vistos.has(eq)) return;
                vistos.add(eq);

                const opt = document.createElement('option');
                opt.value = eq;
                opt.label = desc ? `${eq} - ${desc}` : eq;
                datalistEquipos.appendChild(opt);
            });
        })
        .catch(err => console.error(err));

    // Mapa de info (serial, propiedad, material) por EQUIPO desde invre.csv
    fetch('docs/invre.csv')
        .then(r => {
            if (!r.ok) throw new Error('No se pudo cargar invre.csv');
            return r.text();
        })
        .then(texto => {
            const lineas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
            if (!lineas.length) return;

            const headers = parseCSVLine(lineas[0]);
            const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
            const idxSerial = headers.indexOf('SERIAL');
            const idxProp = headers.indexOf('PROPIEDAD');
            const idxAcero = headers.indexOf('ACERO');

            lineas.slice(1).forEach(l => {
                const cols = parseCSVLine(l);
                const eq = idxEquipo >= 0 ? (cols[idxEquipo] || '') : '';
                if (!eq) return;

                if (!infoPorEquipo[eq]) {
                    const sr = idxSerial >= 0 ? (cols[idxSerial] || '') : '';
                    const prop = idxProp >= 0 ? (cols[idxProp] || '') : '';
                    const mat = idxAcero >= 0 ? (cols[idxAcero] || '') : '';
                    infoPorEquipo[eq] = { serial: sr, propiedad: prop, material: mat };
                }
            });
        })
        .catch(err => console.error(err));

    function actualizarAreaSegunEquipoYPrueba() {
        if (!headersInv.length || !filasInv.length) return;

        const equipoSel = inputEquipo.value.trim();
        const selPrueba = document.getElementById('inv-prueba');
        const areaInput = document.getElementById('inv-area');
        const selDetalle = document.getElementById('inv-prueba-detalle');
        if (!equipoSel || !selPrueba || !areaInput) return;

        const idxEquipo = headersInv.indexOf('EQUIPO / ACTIVO');
        const idxPruebaCal = headersInv.indexOf('PRUEBA / CALIBRACION');
        const idxArea = headersInv.indexOf('ÁREA A INSPECIONAR');
        if (idxEquipo < 0 || idxPruebaCal < 0 || idxArea < 0) return;

        const filasCoincidentes = filasInv.filter(cols =>
            cols[idxEquipo] === equipoSel && cols[idxPruebaCal] === selPrueba.value
        );
        if (!filasCoincidentes.length) return;

        let filaArea = filasCoincidentes[0];

        // Si es VT / PT / MT y hay un detalle seleccionado, intentar afinar el área
        if (selPrueba.value === 'VT / PT / MT' && selDetalle && selDetalle.value && filasCoincidentes.length > 1) {
            const detalleUpper = selDetalle.value.toUpperCase();

            if (detalleUpper.includes('ROSCA')) {
                const filaRosca = filasCoincidentes.find(cols =>
                    String(cols[idxArea] || '').toUpperCase().includes('ROSCA')
                );
                if (filaRosca) filaArea = filaRosca;
            } else if (detalleUpper.includes('RETENEDORA')) {
                const filaRet = filasCoincidentes.find(cols => {
                    const areaUpper = String(cols[idxArea] || '').toUpperCase();
                    return areaUpper.includes('RET') || areaUpper.includes('A. RET');
                });
                if (filaRet) filaArea = filaRet;
            }
        }

        areaInput.value = filaArea[idxArea] || '';
    }

    function autocompletarDesdeInventario() {
        const valor = inputEquipo.value.trim();
        if (!valor || !headersInv.length || !filasInv.length) return;

        const idxEquipo = headersInv.indexOf('EQUIPO / ACTIVO');
        const fila = filasInv.find(cols => idxEquipo >= 0 && cols[idxEquipo] === valor);
        if (!fila) return;

        const get = (nombreCol) => {
            const idx = headersInv.indexOf(nombreCol);
            return idx >= 0 && idx < fila.length ? fila[idx] : '';
        };

        const campos = {
            'inv-edo': get('ESTADO'),
            'inv-producto': get('PRODUCTO'),
            'inv-descripcion': get('DESCRIPCION'),
            'inv-tipo-equipo': get('TIPO EQUIPO'),
        };

        Object.entries(campos).forEach(([id, valorCampo]) => {
            const el = document.getElementById(id);
            if (el) el.value = valorCampo || '';
        });

        // Serial, propiedad y material desde inventario general (invre.csv)
        const info = infoPorEquipo[valor] || {};
        const inputSerial = document.getElementById('inv-serial');
        if (inputSerial) {
            inputSerial.value = info.serial || '';
        }
        const inputProp = document.getElementById('inv-propiedad');
        if (inputProp && info.propiedad) {
            inputProp.value = info.propiedad;
        }
        const inputMat = document.getElementById('inv-material');
        if (inputMat && info.material) {
            inputMat.value = info.material;
        }

        const selPrueba = document.getElementById('inv-prueba');
        const prueba = get('PRUEBA / CALIBRACION');
        if (selPrueba) {
            // Asegurar catálogo básico de tipos de prueba
            if (selPrueba.options.length <= 1) {
                ['LT', 'VT / PT / MT', 'UTT'].forEach(val => {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val;
                    selPrueba.appendChild(opt);
                });
            }

            // Si el valor de CSV no está en la lista, agregarlo también
            if (prueba && !Array.from(selPrueba.options).some(o => o.value === prueba)) {
                const opt = document.createElement('option');
                opt.value = prueba;
                opt.textContent = prueba;
                selPrueba.appendChild(opt);
            }
            if (prueba) selPrueba.value = prueba;
        }

        actualizarVisibilidadDetallePrueba();
        actualizarAreaSegunEquipoYPrueba();
    }

    inputEquipo.addEventListener('change', autocompletarDesdeInventario);
    inputEquipo.addEventListener('blur', autocompletarDesdeInventario);

    const selPruebaManual = document.getElementById('inv-prueba');
    if (selPruebaManual) {
        selPruebaManual.addEventListener('change', () => {
            actualizarVisibilidadDetallePrueba();
            actualizarAreaSegunEquipoYPrueba();
        });
    }

    const selDetalleManual = document.getElementById('inv-prueba-detalle');
    if (selDetalleManual) {
        selDetalleManual.addEventListener('change', () => {
            actualizarAreaSegunEquipoYPrueba();
        });
    }

    function actualizarVisibilidadDetallePrueba() {
        const campoDetalle = document.getElementById('campo-prueba-detalle');
        const sel = document.getElementById('inv-prueba');
        if (!campoDetalle || !sel) return;
        if (sel.value) {
            campoDetalle.style.display = 'block';
        } else {
            campoDetalle.style.display = 'none';
            const det = document.getElementById('inv-prueba-detalle');
            if (det) det.value = '';
        }
    }
});

// Registro de actividad en actividad.html
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('actividad-form');
    const inputEquipo = document.getElementById('act-equipo');
    const datalistEquipos = document.getElementById('lista-equipos-actividad');
    if (!form || !inputEquipo || !datalistEquipos) return; // No estamos en actividad.html

    const inputSerialAuto = document.getElementById('act-serial-auto');
    const inputEstadoAuto = document.getElementById('act-estado-auto');
    const inputPropAuto = document.getElementById('act-propiedad-auto');
    const inputNoRepAuto = document.getElementById('act-no-reporte-auto');
    const inputDescAuto = document.getElementById('act-descripcion-auto');
    const contEquiposSel = document.getElementById('act-equipos-seleccionados');

    const btnGuardar = document.getElementById('act-btn-guardar');
    const btnLimpiar = document.getElementById('act-btn-limpiar');

    let headersAct = [];
    let filasAct = [];
    const infoPorEquipoAct = {}; // { serial, estado, propiedad, descripcion }
    let equiposSeleccionados = [];

    // Cargar inventario (invre.csv) para datalist y datos automáticos
    fetch('docs/invre.csv')
        .then(r => {
            if (!r.ok) throw new Error('No se pudo cargar invre.csv');
            return r.text();
        })
        .then(texto => {
            const lineas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
            if (!lineas.length) return;

            headersAct = parseCSVLine(lineas[0]);
            filasAct = lineas.slice(1).map(l => parseCSVLine(l));

            const idxEquipo = headersAct.indexOf('EQUIPO / ACTIVO');
            const idxDesc = headersAct.indexOf('DESCRIPCION');
            const idxSerial = headersAct.indexOf('SERIAL');
            const idxEdo = headersAct.indexOf('EDO');
            const idxProp = headersAct.indexOf('PROPIEDAD');

            const vistos = new Set();
            filasAct.forEach(cols => {
                const eq = idxEquipo >= 0 ? (cols[idxEquipo] || '') : '';
                if (!eq || vistos.has(eq)) return;
                vistos.add(eq);

                const desc = idxDesc >= 0 ? (cols[idxDesc] || '') : '';
                const opt = document.createElement('option');
                opt.value = eq;
                opt.label = desc ? `${eq} - ${desc}` : eq;
                datalistEquipos.appendChild(opt);

                const serial = idxSerial >= 0 ? (cols[idxSerial] || '') : '';
                const edo = idxEdo >= 0 ? (cols[idxEdo] || '') : '';
                const prop = idxProp >= 0 ? (cols[idxProp] || '') : '';
                infoPorEquipoAct[eq] = {
                    serial,
                    estado: edo,
                    propiedad: prop,
                    descripcion: desc
                };
            });
        })
        .catch(err => console.error(err));

    const CLAVE_ACT = 'pct_actividad';
    let listaActividad = [];
    try {
        listaActividad = JSON.parse(localStorage.getItem(CLAVE_ACT) || '[]');
        if (!Array.isArray(listaActividad)) listaActividad = [];
    } catch (e) {
        listaActividad = [];
    }

    function guardarListaActividad() {
        localStorage.setItem(CLAVE_ACT, JSON.stringify(listaActividad));
    }

    function actualizarResumenActividad() {
        const spanClientes = document.getElementById('act-clientes-activos');
        const spanEquipos = document.getElementById('act-equipos-servicio');
        const spanPromDias = document.getElementById('act-promedio-dias');

        if (!spanClientes || !spanEquipos || !spanPromDias) return;

        const clientes = new Set();
        const equipos = new Set();
        let sumaDias = 0;
        let cuentaDias = 0;

        listaActividad.forEach(reg => {
            if (reg.cliente) clientes.add(reg.cliente);

            // contar todos los equipos asociados al registro
            if (Array.isArray(reg.equipos) && reg.equipos.length) {
                reg.equipos.forEach(eq => {
                    if (eq) equipos.add(eq);
                });
            } else if (reg.equipo) {
                equipos.add(reg.equipo);
            }
            const d = Number(reg.diasServicio || 0);
            if (d > 0) {
                sumaDias += d;
                cuentaDias += 1;
            }
        });

        spanClientes.textContent = String(clientes.size || 0);
        spanEquipos.textContent = String(equipos.size || 0);
        spanPromDias.textContent = cuentaDias ? Math.round(sumaDias / cuentaDias) : 0;
    }

    actualizarResumenActividad();

    function renderEquiposSeleccionados() {
        if (!contEquiposSel) return;
        contEquiposSel.innerHTML = '';

        const clienteActual = (document.getElementById('act-cliente') || {}).value || '';

        equiposSeleccionados.forEach(eq => {
            const info = infoPorEquipoAct[eq] || {};

            const row = document.createElement('div');
            row.className = 'actividad-equipos-row';

            const colEquipo = document.createElement('span');
            colEquipo.textContent = eq;

            const colCliente = document.createElement('span');
            colCliente.textContent = clienteActual || '';

            const colDesc = document.createElement('span');
            colDesc.textContent = info.descripcion || '';

            const colAccion = document.createElement('span');
            const btnX = document.createElement('button');
            btnX.type = 'button';
            btnX.className = 'actividad-equipos-row-remove';
            btnX.textContent = 'Quitar';
            btnX.addEventListener('click', () => {
                equiposSeleccionados = equiposSeleccionados.filter(e => e !== eq);
                renderEquiposSeleccionados();
            });
            colAccion.appendChild(btnX);

            row.appendChild(colEquipo);
            row.appendChild(colCliente);
            row.appendChild(colDesc);
            row.appendChild(colAccion);

            contEquiposSel.appendChild(row);
        });
    }

    function agregarEquipoDesdeInput() {
        const valor = inputEquipo.value.trim();
        if (!valor) return;
        if (equiposSeleccionados.includes(valor)) {
            inputEquipo.value = '';
            return;
        }
        equiposSeleccionados.push(valor);
        renderEquiposSeleccionados();
        inputEquipo.value = '';
    }

    function autocompletarDatosAutoActividad() {
        const valor = inputEquipo.value.trim();
        if (!valor) {
            if (inputSerialAuto) inputSerialAuto.value = '';
            if (inputEstadoAuto) inputEstadoAuto.value = '';
            if (inputPropAuto) inputPropAuto.value = '';
            if (inputDescAuto) inputDescAuto.value = '';
            return;
        }

        const info = infoPorEquipoAct[valor] || {};
        if (inputSerialAuto) inputSerialAuto.value = info.serial || '';
        if (inputEstadoAuto) inputEstadoAuto.value = info.estado || '';
        if (inputPropAuto) inputPropAuto.value = info.propiedad || '';
        if (inputDescAuto) inputDescAuto.value = info.descripcion || '';

        // Último número de reporte usado en pruebas para este equipo (si existe)
        try {
            const listaPruebas = JSON.parse(localStorage.getItem('pct_pruebas') || '[]');
            if (Array.isArray(listaPruebas)) {
                const filtradas = listaPruebas.filter(r => r.equipo === valor && r.noReporte);
                if (filtradas.length && inputNoRepAuto) {
                    const ultima = filtradas[filtradas.length - 1];
                    inputNoRepAuto.value = ultima.noReporte || '';
                }
            }
        } catch (e) {
            // ignorar errores de parseo
        }
    }

    inputEquipo.addEventListener('change', autocompletarDatosAutoActividad);
    inputEquipo.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            autocompletarDatosAutoActividad();
            agregarEquipoDesdeInput();
        }
    });

    inputEquipo.addEventListener('blur', () => {
        // Al salir con Tab/Click: autocompletar y agregar si hay valor
        autocompletarDatosAutoActividad();
        agregarEquipoDesdeInput();
    });

    function limpiarFormularioActividad() {
        const idsTexto = [
            'act-cliente',
            'act-area-cliente',
            'act-ubicacion',
            'act-equipo',
            'act-os',
            'act-orden-suministro',
            'act-factura',
            'act-est-cot',
            'act-precio'
        ];

        idsTexto.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        const inputFechaEmb = document.getElementById('act-fecha-embarque');
        const inputInicio = document.getElementById('act-inicio-servicio');
        const inputDias = document.getElementById('act-dias-servicio');
        if (inputFechaEmb) inputFechaEmb.value = '';
        if (inputInicio) inputInicio.value = '';
        if (inputDias) inputDias.value = '';

        const selTipo = document.getElementById('act-tipo');
        if (selTipo) selTipo.value = 'PROPIO';

        if (inputSerialAuto) inputSerialAuto.value = '';
        if (inputEstadoAuto) inputEstadoAuto.value = '';
        if (inputPropAuto) inputPropAuto.value = '';
        if (inputNoRepAuto) inputNoRepAuto.value = '';
        if (inputDescAuto) inputDescAuto.value = '';

        equiposSeleccionados = [];
        renderEquiposSeleccionados();
    }

    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', (e) => {
            e.preventDefault();
            limpiarFormularioActividad();
        });
    }

    async function guardarActividadEnFirestore(registro) {
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

            await addDoc(collection(window.db, 'actividad'), datos);
            console.log('Actividad guardada en Firestore');
        } catch (e) {
            console.error('Error al guardar actividad en Firestore', e);
        }
    }

    if (btnGuardar) {
        btnGuardar.addEventListener('click', async (e) => {
            e.preventDefault();

            const tipo = (document.getElementById('act-tipo') || {}).value || '';
            const cliente = (document.getElementById('act-cliente') || {}).value || '';
            const areaCliente = (document.getElementById('act-area-cliente') || {}).value || '';
            const ubicacion = (document.getElementById('act-ubicacion') || {}).value || '';
            const equiposRaw = (document.getElementById('act-equipo') || {}).value || '';
            const os = (document.getElementById('act-os') || {}).value || '';
            const ordenSuministro = (document.getElementById('act-orden-suministro') || {}).value || '';
            const factura = (document.getElementById('act-factura') || {}).value || '';
            const estCot = (document.getElementById('act-est-cot') || {}).value || '';
            const fechaEmbarque = (document.getElementById('act-fecha-embarque') || {}).value || '';
            const inicioServicio = (document.getElementById('act-inicio-servicio') || {}).value || '';
            const diasServicioStr = (document.getElementById('act-dias-servicio') || {}).value || '';
            const precio = (document.getElementById('act-precio') || {}).value || '';

            if (!cliente) {
                alert('Captura al menos Cliente');
                return;
            }

            // Si el usuario escribió un equipo pero no lo ha agregado aún, agrégalo
            if (equiposRaw && !equiposSeleccionados.length) {
                autocompletarDatosAutoActividad();
                agregarEquipoDesdeInput();
            }

            if (!equiposSeleccionados.length) {
                alert('Agrega al menos un Equipo / Activo al registro');
                return;
            }

            const diasServicio = diasServicioStr ? Number(diasServicioStr) : 0;

            const equipos = [...equiposSeleccionados];
            const equipoPrincipal = equipos[0] || '';
            const infoPrincipal = equipoPrincipal ? (infoPorEquipoAct[equipoPrincipal] || {}) : {};

            const registro = {
                fechaRegistro: new Date().toISOString(),
                tipo,
                cliente,
                areaCliente,
                ubicacion,
                equipo: equipoPrincipal,
                equipos,
                os,
                ordenSuministro,
                factura,
                estCot,
                fechaEmbarque,
                inicioServicio,
                diasServicio,
                precio,
                serial: inputSerialAuto ? inputSerialAuto.value || infoPrincipal.serial || '' : infoPrincipal.serial || '',
                estado: inputEstadoAuto ? inputEstadoAuto.value || infoPrincipal.estado || '' : infoPrincipal.estado || '',
                propiedad: inputPropAuto ? inputPropAuto.value || infoPrincipal.propiedad || '' : infoPrincipal.propiedad || '',
                noReporte: inputNoRepAuto ? inputNoRepAuto.value || '' : '',
                descripcion: inputDescAuto ? inputDescAuto.value || infoPrincipal.descripcion || '' : infoPrincipal.descripcion || '',
            };

            listaActividad.push(registro);
            guardarActividadEnFirestore(registro);

            guardarListaActividad();
            actualizarResumenActividad();
            alert('Actividad guardada');
            limpiarFormularioActividad();
        });
    }
});

// Guardado de pruebas en pruebas.html
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-guardar-prueba');
    if (!btn) return; // No estamos en pruebas.html

    // Fecha de prueba = siempre fecha actual (timestamp humano)
    const inputFechaPrueba = document.getElementById('prueba-fecha');
    if (inputFechaPrueba && !inputFechaPrueba.value) {
        const hoy = new Date();
        const yyyy = hoy.getFullYear();
        const mm = String(hoy.getMonth() + 1).padStart(2, '0');
        const dd = String(hoy.getDate()).padStart(2, '0');
        inputFechaPrueba.value = `${yyyy}-${mm}-${dd}`;
    }

    const inputFechaReal = document.getElementById('inv-fecha-realizacion');
    const inputProxima = document.getElementById('inv-proxima');

    function formatearFechaRealizacion(valor) {
        const soloDigitos = valor.replace(/\D/g, '').slice(0, 6);
        let res = soloDigitos;
        if (soloDigitos.length >= 3 && soloDigitos.length <= 4) {
            res = soloDigitos.slice(0, 2) + '/' + soloDigitos.slice(2);
        } else if (soloDigitos.length >= 5) {
            res =
                soloDigitos.slice(0, 2) +
                '/' +
                soloDigitos.slice(2, 4) +
                '/' +
                soloDigitos.slice(4);
        }
        return res;
    }

    function actualizarProximaDesdeFechaRealizacion() {
        if (!inputFechaReal || !inputProxima) return;
        const valor = inputFechaReal.value.trim();
        if (valor.length !== 8) return; // dd/mm/aa

        const partes = valor.split('/');
        if (partes.length !== 3) return;
        const [ddStr, mmStr, aaStr] = partes;
        const dd = parseInt(ddStr, 10);
        const mm = parseInt(mmStr, 10);
        const aa = parseInt(aaStr, 10);
        if (!dd || !mm || isNaN(aa)) return;

        const baseYear = 2000 + aa; // 2 dígitos de año
        const fecha = new Date(baseYear, mm - 1, dd);
        if (isNaN(fecha.getTime())) return;

        fecha.setFullYear(fecha.getFullYear() + 1);
        const yyyyNext = fecha.getFullYear();
        const mmNext = String(fecha.getMonth() + 1).padStart(2, '0');
        const ddNext = String(fecha.getDate()).padStart(2, '0');
        inputProxima.value = `${yyyyNext}-${mmNext}-${ddNext}`;
    }

    if (inputFechaReal) {
        inputFechaReal.addEventListener('input', () => {
            const cursorPos = inputFechaReal.selectionStart;
            const antes = inputFechaReal.value;
            const formateado = formatearFechaRealizacion(antes);
            inputFechaReal.value = formateado;
            // Mejor no forzar la posición de cursor para evitar comportamientos raros
        });

        inputFechaReal.addEventListener('blur', () => {
            // Asegurar formato final y actualizar próxima prueba
            inputFechaReal.value = formatearFechaRealizacion(inputFechaReal.value);
            actualizarProximaDesdeFechaRealizacion();
        });
    }

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

    function limpiarFormularioPruebas() {
        const camposTexto = [
            'inv-equipo',
            'inv-serial',
            'inv-edo',
            'inv-propiedad',
            'inv-producto',
            'inv-descripcion',
            'inv-tipo-equipo',
            'inv-material',
            'inv-area',
            'inv-fecha-realizacion',
            'inv-no-reporte',
            'inv-emisor',
            'inv-tecnico',
            'inv-contador',
            'prueba-observaciones'
        ];

        camposTexto.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        const selResultado = document.getElementById('prueba-resultado');
        if (selResultado) selResultado.value = '';

        const selPrueba = document.getElementById('inv-prueba');
        if (selPrueba) selPrueba.value = '';

        const selDetalle = document.getElementById('inv-prueba-detalle');
        if (selDetalle) selDetalle.value = '';

        const selEjecucion = document.getElementById('inv-ejecucion');
        if (selEjecucion) selEjecucion.value = 'INTERNO';

        const inputProx = document.getElementById('inv-proxima');
        if (inputProx) inputProx.value = '';

        const inputFecha = document.getElementById('prueba-fecha');
        if (inputFecha) {
            const hoy = new Date();
            const yyyy = hoy.getFullYear();
            const mm = String(hoy.getMonth() + 1).padStart(2, '0');
            const dd = String(hoy.getDate()).padStart(2, '0');
            inputFecha.value = `${yyyy}-${mm}-${dd}`;
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
        const pruebaDetalle = (document.getElementById('inv-prueba-detalle') || {}).value || '';
        const tipoEquipo = (document.getElementById('inv-tipo-equipo') || {}).value || '';
        const material = (document.getElementById('inv-material') || {}).value || '';
        const area = (document.getElementById('inv-area') || {}).value || '';
        const fechaReal = (document.getElementById('inv-fecha-realizacion') || {}).value || '';
        let noReporte = (document.getElementById('inv-no-reporte') || {}).value || '';
        const ejecucion = (document.getElementById('inv-ejecucion') || {}).value || '';
        const emisor = (document.getElementById('inv-emisor') || {}).value || '';
        const tecnico = (document.getElementById('inv-tecnico') || {}).value || '';
        const proxPrueba = (document.getElementById('inv-proxima') || {}).value || '';
        const contador = (document.getElementById('inv-contador') || {}).value || '';
        const observaciones = (document.getElementById('prueba-observaciones') || {}).value || '';

        const clave = 'pct_pruebas';
        let lista = [];
        try {
            lista = JSON.parse(localStorage.getItem(clave) || '[]');
            if (!Array.isArray(lista)) lista = [];
        } catch (e) {
            lista = [];
        }

        // Generar número de reporte/certificado automático por equipo si está vacío
        if (!noReporte) {
            const baseEquipo = (equipo || 'REP').replace(/\s+/g, '-');
            const existentes = lista.filter(reg => reg.equipo === equipo);
            const siguiente = existentes.length + 1;
            const consecutivo = String(siguiente).padStart(3, '0');
            noReporte = `${baseEquipo}-${consecutivo}`;
        }

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
            pruebaDetalle,
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

        lista.push(registro);
        localStorage.setItem(clave, JSON.stringify(lista));

        // Intentar guardar también en Firestore (si está disponible)
        guardarPruebaEnFirestore(registro);

        // Notificación y limpieza de formulario
        alert('Prueba guardada correctamente');
        limpiarFormularioPruebas();

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

