// Lógica específica para pruebas.html (autocompletado desde inventario y guardado en Firestore)

// Autocompletar información de inventario en pruebas.html desde invre2.csv
document.addEventListener('DOMContentLoaded', () => {
    const inputEquipo = document.getElementById('inv-equipo');
    const datalistEquipos = document.getElementById('lista-equipos-pruebas');
    const inputSerial = document.getElementById('inv-serial');
    const datalistSeriales = document.getElementById('lista-seriales-pruebas');
    if (!inputEquipo || !datalistEquipos) return; // No estamos en pruebas.html

    let filasInv = [];
    let headersInv = [];
    let idxInvEquipo = -1;
    let idxInvDesc = -1;
    let idxInvEstado = -1;
    let idxInvPrueba = -1;
    let idxInvArea = -1;
    const infoPorEquipo = {}; // { serial, propiedad, material }
    const infoPorSerial = {};

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

            // Mapear columnas de forma flexible según la cabecera actual de invre2.csv
            // Esperado por el cliente: #, EDO, PRODUCTO, SERIAL, EQUIPO / ACTIVO, DESCRIPCION, REPORTE P/P,
            // TIPO EQUIPO, ACERO y luego columnas de PRUEBA / CALIBRACION, TIPO_INSPECCION, AREA
            idxInvEquipo = headersInv.indexOf('EQUIPO / ACTIVO');
            idxInvDesc = headersInv.indexOf('DESCRIPCION');
            // Estado puede venir como ESTADO (versión anterior) o EDO (versión actual)
            idxInvEstado = headersInv.indexOf('ESTADO');
            if (idxInvEstado < 0) idxInvEstado = headersInv.indexOf('EDO');

            // Intentar primero por nombre de cabecera
            idxInvPrueba = headersInv.indexOf('PRUEBA / CALIBRACION');
            idxInvArea = headersInv.indexOf('ÁREA A INSPECIONAR');

            // Si no hay cabeceras claras (caso actual: columnas finales sin nombre),
            // detectar posiciones de forma robusta explorando los valores.
            if (idxInvPrueba < 0 || idxInvArea < 0) {
                const tiposValidos = ['LT', 'VT / PT / MT', 'UTT'];
                let idxPruebaDetectado = -1;
                let idxAreaDetectado = -1;

                filasInv.forEach(cols => {
                    // Buscar la columna donde aparece alguno de los tipos válidos
                    for (let j = 0; j < cols.length; j++) {
                        const val = (cols[j] || '').toString().trim().toUpperCase();
                        if (tiposValidos.includes(val)) {
                            if (idxPruebaDetectado === -1) {
                                idxPruebaDetectado = j;
                            }
                            // Tomar como área la última columna no vacía de esa fila
                            for (let k = cols.length - 1; k >= 0; k--) {
                                const areaVal = (cols[k] || '').toString().trim();
                                if (areaVal) {
                                    idxAreaDetectado = k;
                                    break;
                                }
                            }
                            break;
                        }
                    }
                });

                if (idxInvPrueba < 0 && idxPruebaDetectado >= 0) {
                    idxInvPrueba = idxPruebaDetectado;
                }
                if (idxInvArea < 0 && idxAreaDetectado >= 0) {
                    idxInvArea = idxAreaDetectado;
                }
            }

            // Leer overrides de estado desde localStorage (los mismos que en invre.html e inspeccion.html).
            // Se asume que ya fueron sincronizados desde Firestore en alguna vista de inventario/actividad.
            const claveEstadoOverride = 'pct_invre_estado_override';
            let mapaEstadoOverride = {};
            try {
                const crudo = localStorage.getItem(claveEstadoOverride) || '{}';
                const parsed = JSON.parse(crudo);
                if (parsed && typeof parsed === 'object') mapaEstadoOverride = parsed;
            } catch {
                mapaEstadoOverride = {};
            }

            function poblarDatalistEquipos() {
                if (!datalistEquipos) return;
                // Refrescar overrides cada vez para reflejar cambios recientes
                let overrides = {};
                try {
                    const crudo = localStorage.getItem(claveEstadoOverride) || '{}';
                    const parsed = JSON.parse(crudo);
                    if (parsed && typeof parsed === 'object') overrides = parsed;
                } catch {}

                datalistEquipos.innerHTML = '';
                const vistos = new Set();
                filasInv.forEach(cols => {
                    const eq = idxInvEquipo >= 0 ? (cols[idxInvEquipo] || '') : '';
                    const desc = idxInvDesc >= 0 ? (cols[idxInvDesc] || '') : '';
                    const edo = idxInvEstado >= 0 ? (cols[idxInvEstado] || '') : '';
                    if (!eq || vistos.has(eq)) return;
                    let edoEfectivo = (edo || '').toString().trim().toUpperCase();
                    const override = overrides[eq];
                    if (override) edoEfectivo = String(override).trim().toUpperCase();
                    // Solo mostrar ON/ACTIVO en pruebas.html
                    if (edoEfectivo !== 'ON' && edoEfectivo !== 'ACTIVO') return;
                    vistos.add(eq);

                    const opt = document.createElement('option');
                    opt.value = eq;
                    opt.label = desc ? `${eq} - ${desc}` : eq;
                    datalistEquipos.appendChild(opt);
                });
            }

            // Poblar inicialmente
            poblarDatalistEquipos();
            // Refrescar al enfocar el campo (por si hubo cambios de estado en otra pestaña/vista)
            if (inputEquipo) {
                inputEquipo.addEventListener('focus', poblarDatalistEquipos);
            }
            // Escuchar cambios en localStorage (overrides) para refrescar en vivo
            window.addEventListener('storage', (e) => {
                if ((e?.key || '') === claveEstadoOverride) {
                    poblarDatalistEquipos();
                }
            });
        })
        .catch(err => console.error(err));

    // Mapa de info (serial, propiedad, material) por EQUIPO desde invre.csv
    const certPorSerial = {};
    const certPorEquipo = {};

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
                let eq = idxEquipo >= 0 ? (cols[idxEquipo] || '') : '';
                let sr = idxSerial >= 0 ? (cols[idxSerial] || '') : '';
                let prop = idxProp >= 0 ? (cols[idxProp] || '') : '';
                let mat = idxAcero >= 0 ? (cols[idxAcero] || '') : '';

                eq = eq.trim();
                sr = sr.trim();
                prop = prop.trim();
                mat = mat.trim();

                if (!eq) return;

                if (!infoPorEquipo[eq]) {
                    infoPorEquipo[eq] = { serial: sr, propiedad: prop, material: mat };
                }

                if (sr && !infoPorSerial[sr]) {
                    infoPorSerial[sr] = { equipo: eq, propiedad: prop, material: mat };
                }
            });

            if (datalistSeriales) {
                Object.entries(infoPorSerial).forEach(([sr, datos]) => {
                    const opt = document.createElement('option');
                    opt.value = sr;
                    opt.label = datos.equipo ? `${sr} - ${datos.equipo}` : sr;
                    datalistSeriales.appendChild(opt);
                });
            }

            // Si el usuario ya escribió un serial antes de que cargara el CSV,
            // intentar autocompletar ahora que infoPorSerial está listo.
            if (inputSerial && inputSerial.value.trim()) {
                autocompletarDesdeSerial();
            }
        })
        .catch(err => console.error(err));

    // Cargar certificados existentes desde certif.csv (no genera nuevos).
    // Estos datos se usarán para consultas/listados históricos, no para autocompletar el campo de reporte nuevo.
    fetch('docs/certif.csv')
        .then(r => {
            if (!r.ok) throw new Error('No se pudo cargar certif.csv');
            return r.text();
        })
        .then(texto => {
            const lineas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
            if (!lineas.length) return;

            // Buscar la primera línea que tenga al menos una columna no vacía como cabecera real
            let idxLineaHeader = 0;
            while (idxLineaHeader < lineas.length) {
                const colsTest = parseCSVLine(lineas[idxLineaHeader]);
                const tieneContenido = colsTest.some(c => (c || '').toString().trim() !== '');
                if (tieneContenido) break;
                idxLineaHeader++;
            }
            if (idxLineaHeader >= lineas.length) return;

            const headersCert = parseCSVLine(lineas[idxLineaHeader]);
            const idxSerie = headersCert.indexOf('SERIE');
            const idxSerieDash = headersCert.indexOf('SERIE-');
            const idxRep2 = headersCert.indexOf('N° DE REPORTE2');
            const idxRep1 = headersCert.indexOf('N° DE REPORTE');
            const idxRepAlt = headersCert.indexOf('REPORTES');

            const filasCert = lineas.slice(idxLineaHeader + 1).map(l => parseCSVLine(l));

            filasCert.forEach(cols => {
                const serie = idxSerie >= 0 ? (cols[idxSerie] || '') : '';
                const serieDash = idxSerieDash >= 0 ? (cols[idxSerieDash] || '') : '';
                const rep2 = idxRep2 >= 0 ? (cols[idxRep2] || '') : '';
                const rep1 = idxRep1 >= 0 ? (cols[idxRep1] || '') : '';
                const repAlt = idxRepAlt >= 0 ? (cols[idxRepAlt] || '') : '';

                const reporte = (rep2 || rep1 || repAlt || '').toString().trim();
                if (!reporte) return; // sin reporte, nada que autocompletar

                const baseSerie = serie.toString().trim().toUpperCase();
                const baseSerieDash = serieDash.toString().trim().toUpperCase();

                // Clave principal: SERIAL completo como en invre.csv (ej. PCT-24-21502-3-010)
                if (baseSerie && baseSerieDash) {
                    const serialFull = `${baseSerie}-${baseSerieDash}`;
                    const keySerial = serialFull.toUpperCase();
                    if (!certPorSerial[keySerial]) {
                        certPorSerial[keySerial] = { reporte };
                    }
                }

                // Clave alternativa: si SERIE- ya es un código de equipo, guardarlo también
                if (baseSerieDash) {
                    const keyEq = baseSerieDash.toUpperCase();
                    if (!certPorEquipo[keyEq]) {
                        certPorEquipo[keyEq] = { reporte };
                    }
                }
            });
        })
        .catch(err => console.error(err));

    function autocompletarDesdeSerial() {
        if (!inputSerial) return;
        const valor = inputSerial.value.trim();
        if (!valor) return;

        const buscado = valor.toUpperCase();

        // 1) Intentar coincidencia exacta
        let srEncontrado = null;
        let info = infoPorSerial[valor] || null;

        // 2) Si no hay coincidencia directa en el mapa, buscar de forma flexible
        if (!info) {
            const entrada = Object.entries(infoPorSerial).find(([sr, datos]) => {
                const s = sr.trim().toUpperCase();
                // Coincidencia exacta o por sufijo (por ejemplo, sin prefijo PCT-)
                return s === buscado || s.replace(/^PCT-/, '') === buscado;
            });

            if (entrada) {
                srEncontrado = entrada[0];
                info = entrada[1];
            }
        } else {
            srEncontrado = valor;
        }

        if (!info) return;

        // Normalizar el valor mostrado en el input al serial completo encontrado
        if (srEncontrado && inputSerial.value !== srEncontrado) {
            inputSerial.value = srEncontrado;
        }

        if (inputEquipo && info.equipo) {
            inputEquipo.value = info.equipo;
        }

        autocompletarDesdeInventario();
    }

    // Ya no autocompletamos ningún campo de reporte en el formulario de pruebas.
    // Los certificados de certif.csv se usarán solo para listados/históricos.

    function actualizarAreaSegunEquipoYPrueba() {
        if (!headersInv.length || !filasInv.length) return;

        const equipoSel = inputEquipo.value.trim();
        const selPrueba = document.getElementById('inv-prueba');
        const areaInput = document.getElementById('inv-area');
        const selDetalle = document.getElementById('inv-prueba-detalle');
        if (!equipoSel || !selPrueba || !areaInput) return;
        if (idxInvEquipo < 0 || idxInvPrueba < 0 || idxInvArea < 0) return;

        const filasCoincidentes = filasInv.filter(cols =>
            cols[idxInvEquipo] === equipoSel && cols[idxInvPrueba] === selPrueba.value
        );
        if (!filasCoincidentes.length) return;

        let filaArea = filasCoincidentes[0];

        // Si es VT / PT / MT y hay un detalle seleccionado, intentar afinar el área
        if (selPrueba.value === 'VT / PT / MT' && selDetalle && selDetalle.value && filasCoincidentes.length > 1) {
            const detalleUpper = selDetalle.value.toUpperCase();

            // Ahora el valor del detalle ES el texto de área. Buscar la fila cuya área coincida.
            const filaDet = filasCoincidentes.find(cols =>
                String(cols[idxInvArea] || '').toUpperCase() === detalleUpper
            );
            if (filaDet) filaArea = filaDet;
        }

        areaInput.value = filaArea[idxInvArea] || '';
    }

    function autocompletarDesdeInventario() {
        const valor = inputEquipo.value.trim();
        if (!valor || !headersInv.length || !filasInv.length) return;
        const fila = filasInv.find(cols => idxInvEquipo >= 0 && cols[idxInvEquipo] === valor);
        if (!fila) return;

        const get = (nombreCol) => {
            let idx = headersInv.indexOf(nombreCol);
            if (idx < 0 && nombreCol === 'ESTADO') {
                idx = headersInv.indexOf('EDO');
            }
            if (idx < 0 && nombreCol === 'PRUEBA / CALIBRACION') {
                idx = idxInvPrueba;
            }
            return idx >= 0 && idx < fila.length ? fila[idx] : '';
        };

        const campos = {
            'inv-edo': get('ESTADO'),
            'inv-producto': get('PRODUCTO'),
            'inv-descripcion': get('DESCRIPCION'),
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
        const pruebaRaw = get('PRUEBA / CALIBRACION');
        const tiposValidos = ['LT', 'VT / PT / MT', 'UTT'];
        const prueba = (pruebaRaw || '').toString().trim().toUpperCase();

        if (selPrueba) {
            // Reconstruir las opciones de tipo de prueba en función de lo que realmente
            // existe en invre2.csv para este equipo.
            selPrueba.innerHTML = '';

            const optVacio = document.createElement('option');
            optVacio.value = '';
            optVacio.textContent = 'Selecciona...';
            selPrueba.appendChild(optVacio);

            const pruebasDisponibles = new Set();
            filasInv.forEach(cols => {
                if (idxInvEquipo >= 0 && cols[idxInvEquipo] === valor && idxInvPrueba >= 0) {
                    const p = (cols[idxInvPrueba] || '').toString().trim().toUpperCase();
                    if (tiposValidos.includes(p)) pruebasDisponibles.add(p);
                }
            });

            pruebasDisponibles.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                selPrueba.appendChild(opt);
            });

            if (pruebasDisponibles.has(prueba)) {
                selPrueba.value = prueba;
            }
        }

        // Ajustar opciones de detalle (inv-prueba-detalle) según áreas definidas
        // para VT / PT / MT en este equipo.
        const selDetalle = document.getElementById('inv-prueba-detalle');
        const campoDetalle = document.getElementById('campo-prueba-detalle');
        if (selDetalle) {
            selDetalle.innerHTML = '';
            const optDetVacio = document.createElement('option');
            optDetVacio.value = '';
            optDetVacio.textContent = 'Selecciona...';
            selDetalle.appendChild(optDetVacio);

            let hayDetalle = false;

            // Filas VT / PT / MT del equipo
            const filasVT = filasInv.filter(cols =>
                idxInvEquipo >= 0 && cols[idxInvEquipo] === valor &&
                idxInvPrueba >= 0 && (cols[idxInvPrueba] || '').toString().trim().toUpperCase() === 'VT / PT / MT'
            );

            // Conjunto de áreas únicas para VT / PT / MT (por ejemplo: CAVIDAD, CARA / P. MOJ, SOLDADURA)
            const areasUnicas = new Set();
            filasVT.forEach(cols => {
                const a = (cols[idxInvArea] || '').toString().trim();
                if (a) areasUnicas.add(a);
            });

            areasUnicas.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a;
                opt.textContent = a;
                selDetalle.appendChild(opt);
                hayDetalle = true;
            });

            if (campoDetalle) {
                // Solo mostrar el campo de detalle cuando haya opciones válidas
                campoDetalle.style.display = hayDetalle ? 'block' : 'none';
                if (!hayDetalle) selDetalle.value = '';
            }
        }

        actualizarVisibilidadDetallePrueba();
        actualizarAreaSegunEquipoYPrueba();
    }

    inputEquipo.addEventListener('change', autocompletarDesdeInventario);
    inputEquipo.addEventListener('blur', autocompletarDesdeInventario);

    if (inputSerial) {
        inputSerial.addEventListener('change', autocompletarDesdeSerial);
        inputSerial.addEventListener('blur', autocompletarDesdeSerial);
    }

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
        const selDetalle = document.getElementById('inv-prueba-detalle');
        if (!campoDetalle || !sel) return;

        const val = (sel.value || '').toUpperCase();
        // Mostrar detalle solo para VT / PT / MT y si realmente hay opciones de detalle
        const tieneOpcionesDetalle =
            selDetalle && Array.from(selDetalle.options || []).some(o => o.value && o.value !== '');

        if (val === 'VT / PT / MT' && tieneOpcionesDetalle) {
            campoDetalle.style.display = 'block';
            if (selDetalle) selDetalle.required = true;
        } else {
            campoDetalle.style.display = 'none';
            const det = document.getElementById('inv-prueba-detalle');
            if (det) det.value = '';
            if (selDetalle) selDetalle.required = false;
        }
    }

    // Sincronizar Emisor según Ejecución (INTERNO => PCT bloqueado, EXTERNO => editable)
    (function configurarEjecucionYEmisor() {
        const selEjec = document.getElementById('inv-ejecucion');
        const emisorEl = document.getElementById('inv-emisor');
        if (!selEjec || !emisorEl) return;
        const sync = () => {
            const val = (selEjec.value || '').toUpperCase();
            if (val === 'INTERNO') {
                emisorEl.value = 'PCT';
                emisorEl.readOnly = true;
            } else {
                emisorEl.readOnly = false;
                if (emisorEl.value === 'PCT') emisorEl.value = '';
            }
        };
        selEjec.addEventListener('change', sync);
        sync();
    })();
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
    const inputContador = document.getElementById('inv-contador');
    const selPeriodo = document.getElementById('inv-periodo');

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
        // Solo ANUAL define próxima prueba
        const periodoActual = (selPeriodo?.value || '').toUpperCase();
        if (periodoActual !== 'ANUAL') {
            inputProxima.value = '';
            actualizarContadorProxima();
            return;
        }
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

        // La lógica actual suma 1 año para obtener la fecha de vencimiento.
        // Se mantiene igual para todos los periodos (anual, post-trabajo, reparación).
        fecha.setFullYear(fecha.getFullYear() + 1);
        const yyyyNext = fecha.getFullYear();
        const mmNext = String(fecha.getMonth() + 1).padStart(2, '0');
        const ddNext = String(fecha.getDate()).padStart(2, '0');
        // Mostrar próxima prueba en formato dd/mm/aa (2 dígitos de año)
        const aaNext = String(yyyyNext).slice(-2);
        inputProxima.value = `${ddNext}/${mmNext}/${aaNext}`;
        actualizarContadorProxima();
    }

    function actualizarContadorProxima() {
        if (!inputProxima || !inputContador) return;
        // Solo ANUAL muestra contador
        const periodoActual = (selPeriodo?.value || '').toUpperCase();
        if (periodoActual !== 'ANUAL') {
            inputContador.value = '';
            return;
        }
        const valor = (inputProxima.value || '').trim();
        if (!valor || valor.length !== 8) {
            inputContador.value = '';
            return;
        }

        const partes = valor.split('/');
        if (partes.length !== 3) {
            inputContador.value = '';
            return;
        }

        const [ddStr, mmStr, aaStr] = partes;
        const dd = parseInt(ddStr, 10);
        const mm = parseInt(mmStr, 10);
        const aa = parseInt(aaStr, 10);
        if (!dd || !mm || isNaN(aa)) {
            inputContador.value = '';
            return;
        }

        const year = 2000 + aa; // 2 dígitos de año
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const fechaProx = new Date(year, mm - 1, dd);
        if (isNaN(fechaProx.getTime())) {
            inputContador.value = '';
            return;
        }

        const diffMs = fechaProx.getTime() - hoy.getTime();
        let dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (dias < 0) dias = 0;

        const sufijo = dias === 1 ? 'día' : 'días';
        inputContador.value = `${dias} ${sufijo}`;
    }

    if (inputFechaReal) {
        inputFechaReal.addEventListener('input', () => {
            const formateado = formatearFechaRealizacion(inputFechaReal.value);
            inputFechaReal.value = formateado;
        });

        inputFechaReal.addEventListener('blur', () => {
            inputFechaReal.value = formatearFechaRealizacion(inputFechaReal.value);
            actualizarProximaDesdeFechaRealizacion();
        });
    }

    // Si ya hay una próxima prueba capturada (por ejemplo al editar un registro), inicializar contador
    if (inputProxima && inputProxima.value) {
        actualizarContadorProxima();
    }

    // Refrescar el contador una vez por hora mientras la página esté abierta
    if (inputProxima && inputContador) {
        setInterval(actualizarContadorProxima, 60 * 60 * 1000);
    }

    // Cambios de periodo: checkpoints no afectan próxima/contador
    if (selPeriodo) {
        selPeriodo.addEventListener('change', () => {
            const val = (selPeriodo.value || '').toUpperCase();
            const esAnual = val === 'ANUAL';
            if (!esAnual) {
                // Limpiar y deshabilitar visualmente próxima/contador
                if (inputProxima) {
                    inputProxima.value = '';
                }
                if (inputContador) {
                    inputContador.value = '';
                }
            } else {
                // Recalcular próxima/contador si hay fecha realización
                actualizarProximaDesdeFechaRealizacion();
            }
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

        const emisorEl = document.getElementById('inv-emisor');
        if (emisorEl) {
            emisorEl.value = 'PCT';
            emisorEl.readOnly = true;
        }

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

    btn.addEventListener('click', async () => {
        const equipo = (document.getElementById('inv-equipo')?.value || '').trim();
        if (!equipo) {
            alert('Indica el equipo / activo.');
            return;
        }

        // Validar estado del equipo: no permitir guardar si no está ON/ACTIVO
        (function validarEstadoEquipo() {
            const edoInput = (document.getElementById('inv-edo')?.value || '').trim().toUpperCase();
            let edoEfectivo = edoInput;
            try {
                const crudo = localStorage.getItem('pct_invre_estado_override') || '{}';
                const overrides = JSON.parse(crudo);
                const ov = overrides?.[equipo];
                if (ov) edoEfectivo = String(ov).trim().toUpperCase();
            } catch {}

            // Si conocemos el estado y no es ON/ACTIVO, bloquear guardado
            if (edoEfectivo && edoEfectivo !== 'ON' && edoEfectivo !== 'ACTIVO') {
                alert(`No se puede guardar una prueba para el equipo "${equipo}" porque su estado es "${edoEfectivo}".`);
                throw new Error('Estado de equipo no permitido para pruebas');
            }
        })();

        const selPruebaEl = document.getElementById('inv-prueba');
        const selDetalleEl = document.getElementById('inv-prueba-detalle');
        const emisorEl = document.getElementById('inv-emisor');
        const tecnicoEl = document.getElementById('inv-tecnico');
        const selResultadoEl = document.getElementById('prueba-resultado');
        const selPeriodoEl = document.getElementById('inv-periodo');

        const pruebaTipo = (selPruebaEl?.value || '').trim();
        const pruebaDetalle = (selDetalleEl?.value || '').trim();
        const emisor = (emisorEl?.value || '').trim();
        let tecnico = (tecnicoEl?.value || '').trim();
        const resultado = (selResultadoEl?.value || '').trim();
        const periodo = (selPeriodoEl?.value || 'ANUAL').trim();

        if (!pruebaTipo) {
            alert('Selecciona la prueba / calibración.');
            if (selPruebaEl) selPruebaEl.focus();
            return;
        }
        if (!emisor) {
            alert('Indica el emisor.');
            if (emisorEl) emisorEl.focus();
            return;
        }
        // El campo Técnico queda libre: no forzamos el valor por rol

        if (!tecnico) {
            alert('Indica el técnico.');
            if (tecnicoEl) tecnicoEl.focus();
            return;
        }

        const fechaRealizacion = document.getElementById('inv-fecha-realizacion')?.value || '';
        const noReporteVal = (document.getElementById('inv-no-reporte')?.value || '').trim();

        // REGLA GLOBAL: Fecha de realización y No. de reporte/certificado son obligatorios para todos los roles y periodos
        if (!fechaRealizacion.trim()) {
            alert('Indica la fecha de realización (dd/mm/aa).');
            if (inputFechaReal) inputFechaReal.focus();
            return;
        }
        // Validación de formato dd/mm/aa y fecha válida
        (function validarFechaDDMMAA() {
            const val = fechaRealizacion.trim();
            if (val.length !== 8 || val.indexOf('/') !== 2 || val.lastIndexOf('/') !== 5) {
                alert('La fecha de realización debe tener el formato dd/mm/aa.');
                if (inputFechaReal) inputFechaReal.focus();
                throw new Error('Formato de fecha inválido');
            }
            const [ddStr, mmStr, aaStr] = val.split('/');
            const dd = parseInt(ddStr, 10);
            const mm = parseInt(mmStr, 10);
            const aa = parseInt(aaStr, 10);
            if (!dd || !mm || isNaN(aa)) {
                alert('La fecha de realización es inválida.');
                if (inputFechaReal) inputFechaReal.focus();
                throw new Error('Fecha inválida');
            }
            const year = 2000 + aa;
            const fecha = new Date(year, mm - 1, dd);
            // Comprobar que el date coincide con componentes (evita 31/02/25)
            if (
                isNaN(fecha.getTime()) ||
                fecha.getFullYear() !== year ||
                (fecha.getMonth() + 1) !== mm ||
                fecha.getDate() !== dd
            ) {
                alert('La fecha de realización no es una fecha válida.');
                if (inputFechaReal) inputFechaReal.focus();
                throw new Error('Fecha inválida');
            }
        })();

        if (!noReporteVal) {
            alert('Indica el No. de reporte / certificado.');
            const el = document.getElementById('inv-no-reporte');
            if (el) el.focus();
            return;
        }

        // Si el tipo es VT / PT / MT y existen opciones de detalle, el detalle es obligatorio
        (function validarDetalleCondicional() {
            const tipoUpper = (pruebaTipo || '').toUpperCase();
            const selDet = document.getElementById('inv-prueba-detalle');
            const opciones = selDet ? Array.from(selDet.options || []) : [];
            const hayOpciones = opciones.some(o => o.value && o.value !== '');
            if (tipoUpper === 'VT / PT / MT' && hayOpciones) {
                if (!pruebaDetalle) {
                    alert('Selecciona el detalle de la prueba.');
                    if (selDet) selDet.focus();
                    throw new Error('Detalle de prueba requerido');
                }
            }
        })();

        if (!resultado) {
            alert('Selecciona el resultado de la prueba.');
            if (selResultadoEl) selResultadoEl.focus();
            return;
        }

        const fechaPrueba = document.getElementById('prueba-fecha')?.value || '';
        const proxima = document.getElementById('inv-proxima')?.value || '';

        const registro = {
            equipo,
            fechaPrueba,
            resultado,
            fechaRealizacion,
            // Solo guardar 'proxima' si el periodo es ANUAL
            proxima: (periodo === 'ANUAL') ? proxima : '',
            prueba: pruebaTipo,
            pruebaTipo,
            pruebaDetalle,
            serial: document.getElementById('inv-serial')?.value || '',
            edo: document.getElementById('inv-edo')?.value || '',
            propiedad: document.getElementById('inv-propiedad')?.value || '',
            producto: document.getElementById('inv-producto')?.value || '',
            descripcion: document.getElementById('inv-descripcion')?.value || '',
            material: document.getElementById('inv-material')?.value || '',
            area: document.getElementById('inv-area')?.value || '',
            noReporte: noReporteVal,
            ejecucion: document.getElementById('inv-ejecucion')?.value || '',
            periodo,
            emisor,
            tecnico,
            contador: document.getElementById('inv-contador')?.value || '',
            observaciones: document.getElementById('prueba-observaciones')?.value || ''
        };

        // Guardar en Firestore (fuente principal de datos)
        await guardarPruebaEnFirestore(registro);

        limpiarFormularioPruebas();
        alert('Prueba guardada.');
    });
});
