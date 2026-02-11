document.addEventListener('DOMContentLoaded', () => {
    const navMain = document.querySelector('.nav-main');
    if (!navMain) return;

    // Mostrar navbar solo en páginas específicas
    const allowedNavPages = new Set([
        'pruebas.html',
        'pruebaslist.html',
        'inspeccion.html',
        'inspectlist.html'
    ]);

    function currentPageKey() {
        const parts = (location.pathname || '')
            .toLowerCase()
            .split('/')
            .filter(Boolean);
        const last = parts.length ? parts[parts.length - 1] : '';
        // Soportar raíz "/" como index
        if (!last) return 'index.html';
        // Soportar rutas tipo /pruebas (sin .html)
        if (!last.includes('.')) return `${last}.html`;
        return last;
    }

    const currentPage = currentPageKey();
    function setNavVisible(visible) {
        navMain.style.display = visible ? '' : 'none';
        const navToggle = document.querySelector('.nav-toggle');
        if (navToggle) navToggle.style.display = visible ? '' : 'none';
    }

    // Default: mostrar navbar solo en páginas específicas (el rol puede ampliar esto)
    setNavVisible(allowedNavPages.has(currentPage));

    // Asegurar que todos los dropdowns inicien colapsados
    navMain.querySelectorAll('.nav-item-has-dropdown').forEach(el => {
        el.classList.remove('is-open');
    });

    navMain.addEventListener('click', (event) => {
        const trigger = event.target.closest('.nav-item-has-dropdown > a');
        if (!trigger) return;

        event.preventDefault();

        const item = trigger.parentElement;

        const yaAbierto = item.classList.contains('is-open');

        // Cerrar todos
        navMain.querySelectorAll('.nav-item-has-dropdown.is-open').forEach(el => {
            el.classList.remove('is-open');
        });

        // Si no estaba abierto, abrir solo este
        if (!yaAbierto) {
            item.classList.add('is-open');
        }
    });

    // -- Control de UI por roles (director, inspector, capturista) --
    (async () => {
        try {
            // Esperar a que Firebase App esté lista
            await new Promise(r => setTimeout(r, 400));
            const { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
            const auth = getAuth();

            async function writeAudit(action, extra) {
                try {
                    const { getFirestore, collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
                    const db = getFirestore();
                    const u = auth.currentUser;
                    const email = (u && u.email ? String(u.email) : '').toLowerCase();
                    const uid = u && u.uid ? String(u.uid) : '';
                    await addDoc(collection(db, 'audit_logs'), {
                        at: serverTimestamp(),
                        action: String(action || ''),
                        page: (location.pathname || '').toString(),
                        email,
                        uid,
                        ua: (navigator.userAgent || '').toString(),
                        ...(extra && typeof extra === 'object' ? extra : {})
                    });
                } catch {}
            }

            window.pctAudit = window.pctAudit || (async (action, extra, opts) => {
                try {
                    const o = (opts && typeof opts === 'object') ? opts : {};
                    const throttleMs = Number(o.throttleMs || 2500);
                    const keyRaw = String(o.throttleKey || `${String(action || '')}|${String(location.pathname || '')}`);
                    const key = `pct_audit_throttle_${keyRaw}`;
                    const now = Date.now();
                    try {
                        const prev = Number(sessionStorage.getItem(key) || '0');
                        if (!isNaN(prev) && prev > 0 && (now - prev) < throttleMs) return;
                        sessionStorage.setItem(key, String(now));
                    } catch {}
                    await writeAudit(action, extra);
                } catch {}
            });

            function auditOnce(key, action, extra) {
                try {
                    const k = `pct_audit_${key}`;
                    if (sessionStorage.getItem(k) === '1') return;
                    sessionStorage.setItem(k, '1');
                    writeAudit(action, extra);
                } catch {}
            }

            // Persistencia según preferencia de login
            // - 'local'   => recordar sesión en este equipo
            // - 'session' => sesión solo en esta pestaña/navegador
            let persistPref = 'session';
            try { persistPref = String(localStorage.getItem('pct_auth_persist') || 'session'); } catch {}
            try {
                await setPersistence(auth, persistPref === 'local' ? browserLocalPersistence : browserSessionPersistence);
            } catch {}

            // Auto sign-out por inactividad y por duración absoluta de sesión
            // Nota: solo aplica cuando el usuario NO seleccionó "Recordarme".
            const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutos
            const ABSOLUTE_MS   = 1  * 60 * 60 * 1000; // 1 hora

            let lastActivity = Date.now();
            function bumpActivity() { lastActivity = Date.now(); }
            ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
                document.addEventListener(evt, bumpActivity, { passive: true });
            });

            function ensureLoginStartStamp() {
                try {
                    const key = 'pct_login_time';
                    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, String(Date.now()));
                } catch {}
            }

            function loginStartMs() {
                try {
                    const v = Number(sessionStorage.getItem('pct_login_time'));
                    return isNaN(v) ? Date.now() : v;
                } catch { return Date.now(); }
            }
            onAuthStateChanged(auth, async (user) => {
                if (!user) return;
                ensureLoginStartStamp();

                auditOnce(`login_${(user.uid || '').toString().slice(0, 8)}`, 'login', null);
                auditOnce(`pv_${currentPage}_${(user.uid || '').toString().slice(0, 8)}`, 'page_view', { currentPage });

                // Expiración absoluta
                try {
                    if (persistPref !== 'local' && (Date.now() - loginStartMs() > ABSOLUTE_MS)) {
                        await signOut(auth);
                        return;
                    }
                } catch {}
                try {
                    const idTok = await user.getIdTokenResult();
                    const role = (idTok && idTok.claims && idTok.claims.role) || null;

                    const isAdmin = role === 'admin';
                    const isDirector = role === 'director';
                    const isSupervisor = role === 'supervisor';
                    const isInspector = role === 'inspector';
                    const isCapturista = role === 'capturista';

                    // Navbar: admin/director lo ven en todas las páginas.
                    // Supervisor: lo ve en todas las páginas.
                    // Otros roles: solo en páginas permitidas.
                    const shouldShowByRole =
                        isAdmin ||
                        isDirector ||
                        isSupervisor ||
                        (isInspector && currentPage === 'index.html') ||
                        allowedNavPages.has(currentPage);
                    setNavVisible(shouldShowByRole);

                    // En dashboard: ocultar KPIs solo para inspector (UI reducida)
                    if (currentPage === 'index.html' && isInspector) {
                        try {
                            const invValue = document.getElementById('dash-equipos-invre');
                            const invCard = invValue ? invValue.closest('.dash-card') : null;
                            if (invCard) invCard.style.display = 'none';

                            const pruebasValue = document.getElementById('dash-pruebas');
                            const pruebasCard = pruebasValue ? pruebasValue.closest('.dash-card') : null;
                            if (pruebasCard) pruebasCard.style.display = 'none';
                        } catch {}
                    }

                    // Supervisor: ocultar sección Actividad completa en navbar (pero mantener dashboard completo)
                    if (isSupervisor) {
                        try {
                            // Ocultar el item superior de Actividad y su dropdown
                            document.querySelectorAll('.nav-main > ul > li.nav-item-has-dropdown').forEach(li => {
                                const anchor = li.querySelector(':scope > a');
                                if (!anchor) return;
                                const text = (anchor.textContent || '').trim().toLowerCase();
                                if (text.includes('actividad')) {
                                    li.style.display = 'none';
                                }
                            });

                            // Ocultar enlaces directos a páginas de actividad
                            document.querySelectorAll(
                                'a[href*="actividad.html"], a[href*="actividadlist.html"], a[href*="actividadmin.html"], a[href*="trazabilidades.html"]'
                            ).forEach(a => {
                                const li = a.closest('li') || a;
                                li.style.display = 'none';
                            });
                        } catch {}
                    }

                    // Para inspector/capturista: ocultar actividadmin en la navegación
                    if (isInspector || isCapturista) {
                        document.querySelectorAll('a[href*="actividadmin"]').forEach(a => {
                            const li = a.closest('li') || a;
                            li.style.display = 'none';
                        });
                    }

                    // Inspector: solo ver Pruebas e Inspecciones (ocultar Actividad y rutas relacionadas)
                    if (isInspector) {
                        // Ocultar el item superior de Actividad y su dropdown
                        document.querySelectorAll('.nav-main > ul > li.nav-item-has-dropdown').forEach(li => {
                            const anchor = li.querySelector(':scope > a');
                            if (!anchor) return;
                            const text = (anchor.textContent || '').trim().toLowerCase();
                            if (text.includes('actividad')) {
                                li.style.display = 'none';
                            }
                        });

                        // Ocultar enlaces sueltos a páginas de actividad si existieran en otros lugares del menú
                        document.querySelectorAll(
                            'a[href*="actividad.html"], a[href*="actividadlist.html"], a[href*="actividadmin.html"], a[href*="trazabilidades.html"]'
                        ).forEach(a => {
                            const li = a.closest('li') || a;
                            li.style.display = 'none';
                        });

                        // En dashboard: ocultar la tarjeta de actividades
                        if (currentPage === 'index.html') {
                            const actValue = document.getElementById('dash-actividades');
                            const card = actValue ? actValue.closest('.dash-card') : null;
                            if (card) card.style.display = 'none';
                        }
                    }

                    // Capturista: solo puede ver Pruebas y Inspecciones. Ocultar sección Actividad completa
                    if (isCapturista) {
                        // Ocultar el item superior de Actividad y su dropdown
                        document.querySelectorAll('.nav-main > ul > li.nav-item-has-dropdown').forEach(li => {
                            const anchor = li.querySelector(':scope > a');
                            if (!anchor) return;
                            const text = (anchor.textContent || '').trim().toLowerCase();
                            if (text.includes('actividad')) {
                                li.style.display = 'none';
                            }
                        });

                        // Ocultar enlaces sueltos a páginas de actividad si existieran en otros lugares del menú
                        document.querySelectorAll(
                            'a[href*="actividad.html"], a[href*="actividadlist.html"], a[href*="actividadmin.html"], a[href*="trazabilidades.html"]'
                        ).forEach(a => {
                            const li = a.closest('li') || a;
                            li.style.display = 'none';
                        });
                    }

                    // Directores pueden acceder a actividadmin; no redirigir

                    // Ocultar elementos marcados como solo-admin para quienes no sean admin ni director
                    if (!(isAdmin || isDirector)) {
                        document.querySelectorAll('.admin-only, [data-admin-only="true"]').forEach(el => {
                            el.style.display = 'none';
                        });
                    }

                    // Inspectores/Capturistas: opcionalmente podríamos ocultar otras rutas si están marcadas
                    // por atributos data-role en el HTML. Si no existen, esto no afecta nada.
                } catch {}
            });

            // UI: aviso 60s antes de expirar
            let warnNode = null;
            let warnTick = null;
            function hideWarn() {
                if (warnTick) { clearInterval(warnTick); warnTick = null; }
                if (warnNode && warnNode.parentElement) { warnNode.remove(); }
                warnNode = null;
            }
            function showWarn(seconds) {
                const secs = Math.max(1, Math.floor(seconds / 1000));
                if (!warnNode) {
                    warnNode = document.createElement('div');
                    warnNode.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center; z-index:9999;';
                    warnNode.innerHTML = `
                        <div style="background:#fff; max-width:420px; width:92%; border-radius:10px; box-shadow:0 10px 40px rgba(0,0,0,0.35); padding:16px 18px; font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
                            <div style="font-weight:700; font-size:1.05rem; color:#111827; margin-bottom:6px;">Sesión por expirar</div>
                            <div id="pct-warn-body" style="font-size:0.95rem; color:#374151; margin-bottom:12px;">Tu sesión se cerrará en <strong id="pct-warn-secs">${secs}</strong> segundos por seguridad.</div>
                            <div style="display:flex; gap:8px; justify-content:flex-end;">
                                <button id="pct-warn-keep" style="padding:6px 10px; border:1px solid #d1d5db; background:#2563eb; color:#fff; border-radius:6px; cursor:pointer; font-weight:600;">Mantener sesión</button>
                                <button id="pct-warn-close" style="padding:6px 10px; border:1px solid #d1d5db; background:#fff; color:#111827; border-radius:6px; cursor:pointer;">Cerrar</button>
                            </div>
                        </div>`;
                    document.body.appendChild(warnNode);
                    const btnKeep = warnNode.querySelector('#pct-warn-keep');
                    const btnClose = warnNode.querySelector('#pct-warn-close');
                    if (btnKeep) btnKeep.addEventListener('click', () => {
                        // Extender sesión: marcar actividad y reiniciar ventana absoluta
                        bumpActivity();
                        try { sessionStorage.setItem('pct_login_time', String(Date.now())); } catch {}
                        hideWarn();
                    });
                    if (btnClose) btnClose.addEventListener('click', hideWarn);
                }
                const span = warnNode.querySelector('#pct-warn-secs');
                if (span) span.textContent = String(secs);
                if (!warnTick) {
                    warnTick = setInterval(() => {
                        try {
                            const now = Date.now();
                            const tIdle = INACTIVITY_MS - (now - lastActivity);
                            const tAbs  = ABSOLUTE_MS   - (now - loginStartMs());
                            const next  = Math.min(tIdle, tAbs);
                            const s = Math.max(0, Math.floor(next / 1000));
                            const sp = warnNode && warnNode.querySelector('#pct-warn-secs');
                            if (sp) sp.textContent = String(s);
                            if (next <= 0) hideWarn();
                        } catch {}
                    }, 1000);
                }
            }

            // Verificación periódica de inactividad/expiración (cada 5s)
            setInterval(async () => {
                try {
                    if (!auth.currentUser) { hideWarn(); return; }
                    const now = Date.now();
                    const idle = now - lastActivity;
                    const alive = now - loginStartMs();
                    const tIdle = INACTIVITY_MS - idle;
                    const tAbs  = ABSOLUTE_MS   - alive;
                    const next  = Math.min(tIdle, tAbs);
                    if (next <= 0) {
                        hideWarn();
                        await signOut(auth);
                        return;
                    }
                    if (next <= 60000) {
                        showWarn(next);
                    } else if (warnNode) {
                        hideWarn();
                    }
                } catch {}
            }, 5000);
        } catch {}
    })();

    // -- Notificaciones (toast) de pruebas por caducar: resumen al entrar al sistema --
    // Se muestra a lo sumo 1 vez por día por navegador.
    (async () => {
        // Esperar un poco para dar tiempo a que la app Firebase se inicialice en cada página
        await new Promise(r => setTimeout(r, 600));

        function todayKey() {
            const d = new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `pct_pruebas_toast_${y}${m}${day}`;
        }

        try {
            if (!window.db) {
                // Intentar obtener Firestore si la app ya fue creada en la página
                const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
                window.db = getFirestore();
            }
        } catch {}

        if (!window.db) return; // la página no usa Firestore

        const shownKey = todayKey();
        try {
            const last = localStorage.getItem(shownKey);
            if (last) return; // ya mostrado hoy
        } catch {}

        function parseProxima(str) {
            if (!str) return null;
            const s = String(str).trim();
            if (!s) return null;
            if (s.includes('/')) {
                const partes = s.split('/');
                if (partes.length !== 3) return null;
                const [ddStr, mmStr, aaStr] = partes;
                const dd = parseInt(ddStr, 10);
                const mm = parseInt(mmStr, 10);
                const aa = parseInt(aaStr, 10);
                if (!dd || !mm || isNaN(aa)) return null;
                const year = aa < 100 ? 2000 + aa : aa;
                const d = new Date(year, mm - 1, dd);
                if (isNaN(d.getTime())) return null;
                d.setHours(0, 0, 0, 0);
                return d;
            }
            const d = new Date(s);
            if (isNaN(d.getTime())) return null;
            d.setHours(0, 0, 0, 0);
            return d;
        }

        try {
            const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
            const db = getFirestore();
            const colRef = collection(db, 'pruebas');
            const snap = await getDocs(colRef);

            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            let c60 = 0, c30 = 0, c15 = 0, cv = 0;

            snap.forEach(doc => {
                const data = doc.data() || {};
                const periodo = (data.periodo || '').toString().trim().toUpperCase();
                if (periodo && periodo !== 'ANUAL') return; // solo ANUAL para alertas
                const dProx = parseProxima(data.proxima || '');
                if (!dProx) return;
                const dias = Math.round((dProx.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
                if (dias < 0) cv += 1;
                else if (dias >= 30 && dias <= 60) c60 += 1;
                else if (dias >= 15 && dias < 30) c30 += 1;
                else if (dias >= 0 && dias < 15) c15 += 1;
            });

            const total = c60 + c30 + c15 + cv;
            if (!total) return;

            // Render toast
            let cont = document.querySelector('.toast-container');
            if (!cont) {
                cont = document.createElement('div');
                cont.className = 'toast-container';
                document.body.appendChild(cont);
            }

            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = `
                <button class="toast-close" aria-label="Cerrar">×</button>
                <div class="toast-title">Pruebas por vencer</div>
                <div class="toast-body">
                    ${c60 ? `🟦 60–30 días: <strong>${c60}</strong><br>` : ''}
                    ${c30 ? `🟨 30–15 días: <strong>${c30}</strong><br>` : ''}
                    ${c15 ? `🟥 15–0 días: <strong>${c15}</strong><br>` : ''}
                    ${cv ? `⚠️ Vencidas: <strong>${cv}</strong><br>` : ''}
                    <div style="margin-top:6px;"><a href="pruebaslist.html" style="color:#93c5fd;text-decoration:underline;">Ver listado de pruebas</a></div>
                </div>`;
            cont.appendChild(toast);
            const btnX = toast.querySelector('.toast-close');
            if (btnX) btnX.addEventListener('click', () => toast.remove());

            try { localStorage.setItem(shownKey, '1'); } catch {}

            // Autoocultar en 12s
            setTimeout(() => {
                if (toast && toast.parentElement) toast.remove();
            }, 12000);
        } catch (e) {
            // silencioso
        }
    })();
});
