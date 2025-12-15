// Lógica del tabulador de períodos de facturación para actividadmin.html
// Usa la colección actividadPeriodos en Firestore.

(function () {
  function initTabulador() {
    const modal = document.getElementById('adm-modal-tabulador');
    const modalHeader = document.getElementById('adm-tabulador-header');
    const modalTbody = document.getElementById('adm-tabulador-tbody');

    const inputInicio = document.getElementById('adm-per-inicio');
    const inputFin = document.getElementById('adm-per-fin');
    const inputTipo = document.getElementById('adm-per-tipo');
    const inputTarifa = document.getElementById('adm-per-tarifa');
    const inputDias = document.getElementById('adm-per-dias');
    const inputImporte = document.getElementById('adm-per-importe');
    const inputFactura = document.getElementById('adm-per-factura');
    const inputObs = document.getElementById('adm-per-obs');
    const btnGuardar = document.getElementById('adm-per-guardar');
    const btnGenerar = document.getElementById('adm-per-generar');
    const btnCerrar = document.getElementById('adm-tabulador-cerrar');
    const btnImprimir = document.getElementById('adm-tabulador-imprimir');

    const tbodyActividad = document.getElementById('adm-tbody-actividad');
    if (!modal || !modalHeader || !modalTbody || !tbodyActividad) return;

    let actividadActual = null; // { id, cliente, area, equipo, precioDiario, os, inicioServicio, terminacionServicio }

    function parseFechaDdMmAa(fechaTexto) {
      if (!fechaTexto) return null;
      const partes = fechaTexto.split('/');
      if (partes.length !== 3) return null;
      const dd = parseInt(partes[0], 10);
      const mm = parseInt(partes[1], 10);
      const aa = parseInt(partes[2], 10);
      if (!dd || !mm || isNaN(aa)) return null;
      const yyyy = 2000 + aa;
      const d = new Date(yyyy, mm - 1, dd);
      if (isNaN(d.getTime())) return null;
      return d;
    }

    function recalcularPeriodo() {
      if (!inputInicio || !inputFin || !inputTarifa || !inputDias || !inputImporte) return;
      const inicio = inputInicio.value.trim();
      const fin = inputFin.value.trim();
      const tarifa = Number(inputTarifa.value || 0);
      const dIni = inicio ? parseFechaDdMmAa(inicio) : null;
      const dFin = fin ? parseFechaDdMmAa(fin) : null;
      let dias = 0;
      if (dIni && dFin) {
        const diffMs = dFin.getTime() - dIni.getTime();
        const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDias >= 0) dias = diffDias + 1;
      }
      inputDias.value = dias || '';
      const importe = dias && tarifa ? dias * tarifa : 0;
      inputImporte.value = importe || '';
    }

    if (inputInicio && inputFin && inputTarifa) {
      ['input', 'change', 'blur'].forEach((ev) => {
        inputInicio.addEventListener(ev, recalcularPeriodo);
        inputFin.addEventListener(ev, recalcularPeriodo);
        inputTarifa.addEventListener(ev, recalcularPeriodo);
      });
    }

    if (btnGenerar) {
      btnGenerar.addEventListener('click', generarPeriodosAutomaticos);
    }

    async function cargarPeriodosActividad(actividadId) {
      try {
        const { getFirestore, collection, query, where, getDocs } = await import(
          'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
        );
        const db = getFirestore();
        const col = collection(db, 'actividadPeriodos');
        const q = query(col, where('actividadId', '==', actividadId));
        const snap = await getDocs(q);
        const res = [];
        snap.forEach((d) => res.push({ id: d.id, ...d.data() }));
        // Ordenar en memoria por inicioPeriodoOrdenable si existe
        res.sort((a, b) => {
          const ai = a.inicioPeriodoOrdenable || 0;
          const bi = b.inicioPeriodoOrdenable || 0;
          return ai - bi;
        });
        return res;
      } catch (e) {
        console.error('Error al cargar períodos de actividad', e);
        return [];
      }
    }

    function renderTablaPeriodos(periodos) {
      modalTbody.innerHTML = '';
      if (!periodos.length) return;
      periodos.forEach((p) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb;">${p.inicioPeriodo || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb;">${p.finPeriodo || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; text-align:right;">${p.diasFacturados || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; text-align:right;">${p.tarifaDiaria || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; text-align:right;">${p.importe || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb;">${p.tipoPeriodo || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb;">${p.factura || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb;">${p.observaciones || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; white-space:nowrap;">
            <button type="button" class="adm-per-eliminar" data-id="${p.id}" style="font-size:0.7rem; color:#b91c1c;">Eliminar</button>
          </td>
        `;
        modalTbody.appendChild(tr);
      });

      modalTbody.querySelectorAll('.adm-per-eliminar').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const pid = btn.getAttribute('data-id');
          if (!pid || !actividadActual) return;
          if (!confirm('¿Eliminar este período?')) return;
          try {
            const { getFirestore, doc, deleteDoc } = await import(
              'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
            );
            const db = getFirestore();
            await deleteDoc(doc(db, 'actividadPeriodos', pid));
            const nuevos = await cargarPeriodosActividad(actividadActual.id);
            renderTablaPeriodos(nuevos);
          } catch (e) {
            console.error('Error al eliminar período', e);
          }
        });
      });
    }

    function abrirModal(datos) {
      actividadActual = datos;
      const lineaCliente = `${datos.cliente || ''} / ${datos.area || ''} / ${datos.equipo || ''}`;
      const lineaServicio = `OS: ${datos.os || ''}  |  Servicio: ${datos.inicioServicio || ''} ${datos.terminacionServicio ? '→ ' + datos.terminacionServicio : ''}`;
      modalHeader.textContent = `${lineaCliente}  —  ${lineaServicio}`;

      // Prefill del nuevo período con las fechas del servicio por defecto
      if (inputInicio) inputInicio.value = datos.inicioServicio || '';
      if (inputFin) inputFin.value = datos.terminacionServicio || '';
      if (inputTarifa) inputTarifa.value = datos.precioDiario || '';
      if (inputDias) inputDias.value = '';
      if (inputImporte) inputImporte.value = '';
      if (inputFactura) inputFactura.value = '';
      if (inputObs) inputObs.value = '';

      recalcularPeriodo();

      modal.style.display = 'flex';

      cargarPeriodosActividad(datos.id).then((periodos) => {
        renderTablaPeriodos(periodos);
      });
    }

    function formatearFechaDdMmAa(date) {
      const d = date.getDate().toString().padStart(2, '0');
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const a = (date.getFullYear() % 100).toString().padStart(2, '0');
      return `${d}/${m}/${a}`;
    }

    async function generarPeriodosAutomaticos() {
      if (!actividadActual) return;
      const inicioTexto = actividadActual.inicioServicio;
      if (!inicioTexto) {
        alert('La actividad no tiene Inicio del servicio definido.');
        return;
      }

      const dInicioServicio = parseFechaDdMmAa(inicioTexto);
      if (!dInicioServicio) {
        alert('Inicio del servicio con formato inválido.');
        return;
      }

      const finTexto = actividadActual.terminacionServicio;
      const hoy = new Date();
      let dFinServicio = finTexto ? parseFechaDdMmAa(finTexto) : hoy;
      if (!dFinServicio) dFinServicio = hoy;

      if (dFinServicio < dInicioServicio) {
        alert('La terminación del servicio es anterior al inicio.');
        return;
      }

      if (!confirm('Se generarán períodos automáticos desde el inicio hasta la terminación del servicio, eliminando los períodos existentes de esta actividad. ¿Continuar?')) {
        return;
      }

      try {
        const { getFirestore, collection, query, where, getDocs, doc, deleteDoc, addDoc, serverTimestamp } = await import(
          'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
        );
        const db = getFirestore();
        const col = collection(db, 'actividadPeriodos');

        // 1) Eliminar períodos existentes
        const q = query(col, where('actividadId', '==', actividadActual.id));
        const snap = await getDocs(q);
        for (const d of snap.docs) {
          await deleteDoc(doc(db, 'actividadPeriodos', d.id));
        }

        // 2) Generar nuevos períodos 26–25
        let inicioPeriodoDate = new Date(dInicioServicio.getTime());

        while (inicioPeriodoDate <= dFinServicio) {
          // Calcular fin teórico del período: día 25
          let year = inicioPeriodoDate.getFullYear();
          let month = inicioPeriodoDate.getMonth(); // 0-11
          let day = inicioPeriodoDate.getDate();

          let finTeorico;
          if (day <= 25) {
            // Cierra el 25 del mismo mes
            finTeorico = new Date(year, month, 25);
          } else {
            // Cierra el 25 del siguiente mes
            if (month === 11) {
              year += 1;
              month = 0;
            } else {
              month += 1;
            }
            finTeorico = new Date(year, month, 25);
          }

          let finPeriodoDate = finTeorico;
          let tipoPeriodo = 'PARCIAL';
          if (finPeriodoDate > dFinServicio) {
            finPeriodoDate = new Date(dFinServicio.getTime());
            tipoPeriodo = 'FINAL';
          }

          const inicioStr = formatearFechaDdMmAa(inicioPeriodoDate);
          const finStr = formatearFechaDdMmAa(finPeriodoDate);

          // Calcular días inclusivos
          const diffMs = finPeriodoDate.getTime() - inicioPeriodoDate.getTime();
          const dias = diffMs >= 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1 : 0;

          await addDoc(col, {
            actividadId: actividadActual.id,
            inicioPeriodo: inicioStr,
            finPeriodo: finStr,
            inicioPeriodoOrdenable: inicioPeriodoDate.getTime(),
            diasFacturados: dias,
            tarifaDiaria: Number(actividadActual.precioDiario || 0),
            importe: dias * Number(actividadActual.precioDiario || 0),
            tipoPeriodo,
            factura: '',
            observaciones: '',
            creadoEn: serverTimestamp(),
          });

          if (finPeriodoDate >= dFinServicio) {
            break; // último período
          }

          // Siguiente período inicia al día siguiente del fin actual
          inicioPeriodoDate = new Date(finPeriodoDate.getTime());
          inicioPeriodoDate.setDate(inicioPeriodoDate.getDate() + 1);
        }

        const periodos = await cargarPeriodosActividad(actividadActual.id);
        renderTablaPeriodos(periodos);
      } catch (e) {
        console.error('Error al generar períodos automáticos', e);
        alert('No se pudieron generar los períodos automáticos. Revisa la consola.');
      }
    }

    // Botones Tabulador en la tabla de actividades (delegación de eventos)
    tbodyActividad.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.adm-btn-tabulador');
      if (!btn || !tbodyActividad.contains(btn)) return;

      const id = btn.getAttribute('data-id');
      if (!id) return;
      const cliente = btn.getAttribute('data-cliente') || '';
      const area = btn.getAttribute('data-area') || '';
      const equipo = btn.getAttribute('data-equipo') || '';
      const precioDiario = Number(btn.getAttribute('data-precioequipo') || 0);
      const os = btn.getAttribute('data-os') || '';
      const inicioServicio = btn.getAttribute('data-inicio') || '';
      const terminacionServicio = btn.getAttribute('data-terminacion') || '';

      abrirModal({ id, cliente, area, equipo, precioDiario, os, inicioServicio, terminacionServicio });
    });

    if (btnGuardar) {
      btnGuardar.addEventListener('click', async () => {
        if (!actividadActual) return;
        const inicio = inputInicio ? inputInicio.value.trim() : '';
        const fin = inputFin ? inputFin.value.trim() : '';
        const tipo = inputTipo ? inputTipo.value || 'PARCIAL' : 'PARCIAL';
        const tarifa = Number(inputTarifa ? inputTarifa.value || 0 : 0);
        const dias = Number(inputDias ? inputDias.value || 0 : 0);
        const importe = Number(inputImporte ? inputImporte.value || 0 : 0);
        const factura = inputFactura ? inputFactura.value.trim() : '';
        const obs = inputObs ? inputObs.value.trim() : '';

        const dIni = inicio ? parseFechaDdMmAa(inicio) : null;
        const dFin = fin ? parseFechaDdMmAa(fin) : null;
        if (!dIni || !dFin) {
          alert('Inicio y fin de período son obligatorios y deben tener formato dd/mm/aa');
          return;
        }
        if (dFin < dIni) {
          alert('La fecha fin no puede ser anterior a la fecha inicio');
          return;
        }

        try {
          const { getFirestore, collection, addDoc, serverTimestamp } = await import(
            'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
          );
          const db = getFirestore();
          const col = collection(db, 'actividadPeriodos');
          const inicioOrdenable = dIni.getTime();
          await addDoc(col, {
            actividadId: actividadActual.id,
            inicioPeriodo: inicio,
            finPeriodo: fin,
            inicioPeriodoOrdenable: inicioOrdenable,
            diasFacturados: dias,
            tarifaDiaria: tarifa,
            importe,
            tipoPeriodo: tipo,
            factura,
            observaciones: obs,
            creadoEn: serverTimestamp(),
          });

          const periodos = await cargarPeriodosActividad(actividadActual.id);
          renderTablaPeriodos(periodos);
        } catch (e) {
          console.error('Error al guardar período de actividad', e);
          alert('No se pudo guardar el período. Revisa la consola.');
        }
      });
    }

    if (btnCerrar) {
      btnCerrar.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }

    if (btnImprimir) {
      btnImprimir.addEventListener('click', () => {
        if (!actividadActual) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const titulo = `Tabulador - ${actividadActual.cliente || ''} / ${actividadActual.area || ''} / ${actividadActual.equipo || ''}`;
        const tablaElem = document.getElementById('adm-tabulador-tbody');
        const tablaHtml = tablaElem && tablaElem.parentElement ? tablaElem.parentElement.outerHTML : '';

        printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo}</title>
            <style>
                body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#111827;padding:16px;}
                h1{font-size:18px;margin-bottom:4px;}
                p{margin:2px 0 8px 0;font-size:11px;}
                table{width:100%;border-collapse:collapse;font-size:11px;}
                th,td{border:1px solid #d1d5db;padding:4px;text-align:left;}
                th{background:#f3f4f6;}
            </style>
        </head><body>`);
        printWindow.document.write(`<h1>${titulo}</h1>`);
        printWindow.document.write(`<p>OS: ${actividadActual.os || ''}</p>`);
        printWindow.document.write(`<p>Inicio servicio: ${actividadActual.inicioServicio || ''} &nbsp;&nbsp; Terminación servicio: ${actividadActual.terminacionServicio || ''}</p>`);
        printWindow.document.write(tablaHtml);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTabulador);
  } else {
    initTabulador();
  }
})();

