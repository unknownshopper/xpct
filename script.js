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
            const idxEstado = headersInv.indexOf('ESTADO');

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

    const chkTodos = document.getElementById('actlist-select-todos');
    if (chkTodos) {
        chkTodos.addEventListener('change', () => {
            const filas = tbody.querySelectorAll('.actlist-select-fila');
            filas.forEach(chk => {
                chk.checked = chkTodos.checked;
            });
        });
    }

            const vistos = new Set();
            filasInv.forEach(cols => {
                const eq = idxEquipo >= 0 ? (cols[idxEquipo] || '') : '';
                const desc = idxDesc >= 0 ? (cols[idxDesc] || '') : '';
                const edo = idxEstado >= 0 ? (cols[idxEstado] || '') : '';
                if (!eq || vistos.has(eq)) return;
                let edoEfectivo = edo.trim().toUpperCase();
                const override = mapaEstadoOverride[eq];
                if (override) edoEfectivo = String(override).trim().toUpperCase();
                if (edoEfectivo !== 'ON') return;
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
            } else if (detalleUpper.includes('RETENEDOR')) {
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

        const val = (sel.value || '').toUpperCase();
        if (val === 'VT / PT / MT') {
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
    const selectTipo = document.getElementById('act-tipo');

    const btnGuardar = document.getElementById('act-btn-guardar');
    const btnLimpiar = document.getElementById('act-btn-limpiar');

    let headersAct = [];
    let filasAct = [];
    const infoPorEquipoAct = {}; // { serial, estado, propiedad, descripcion }
    let equiposSeleccionados = [];

    // Modo de captura para TERCERO: no usar inventario ni sugerencias
    let esTercero = false;
    function actualizarModoTipo() {
        esTercero = ((selectTipo?.value || '').toString().toUpperCase() === 'TERCERO');
        if (esTercero) {
            // Quitar lista de sugerencias para permitir captura libre
            inputEquipo.removeAttribute('list');
        } else {
            // Restaurar datalist para equipos propios
            inputEquipo.setAttribute('list', 'lista-equipos-actividad');
        }
    }
    if (selectTipo) {
        selectTipo.addEventListener('change', actualizarModoTipo);
        // Inicializar estado al cargar
        actualizarModoTipo();
    }

    // Overrides de estado por equipo (ON/OFF/WIP) guardados en localStorage y sincronizados con Firestore
    const claveEstadoOverrideAct = 'pct_invre_estado_override';
    let mapaEstadoOverrideAct = {};
    try {
        const crudoAct = localStorage.getItem(claveEstadoOverrideAct) || '{}';
        const parsedAct = JSON.parse(crudoAct);
        if (parsedAct && typeof parsedAct === 'object') mapaEstadoOverrideAct = parsedAct;
    } catch {
        mapaEstadoOverrideAct = {};
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
                        mapaEstadoOverrideAct[equipoId] = edo;
                    }
                });
                try {
                    localStorage.setItem(claveEstadoOverrideAct, JSON.stringify(mapaEstadoOverrideAct));
                } catch (e) {
                    console.warn('No se pudo cachear overrides de estado desde Firestore (actividad)', e);
                }
            }
        } catch (e) {
            console.warn('No se pudieron cargar estados de inventario desde Firestore (actividad)', e);
        }
    })();

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
                let edoBase = idxEdo >= 0 ? (cols[idxEdo] || '') : '';
                edoBase = edoBase.toString().trim().toUpperCase();
                if (!edoBase) edoBase = 'ON';

                const override = mapaEstadoOverrideAct[eq];
                const edoEfectivo = override ? String(override).trim().toUpperCase() : edoBase;

                // Solo equipos que efectivamente no estén OFF se ofrecen en el datalist
                if (edoEfectivo !== 'OFF') {
                    const opt = document.createElement('option');
                    opt.value = eq;
                    opt.label = desc ? `${eq} - ${desc}` : eq;
                    datalistEquipos.appendChild(opt);
                }

                const serial = idxSerial >= 0 ? (cols[idxSerial] || '') : '';
                const prop = idxProp >= 0 ? (cols[idxProp] || '') : '';
                infoPorEquipoAct[eq] = {
                    serial,
                    estado: edoEfectivo,
                    propiedad: prop,
                    descripcion: desc
                };
            });
        })
        .catch(err => console.error(err));

    // Actividad ahora se almacena en Firestore (colección "actividades") en lugar de localStorage
    let listaActividad = [];

    // Un equipo está "en servicio" si tiene al menos una actividad sin fecha de terminación
    function equipoTieneActividadAbierta(eq) {
        const codigo = (eq || '').toString().trim();
        if (!codigo) return false;
        return listaActividad.some(reg => {
            const equipoReg = (reg.equipo || '').toString().trim();
            if (equipoReg !== codigo) return false;
            const term = (reg.terminacionServicio || '').toString().trim();
            return !term; // sin fecha de terminación => sigue en servicio
        });
    }

    // Obtener estado de pruebas/calibraciones para un equipo específico (uso en actividad)
    async function obtenerEstadoPruebasPorEquipoActividad(equipoId) {
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
            const d = new Date(str);
            if (isNaN(d.getTime())) return null;
            d.setHours(0, 0, 0, 0);
            return d;
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
                const q = query(colRef, where('equipo', '==', equipoId));
                const snap = await getDocs(q);
                return snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (e) {
                console.warn('No se pudieron leer pruebas desde Firestore (actividad)', e);
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

        if (!pruebas.length) {
            return {
                total: 0,
                vigentes: 0,
                vencidas: 0,
                ultima: null,
                estadoUltima: 'SIN_PRUEBA',
            };
        }

        const enriquecidas = pruebas.map(reg => {
            const c = clasificar(reg);
            const fReal = parseFechaRealizacion(reg.fechaRealizacion || '') || hoySinHora();
            return { ...reg, _clasif: c, _fechaReal: fReal };
        });

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
            estadoUltima: ultima._clasif.estado,
        };
    }

    async function cargarActividadDesdeFirestore() {
        if (!window.db) {
            console.warn('Firestore (window.db) no está disponible');
            listaActividad = [];
            actualizarResumenActividad();
            return;
        }

        try {
            const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
            const db = getFirestore();
            const colRef = collection(db, 'actividades');
            const snap = await getDocs(colRef);
            listaActividad = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) {
            console.error('Error al cargar actividades desde Firestore', e);
            listaActividad = [];
        }

        actualizarResumenActividad();
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

    // Cargar resumen inicial desde Firestore
    cargarActividadDesdeFirestore();

    // Máscara de fecha en actividad.html (campos dd/mm/aa, 6 dígitos)
    const inputFechaEmbarque = document.getElementById('act-fecha-embarque');
    const inputInicioServicio = document.getElementById('act-inicio-servicio');

    [inputFechaEmbarque, inputInicioServicio].forEach(input => {
        if (!input) return;
        input.addEventListener('input', () => {
            const formateado = formatearFechaDdMmAaInput(input.value);
            input.value = formateado;
        });
    });

    if (btnGuardar) {
        btnGuardar.addEventListener('click', async (ev) => {
            ev.preventDefault();
            await guardarActividadEnFirestore();
        });
    }

    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', (ev) => {
            ev.preventDefault();
            limpiarFormularioActividad();
        });
    }

    // Autoformato para fechas en formato dd/mm/aa (6 dígitos) mientras el usuario escribe.
    function formatearFechaDdMmAaInput(valor) {
        const soloDigitos = (valor || '').replace(/\D/g, '').slice(0, 6);
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

    // Helpers para leer datos del formulario de actividad
    function obtenerDatosBaseActividad() {
        const tipo = (document.getElementById('act-tipo') || {}).value || '';
        const cliente = (document.getElementById('act-cliente') || {}).value || '';
        const areaCliente = (document.getElementById('act-area-cliente') || {}).value || '';
        const ubicacion = (document.getElementById('act-ubicacion') || {}).value || '';
        const os = (document.getElementById('act-os') || {}).value || '';
        const ordenSuministro = (document.getElementById('act-orden-suministro') || {}).value || '';
        const factura = (document.getElementById('act-factura') || {}).value || '';
        const estCot = (document.getElementById('act-est-cot') || {}).value || '';
        const precioTexto = (document.getElementById('act-precio') || {}).value || '';
        const fechaEmbarque = (document.getElementById('act-fecha-embarque') || {}).value || '';
        const inicioServicio = (document.getElementById('act-inicio-servicio') || {}).value || '';
        const diasServicio = Number((document.getElementById('act-dias-servicio') || {}).value || 0) || 0;

        const precio = Number(precioTexto.toString().replace(/[^0-9.-]/g, '')) || 0;

        return {
            tipo,
            cliente,
            areaCliente,
            ubicacion,
            os,
            ordenSuministro,
            factura,
            estCot,
            precio,
            fechaEmbarque,
            inicioServicio,
            diasServicio,
        };
    }

    function limpiarFormularioActividad() {
        const idsTexto = [
            'act-cliente',
            'act-area-cliente',
            'act-ubicacion',
            'act-os',
            'act-orden-suministro',
            'act-factura',
            'act-est-cot',
            'act-precio',
            'act-fecha-embarque',
            'act-inicio-servicio',
            'act-dias-servicio',
            'act-equipo',
        ];

        idsTexto.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        equiposSeleccionados = [];
        renderEquiposSeleccionados();
    }

    function generarOsAutomatico(equipo, inicioServicioTexto) {
        // Formato de OS: PCT-YY-XXX
        //  - PCT: prefijo fijo
        //  - YY: últimos 2 dígitos del año del inicio de servicio
        //  - XXX: consecutivo de 3 dígitos dentro de ese año
        // El consecutivo se lleva por combinación (cliente, año),
        // alineado con la lógica usada en trazabilidades.html.

        const partes = (inicioServicioTexto || '').split('/');
        if (partes.length !== 3) return '';
        const aaStr = partes[2];
        const aa = parseInt(aaStr, 10);
        if (isNaN(aa)) return '';
        const yy = String(aa).padStart(2, '0');

        // Cliente actual del formulario
        const clienteSel = (document.getElementById('act-cliente') || {}).value || '';

        // Buscar OS existentes para misma combinación cliente+año
        const prefijo = `PCT-${yy}-`;
        const existentes = listaActividad
            .filter(reg => {
                const cli = (reg.cliente || '').toString();
                const ini = (reg.inicioServicio || '').toString();
                if (cli !== clienteSel) return false;
                return ini.endsWith(`/${yy}`);
            })
            .map(reg => (reg.os || '').toString().trim())
            .filter(os => os.startsWith(prefijo));

        // Obtener el mayor consecutivo usado hasta ahora para ese año
        let maxConsec = 0;
        existentes.forEach(os => {
            const partesOs = os.split('-');
            const ult = partesOs[2] || '';
            const num = parseInt(ult, 10);
            if (!isNaN(num) && num > maxConsec) maxConsec = num;
        });

        const siguiente = maxConsec + 1;
        const consecutivo = String(siguiente).padStart(3, '0');
        return `PCT-${yy}-${consecutivo}`;
    }

    function generarOcAutomatica(equipo, inicioServicioTexto) {
        // Formato de OC: 4301YYNNNN
        //  - 4301: prefijo fijo
        //  - YY: últimos 2 dígitos del año del inicio de servicio
        //  - NNNN: consecutivo de 4 dígitos dentro de ese año
        // El consecutivo se lleva por combinación (cliente, equipo, año),
        // alineado con la lógica usada en trazabilidades.html para ocPorPeriodo.

        const partes = (inicioServicioTexto || '').split('/');
        if (partes.length !== 3) return '';
        const aaStr = partes[2];
        const aa = parseInt(aaStr, 10);
        if (isNaN(aa)) return '';
        const yy = String(aa).padStart(2, '0');

        const clienteSel = (document.getElementById('act-cliente') || {}).value || '';
        const equipoSel = (equipo || '').toString();
        if (!clienteSel || !equipoSel) return '';

        const prefijo = `4301${yy}`;

        // Buscar OCs existentes en actividades para misma combinación cliente+equipo+año
        const existentes = listaActividad
            .filter(reg => {
                const cli = (reg.cliente || '').toString();
                const eq = (reg.equipo || '').toString();
                const ini = (reg.inicioServicio || '').toString();
                if (cli !== clienteSel || eq !== equipoSel) return false;
                return ini.endsWith(`/${yy}`);
            })
            .map(reg => (reg.ordenSuministro || reg.oc || '').toString().trim())
            .filter(oc => oc.startsWith(prefijo));

        let maxConsec = 0;
        existentes.forEach(oc => {
            const sufijo = oc.slice(prefijo.length);
            const num = parseInt(sufijo, 10);
            if (!isNaN(num) && num > maxConsec) maxConsec = num;
        });

        const siguiente = maxConsec + 1;
        const consecutivo = String(siguiente).padStart(4, '0');
        return `${prefijo}${consecutivo}`;
    }

    async function guardarActividadEnFirestore() {
        if (!window.db) {
            console.warn('Firestore (window.db) no está disponible para guardar actividad');
            return;
        }

        if (!equiposSeleccionados.length) {
            alert('Selecciona al menos un equipo / activo para la actividad.');
            return;
        }

        const base = obtenerDatosBaseActividad();
        // Validación estricta: no permitir guardar si faltan datos clave
        const faltantes = [];
        if (!base.tipo) faltantes.push('Tipo');
        if (!base.cliente) faltantes.push('Cliente');
        if (!base.areaCliente) faltantes.push('Área del cliente');
        if (!base.ubicacion) faltantes.push('Ubicación');
        if (!base.fechaEmbarque) faltantes.push('Fecha de embarque');
        if (!base.inicioServicio) faltantes.push('Inicio del servicio');
        if (!base.os) faltantes.push('OS');
        if (!base.ordenSuministro) faltantes.push('OC');
        if (!base.estCot) faltantes.push('Est-Cot');
        if (!base.factura) faltantes.push('Factura');

        if (faltantes.length) {
            alert('Completa los siguientes campos antes de guardar:\n\n- ' + faltantes.join('\n- '));
            return;
        }

        // Validación de pruebas/calibraciones vigentes para los equipos seleccionados
        try {
            const resumenPruebasPorEquipo = {};
            for (const eq of equiposSeleccionados) {
                resumenPruebasPorEquipo[eq] = await obtenerEstadoPruebasPorEquipoActividad(eq);
            }

            const sinPrueba = [];
            const vencidas = [];

            Object.entries(resumenPruebasPorEquipo).forEach(([eq, info]) => {
                if (!info) return;
                if (info.estadoUltima === 'SIN_PRUEBA' || info.estadoUltima === 'SIN_FECHA') {
                    sinPrueba.push(eq);
                } else if (info.estadoUltima === 'VENCIDA') {
                    vencidas.push(eq);
                }
            });

            if (sinPrueba.length || vencidas.length) {
                let mensaje = 'Advertencia:\n\n';
                if (sinPrueba.length) {
                    mensaje += '- Equipos SIN PRUEBAS REGISTRADAS:\n  ' + sinPrueba.join(', ') + '\n\n';
                }
                if (vencidas.length) {
                    mensaje += '- Equipos con PRUEBA VENCIDA:\n  ' + vencidas.join(', ') + '\n\n';
                }
                mensaje += '¿Deseas continuar y registrar la actividad de todos modos?';

                const continuar = window.confirm(mensaje);
                if (!continuar) {
                    return;
                }
            }
        } catch (e) {
            console.warn('No se pudo validar el estado de pruebas al guardar la actividad', e);
        }

        try {
            const { getFirestore, collection, addDoc, serverTimestamp } = await import(
                'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
            );

            const db = getFirestore();
            const colRef = collection(db, 'actividades');

            const ahora = serverTimestamp();

            for (const eq of equiposSeleccionados) {
                const osFinal = base.os; // ya validado requerido
                const ocFinal = base.ordenSuministro; // ya validado requerido

                const infoEq = infoPorEquipoAct[eq] || {};
                const descripcion = infoEq.descripcion || '';

                const registro = {
                    ...base,
                    os: osFinal,
                    ordenSuministro: ocFinal,
                    equipo: eq,
                    descripcion,
                    fechaRegistro: ahora,
                };
                await addDoc(colRef, registro);
            }

            // Recargar listaActividad y resumen locales
            await cargarActividadDesdeFirestore();

            alert('Actividad guardada.');
            limpiarFormularioActividad();
        } catch (e) {
            console.error('Error al guardar actividad en Firestore', e);
            alert('No se pudo guardar la actividad. Revisa la consola para más detalles.');
        }
    }

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

            const colSerial = document.createElement('span');
            colSerial.textContent = info.serial || '';

            const colEstado = document.createElement('span');
            colEstado.textContent = info.estado || '';

            const colProp = document.createElement('span');
            colProp.textContent = info.propiedad || '';

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
            row.appendChild(colSerial);
            row.appendChild(colEstado);
            row.appendChild(colProp);
            row.appendChild(colDesc);
            row.appendChild(colAccion);

            contEquiposSel.appendChild(row);
        });
    }

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

        const colSerial = document.createElement('span');
        colSerial.textContent = info.serial || '';

        const colEstado = document.createElement('span');
        colEstado.textContent = info.estado || '';

        const colProp = document.createElement('span');
        colProp.textContent = info.propiedad || '';

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
        row.appendChild(colSerial);
        row.appendChild(colEstado);
        row.appendChild(colProp);
        row.appendChild(colDesc);
        row.appendChild(colAccion);

        contEquiposSel.appendChild(row);
    });
}

