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
    const inputOc = document.getElementById('adm-per-oc');
    const inputObs = document.getElementById('adm-per-obs');
    const btnGenerar = document.getElementById('adm-per-generar');
    const btnLimpiar = document.getElementById('adm-per-limpiar');
    const btnGuardar = document.getElementById('adm-per-guardar');
    const btnCerrar = document.getElementById('adm-tabulador-cerrar');
    const btnImprimir = document.getElementById('adm-tabulador-imprimir');

    const tbodyActividad = document.getElementById('adm-tbody-actividad');
    if (!modal || !modalHeader || !modalTbody || !tbodyActividad) return;

    let actividadActual = null; // { id, cliente, area, ubicacion, equipo, precioDiario, os, inicioServicio, terminacionServicio }

    function parseFechaDdMmAa(fechaTexto) {
      if (!fechaTexto) return null;
      const partes = fechaTexto.split('/');
      if (partes.length !== 3) return null;
      const dd = parseInt(partes[0], 10);
      const mm = parseInt(partes[1], 10);
      const aa = parseInt(partes[2], 10);
      if (!dd || !mm || isNaN(aa)) return null;
      const yyyy = 2000 + aa;
      const time = Date.UTC(yyyy, mm - 1, dd);
      const d = new Date(time);
      if (isNaN(d.getTime())) return null;
      return d; // fecha anclada a UTC 00:00
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
        const diffDias = Math.floor(diffMs / 86400000);
        if (diffDias >= 0) dias = diffDias + 1; // inclusivo
      }
      inputDias.value = dias || '';
      const importe = dias && tarifa ? dias * tarifa : 0;
      inputImporte.value = importe || '';
    }

    function formatearInputFechaDdMmAa(input) {
      if (!input) return;
      input.addEventListener('input', () => {
        let v = input.value.replace(/[^0-9]/g, ''); // solo dígitos
        if (v.length > 6) v = v.slice(0, 6); // ddmmaaa (aa=2 dígitos)
        // insertar '/'
        if (v.length > 4) {
          v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
        } else if (v.length > 2) {
          v = v.slice(0, 2) + '/' + v.slice(2);
        }
        input.value = v;
      });
    }

    if (btnLimpiar) {
      btnLimpiar.addEventListener('click', async () => {
        await limpiarTabuladorActual();
      });
    }

    if (btnGenerar) {
      btnGenerar.addEventListener('click', async () => {
        await generarPeriodosEntreFechas();
      });
    }

    function esHalliburton() {
      const c = (actividadActual && actividadActual.cliente) ? String(actividadActual.cliente).toUpperCase() : '';
      return c === 'HALLIBURTON';
    }

    function sugerirFinCorte25(desdeStr) {
      if (!esHalliburton()) return;
      if (!inputFin) return;
      if ((inputFin.value || '').trim().length >= 6) return;
      const dIni = desdeStr ? parseFechaDdMmAa(desdeStr) : null;
      if (!dIni) return;
      const y = dIni.getUTCFullYear();
      const m = dIni.getUTCMonth();
      const dia = dIni.getUTCDate();
      let fin;
      if (dia <= 25) {
        fin = new Date(Date.UTC(y, m, 25));
      } else {
        fin = new Date(Date.UTC(y, m + 1, 25));
      }
      inputFin.value = formatearFechaDdMmAa(fin);
      recalcularPeriodo();
    }

    if (inputInicio && inputFin && inputTarifa) {
      // Formateo automático de fechas mientras se escribe
      formatearInputFechaDdMmAa(inputInicio);
      formatearInputFechaDdMmAa(inputFin);

      ['input', 'change', 'blur'].forEach((ev) => {
        inputInicio.addEventListener(ev, recalcularPeriodo);
        inputFin.addEventListener(ev, recalcularPeriodo);
        inputTarifa.addEventListener(ev, recalcularPeriodo);
      });

      // Sugerir fecha de fin al corte 25 para HALLIBURTON cuando cambie inicio
      inputInicio.addEventListener('change', () => {
        if (!inputInicio) return;
        if (esHalliburton() && (!inputFin.value || inputFin.value.length < 6)) {
          sugerirFinCorte25(inputInicio.value.trim());
        }
      });

      // Con Tab/blur el evento change no siempre dispara; reforzar sugerencia al salir del campo.
      inputInicio.addEventListener('blur', () => {
        if (!inputInicio) return;
        if (esHalliburton() && (!inputFin.value || inputFin.value.length < 6)) {
          sugerirFinCorte25(inputInicio.value.trim());
        }
      });
    }

    // Se desactiva la generación automática de períodos; todos deben capturarse manualmente.

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
        // Ordenar en memoria siempre de más antiguo a más reciente:
        // 1) inicioPeriodoOrdenable
        // 2) si empatan, por fecha de finPeriodo
        res.sort((a, b) => {
          const ai = a.inicioPeriodoOrdenable || 0;
          const bi = b.inicioPeriodoOrdenable || 0;
          if (ai !== bi) return ai - bi;

          const fa = a.finPeriodo ? parseFechaDdMmAa(a.finPeriodo) : null;
          const fb = b.finPeriodo ? parseFechaDdMmAa(b.finPeriodo) : null;
          const ta = fa ? fa.getTime() : 0;
          const tb = fb ? fb.getTime() : 0;
          return ta - tb;
        });
        return res;
      } catch (e) {
        console.error('Error al cargar períodos de actividad', e);
        return [];
      }
    }

    function finMesUtc(d) {
      // d es Date UTC
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    }

    function fechaMax(a, b) {
      return (a.getTime() >= b.getTime()) ? a : b;
    }

    function fechaMin(a, b) {
      return (a.getTime() <= b.getTime()) ? a : b;
    }

    function diffDiasInclusivoUtc(dIni, dFin) {
      const ms = dFin.getTime() - dIni.getTime();
      const dd = Math.floor(ms / 86400000);
      return dd >= 0 ? (dd + 1) : 0;
    }

    function construirCortesHalliburton(dIni, dFin) {
      // Cortes al 25: primer fin = 25 del mes (si día<=25) o 25 del mes siguiente
      const segmentos = [];
      let curIni = new Date(Date.UTC(dIni.getUTCFullYear(), dIni.getUTCMonth(), dIni.getUTCDate()));
      const finGlobal = new Date(Date.UTC(dFin.getUTCFullYear(), dFin.getUTCMonth(), dFin.getUTCDate()));
      while (curIni.getTime() <= finGlobal.getTime()) {
        const y = curIni.getUTCFullYear();
        const m = curIni.getUTCMonth();
        const dia = curIni.getUTCDate();
        let curFin;
        if (dia <= 25) curFin = new Date(Date.UTC(y, m, 25));
        else curFin = new Date(Date.UTC(y, m + 1, 25));
        curFin = fechaMin(curFin, finGlobal);
        segmentos.push({ inicio: curIni, fin: curFin });
        // siguiente inicio = día siguiente
        const next = new Date(curFin.getTime());
        next.setUTCDate(next.getUTCDate() + 1);
        curIni = next;
      }
      return segmentos;
    }

    function construirCortesFinMes(dIni, dFin) {
      const segmentos = [];
      let curIni = new Date(Date.UTC(dIni.getUTCFullYear(), dIni.getUTCMonth(), dIni.getUTCDate()));
      const finGlobal = new Date(Date.UTC(dFin.getUTCFullYear(), dFin.getUTCMonth(), dFin.getUTCDate()));
      while (curIni.getTime() <= finGlobal.getTime()) {
        let curFin = finMesUtc(curIni);
        curFin = fechaMin(curFin, finGlobal);
        segmentos.push({ inicio: curIni, fin: curFin });
        const next = new Date(curFin.getTime());
        next.setUTCDate(next.getUTCDate() + 1);
        curIni = next;
      }
      return segmentos;
    }

    async function limpiarTabuladorActual() {
      if (!actividadActual || !actividadActual.id) return;
      const existentes = await cargarPeriodosActividad(actividadActual.id);
      if (!existentes.length) {
        renderTablaPeriodos([]);
        return;
      }
      const ok = confirm(`¿Eliminar TODOS los períodos del tabulador?\nActividad: ${actividadActual.os || actividadActual.id}\nPeríodos: ${existentes.length}`);
      if (!ok) return;
      try {
        const { getFirestore, doc, writeBatch } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        const db = getFirestore();
        const batch = writeBatch(db);
        existentes.forEach(p => {
          if (!p.id) return;
          batch.delete(doc(db, 'actividadPeriodos', p.id));
        });
        await batch.commit();
        renderTablaPeriodos([]);
      } catch (e) {
        console.error('Error al limpiar tabulador', e);
        alert('No se pudo limpiar el tabulador. Revisa la consola.');
      }
    }

    async function generarPeriodosEntreFechas() {
      if (!actividadActual || !actividadActual.id) {
        alert('No hay actividad seleccionada.');
        return;
      }
      const iniStr = (inputInicio ? inputInicio.value.trim() : '');
      const finStr = (inputFin ? inputFin.value.trim() : '');
      const tipoSel = (inputTipo ? inputTipo.value : 'PARCIAL') || 'PARCIAL';
      const tarifa = Number(inputTarifa ? inputTarifa.value || 0 : 0);
      const dIni = iniStr ? parseFechaDdMmAa(iniStr) : null;
      const dFin = finStr ? parseFechaDdMmAa(finStr) : null;
      if (!dIni || !dFin) {
        alert('Inicio y fin son obligatorios para generar períodos.');
        return;
      }
      if (dFin < dIni) {
        alert('La fecha fin no puede ser anterior a la fecha inicio.');
        return;
      }

      const existentes = await cargarPeriodosActividad(actividadActual.id);
      if (existentes.length) {
        const ok = confirm(`Ya existen ${existentes.length} períodos en este tabulador.\nPara generar de nuevo, primero usa "Limpiar tabulador".\n¿Continuar de todos modos (NO recomendando)?`);
        if (!ok) return;
      }

      const segs = esHalliburton()
        ? construirCortesHalliburton(dIni, dFin)
        : construirCortesFinMes(dIni, dFin);

      if (!segs.length) {
        alert('No se pudieron generar períodos con esas fechas.');
        return;
      }

      const ok2 = confirm(`Se generarán ${segs.length} períodos entre ${iniStr} y ${finStr}.\nCliente: ${actividadActual.cliente || ''}\n¿Continuar?`);
      if (!ok2) return;

      try {
        const { getFirestore, collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        const db = getFirestore();
        const col = collection(db, 'actividadPeriodos');

        // Crear uno por uno para mantener compatibilidad (writeBatch tiene límite 500)
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          const inicioTxt = formatearFechaDdMmAa(s.inicio);
          const finTxt = formatearFechaDdMmAa(s.fin);
          const dias = diffDiasInclusivoUtc(s.inicio, s.fin);
          const importe = dias && tarifa ? dias * tarifa : 0;
          const tipoPeriodo = (tipoSel === 'FINAL' && i === segs.length - 1) ? 'FINAL' : 'PARCIAL';
          await addDoc(col, {
            actividadId: actividadActual.id,
            inicioPeriodo: inicioTxt,
            finPeriodo: finTxt,
            inicioPeriodoOrdenable: s.inicio.getTime(),
            diasFacturados: dias,
            tarifaDiaria: tarifa,
            importe,
            tipoPeriodo,
            factura: '',
            oc: '',
            observaciones: '',
            creadoEn: serverTimestamp(),
          });
        }

        const periodosNuevos = await cargarPeriodosActividad(actividadActual.id);
        renderTablaPeriodos(periodosNuevos);

        // Preparar captura siguiente
        if (inputInicio && inputFin) {
          const ult = periodosNuevos && periodosNuevos.length ? periodosNuevos[periodosNuevos.length - 1] : null;
          if (ult && ult.finPeriodo && (ult.tipoPeriodo || '') !== 'FINAL') {
            const dUlt = parseFechaDdMmAa(ult.finPeriodo);
            if (dUlt) {
              dUlt.setUTCDate(dUlt.getUTCDate() + 1);
              inputInicio.value = formatearFechaDdMmAa(dUlt);
            }
            inputFin.value = '';
          }
        }
        recalcularPeriodo();
      } catch (e) {
        console.error('Error al generar períodos', e);
        alert('No se pudieron generar períodos. Revisa la consola.');
      }
    }

    function renderTablaPeriodos(periodos) {
      modalTbody.innerHTML = '';
      if (!periodos.length) return;
      let totalDias = 0;
      periodos.forEach((p) => {
        const di = p.inicioPeriodo ? parseFechaDdMmAa(p.inicioPeriodo) : null;
        const df = p.finPeriodo ? parseFechaDdMmAa(p.finPeriodo) : null;
        let diasCalc = 0;
        if (di && df) {
          const diffMs = df.getTime() - di.getTime();
          const diffDias = Math.floor(diffMs / 86400000);
          if (diffDias >= 0) diasCalc = diffDias + 1;
        }
        const diasMostrar = Number(p.diasFacturados || 0) || diasCalc || 0;
        totalDias += diasMostrar;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb;">${p.inicioPeriodo || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb;">${p.finPeriodo || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; text-align:right;">${diasMostrar || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; text-align:right;">${p.tarifaDiaria || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; text-align:right;">${p.importe || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb;">${p.tipoPeriodo || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb;">${p.oc || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb;">${p.factura || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb;">${p.observaciones || ''}</td>
          <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; white-space:nowrap;">
            <button type="button" class="adm-per-eliminar" data-id="${p.id}" style="font-size:0.7rem; color:#b91c1c;">Eliminar</button>
          </td>
        `;
        modalTbody.appendChild(tr);
      });

      // Fila de totales
      const trTot = document.createElement('tr');
      trTot.innerHTML = `
        <td style="padding:0.35rem; border-top:2px solid #e5e7eb; font-weight:700;" colspan="2">TOTAL</td>
        <td style="padding:0.35rem; border-top:2px solid #e5e7eb; text-align:right; font-weight:700;">${totalDias || ''}</td>
        <td style="padding:0.35rem; border-top:2px solid #e5e7eb;" colspan="7"></td>
      `;
      modalTbody.appendChild(trTot);

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

      // Fila informativa de continuidad: solo si el último período es PARCIAL
      const ultimo = periodos[periodos.length - 1];
      if (ultimo && ultimo.finPeriodo && ultimo.tipoPeriodo !== 'FINAL') {
        const dFin = parseFechaDdMmAa(ultimo.finPeriodo);
        if (dFin) {
          dFin.setDate(dFin.getDate() + 1);
          const inicioContinuidad = formatearFechaDdMmAa(dFin);

          const trInfo = document.createElement('tr');
          trInfo.innerHTML = `
            <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; font-style:italic;">${inicioContinuidad}</td>
            <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; font-style:italic;">&nbsp;</td>
            <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; text-align:right; font-style:italic;">&nbsp;</td>
            <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; text-align:right; font-style:italic;">${ultimo.tarifaDiaria || ''}</td>
            <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; text-align:right; font-style:italic;">&nbsp;</td>
            <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; font-style:italic;">CONTINUIDAD</td>
            <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; font-style:italic;">&nbsp;</td>
            <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; font-style:italic;">Fecha de continuidad abierta</td>
            <td style="padding:0.3rem; border-bottom:1px solid #e5e7eb; white-space:nowrap;">&nbsp;</td>
          `;
          modalTbody.appendChild(trInfo);
        }
      }
    }

    async function inicializarPeriodosSiNecesario(datos) {
      const periodosExistentes = await cargarPeriodosActividad(datos.id);
      if (periodosExistentes && periodosExistentes.length) {
        renderTablaPeriodos(periodosExistentes);
        return;
      }

      const inicio = datos.inicioServicio || '';
      const fin = datos.terminacionServicio || '';
      if (!inicio || !fin) {
        renderTablaPeriodos([]);
        return;
      }

      const dIni = parseFechaDdMmAa(inicio);
      const dFin = parseFechaDdMmAa(fin);
      if (!dIni || !dFin || dFin < dIni) {
        renderTablaPeriodos([]);
        return;
      }

      const diffMs = dFin.getTime() - dIni.getTime();
      const dias = diffMs >= 0 ? Math.floor(diffMs / 86400000) + 1 : 0;
      const tarifa = Number(datos.precioDiario || 0);
      const importe = dias && tarifa ? dias * tarifa : 0;

      try {
        const { getFirestore, collection, addDoc, serverTimestamp } = await import(
          'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
        );
        const db = getFirestore();
        const col = collection(db, 'actividadPeriodos');
        const inicioOrdenable = dIni.getTime();
        await addDoc(col, {
          actividadId: datos.id,
          inicioPeriodo: inicio,
          finPeriodo: fin,
          inicioPeriodoOrdenable: inicioOrdenable,
          diasFacturados: dias,
          tarifaDiaria: tarifa,
          importe,
          tipoPeriodo: 'PARCIAL',
          factura: '',
          oc: '',
          observaciones: '',
          creadoEn: serverTimestamp(),
        });

        const periodos = await cargarPeriodosActividad(datos.id);
        renderTablaPeriodos(periodos);
      } catch (e) {
        console.error('Error al crear período inicial desde servicio', e);
        renderTablaPeriodos([]);
      }
    }

    async function abrirModal(datos) {
      // Refrescar la actividad desde Firestore para reflejar cambios recientes
      try {
        const { getFirestore, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        const db = getFirestore();
        if (datos && datos.id) {
          const ref = doc(db, 'actividades', datos.id);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            const act = snap.data() || {};
            datos.inicioServicio = (act.inicioServicio || datos.inicioServicio || '');
            datos.terminacionServicio = (act.terminacionServicio || datos.terminacionServicio || '');
            datos.precioDiario = Number(act.precio || datos.precioDiario || 0);
            datos.os = (act.os || datos.os || '');
          }
        }
      } catch {}

      actividadActual = datos;

      const periodos = await cargarPeriodosActividad(datos.id);
      const ultimo = periodos && periodos.length ? periodos[periodos.length - 1] : null;
      const finMostrar = (ultimo && ultimo.finPeriodo) ? ultimo.finPeriodo : (datos.terminacionServicio || '');

      const lineaCliente = `${datos.cliente || ''} / ${datos.area || ''} / ${datos.ubicacion || ''} / ${datos.equipo || ''}`;
      const lineaServicio = `OS: ${datos.os || ''}  |  Servicio: ${datos.inicioServicio || ''} ${finMostrar ? '→ ' + finMostrar : ''}`;
      modalHeader.textContent = `${lineaCliente}  —  ${lineaServicio}`;

      // Prefill: si hay períodos, NO usar terminacionServicio; sugerir continuidad
      if (inputTarifa) inputTarifa.value = datos.precioDiario || '';
      if (inputDias) inputDias.value = '';
      if (inputImporte) inputImporte.value = '';
      if (inputFactura) inputFactura.value = '';
      if (inputOc) inputOc.value = '';
      if (inputObs) inputObs.value = '';

      if (periodos && periodos.length) {
        renderTablaPeriodos(periodos);
        if (inputInicio) {
          if (ultimo && ultimo.finPeriodo && (ultimo.tipoPeriodo || '') !== 'FINAL') {
            const dFin = parseFechaDdMmAa(ultimo.finPeriodo);
            if (dFin) {
              dFin.setUTCDate(dFin.getUTCDate() + 1);
              inputInicio.value = formatearFechaDdMmAa(dFin);
            } else {
              inputInicio.value = datos.inicioServicio || '';
            }
          } else {
            inputInicio.value = datos.inicioServicio || '';
          }
        }
        if (inputFin) inputFin.value = '';
      } else {
        if (inputInicio) inputInicio.value = datos.inicioServicio || '';
        if (inputFin) inputFin.value = datos.terminacionServicio || '';
        await inicializarPeriodosSiNecesario(datos);
      }

      recalcularPeriodo();

      modal.style.display = 'flex';
    }

    function formatearFechaDdMmAa(date) {
      const d = date.getUTCDate().toString().padStart(2, '0');
      const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
      const a = (date.getUTCFullYear() % 100).toString().padStart(2, '0');
      return `${d}/${m}/${a}`;
    }


    // Abrir Tabulador al hacer clic en la fila de actividad (excepto en checkboxes, inputs y botón Eliminar)
    tbodyActividad.addEventListener('click', async (ev) => {
      const target = ev.target;

      // Ignorar clics en checkboxes, inputs y botón Eliminar (dejar que su propia lógica actúe)
      if (
        target.closest('.adm-btn-eliminar') ||
        target.closest('input') ||
        target.tagName === 'BUTTON'
      ) {
        return;
      }

      const tr = target.closest('tr');
      if (!tr || !tbodyActividad.contains(tr)) return;

      const id = tr.getAttribute('data-id');
      if (!id) return;

      const cliente = tr.getAttribute('data-cliente') || '';
      const area = tr.getAttribute('data-area') || '';
      const ubicacion = tr.getAttribute('data-ubicacion') || '';
      const equipo = tr.getAttribute('data-equipo') || '';
      const precioDiario = Number(tr.getAttribute('data-precioequipo') || 0);
      const os = tr.getAttribute('data-os') || '';
      const inicioServicio = tr.getAttribute('data-inicio') || '';
      const terminacionServicio = tr.getAttribute('data-terminacion') || '';

      await abrirModal({ id, cliente, area, ubicacion, equipo, precioDiario, os, inicioServicio, terminacionServicio });
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
        const oc = inputOc ? inputOc.value.trim() : '';
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
          const { getFirestore, collection, addDoc, serverTimestamp, doc, updateDoc } = await import(
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
            oc,
            observaciones: obs,
            creadoEn: serverTimestamp(),
          });

          // Actualizar el estado de la actividad según el tipo de período registrado
          if (actividadActual && actividadActual.id) {
            try {
              const refAct = doc(db, 'actividades', actividadActual.id);
              if (tipo === 'FINAL') {
                // FINAL: terminación definitiva
                await updateDoc(refAct, { terminacionServicio: fin, terminacionEsFinal: true });
                actividadActual.terminacionServicio = fin;
                actividadActual.terminacionEsFinal = true;
              } else if (tipo === 'PARCIAL') {
                // PARCIAL: marcar terminación parcial (no definitiva)
                await updateDoc(refAct, { terminacionServicio: fin, terminacionEsFinal: false });
                actividadActual.terminacionServicio = fin;
                actividadActual.terminacionEsFinal = false;
              }
            } catch (e) {
              console.error('No se pudo actualizar terminacionServicio de la actividad', e);
            }
          }

          const periodos = await cargarPeriodosActividad(actividadActual.id);
          renderTablaPeriodos(periodos);

          // Preparar el siguiente período solo si este fue PARCIAL
          if (tipo === 'PARCIAL' && inputInicio && inputFin) {
            const dFinNext = parseFechaDdMmAa(fin);
            if (dFinNext) {
              dFinNext.setDate(dFinNext.getDate() + 1);
              inputInicio.value = formatearFechaDdMmAa(dFinNext);
            }
            // Limpiar fin/días/importe/factura/obs para capturar el siguiente tramo
            inputFin.value = '';
            if (inputDias) inputDias.value = '';
            if (inputImporte) inputImporte.value = '';
            if (inputFactura) inputFactura.value = '';
            if (inputOc) inputOc.value = '';
            if (inputObs) inputObs.value = '';

            // Si es HALLIBURTON, sugerir el próximo fin al 25 correspondiente
            if (esHalliburton()) {
              sugerirFinCorte25(inputInicio.value.trim());
            }
          }
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

