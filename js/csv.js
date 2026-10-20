(function (FF) {
  'use strict';

  // RFC 4180 parser: quoted fields, escaped quotes, embedded newlines.
  FF.parseCSV = function (text, sep) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (!sep) {
      const first = text.slice(0, text.search(/\r|\n|$/));
      sep = (first.split(';').length > first.split(',').length) ? ';' : ',';
    }
    const rows = [];
    let row = [], field = '', i = 0, inQ = false;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; }
      else if (c === sep) { row.push(field); field = ''; i++; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = ''; rows.push(row); row = []; i++;
      } else { field += c; i++; }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  };

  FF.parseCSVObjects = function (text) {
    const rows = FF.parseCSV(text);
    if (!rows.length) return [];
    const head = rows[0].map(h => h.trim());
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.length === 1 && row[0] === '') continue;
      const o = {};
      for (let c = 0; c < head.length; c++) o[head[c]] = row[c] === undefined ? '' : row[c];
      out.push(o);
    }
    out.columns = head;
    return out;
  };

  FF.toCSV = function (rows) {
    const q = v => {
      v = v == null ? '' : String(v);
      return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    return rows.map(r => r.map(q).join(',')).join('\r\n');
  };
})(globalThis.FF = globalThis.FF || {});