function procesarTextoEquipos(texto) {
    const valorRaw = texto || '';
    const partes = valorRaw
        // Dividir por espacios en blanco (uno o más), saltos de línea, comas y punto y coma.
        // Los códigos de equipo no llevan espacios, así que es seguro usarlos como separador.
        .split(/[\s,;]+/)
        .map(v => v.trim())
        .filter(v => v.length > 0);

    if (!partes.length) return false;

    let agregado = false;
    partes.forEach(fragmento => {
        if (!fragmento) return;

        // Tomar solo la primera "palabra" (antes de cualquier espacio/tab),
        // asumiendo que el código de equipo no tiene espacios.
        const eq = fragmento.split(/\s+/)[0];
        if (!eq) return;

        // No permitir agregar equipos que ya tienen actividad abierta
        if (equipoTieneActividadAbierta(eq)) {
            alert(`El equipo ${eq} ya tiene una actividad en servicio (sin fecha de terminación). Termina esa actividad antes de crear una nueva.`);
            return;
        }

        if (equiposSeleccionados.includes(eq)) return;
        equiposSeleccionados.push(eq);
        agregado = true;
    });

    if (agregado) {
        renderEquiposSeleccionados();
    }

    return agregado;
}

function agregarEquipoDesdeInput() {
    const valorRaw = inputEquipo.value || '';
    const huboCambios = procesarTextoEquipos(valorRaw);
    if (huboCambios) {
        inputEquipo.value = '';
    }
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

inputEquipo.addEventListener('change', () => {
    // Cuando cambia manualmente el texto, intentamos agregarlo al lote
    agregarEquipoDesdeInput();
    autocompletarDatosAutoActividad();
});

// Permitir capturar varios equipos escribiendo y separando por espacio o Enter.
// Al presionar espacio o Enter, se toma el valor actual, se intenta agregar a equiposSeleccionados
// y se limpia el input para continuar con el siguiente código.
inputEquipo.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
        const valorActual = (inputEquipo.value || '').trim();
        if (!valorActual) return;

        e.preventDefault();
        const huboCambios = procesarTextoEquipos(inputEquipo.value);
        if (huboCambios) {
            inputEquipo.value = '';
        }
    }
});

