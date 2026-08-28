import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, setLogLevel } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

(() => {
  if (window.db && window.auth) return; // ya inicializado

  try {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get('fsdebug') === '1') {
      setLogLevel('debug');
      console.debug('[firebase-init] Firestore debug ON (fsdebug=1)');
    }
  } catch {}

  const cfg = window.PCT_FIREBASE_CONFIG;
  if (!cfg) {
    console.warn("PCT_FIREBASE_CONFIG no está definido. Crea config.local.js con la configuración de Firebase y cárgalo antes de firebase-init.js");
    return;
  }

  if (!getApps().length) {
    const app = initializeApp(cfg);
    window.db = getFirestore(app);
    window.auth = getAuth(app);
  } else {
    // Si ya hay una app, sólo obtener instancias
    window.db = getFirestore();
    window.auth = getAuth();
  }
})();
