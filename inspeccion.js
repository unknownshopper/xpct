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
    const fotosTomadas = {}; // idx -> { blob }

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
                // Intento 1: coincidencia exacta
                const qExact = query(colRef, where('equipo', '==', equipoId));
                let snap = await getDocs(qExact);
                let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                if (rows && rows.length) return rows;

                // Fallback: cargar todas y filtrar por normalización (trim + case-insensitive)
                snap = await getDocs(colRef);
                const norm = (s) => (s || '').toString().trim().toUpperCase();
                const target = norm(equipoId);
                rows = snap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(r => norm(r.equipo) === target);
                return rows;
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

        // Duplicar 'Área de sellado' -> 'Área de sellado A' y 'Área de sellado B' para productos aplicables (CA, CE, DSA, Brida de paso)
        const productoStr = (get(idxProducto) || '').toString().toUpperCase();
        const aplicaCaraAB = /CARRETE ADAPTADOR|CARRETE ESPACIADOR|BRIDA ADAPTADORA|BRIDA DE PASO|\bXO\b/.test(productoStr);
        const norm = (s) => (s || '')
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
        const parametrosRender = (() => {
            if (!aplicaCaraAB) return parametrosInspeccion.slice();
            const out = [];
            parametrosInspeccion.forEach(p => {
                const np = norm(p);
                if (np.startsWith('area de sellado')) {
                    out.push('Área de sellado A');
                    out.push('Área de sellado B');
                } else {
                    out.push(p);
                }
            });
            return out;
        })();

        // Diagnóstico: detectar parámetros sin match en danos.csv (normalizado)
        (function diagnosticarCoberturaDanos() {
            if (!Array.isArray(mapaDanos) || !mapaDanos.length) return;
            const normalize = (s) => (s || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim();
            const faltantes = [];
            parametrosRender.forEach(p => {
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

            // Fleje: usar BUENO/MALO y si es MALO, permitir seleccionar tipo de daño
            if (base.includes('fleje')) {
                return [
                    '',
                    'DEFORMADO',
                    'NO LEGIBLE',
                    'SIN FLEJE'
                ];
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

            // Recubrimiento (según catálogo proporcionado)
            if (base.includes('recubrimiento')) {
                return [
                    '',
                    'DESPRENDIDO',
                    'AMPOLLADO',
                    'CORROSION',
                    'OXIDACION',
                    'DEGRADADO',
                    'ABRASION',
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

        const parametrosHtml = parametrosRender.length
            ? `
                <div class="parametros-inspeccion">
                    <h3>Parámetros de inspección (${reporte})</h3>
                    <div class="parametros-tabla">
                        <div class="parametros-header">
                            <div class="col-nombre">Parámetro</div>
                            <div class="col-estado">Estado</div>
                            <div class="col-dano">Tipo de daño</div>
                            <div class="col-evidencia">Evidencia</div>
                        </div>
                        ${parametrosRender.map((p, idx) => {
                            const baseNombre = (p || '').toLowerCase();
                            // Caso especial: Recubrimiento no lleva selector de daños, solo BUENO/MALO
                            if (baseNombre.includes('recubrimiento')) {
                                return `
                            <div class="parametros-fila">
                                <div class="col-nombre">${p}</div>
                                <div class="col-estado">
                                    <label><input type="radio" name="param-${idx}-estado" value="BUENO" checked> BUENO</label>
                                    <label><input type="radio" name="param-${idx}-estado" value="MALO"> MALO</label>
                                </div>
                                <div class="col-dano" data-param-idx="${idx}" style="display:none;"></div>
                                <div class="col-evidencia" data-param-idx="${idx}" style="display:none;">
                                    <button type="button" class="btn btn-tomar-foto" data-idx="${idx}">Tomar foto</button>
                                    <input type="file" name="param-${idx}-foto" accept="image/*" capture="environment" style="display:none;">
                                    <img alt="preview" id="preview-foto-${idx}" style="display:none; max-height:64px; border-radius:6px; margin-top:4px; border:1px solid #e5e7eb;" />
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
                                        ${tiposDano.map(op => op ? `<option value="${op}">${op}</option>` : '<option value="">Daños</option>').join('')}
                                    </select>
                                    <input type="text" name="param-${idx}-dano-otro" placeholder="Describa el hallazgo" style="display:none; margin-top:0.25rem; font-size:0.8rem; width:100%;" disabled>
                                </div>
                                <div class="col-evidencia" data-param-idx="${idx}" style="display:none;">
                                    <button type="button" class="btn btn-tomar-foto" data-idx="${idx}">Tomar foto</button>
                                    <input type="file" name="param-${idx}-foto" accept="image/*" capture="environment" style="display:none;">
                                    <img alt="preview" id="preview-foto-${idx}" style="display:none; max-height:64px; border-radius:6px; margin-top:4px; border:1px solid #e5e7eb;" />
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

        // Mostrar selector de daño y evidencia solo cuando el estado sea MALO
        detalleContenedor.querySelectorAll('.parametros-fila').forEach((filaHtml, idx) => {
            const radios = filaHtml.querySelectorAll(`input[name="param-${idx}-estado"]`);
            const colDano = filaHtml.querySelector('.col-dano');
            const selectDano = colDano ? colDano.querySelector('select') : null;
            const inputOtro = colDano ? colDano.querySelector(`input[name="param-${idx}-dano-otro"]`) : null;
            const colEvid = filaHtml.querySelector('.col-evidencia');
            const inputFoto = colEvid ? colEvid.querySelector(`input[name="param-${idx}-foto"]`) : null;
            const btnTomar = colEvid ? colEvid.querySelector('.btn-tomar-foto') : null;
            const imgPrev = document.getElementById(`preview-foto-${idx}`);

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
                let estado = '';
                radios.forEach(r => { if (r.checked) estado = r.value; });
                if (estado === 'MALO') {
                    if (colDano) colDano.style.display = '';
                    if (selectDano) {
                        selectDano.disabled = false;
                        actualizarVisibilidadOtro();
                    }
                    if (colEvid) {
                        colEvid.style.display = '';
                        if (inputFoto) inputFoto.disabled = false;
                        if (btnTomar) btnTomar.disabled = false;
                    }
                } else {
                    if (colDano) colDano.style.display = 'none';
                    if (selectDano) {
                        selectDano.disabled = true;
                        selectDano.value = '';
                    }
                    if (inputOtro) {
                        inputOtro.style.display = 'none';
                        inputOtro.disabled = true;
                        inputOtro.value = '';
                    }
                    if (colEvid) {
                        colEvid.style.display = 'none';
                        if (inputFoto) { inputFoto.disabled = true; try { inputFoto.value = ''; } catch {} }
                        if (btnTomar) btnTomar.disabled = true;
                        if (imgPrev) { imgPrev.src = ''; imgPrev.style.display = 'none'; }
                        delete fotosTomadas[idx];
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

            // Handler para tomar foto con cámara
            if (btnTomar) {
                btnTomar.addEventListener('click', async () => {
                    try {
                        await abrirCamaraParaIndice(idx, (blob) => {
                            fotosTomadas[idx] = { blob };
                            if (imgPrev) {
                                imgPrev.src = URL.createObjectURL(blob);
                                imgPrev.style.display = '';
                            }
                        });
                    } catch (e) {
                        console.warn('No se pudo capturar foto', e);
                    }
                });
            }
        });

        // Función para abrir la cámara y capturar una foto
        async function abrirCamaraParaIndice(idx, onCapture) {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert('La cámara no está disponible en este dispositivo/navegador.');
                throw new Error('getUserMedia no soportado');
            }
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;';
            const box = document.createElement('div');
            box.style.cssText = 'background:#fff;padding:12px;border-radius:10px;max-width:90vw;width:520px;';
            const video = document.createElement('video');
            video.autoplay = true; video.playsInline = true;
            video.style.cssText = 'width:100%;border-radius:8px;background:#000;';
            const ctrls = document.createElement('div');
            ctrls.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px;';
            const btnCancel = document.createElement('button'); btnCancel.textContent = 'Cancelar';
            const btnSnap = document.createElement('button'); btnSnap.textContent = 'Capturar';
            ctrls.appendChild(btnCancel); ctrls.appendChild(btnSnap);
            box.appendChild(video); box.appendChild(ctrls); overlay.appendChild(box); document.body.appendChild(overlay);

            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
            video.srcObject = stream;
            function stop() { try { stream.getTracks().forEach(t => t.stop()); } catch {}; document.body.removeChild(overlay); }
            btnCancel.onclick = () => stop();
            btnSnap.onclick = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob((blob) => { if (blob) onCapture(blob); stop(); }, 'image/jpeg', 0.9);
                } catch { stop(); }
            };
        }

        if (btnGuardar) btnGuardar.disabled = false;

        // Mostrar estado de pruebas/calibraciones para este equipo
        mostrarEstadoPruebasEnDetalle(valor);
    }

    inputEquipo.addEventListener('change', actualizarDetalleDesdeInput);
    inputEquipo.addEventListener('blur', actualizarDetalleDesdeInput);

    // Exportar ejemplo JPG del panel de detalle (sin guardar en base de datos)
    const btnExportarJpg = document.getElementById('btn-exportar-jpg');
    if (btnExportarJpg) {
        btnExportarJpg.addEventListener('click', async () => {
            try {
                const equipoSel = (document.getElementById('equipo-input')?.value || '').trim();
                if (!equipoSel) { alert('Selecciona un equipo antes de exportar.'); return; }
                const tipoSelVal = (document.getElementById('inspeccion-tipo')?.value || '').trim();
                if (!tipoSelVal) { alert('Selecciona el Tipo de inspección antes de exportar.'); return; }
                const panel = document.getElementById('detalle-equipo-contenido');
                if (!panel) return;
                // Verificar que haya parámetros renderizados
                if (!panel.querySelector('.parametros-inspeccion')) {
                    alert('Primero genera la inspección del equipo (parámetros) para exportar el ejemplo.');
                    return;
                }
                // Cargar html2canvas si no está presente
                async function ensureHtml2Canvas() {
                    if (window.html2canvas) return;
                    await new Promise((resolve, reject) => {
                        const s = document.createElement('script');
                        s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
                        s.onload = resolve;
                        s.onerror = reject;
                        document.head.appendChild(s);
                    });
                }

                async function ensureJsPDF() {
                    if (window.jspdf && window.jspdf.jsPDF) return;
                    await new Promise((resolve, reject) => {
                        const s = document.createElement('script');
                        s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
                        s.onload = resolve;
                        s.onerror = reject;
                        document.head.appendChild(s);
                    });
                }

                await ensureHtml2Canvas();

                // Construir un wrapper temporal con encabezado (usuario, fecha/hora, ubicación) + contenido de inspección
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'background:#ffffff; color:#111827; padding:24px; width:794px; max-width:100%; font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu;';

                const logoWrap = document.createElement('div');
                logoWrap.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:10px;';
                const logo = document.createElement('img');
                logo.src = 'img/logopctch.png';
                logo.alt = 'PCT';
                logo.style.cssText = 'height:40px; width:auto; display:block;';
                logo.crossOrigin = 'anonymous';
                logoWrap.appendChild(logo);

                const headerRight = document.createElement('div');
                headerRight.style.cssText = 'text-align:right; line-height:1.2;';
                headerRight.innerHTML = `
                    <div style="font-weight:700; font-size:14px; letter-spacing:0.2px;">PCT</div>
                    <div style="font-size:11px; color:#6b7280;">Reporte de inspección</div>
                `;
                logoWrap.appendChild(headerRight);
                wrapper.appendChild(logoWrap);

                const titleBar = document.createElement('div');
                titleBar.style.cssText = 'border-top:2px solid #111827; border-bottom:1px solid #e5e7eb; padding:10px 0; margin-bottom:12px;';
                titleBar.innerHTML = `
                    <div style="font-size:16px; font-weight:800;">REPORTE DE INSPECCIÓN</div>
                    <div style="font-size:12px; color:#4b5563; margin-top:2px;">Formato de evidencia y control de condición del equipo</div>
                `;
                wrapper.appendChild(titleBar);

                await new Promise((resolve) => {
                    try {
                        if (logo.complete) { resolve(); return; }
                        logo.onload = () => resolve();
                        logo.onerror = () => resolve();
                    } catch {
                        resolve();
                    }
                });

                const encabezado = document.createElement('div');
                encabezado.style.cssText = 'font-size:12px; margin-bottom:12px; border:1px solid #e5e7eb; border-radius:10px; padding:12px; background:#f9fafb;';

                // Datos de encabezado
                const ahora = new Date();
                const dd = String(ahora.getDate()).padStart(2, '0');
                const mm = String(ahora.getMonth() + 1).padStart(2, '0');
                const yy = String(ahora.getFullYear()).slice(-2);
                const HH = String(ahora.getHours()).padStart(2, '0');
                const MM = String(ahora.getMinutes()).padStart(2, '0');
                const fechaSafe = `${dd}-${mm}-${yy}`;
                const horaSafe = `${HH}:${MM}`;
                const equipo = equipoSel || 'SIN_EQUIPO';
                const tipoInspeccionSel = (document.getElementById('inspeccion-tipo')?.value || '').toString();
                let usuario = '';
                try { usuario = (window.auth?.currentUser?.email || '').toLowerCase(); } catch {}

                // Calcular resultado (sin guardar): si existe al menos un parámetro en MALO => NO APROBADA
                let totalParametros = 0;
                let totalMalos = 0;
                const listaMalos = [];
                try {
                    const filasO = panel.querySelectorAll('.parametros-fila');
                    totalParametros = filasO.length;
                    filasO.forEach((fila, i) => {
                        const nombre = fila.querySelector('.col-nombre')?.textContent?.trim() || `Parámetro ${i + 1}`;
                        const sel = fila.querySelector(`input[name="param-${i}-estado"]:checked`);
                        const estado = sel ? String(sel.value || '').toUpperCase() : '';
                        if (estado === 'MALO') {
                            totalMalos += 1;
                            listaMalos.push(nombre);
                        }
                    });
                } catch {}
                const resultadoInspeccion = totalMalos > 0 ? 'NO APROBADA' : 'APROBADA';
                const colorResultado = totalMalos > 0 ? '#b91c1c' : '#166534';
                const bgResultado = totalMalos > 0 ? '#fef2f2' : '#ecfdf5';

                // Capturar geolocalización: esperar a que el usuario autorice o rechace
                const gps = await (async () => {
                    if (!navigator.geolocation) return 'Sin GPS';
                    function toStr(pos) {
                        const { latitude, longitude, accuracy } = pos.coords || {};
                        return (latitude != null && longitude != null)
                            ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}${accuracy?` (±${Math.round(accuracy)}m)`:''}`
                            : 'Sin GPS';
                    }
                    const getPosition = () => new Promise(resolve => {
                        navigator.geolocation.getCurrentPosition(
                            (pos) => resolve(toStr(pos)),
                            () => resolve('Sin GPS'),
                            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
                        );
                    });
                    try {
                        if (navigator.permissions && navigator.permissions.query) {
                            const status = await navigator.permissions.query({ name: 'geolocation' });
                            if (status.state === 'denied') return 'Sin GPS';
                            // 'granted' o 'prompt': esperar respuesta del usuario/OS
                            return await getPosition();
                        }
                        return await getPosition();
                    } catch {
                        return await getPosition();
                    }
                })();

                encabezado.innerHTML = `
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px 16px; align-items:start;">
                        <div>
                            <div style="margin-bottom:8px;">
                                <span style="display:inline-block; padding:6px 10px; border-radius:999px; border:1px solid #e5e7eb; background:${bgResultado}; color:${colorResultado}; font-weight:800; letter-spacing:0.2px;">
                                    RESULTADO: ${resultadoInspeccion}
                                </span>
                            </div>
                            <div style="margin-bottom:4px;"><strong>Equipo:</strong> ${equipo}</div>
                            ${tipoInspeccionSel ? `<div style="margin-bottom:4px;"><strong>Tipo de inspección:</strong> ${tipoInspeccionSel}</div>` : ''}
                            <div><strong>Ubicación:</strong> ${gps}</div>
                            <div style="margin-top:8px; color:#6b7280; font-size:11px; line-height:1.35;">
                                <strong>Criterio:</strong> Si existe al menos 1 parámetro en <strong>MALO</strong>, la inspección se considera <strong>NO APROBADA</strong>.
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="margin-bottom:4px;"><strong>Fecha:</strong> ${dd}/${mm}/20${yy}</div>
                            <div style="margin-bottom:4px;"><strong>Hora:</strong> ${horaSafe} hrs</div>
                            ${usuario ? `<div><strong>Usuario:</strong> ${usuario}</div>` : ''}
                            <div style="margin-top:8px; font-size:11px; color:#4b5563;">
                                <div><strong>Parámetros:</strong> ${totalParametros}</div>
                                <div><strong>En MALO:</strong> ${totalMalos}</div>
                                ${totalMalos > 0 ? `<div style="margin-top:4px; color:#991b1b;"><strong>Hallazgos:</strong> ${listaMalos.slice(0, 6).join(', ')}${listaMalos.length > 6 ? '…' : ''}</div>` : ''}
                            </div>
                        </div>
                    </div>
                `;

                const contenidoClonado = panel.cloneNode(true);
                contenidoClonado.style.backgroundColor = '#ffffff';
                contenidoClonado.style.overflow = 'visible';

                // Normalizar contenido para testimonio: mostrar estados/daños como texto y ocultar controles de evidencia
                try {
                    const filasOriginal = panel.querySelectorAll('.parametros-fila');
                    const filasClon = contenidoClonado.querySelectorAll('.parametros-fila');
                    // Quitar columna 'Evidencia' del header en el clon
                    const headerClon = contenidoClonado.querySelector('.parametros-header');
                    if (headerClon) {
                        const evidHead = headerClon.querySelector('.col-evidencia');
                        if (evidHead && evidHead.parentNode) evidHead.parentNode.removeChild(evidHead);
                    }
                    filasClon.forEach((filaC, i) => {
                        const filaO = filasOriginal[i];
                        if (!filaO) return;
                        // Estado seleccionado
                        const estadoSel = filaO.querySelector(`input[name="param-${i}-estado"]:checked`);
                        const estadoVal = estadoSel ? String(estadoSel.value || '').toUpperCase() : '';
                        const colEstadoC = filaC.querySelector('.col-estado');
                        if (colEstadoC) {
                            colEstadoC.innerHTML = estadoVal || '';
                        }
                        // Tipo de daño seleccionado y detalle 'OTRO'
                        const selDanoO = filaO.querySelector(`select[name="param-${i}-dano"]`);
                        const danoVal = selDanoO ? (selDanoO.value || '') : '';
                        const inputOtroO = filaO.querySelector(`input[name="param-${i}-dano-otro"]`);
                        const otroVal = inputOtroO ? (inputOtroO.value || '').trim() : '';
                        const colDanoC = filaC.querySelector('.col-dano');
                        if (colDanoC) {
                            if (estadoVal === 'MALO') {
                                const texto = (otroVal || danoVal || '').toString();
                                colDanoC.style.display = '';
                                colDanoC.innerHTML = texto ? texto : '';
                            } else {
                                colDanoC.style.display = 'none';
                                colDanoC.innerHTML = '';
                            }
                        }
                        // Eliminar columna evidencia y controles en el clon
                        const colEvidC = filaC.querySelector('.col-evidencia');
                        if (colEvidC && colEvidC.parentNode) {
                            colEvidC.parentNode.removeChild(colEvidC);
                        }

                        // Insertar miniatura de evidencia si existe (solo si estado es MALO)
                        if (estadoVal === 'MALO') {
                            const blobCam = (typeof fotosTomadas !== 'undefined' && fotosTomadas[i] && fotosTomadas[i].blob) ? fotosTomadas[i].blob : null;
                            const inputArchivo = filaO.querySelector(`input[name="param-${i}-foto"]`);
                            const fileSel = inputArchivo && inputArchivo.files && inputArchivo.files[0] ? inputArchivo.files[0] : null;
                            const fuente = blobCam || fileSel;
                            if (fuente) {
                                const url = URL.createObjectURL(fuente);
                                const evidenciaDiv = document.createElement('div');
                                evidenciaDiv.className = 'col-evidencia-print';
                                evidenciaDiv.style.cssText = 'grid-column: 1 / -1; margin-top: 6px;';
                                const img = document.createElement('img');
                                img.src = url;
                                img.alt = 'Evidencia';
                                img.style.cssText = 'max-height:120px; border-radius:8px; border:1px solid #e5e7eb;';
                                evidenciaDiv.appendChild(img);
                                filaC.appendChild(evidenciaDiv);
                                // Nota: no revocamos inmediatamente para no invalidar antes de html2canvas; el GC lo limpiará luego.
                            }
                        }
                    });
                } catch {}

                wrapper.appendChild(encabezado);
                wrapper.appendChild(contenidoClonado);

                // Agregar el panel de 'Estado de pruebas' si existe y está visible
                const panelEstado = document.getElementById('panel-estado-pruebas');
                if (panelEstado && panelEstado.style.display !== 'none') {
                    const estadoClonado = panelEstado.cloneNode(true);
                    estadoClonado.style.marginTop = '12px';
                    wrapper.appendChild(estadoClonado);
                }
                document.body.appendChild(wrapper);

                // Preparar rangos (en px CSS) de elementos que NO deben cortarse entre páginas
                // Nota: html2canvas escala el canvas; convertimos estos rangos a px del canvas después de capturar.
                const wrapperWidthCss = wrapper.offsetWidth || 1;
                const avoidRangesCss = (() => {
                    try {
                        const wrapRect = wrapper.getBoundingClientRect();
                        const selectors = [
                            '.parametros-header',
                            '.parametros-fila',
                            '.col-evidencia-print',
                            '.col-evidencia-print img',
                            'h3',
                            '#panel-estado-pruebas',
                            'img'
                        ];
                        const nodes = wrapper.querySelectorAll(selectors.join(','));
                        const ranges = [];
                        nodes.forEach((el) => {
                            const r = el.getBoundingClientRect();
                            const start = Math.max(0, r.top - wrapRect.top);
                            const end = Math.max(0, r.bottom - wrapRect.top);
                            const h = end - start;
                            // Ignorar rangos demasiado pequeños para no generar ruido
                            if (h >= 24) ranges.push({ start, end });
                        });
                        ranges.sort((a, b) => a.start - b.start);
                        // Merge de rangos superpuestos
                        const merged = [];
                        for (const rg of ranges) {
                            const last = merged[merged.length - 1];
                            if (!last || rg.start > last.end) {
                                merged.push({ start: rg.start, end: rg.end });
                            } else {
                                last.end = Math.max(last.end, rg.end);
                            }
                        }
                        return merged;
                    } catch {
                        return [];
                    }
                })();

                const canvas = await window.html2canvas(wrapper, {
                    backgroundColor: '#ffffff',
                    scale: 2,
                    useCORS: true,
                });
                const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

                // Limpiar wrapper temporal
                document.body.removeChild(wrapper);

                await ensureJsPDF();

                const fileName = `${equipo}-${fechaSafe}.pdf`;

                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

                const pageWidthMm = pdf.internal.pageSize.getWidth();
                const pageHeightMm = pdf.internal.pageSize.getHeight();

                const marginMm = 10;
                const usableWidthMm = pageWidthMm - marginMm * 2;
                const footerReserveMm = 10;
                const usableHeightMm = pageHeightMm - marginMm * 2 - footerReserveMm;

                const pxPerMm = canvas.width / usableWidthMm;
                const pageHeightPx = Math.floor(usableHeightMm * pxPerMm);

                const totalPages = Math.max(1, Math.ceil(canvas.height / pageHeightPx));

                const scaleFactor = canvas.width / wrapperWidthCss;
                const avoidRanges = avoidRangesCss.map(r => ({
                    start: Math.floor(r.start * scaleFactor),
                    end: Math.ceil(r.end * scaleFactor)
                }));

                function nextSafeBreak(yStart, yTarget) {
                    const minSlice = Math.max(220, Math.floor(pageHeightPx * 0.25));
                    const target = Math.min(yTarget, canvas.height);
                    if (!avoidRanges.length) return target;

                    // Si el target cae dentro de un rango a evitar, intentar romper antes (inicio del rango)
                    // o después (fin del rango) si el inicio queda demasiado cerca del comienzo de página.
                    for (const rg of avoidRanges) {
                        if (rg.start < target && rg.end > target) {
                            const before = rg.start;
                            const after = rg.end;

                            // Nunca permitir un slice mayor que la altura de página.
                            // Si el bloque completo no cabe, forzar el corte ANTES del bloque para no partirlo.
                            if (after - yStart > pageHeightPx) {
                                if (before > yStart) return before;
                                return target;
                            }

                            if (before - yStart >= minSlice) return before;
                            // Aunque quede poco espacio, preferimos cortar antes para evitar que el bloque se "coma" la página
                            if (before > yStart) return before;
                            if (after - yStart >= minSlice) return Math.min(after, canvas.height);
                            return target;
                        }
                    }

                    // Si no cae dentro, también evitamos romper justo encima de un bloque grande:
                    // buscar el siguiente bloque que empieza poco antes del target y empujarlo a la siguiente página.
                    const threshold = Math.floor(pageHeightPx * 0.12);
                    for (const rg of avoidRanges) {
                        if (rg.start >= yStart && rg.start <= target && (target - rg.start) <= threshold) {
                            if (rg.start - yStart >= minSlice) return rg.start;
                        }
                    }

                    return target;
                }

                let yPx = 0;
                let pageIndex = 0;
                while (yPx < canvas.height) {
                    pageIndex += 1;
                    const yTarget = yPx + pageHeightPx;
                    let yEnd = nextSafeBreak(yPx, yTarget);
                    if (yEnd <= yPx) yEnd = Math.min(yTarget, canvas.height);
                    // Asegurar que el corte nunca exceda el alto útil de página
                    yEnd = Math.min(yEnd, yPx + pageHeightPx, canvas.height);
                    const sliceHeightPx = Math.min(yEnd - yPx, canvas.height - yPx);
                    const pageCanvas = document.createElement('canvas');
                    pageCanvas.width = canvas.width;
                    pageCanvas.height = sliceHeightPx;
                    const pageCtx = pageCanvas.getContext('2d');
                    pageCtx.fillStyle = '#ffffff';
                    pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
                    pageCtx.drawImage(canvas, 0, yPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

                    const pageDataUrl = pageCanvas.toDataURL('image/jpeg', 0.92);
                    const imgHeightMm = (sliceHeightPx / pxPerMm);

                    if (yPx > 0) pdf.addPage();
                    pdf.addImage(pageDataUrl, 'JPEG', marginMm, marginMm, usableWidthMm, imgHeightMm);

                    // Footer: línea + texto + paginación
                    try {
                        const footerY = pageHeightMm - 6;
                        pdf.setDrawColor(229, 231, 235);
                        pdf.line(marginMm, footerY - 3, pageWidthMm - marginMm, footerY - 3);

                        pdf.setFontSize(9);
                        pdf.setTextColor(107, 114, 128);
                        pdf.text('PCT | Reporte de inspección', marginMm, footerY);

                        const pageLabel = `Página ${pageIndex} de ${totalPages}`;
                        const pageLabelW = pdf.getTextWidth(pageLabel);
                        pdf.text(pageLabel, pageWidthMm - marginMm - pageLabelW, footerY);
                    } catch {}

                    yPx += sliceHeightPx;
                }

                pdf.save(fileName);
            } catch (e) {
                console.warn('No se pudo exportar el PDF:', e);
            }
        });
    }

    if (btnGuardar) {
        btnGuardar.addEventListener('click', async () => {
            if (guardandoInspeccion) return;
            guardandoInspeccion = true;
            const valor = inputEquipo.value.trim();
            if (!valor) { guardandoInspeccion = false; return; }

            // Validar Tipo de inspección (requerido)
            const selTipo = document.getElementById('inspeccion-tipo');
            const tipoInspeccion = selTipo ? String(selTipo.value || '').trim().toUpperCase() : '';
            if (!tipoInspeccion) {
                alert('Selecciona el Tipo de inspección');
                guardandoInspeccion = false;
                return;
            }

            const idxEquipo = headers.indexOf('EQUIPO / ACTIVO');
            const idxReporte = headers.indexOf('REPORTE P/P');
            const fila = equipos.find(cols => idxEquipo >= 0 && cols[idxEquipo] === valor);
            if (!fila) { guardandoInspeccion = false; return; }

            const idxProducto = headers.indexOf('PRODUCTO');
            const idxSerial = headers.indexOf('SERIAL');
            const idxDescripcion = headers.indexOf('DESCRIPCION');

            const get = (idx) => (idx >= 0 && idx < fila.length ? fila[idx] : '');

            const parametrosCapturados = [];
            const fotosParaSubir = [];
            const filas = document.querySelectorAll('.parametros-fila');
            filas.forEach((filaHtml, idx) => {
                const nombre = filaHtml.querySelector('.col-nombre')?.textContent?.trim() || '';
                const estadoInput = filaHtml.querySelector(`input[name="param-${idx}-estado"]:checked`);
                const estado = estadoInput ? estadoInput.value : '';
                const danoSelect = filaHtml.querySelector(`select[name="param-${idx}-dano"]`);
                const tipoDano = danoSelect ? danoSelect.value : '';
                const inputOtro = filaHtml.querySelector(`input[name="param-${idx}-dano-otro"]`);
                const detalleOtro = inputOtro ? (inputOtro.value || '').trim() : '';
                const inputFoto = filaHtml.querySelector(`input[name="param-${idx}-foto"]`);
                let evidenciaNombre = '';
                if (estado && estado.toUpperCase() === 'MALO') {
                    const fotoBlob = (fotosTomadas[idx]?.blob) || (inputFoto && inputFoto.files && inputFoto.files[0]) || null;
                    if (fotoBlob) {
                        // Nombre de evidencia: EQUIPO+FECHA (DD-MM-YY)
                        const ahora = new Date();
                        const dd = String(ahora.getDate()).padStart(2, '0');
                        const mm = String(ahora.getMonth() + 1).padStart(2, '0');
                        const yy = String(ahora.getFullYear()).slice(-2);
                        const fechaSafe = `${dd}-${mm}-${yy}`;
                        const equipoId = get(idxEquipo) || 'SIN_EQUIPO';
                        evidenciaNombre = `${equipoId}-${fechaSafe}.jpg`;
                        fotosParaSubir.push({ idx, nombre, file: fotoBlob, evidenciaNombre });
                    }
                }
                parametrosCapturados.push({ nombre, estado, tipoDano, detalleOtro, hasEvidencia: !!evidenciaNombre, evidenciaNombre });
            });

            // Validaciones requeridas por parámetro
            for (let i = 0; i < parametrosCapturados.length; i++) {
                const p = parametrosCapturados[i];
                if (!p.estado) {
                    alert(`Selecciona el estado para el parámetro: ${p.nombre}`);
                    guardandoInspeccion = false;
                    return;
                }
                if (p.estado.toUpperCase() === 'MALO') {
                    if (!p.tipoDano) {
                        alert(`Selecciona el tipo de daño para: ${p.nombre}`);
                        guardandoInspeccion = false;
                        return;
                    }
                    if (p.tipoDano.toUpperCase() === 'OTRO' && !p.detalleOtro) {
                        alert(`Describe el hallazgo en 'OTRO' para: ${p.nombre}`);
                        guardandoInspeccion = false;
                        return;
                    }
                    // Foto obligatoria cuando el parámetro es MALO
                    const inputFoto = document.querySelector(`input[name="param-${i}-foto"]`);
                    const tieneFoto = !!(fotosTomadas[i]?.blob || (inputFoto && inputFoto.files && inputFoto.files[0]));
                    if (!tieneFoto) {
                        alert(`Adjunta fotografía de evidencia para: ${p.nombre}`);
                        guardandoInspeccion = false;
                        return;
                    }
                }
            }

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
                tipoInspeccion,
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

            // Carga opcional a Dropbox si hay configuración
            (async () => {
                try {
                    const cfg = (window.dropboxConfig || {});
                    const token = (cfg.accessToken || '').trim();
                    const basePath = (cfg.basePath || '/inspecciones');
                    if (!token) return;

                    const ts = new Date();
                    const y = ts.getFullYear();
                    const m = String(ts.getMonth() + 1).padStart(2, '0');
                    const d = String(ts.getDate()).padStart(2, '0');
                    const hh = String(ts.getHours()).padStart(2, '0');
                    const mmn = String(ts.getMinutes()).padStart(2, '0');
                    const ss = String(ts.getSeconds()).padStart(2, '0');
                    const stamp = `${y}${m}${d}-${hh}${mmn}${ss}`;

                    const carpeta = `${basePath}/${registro.equipo || 'SIN_EQUIPO'}/${stamp}`;

                    async function subirArchivo(ruta, blob) {
                        const args = { path: ruta, mode: 'add', autorename: true, mute: false, strict_conflict: false };
                        const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/octet-stream',
                                'Dropbox-API-Arg': JSON.stringify(args),
                            },
                            body: blob,
                        });
                        if (!res.ok) throw new Error('Dropbox upload falló');
                    }

                    const jsonBlob = new Blob([JSON.stringify(registro, null, 2)], { type: 'application/json' });
                    await subirArchivo(`${carpeta}/inspeccion.json`, jsonBlob);

                    for (const f of fotosParaSubir) {
                        await subirArchivo(`${carpeta}/${f.evidenciaNombre || ('foto-' + f.idx + '.jpg')}`, f.file);
                    }
                } catch (e) {
                    console.warn('No se pudieron subir archivos a Dropbox (opcional):', e);
                }
            })();

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
