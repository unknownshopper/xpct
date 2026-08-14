document.addEventListener('DOMContentLoaded', () => {
    const inputBuscar = document.getElementById('cd-buscar');
    const btnNuevo = document.getElementById('cd-btn-nuevo');
    const lblContador = document.getElementById('cd-contador');
    const tbody = document.getElementById('cd-tbody');
    const msg = document.getElementById('cd-msg');

    // Mapeo por familia / variante (auditoría)
    const inputBuscarFam = document.getElementById('cdf-buscar');
    const boxTree = document.getElementById('cdf-tree');
    const lblFamCount = document.getElementById('cdf-count');
    const lblTotalEquipos = document.getElementById('cdf-total-equipos');

    const lblTituloMap = document.getElementById('cdm-titulo');
    const lblSubMap = document.getElementById('cdm-subtitulo');
    const inputFamilia = document.getElementById('cdm-familia');
    const inputVariante = document.getElementById('cdm-variante');
    const btnEditarMap = document.getElementById('cdm-btn-editar');
    const btnGuardarMap = document.getElementById('cdm-btn-guardar');
    const boxDetalle = document.getElementById('cdm-detalle');
    const boxParams = document.getElementById('cdm-parametros');
    const lblCountSel = document.getElementById('cdm-count');
    const msgMap = document.getElementById('cdm-msg');

    const imgDraw = document.getElementById('cdm-draw');
    const msgDraw = document.getElementById('cdm-draw-msg');
    const boxEquipos = document.getElementById('cdm-equipos');
    const lblEqCount = document.getElementById('cdm-eq-count');

    const escapeHtml = (s) => String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const normKey = (s) => String(s ?? '')
        .toLowerCase()
        .trim()
        .replace(/\u00A0/g, ' ')
        .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
        .replace(/[\u200B-\u200D\uFEFF]+/g, '')
        .replace(/\s+/g, ' ');

    const drawMap = {
        XO: {
            'ANSI x ANSI': 'docs/draws/AnsiXAnsi.png',
            'API x API': 'docs/draws/ApiXApi.png',
            'ANSI x H': 'docs/draws/XoAnsiXH.jpg',
            'ANSI x M': 'docs/draws/XoAnsiXM.jpg',
            'API x H': 'docs/draws/XoApiXH.png',
            'API x M': 'docs/draws/XoApiXM.png',
            'H x H': 'docs/draws/XoHXH.jpg',
            'H x M': 'docs/draws/XoHXM.jpg',
            'M x M': 'docs/draws/XoMXM.png',
        },
        TEE: {
            'TEE 1': 'docs/draws/T1.jpeg',
            'TEE 2': 'docs/draws/T2.png',
            'TEE 3': 'docs/draws/T3.png',
        }
    };

    function fmtTs(ts) {
        try {
            if (!ts) return '';
            const d = (typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts);
            if (!d || isNaN(d.getTime())) return '';
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
        } catch {
            return '';
        }

    }

    async function loadEquiposAndOverrides() {
        const ok = await waitForDbReady();
        if (!ok) return;
        try {
            const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
            const [snapEq, snapOv] = await Promise.all([
                getDocs(collection(window.db, 'equipos')),
                getDocs(collection(window.db, 'equipos_overrides')),
            ]);

            _equiposList = snapEq.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
            const ovs = snapOv.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
            _overridesByKey = new Map(ovs.map(x => [String(x.id || ''), x]));

            buildFamiliasIndex();
            renderFamiliasTree();
        } catch (e) {
            console.error(e);
        }
    }

    function inferFamiliaFromEquipoKey(equipoKey) {
        try {
            const k = String(equipoKey || '').trim().toUpperCase();
            if (!k) return '';
            const parts = k.split('-').filter(Boolean);
            if (parts.length < 2) return '';
            // PCT-<FAMILIA>-...
            return String(parts[1] || '').trim().toUpperCase();
        } catch {
            return '';
        }
    }

    function mappingDocIdFor(familiaKey, varianteKey) {
        const fam = String(familiaKey || '').trim().toUpperCase();
        const v = String(varianteKey || '').trim();
        if (!fam) return '';
        if (!v) return `__family__${fam}`;
        return `__family__${fam}__${v}`;
    }

    function extractXOVarianteFromDescripcion(desc) {
        try {
            const s0 = String(desc || '').trim().toUpperCase();
            if (!s0) return '';

            // Normalizar espacios y separadores
            const s = s0
                .replace(/\u00A0/g, ' ')
                .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
                .replace(/[\u200B-\u200D\uFEFF]+/g, '')
                .replace(/\s+/g, ' ');

            // Patrones esperados en descripción:
            // XO API X M
            // XO ANSI X ANSI
            // XO H X M
            const m = s.match(/\bXO\s+([A-Z]{1,6})\s+X\s+([A-Z]{1,6})\b/);
            if (!m) return '';
            const a = String(m[1] || '').trim();
            const b = String(m[2] || '').trim();

            const okToken = (t) => {
                if (!t) return '';
                if (t === 'ANSI' || t === 'API') return t;
                if (t === 'M' || t === 'H') return t;
                return '';
            };
            const aa = okToken(a);
            const bb = okToken(b);
            if (!aa || !bb) return '';

            // Formato visual consistente
            return `${aa} x ${bb}`;
        } catch {
            return '';
        }
    }

    function extractTEESubFromDescripcion(desc) {
        try {
            const s = String(desc || '').trim().toUpperCase().replace(/\s+/g, ' ');
            const m = s.match(/\bTEE\s*(1|2|3)\b/);
            if (!m) return '';
            return `TEE ${m[1]}`;
        } catch {
            return '';
        }
    }

    function extractTEESubFromProducto(producto) {
        try {
            const s = String(producto || '').trim().toUpperCase().replace(/\s+/g, ' ');
            // En CSV/Firestore: PRODUCTO puede venir como "TEE 1", "TEE 2", "TEE 3"
            const m = s.match(/\bTEE\s*(1|2|3)\b/);
            if (!m) return '';
            return `TEE ${m[1]}`;
        } catch {
            return '';
        }
    }

    function extractTEESubFromDescripcionV2(desc) {
        // Intenta inferir de formatos reales vistos: "TEE (HXMXM) ..."
        // Referencia (pendiente de cotejo, pero suficiente para arrancar):
        // T1 = H x M x M (y equivalentes por permutación: HMM/MHM/MMH)
        // T2 = H x M x H
        // T3 = H x H x M
        try {
            const s = String(desc || '').trim().toUpperCase().replace(/\s+/g, ' ');
            const direct = extractTEESubFromDescripcion(s);
            if (direct) return direct;

            // Acepta formatos: (HXMXH) o (H X M X H)
            let a = '', b = '', c = '';
            const parSpaced = s.match(/\bTEE\s*\(\s*([HM])\s*X\s*([HM])\s*X\s*([HM])\s*\)/);
            if (parSpaced) {
                a = String(parSpaced[1] || '').trim();
                b = String(parSpaced[2] || '').trim();
                c = String(parSpaced[3] || '').trim();
            } else {
                const par = s.match(/\bTEE\s*\(([HM](?:X[HM]){2})\)/);
                if (!par) return '';
                const tokens = String(par[1] || '').split('X').map(x => String(x || '').trim());
                if (tokens.length !== 3) return '';
                a = tokens[0];
                b = tokens[1];
                c = tokens[2];
            }

            const key = `${a}${b}${c}`;
            if (key === 'HMH') return 'TEE 2';
            if (key === 'HHM') return 'TEE 3';

            // T1: exactamente 1 H y 2 M (cualquier orden)
            const countH = (a === 'H') + (b === 'H') + (c === 'H');
            const countM = (a === 'M') + (b === 'M') + (c === 'M');
            if (countH === 1 && countM === 2) return 'TEE 1';

            return '';
        } catch {
            return '';
        }
    }

    function extractTEESubFromEquipo(eq) {
        try {
            if (!eq) return '';
            // Prioridad: producto (más confiable según tu migración)
            const byProd = extractTEESubFromProducto(eq.producto || '');
            if (byProd) return byProd;
            // Fallbacks: descripción
            const byDesc1 = extractTEESubFromDescripcion(eq.descripcion || '');
            if (byDesc1) return byDesc1;
            return extractTEESubFromDescripcionV2(eq.descripcion || '');
        } catch {
            return '';
        }
    }

    function buildFamiliasIndex() {
        // Index de familias desde equipos (PCT-<FAM>-...) y variantes desde overrides.varianteKey
        const famMap = new Map();
        for (const eq of _equiposList) {
            const fam = inferFamiliaFromEquipoKey(eq.id);
            if (!fam) continue;
            if (!famMap.has(fam)) famMap.set(fam, { familiaKey: fam, total: 0, variantes: new Map() });
            famMap.get(fam).total += 1;

            // XO: inferir variantes desde descripcion (solo Firestore)
            if (fam === 'XO') {
                const v = extractXOVarianteFromDescripcion(eq.descripcion || '');
                if (v) {
                    const m = famMap.get(fam).variantes;
                    m.set(v, (m.get(v) || 0) + 1);
                }
            }

            // TEE: inferir subfamilia/variante (TEE 1/2/3) desde descripcion
            if (fam === 'TEE') {
                const v = extractTEESubFromEquipo(eq);
                if (v) {
                    const m = famMap.get(fam).variantes;
                    m.set(v, (m.get(v) || 0) + 1);
                }
            }
        }

        // Variantes conocidas: cualquier override que tenga varianteKey, agrupado por familiaKey (o inferida por docId)
        for (const [id, ov] of _overridesByKey.entries()) {
            const idStr = String(id || '');
            if (idStr.startsWith('__family__')) {
                // mapping docs también cuentan como variantes configuradas
                const m = idStr.replace(/^__family__/, '');
                const parts = m.split('__');
                const fam = String(parts[0] || '').trim().toUpperCase();
                const varKey = parts.length > 1 ? parts.slice(1).join('__') : '';
                if (!fam) continue;
                if (!famMap.has(fam)) famMap.set(fam, { familiaKey: fam, total: 0, variantes: new Map() });
                if (varKey) {
                    const m2 = famMap.get(fam).variantes;
                    if (!m2.has(varKey)) m2.set(varKey, 0);
                }
                continue;
            }

            const fam = String((ov && ov.familiaKey) ? ov.familiaKey : inferFamiliaFromEquipoKey(idStr)).trim().toUpperCase();
            const v = String((ov && ov.varianteKey) ? ov.varianteKey : '').trim();
            if (!fam || !v) continue;
            if (!famMap.has(fam)) famMap.set(fam, { familiaKey: fam, total: 0, variantes: new Map() });
            const m3 = famMap.get(fam).variantes;
            if (!m3.has(v)) m3.set(v, 0);
        }

        _familiasIndex = Array.from(famMap.values())
            .map(x => ({
                familiaKey: x.familiaKey,
                total: x.total,
                variantes: Array.from(x.variantes.entries())
                    .map(([k, count]) => ({ key: k, count: Number(count) || 0 }))
                    .sort((a, b) => String(a.key).localeCompare(String(b.key), 'es'))
            }))
            .sort((a, b) => String(a.familiaKey).localeCompare(String(b.familiaKey), 'es'));

        try {
            if (lblFamCount) lblFamCount.textContent = String(_familiasIndex.length);
        } catch {}

        try {
            if (lblTotalEquipos) {
                const listTotal = Array.isArray(_equiposList) ? _equiposList.length : 0;
                const sumByFam = _familiasIndex.reduce((acc, f) => acc + (Number(f.total) || 0), 0);
                lblTotalEquipos.textContent = (listTotal === sumByFam)
                    ? String(listTotal)
                    : `${listTotal} (Σ familias=${sumByFam})`;
            }
        } catch {}
    }

    function renderFamiliasTree() {
        if (!boxTree) return;
        const q = normKey(inputBuscarFam ? inputBuscarFam.value : '');
        const items = !q ? _familiasIndex : _familiasIndex.filter(x => {
            const hay = `${x.familiaKey} ${(x.variantes || []).join(' ')}`;
            return normKey(hay).includes(q);
        });

        if (!items.length) {
            boxTree.innerHTML = '<div style="padding:8px; color:#6b7280; font-size:0.85rem;">Sin resultados.</div>';
            return;
        }

        boxTree.innerHTML = items.map(f => {
            const isSelFam = _selectedFamiliaKey === f.familiaKey;
            const hasVars = (f.variantes || []).length > 0;
            const isExpanded = hasVars && _expandedFamilies.has(f.familiaKey);
            const header = `
                <div data-kind="familia" data-fam="${escapeHtml(f.familiaKey)}" style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; border-radius:10px; cursor:pointer; ${isSelFam ? 'background:#eff6ff; border:1px solid #bfdbfe;' : 'background:#f9fafb; border:1px solid #e5e7eb;'}">
                    <div style="font-weight:900; color:#111827; display:flex; align-items:center; gap:8px;">
                        ${hasVars ? `<span style=\"font-size:0.9rem; color:#6b7280;\">${isExpanded ? '▾' : '▸'}</span>` : `<span style=\"width:12px;\"></span>`}
                        <span>${escapeHtml(f.familiaKey)}</span>
                    </div>
                    <div style="font-size:0.8rem; color:#6b7280;">${escapeHtml(String(f.total || 0))}${hasVars ? ` · ${escapeHtml(String(f.variantes.length))} variantes` : ''}</div>
                </div>
            `;
            if (!hasVars) return `<div style="margin-bottom:8px;">${header}</div>`;
            if (!isExpanded) return `<div style="margin-bottom:8px;">${header}</div>`;

            const vars = f.variantes.map(vObj => {
                const v = String(vObj && vObj.key ? vObj.key : '').trim();
                const cnt = Number(vObj && vObj.count ? vObj.count : 0) || 0;
                const isSelVar = isSelFam && _selectedVarianteKey === v;
                return `
                    <div data-kind="variante" data-fam="${escapeHtml(f.familiaKey)}" data-var="${escapeHtml(v)}" style="margin:6px 0 0 14px; padding:7px 10px; border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:10px; ${isSelVar ? 'background:#ecfdf5; border:1px solid #bbf7d0;' : 'background:#ffffff; border:1px solid #e5e7eb;'}">
                        <div style="font-weight:800; color:#111827; font-size:0.9rem;">${escapeHtml(v)}</div>
                        <div style="font-size:0.8rem; color:#6b7280;">${escapeHtml(String(cnt))}</div>
                    </div>
                `;
            }).join('');

            return `<div style="margin-bottom:8px;">${header}${vars}</div>`;
        }).join('');
    }

    function setEditingMap(on) {
        _isEditingMap = !!on;
        const canEdit = !!window.isAdmin;
        try {
            if (inputFamilia) inputFamilia.disabled = !(canEdit && _isEditingMap);
            if (inputVariante) inputVariante.disabled = !(canEdit && _isEditingMap);
            if (boxParams) {
                boxParams.querySelectorAll('input[type="checkbox"]').forEach(chk => {
                    chk.disabled = !(canEdit && _isEditingMap);
                });
            }
            const hasSel = !!String(_selectedMappingDocId || '').trim();
            if (btnEditarMap) btnEditarMap.style.display = (canEdit && !_isEditingMap && hasSel) ? '' : 'none';
            if (btnGuardarMap) btnGuardarMap.style.display = (canEdit && _isEditingMap && hasSel) ? '' : 'none';
        } catch {}
    }

    function getMappingDoc(docId) {
        return _overridesByKey.get(String(docId || '')) || null;
    }

    function renderDrawAndEquipos(familiaKey, varianteKey) {
        // Imagen
        try {
            const fam = String(familiaKey || '').trim().toUpperCase();
            const v = String(varianteKey || '').trim();
            const src = (drawMap[fam] && drawMap[fam][v]) ? drawMap[fam][v] : '';
            if (imgDraw) {
                if (src) {
                    imgDraw.src = src;
                    imgDraw.style.display = '';
                } else {
                    imgDraw.removeAttribute('src');
                    imgDraw.style.display = 'none';
                }
            }
            if (msgDraw) msgDraw.textContent = src ? src : 'Sin imagen asignada.';
        } catch {}

        // Equipos list
        try {
            const fam = String(familiaKey || '').trim().toUpperCase();
            const v = String(varianteKey || '').trim();
            let list = _equiposList.filter(eq => inferFamiliaFromEquipoKey(eq.id) === fam);
            if (fam === 'XO' && v) {
                list = list.filter(eq => extractXOVarianteFromDescripcion(eq.descripcion || '') === v);
            }
            if (fam === 'TEE' && v) {
                list = list.filter(eq => extractTEESubFromEquipo(eq) === v);
            }

            list = list.slice().sort((a, b) => String(a.id).localeCompare(String(b.id), 'es'));

            if (lblEqCount) lblEqCount.textContent = String(list.length);
            if (boxEquipos) {
                if (!list.length) {
                    boxEquipos.innerHTML = '<div style="padding:10px; color:#6b7280; font-size:0.85rem;">Sin equipos.</div>';
                } else {
                    boxEquipos.innerHTML = list.slice(0, 200).map(eq => {
                        const desc = String(eq.descripcion || '').trim();
                        return `
                            <div style="padding:8px 10px; border-bottom:1px solid #f3f4f6;">
                                <div style="font-weight:900; color:#111827;">${escapeHtml(eq.id)}</div>
                                ${desc ? `<div style="font-size:0.8rem; color:#6b7280; margin-top:2px;">${escapeHtml(desc)}</div>` : ''}
                            </div>
                        `;
                    }).join('');
                }
            }
        } catch {}
    }

    function renderMapping() {
        const familiaKey = String(_selectedFamiliaKey || '').trim().toUpperCase();
        const varianteKey = String(_selectedVarianteKey || '').trim();
        if (!familiaKey) {
            try {
                if (boxDetalle) boxDetalle.style.display = 'none';
                if (lblTituloMap) lblTituloMap.textContent = 'Selecciona una familia…';
                if (lblSubMap) lblSubMap.textContent = '';
            } catch {}
            return;
        }

        const docId = mappingDocIdFor(familiaKey, varianteKey);
        _selectedMappingDocId = docId;
        const ov = getMappingDoc(docId);
        const selectedKeys = new Set(
            Array.isArray(ov && ov.catalogoDanosKeys) ? (ov.catalogoDanosKeys || []).map(x => normKey(x)) : []
        );

        try {
            if (lblTituloMap) lblTituloMap.textContent = varianteKey ? `${familiaKey} · ${varianteKey}` : familiaKey;
            if (lblSubMap) lblSubMap.textContent = `Firestore: equipos_overrides/${docId}`;
        } catch {}

        renderDrawAndEquipos(familiaKey, varianteKey);

        try {
            if (inputFamilia) inputFamilia.value = familiaKey;
            if (inputVariante) inputVariante.value = varianteKey;
        } catch {}

        try {
            if (boxParams) {
                const isAdmin = !!window.isAdmin;
                const canEdit = isAdmin && _isEditingMap;
                boxParams.innerHTML = allRows.map(r => {
                    const k = normKey(r.parametroKey || r.id);
                    const checked = selectedKeys.has(k);
                    return `
                        <label style="display:flex; gap:10px; align-items:flex-start; padding:8px 10px; border-bottom:1px solid #f3f4f6; cursor:${canEdit ? 'pointer' : 'default'};">
                            <input type="checkbox" data-param-key="${escapeHtml(k)}" ${checked ? 'checked' : ''} ${canEdit ? '' : 'disabled'} style="margin-top:2px;">
                            <span style="display:block;">
                                <div style="font-weight:900; color:#111827;">${escapeHtml(r.parametro || r.id)}</div>
                                <div style="font-size:0.78rem; color:#6b7280;">${escapeHtml((r.opciones || []).slice(0, 10).join(', '))}${(r.opciones || []).length > 10 ? '…' : ''}</div>
                            </span>
                        </label>
                    `;
                }).join('');
            }
        } catch {}

        try {
            const count = boxParams ? boxParams.querySelectorAll('input[type="checkbox"]:checked').length : 0;
            if (lblCountSel) lblCountSel.textContent = String(count);
        } catch {}

        try {
            if (boxDetalle) boxDetalle.style.display = '';
        } catch {}

        setEditingMap(false);
        setMsgMap('', false);
    }

    async function saveMapping() {
        const docId = String(_selectedMappingDocId || '').trim();
        const familiaKey = String(_selectedFamiliaKey || '').trim().toUpperCase();
        const varianteKey = String(_selectedVarianteKey || '').trim();
        if (!docId || !familiaKey) return;
        if (!window.isAdmin) return;

        const selected = [];
        try {
            if (boxParams) {
                boxParams.querySelectorAll('input[type="checkbox"][data-param-key]').forEach(chk => {
                    if (chk.checked) selected.push(String(chk.getAttribute('data-param-key') || '').trim());
                });
            }
        } catch {}

        const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        const ref = doc(window.db, 'equipos_overrides', docId);
        await setDoc(ref, {
            updatedAt: serverTimestamp(),
            source: 'ui_admin_catalogodanos',
            familiaKey,
            ...(varianteKey ? { varianteKey } : {}),
            catalogoDanosKeys: selected
        }, { merge: true });

        await loadEquiposAndOverrides();
        renderMapping();
    }

    async function waitForDbReady(timeoutMs = 8000) {
        const t0 = Date.now();
        while (Date.now() - t0 < timeoutMs) {
            try {
                if (window.db) return true;
            } catch {}
            await new Promise(r => setTimeout(r, 60));
        }
        try {
            if (!window.db) {
                const m = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
                if (m && typeof m.getFirestore === 'function') {
                    window.db = m.getFirestore();
                    return true;
                }
            }
        } catch {}
        return !!window.db;
    }

    function setMsg(text, show) {
        try {
            if (!msg) return;
            msg.textContent = String(text || '');
            msg.style.display = show ? '' : 'none';
        } catch {}
    }

    function setMsgMap(text, show) {
        try {
            if (!msgMap) return;
            msgMap.textContent = String(text || '');
            msgMap.style.display = show ? '' : 'none';
        } catch {}
    }

    let allRows = [];

    let _equiposList = [];
    let _overridesByKey = new Map();
    let _familiasIndex = [];
    let _selectedFamiliaKey = '';
    let _selectedVarianteKey = '';
    let _selectedMappingDocId = '';
    let _isEditingMap = false;
    let _expandedFamilies = new Set();

    function render() {
        if (!tbody) return;
        const q = normKey(inputBuscar ? inputBuscar.value : '');
        const filtered = !q
            ? allRows
            : allRows.filter(r => {
                const hay = `${r.parametroKey} ${r.parametro} ${(r.opciones || []).join(' ')}`;
                return normKey(hay).includes(q);
            });

        try {
            if (lblContador) lblContador.textContent = `${filtered.length} registros`;
        } catch {}

        if (!filtered.length) {
            tbody.innerHTML = '';
            setMsg('Sin resultados.', true);
            return;
        }
        setMsg('', false);

        const isAdmin = !!window.isAdmin;

        tbody.innerHTML = filtered.map(r => {
            const optsStr = (r.opciones || []).join(', ');
            const disabledAttr = isAdmin ? '' : 'disabled';
            const readonlyStyle = isAdmin ? '' : 'opacity:0.85;';

            return `
                <tr data-id="${escapeHtml(r.id)}" style="border-bottom:1px solid #e5e7eb;">
                    <td style="padding:0.4rem; white-space:nowrap; font-weight:700;">${escapeHtml(r.parametroKey || r.id)}</td>
                    <td style="padding:0.4rem; min-width:180px;">
                        <input ${disabledAttr} data-field="parametro" value="${escapeHtml(r.parametro || '')}" style="width:100%; padding:0.25rem 0.5rem; border-radius:0.5rem; border:1px solid #d1d5db; ${readonlyStyle}">
                    </td>
                    <td style="padding:0.4rem; min-width:320px;">
                        <input ${disabledAttr} data-field="opciones" value="${escapeHtml(optsStr)}" placeholder="Ej: GOLPE, DEFORMACION, ..." style="width:100%; padding:0.25rem 0.5rem; border-radius:0.5rem; border:1px solid #d1d5db; ${readonlyStyle}">
                    </td>
                    <td style="padding:0.4rem; white-space:nowrap; color:#6b7280;">${escapeHtml(fmtTs(r.updatedAt))}</td>
                    <td style="padding:0.4rem; white-space:nowrap;">
                        <button type="button" data-action="save" ${isAdmin ? '' : 'disabled'} style="padding:0.25rem 0.6rem; border-radius:999px; border:1px solid #bbf7d0; background:#ecfdf5; color:#166534; font-size:0.8rem;">Guardar</button>
                        <button type="button" data-action="delete" ${isAdmin ? '' : 'disabled'} style="padding:0.25rem 0.6rem; border-radius:999px; border:1px solid #fecaca; background:#fef2f2; color:#b91c1c; font-size:0.8rem; margin-left:6px;">Eliminar</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function loadCatalogo() {
        try {
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="padding:0.8rem; color:#64748b;">Cargando catálogo…</td></tr>';
            setMsg('', false);
        } catch {}

        const ok = await waitForDbReady();
        if (!ok) {
            setMsg('No se pudo inicializar Firestore.', true);
            if (tbody) tbody.innerHTML = '';
            return;
        }

        try {
            const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
            const snap = await getDocs(collection(window.db, 'catalogo_danos'));
            allRows = snap.docs
                .map(d => ({ id: d.id, ...(d.data() || {}) }))
                .sort((a, b) => String(a.parametroKey || a.id).localeCompare(String(b.parametroKey || b.id), 'es'));
            render();
        } catch (e) {
            console.error(e);
            setMsg('Error cargando catálogo. Revisa consola/permisos.', true);
            if (tbody) tbody.innerHTML = '';
        }
    }

    async function upsertRow(docId, payload) {
        const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        const ref = doc(window.db, 'catalogo_danos', docId);
        await setDoc(ref, {
            ...payload,
            parametroKey: payload.parametroKey || docId,
            updatedAt: serverTimestamp(),
            source: 'ui_admin'
        }, { merge: true });
    }

    async function deleteRow(docId) {
        const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        const ref = doc(window.db, 'catalogo_danos', docId);
        await deleteDoc(ref);
    }

    function parseOpcionesFromInput(s) {
        const raw = String(s ?? '');
        const parts = raw.split(',').map(x => String(x || '').trim()).filter(Boolean);
        const out = [];
        const seen = new Set();
        for (const p of parts) {
            const k = normKey(p);
            if (!k) continue;
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(p);
        }
        return out;
    }

    async function handleSave(tr) {
        const id = (tr?.getAttribute('data-id') || '').toString();
        if (!id) return;

        const inputParametro = tr.querySelector('input[data-field="parametro"]');
        const inputOpciones = tr.querySelector('input[data-field="opciones"]');

        const parametro = (inputParametro?.value || '').toString().trim();
        const opciones = parseOpcionesFromInput(inputOpciones?.value || '');

        if (!parametro) {
            alert('Falta Parámetro.');
            return;
        }

        const parametroKey = normKey(id);
        if (!parametroKey) {
            alert('Key inválida.');
            return;
        }

        const btn = tr.querySelector('button[data-action="save"]');
        const prev = btn ? btn.textContent : '';
        try {
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Guardando…';
            }
            await upsertRow(id, {
                parametroKey,
                parametro,
                opciones
            });
            await loadCatalogo();
        } catch (e) {
            console.error(e);
            alert('No se pudo guardar. Revisa permisos/consola.');
        } finally {
            try {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = prev || 'Guardar';
                }
            } catch {}
        }
    }

    async function handleDelete(tr) {
        const id = (tr?.getAttribute('data-id') || '').toString();
        if (!id) return;
        if (!confirm(`Eliminar "${id}" del catálogo?`)) return;

        const btn = tr.querySelector('button[data-action="delete"]');
        const prev = btn ? btn.textContent : '';
        try {
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Eliminando…';
            }
            await deleteRow(id);
            await loadCatalogo();
        } catch (e) {
            console.error(e);
            alert('No se pudo eliminar. Revisa permisos/consola.');
        } finally {
            try {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = prev || 'Eliminar';
                }
            } catch {}
        }
    }

    async function handleNuevo() {
        if (!window.isAdmin) return;
        const keyRaw = prompt('Key (ej: cuerpo, area de sellado, ...):');
        const key = normKey(keyRaw);
        if (!key) return;

        const parametro = (prompt('Nombre (Parámetro):') || '').toString().trim();
        if (!parametro) return;

        const opcionesRaw = (prompt('Opciones (separadas por coma):', 'GOLPE, DEFORMACION, ABRASION, LAVADURA, CORTADO, OTRO') || '').toString();
        const opciones = parseOpcionesFromInput(opcionesRaw);

        try {
            await upsertRow(key, { parametroKey: key, parametro, opciones });
            await loadCatalogo();
        } catch (e) {
            console.error(e);
            alert('No se pudo crear.');
        }
    }

    function bindEvents() {
        if (inputBuscar) {
            inputBuscar.addEventListener('input', () => {
                try { render(); } catch {}
            });
        }

        if (btnNuevo) {
            btnNuevo.addEventListener('click', () => {
                handleNuevo();
            });
        }

        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                const tr = btn.closest('tr');
                if (!tr) return;
                const action = btn.getAttribute('data-action');
                if (action === 'save') handleSave(tr);
                if (action === 'delete') handleDelete(tr);
            });
        }

        if (inputBuscarFam) {
            inputBuscarFam.addEventListener('input', () => {
                try { renderFamiliasTree(); } catch {}
            });
        }

        if (boxTree) {
            boxTree.addEventListener('click', (e) => {
                const node = e.target.closest('[data-kind]');
                if (!node) return;
                const kind = node.getAttribute('data-kind');
                const fam = String(node.getAttribute('data-fam') || '').trim().toUpperCase();
                const v = String(node.getAttribute('data-var') || '').trim();
                if (!fam) return;

                const famObj = _familiasIndex.find(x => x.familiaKey === fam);
                const hasVars = !!(famObj && Array.isArray(famObj.variantes) && famObj.variantes.length);

                if (kind === 'familia') {
                    _selectedFamiliaKey = fam;
                    _selectedVarianteKey = '';
                    if (hasVars) {
                        // Toggle expand/contract
                        if (_expandedFamilies.has(fam)) _expandedFamilies.delete(fam);
                        else _expandedFamilies.add(fam);
                    }
                    renderFamiliasTree();
                    renderMapping();
                    return;
                }

                if (kind === 'variante') {
                    _selectedFamiliaKey = fam;
                    _selectedVarianteKey = v;
                    if (hasVars) _expandedFamilies.add(fam);
                    renderFamiliasTree();
                    renderMapping();
                    return;
                }
            });
        }

        if (btnEditarMap) {
            btnEditarMap.addEventListener('click', () => {
                setEditingMap(true);
                setMsgMap('Edición habilitada. Ajusta y guarda.', true);
            });
        }

        if (btnGuardarMap) {
            btnGuardarMap.addEventListener('click', async () => {
                const prev = btnGuardarMap.textContent;
                try {
                    btnGuardarMap.disabled = true;
                    btnGuardarMap.textContent = 'Guardando…';
                    await saveMapping();
                    setMsgMap('Guardado.', true);
                } catch (e) {
                    console.error(e);
                    alert('No se pudo guardar el mapeo.');
                } finally {
                    btnGuardarMap.disabled = false;
                    btnGuardarMap.textContent = prev || 'Guardar mapeo';
                }
            });
        }

        if (boxParams) {
            boxParams.addEventListener('change', () => {
                try {
                    const count = boxParams.querySelectorAll('input[type="checkbox"]:checked').length;
                    if (lblCountSel) lblCountSel.textContent = String(count);
                } catch {}
            });
        }

        // Mostrar botón Nuevo solo cuando ya sepamos rol
        (async () => {
            try {
                const t0 = Date.now();
                while (Date.now() - t0 < 4000) {
                    if (typeof window.isAdmin === 'boolean') break;
                    await new Promise(r => setTimeout(r, 80));
                }
                if (btnNuevo) btnNuevo.style.display = window.isAdmin ? '' : 'none';
                if (btnEditarMap) btnEditarMap.style.display = window.isAdmin ? '' : 'none';
            } catch {}
        })();
    }

    bindEvents();
    (async () => {
        await loadCatalogo();
        await loadEquiposAndOverrides();
    })();
});
