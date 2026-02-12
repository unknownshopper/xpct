// Listado completo del inventario en invre.html
document.addEventListener('DOMContentLoaded', () => {
    const tablaInvre = document.getElementById('tabla-invre');
    const thead = document.getElementById('thead-invre');
    const tbody = document.getElementById('tbody-invre');
    const wrapper = document.querySelector('.tabla-invre-wrapper');
    const inputFiltroTexto = document.getElementById('invre-filtro-texto');
    const selectFiltroReporte = document.getElementById('invre-filtro-reporte');
    const resumenBody = document.getElementById('invre-resumen-body');
    const pickInput = document.getElementById('invre-pick-input');
    const pickDropdown = document.getElementById('invre-pick-dropdown');
    const pickQty = document.getElementById('invre-pick-qty');
    const pickAdd = document.getElementById('invre-pick-add');
    const pickSteps = document.getElementById('invre-pick-steps');
    const pickSelectedWrap = document.getElementById('invre-pick-selected');
    const pickCart = document.getElementById('invre-pick-cart');
    const pickCopy = document.getElementById('invre-pick-copy');
    const pickClear = document.getElementById('invre-pick-clear');
    const invreModal = document.getElementById('invre-modal');
    const invreModalTitle = document.getElementById('invre-modal-title');
    const invreModalBody = document.getElementById('invre-modal-body');
    const invreModalClose = document.getElementById('invre-modal-cerrar');
    if (!tablaInvre || !thead || !tbody || !wrapper) return; // No estamos en invre.html

    // Guardia de acceso: invre solo para admin/director/supervisor (no inspector)
    (async () => {
        try {
            const auth = window.auth;
            if (!auth || !auth.currentUser) {
                // Si aún no hay sesión, delegar al flujo normal de login
                return;
            }
            const tok = await auth.currentUser.getIdTokenResult();
            const role = (tok && tok.claims && tok.claims.role) ? String(tok.claims.role) : '';
            const isAdmin = role === 'admin';
            const isDirector = role === 'director';
            const isSupervisor = role === 'supervisor';
            window.isAdmin = !!isAdmin;
            window.isDirector = !!isDirector;
            window.isSupervisor = !!isSupervisor;
            if (!(isAdmin || isDirector || isSupervisor)) {
                window.location.href = 'index.html';
            }
        } catch {
            // En caso de error, ser conservadores y no permitir acceso
            try { window.location.href = 'index.html'; } catch {}
        }
    })();

    function abrirModal(titulo, html) {
        if (!invreModal || !invreModalBody) return;
        try {
            if (invreModalTitle) invreModalTitle.textContent = titulo || '';
            invreModalBody.innerHTML = html || '';
            invreModal.style.display = 'flex';
        } catch {}
    }
    function cerrarModal() {
        if (!invreModal) return;
        try { invreModal.style.display = 'none'; } catch {}
    }
    if (invreModalClose) invreModalClose.addEventListener('click', () => cerrarModal());
    if (invreModal) {
        invreModal.addEventListener('click', (ev) => {
            if (ev.target === invreModal) cerrarModal();
        });
    }

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
            // Solo admin/director sincronizan overrides desde Firestore.
            // Supervisor opera en modo lectura y usa cache local (evita errores de permisos).
            let canSyncFromFirestore = false;
            try {
                const auth = window.auth;
                const u = auth && auth.currentUser ? auth.currentUser : null;
                if (u && typeof u.getIdTokenResult === 'function') {
                    const tok = await u.getIdTokenResult();
                    const role = (tok && tok.claims && tok.claims.role) ? String(tok.claims.role) : '';
                    canSyncFromFirestore = (role === 'admin' || role === 'director');
                } else {
                    canSyncFromFirestore = !!(window.isAdmin || window.isDirector);
                }
            } catch {
                canSyncFromFirestore = !!(window.isAdmin || window.isDirector);
            }

            if (canSyncFromFirestore && window.db) {
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
            const idxProducto = headersLocal.indexOf('PRODUCTO');
            const idxTipoEquipo = headersLocal.indexOf('TIPO EQUIPO');
            const idxDiam1 = headersLocal.indexOf('DIAMETRO 1');
            const idxTipo1 = headersLocal.indexOf('TIPO 1');
            const idxConexion1 = headersLocal.indexOf('CONEXIÓN 1');
            const idxPresion1 = headersLocal.indexOf('PRESION 1');
            const idxAL = headersLocal.indexOf('A / L');

            const getSpec4206_6206 = (cols) => {
                try {
                    if (!cols || !cols.length) return '';
                    const diam1 = idxDiam1 >= 0 ? String(cols[idxDiam1] || '').trim().toUpperCase() : '';
                    const tipo1 = idxTipo1 >= 0 ? String(cols[idxTipo1] || '').trim().toUpperCase() : '';
                    const d = diam1.replace(/\s+/g, '');
                    const t1 = tipo1.replace(/\s+/g, '');
                    if (t1 === '206' && d) {
                        if (d === '4' || d === '4.0' || d.startsWith('4')) return '4206';
                        if (d === '6' || d === '6.0' || d.startsWith('6')) return '6206';
                    }

                    // Fallback: inferir por código en SERIAL (ej. PCT-23-6206-90-001)
                    const serial = idxSerial >= 0 ? String(cols[idxSerial] || '').trim().toUpperCase() : '';
                    if (serial.includes('6206')) return '6206';
                    if (serial.includes('4206')) return '4206';

                    return '';
                } catch {
                    return '';
                }
            };

            const getEdoEfectivo = (cols) => {
                const equipo = idxEquipo >= 0 ? (cols[idxEquipo] || '') : '';
                let edoBase = idxEdo >= 0 ? String(cols[idxEdo] || '').trim().toUpperCase() : '';
                if (!edoBase) edoBase = 'ON';
                const override = equipo ? mapaEstadoOverride[equipo] : '';
                const edoEf = override ? String(override).trim().toUpperCase() : edoBase;
                return { equipo, edoBase, edoEf };
            };

            const resumenMap = new Map();
            const rowsPorCategoria = new Map();

            // Normalización para búsquedas
            const normalize = (s) => {
                return String(s || '')
                    .toUpperCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            };

            // Para selector por pasos
            const buildRowObj = (cols) => {
                const { edoEf } = getEdoEfectivo(cols);
                const producto = idxProducto >= 0 ? String(cols[idxProducto] || '').trim().toUpperCase() : '';
                const tipoEquipo = idxTipoEquipo >= 0 ? String(cols[idxTipoEquipo] || '').trim().toUpperCase() : '';
                const desc = idxDescripcion >= 0 ? String(cols[idxDescripcion] || '').trim().toUpperCase() : '';
                const rep = idxReporte >= 0 ? String(cols[idxReporte] || '').trim().toUpperCase() : '';
                const diam1 = idxDiam1 >= 0 ? String(cols[idxDiam1] || '').trim().toUpperCase() : '';
                const tipo1 = idxTipo1 >= 0 ? String(cols[idxTipo1] || '').trim().toUpperCase() : '';
                const con1 = idxConexion1 >= 0 ? String(cols[idxConexion1] || '').trim().toUpperCase() : '';
                const pres1 = idxPresion1 >= 0 ? String(cols[idxPresion1] || '').trim().toUpperCase() : '';
                const al = idxAL >= 0 ? String(cols[idxAL] || '').trim().toUpperCase() : '';
                const spec = getSpec4206_6206(cols);
                return {
                    cols,
                    edo: edoEf,
                    producto,
                    spec,
                    tipoEquipo,
                    diam1,
                    tipo1,
                    con1,
                    pres1,
                    al,
                    desc,
                    rep,
                };
            };

            const allRows = [];
            try { filasDatos.forEach(c => allRows.push(buildRowObj(c))); } catch {}
            const rebuildResumenData = () => {
                try {
                    resumenMap.clear();
                    rowsPorCategoria.clear();
                } catch {}
                try {
                    filasDatos.forEach(cols => {
                        if (!cols || !cols.length) return;
                        const { edoEf } = getEdoEfectivo(cols);
                        const producto = idxProducto >= 0 ? String(cols[idxProducto] || '').trim().toUpperCase() : '';
                        const tipoEquipo = idxTipoEquipo >= 0 ? String(cols[idxTipoEquipo] || '').trim().toUpperCase() : '';
                        const desc = idxDescripcion >= 0 ? String(cols[idxDescripcion] || '').trim().toUpperCase() : '';
                        const rep = idxReporte >= 0 ? String(cols[idxReporte] || '').trim().toUpperCase() : '';
                        const spec = getSpec4206_6206(cols);
                        const key = [producto, spec, tipoEquipo].filter(Boolean).join(' · ');
                        if (!key) return;

                        const st = resumenMap.get(key) || { total: 0, on: 0, off: 0, wip: 0 };
                        st.total += 1;
                        if (edoEf === 'ON') st.on += 1;
                        else if (edoEf === 'OFF') st.off += 1;
                        else if (edoEf === 'WIP') st.wip += 1;
                        resumenMap.set(key, st);

                        if (!rowsPorCategoria.has(key)) rowsPorCategoria.set(key, []);
                        rowsPorCategoria.get(key).push({
                            equipo: idxEquipo >= 0 ? String(cols[idxEquipo] || '').trim().toUpperCase() : '',
                            serial: idxSerial >= 0 ? String(cols[idxSerial] || '').trim().toUpperCase() : '',
                            spec,
                            producto,
                            tipoEquipo,
                            edo: edoEf,
                            desc,
                            rep,
                        });
                    });
                } catch {}
            };

            rebuildResumenData();

            const escHtml = (s) => {
                return String(s ?? '')
                    .replaceAll('&', '&amp;')
                    .replaceAll('<', '&lt;')
                    .replaceAll('>', '&gt;')
                    .replaceAll('"', '&quot;')
                    .replaceAll("'", '&#39;');
            };

            // Selector de equipos para actividad (carrito)
            const cartKey = 'pct_invre_pick_cart_v1';
            let pickCartItems = [];
            let selectedCatKey = '';

            // Selector por pasos
            let pickBaseTerm = '';
            let pickBaseCategoryKey = '';
            let pickStepState = { producto: '', spec: '', tipoEquipo: '', diam1: '', con1: '', pres1: '', al: '' };

            const parseResumenKey = (k) => {
                try {
                    const raw = String(k || '').trim();
                    const parts = raw.split('·').map(p => p.trim()).filter(Boolean);
                    const producto = (parts[0] || '').toUpperCase();
                    let spec = '';
                    let tipoEquipo = '';
                    if (parts.length === 2) {
                        tipoEquipo = (parts[1] || '').toUpperCase();
                    } else if (parts.length >= 3) {
                        const mid = (parts[1] || '').toUpperCase();
                        if (mid === '4206' || mid === '6206') spec = mid;
                        tipoEquipo = (parts[2] || '').toUpperCase();
                    }
                    return { producto, spec, tipoEquipo };
                } catch {
                    return { producto: '', spec: '', tipoEquipo: '' };
                }
            };

            const getBaseCandidates = () => {
                // Si se seleccionó una categoría del resumen, esa es la base
                if (pickBaseCategoryKey) {
                    const base = parseResumenKey(pickBaseCategoryKey);
                    return allRows.filter(r => {
                        if (base.producto && r.producto !== base.producto) return false;
                        if (base.spec && r.spec !== base.spec) return false;
                        if (base.tipoEquipo && r.tipoEquipo !== base.tipoEquipo) return false;
                        return true;
                    });
                }
                const term = normalize(pickBaseTerm);
                if (!term) return [];

                // Coincidencia por PRODUCTO (ej: TUBO), y fallback por DESCRIPCION/REPORTE
                return allRows.filter(r => {
                    const p = normalize(r.producto);
                    const d = normalize(r.desc);
                    const rep = normalize(r.rep);
                    return p.includes(term) || d.includes(term) || rep.includes(term);
                });
            };

            const applyStepFilters = (rows) => {
                return rows.filter(r => {
                    if (pickStepState.producto && r.producto !== pickStepState.producto) return false;
                    if (pickStepState.spec && r.spec !== pickStepState.spec) return false;
                    if (pickStepState.tipoEquipo && r.tipoEquipo !== pickStepState.tipoEquipo) return false;
                    if (pickStepState.diam1 && normalize(r.diam1) !== normalize(pickStepState.diam1)) return false;
                    if (pickStepState.con1 && normalize(r.con1) !== normalize(pickStepState.con1)) return false;
                    if (pickStepState.pres1 && normalize(r.pres1) !== normalize(pickStepState.pres1)) return false;
                    if (pickStepState.al && normalize(r.al) !== normalize(pickStepState.al)) return false;
                    return true;
                });
            };

            const uniqueValues = (rows, getter) => {
                const set = new Set();
                rows.forEach(r => {
                    const v = getter(r);
                    const val = (v ?? '').toString().trim();
                    if (val) set.add(val);
                });
                return Array.from(set);
            };

            const computeStatsForRows = (rows) => {
                let total = 0;
                let on = 0;
                rows.forEach(r => {
                    total += 1;
                    if ((r.edo || '').toUpperCase() === 'ON') on += 1;
                });
                return { total, on };
            };

            const currentPickSelection = () => {
                if (!pickBaseTerm && !pickBaseCategoryKey) {
                    return { key: selectedCatKey, stats: getStatsByKey(selectedCatKey) };
                }
                const base = getBaseCandidates();
                const filtered = applyStepFilters(base);
                const st = computeStatsForRows(filtered);
                const parts = [];
                if (pickBaseCategoryKey) parts.push(pickBaseCategoryKey);
                else if (pickBaseTerm) parts.push(normalize(pickBaseTerm));
                if (pickStepState.producto) parts.push(pickStepState.producto);
                if (pickStepState.spec) parts.push(pickStepState.spec);
                if (pickStepState.tipoEquipo) parts.push(pickStepState.tipoEquipo);
                if (pickStepState.diam1) parts.push(`D1:${pickStepState.diam1}`);
                if (pickStepState.con1) parts.push(`C1:${pickStepState.con1}`);
                if (pickStepState.pres1) parts.push(`P1:${pickStepState.pres1}`);
                if (pickStepState.al) parts.push(`L:${pickStepState.al}`);
                const key = parts.join(' · ');
                return { key, stats: st, rows: filtered };
            };

            const renderPickSteps = () => {
                if (!pickSteps) return;
                if (!pickBaseTerm && !pickBaseCategoryKey) {
                    pickSteps.innerHTML = '';
                    return;
                }

                const base = getBaseCandidates();
                const filtered = applyStepFilters(base);
                const st = computeStatsForRows(filtered);

                const hasAnyValue = (rows, getter) => {
                    try {
                        return rows.some(r => {
                            const v = getter(r);
                            return v !== null && v !== undefined && String(v).trim() !== '';
                        });
                    } catch {
                        return false;
                    }
                };

                const getRowsForFieldValue = (field, value) => {
                    const v = String(value || '').trim().toUpperCase();
                    const rows = base;
                    return rows.filter(r => {
                        // aplicar todos los filtros excepto el campo que estamos evaluando
                        if (field !== 'producto' && pickStepState.producto && r.producto !== pickStepState.producto) return false;
                        if (field !== 'spec' && pickStepState.spec && r.spec !== pickStepState.spec) return false;
                        if (field !== 'tipoEquipo' && pickStepState.tipoEquipo && r.tipoEquipo !== pickStepState.tipoEquipo) return false;
                        if (field !== 'diam1' && pickStepState.diam1 && normalize(r.diam1) !== normalize(pickStepState.diam1)) return false;
                        if (field !== 'con1' && pickStepState.con1 && normalize(r.con1) !== normalize(pickStepState.con1)) return false;
                        if (field !== 'pres1' && pickStepState.pres1 && normalize(r.pres1) !== normalize(pickStepState.pres1)) return false;
                        if (field !== 'al' && pickStepState.al && normalize(r.al) !== normalize(pickStepState.al)) return false;

                        // aplicar el valor del campo actual
                        if (!v) return true;
                        if (field === 'producto') return r.producto === v;
                        if (field === 'spec') return r.spec === v;
                        if (field === 'tipoEquipo') return r.tipoEquipo === v;
                        if (field === 'diam1') return normalize(r.diam1) === normalize(v);
                        if (field === 'con1') return normalize(r.con1) === normalize(v);
                        if (field === 'pres1') return normalize(r.pres1) === normalize(v);
                        if (field === 'al') return normalize(r.al) === normalize(v);
                        return true;
                    });
                };

                // Opciones para cada nivel (solo si hay más de 1 valor)
                const optsProducto = uniqueValues(base, r => r.producto).sort();
                const optsSpec = uniqueValues(filtered, r => r.spec).filter(Boolean).sort();
                const optsTipoEquipo = uniqueValues(filtered, r => r.tipoEquipo).filter(Boolean).sort();
                const optsDiam1 = uniqueValues(filtered, r => r.diam1).filter(Boolean).sort((a, b) => a.localeCompare(b));
                const optsCon1 = uniqueValues(filtered, r => r.con1).filter(Boolean).sort();
                const optsPres1 = uniqueValues(filtered, r => r.pres1).filter(Boolean).sort((a, b) => a.localeCompare(b));
                const optsAL = uniqueValues(filtered, r => r.al).filter(Boolean).sort((a, b) => a.localeCompare(b));

                const mkSelect = (id, label, field, options, value) => {
                    const opts = options.map(o => {
                        const stOpt = computeStatsForRows(getRowsForFieldValue(field, o));
                        const texto = `${o} (${stOpt.on}/${stOpt.total})`;
                        return `<option value="${escHtml(o)}" ${o === value ? 'selected' : ''}>${escHtml(texto)}</option>`;
                    }).join('');
                    const stTodos = computeStatsForRows(getRowsForFieldValue(field, ''));
                    return `
                        <div style="min-width:180px; flex:1;">
                            <label for="${id}" style="display:block; font-size:0.78rem; color:#4b5563; margin-bottom:0.15rem;">${label}</label>
                            <select id="${id}" style="width:100%; padding:0.45rem 0.55rem; border-radius:0.5rem; border:1px solid #cbd5e1; font-size:0.88rem; background:#fff;">
                                <option value="">(Todos) (${stTodos.on}/${stTodos.total})</option>
                                ${opts}
                            </select>
                        </div>
                    `;
                };

                const blocks = [];
                blocks.push(`
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:0.4rem;">
                        <div style="font-size:0.85rem; color:#0f172a; font-weight:800;">Refinar selección</div>
                        <div style="font-size:0.82rem; color:#334155;">Existencia: <strong>${st.on}</strong> de <strong>${st.total}</strong></div>
                    </div>
                `);

                const row1 = [];
                const showProducto = hasAnyValue(base, r => r.producto);
                const showSpec = hasAnyValue(filtered, r => r.spec) || !!pickStepState.spec;
                const showTipoEquipo = hasAnyValue(filtered, r => r.tipoEquipo) || !!pickStepState.tipoEquipo;

                if (showProducto) row1.push(mkSelect('invre-pick-step-producto', 'Producto', 'producto', optsProducto, pickStepState.producto));
                if (showSpec) row1.push(mkSelect('invre-pick-step-spec', 'Spec', 'spec', optsSpec, pickStepState.spec));
                if (showTipoEquipo) row1.push(mkSelect('invre-pick-step-tipoequipo', 'Tipo equipo', 'tipoEquipo', optsTipoEquipo, pickStepState.tipoEquipo));
                if (row1.length) blocks.push(`<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:0.45rem;">${row1.join('')}</div>`);

                const row2 = [];
                const showDiam1 = hasAnyValue(filtered, r => r.diam1) || !!pickStepState.diam1;
                const showCon1 = hasAnyValue(filtered, r => r.con1) || !!pickStepState.con1;
                const showPres1 = hasAnyValue(filtered, r => r.pres1) || !!pickStepState.pres1;
                const showAL = hasAnyValue(filtered, r => r.al) || !!pickStepState.al;

                if (showDiam1) row2.push(mkSelect('invre-pick-step-diam1', 'Diámetro 1', 'diam1', optsDiam1, pickStepState.diam1));
                if (showCon1) row2.push(mkSelect('invre-pick-step-con1', 'Conexión 1', 'con1', optsCon1, pickStepState.con1));
                if (showPres1) row2.push(mkSelect('invre-pick-step-pres1', 'Presión 1', 'pres1', optsPres1, pickStepState.pres1));
                if (showAL) row2.push(mkSelect('invre-pick-step-al', 'A / L', 'al', optsAL, pickStepState.al));
                if (row2.length) blocks.push(`<div style="display:flex; gap:10px; flex-wrap:wrap;">${row2.join('')}</div>`);

                if (!row1.length && !row2.length) {
                    blocks.push('<div style="color:#64748b; font-size:0.85rem;">No hay más variación; ya es una figura única (o casi única).</div>');
                }

                pickSteps.innerHTML = `
                    <div style="margin-top:0.55rem; padding:0.65rem; border:1px solid #e2e8f0; border-radius:0.65rem; background:#f8fafc;">
                        ${blocks.join('')}
                    </div>
                `;

                const bind = (id, field) => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.addEventListener('change', () => {
                        pickStepState[field] = String(el.value || '').trim().toUpperCase();
                        // limpiar campos más profundos cuando cambia uno
                        if (field === 'producto') { pickStepState.spec = ''; pickStepState.tipoEquipo = ''; pickStepState.diam1 = ''; pickStepState.con1 = ''; pickStepState.pres1 = ''; pickStepState.al = ''; }
                        if (field === 'spec') { pickStepState.tipoEquipo = ''; pickStepState.diam1 = ''; pickStepState.con1 = ''; pickStepState.pres1 = ''; pickStepState.al = ''; }
                        if (field === 'tipoEquipo') { pickStepState.diam1 = ''; pickStepState.con1 = ''; pickStepState.pres1 = ''; pickStepState.al = ''; }
                        if (field === 'diam1') { pickStepState.con1 = ''; pickStepState.pres1 = ''; pickStepState.al = ''; }
                        if (field === 'con1') { pickStepState.pres1 = ''; pickStepState.al = ''; }
                        if (field === 'pres1') { pickStepState.al = ''; }
                        renderPickSteps();
                    });
                };

                bind('invre-pick-step-producto', 'producto');
                bind('invre-pick-step-spec', 'spec');
                bind('invre-pick-step-tipoequipo', 'tipoEquipo');
                bind('invre-pick-step-diam1', 'diam1');
                bind('invre-pick-step-con1', 'con1');
                bind('invre-pick-step-pres1', 'pres1');
                bind('invre-pick-step-al', 'al');
            };

            const loadCart = () => {
                try {
                    const raw = localStorage.getItem(cartKey) || '[]';
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr)) pickCartItems = arr;
                    else pickCartItems = [];
                } catch {
                    pickCartItems = [];
                }
            };
            const saveCart = () => {
                try { localStorage.setItem(cartKey, JSON.stringify(pickCartItems)); } catch {}
            };
            const getStatsByKey = (k) => {
                try { return resumenMap.get(k) || null; } catch { return null; }
            };

            const renderCart = () => {
                if (!pickSelectedWrap || !pickCart) return;
                if (!pickCartItems.length) {
                    pickSelectedWrap.style.display = 'none';
                    pickCart.innerHTML = '';
                    return;
                }
                pickSelectedWrap.style.display = 'block';

                const header = `
                    <div style="display:grid; grid-template-columns: 1fr 90px 120px 44px; gap:0; background:#f8fafc; border-bottom:1px solid #e5e7eb;">
                        <div style="padding:0.5rem 0.55rem; font-weight:800; color:#0f172a;">Categoría</div>
                        <div style="padding:0.5rem 0.55rem; font-weight:800; color:#0f172a; text-align:right;">Cant.</div>
                        <div style="padding:0.5rem 0.55rem; font-weight:800; color:#0f172a; text-align:right;">Existencia</div>
                        <div style="padding:0.5rem 0.55rem;"></div>
                    </div>
                `;

                const rows = pickCartItems.map((it, idx) => {
                    const st = getStatsByKey(it.key);
                    const existencia = st ? `${st.on} de ${st.total}` : '--';
                    const warn = st && it.qty > st.on;
                    return `
                        <div style="display:grid; grid-template-columns: 1fr 90px 120px 44px; gap:0; border-bottom:1px solid #e5e7eb; background:${warn ? '#fff7ed' : '#ffffff'};">
                            <div style="padding:0.5rem 0.55rem; color:#0f172a; font-weight:700;">${escHtml(it.key)}${warn ? `<div style=\"font-size:0.78rem; color:#9a3412; margin-top:2px;\">La cantidad supera ON.</div>` : ''}</div>
                            <div style="padding:0.5rem 0.55rem; text-align:right; font-variant-numeric: tabular-nums;">${Number(it.qty) || 0}</div>
                            <div style="padding:0.5rem 0.55rem; text-align:right; color:#334155; font-variant-numeric: tabular-nums;">${escHtml(existencia)}</div>
                            <div style="padding:0.5rem 0.55rem; text-align:right;">
                                <button type="button" data-pick-remove="${idx}" style="width:32px; height:32px; border-radius:0.5rem; border:1px solid #fecaca; background:#fff; color:#991b1b; cursor:pointer;">X</button>
                            </div>
                        </div>
                    `;
                }).join('');

                pickCart.innerHTML = header + rows;

                pickCart.querySelectorAll('[data-pick-remove]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const i = Number(btn.getAttribute('data-pick-remove'));
                        if (!Number.isFinite(i)) return;
                        pickCartItems.splice(i, 1);
                        saveCart();
                        renderCart();
                    });
                });
            };

            const hideDropdown = () => {
                if (!pickDropdown) return;
                pickDropdown.style.display = 'none';
                pickDropdown.innerHTML = '';
            };

            const getProductoFromKey = (k) => {
                try {
                    const s = String(k || '');
                    const parts = s.split('·').map(p => p.trim()).filter(Boolean);
                    return parts.length ? parts[0] : s.trim();
                } catch {
                    return String(k || '').trim();
                }
            };

            const getAliasesForQuery = (qNorm) => {
                const aliases = new Set();
                const q = String(qNorm || '').trim();
                if (!q) return [];
                aliases.add(q);

                // Sinónimos/abreviaciones comunes según el CSV
                if (q.includes('CROSS')) {
                    aliases.add('XO');
                    aliases.add('X0');
                    aliases.add('DSA');
                    aliases.add('SSA');
                    aliases.add('CROSS OVER');
                }
                if (q.includes('CODO')) {
                    aliases.add('CODO');
                    aliases.add('45');
                    aliases.add('90');
                }
                if (q === 'TEE' || q.includes('TEE')) {
                    aliases.add('TEE');
                }
                return Array.from(aliases);
            };

            const categoryMatchesQuery = (catKey, qNorm) => {
                try {
                    const aliases = getAliasesForQuery(qNorm);
                    if (!aliases.length) return false;

                    const keyNorm = normalize(catKey);
                    for (const a of aliases) {
                        if (keyNorm.includes(a)) return true;
                    }

                    const list = rowsPorCategoria.get(catKey) || [];
                    // Para performance, basta con revisar algunas filas
                    const sample = list.slice(0, 50);
                    for (const r of sample) {
                        const p = normalize(r.producto);
                        const d = normalize(r.desc);
                        const rep = normalize(r.rep);
                        for (const a of aliases) {
                            if (p.includes(a) || d.includes(a) || rep.includes(a)) return true;
                        }
                    }
                    return false;
                } catch {
                    return false;
                }
            };

            const renderDropdown = (query) => {
                if (!pickDropdown || !pickInput) return;
                const q = normalize(query);
                if (!q) {
                    hideDropdown();
                    return;
                }

                const aliases = getAliasesForQuery(q);
                const isCodo = aliases.includes('CODO');
                const items = Array.from(resumenMap.entries())
                    .map(([k, v]) => ({ key: k, ...v }))
                    .filter(it => {
                        // Buscar por PRODUCTO + DESCRIPCION + REPORTE P/P (con sinónimos)
                        return categoryMatchesQuery(it.key, q);
                    })
                    .sort((a, b) => {
                        if (isCodo) {
                            const a90 = normalize(a.key).startsWith('90');
                            const b90 = normalize(b.key).startsWith('90');
                            if (a90 !== b90) return a90 ? -1 : 1;
                            const a45 = normalize(a.key).startsWith('45');
                            const b45 = normalize(b.key).startsWith('45');
                            if (a45 !== b45) return a45 ? -1 : 1;
                            const a6206 = normalize(a.key).includes('6206');
                            const b6206 = normalize(b.key).includes('6206');
                            if (a6206 !== b6206) return a6206 ? -1 : 1;
                        }
                        return (b.total - a.total) || (b.on - a.on) || a.key.localeCompare(b.key);
                    })
                    .slice(0, 60);

                if (!items.length) {
                    pickDropdown.innerHTML = '<div style="padding:0.6rem; color:#64748b; font-size:0.85rem;">Sin coincidencias.</div>';
                    pickDropdown.style.display = 'block';
                    return;
                }

                pickDropdown.innerHTML = items.map(it => {
                    const producto = escHtml(getProductoFromKey(it.key));
                    return `
                        <div data-pick-opt="${escHtml(it.key)}" style="padding:0.55rem 0.6rem; cursor:pointer; display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
                            <div style="font-weight:800; color:#0f172a; font-size:0.88rem; line-height:1.15;">${escHtml(it.key)}</div>
                            <div style="text-align:right; white-space:nowrap; color:#334155; font-size:0.82rem;">
                                <div>${it.on} de ${it.total}</div>
                                <div style="color:#64748b; font-size:0.75rem; margin-top:2px;">${producto}</div>
                            </div>
                        </div>
                    `;
                }).join('');
                pickDropdown.style.display = 'block';

                pickDropdown.querySelectorAll('[data-pick-opt]').forEach(el => {
                    el.addEventListener('click', () => {
                        const k = String(el.getAttribute('data-pick-opt') || '').trim();
                        if (!k) return;
                        selectedCatKey = k;
                        pickInput.value = k;
                        hideDropdown();

                        // Activar refinamiento por pasos desde esta categoría
                        pickBaseTerm = '';
                        pickBaseCategoryKey = k;
                        const base = parseResumenKey(k);
                        pickStepState = {
                            producto: base.producto || '',
                            spec: base.spec || '',
                            tipoEquipo: base.tipoEquipo || '',
                            diam1: '',
                            con1: '',
                            pres1: '',
                            al: '',
                        };
                        try { renderPickSteps(); } catch {}
                        try { pickQty?.focus(); } catch {}
                    });
                });
            };

            const addToCart = () => {
                if (!pickInput || !pickQty) return;
                const sel = currentPickSelection();
                const key = String(sel.key || '').trim();
                if (!key) return;

                const qty = Math.max(1, Math.floor(Number(pickQty.value || 1)));
                const st = sel.stats || getStatsByKey(key);
                const maxOn = st ? (st.on || 0) : 0;
                const safeQty = maxOn > 0 ? Math.min(qty, maxOn) : qty;

                const idx = pickCartItems.findIndex(x => x.key === key);
                if (idx >= 0) {
                    pickCartItems[idx].qty = (Number(pickCartItems[idx].qty) || 0) + safeQty;
                } else {
                    pickCartItems.push({ key, qty: safeQty });
                }

                saveCart();
                renderCart();

                selectedCatKey = '';
                pickInput.value = '';
                pickBaseTerm = '';
                pickBaseCategoryKey = '';
                pickStepState = { producto: '', spec: '', tipoEquipo: '', diam1: '', con1: '', pres1: '', al: '' };
                try { renderPickSteps(); } catch {}
                pickQty.value = '1';
                hideDropdown();
                try { pickInput.focus(); } catch {}
            };

            const copyCart = async () => {
                if (!pickCartItems.length) return;
                const lineas = pickCartItems.map(it => {
                    const st = getStatsByKey(it.key);
                    const existencia = st ? `${st.on} de ${st.total}` : '--';
                    return `- ${it.key}: ${it.qty} (existencia: ${existencia})`;
                });
                const texto = `SELECCIÓN DE EQUIPOS PARA ACTIVIDAD\n${lineas.join('\n')}`;
                try {
                    await navigator.clipboard.writeText(texto);
                } catch {
                    try {
                        const ta = document.createElement('textarea');
                        ta.value = texto;
                        ta.style.position = 'fixed';
                        ta.style.left = '-9999px';
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                    } catch {}
                }
            };

            const clearCart = () => {
                pickCartItems = [];
                saveCart();
                renderCart();
            };

            // Bind selector UI
            loadCart();
            renderCart();
            if (pickInput) {
                pickInput.addEventListener('input', () => {
                    selectedCatKey = '';
                    renderDropdown(pickInput.value);
                });
                pickInput.addEventListener('focus', () => {
                    renderDropdown(pickInput.value);
                });
                pickInput.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Tab') {
                        // Activar modo por pasos
                        const term = String(pickInput.value || '').trim();
                        if (!term) return;
                        ev.preventDefault();
                        pickBaseTerm = term;
                        pickBaseCategoryKey = '';
                        pickStepState = { producto: '', spec: '', tipoEquipo: '', diam1: '', con1: '', pres1: '', al: '' };
                        selectedCatKey = '';
                        hideDropdown();
                        renderPickSteps();
                        return;
                    }
                    if (ev.key === 'Enter') {
                        ev.preventDefault();
                        addToCart();
                    } else if (ev.key === 'Escape') {
                        pickBaseTerm = '';
                        pickBaseCategoryKey = '';
                        pickStepState = { producto: '', spec: '', tipoEquipo: '', diam1: '', con1: '', pres1: '', al: '' };
                        try { renderPickSteps(); } catch {}
                        hideDropdown();
                    }
                });
            }
            if (pickAdd) pickAdd.addEventListener('click', () => addToCart());
            if (pickCopy) pickCopy.addEventListener('click', () => copyCart());
            if (pickClear) pickClear.addEventListener('click', () => clearCart());
            document.addEventListener('click', (ev) => {
                const t = ev.target;
                if (!t) return;
                if (pickDropdown && (pickDropdown.contains(t) || pickInput?.contains(t))) return;
                hideDropdown();
            });

            function renderResumen() {
                if (!resumenBody) return;
                // Recalcular conteos por si hubo overrides de estado
                try { rebuildResumenData(); } catch {}
                const abiertos = new Set();
                try {
                    resumenBody.querySelectorAll('details[data-invre-cat][open]').forEach(d => {
                        const k = String(d.getAttribute('data-invre-cat') || '').trim();
                        if (k) abiertos.add(k);
                    });
                } catch {}

                const items = Array.from(resumenMap.entries())
                    .map(([k, v]) => ({ k, ...v }))
                    .sort((a, b) => (b.total - a.total) || (b.on - a.on) || a.k.localeCompare(b.k));

                if (!items.length) {
                    resumenBody.innerHTML = '<div style="color:#6b7280;">Sin datos.</div>';
                    return;
                }

                const detailsHtml = items.map(it => {
                    const keyEsc = escHtml(it.k);
                    const badgeBase = 'display:inline-flex; align-items:center; gap:6px; padding:0.14rem 0.5rem; border-radius:999px; font-size:0.75rem; border:1px solid';
                    return `
                        <details data-invre-cat="${keyEsc}" ${abiertos.has(it.k) ? 'open' : ''} style="border:1px solid #e2e8f0; background:#ffffff; border-radius:0.6rem; overflow:hidden; margin-bottom:0.5rem;">
                            <summary style="list-style:none; cursor:pointer; padding:0.55rem 0.65rem; display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
                                <div style="font-weight:800; color:#0f172a; font-size:0.9rem; line-height:1.15;">${keyEsc}</div>
                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                                    <span style="${badgeBase}; background:#f1f5f9; color:#0f172a; border-color:#cbd5e1;" title="ON de TOTAL">${it.on} de ${it.total}</span>
                                    <span style="${badgeBase}; background:#fef2f2; color:#991b1b; border-color:#fecaca;" title="OFF">OFF: ${it.off}</span>
                                    <span style="${badgeBase}; background:#fffbeb; color:#92400e; border-color:#fde68a;" title="WIP">WIP: ${it.wip}</span>
                                </div>
                            </summary>
                            <div data-invre-cat-body style="padding:0.65rem; border-top:1px solid #e2e8f0; background:#f8fafc;">
                                <div style="color:#64748b; font-size:0.85rem;">Abre la categoría para cargar el detalle...</div>
                            </div>
                        </details>
                    `;
                }).join('');

                resumenBody.innerHTML = `
                    <div aria-label="Resumen inventario por categoría">
                        ${detailsHtml}
                    </div>
                `;

                const renderDetalleCategoria = (key, bodyEl) => {
                    const list = rowsPorCategoria.get(key) || [];
                    if (!list.length) {
                        bodyEl.innerHTML = '<div style="color:#6b7280; font-size:0.85rem;">Sin registros.</div>';
                        return;
                    }

                    const html = `
                        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:0.55rem; flex-wrap:wrap;">
                            <div style="font-size:0.85rem; color:#111827;">Total: <strong>${list.length}</strong></div>
                            <input data-invre-cat-search type="text" placeholder="Buscar equipo, serial, spec, estado..." style="flex:1; min-width:220px; max-width:420px; padding:0.4rem 0.55rem; border:1px solid #cbd5e1; border-radius:0.5rem; font-size:0.85rem;" />
                        </div>
                        <div style="max-height:46vh; overflow:auto; border:1px solid #e5e7eb; border-radius:0.55rem; background:#ffffff;">
                            <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                                <thead>
                                    <tr style="background:#f1f5f9;">
                                        <th style="text-align:left; padding:0.45rem; border-bottom:1px solid #e5e7eb;">Equipo</th>
                                        <th style="text-align:left; padding:0.45rem; border-bottom:1px solid #e5e7eb;">Serial</th>
                                        <th style="text-align:left; padding:0.45rem; border-bottom:1px solid #e5e7eb;">Spec</th>
                                        <th style="text-align:left; padding:0.45rem; border-bottom:1px solid #e5e7eb;">Producto</th>
                                        <th style="text-align:left; padding:0.45rem; border-bottom:1px solid #e5e7eb;">Tipo equipo</th>
                                        <th style="text-align:left; padding:0.45rem; border-bottom:1px solid #e5e7eb;">Estado</th>
                                    </tr>
                                </thead>
                                <tbody data-invre-cat-tbody></tbody>
                            </table>
                        </div>
                    `;

                    bodyEl.innerHTML = html;

                    const tb = bodyEl.querySelector('[data-invre-cat-tbody]');
                    const input = bodyEl.querySelector('[data-invre-cat-search]');

                    const pintar = (arr) => {
                        const rows = arr.slice(0, 800).map(r => {
                            return `
                                <tr>
                                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb;">${escHtml(r.equipo)}</td>
                                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb;">${escHtml(r.serial)}</td>
                                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb; white-space:nowrap;">${escHtml(r.spec)}</td>
                                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb;">${escHtml(r.producto)}</td>
                                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb;">${escHtml(r.tipoEquipo)}</td>
                                    <td style="padding:0.35rem; border-bottom:1px solid #e5e7eb; white-space:nowrap;">${escHtml(r.edo)}</td>
                                </tr>
                            `;
                        }).join('');
                        if (tb) tb.innerHTML = rows;
                    };

                    pintar(list);

                    if (input) {
                        input.addEventListener('input', () => {
                            const q = String(input.value || '').trim().toUpperCase();
                            const filtered = !q ? list : list.filter(r => {
                                const e = (r.equipo || '').toString().toUpperCase();
                                const s = (r.serial || '').toString().toUpperCase();
                                const sp = (r.spec || '').toString().toUpperCase();
                                const p = (r.producto || '').toString().toUpperCase();
                                const te = (r.tipoEquipo || '').toString().toUpperCase();
                                const ed = (r.edo || '').toString().toUpperCase();
                                return e.includes(q) || s.includes(q) || sp.includes(q) || p.includes(q) || te.includes(q) || ed.includes(q);
                            });
                            pintar(filtered);
                        });
                    }
                };

                resumenBody.querySelectorAll('details[data-invre-cat]').forEach(d => {
                    d.addEventListener('toggle', () => {
                        if (!d.open) return;
                        const key = String(d.getAttribute('data-invre-cat') || '').trim();
                        const bodyEl = d.querySelector('[data-invre-cat-body]');
                        if (!key || !bodyEl) return;
                        if (bodyEl.getAttribute('data-rendered') === '1') return;
                        renderDetalleCategoria(key, bodyEl);
                        bodyEl.setAttribute('data-rendered', '1');
                    });

                    if (d.open) {
                        try {
                            const key = String(d.getAttribute('data-invre-cat') || '').trim();
                            const bodyEl = d.querySelector('[data-invre-cat-body]');
                            if (key && bodyEl) {
                                renderDetalleCategoria(key, bodyEl);
                                bodyEl.setAttribute('data-rendered', '1');
                            }
                        } catch {}
                    }
                });

                // Actualizar existencia del carrito al cambiar conteos
                try { renderCart(); } catch {}
            }

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

                            const canEditEstado = !!(window.isAdmin || window.isDirector);

                            const select = document.createElement('select');
                            select.style.fontSize = '0.8rem';
                            select.style.padding = '0.15rem 0.3rem';
                            if (!canEditEstado) {
                                select.disabled = true;
                                select.title = 'Solo lectura';
                            }
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

                                if (!canEditEstado) {
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

                                // Re-render resumen (usa estado efectivo)
                                try { renderResumen(); } catch {}
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

            // Render inicial del resumen por categoría
            try { renderResumen(); } catch {}

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
