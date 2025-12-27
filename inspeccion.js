// Lógica principal para inspeccion.html (selector de equipo, detalle y guardado de inspecciones)
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
    let mapaDanos = []; // [{ match: 'recubrimiento', opciones: [...] }]
    let inventarioCargado = false;
    let formatosCargados = false;
    let guardandoInspeccion = false; // evita doble guardado

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
                    console.warn('No se pudo cachear overrides de estado desde Firestore (inspeccion)', e);
                }
            }
        } catch (e) {
            console.warn('No se pudieron cargar estados de inventario desde Firestore (inspeccion)', e);
        }
    })();

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
            const idxEdo = headers.indexOf('EDO');

            equipos = lineas.slice(1).map(linea => parseCSVLine(linea));

            // Poblar datalist (usar overrides de estado; solo equipos con estado efectivo ON)
            equipos.forEach(cols => {
                const equipoId = idxEquipo >= 0 ? (cols[idxEquipo] || '') : '';
                const descripcion = idxDescripcion >= 0 ? (cols[idxDescripcion] || '') : '';
                const edo = idxEdo >= 0 ? (cols[idxEdo] || '') : '';
                if (!equipoId) return;
                let edoEfectivo = edo.trim().toUpperCase();
                const override = mapaEstadoOverride[equipoId];
                if (override) edoEfectivo = String(override).trim().toUpperCase();
                if (edoEfectivo !== 'ON') return;

                const option = document.createElement('option');
                option.value = equipoId;
                option.label = `${equipoId} - ${descripcion}`;
                datalistEquipos.appendChild(option);
            });

            inventarioCargado = true;
            // Intentar inicializar desde actividadId si aplica
            inicializarDesdeActividadUrl();
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
    
    // Cuando el usuario escribe y elige un equipo en el input/datalist
    function actualizarDetalleDesdeInput() {
        const valor = inputEquipo.value.trim();
        if (!valor) {
            detalleContenedor.innerHTML = '<p>Seleccione un equipo para ver su información.</p>';
            if (btnGuardar) btnGuardar.disabled = true;
            mostrarEstadoPruebasEnDetalle('');
            return;
        }

        const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
        const idxReporte = headers.indexOf('REPORTE P/P');
        const fila = equipos.find(cols => idxEquipo >= 0 && cols[idxEquipo] === valor);
        if (!fila) {
            detalleContenedor.innerHTML = '<p>No se encontró información para el equipo seleccionado.</p>';
            if (btnGuardar) btnGuardar.disabled = true;
            mostrarEstadoPruebasEnDetalle(valor);
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

        // Filtrar automáticos y eliminar duplicados por nombre normalizado
        const vistos = new Set();
        const parametrosInspeccion = parametrosBrutos.filter(p => {
            const base = (p || '').toLowerCase().trim();
            if (!base) return false;
            if (nombresAuto.some(auto => base.startsWith(auto))) return false;
            if (vistos.has(base)) return false;
            vistos.add(base);
            return true;
        });

        // Diagnóstico: detectar parámetros sin match en danos.csv (normalizado)
        (function diagnosticarCoberturaDanos() {
            if (!Array.isArray(mapaDanos) || !mapaDanos.length) return;
            const normalize = (s) => (s || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim();
            const faltantes = [];
            parametrosInspeccion.forEach(p => {
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
        function obtenerTiposDano(nombreParametro) {
            const base = (nombreParametro || '').toLowerCase();

            // Fleje: el estado ya es LEGIBLE / NO LEGIBLE, no se usa catálogo de daño
            if (base.includes('fleje')) {
                return [];
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

            // Recubrimiento
            if (base.includes('recubrimiento')) {
                return [
                    '',
                    'SIN ELASTOMERO',
                    'DEFORMADO',
                    'CORTADO',
                    'RESECO',
                    'DEGRADADO',
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
                        ${parametrosInspeccion.map((p, idx) => {
                            const baseNombre = (p || '').toLowerCase();

                            // Para Fleje: solo estado LEGIBLE / NO LEGIBLE, sin tipo de daño adicional
                            if (baseNombre.includes('fleje')) {
                                return `
                            <div class="parametros-fila">
                                <div class="col-nombre">${p}</div>
                                <div class="col-estado">
                                    <label><input type="radio" name="param-${idx}-estado" value="LEGIBLE" checked> LEGIBLE</label>
                                    <label><input type="radio" name="param-${idx}-estado" value="NO LEGIBLE"> NO LEGIBLE</label>
                                </div>
                            </div>
                        `;
                            }

                            const tiposDano = obtenerTiposDano(p);
                            return `
                            <div class="parametros-fila">
                                <div class="col-nombre">${p}</div>
                                <div class="col-estado">
                                    <label><input type="radio" name="param-${idx}-estado" value="BUENO" checked> BUENO</label>
                                    <label><input type="radio" name="param-${idx}-estado" value="MALO"> MALO</label>
                                </div>
                                <div class="col-dano" data-param-idx="${idx}" style="display:none;">
                                    <select name="param-${idx}-dano" disabled>
                                        ${tiposDano.map(op => op ? `<option value="${op}">${op}</option>` : '<option value="">(Sin daño)</option>').join('')}
                                    </select>
                                    <input type="text" name="param-${idx}-dano-otro" placeholder="Describa el hallazgo" style="display:none; margin-top:0.25rem; font-size:0.8rem; width:100%;" disabled>
                                </div>
                            </div>
                        `;
                        }).join('')}
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

        // Mostrar el selector de tipo de daño solo cuando el estado sea MALO
        detalleContenedor.querySelectorAll('.parametros-fila').forEach((filaHtml, idx) => {
            const radios = filaHtml.querySelectorAll(`input[name="param-${idx}-estado"]`);
            const colDano = filaHtml.querySelector('.col-dano');
            const selectDano = colDano ? colDano.querySelector('select') : null;
            const inputOtro = colDano ? colDano.querySelector(`input[name="param-${idx}-dano-otro"]`) : null;

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
                if (!colDano || !selectDano) return;
                let estado = '';
                radios.forEach(r => {
                    if (r.checked) estado = r.value;
                });
                if (estado === 'MALO') {
                    colDano.style.display = '';
                    if (selectDano) {
                        selectDano.disabled = false;
                        actualizarVisibilidadOtro();
                    }
                } else {
                    colDano.style.display = 'none';
                    if (selectDano) {
                        selectDano.disabled = true;
                        selectDano.value = '';
                    }
                    if (inputOtro) {
                        inputOtro.style.display = 'none';
                        inputOtro.disabled = true;
                        inputOtro.value = '';
                    }
                }
            };

            radios.forEach(r => {
                r.addEventListener('change', actualizarVisibilidadDano);
            });

            if (selectDano) {
                selectDano.addEventListener('change', actualizarVisibilidadOtro);
            }

            actualizarVisibilidadDano();
        });

        if (btnGuardar) btnGuardar.disabled = false;

        // Mostrar estado de pruebas/calibraciones para este equipo
        mostrarEstadoPruebasEnDetalle(valor);
    }

    inputEquipo.addEventListener('change', actualizarDetalleDesdeInput);
    inputEquipo.addEventListener('blur', actualizarDetalleDesdeInput);

    if (btnGuardar) {
        btnGuardar.addEventListener('click', async () => {
            if (guardandoInspeccion) return;
            guardandoInspeccion = true;
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
                const inputOtro = filaHtml.querySelector(`input[name="param-${idx}-dano-otro"]`);
                const detalleOtro = inputOtro ? (inputOtro.value || '').trim() : '';
                parametrosCapturados.push({ nombre, estado, tipoDano, detalleOtro });
            });

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
                    const q = query(
                        colRef,
                        where('equipo', '==', get(idxEquipo)),
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
            } catch (e) {
                console.warn('No se pudieron leer fechas de actividad para la inspección', e);
            }

            // Usuario actual (correo) para registrar quién hizo la inspección
            let usuarioInspeccion = '';
            try {
                if (window.auth && window.auth.currentUser && window.auth.currentUser.email) {
                    usuarioInspeccion = String(window.auth.currentUser.email).toLowerCase();
                }
            } catch (e) {
                console.warn('No se pudo leer el usuario actual para la inspección', e);
            }

            const registro = {
                fecha: new Date().toISOString(),
                equipo: get(idxEquipo),
                producto: get(idxProducto),
                serial: get(idxSerial),
                descripcion: get(idxDescripcion),
                reporte: get(idxReporte),
                parametros: parametrosCapturados,
                fechaEmbarque,
                inicioServicio,
                terminacionServicio,
                cliente,
                areaCliente,
                ubicacion,
                usuarioInspeccion,
                actividadId,
                observaciones: observacionesResumen,
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

            // También guardar en Firestore para que las inspecciones sean visibles en cualquier dispositivo
            try {
                const { getFirestore, collection, addDoc, serverTimestamp } = await import(
                    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                );

                const db = getFirestore();
                const colRef = collection(db, 'inspecciones');
                const payload = {
                    ...registro,
                    creadoEn: serverTimestamp(),
                };
                await addDoc(colRef, payload);
            } catch (e) {
                console.warn('No se pudo guardar la inspección en Firestore, solo local:', e);
            }

            // Mensaje visible de confirmación en el panel de detalle
            const panelDetalle = document.getElementById('detalle-equipo');
            if (panelDetalle && panelDetalle.scrollIntoView) {
                panelDetalle.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            inputEquipo.value = '';
            detalleContenedor.innerHTML = `
                <div style="padding:0.9rem 1rem; border-radius:0.75rem; border:1px solid #22c55e; background:#ecfdf5; text-align:center; font-size:1rem; font-weight:600; color:#166534; margin-bottom:0.5rem;">
                    Inspección guardada
                </div>
                <p style="font-size:0.85rem; color:#4b5563; text-align:center;">
                    Seleccione otro equipo para realizar una nueva inspección.
                </p>
            `;

            // Deshabilitar botón hasta que se seleccione otro equipo
            btnGuardar.textContent = 'Guardar inspección';
            btnGuardar.disabled = true;

            guardandoInspeccion = false;
        });
    }
});
