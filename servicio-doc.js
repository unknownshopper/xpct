document.addEventListener('DOMContentLoaded', () => {
  const msg = document.getElementById('doc-msg');
  const sub = document.getElementById('doc-sub');
  const btnPrint = document.getElementById('doc-print');

  const pagesWrap = document.getElementById('doc-pages');

  function norm(v) {
    return String(v || '').trim();
  }

  function fmtDate(ts) {
    try {
      if (!ts) return '';
      if (typeof ts.toDate === 'function') {
        return ts.toDate().toLocaleString('es-MX');
      }
      if (ts instanceof Date) return ts.toLocaleString('es-MX');
      if (typeof ts === 'string') {
        const ms = Date.parse(ts);
        if (Number.isFinite(ms)) return new Date(ms).toLocaleString('es-MX');
        return ts;
      }
      if (typeof ts === 'number') return new Date(ts).toLocaleString('es-MX');
      return '';
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

  function esc(s) {
    return norm(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  function pageHtml({ o, items, pageNum, totalPages }) {
    const fechaDoc = norm(o.fechaDoc) || (fmtDate(o.creadoEn) || '');
    const referencia = norm(o.referencia || o.motivo || '');
    const prioridad = norm(o.prioridad || '');
    const noEmbarque = norm(o.noEmbarque || '');
    const cliente = norm(o.cliente || '');
    const direccion = norm(o.direccion || '');
    const contacto = norm(o.contacto || '');
    const entrega = norm(o.entregaNombre || '');
    const prov = norm(o.proveedor || 'Proveedora y Comercializadora Tabasqueña');

    const rows = items.map((it, idx) => {
      const cant = (it && (it.cantidad || it.cant)) ? String(it.cantidad || it.cant) : '1';
      const desc = norm(it.descripcion || it.producto || '');
      const ident = norm(it.equipo || '');
      const ultAnual = norm(it.ultimaPruebaAnual || it.ultimaPruebaHidro || '');
      const vencAnual = norm(it.vencimientoAnual || '');
      return `
        <tr>
          <td style="border:1px solid #111827; padding:3px 4px; text-align:center; width:22px;">${idx + 1 + ((pageNum - 1) * 20)}</td>
          <td style="border:1px solid #111827; padding:3px 4px; text-align:center; width:36px;">${esc(cant)}</td>
          <td style="border:1px solid #111827; padding:3px 4px;">${esc(desc)}</td>
          <td style="border:1px solid #111827; padding:3px 4px; text-align:center; white-space:nowrap; font-weight:700;">${esc(ident)}</td>
          <td style="border:1px solid #111827; padding:3px 4px; text-align:center; white-space:nowrap;">${esc(ultAnual) || '—'}</td>
          <td style="border:1px solid #111827; padding:3px 4px; text-align:center; white-space:nowrap;">${esc(vencAnual) || '—'}</td>
          <td style="border:1px solid #111827; padding:3px 4px; text-align:center; width:64px;">&nbsp;</td>
        </tr>
      `;
    }).join('');

    const emptyRows = Math.max(0, 20 - items.length);
    const blanks = Array.from({ length: emptyRows }).map((_, i) => `
      <tr>
        <td style="border:1px solid #111827; padding:3px 4px; text-align:center;">&nbsp;</td>
        <td style="border:1px solid #111827; padding:3px 4px; text-align:center;">&nbsp;</td>
        <td style="border:1px solid #111827; padding:3px 4px;">&nbsp;</td>
        <td style="border:1px solid #111827; padding:3px 4px;">&nbsp;</td>
        <td style="border:1px solid #111827; padding:3px 4px;">&nbsp;</td>
        <td style="border:1px solid #111827; padding:3px 4px;">&nbsp;</td>
        <td style="border:1px solid #111827; padding:3px 4px;">&nbsp;</td>
      </tr>
    `).join('');

    return `
      <section class="pct-page">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="display:flex; align-items:center; justify-content:center;">
              <img src="img/logopctch.png" alt="Logo PCT" style="display:block; height:44px; width:auto;" />
            </div>
            <div>
              <div style="font-weight:900;">${esc(prov)}</div>
              <div style="font-size:0.85rem;">Manifiesto de Movilización de Equipos, Herramientas y Materiales</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.85rem;">No. Embarque:</div>
            <div style="border:1px solid #111827; padding:4px 8px; font-weight:900; display:inline-block; min-width:110px;">${esc(noEmbarque || o.id || '')}</div>
            <div style="font-size:0.8rem; margin-top:4px;">${pageNum} de ${totalPages}</div>
          </div>
        </div>

        <div style="margin-top:10px; border:1px solid #111827;">
          <div style="display:grid; grid-template-columns: 1.2fr 0.8fr 0.6fr;">
            <div style="border-right:1px solid #111827; padding:6px 8px;">
              <div style="font-size:0.85rem;"><strong>Cliente:</strong> ${esc(cliente)}</div>
              <div style="font-size:0.85rem; margin-top:4px;"><strong>Dirección:</strong> ${esc(direccion)}</div>
              <div style="font-size:0.85rem; margin-top:4px;"><strong>Contacto:</strong> ${esc(contacto)}</div>
            </div>
            <div style="border-right:1px solid #111827; padding:6px 8px;">
              <div style="font-size:0.85rem;"><strong>Fecha:</strong> ${esc(fechaDoc)}</div>
              <div style="font-size:0.85rem; margin-top:4px;"><strong>Entrega:</strong> ${esc(entrega)}</div>
              <div style="font-size:0.85rem; margin-top:4px;"><strong>Referencia:</strong> ${esc(referencia)}</div>
            </div>
            <div style="padding:6px 8px;">
              <div style="font-size:0.85rem;"><strong>Prioridad:</strong> ${esc(prioridad)}</div>
            </div>
          </div>
        </div>

        <div style="margin-top:10px;">
          <table style="width:100%; border-collapse:collapse; font-size:0.78rem;">
            <thead>
              <tr>
                <th style="border:1px solid #111827; padding:4px; width:22px;">#</th>
                <th style="border:1px solid #111827; padding:4px; width:36px;">Cant</th>
                <th style="border:1px solid #111827; padding:4px;">Descripción</th>
                <th style="border:1px solid #111827; padding:4px; width:140px;">Identificación</th>
                <th style="border:1px solid #111827; padding:4px; width:110px;">Última prueba anual</th>
                <th style="border:1px solid #111827; padding:4px; width:110px;">Vencimiento anual</th>
                <th style="border:1px solid #111827; padding:4px; width:64px;">Entregado</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              ${blanks}
            </tbody>
          </table>
        </div>

        <div style="margin-top:10px; border:1px solid #111827; padding:8px; min-height:40px;">
          <div style="font-size:0.8rem;"><strong>Comentarios</strong></div>
          <div style="height:28px;"></div>
        </div>

        <div style="margin-top:10px; font-size:0.75rem; line-height:1.15;">
          Por medio del presente documento, y con fecha y lugar señalado anteriormente en la parte superior del presente, se da entera constancia, una vez realizada la inspección y verificación pertinente del equipo, herramienta y materiales, de que recibe el/a mi entera satisfacción, los equipos arriba citados.
        </div>

        <div style="margin-top:10px; border:1px solid #111827;">
          <div style="display:grid; grid-template-columns: 1fr 1fr;">
            <div style="border-right:1px solid #111827; padding:8px; min-height:52px;">
              <div style="font-size:0.8rem;"><strong>Recibe:</strong></div>
              <div style="margin-top:28px; border-top:1px solid #111827;"></div>
            </div>
            <div style="padding:8px; min-height:52px;">
              <div style="font-size:0.8rem;"><strong>Entrega:</strong></div>
              <div style="margin-top:28px; border-top:1px solid #111827;">${esc(entrega)}</div>
            </div>
          </div>
        </div>

        <div style="margin-top:8px; display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:0.78rem;">
          <div>Orden: <strong>${esc(o.id || '')}</strong></div>
          <div>Generado por: <strong>${esc(o.creadoPor || '')}</strong></div>
        </div>
      </section>
    `;
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

  async function load() {
    try {
      showMsg('');
      const params = new URLSearchParams(window.location.search || '');
      const id = norm(params.get('id'));
      if (!id) {
        showMsg('Falta el parámetro id.', true);
        return;
      }

      if (sub) sub.textContent = `Orden: ${id}`;

      const dbReady = await ensureDb();
      if (!dbReady) {
        showMsg('Firestore no está disponible.', true);
        return;
      }

      const { getFirestore, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
      const db = getFirestore();
      const snap = await getDoc(doc(db, 'servicioOrdenes', id));
      if (!snap.exists()) {
        showMsg('No se encontró la orden.', true);
        return;
      }

      const o = { id: snap.id, ...snap.data() };
      const items = Array.isArray(o.items) ? o.items : [];

      const pages = chunk(items, 20);
      const totalPages = pages.length || 1;
      if (pagesWrap) {
        pagesWrap.innerHTML = pages.map((p, idx) => pageHtml({ o, items: p, pageNum: idx + 1, totalPages })).join('');
      }

      if (btnPrint) {
        btnPrint.addEventListener('click', () => {
          try { window.print(); } catch {}
        });
      }
    } catch (e) {
      console.error(e);
      showMsg('No se pudo cargar el documento. Revisa consola.', true);
    }
  }

  load();
});
