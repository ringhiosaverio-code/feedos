/* FeedOS 17 · IndexedDB finto in memoria per i test node (solo ciò che usa core/persist.js):
 * open con versioni e onupgradeneeded, object store con get/put/delete/getAll/openCursor, transazioni con oncomplete.
 * I valori sono copiati con structuredClone, come nel browser. */
const later = fn => setTimeout(fn, 0);

export function fakeIndexedDB() {
  const dbs = new Map(); // nome → {version, stores: Map(nome → {keyPath, rows: Map})}
  function storeApi(st) {
    const req = result => { const r = { result, onsuccess: null }; queueMicrotask(() => r.onsuccess?.({ target: r })); return r; };
    return {
      get: k => req(st.rows.has(k) ? structuredClone(st.rows.get(k)) : undefined),
      getAll: () => req([...st.rows.keys()].sort().map(k => structuredClone(st.rows.get(k)))),
      put: (v, k) => { const key = st.keyPath ? v[st.keyPath] : k; st.rows.set(key, structuredClone(v)); return req(key); },
      delete: k => { st.rows.delete(k); return req(undefined); },
      count: () => req(st.rows.size),
      openCursor() {
        const keys = [...st.rows.keys()].sort(); let i = 0;
        const r = { result: null, onsuccess: null };
        const step = () => { const k = keys[i]; r.result = k === undefined ? null : { key: k, value: structuredClone(st.rows.get(k)), continue() { i++; queueMicrotask(step); } }; r.onsuccess?.({ target: r }); };
        queueMicrotask(step);
        return r;
      },
    };
  }
  function txApi(db, names) {
    const t = { oncomplete: null, onerror: null, onabort: null, error: null, objectStore: n => { if (!db.stores.has(n)) throw new Error('NotFoundError: ' + n); return storeApi(db.stores.get(n)); } };
    if (names) for (const n of names) if (!db.stores.has(n)) throw new Error('NotFoundError: ' + n);
    later(() => t.oncomplete?.());
    return t;
  }
  function dbApi(db) {
    return {
      objectStoreNames: { contains: n => db.stores.has(n) },
      createObjectStore: (n, opt = {}) => { db.stores.set(n, { keyPath: opt.keyPath || null, rows: new Map() }); return storeApi(db.stores.get(n)); },
      transaction: (names, kind) => txApi(db, [].concat(names), kind),
      close() {}, onversionchange: null,
    };
  }
  const api = {
    open(name, version = 1) {
      const r = { result: null, transaction: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      later(() => {
        if (!dbs.has(name)) dbs.set(name, { version: 0, stores: new Map() });
        const db = dbs.get(name);
        r.result = dbApi(db);
        if (version > db.version) {
          const oldVersion = db.version; db.version = version;
          r.transaction = txApi(db);
          r.onupgradeneeded?.({ oldVersion, newVersion: version });
          later(() => later(() => r.onsuccess?.()));
        } else later(() => r.onsuccess?.());
      });
      return r;
    },
    // accesso diretto per preparare e controllare i dati nei test
    // sostituisce il contenuto sul posto: una connessione già aperta vede i nuovi dati
    _seed(name, version, stores) {
      const db = dbs.get(name) || { version: 0, stores: new Map() }; dbs.set(name, db);
      db.version = version;
      db.stores = new Map(Object.entries(stores).map(([n, s]) => [n, { keyPath: s.keyPath || null, rows: new Map(Object.entries(s.rows || {})) }]));
    },
    _rows(name, store) { return dbs.get(name)?.stores.get(store)?.rows; },
    _version: name => dbs.get(name)?.version,
  };
  return api;
}
