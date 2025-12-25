document.addEventListener('DOMContentLoaded', () => {
    const navMain = document.querySelector('.nav-main');
    if (!navMain) return;

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
