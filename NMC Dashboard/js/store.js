// store.js — localStorage-backed JSON store with safe defaults
(function (global) {
  const PREFIX = 'nmc.';

  function key(k) { return PREFIX + k; }

  function get(k, fallback) {
    try {
      const raw = localStorage.getItem(key(k));
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('store.get', k, e);
      return fallback;
    }
  }
  function set(k, v) {
    try { localStorage.setItem(key(k), JSON.stringify(v)); }
    catch (e) { console.warn('store.set', k, e); }
  }
  function remove(k) { localStorage.removeItem(key(k)); }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  // Generic CRUD for collection k
  function list(k) { return get(k, []); }
  function add(k, item) {
    const arr = list(k);
    if (!item.id) item.id = uid(k);
    item.createdAt = item.createdAt || new Date().toISOString();
    arr.unshift(item);
    set(k, arr);
    return item;
  }
  function update(k, id, patch) {
    const arr = list(k);
    const i = arr.findIndex(x => x.id === id);
    if (i >= 0) { arr[i] = Object.assign({}, arr[i], patch, { updatedAt: new Date().toISOString() }); set(k, arr); return arr[i]; }
    return null;
  }
  function removeItem(k, id) {
    const arr = list(k).filter(x => x.id !== id); set(k, arr);
  }

  // Excel import — expects [{col1:v,...}]
  function importCollection(k, rows, mapFn) {
    const arr = list(k);
    const items = rows.map(mapFn).filter(Boolean);
    items.forEach(it => { if (!it.id) it.id = uid(k); it.createdAt = it.createdAt || new Date().toISOString(); });
    set(k, items.concat(arr));
    return items.length;
  }

  function exportCSV(items, columns) {
    const head = columns.map(c => '"' + (c.label || c.key).replace(/"/g, '""') + '"').join(',');
    const body = items.map(it => columns.map(c => {
      let v = typeof c.get === 'function' ? c.get(it) : it[c.key];
      if (v == null) v = '';
      return '"' + String(v).replace(/"/g, '""') + '"';
    }).join(',')).join('\n');
    return head + '\n' + body;
  }

  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function notify(text, type) {
    const arr = get('notifications', []);
    arr.unshift({ id: uid('n'), text, type: type || 'info', createdAt: new Date().toISOString(), read: false });
    set('notifications', arr.slice(0, 200));
    if (global.NMC && global.NMC.bus) global.NMC.bus.emit('notify', arr[0]);
  }

  global.NMCStore = { get, set, remove, list, add, update, removeItem, importCollection, exportCSV, download, notify, uid };
})(window);
