// Asistente IA PCT — widget compartido (website + catalogo).
// Persiste la conversacion en localStorage: continuidad entre paginas y recargas.
// Requiere config.local.js cargado antes (window.PCT_FIREBASE_CONFIG).
(function () {
  const KEY = 'pct_ai_hist';
  const WELCOME = 'Hola, soy el asistente de PCT. Puedo orientarte sobre renta de equipos de alta presión, inspecciones y pruebas, limpieza industrial, procura y construcción. ¿Qué necesitas?\n[BTN:CATALOGO] [BTN:FORM]';

  let hist = [];
  try { hist = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(hist.slice(-20))); } catch {} };

  // --- DOM ---
  const fab = document.createElement('button');
  fab.id = 'ai-fab';
  fab.className = 'fixed bottom-5 right-5 z-[80] w-14 h-14 rounded-full flex items-center justify-center transition-transform hover:scale-105';
  fab.style.cssText = 'background:linear-gradient(135deg,#c46418,#b8580f); box-shadow:0 4px 18px rgba(184,88,15,.45);';
  fab.setAttribute('aria-label', 'Abrir asistente');
  fab.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

  const panel = document.createElement('div');
  panel.id = 'ai-panel';
  panel.className = 'fixed bottom-[5.5rem] right-5 z-[85] w-[92vw] max-w-sm rounded-2xl border border-white/10 overflow-hidden hidden flex-col';
  panel.style.cssText = 'background:#14161b; box-shadow:0 20px 60px rgba(0,0,0,.55);';
  panel.innerHTML = `
    <div class="flex items-center gap-3 px-4 py-3 border-b border-white/10" style="background:linear-gradient(90deg,rgba(184,88,15,.25),transparent);">
      <img src="img/log33c.png" alt="PCT" class="h-7" style="filter:drop-shadow(.9px 0 0 rgba(255,255,255,.85)) drop-shadow(-.9px 0 0 rgba(255,255,255,.85)) drop-shadow(0 .9px 0 rgba(255,255,255,.85)) drop-shadow(0 -.9px 0 rgba(255,255,255,.85)) drop-shadow(.65px .65px 0 rgba(255,255,255,.7)) drop-shadow(-.65px .65px 0 rgba(255,255,255,.7)) drop-shadow(.65px -.65px 0 rgba(255,255,255,.7)) drop-shadow(-.65px -.65px 0 rgba(255,255,255,.7));">
      <div class="flex-1">
        <div class="font-display text-sm font-bold text-white">Asistente PCT</div>
        <div class="text-[10px] text-muted">Renta de equipos · inspección · servicios</div>
      </div>
      <button id="ai-close" class="text-muted hover:text-white text-lg leading-none px-1" aria-label="Cerrar">×</button>
    </div>
    <div id="ai-msgs" class="h-72 overflow-y-auto px-4 py-3 space-y-3 text-sm"></div>
    <div class="flex gap-1.5 px-3 pt-2 border-t border-white/10" id="ai-quick">
      <button type="button" data-act="catalogo" class="ai-chip">Catálogo</button>
      <button type="button" data-act="form" class="ai-chip">Cotizar</button>
      <button type="button" data-act="ventas" class="ai-chip">Ventas</button>
    </div>
    <form id="ai-form" class="flex gap-2 p-3">
      <input id="ai-in" class="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent" placeholder="Pregunta por renta, pruebas, servicios…" autocomplete="off" maxlength="500">
      <button id="ai-send" class="rounded-lg px-3.5 flex items-center justify-center" style="background:linear-gradient(135deg,#c46418,#b8580f);" aria-label="Enviar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
    </form>
    <style>
      #ai-panel .ai-chip { font-size:11px; padding:4px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.14); color:rgba(255,255,255,.75); background:rgba(255,255,255,.05); cursor:pointer; white-space:nowrap; }
      #ai-panel .ai-chip:hover { border-color:#c46418; color:#fbbf24; }
      #ai-panel .ai-btn { display:inline-block; margin-top:6px; font-size:12px; font-weight:600; padding:6px 14px; border-radius:8px; border:none; color:#fff; background:linear-gradient(135deg,#c46418,#b8580f); cursor:pointer; }
      #ai-panel .ai-btn:hover { filter:brightness(1.15); }
    </style>`;
  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const msgs = panel.querySelector('#ai-msgs');
  const form = panel.querySelector('#ai-form');
  const inp = panel.querySelector('#ai-in');
  let fn = null;
  let replayed = false;

  // Acciones de los botones (chips fijos + botones inline [BTN:X] del modelo)
  const ACTIONS = {
    catalogo: () => { location.href = 'catalogo.html'; },
    ventas:   () => { location.href = 'mailto:ventas@pc-t.com.mx'; },
    form:     () => {
      if (window.pctContact) window.pctContact();
      else location.href = 'website.html#contacto';
    },
  };
  const BTN_LABEL = { catalogo: 'Ver catálogo', ventas: 'Escribir a ventas', form: 'Formulario de contacto' };

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && ACTIONS[b.dataset.act]) ACTIONS[b.dataset.act]();
  });

  function bubble(text, me) {
    const d = document.createElement('div');
    d.className = me
      ? 'ml-auto max-w-[85%] rounded-xl rounded-br-sm px-3 py-2 text-white'
      : 'mr-auto max-w-[85%] rounded-xl rounded-bl-sm px-3 py-2 text-white/90 bg-white/5 border border-white/10';
    if (me) d.style.background = 'linear-gradient(135deg,#c46418,#b8580f)';
    if (me) { d.textContent = text; }
    else { renderBot(d, text); }
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  function renderBot(el, text) {
    const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    el.innerHTML = esc
      .replace(/\[BTN:(CATALOGO|VENTAS|FORM)\]/gi,
        (m, k) => `<button type="button" class="ai-btn" data-act="${k.toLowerCase()}">${BTN_LABEL[k.toLowerCase()]}</button>`)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  }

  fab.addEventListener('click', () => {
    panel.classList.toggle('hidden'); panel.classList.toggle('flex');
    if (!replayed) {
      replayed = true;
      // Continuidad: repinta la conversacion guardada (viene de otra pagina o recarga)
      if (hist.length) hist.slice(-20).forEach(m => bubble(m.content, m.role === 'user'));
      else bubble(WELCOME, false);
    }
    inp.focus();
  });
  panel.querySelector('#ai-close').addEventListener('click', () => { panel.classList.add('hidden'); panel.classList.remove('flex'); });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const q = inp.value.trim();
    if (!q) return;
    inp.value = '';
    bubble(q, true);
    hist.push({ role: 'user', content: q });
    save();
    const wait = bubble('…', false);
    try {
      if (!fn) {
        const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
        const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js');
        const app = getApps().length ? getApps()[0] : initializeApp(window.PCT_FIREBASE_CONFIG);
        fn = httpsCallable(getFunctions(app, 'us-central1'), 'chatPublico');
      }
      const r = await fn({ mensajes: hist.slice(-10) });
      const ans = r.data.respuesta || 'No pude responder, intenta de nuevo.';
      renderBot(wait, ans);
      hist.push({ role: 'assistant', content: ans });
      save();
    } catch (e) {
      renderBot(wait, 'Ahora no puedo responder — inténtalo de nuevo o contáctanos directo. [BTN:VENTAS] [BTN:FORM]');
    }
    msgs.scrollTop = msgs.scrollHeight;
  });
})();
