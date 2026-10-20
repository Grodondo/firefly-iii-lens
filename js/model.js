(function (FF) {
  'use strict';
  const DAY = 86400000;
  FF.DAY = DAY;

  /* ---------- dates & formatting ---------- */
  FF.dayNum = s => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY);
  FF.dayStr = n => new Date(n * DAY).toISOString().slice(0, 10);
  FF.weekday = n => (new Date(n * DAY).getUTCDay() + 6) % 7; // Monday = 0
  FF.locale = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';

  const dfCache = {};
  const DF = {
    md: { month: 'short', day: 'numeric' },
    mdy: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
    my: { month: 'short', year: '2-digit' },
    month: { month: 'long', year: 'numeric' },
    wd: { weekday: 'long' },
    wds: { weekday: 'short' }
  };
  FF.fmtDate = (day, style) => {
    style = style || 'md';
    const f = dfCache[style] || (dfCache[style] = new Intl.DateTimeFormat(FF.locale, Object.assign({ timeZone: 'UTC' }, DF[style])));
    return f.format(day * DAY);
  };

  const nfCache = {};
  FF.money = (v, cur, compact) => {
    const k = cur + (compact ? 'c' : '');
    let f = nfCache[k];
    if (!f) {
      try {
        f = new Intl.NumberFormat(FF.locale, Object.assign({ style: 'currency', currency: cur }, compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}));
      } catch (e) {
        f = { format: x => x.toFixed(2) + ' ' + cur };
      }
      nfCache[k] = f;
    }
    return f.format(Math.abs(v) < 0.005 ? 0 : v);
  };
  FF.pct = (v, d) => (v * 100).toFixed(d == null ? 0 : d) + '%';
  FF.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- normalisation ---------- */
  const OWNED = new Set(['asset account', 'default account', 'loan', 'debt', 'mortgage']);
  const LIAB = new Set(['loan', 'debt', 'mortgage']);
  const KINDS = { withdrawal: 'expense', deposit: 'income', transfer: 'transfer', 'opening balance': 'opening', reconciliation: 'reconcile' };

  FF.normalize = function (objs) {
    const out = [], seen = new Set();
    for (const o of objs) {
      const date = (o.date || '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const amount = parseFloat(o.amount);
      if (!isFinite(amount)) continue;
      const sig = [o.journal_id, o.date, o.amount, o.description, o.source_name, o.destination_name].join('|');
      if (seen.has(sig)) continue;
      seen.add(sig);
      const typeRaw = (o.type || '').trim();
      const srcType = (o.source_type || '').trim(), dstType = (o.destination_type || '').trim();
      const t = {
        id: o.journal_id || String(out.length + 1),
        gid: o.group_id || '',
        title: o.group_title || '',
        day: FF.dayNum(date),
        date,
        time: (o.date || '').slice(11, 16),
        typeRaw,
        kind: KINDS[typeRaw.toLowerCase()] || 'other',
        cur: (o.currency_code || '').trim() || 'XXX',
        mag: Math.abs(amount),
        amount,
        fCur: o.foreign_currency_code || '',
        fAmt: o.foreign_amount ? Math.abs(parseFloat(o.foreign_amount)) : null,
        desc: (o.description || '').trim(),
        src: (o.source_name || '').trim(),
        srcType,
        srcIban: o.source_iban || '',
        dst: (o.destination_name || '').trim(),
        dstType,
        dstIban: o.destination_iban || '',
        srcOwned: OWNED.has(srcType.toLowerCase()),
        dstOwned: OWNED.has(dstType.toLowerCase()),
        srcLiab: LIAB.has(srcType.toLowerCase()),
        dstLiab: LIAB.has(dstType.toLowerCase()),
        srcPh: srcType.toLowerCase() === 'cash account',
        dstPh: dstType.toLowerCase() === 'cash account',
        category: (o.category || '').trim(),
        budget: (o.budget || '').trim(),
        bill: (o.bill || '').trim(),
        tags: (o.tags || '').split(',').map(s => s.trim()).filter(Boolean),
        notes: o.notes || '',
        reconciled: o.reconciled === '1' || o.reconciled === 'true',
        raw: o
      };
      t.dk = t.desc.toLowerCase();
      t.h = [t.desc, t.notes, t.src, t.dst, t.category, t.budget, t.bill, t.tags.join(' '), t.typeRaw].join('\n').toLowerCase();
      out.push(t);
    }
    out.sort((a, b) => a.day - b.day || (a.time < b.time ? -1 : a.time > b.time ? 1 : 0) || (+a.id - +b.id));
    return out;
  };

  /* ---------- dimensions (things you can group / filter by) ---------- */
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  FF.descNames = new Map();
  FF.DIMS = {
    category: { label: 'Category', keys: t => [t.category], name: k => k || 'Uncategorized' },
    tag: { label: 'Tag', keys: t => (t.tags.length ? t.tags : ['']), name: k => k || 'No tag' },
    budget: { label: 'Budget', keys: t => [t.budget], name: k => k || 'No budget' },
    payee: {
      label: 'Payee / source',
      keys: t => [t.kind === 'income' ? (t.srcPh ? '' : t.src) : (t.dstPh ? '' : t.dst)],
      name: k => k || 'Unspecified'
    },
    description: { label: 'Description', keys: t => [t.dk], name: k => FF.descNames.get(k) || k || '(empty)' },
    account: {
      label: 'Account',
      keys: t => { const r = []; if (t.srcOwned) r.push(t.src); if (t.dstOwned) r.push(t.dst); return r; },
      name: k => k
    },
    bill: { label: 'Bill', keys: t => [t.bill], name: k => k || 'No bill' },
    weekday: { label: 'Weekday', keys: t => [WD[FF.weekday(t.day)]], name: k => k }
  };
  FF.DIM_ORDER = ['category', 'tag', 'budget', 'payee', 'description', 'account', 'bill', 'weekday'];

  /* ---------- dataset ---------- */
  FF.buildDataset = function (txs) {
    const ds = { txs, accounts: new Map(), currencies: new Map(), byCur: {}, range: {}, effects: {}, acctCur: {} };
    FF.descNames = new Map();
    for (const t of txs) {
      ds.currencies.set(t.cur, (ds.currencies.get(t.cur) || 0) + 1);
      (ds.byCur[t.cur] = ds.byCur[t.cur] || []).push(t);
      if (!FF.descNames.has(t.dk)) FF.descNames.set(t.dk, t.desc);
      const eff = ds.effects[t.cur] = ds.effects[t.cur] || [];
      const ac = ds.acctCur[t.cur] = ds.acctCur[t.cur] || new Set();
      const r = ds.range[t.cur] = ds.range[t.cur] || { min: t.day, max: t.day };
      r.min = Math.min(r.min, t.day); r.max = Math.max(r.max, t.day);
      if (t.srcOwned) {
        if (!ds.accounts.has(t.src)) ds.accounts.set(t.src, { name: t.src, type: t.srcType, iban: t.srcIban, liability: t.srcLiab });
        ac.add(t.src); eff.push({ day: t.day, acct: t.src, delta: -t.mag });
      }
      if (t.dstOwned) {
        if (!ds.accounts.has(t.dst)) ds.accounts.set(t.dst, { name: t.dst, type: t.dstType, iban: t.dstIban, liability: t.dstLiab });
        ac.add(t.dst); eff.push({ day: t.day, acct: t.dst, delta: t.mag });
      }
    }
    ds.currency = [...ds.currencies.entries()].sort((a, b) => b[1] - a[1])[0][0];
    FF.colorMaps = {};
    return ds;
  };

  /* Daily end-of-day balances for owned accounts (optionally restricted to a Set of names). */
  FF.balances = function (ds, cur, sel, from, to) {
    const eff = ds.effects[cur] || [];
    const names = [...(ds.acctCur[cur] || [])].filter(n => !sel || !sel.size || sel.has(n));
    const idx = new Map(names.map((n, i) => [n, i]));
    const run = new Float64Array(names.length);
    let p = 0;
    while (p < eff.length && eff[p].day < from) {
      const i = idx.get(eff[p].acct); if (i !== undefined) run[i] += eff[p].delta; p++;
    }
    const starts = Array.from(run);
    const n = Math.max(1, to - from + 1);
    const xs = new Array(n), total = new Array(n), vals = names.map(() => new Array(n));
    for (let d = 0; d < n; d++) {
      const day = from + d;
      while (p < eff.length && eff[p].day <= day) {
        const i = idx.get(eff[p].acct); if (i !== undefined) run[i] += eff[p].delta; p++;
      }
      let s = 0;
      for (let i = 0; i < names.length; i++) { vals[i][d] = run[i]; s += run[i]; }
      xs[d] = day; total[d] = s;
    }
    return { xs, names, vals, starts, total, start: starts.reduce((a, b) => a + b, 0) };
  };

  /* ---------- filtering ---------- */
  FF.matches = function (t, f, ex) {
    if (t.cur !== f.cur) return false;
    if (!ex.date && (t.day < f.from || t.day > f.to)) return false;
    if (f.q && !ex.q && t.h.indexOf(f.q) < 0) return false;
    for (const d in f.dims) {
      const set = f.dims[d];
      if (set.size && !ex[d]) {
        const ks = FF.DIMS[d].keys(t);
        let hit = false;
        for (let i = 0; i < ks.length; i++) if (set.has(ks[i])) { hit = true; break; }
        if (!hit) return false;
      }
    }
    return true;
  };
  FF.filter = (txs, f, ex) => { ex = ex || {}; return txs.filter(t => FF.matches(t, f, ex)); };

  /* ---------- aggregation ---------- */
  FF.sum = (txs, kind) => { let s = 0; for (const t of txs) if (t.kind === kind) s += t.mag; return s; };

  FF.group = function (txs, dim, kind) {
    const D = FF.DIMS[dim], m = new Map();
    for (const t of txs) {
      if (t.kind !== kind) continue;
      const ks = D.keys(t);
      if (!ks.length) continue;
      const share = t.mag / ks.length;
      for (const k of ks) {
        let g = m.get(k);
        if (!g) { g = { key: k, name: D.name(k), value: 0, count: 0 }; m.set(k, g); }
        g.value += share; g.count++;
      }
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  };

  FF.topN = function (items, n) {
    if (items.length <= n) return items;
    const head = items.slice(0, n - 1), rest = items.slice(n - 1);
    head.push({ key: '__other', name: 'Other (' + rest.length + ')', value: rest.reduce((a, b) => a + b.value, 0), count: rest.reduce((a, b) => a + b.count, 0), other: true });
    return head;
  };

  /* ---------- time buckets ---------- */
  FF.bucketStart = (day, g) => {
    if (g === 'day') return day;
    if (g === 'week') return day - FF.weekday(day);
    const d = new Date(day * DAY);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY;
  };
  FF.bucketEnd = (s, g) => {
    if (g === 'day') return s;
    if (g === 'week') return s + 6;
    const d = new Date(s * DAY);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY - 1;
  };
  FF.pickGran = function (from, to, pref) {
    const span = to - from + 1;
    let g = pref;
    if (!g || g === 'auto') g = span <= 31 ? 'day' : span <= 200 ? 'week' : 'month';
    if (g === 'day' && span > 400) g = 'week';
    if (g === 'week' && span > 365 * 6) g = 'month';
    return g;
  };
  FF.makeBuckets = function (from, to, g) {
    const arr = [], map = new Map();
    let s = FF.bucketStart(from, g);
    while (s <= to) {
      const e = FF.bucketEnd(s, g);
      arr.push({
        start: s, end: e,
        label: g === 'month' ? FF.fmtDate(s, 'my') : FF.fmtDate(s, 'md'),
        full: g === 'day' ? FF.fmtDate(s, 'long') : g === 'week' ? FF.fmtDate(s, 'md') + ' – ' + FF.fmtDate(e, 'mdy') : FF.fmtDate(s, 'month')
      });
      map.set(s, arr.length - 1);
      s = e + 1;
    }
    arr.g = g;
    arr.idx = day => map.get(FF.bucketStart(day, g));
    return arr;
  };
  FF.bucketize = function (txs, buckets, kind, filterFn) {
    const out = new Array(buckets.length).fill(0);
    for (const t of txs) {
      if (t.kind !== kind) continue;
      if (filterFn && !filterFn(t)) continue;
      const i = buckets.idx(t.day);
      if (i !== undefined) out[i] += t.mag;
    }
    return out;
  };

  /* ---------- colours ---------- */
  const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#f97316', '#8b5cf6', '#14b8a6', '#ef4444', '#84cc16', '#3b82f6', '#e879f9'];
  FF.colorMaps = {};
  FF.color = function (dim, key) {
    if (key === '' && dim !== 'account') return '#8a92b2';
    if (key === '__other') return '#8a92b2';
    const m = FF.colorMaps[dim] || (FF.colorMaps[dim] = { map: new Map(), next: 0 });
    let c = m.map.get(key);
    if (!c) {
      const i = m.next++;
      c = i < PALETTE.length ? PALETTE[i] : 'hsl(' + ((i * 137.5) % 360).toFixed(0) + ' 62% ' + (52 + (i % 3) * 6) + '%)';
      m.map.set(key, c);
    }
    return c;
  };
  FF.primeColors = function (ds) {
    FF.colorMaps = {};
    for (const dim of FF.DIM_ORDER) {
      const tot = new Map();
      for (const t of ds.txs) {
        if (t.kind !== 'expense' && t.kind !== 'income') continue;
        for (const k of FF.DIMS[dim].keys(t)) tot.set(k, (tot.get(k) || 0) + t.mag);
      }
      [...tot.entries()].sort((a, b) => b[1] - a[1]).forEach(e => FF.color(dim, e[0]));
    }
    for (const name of ds.accounts.keys()) FF.color('account', name);
  };

  /* Pick the most informative grouping for the default charts. */
  FF.bestDim = function (ds) {
    let best = 'description', bestScore = 0.45; // require at least ~55% coverage
    for (const dim of ['category', 'tag', 'budget', 'bill']) {
      let tot = 0, none = 0; const keys = new Set();
      for (const t of ds.txs) {
        if (t.kind !== 'expense') continue;
        tot += t.mag;
        const ks = FF.DIMS[dim].keys(t);
        if (ks.length === 1 && ks[0] === '') none += t.mag; else ks.forEach(k => k && keys.add(k));
      }
      if (tot && keys.size >= 2 && none / tot < bestScore) { best = dim; bestScore = none / tot; }
    }
    return best;
  };

  /* ---------- recurring payments ---------- */
  FF.recurring = function (txs) {
    const groups = new Map();
    for (const t of txs) {
      if (t.kind !== 'expense') continue;
      let a = groups.get(t.dk); if (!a) groups.set(t.dk, a = []);
      a.push(t);
    }
    const PERIODS = [
      { p: 7, name: 'Weekly', tol: 1 }, { p: 14, name: 'Every 2 weeks', tol: 2 }, { p: 30.4, name: 'Monthly', tol: 4 },
      { p: 91.3, name: 'Quarterly', tol: 7 }, { p: 365, name: 'Yearly', tol: 12 }
    ];
    const out = [];
    for (const [k, arr] of groups) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => a.day - b.day);
      for (const per of PERIODS) {
        let list = arr;
        if (per.p >= 28) { list = []; for (const t of arr) if (!list.length || t.day - list[list.length - 1].day >= 7) list.push(t); }
        if (list.length < (per.p <= 14 ? 3 : 2)) continue;
        let ok = 0;
        for (let i = 1; i < list.length; i++) if (Math.abs(list[i].day - list[i - 1].day - per.p) <= per.tol) ok++;
        if (ok / (list.length - 1) < 0.7) continue;
        const avg = list.reduce((a, t) => a + t.mag, 0) / list.length;
        const last = list[list.length - 1];
        out.push({ key: k, name: FF.descNames.get(k) || k, period: per, count: list.length, avg, last: last.mag, lastDay: last.day, nextDay: last.day + Math.round(per.p), monthly: avg * 30.44 / per.p, yearly: avg * 365 / per.p, txs: list });
        break;
      }
    }
    return out.sort((a, b) => b.monthly - a.monthly);
  };
})(globalThis.FF = globalThis.FF || {});
