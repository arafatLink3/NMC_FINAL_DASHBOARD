// excel.js — CSV/XLSX import & export helpers
(function () {
  const S = window.NMCStore;

  // Lazy-load SheetJS if available (CDN). Falls back to CSV if offline.
  let xlsxLoading = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxLoading) return xlsxLoading;
    xlsxLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => reject(new Error('XLSX load failed'));
      document.head.appendChild(s);
    });
    return xlsxLoading;
  }

  function rowsFromFile(file) {
    return new Promise((resolve, reject) => {
      const name = (file.name || '').toLowerCase();
      if (name.endsWith('.csv') || file.type === 'text/csv') {
        const r = new FileReader();
        r.onload = () => resolve(S.csvParse(r.result));
        r.onerror = reject;
        r.readAsText(file);
      } else {
        loadXLSX()
          .then(XLSX => {
            const r = new FileReader();
            r.onload = () => {
              const wb = XLSX.read(r.result, { type: 'array' });
              const ws = wb.Sheets[wb.SheetNames[0]];
              const arr = XLSX.utils.sheet_to_json(ws, { defval: '' });
              resolve(arr);
            };
            r.onerror = reject;
            r.readAsArrayBuffer(file);
          })
          .catch(() => {
            // Fallback: try reading as text
            const r = new FileReader();
            r.onload = () => resolve(S.csvParse(r.result));
            r.onerror = reject;
            r.readAsText(file);
          });
      }
    });
  }

  function exportRowsAsXLSX(rows, filename) {
    return loadXLSX().then(XLSX => {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, filename);
    });
  }

  window.NMCExcel = { rowsFromFile, exportRowsAsXLSX, loadXLSX };
})();
