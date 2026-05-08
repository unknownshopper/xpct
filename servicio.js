document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('srv-tbody');
  const cont = document.getElementById('srv-cont');
  const filtro = document.getElementById('srv-filtro');
  const chkTodos = document.getElementById('srv-todos');
  const selInfo = document.getElementById('srv-sel');
  const referencia = document.getElementById('srv-referencia');
  const noEmbarque = document.getElementById('srv-noembarque');
  const cliente = document.getElementById('srv-cliente');
  const direccion = document.getElementById('srv-direccion');
  const contacto = document.getElementById('srv-contacto');
  const fechaDoc = document.getElementById('srv-fecha');
  const entrega = document.getElementById('srv-entrega');
  const prioridad = document.getElementById('srv-prioridad');
  const btnCrear = document.getElementById('srv-btn-crear');
  const msg = document.getElementById('srv-msg');

  if (!tbody) return;

  let rows = [];
  let filtered = [];
  let vencPorEquipo = {}; // { [EQUIPO_KEY]: { lastMs, lastDateText, vencText, lastDocId } }

  function norm(v) {
    return String(v || '').trim();
  }

  function normKey(v) {
    return norm(v).toUpperCase();
  }

  function toMs(ts) {
    try {
      if (!ts) return null;
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      if (ts instanceof Date) return ts.getTime();
      if (typeof ts === 'number') return ts;
      if (typeof ts === 'string') {
        const ms = Date.parse(ts);
        return Number.isFinite(ms) ? ms : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function fmtDMY(ms) {
    if (!ms || !Number.isFinite(ms)) return '';
    const d = new Date(ms);
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function parseDMY(s) {
    const t = norm(s);
    if (!t) return null;
    // dd/mm/aa o dd/mm/aaaa
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return null;
    let dd = parseInt(m[1], 10);
    let mm = parseInt(m[2], 10);
    let yy = parseInt(m[3], 10);
    if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yy)) return null;
    if (yy < 100) yy = 2000 + yy;
    const dt = new Date(yy, mm - 1, dd);
    const ms = dt.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  function addOneYearMs(ms) {
    try {
      const d = new Date(ms);
      const y = d.getFullYear() + 1;
      const m = d.getMonth();
      const day = d.getDate();
      const out = new Date(y, m, day);
      return out.getTime();
    } catch {
      return null;
    }
  }

  function showMsg(text, isErr = false) {
    if (!msg) return;
    msg.style.display = text ? 'block' : 'none';
    msg.style.color = isErr ? '#b91c1c' : '#6b7280';
    msg.textContent = text || '';
  }

  async function ensureDb() {
    if (window.db) return window.db;
    let tries = 0;
    while (!window.db && tries < 40) {
      await new Promise(r => setTimeout(r, 100));
      tries++;
    }
    return window.db;
  }

  function selectedEquipos() {
    return Array.from(tbody.querySelectorAll('input[type="checkbox"][data-eq]:checked'))
      .map(c => ({
        equipo: String(c.getAttribute('data-eq') || ''),
        serial: String(c.getAttribute('data-serial') || ''),
        producto: String(c.getAttribute('data-producto') || ''),
        descripcion: String(c.getAttribute('data-desc') || ''),
      }))
      .filter(x => x.equipo);
  }

  function syncSelInfo() {
    const n = selectedEquipos().length;
    if (selInfo) selInfo.textContent = `${n} seleccionados`;
  }

  function render() {
    const q = normKey(filtro && filtro.value);
    filtered = q
      ? rows.filter(r => {
          const blob = [r.equipo, r.serial, r.producto, r.descripcion, r.ultimaPruebaHidro, r.vencimientoAnual].map(normKey).join(' ');
          return blob.includes(q);
        })
      : rows;

    if (cont) cont.textContent = `${filtered.length} equipos`;

    tbody.innerHTML = '';
    filtered.forEach((r, idx) => {
      const tr = document.createElement('tr');
      tr.style.background = (idx % 2 === 1) ? '#f9fafb' : '#ffffff';
      tr.innerHTML = `
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; text-align:center;">
          <input type="checkbox" data-eq="${r.equipo}" data-serial="${r.serial}" data-producto="${r.producto}" data-desc="${r.descripcion}">
        </td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap;">${r.equipo}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap; color:#6b7280;">${r.serial || '—'}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap;">${r.producto || '—'}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9;">${r.descripcion || ''}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap; color:#6b7280;">${r.ultimaPruebaHidro || '—'}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap; color:#6b7280;">${r.vencimientoAnual || '—'}</td>
        <td style="padding:6px 6px; border-top:1px solid #f1f5f9; white-space:nowrap;">${r.linkVerPrueba || '—'}</td>
      `;

      const c = tr.querySelector('input[type="checkbox"]');
      if (c) {
        c.addEventListener('change', () => {
          syncSelInfo();
          if (chkTodos) {
            const all = Array.from(tbody.querySelectorAll('input[type="checkbox"][data-eq]'));
            const checked = all.filter(x => x.checked);
            chkTodos.checked = !!all.length && checked.length === all.length;
            chkTodos.indeterminate = checked.length > 0 && checked.length < all.length;
          }
        });
      }
      tbody.appendChild(tr);
    });

    if (chkTodos) {
      chkTodos.checked = false;
      chkTodos.indeterminate = false;
    }
    syncSelInfo();
  }

  async function loadInventory() {
    try {
      const res = await fetch('docs/INVENTARIOTOTAL04-202602.csv');
      if (!res.ok) throw new Error('No se pudo cargar INVENTARIOTOTAL04-202602.csv');
      const text = await res.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
      if (!lines.length) return;
      const headers = (window.parseCSVLine ? window.parseCSVLine(lines[0]) : lines[0].split(','));

      const idxEquipo = headers.findIndex(h => normKey(h).includes('EQUIPO'));
      const idxSerial = headers.findIndex(h => normKey(h).includes('SERIAL'));
      const idxProd = headers.findIndex(h => normKey(h).includes('PRODUCTO'));
      const idxDesc = headers.findIndex(h => normKey(h).includes('DESCRIP'));

      const out = [];
      lines.slice(1).forEach(line => {
        const cols = window.parseCSVLine ? window.parseCSVLine(line) : line.split(',');
        const equipo = norm(cols[idxEquipo] || '');
        if (!equipo) return;
        const key = normKey(equipo);
        const info = vencPorEquipo[key] || null;
        const venc = info ? norm(info.vencText) : '';
        const ult = info ? norm(info.lastDateText) : '';
        const link = info
          ? `<a href="pruebaslist.html?equipo=${encodeURIComponent(equipo)}" style="display:inline-block; padding:0.15rem 0.45rem; border-radius:0.45rem; border:1px solid #d1d5db; text-decoration:none; color:#111827; font-weight:800;">Ver</a>`
          : '';
        out.push({
          equipo,
          serial: norm(cols[idxSerial] || ''),
          producto: norm(cols[idxProd] || ''),
          descripcion: norm(cols[idxDesc] || ''),
          ultimaPruebaHidro: ult,
          vencimientoAnual: venc,
          linkVerPrueba: link,
        });
      });

      rows = out.sort((a, b) => {
        const ea = normKey(a.equipo);
        const eb = normKey(b.equipo);
        if (ea < eb) return -1;
        if (ea > eb) return 1;
        return 0;
      });
      render();
    } catch (e) {
      console.error(e);
      showMsg('No se pudo cargar el inventario. Revisa consola.', true);
    }
  }

  async function loadVencimientosDesdePruebas() {
    try {
      const dbReady = await ensureDb();
      if (!dbReady) return;
      const { getFirestore, collection, getDocs, query, orderBy, limit } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
      const db = getFirestore();

      // Ojo: el listado oficial usa colección "pruebas" (no "pruebasPresion").
      // Traemos recientes para calcular última prueba hidrostática y vencimiento.
      let snap;
      try {
        snap = await getDocs(query(collection(db, 'pruebas'), orderBy('creadoEn', 'desc'), limit(4000)));
      } catch {
        // Fallback si no existe el índice/campo creadoEn
        snap = await getDocs(collection(db, 'pruebas'));
      }
      try {
        console.debug('[servicio] pruebas snapshot size:', snap.size);
      } catch {}
      const map = {};
      let dbgShown = 0;
      snap.docs.forEach(d => {
        const data = d.data() || {};
        if (dbgShown < 1) {
          dbgShown++;
          try {
            console.debug('[servicio] ejemplo prueba doc:', {
              id: d.id,
              equipo: data.equipo,
              fechaRealizacion: data.fechaRealizacion,
              proxima: data.proxima,
              periodo: data.periodo,
              pruebaTipo: data.pruebaTipo,
              prueba: data.prueba,
              creadoEn: data.creadoEn,
            });
          } catch {}
        }
        const eq = norm(data.equipo);
        const key = normKey(eq);
        if (!key) return;

        const pruebaTipo = normKey(data.pruebaTipo || data.prueba || '');
        const esHidro = !pruebaTipo || pruebaTipo.includes('HIDRO');
        if (!esHidro) return;

        const msReal = parseDMY(data.fechaRealizacion);
        const msFechaPrueba = parseDMY(data.fechaPrueba);
        const msCreated = toMs(data.creadoEn);
        const msStartTime = toMs(data.startTime);
        const msLocal = toMs(data.creadoEnLocal);
        const ms = msReal || msFechaPrueba || msStartTime || msCreated || msLocal;
        if (!ms) return;

        // Vencimiento anual: si la prueba ya trae "proxima" (muy común), usarla.
        // Si no, calcular + 1 año.
        const proximaMs = parseDMY(data.proxima);
        const vencMs = proximaMs || addOneYearMs(ms);

        const prev = map[key];
        if (!prev || ms > prev.lastMs) {
          map[key] = {
            lastMs: ms,
            lastDateText: fmtDMY(ms),
            vencText: vencMs ? fmtDMY(vencMs) : '',
            lastDocId: d.id,
          };
        }
      });
      vencPorEquipo = map;
      try {
        console.debug('[servicio] equipos con ultima prueba calculada:', Object.keys(map).length);
      } catch {}
    } catch (e) {
      console.error(e);
    }
  }

  if (filtro) filtro.addEventListener('input', () => render());

  if (chkTodos) {
    chkTodos.addEventListener('change', () => {
      const all = Array.from(tbody.querySelectorAll('input[type="checkbox"][data-eq]'));
      all.forEach(c => { c.checked = chkTodos.checked; });
      chkTodos.indeterminate = false;
      syncSelInfo();
    });
  }

  if (btnCrear) {
    btnCrear.addEventListener('click', async () => {
      try {
        showMsg('');
        const items = selectedEquipos();
        if (!items.length) { showMsg('Selecciona al menos un equipo.', true); return; }
        const refTxt = norm(referencia && referencia.value);
        if (!refTxt) { showMsg('Captura la referencia.', true); return; }
        const noEmb = norm(noEmbarque && noEmbarque.value);
        const cli = norm(cliente && cliente.value);
        const dir = norm(direccion && direccion.value);
        const con = norm(contacto && contacto.value);
        const fec = norm(fechaDoc && fechaDoc.value);
        const ent = norm(entrega && entrega.value);

        if (!window.db) { showMsg('Firestore no está disponible.', true); return; }

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
          prioridad: norm(prioridad && prioridad.value) || 'NORMAL',
          estatus: 'ABIERTA',
          items,
          itemsCount: items.length,
          creadoEn: serverTimestamp(),
          creadoPor: String(window.currentUserEmail || (window.auth?.currentUser?.email || '') || '').toLowerCase(),
        };

        const ref = await addDoc(collection(db, 'servicioOrdenes'), payload);
        showMsg(`Orden creada: ${ref.id}`);
        try { window.location.href = `serviciolist.html?id=${encodeURIComponent(ref.id)}`; } catch {}
      } catch (e) {
        console.error(e);
        showMsg('No se pudo crear la orden. Revisa consola.', true);
      }
    });
  }

  (async () => {
    await loadVencimientosDesdePruebas();
    await loadInventory();
  })();
});
