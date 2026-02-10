(function () {
    const DB_NAME = 'pct_inspector_pruebas';
    const DB_VERSION = 1;
    const STORE_NAME = 'pruebas';

    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'localId' });
                    store.createIndex('by_createdAt', 'createdAt');
                    store.createIndex('by_dayKey', 'dayKey');
                    store.createIndex('by_status', 'status');
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function txDone(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
            tx.onerror = () => reject(tx.error);
        });
    }

    function todayKey(d = new Date()) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function isExpired(createdAt, ttlMs) {
        if (!createdAt) return false;
        return (Date.now() - Number(createdAt)) > ttlMs;
    }

    async function putPrueba(entry) {
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(entry);
        await txDone(tx);
        db.close();
        return entry;
    }

    async function updatePrueba(localId, patch) {
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const existing = await new Promise((resolve, reject) => {
            const req = store.get(localId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
        if (existing) {
            store.put({ ...existing, ...patch });
        }
        await txDone(tx);
        db.close();
        return existing ? { ...existing, ...patch } : null;
    }

    async function listPruebas({ dayKey = todayKey(), ttlMs = 24 * 60 * 60 * 1000 } = {}) {
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);

        const all = await new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });

        db.close();

        return (all || [])
            .filter(x => x && x.dayKey === dayKey)
            .filter(x => !isExpired(x.createdAt, ttlMs))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    async function clearExpired({ dayKey = todayKey(), ttlMs = 24 * 60 * 60 * 1000 } = {}) {
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const all = await new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });

        (all || []).forEach(item => {
            const del = !item || item.dayKey !== dayKey || isExpired(item.createdAt, ttlMs);
            if (del && item && item.localId) {
                store.delete(item.localId);
            }
        });

        await txDone(tx);
        db.close();
    }

    async function getPending({ dayKey = todayKey(), ttlMs = 24 * 60 * 60 * 1000 } = {}) {
        const items = await listPruebas({ dayKey, ttlMs });
        return items.filter(x => x && x.status === 'pending');
    }

    window.pctInspectorPruebasStore = {
        todayKey,
        putPrueba,
        updatePrueba,
        listPruebas,
        clearExpired,
        getPending,
    };
})();
