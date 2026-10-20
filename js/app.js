(function (FF) {
  'use strict';
  const esc = FF.esc, U = FF.ui;
  const $ = (s, r) => (r || document).querySelector(s);

  const freshDims = () => { const d = {}; FF.DIM_ORDER.forEach(k => { d[k] = new Set(); }); return d; };
  const S = FF.S = {
    ds: null, cur: null, range: { preset: 'all', from: null, to: null }, dims: freshDims(), q: '', view: 'overview', gran: 'auto',
    ovBy: 'category', explore: { flow: 'expense', by: 'category' }, flow: { inBy: 'payee', outBy: 'category', transfers: false },
    tx: { kind: 'all', sort: 'date', dir: -1, page: 0, size: 50 }, ui: { search: {}, open: { account: true, category: true } }
  };
  FF.acts = {}; FF.changes = {};

  const TABS = [['overview', 'Overview'], ['accounts', 'Accounts'], ['flow', 'Cash flow'], ['spending', 'Spending & income'], ['insights', 'Insights'], ['transactions', 'Transactions']];
  const PRESETS = [['all', 'All time'], ['month', 'This month'], ['30d', '30 days'], ['90d', '90 days'], ['12m', '12 months'], ['year', 'This year']];

  /* ---------- context ---------- */
  function presetRange(p, min, max) {
    const y = new Date(max * FF.DAY).getUTCFullYear();
    switch (p) {
      case 'month': return [FF.bucketStart(max, 'month'), max];
      case '30d': return [Math.max(min, max - 29), max];
      case '90d': return [Math.max(min, max - 89), max];
      case '12m': return [Math.max(min, max - 364), max];
      case 'year': return [Math.max(min, Date.UTC(y, 0, 1) / FF.DAY), max];
      default: return [min, max];
    }
  }

  function buildCtx() {
    const ds = S.ds, cur = S.cur, ext = ds.range[cur];
    let from, to;
    if (S.range.preset === 'custom') { from = S.range.from == null ? ext.min : S.range.from; to = S.range.to == null ? ext.max : S.range.to; }
    else [from, to] = presetRange(S.range.preset, ext.min, ext.max);
    if (from > to) [from, to] = [to, from];
    const f = { cur, from, to, dims: S.dims, q: S.q.trim().toLowerCase() };
    const base = ds.byCur[cur];
    const c = { cur, from, to, days: to - from + 1, ext, f, base, ds };
    c.txs = FF.filter(base, f);
    c.ex = ex => FF.filter(base, f, ex);
    const pf = from - c.days, pt = from - 1;
    const overlap = Math.max(0, pt - Math.max(pf, ext.min) + 1) / c.days;
    c.prev = S.range.preset !== 'all' && overlap >= 0.6 ? FF.filter(base, Object.assign({}, f, { from: pf, to: pt })) : null;
    c.gran = FF.pickGran(from, to, S.gran);
    c.buckets = FF.makeBuckets(from, to, c.gran);
    c.sel = S.dims.account.size ? S.dims.account : null;
    return c;
  }

  /* ---------- rendering ---------- */
  FF.render = function () {
    if (!S.ds) return;
    const y = window.scrollY;
    FF.charts.dispose(); FF.tip.hide();
    const c = FF.ctx = buildCtx();
    renderSidebar(c); renderChips(c); renderTabs(); renderMeta(c);
    const view = $('#view');
    try { FF.views[S.view](view, c); }
    catch (e) { console.error(e); view.innerHTML = U.empty('Could not render this view: ' + e.message); }
    window.scrollTo(0, y);
  };

  function renderMeta(c) {
    const ds = S.ds;
    $('#meta').textContent = ds.txs.length + ' transactions · ' + FF.fmtDate(ds.range[S.cur].min, 'mdy') + ' – ' + FF.fmtDate(ds.range[S.cur].max, 'mdy');
  }

  function renderTabs() {
    $('#tabs').innerHTML = TABS.map(t => '<button class="tab' + (S.view === t[0] ? ' on' : '') + '" data-act="tab" data-v="' + t[0] + '">' + t[1] + '</button>').join('');
  }

  function renderChips(c) {
    const chips = [];
    if (S.range.preset !== 'all') chips.push('<span class="chip"><b>Period</b> ' + esc(FF.fmtDate(c.from, 'mdy') + (c.from === c.to ? '' : ' – ' + FF.fmtDate(c.to, 'mdy'))) + '<button data-act="rmChip" data-type="range" aria-label="Remove">×</button></span>');
    if (S.q.trim()) chips.push('<span class="chip"><b>Search</b> ' + esc(S.q.trim()) + '<button data-act="rmChip" data-type="q" aria-label="Remove">×</button></span>');
    for (const d of FF.DIM_ORDER) for (const k of S.dims[d]) chips.push('<span class="chip"><b>' + esc(FF.DIMS[d].label) + '</b> ' + esc(FF.DIMS[d].name(k)) + '<button data-act="rmChip" data-type="dim" data-dim="' + d + '" data-key="' + esc(k) + '" aria-label="Remove">×</button></span>');
    $('#chips').innerHTML = chips.length ? chips.join('') + '<button class="link" data-act="resetAll">Clear all</button>' : '';
    $('#chips').classList.toggle('has', chips.length > 0);
  }

  function checklist(dim, title, c) {
    const D = FF.DIMS[dim], cnt = new Map();
    for (const t of c.ex({ [dim]: true })) { if (t.kind === 'opening') continue; for (const k of D.keys(t)) cnt.set(k, (cnt.get(k) || 0) + 1); }
    const keys = new Set(cnt.keys()); S.dims[dim].forEach(k => keys.add(k));
    for (const t of c.base) for (const k of D.keys(t)) keys.add(k);
    if (dim === 'account') for (const n of S.ds.acctCur[c.cur] || []) keys.add(n);
    const list = [...keys].filter(k => dim === 'account' ? k : true).sort((a, b) => (cnt.get(b) || 0) - (cnt.get(a) || 0) || D.name(a).localeCompare(D.name(b)));
    if (!list.some(k => k !== '') && !S.dims[dim].size) return '';
    const sel = S.dims[dim];
    const items = list.map(k => '<button class="ck' + (sel.has(k) ? ' on' : '') + (cnt.get(k) ? '' : ' zero') + '" data-act="dim" data-dim="' + dim + '" data-key="' + esc(k) + '" data-name="' + esc(D.name(k).toLowerCase()) + '"><span class="box"></span>' +
      (dim === 'account' || dim === 'category' ? U.dot(FF.color(dim, k)) : '') + '<span class="ck-n">' + esc(D.name(k)) + '</span><em>' + (cnt.get(k) || 0) + '</em></button>').join('');
    const open = S.ui.open[dim];
    return '<details class="side-sec" data-dim="' + dim + '"' + (open ? ' open' : '') + '><summary><h4>' + title + (sel.size ? ' <span class="count">' + sel.size + '</span>' : '') + '</h4></summary>' +
      (list.length > 8 ? '<input class="mini-search" data-dim="' + dim + '" placeholder="Filter…" value="' + esc(S.ui.search[dim] || '') + '">' : '') + '<div class="checks">' + items + '</div></details>';
  }

  function renderSidebar(c) {
    const side = $('#sidebar'), keep = side.scrollTop;
    const ext = c.ext;
    let h = '<div class="side-sec static"><h4>Period</h4><div class="presets">' + PRESETS.map(p => '<button class="' + (S.range.preset === p[0] ? 'on' : '') + '" data-act="preset" data-v="' + p[0] + '">' + p[1] + '</button>').join('') + '</div>' +
      '<div class="dates"><input type="date" data-change="from" value="' + FF.dayStr(c.from) + '" min="' + FF.dayStr(ext.min) + '" max="' + FF.dayStr(ext.max) + '"><span>–</span><input type="date" data-change="to" value="' + FF.dayStr(c.to) + '" min="' + FF.dayStr(ext.min) + '" max="' + FF.dayStr(ext.max) + '"></div></div>';
    if (S.ds.currencies.size > 1) h += '<div class="side-sec static"><h4>Currency</h4>' + U.select('cur', [...S.ds.currencies.keys()].map(k => ({ v: k, l: k + ' (' + S.ds.currencies.get(k) + ')' })), S.cur) + '</div>';
    h += checklist('account', 'Accounts', c) + checklist('category', 'Categories', c) + checklist('tag', 'Tags', c) + checklist('bill', 'Bills', c) + checklist('budget', 'Budgets', c);
    h += '<div class="side-foot"><button class="btn ghost block" data-act="resetAll">Reset all filters</button><p>Balances respect the account and period filters. Everything else applies to income, spending and transactions.</p></div>';
    side.innerHTML = h;
    side.scrollTop = keep;
    side.querySelectorAll('.mini-search').forEach(applySearch);
  }

  function applySearch(inp) {
    const q = inp.value.trim().toLowerCase();
    inp.closest('.side-sec').querySelectorAll('.ck').forEach(b => { b.hidden = !!q && b.dataset.name.indexOf(q) < 0; });
  }

  /* ---------- state changes ---------- */
  FF.setRange = (from, to) => { S.range = { preset: 'custom', from, to }; S.tx.page = 0; FF.render(); };

  FF.acts.dim = d => {
    const set = S.dims[d.dim]; if (!set) return;
    if (set.has(d.key)) set.delete(d.key); else set.add(d.key);
    S.tx.page = 0; FF.render();
  };
  FF.acts.tab = d => { S.view = d.v; document.body.classList.remove('side-open'); FF.render(); window.scrollTo(0, 0); };
  FF.acts.preset = d => { S.range = { preset: d.v, from: null, to: null }; S.tx.page = 0; FF.render(); };
  FF.acts.rmChip = d => {
    if (d.type === 'range') S.range = { preset: 'all', from: null, to: null };
    else if (d.type === 'q') { S.q = ''; $('#q').value = ''; }
    else S.dims[d.dim].delete(d.key);
    S.tx.page = 0; FF.render();
  };
  FF.acts.resetAll = () => { S.range = { preset: 'all', from: null, to: null }; S.dims = freshDims(); S.q = ''; $('#q').value = ''; S.tx.page = 0; FF.render(); };
  FF.acts.seg = (d, el) => FF.changes[d.name](d.v, el);
  FF.acts.sort = d => { const T = S.tx; if (T.sort === d.col) T.dir = -T.dir; else { T.sort = d.col; T.dir = d.col === 'date' || d.col === 'amount' ? -1 : 1; } T.page = 0; FF.render(); };
  FF.acts.page = d => { S.tx.page = Math.max(0, +d.p); FF.render(); window.scrollTo(0, 0); };
  FF.acts.theme = () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('ff-theme', t); } catch (e) { /* storage unavailable */ }
  };
  FF.acts.newFile = () => $('#file').click();
  FF.acts.toggleSidebar = () => document.body.classList.toggle('side-open');

  const change = (name, fn) => { FF.changes[name] = (v, el) => { fn(v, el); S.tx.page = 0; FF.render(); }; };
  change('gran', v => { S.gran = v; });
  change('ovBy', v => { S.ovBy = v; });
  change('exFlow', v => { S.explore.flow = v; });
  change('exBy', v => { S.explore.by = v; });
  change('flowIn', v => { S.flow.inBy = v; });
  change('flowOut', v => { S.flow.outBy = v; });
  change('flowTr', (v, el) => { S.flow.transfers = el.checked; });
  change('txKind', v => { S.tx.kind = v; });
  change('cur', v => { S.cur = v; S.range = { preset: 'all', from: null, to: null }; S.dims = freshDims(); });
  change('from', v => { if (v) S.range = { preset: 'custom', from: FF.dayNum(v), to: FF.ctx.to }; });
  change('to', v => { if (v) S.range = { preset: 'custom', from: FF.ctx.from, to: FF.dayNum(v) }; });

  /* ---------- transaction drawer & export ---------- */
  FF.acts.openTx = d => {
    const t = S.ds.byId.get(d.id); if (!t) return;
    const row = (k, v) => v ? '<div class="dr-row"><dt>' + k + '</dt><dd>' + v + '</dd></div>' : '';
    const acct = (n, type, iban) => esc(n) + ' <small>' + esc(type) + (iban ? ' · ' + esc(iban) : '') + '</small>';
    const url = /^https?:\/\//i.test(t.raw.external_url || '') ? '<a href="' + esc(t.raw.external_url) + '" target="_blank" rel="noopener noreferrer">' + esc(t.raw.external_url) + '</a>' : esc(t.raw.external_url || '');
    $('#drawer').innerHTML = '<header><div><small>' + U.kindBadge(t) + '</small><h2>' + esc(t.desc || '(no description)') + '</h2><div class="dr-amt">' + U.amountHtml(t) + (t.fAmt ? ' <small>(' + esc(FF.money(t.fAmt, t.fCur)) + ')</small>' : '') + '</div></div><button class="icon-btn" data-act="closeDrawer" aria-label="Close">×</button></header><dl>' +
      row('Date', esc(FF.fmtDate(t.day, 'long') + (t.time ? ' · ' + t.time : ''))) + row('From', acct(t.src, t.srcType, t.srcIban)) + row('To', acct(t.dst, t.dstType, t.dstIban)) +
      row('Category', esc(t.category)) + row('Budget', esc(t.budget)) + row('Bill', esc(t.bill)) + row('Tags', t.tags.map(g => U.pill(g, FF.color('tag', g))).join(' ')) +
      row('Notes', t.notes ? '<span class="pre">' + esc(t.notes) + '</span>' : '') + row('Group', esc(t.title)) + row('Reconciled', t.reconciled ? 'Yes' : '') + row('Link', url) + row('Reference', esc(t.raw.internal_reference)) +
      row('Journal / group ID', esc(t.id + (t.gid ? ' / ' + t.gid : ''))) + '</dl>';
    document.body.classList.add('drawer-open'); $('#drawer').setAttribute('aria-hidden', 'false');
  };
  FF.acts.closeDrawer = () => { document.body.classList.remove('drawer-open'); $('#drawer').setAttribute('aria-hidden', 'true'); };

  FF.acts.exportCsv = () => {
    const c = FF.ctx, T = S.tx;
    const rows = (T.kind === 'all' ? c.txs : c.txs.filter(t => t.kind === T.kind));
    const out = [['date', 'time', 'type', 'description', 'amount', 'currency', 'source', 'destination', 'category', 'budget', 'bill', 'tags', 'notes']];
    rows.forEach(t => out.push([t.date, t.time, t.typeRaw, t.desc, t.amount, t.cur, t.src, t.dst, t.category, t.budget, t.bill, t.tags.join(','), t.notes]));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + FF.toCSV(out)], { type: 'text/csv' }));
    a.download = 'filtered_transactions_' + FF.dayStr(Math.floor(Date.now() / FF.DAY)) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  /* ---------- loading ---------- */
  const REQUIRED = ['type', 'amount', 'date'];
  async function loadFiles(files) {
    const err = $('#import-error'); err.hidden = true;
    try {
      let objs = [], cols = null;
      for (const f of files) {
        const parsed = FF.parseCSVObjects(await f.text());
        if (!parsed.columns) continue;
        cols = parsed.columns;
        const missing = REQUIRED.filter(r => cols.indexOf(r) < 0);
        if (missing.length) throw new Error('"' + f.name + '" does not look like a Firefly III transaction export (missing column' + (missing.length > 1 ? 's' : '') + ': ' + missing.join(', ') + ').');
        objs = objs.concat(parsed);
      }
      const txs = FF.normalize(objs);
      if (!txs.length) throw new Error('No transactions were found in the selected file' + (files.length > 1 ? 's' : '') + '.');
      start(FF.buildDataset(txs));
    } catch (e) {
      console.error(e);
      err.textContent = e.message; err.hidden = false;
      if (S.ds) alert(e.message);
    }
  }

  function start(ds) {
    ds.byId = new Map(ds.txs.map(t => [t.id, t]));
    S.ds = ds; S.cur = ds.currency;
    FF.primeColors(ds);
    S.range = { preset: 'all', from: null, to: null }; S.dims = freshDims(); S.q = ''; $('#q').value = '';
    const best = FF.bestDim(ds);
    S.ovBy = best; S.explore = { flow: 'expense', by: best }; S.gran = 'auto';
    S.flow = { inBy: ds.txs.some(t => t.kind === 'income' && !t.srcPh && t.src) ? 'payee' : 'description', outBy: best, transfers: false };
    S.tx = { kind: 'all', sort: 'date', dir: -1, page: 0, size: 50 };
    S.ui = { search: {}, open: { account: true, category: true } };
    S.view = 'overview';
    FF.acts.closeDrawer();
    $('#import').hidden = true; $('#app').hidden = false;
    FF.render();
  }

  /* ---------- wiring ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = FF.acts[el.dataset.act];
    if (fn) fn(el.dataset, el, e);
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-change]');
    if (el && FF.changes[el.dataset.change]) FF.changes[el.dataset.change](el.type === 'checkbox' ? el.checked : el.value, el);
  });
  document.addEventListener('input', e => {
    if (e.target.classList.contains('mini-search')) { S.ui.search[e.target.dataset.dim] = e.target.value; applySearch(e.target); }
  });
  document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('details.side-sec')) S.ui.open[e.target.dataset.dim] = e.target.open; }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') FF.acts.closeDrawer(); });

  let qTimer;
  $('#q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = e.target.value; S.tx.page = 0; FF.render(); }, 160); });

  const fileInput = $('#file'), drop = $('#drop');
  fileInput.addEventListener('change', () => { if (fileInput.files.length) loadFiles([...fileInput.files]); fileInput.value = ''; });
  drop.addEventListener('click', e => { e.preventDefault(); fileInput.click(); });
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });

  let dragDepth = 0;
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].indexOf('Files') >= 0;
  window.addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; document.body.classList.add('dragging'); } });
  window.addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
    const files = [...e.dataTransfer.files].filter(f => /\.(csv|txt)$/i.test(f.name) || f.type.indexOf('text') === 0);
    if (files.length) loadFiles(files);
  });
})(globalThis.FF = globalThis.FF || {});
