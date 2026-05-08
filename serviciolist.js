document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('srvlist-tbody');
  const cont = document.getElementById('srvlist-cont');
  const buscar = document.getElementById('srvlist-buscar');
  const estado = document.getElementById('srvlist-estado');
  const btnRef = document.getElementById('srvlist-refresh');
  const msg = document.getElementById('srvlist-msg');
  const det = document.getElementById('srvlist-det');

  const badTbody = document.getElementById('srvbad-tbody');
  const badCont = document.getElementById('srvbad-cont');
  const badBuscar = document.getElementById('srvbad-buscar');
  const badSel = document.getElementById('srvbad-sel');
  const badChkTodos = document.getElementById('srvbad-todos');
  const badReferencia = document.getElementById('srvbad-referencia');
  const badNoEmbarque = document.getElementById('srvbad-noembarque');
  const badCliente = document.getElementById('srvbad-cliente');
  const badDireccion = document.getElementById('srvbad-direccion');
  const badContacto = document.getElementById('srvbad-contacto');
  const badFecha = document.getElementById('srvbad-fecha');
  const badEntrega = document.getElementById('srvbad-entrega');
  const badPrioridad = document.getElementById('srvbad-prioridad');
  const badBtnCrear = document.getElementById('srvbad-crear');
  const badMsg = document.getElementById('srvbad-msg');

  if (!tbody) return;

  let ordenes = [];
  let badEquipos = [];
  let unsubInspecciones = null;

  function norm(v) {
    return String(v || '').trim();
  }

  function normKey(v) {
    return norm(v).toUpperCase();
  }

  function fmtDate(ts) {
    try {
      if (!ts) return '';
      const d = (typeof ts.toDate === 'function') ? ts.toDate() : (ts instanceof Date ? ts : null);
      if (!d) return '';
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
    } catch {
      return '';
    }
  }

  function showMsg(text, isErr = false) {
    if (!msg) return;
    msg.style.display = text ? 'block' : 'none';
    msg.style.color = isErr ? '#b91c1c' : '#6b7280';
    msg.textContent = text || '';
  }

  function showBadMsg(text, isErr = false) {
    if (!badMsg) return;
    badMsg.style.display = text ? 'block' : 'none';
    badMsg.style.color = isErr ? '#b91c1c' : '#6b7280';
    badMsg.textContent = text || '';
  }

  function canEditOrdenes() {
    return !!(window.isAdmin || window.isDirector);
  }

  function isOrdenAbierta(o) {
    return normKey(o && o.estatus) === 'ABIERTA';
  }

  function equiposEnOrdenesAbiertas() {
    const set = new Set();
    (Array.isArray(ordenes) ? ordenes : []).forEach(o => {
      if (!isOrdenAbierta(o)) return;
      const items = Array.isArray(o.items) ? o.items : [];
      items.forEach(it => {
        const eq = normKey(it && it.equipo);
        if (eq) set.add(eq);
      });
    });
    return set;
  }

  function badSelectedItems() {
    if (!badTbody) return [];
    return Array.from(badTbody.querySelectorAll('input[type="checkbox"][data-eq]:checked'))
      .map(c => ({
        equipo: String(c.getAttribute('data-eq') || '').trim(),
        serial: String(c.getAttribute('data-serial') || '').trim(),
        producto: String(c.getAttribute('data-producto') || '').trim(),
        descripcion: String(c.getAttribute('data-desc') || '').trim(),
      }))
      .filter(x => x.equipo);
  }

  function syncBadSelInfo() {
    if (!badSel) return;
    const n = badSelectedItems().length;
    badSel.textContent = `${n} seleccionados`;
  }

  function renderBad() {
    if (!badTbody) return;
    const q = normKey(badBuscar && badBuscar.value);
    const abiertos = equiposEnOrdenesAbiertas();

    const out = (Array.isArray(badEquipos) ? badEquipos : [])
      .filter(r => {
        const eqKey = normKey(r.equipo);
        if (!eqKey) return false;
        if (abiertos.has(eqKey)) return false;
        if (!q) return true;
        const blob = [r.equipo, r.serial, r.cliente, r.ubicacion, (r.parametros || []).join(' ')].map(normKey).join(' ');
        return blob.includes(q);
      });

    if (badCont) badCont.textContent = `${out.length} equipos`;
    badTbody.innerHTML = '';

    out.forEach((r, idx) => {
      const tr = document.createElement('tr');
      tr.style.background = (idx % 2 === 1) ? '#f9fafb' : '#ffffff';
      const paramsTxt = Array.isArray(r.parametros) ? r.parametros.join(', ') : '';
      tr.innerHTML = `
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; text-align:center;">
          <input type="checkbox" data-eq="${norm(r.equipo)}" data-serial="${norm(r.serial)}" data-producto="" data-desc="" />
        </td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap; font-weight:700;">${norm(r.equipo)}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap; color:#6b7280;">${norm(r.serial) || '—'}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap;">${norm(r.cliente) || '—'}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap;">${norm(r.ubicacion) || '—'}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9;">${paramsTxt}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap; color:#6b7280;">${fmtDate(r.fecha) || '—'}</td>
      `;
      const c = tr.querySelector('input[type="checkbox"]');
      if (c) {
        c.addEventListener('change', () => {
          syncBadSelInfo();
          if (badChkTodos) {
            const all = Array.from(badTbody.querySelectorAll('input[type="checkbox"][data-eq]'));
            const checked = all.filter(x => x.checked);
            badChkTodos.checked = !!all.length && checked.length === all.length;
            badChkTodos.indeterminate = checked.length > 0 && checked.length < all.length;
          }
        });
      }
      badTbody.appendChild(tr);
    });

    if (badChkTodos) {
      badChkTodos.checked = false;
      badChkTodos.indeterminate = false;
    }
    syncBadSelInfo();
  }

  function toMs(ts) {
    try {
      if (!ts) return null;
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      if (ts instanceof Date) return ts.getTime();
      if (typeof ts === 'number') return ts;
      return null;
    } catch {
      return null;
    }
  }

  function computeBadFromInspecciones(inspecciones) {
    const byEquipo = new Map();
    (Array.isArray(inspecciones) ? inspecciones : []).forEach(insp => {
      const equipo = norm(insp && insp.equipo);
      const eqKey = normKey(equipo);
      if (!eqKey) return;
      const params = Array.isArray(insp.parametros) ? insp.parametros : [];
      const badParams = params
        .filter(p => {
          const est = normKey(p && p.estado);
          return est === 'MALO' || est === 'NO LEGIBLE';
        })
        .map(p => norm(p && p.nombre))
        .filter(Boolean);
      if (!badParams.length) return;

      const fecha = insp.fecha || insp.creadoEn || null;
      const ms = toMs(fecha) || 0;
      const prev = byEquipo.get(eqKey);
      if (!prev || ms >= (prev._ms || 0)) {
        byEquipo.set(eqKey, {
          equipo,
          serial: norm(insp && insp.serial),
          cliente: norm(insp && insp.cliente),
          ubicacion: norm(insp && (insp.ubicacion || insp.lugar)),
          fecha,
          parametros: Array.from(new Set(badParams)).slice(0, 12),
          _ms: ms,
        });
      } else {
        // Si hay inspección más vieja, pero aporta más parámetros, los fusionamos conservando la fecha más reciente
        try {
          const merged = Array.from(new Set([...(prev.parametros || []), ...badParams])).slice(0, 12);
          prev.parametros = merged;
        } catch {}
      }
    });
    badEquipos = Array.from(byEquipo.values())
      .sort((a, b) => {
        const ma = a._ms || 0;
        const mb = b._ms || 0;
        return mb - ma;
      });
  }

  function renderDetalle(o) {
    if (!det) return;
    if (!o) { det.style.display = 'none'; det.innerHTML = ''; return; }

    const items = Array.isArray(o.items) ? o.items : [];
    const editable = canEditOrdenes();
    const rows = items
      .map((it, idx) => {
        const eq = norm(it.equipo);
        const se = norm(it.serial);
        const pr = norm(it.producto);
        const de = norm(it.descripcion);
        return `
          <tr>
            <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap;">${eq}</td>
            <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap; color:#6b7280;">${se || '—'}</td>
            <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap;">${pr || '—'}</td>
            <td style="padding:6px 6px; border-top:1px solid #f1f5f9;">${de}</td>
            ${editable ? `<td style="padding:6px 6px; border-top:1px solid #f1f5f9; text-align:right; white-space:nowrap;">\
              <button type="button" data-ord-id="${norm(o.id || '')}" data-item-idx="${idx}" style="padding:0.25rem 0.5rem; border-radius:0.45rem; border:1px solid #fecaca; background:#fff; color:#991b1b; cursor:pointer; font-weight:800;">Quitar</button>\
            </td>` : ''}
          </tr>
        `;
      })
      .join('');

    det.style.display = 'block';
    det.innerHTML = `
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:900; color:#111827;">Orden ${norm(o.id || '')}</div>
          <div style="font-size:0.85rem; color:#4b5563; margin-top:2px;">${norm(o.estatus || '')} · ${norm(o.prioridad || '')} · ${fmtDate(o.creadoEn)}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <a id="srvlist-det-doc" href="servicio-doc.html?id=${encodeURIComponent(norm(o.id || ''))}" target="_blank" rel="noopener" style="display:inline-block; padding:0.35rem 0.6rem; border-radius:0.5rem; border:1px solid #0ea5e9; background:#0ea5e9; color:#ffffff; text-decoration:none; font-weight:900;">Generar documento</a>
          ${editable ? '<button id="srvlist-det-del" type="button" style="padding:0.35rem 0.6rem; border-radius:0.5rem; border:1px solid #fecaca; background:#fff; color:#991b1b; cursor:pointer; font-weight:900;">Eliminar orden</button>' : ''}
          <button id="srvlist-det-cerrar" type="button" style="padding:0.35rem 0.6rem; border-radius:0.5rem; border:1px solid #d1d5db; background:#fff; cursor:pointer;">Cerrar</button>
        </div>
      </div>
      <div style="margin-top:0.6rem; font-size:0.9rem;"><strong>Referencia:</strong> ${norm(o.referencia || o.motivo || '')}</div>
      <div style="margin-top:0.6rem; overflow:auto; border:1px solid #e5e7eb; border-radius:0.6rem;">
        <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:6px 6px; text-align:left;">Equipo</th>
              <th style="padding:6px 6px; text-align:left;">Serial</th>
              <th style="padding:6px 6px; text-align:left;">Producto</th>
              <th style="padding:6px 6px; text-align:left;">Descripción</th>
              ${editable ? '<th style="padding:6px 6px; text-align:right;">Acciones</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;

    const btnCerrar = document.getElementById('srvlist-det-cerrar');
    if (btnCerrar) btnCerrar.addEventListener('click', () => renderDetalle(null));

    if (editable) {
      const btnDel = document.getElementById('srvlist-det-del');
      if (btnDel) {
        btnDel.addEventListener('click', async (ev) => {
          try {
            ev.preventDefault();
            ev.stopPropagation();

            const ordId = norm(o.id || '');
            if (!ordId) return;

            const curr = ordenes.find(x => String(x && x.id) === ordId) || o;
            const currItems = Array.isArray(curr.items) ? curr.items : [];

            if (currItems.length > 0) {
              alert('Para eliminar la orden, primero debes quitar todos los equipos.');
              return;
            }

            const ok = window.confirm(`¿Eliminar la orden ${ordId}? Esta acción no se puede deshacer.`);
            if (!ok) return;

            if (!window.db) { showMsg('Firestore no está disponible.', true); return; }
            const { getFirestore, doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
            const db = getFirestore();
            await deleteDoc(doc(db, 'servicioOrdenes', ordId));

            ordenes = (Array.isArray(ordenes) ? ordenes : []).filter(x => String(x && x.id) !== ordId);
            render();
            renderDetalle(null);
          } catch (e) {
            console.error(e);
            alert('No se pudo eliminar la orden. Revisa consola.');
          }
        });
      }
    }

    if (editable) {
      Array.from(det.querySelectorAll('button[data-ord-id][data-item-idx]')).forEach(btn => {
        btn.addEventListener('click', async (ev) => {
          try {
            ev.preventDefault();
            ev.stopPropagation();

            const ordId = String(btn.getAttribute('data-ord-id') || '').trim();
            const idxStr = String(btn.getAttribute('data-item-idx') || '').trim();
            const idx = parseInt(idxStr, 10);
            if (!ordId || Number.isNaN(idx)) return;

            const curr = ordenes.find(x => String(x && x.id) === ordId) || o;
            const currItems = Array.isArray(curr.items) ? curr.items : [];
            if (idx < 0 || idx >= currItems.length) return;

            const nextItems = currItems.slice(0, idx).concat(currItems.slice(idx + 1));
            const ok = window.confirm(`¿Quitar este equipo de la orden ${ordId}?`);
            if (!ok) return;

            if (!window.db) { showMsg('Firestore no está disponible.', true); return; }
            const { getFirestore, doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
            const db = getFirestore();
            await updateDoc(doc(db, 'servicioOrdenes', ordId), {
              items: nextItems,
              itemsCount: nextItems.length,
            });

            // Actualizar cache local
            const hit = ordenes.find(x => String(x && x.id) === ordId);
            if (hit) {
              hit.items = nextItems;
              hit.itemsCount = nextItems.length;
            } else {
              try {
                curr.items = nextItems;
                curr.itemsCount = nextItems.length;
              } catch {}
            }
            render();
            renderDetalle(hit || curr);
          } catch (e) {
            console.error(e);
            alert('No se pudo quitar el equipo. Revisa consola.');
          }
        });
      });
    }
  }

  function render() {
    const q = normKey(buscar && buscar.value);
    const est = normKey(estado && estado.value);

    const out = ordenes
      .filter(o => {
        if (est && normKey(o.estatus) !== est) return false;
        if (!q) return true;
        const items = Array.isArray(o.items) ? o.items : [];
        const anyEq = items.map(it => normKey(it.equipo)).join(' ');
        const blob = [o.id, o.motivo, o.prioridad, o.estatus, o.creadoPor, anyEq].map(normKey).join(' ');
        return blob.includes(q);
      })
      .slice();

    if (cont) cont.textContent = `${out.length} órdenes`;
    tbody.innerHTML = '';

    out.forEach((o, idx) => {
      const tr = document.createElement('tr');
      tr.style.background = (idx % 2 === 1) ? '#f9fafb' : '#ffffff';
      tr.style.cursor = 'pointer';
      tr.innerHTML = `
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap;">${norm(o.estatus || '')}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap;">${norm(o.prioridad || '')}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9;">${norm(o.referencia || o.motivo || '')}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap;">${norm(o.areaProveedor || '') || '—'}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; text-align:right; white-space:nowrap;">${Number(o.itemsCount || (Array.isArray(o.items) ? o.items.length : 0) || 0)}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap; color:#6b7280;">${norm(o.creadoPor || '') || '—'}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap; color:#6b7280;">${fmtDate(o.creadoEn) || '—'}</td>
      `;
      tr.addEventListener('click', () => renderDetalle(o));
      tbody.appendChild(tr);
    });
  }

  async function loadInspeccionesOnce() {
    try {
      if (!window.db) return;
      const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
      const db = getFirestore();
      const col = collection(db, 'inspecciones');
      const snap = await getDocs(col);
      const insp = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      computeBadFromInspecciones(insp);
      renderBad();
    } catch (e) {
      console.error(e);
      showBadMsg('No se pudieron cargar inspecciones (pendientes por reparación).', true);
    }
  }

  async function startInspeccionesLive() {
    try {
      if (!window.db) return;
      if (typeof window.isInspector === 'boolean' && window.isInspector) {
        // Inspector: mantener en vivo mejora la operación (y evita recargar página)
      }
      const { getFirestore, collection, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
      const db = getFirestore();
      const col = collection(db, 'inspecciones');
      if (typeof onSnapshot !== 'function') return;

      if (typeof unsubInspecciones === 'function') {
        try { unsubInspecciones(); } catch {}
      }

      unsubInspecciones = onSnapshot(col, (snap) => {
        try {
          const insp = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          computeBadFromInspecciones(insp);
          renderBad();
        } catch (e) {
          console.error('Error procesando inspecciones live', e);
        }
      }, (err) => {
        console.error('onSnapshot inspecciones error', err);
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function load() {
    try {
      showMsg('');
      if (!window.db) { showMsg('Firestore no está disponible.', true); return; }
      const { getFirestore, collection, getDocs, query, orderBy, limit } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
      const db = getFirestore();
      const col = collection(db, 'servicioOrdenes');
      const q = query(col, orderBy('creadoEn', 'desc'), limit(250));
      const snap = await getDocs(q);
      ordenes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      render();
      renderBad();

      // Deep-link: ?id=...
      try {
        const params = new URLSearchParams(window.location.search || '');
        const id = norm(params.get('id'));
        if (id) {
          const found = ordenes.find(o => String(o.id) === id);
          if (found) renderDetalle(found);
        }
      } catch {}

      // Inspecciones (pendientes por reparación)
      await loadInspeccionesOnce();
      await startInspeccionesLive();
    } catch (e) {
      console.error(e);
      showMsg('No se pudieron cargar las órdenes. Revisa consola.', true);
    }
  }

  if (buscar) buscar.addEventListener('input', () => render());
  if (estado) estado.addEventListener('change', () => render());
  if (btnRef) btnRef.addEventListener('click', () => load());

  if (badBuscar) badBuscar.addEventListener('input', () => renderBad());

  if (badChkTodos && badTbody) {
    badChkTodos.addEventListener('change', () => {
      const all = Array.from(badTbody.querySelectorAll('input[type="checkbox"][data-eq]'));
      all.forEach(c => { c.checked = badChkTodos.checked; });
      badChkTodos.indeterminate = false;
      syncBadSelInfo();
    });
  }

  if (badBtnCrear) {
    badBtnCrear.addEventListener('click', async () => {
      try {
        showBadMsg('');
        const items = badSelectedItems();
        if (!items.length) { showBadMsg('Selecciona al menos un equipo.', true); return; }
        const refTxt = norm(badReferencia && badReferencia.value);
        if (!refTxt) { showBadMsg('Captura la referencia.', true); return; }
        const noEmb = norm(badNoEmbarque && badNoEmbarque.value);
        const cli = norm(badCliente && badCliente.value);
        const dir = norm(badDireccion && badDireccion.value);
        const con = norm(badContacto && badContacto.value);
        const fec = norm(badFecha && badFecha.value);
        const ent = norm(badEntrega && badEntrega.value);
        const pri = norm(badPrioridad && badPrioridad.value) || 'NORMAL';
        if (!window.db) { showBadMsg('Firestore no está disponible.', true); return; }

        const { getFirestore, collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        const db = getFirestore();
        const payload = {
          tipo: 'SERVICIO',
          referencia: refTxt,
          motivo: refTxt,
          noEmbarque: noEmb,
          cliente: cli,
          direccion: dir,
          contacto: con,
          fechaDoc: fec,
          entregaNombre: ent,
          prioridad: pri,
          estatus: 'ABIERTA',
          items,
          itemsCount: items.length,
          creadoEn: serverTimestamp(),
          creadoPor: String(window.currentUserEmail || (window.auth?.currentUser?.email || '') || '').toLowerCase(),
          origen: 'INSPECCIONES_BAD',
        };
        const ref = await addDoc(collection(db, 'servicioOrdenes'), payload);
        showBadMsg(`Orden creada: ${ref.id}`);
        try { window.location.href = `serviciolist.html?id=${encodeURIComponent(ref.id)}`; } catch {}
      } catch (e) {
        console.error(e);
        showBadMsg('No se pudo crear la orden. Revisa consola.', true);
      }
    });
  }

  load();
});
