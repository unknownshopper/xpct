// Lógica específica para pruebas.html (autocompletado desde inventario y guardado en Firestore)

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

            const vistos = new Set();
            filasInv.forEach(cols => {
                const eq = idxEquipo >= 0 ? (cols[idxEquipo] || '') : '';
                const desc = idxDesc >= 0 ? (cols[idxDesc] || '') : '';
                const edo = idxEstado >= 0 ? (cols[idxEstado] || '') : '';
                if (!eq || vistos.has(eq)) return;
                let edoEfectivo = edo.trim().toUpperCase();
                const override = mapaEstadoOverride[eq];
                if (override) edoEfectivo = String(override).trim().toUpperCase();
                // Aceptar equipos marcados como ON o ACTIVO en el inventario
                if (edoEfectivo !== 'ON' && edoEfectivo !== 'ACTIVO') return;
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
            const formateado = formatearFechaRealizacion(inputFechaReal.value);
            inputFechaReal.value = formateado;
        });

        inputFechaReal.addEventListener('blur', () => {
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

    btn.addEventListener('click', async () => {
        const equipo = (document.getElementById('inv-equipo')?.value || '').trim();
        if (!equipo) {
            alert('Indica el equipo / activo.');
            return;
        }

        const fechaPrueba = document.getElementById('prueba-fecha')?.value || '';
        const resultado = document.getElementById('prueba-resultado')?.value || '';
        const fechaRealizacion = document.getElementById('inv-fecha-realizacion')?.value || '';
        const proxima = document.getElementById('inv-proxima')?.value || '';

        const registro = {
            equipo,
            fechaPrueba,
            resultado,
            fechaRealizacion,
            proxima,
            serial: document.getElementById('inv-serial')?.value || '',
            edo: document.getElementById('inv-edo')?.value || '',
            propiedad: document.getElementById('inv-propiedad')?.value || '',
            producto: document.getElementById('inv-producto')?.value || '',
            descripcion: document.getElementById('inv-descripcion')?.value || '',
            tipoEquipo: document.getElementById('inv-tipo-equipo')?.value || '',
            material: document.getElementById('inv-material')?.value || '',
            area: document.getElementById('inv-area')?.value || '',
            noReporte: document.getElementById('inv-no-reporte')?.value || '',
            ejecucion: document.getElementById('inv-ejecucion')?.value || '',
            emisor: document.getElementById('inv-emisor')?.value || '',
            tecnico: document.getElementById('inv-tecnico')?.value || '',
            contador: document.getElementById('inv-contador')?.value || '',
            observaciones: document.getElementById('prueba-observaciones')?.value || ''
        };

        // Guardar localmente en pct_pruebas
        const claveLocal = 'pct_pruebas';
        let lista = [];
        try {
            lista = JSON.parse(localStorage.getItem(claveLocal) || '[]');
            if (!Array.isArray(lista)) lista = [];
        } catch {
            lista = [];
        }
        lista.push(registro);
        localStorage.setItem(claveLocal, JSON.stringify(lista));

        // Guardar en Firestore
        await guardarPruebaEnFirestore(registro);

        limpiarFormularioPruebas();
        alert('Prueba guardada.');
    });
});