// Cerrar correctamente el bloque document.addEventListener('DOMContentLoaded', ...) de la sección de actividad.html añadiendo un '});' antes del siguiente bloque de pruebas.html.
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

// Listado de actividades en actividadlist.html
document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('actlist-tbody');
    if (!tbody) return; // No estamos en actividadlist.html

    const msgVacio = document.getElementById('actlist-msg-vacio');
    const lblCont = document.getElementById('actlist-contador');
    const inputBuscar = document.getElementById('actlist-buscar');

    let listaActividad = [];

    // Mapas desde inventario para vista operación
    const mapaDescripcionPorEquipoList = {};
    const mapaEstadoPorEquipoList = {};

    (async () => {
        try {
            const resp = await fetch('docs/invre.csv');
            if (!resp.ok) return;
            const texto = await resp.text();
            const lineas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
            if (!lineas.length) return;

            const parse = (window && window.parseCSVLine) ? window.parseCSVLine : null;
            if (!parse) return;

            const headers = parse(lineas[0]);
            const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
            const idxDesc = headers.indexOf('DESCRIPCION');
            const idxEdo = headers.indexOf('EDO');
            if (idxEquipo < 0 || idxDesc < 0) return;

            // Overrides de estado desde localStorage
            const claveEstadoOverride = 'pct_invre_estado_override';
            let overrides = {};
            try {
                overrides = JSON.parse(localStorage.getItem(claveEstadoOverride) || '{}') || {};
            } catch { overrides = {}; }

            lineas.slice(1).forEach(l => {
                const cols = parse(l);
                const eq = (cols[idxEquipo] || '').toString().trim();
                const desc = (cols[idxDesc] || '').toString().trim();
                if (!eq || !desc) return;
                if (!mapaDescripcionPorEquipoList[eq]) {
                    mapaDescripcionPorEquipoList[eq] = desc;
                }
                // Estado efectivo
                if (!mapaEstadoPorEquipoList[eq]) {
                    let edoBase = idxEdo >= 0 ? (cols[idxEdo] || '') : '';
                    edoBase = (edoBase || '').toString().trim().toUpperCase() || 'ON';
                    const ov = overrides[eq];
                    const edoEfectivo = ov ? String(ov).trim().toUpperCase() : edoBase;
                    mapaEstadoPorEquipoList[eq] = edoEfectivo;
                }
            });
        } catch (e) {
            console.warn('No se pudo cargar invre.csv para descripciones (listado)', e);
        }
    })();

    // Convierte fecha dd/mm/aa a objeto Date (año base 2000+aa)
    function parseFechaDdMmAaListado(fechaTexto) {
        if (!fechaTexto) return null;
        const partes = fechaTexto.split('/');
        if (partes.length !== 3) return null;
        const [ddStr, mmStr, aaStr] = partes;
        const dd = parseInt(ddStr, 10);
        const mm = parseInt(mmStr, 10);
        const aa = parseInt(aaStr, 10);
        if (!dd || !mm || isNaN(aa)) return null;
        const yyyy = 2000 + aa;
        const d = new Date(yyyy, mm - 1, dd);
        return isNaN(d.getTime()) ? null : d;
    }

    function formatearMoneda(valor) {
        const n = Number(valor) || 0;
        return n.toLocaleString('es-MX', {
            style: 'currency',
            currency: 'MXN',
            maximumFractionDigits: 0
        });
    }

    function renderTabla() {
        const listaBase = Array.isArray(listaActividad) ? listaActividad : [];
        const filtro = (inputBuscar?.value || '').toLowerCase().trim();

        tbody.innerHTML = '';

        if (!listaBase.length) {
            if (msgVacio) msgVacio.style.display = 'block';
            if (lblCont) lblCont.textContent = '0 registros';
            return;
        }

        if (msgVacio) msgVacio.style.display = 'none';

        let visibles = 0;

        // Ordenar por cliente, área y ubicación para agrupar visualmente
        const listaOrdenada = [...listaBase].sort((a, b) => {
            const ca = (a.cliente || '').toString().toUpperCase();
            const cb = (b.cliente || '').toString().toUpperCase();
            if (ca < cb) return -1;
            if (ca > cb) return 1;
            const aa = (a.areaCliente || '').toString().toUpperCase();
            const ab = (b.areaCliente || '').toString().toUpperCase();
            if (aa < ab) return -1;
            if (aa > ab) return 1;
            const ua = (a.ubicacion || '').toString().toUpperCase();
            const ub = (b.ubicacion || '').toString().toUpperCase();
            if (ua < ub) return -1;
            if (ua > ub) return 1;
            return 0;
        });

        let clienteActual = '';
        let areaActual = '';
        let ubicacionActual = '';

        listaOrdenada.forEach(reg => {
            const id = reg.id;
            const cliente = reg.cliente || '';
            const area = reg.areaCliente || '';
            const inicioTexto = reg.inicioServicio || '';
            const terminacionTexto = reg.terminacionServicio || '';
            const ubicacion = reg.ubicacion || '';

            // Calcular días en servicio:
            // - Si hay terminación, días entre inicio y terminación (servicio cerrado).
            // - Si no hay terminación, días entre inicio y hoy (servicio abierto).
            let dias = 0;
            const dInicio = parseFechaDdMmAaListado(inicioTexto);
            const dFin = terminacionTexto ? parseFechaDdMmAaListado(terminacionTexto) : new Date();
            if (dInicio && dFin) {
                const diffMs = dFin.getTime() - dInicio.getTime();
                const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                if (diffDias >= 0) dias = diffDias;
            }
            const os = reg.os || '';
            const estCotVal = reg.estCot || reg.factura || '';
            const ordenCompra = reg.ordenSuministro || '';
            const descripcionBase = reg.descripcion || '';

            const equiposArr = Array.isArray(reg.equipos) && reg.equipos.length
                ? reg.equipos
                : (reg.equipo ? [reg.equipo] : []);

            equiposArr.forEach(equipoNombre => {
                const descEfectiva = descripcionBase || mapaDescripcionPorEquipoList[equipoNombre] || '';
                const textoBuscar = `${cliente} ${area} ${ubicacion} ${equipoNombre} ${descEfectiva} ${os} ${estCotVal}`.toLowerCase();
                if (filtro && !textoBuscar.includes(filtro)) return;

                visibles += 1;

                // Insertar encabezados de agrupación por cliente, área y ubicación cuando cambien
                if (cliente && cliente !== clienteActual) {
                    clienteActual = cliente;
                    areaActual = '';
                    ubicacionActual = '';
                    const trGrupoCliente = document.createElement('tr');
                    trGrupoCliente.className = 'actlist-group-cliente';
                    trGrupoCliente.innerHTML = `
                        <td colspan="14" style="padding:0.5rem 0.75rem; background:#111827; font-weight:700; font-size:0.9rem; color:#f9fafb; border-top:2px solid #0f172a; border-bottom:1px solid #0f172a; text-transform:uppercase; letter-spacing:0.03em; cursor:pointer;">
                            CLIENTE: ${clienteActual}
                        </td>
                    `;
                    tbody.appendChild(trGrupoCliente);
                }

                if (area && area !== areaActual) {
                    areaActual = area;
                    ubicacionActual = '';
                    const trGrupoArea = document.createElement('tr');
                    trGrupoArea.className = 'actlist-group-area';
                    trGrupoArea.innerHTML = `
                        <td colspan="14" style="padding:0.4rem 0.75rem; background:#e5e7eb; font-weight:600; font-size:0.85rem; color:#111827; border-bottom:1px solid #cbd5e1; text-transform:uppercase; letter-spacing:0.02em; cursor:pointer;">
                            Área: ${areaActual}
                        </td>
                    `;
                    tbody.appendChild(trGrupoArea);
                }

                if (ubicacion && ubicacion !== ubicacionActual) {
                    ubicacionActual = ubicacion;
                    const trGrupoUbic = document.createElement('tr');
                    trGrupoUbic.className = 'actlist-group-ubic';
                    trGrupoUbic.innerHTML = `
                        <td colspan="14" style="padding:0.3rem 0.9rem; background:#f9fafb; font-weight:500; font-size:0.8rem; color:#4b5563; border-bottom:1px solid #e5e7eb; border-left:4px solid #9ca3af; cursor:pointer;">
                            Ubicación: ${ubicacionActual}
                        </td>
                    `;
                    tbody.appendChild(trGrupoUbic);
                }

                const tr = document.createElement('tr');
                const edoEquipo = (mapaEstadoPorEquipoList[equipoNombre] || '').toString().toUpperCase();
                if (edoEquipo === 'OFF') {
                    return; // no mostrar equipos OFF en actividad
                }
                const estadoActividad = (reg.estadoActividad || 'ABIERTO').toString().toUpperCase();
                const esAdmin = !!(window && window.isAdmin);
                tr.innerHTML = `
                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb; text-align:center;">
                        <input type="checkbox" class="actlist-select-fila" data-id="${id}">
                    </td>
                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb; display:none;">
                        <input type="text" class="actlist-input-cliente" data-id="${id}" value="${cliente}" style="width:100%; font-size:0.85rem; border:1px solid #e5e7eb; border-radius:0.25rem; padding:0.15rem 0.25rem;" disabled>
                    </td>
                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb; display:none;">
                        <input type="text" class="actlist-input-area" data-id="${id}" value="${area}" style="width:100%; font-size:0.85rem; border:1px solid #e5e7eb; border-radius:0.25rem; padding:0.15rem 0.25rem;" disabled>
                    </td>
                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb;">${equipoNombre}</td>
                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb; max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${descEfectiva}</td>
                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb;">
                        ${esAdmin
                            ? `<select class="actlist-select-estado estado-select ${estadoActividad === 'ABIERTO' ? 'abierto' : 'cerrado'}" data-id="${id}" style="font-size:0.8rem; padding:0.15rem 0.3rem; border:1px solid #d1d5db; border-radius:0.25rem;">
                                    <option value="ABIERTO" ${estadoActividad === 'ABIERTO' ? 'selected' : ''}>ABIERTO</option>
                                    <option value="CERRADO" ${estadoActividad === 'CERRADO' ? 'selected' : ''}>CERRADO</option>
                               </select>`
                            : `<span class="estado-pill ${estadoActividad === 'ABIERTO' ? 'abierto' : 'cerrado'}">${estadoActividad}</span>`}
                    </td>
                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb; display:none;">${ubicacion}</td>
                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb; white-space:nowrap;">
                        <input type="text" class="actlist-input-inicio" data-id="${id}" value="${inicioTexto}" placeholder="__/__/__" maxlength="8" style="font-size:0.8rem; width:80px; border:1px solid #e5e7eb; border-radius:0.25rem; padding:0.15rem 0.25rem;" disabled>
                    </td>
                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb; white-space:nowrap;">
                        <input type="text" class="actlist-input-term" data-id="${id}" value="${terminacionTexto}" placeholder="__/__/__" maxlength="8" style="font-size:0.8rem; width:80px; border:1px solid #e5e7eb; border-radius:0.25rem; padding:0.15rem 0.25rem;" disabled>
                    </td>
                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb; text-align:center; width:80px;">
                        ${dias || ''}
                    </td>
                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb;">
                        <input type="text" class="actlist-input-os" data-id="${id}" value="${os}" style="width:110px; font-size:0.8rem; border:1px solid #e5e7eb; border-radius:0.25rem; padding:0.15rem 0.25rem;" disabled>
                    </td>
                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb;">
                        <input type="text" class="actlist-input-oc" data-id="${id}" value="${ordenCompra}" style="width:110px; font-size:0.8rem; border:1px solid #e5e7eb; border-radius:0.25rem; padding:0.15rem 0.25rem;" disabled>
                    </td>
                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb;">
                        <input type="text" class="actlist-input-estcot" data-id="${id}" value="${estCotVal}" style="width:110px; font-size:0.8rem; border:1px solid #e5e7eb; border-radius:0.25rem; padding:0.15rem 0.25rem;" disabled>
                    </td>
                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb; white-space:nowrap;">
                        <button type="button" class="actlist-btn-guardar" data-id="${id}" style="font-size:0.75rem; margin-right:0.25rem;" disabled>
                            Guardar
                        </button>
                        <button type="button" class="actlist-btn-editar" data-id="${id}" style="font-size:0.75rem; margin-right:0.25rem;">
                            Editar
                        </button>
                        <button type="button" class="actlist-btn-eliminar" data-id="${id}" style="font-size:0.75rem; color:#b91c1c;">
                            Eliminar
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        });

        if (lblCont) {
            lblCont.textContent = `${visibles} registro${visibles === 1 ? '' : 's'}`;
        }

        // Guardar cambios de estado de actividad (solo admin)
        tbody.querySelectorAll('.actlist-select-estado').forEach(sel => {
            sel.addEventListener('change', async () => {
                const id = sel.getAttribute('data-id');
                if (!id) return;
                const nuevoEstado = (sel.value || '').toUpperCase();
                try {
                    const { getFirestore, doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
                    const db = getFirestore();
                    const ref = doc(db, 'actividades', id);
                    await updateDoc(ref, { estadoActividad: nuevoEstado });
                } catch (e) {
                    console.error('Error al actualizar estadoActividad', e);
                }
                // Actualizar clases visuales del select
                sel.classList.remove('abierto', 'cerrado');
                sel.classList.add(nuevoEstado === 'ABIERTO' ? 'abierto' : 'cerrado');
            });
        });

        // Listeners de colapsado por cliente, área y ubicación
        const colapsarDesde = (tr, nivel) => {
            const colapsado = tr.dataset.colapsado === '1';
            tr.dataset.colapsado = colapsado ? '0' : '1';
            let fila = tr.nextElementSibling;
            while (fila) {
                if (fila.classList.contains('actlist-group-cliente')) break;
                if (nivel === 'area' && fila.classList.contains('actlist-group-area')) break;
                if (nivel === 'ubic' && (fila.classList.contains('actlist-group-area') || fila.classList.contains('actlist-group-ubic'))) break;
                fila.style.display = colapsado ? '' : 'none';
                fila = fila.nextElementSibling;
            }
        };

        tbody.querySelectorAll('.actlist-group-cliente').forEach(tr => {
            tr.addEventListener('click', () => colapsarDesde(tr, 'cliente'));
        });
        tbody.querySelectorAll('.actlist-group-area').forEach(tr => {
            tr.addEventListener('click', () => colapsarDesde(tr, 'area'));
        });
        tbody.querySelectorAll('.actlist-group-ubic').forEach(tr => {
            tr.addEventListener('click', () => colapsarDesde(tr, 'ubic'));
        });

        // Botón Editar: habilita los campos de la fila
        tbody.querySelectorAll('.actlist-btn-editar').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (!id) return;

                const habilitar = (sel) => {
                    const el = tbody.querySelector(`${sel}[data-id="${id}"]`);
                    if (el) el.disabled = false;
                    return el;
                };

                habilitar('.actlist-input-cliente');
                habilitar('.actlist-input-area');
                habilitar('.actlist-input-inicio');
                habilitar('.actlist-input-term');
                habilitar('.actlist-input-os');
                habilitar('.actlist-input-oc');
                habilitar('.actlist-input-estcot');

                const btnGuardar = tbody.querySelector(`.actlist-btn-guardar[data-id="${id}"]`);
                if (btnGuardar) btnGuardar.disabled = false;
            });
        });

        // Botón Guardar: persiste cambios de cliente, área e inicio/terminación
        tbody.querySelectorAll('.actlist-btn-guardar').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if (!id) return;

                const getVal = (cls) => {
                    const el = tbody.querySelector(`${cls}[data-id="${id}"]`);
                    return el ? el.value.trim() : '';
                };

                const nuevoCliente = getVal('.actlist-input-cliente');
                const nuevaArea = getVal('.actlist-input-area');
                const nuevoInicio = getVal('.actlist-input-inicio');
                const nuevaTerm = getVal('.actlist-input-term');
                const nuevoOs = getVal('.actlist-input-os');
                const nuevaOc = getVal('.actlist-input-oc');
                const nuevoEstCot = getVal('.actlist-input-estcot');

                // Validar fechas si están llenas
                const dIni = nuevoInicio ? parseFechaDdMmAaListado(nuevoInicio) : null;
                const dTer = nuevaTerm ? parseFechaDdMmAaListado(nuevaTerm) : null;
                if (nuevoInicio && !dIni) {
                    alert('Inicio del servicio con formato inválido. Usa dd/mm/aa');
                    return;
                }
                if (nuevaTerm && !dTer) {
                    alert('Terminación del servicio con formato inválido. Usa dd/mm/aa');
                    return;
                }

                const regLocal = listaOrdenada.find(r => r.id === id);
                if (regLocal) {
                    regLocal.cliente = nuevoCliente;
                    regLocal.areaCliente = nuevaArea;
                    regLocal.inicioServicio = nuevoInicio;
                    regLocal.terminacionServicio = nuevaTerm;
                    regLocal.os = nuevoOs;
                    regLocal.ordenSuministro = nuevaOc;
                    regLocal.estCot = nuevoEstCot;
                }

                try {
                    const { getFirestore, doc, updateDoc } = await import(
                        'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                    );
                    const db = getFirestore();
                    const ref = doc(db, 'actividades', id);
                    await updateDoc(ref, {
                        cliente: nuevoCliente,
                        areaCliente: nuevaArea,
                        inicioServicio: nuevoInicio,
                        terminacionServicio: nuevaTerm,
                        os: nuevoOs,
                        ordenSuministro: nuevaOc,
                        estCot: nuevoEstCot,
                    });
                } catch (e) {
                    console.error('Error al actualizar actividad desde listado', e);
                }

                // Volver a cargar desde Firestore para reflejar cambios y reagrupar
                await cargarActividadDesdeFirestoreParaListado();
            });
        });

        tbody.querySelectorAll('.actlist-btn-eliminar').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if (!id) return;

                if (!confirm('¿Eliminar esta actividad? Esta acción no se puede deshacer.')) return;

                try {
                    const { getFirestore, doc, deleteDoc } = await import(
                        'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                    );
                    const db = getFirestore();
                    const ref = doc(db, 'actividades', id);
                    await deleteDoc(ref);

                    listaActividad = listaActividad.filter(r => r.id !== id);
                    renderTabla();
                } catch (e) {
                    console.error('Error al eliminar actividad en Firestore (listado)', e);
                }
            });
        });
    }

    async function cargarActividadDesdeFirestoreParaListado() {
        if (!window.db) {
            console.warn('Firestore (window.db) no está disponible en actividadlist');
            listaActividad = [];
            renderTabla();
            return;
        }

        try {
            const { getFirestore, collection, getDocs } = await import(
                'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
            );
            const db = getFirestore();
            const colRef = collection(db, 'actividades');
            const snap = await getDocs(colRef);
            listaActividad = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) {
            console.error('Error al cargar actividades desde Firestore (listado)', e);
            listaActividad = [];
        }

        renderTabla();
    }

    if (inputBuscar) {
        inputBuscar.addEventListener('input', () => {
            renderTabla();
        });
    }

    cargarActividadDesdeFirestoreParaListado();
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

            const filasDatos = lineas.slice(1)
                .map(linea => parseCSVLine(linea))
                .filter(cols => cols.length);

            // Asegurar que headersLocal tenga tantas columnas como la fila más larga
            const maxCols = filasDatos.reduce((max, cols) => Math.max(max, cols.length), headersLocal.length);
            while (headersLocal.length < maxCols) {
                headersLocal.push('');
            }

            // Mapear columnas de forma flexible según la cabecera actual de invre2.csv
            const idxEstado = headersLocal.indexOf('ESTADO') >= 0
                ? headersLocal.indexOf('ESTADO')
                : headersLocal.indexOf('EDO');
            const idxEquipo = headersLocal.indexOf('EQUIPO / ACTIVO');
            const idxProd = headersLocal.indexOf('PRODUCTO');
            const idxDesc = headersLocal.indexOf('DESCRIPCION');

            // Detectar si hay una segunda columna duplicada de "TIPO EQUIPO" (la posterior a ACERO)
            const idxTipoEqPrim = headersLocal.indexOf('TIPO EQUIPO');
            let idxTipoEqDup = -1;
            if (idxTipoEqPrim >= 0) {
                for (let i = idxTipoEqPrim + 1; i < headersLocal.length; i++) {
                    if ((headersLocal[i] || '').trim() === 'TIPO EQUIPO') {
                        idxTipoEqDup = i;
                        break;
                    }
                }
            }

            // Las tres ÚLTIMAS columnas del CSV representan siempre:
            // [PRUEBA / CALIBRACION, TIPO INSPECCION, ÁREA A INSPECIONAR]
            const nCols = headersLocal.length;
            let idxPrueba = nCols - 3;
            let idxTipoInsp = nCols - 2;
            let idxArea = nCols - 1;

            // Si en el CSV las columnas de prueba / tipo de inspección / área no tienen texto en la cabecera,
            // asignar nombres legibles para mostrarlos en la tabla.
            if (idxPrueba >= 0 && (!headersLocal[idxPrueba] || !headersLocal[idxPrueba].trim())) {
                headersLocal[idxPrueba] = 'PRUEBA / CALIBRACION';
            }
            if (idxTipoInsp >= 0 && (!headersLocal[idxTipoInsp] || !headersLocal[idxTipoInsp].trim())) {
                headersLocal[idxTipoInsp] = 'TIPO INSPECCION';
            }
            if (idxArea >= 0 && (!headersLocal[idxArea] || !headersLocal[idxArea].trim())) {
                headersLocal[idxArea] = 'ÁREA A INSPECIONAR';
            }

            const trHead = document.createElement('tr');
            trHead.style.background = '#f3f4f6';
            headersLocal.forEach((h, idx) => {
                // Omitir la segunda columna duplicada de TIPO EQUIPO en la visualización
                if (idx === idxTipoEqDup) return;
                const th = document.createElement('th');
                th.textContent = h;
                th.style.textAlign = 'left';
                th.style.padding = '0.3rem';
                trHead.appendChild(th);
            });
            thead.appendChild(trHead);

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
                        // Omitir la segunda columna duplicada de TIPO EQUIPO también en las filas
                        if (idx === idxTipoEqDup) return;
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