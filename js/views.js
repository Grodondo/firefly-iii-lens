(function (FF) {
  'use strict';
  const esc = FF.esc;
  const U = FF.ui = {};
  const V = FF.views = {};
  const ACCENT = '#6366f1', GOOD = '#22c55e', BAD = '#f43f5e', INFO = '#38bdf8';
  FF.COLORS = { accent: ACCENT, good: GOOD, bad: BAD, info: INFO };

  /* ---------- shared UI helpers ---------- */
  U.card = o => '<section class="card ' + (o.cls || '') + '"><header class="card-h"><div><h3>' + o.title + '</h3>' +
    (o.sub ? '<p class="sub">' + o.sub + '</p>' : '') + '</div><div class="card-actions">' + (o.actions || '') + '</div></header><div class="card-b">' + o.body + '</div></section>';

  U.select = (name, opts, val) => '<select class="sel" data-change="' + name + '">' +
    opts.map(o => '<option value="' + esc(o.v) + '"' + (String(o.v) === String(val) ? ' selected' : '') + '>' + esc(o.l) + '</option>').join('') + '</select>';

  U.seg = (name, opts, val) => '<div class="seg">' + opts.map(o => '<button class="' + (String(o.v) === String(val) ? 'on' : '') + '" data-act="seg" data-name="' + name + '" data-v="' + esc(o.v) + '">' + esc(o.l) + '</button>').join('') + '</div>';

  U.dimOptions = list => list.map(d => ({ v: d, l: FF.DIMS[d].label }));

  U.empty = msg => '<div class="empty">' + esc(msg || 'No data for the current filters') + '</div>';
  U.dot = c => '<i class="dot" style="background:' + c + '"></i>';

  U.delta = (v, prev, upGood) => {
    if (prev == null) return '<div class="delta muted">&nbsp;</div>';
    if (!prev && !v) return '<div class="delta muted">no change</div>';
    if (!prev) return '<div class="delta muted">new vs previous period</div>';
    const p = (v - prev) / Math.abs(prev), good = (p >= 0) === upGood;
    return '<div class="delta ' + (Math.abs(p) < 0.005 ? 'muted' : good ? 'good' : 'bad') + '">' + (p >= 0 ? '▲' : '▼') + ' ' + Math.abs(p * 100).toFixed(1) + '% vs previous period</div>';
  };
  U.deltaAbs = (diff, fmt, note) => '<div class="delta ' + (Math.abs(diff) < 0.005 ? 'muted' : diff > 0 ? 'good' : 'bad') + '">' + (diff >= 0 ? '▲ ' : '▼ ') + fmt(Math.abs(diff)) + ' ' + (note || 'in period') + '</div>';

  U.kpi = k => '<div class="kpi"><div class="kpi-l">' + k.l + '</div><div class="kpi-v">' + k.v + '</div>' + (k.d || '') + (k.sub ? '<div class="kpi-s">' + k.sub + '</div>' : '') +
    '<div class="kpi-spark">' + FF.charts.spark(k.sp, k.color) + '</div></div>';

  // Ranked, clickable legend/list used next to donuts and treemaps.
  U.breakdown = (items, o) => {
    const sel = FF.S.dims[o.dim], total = o.total || items.reduce((a, i) => a + Math.max(0, i.value), 0) || 1, max = Math.max.apply(null, items.map(i => i.value).concat(1));
    return '<div class="bl">' + items.map(it => {
      const on = sel.size && sel.has(it.key);
      return '<button class="bl-row' + (on ? ' sel' : '') + (sel.size && !on ? ' dim' : '') + '"' + (it.other ? ' disabled' : ' data-act="dim" data-dim="' + o.dim + '" data-key="' + esc(it.key) + '"') + '>' +
        '<span class="bl-bar" style="width:' + Math.max(0, it.value / max * 100) + '%;background:' + it.color + '"></span>' +
        '<span class="bl-n">' + U.dot(it.color) + esc(it.name) + '</span><span class="bl-v">' + esc(o.fmt(it.value)) + '</span><span class="bl-p">' + (it.value >= 0 ? FF.pct(it.value / total, 0) : '') + '</span></button>';
    }).join('') + '</div>';
  };

  U.pill = (text, color) => '<span class="pill"' + (color ? ' style="--pc:' + color + '"' : '') + '>' + esc(text) + '</span>';

  U.amountHtml = (t, cur) => {
    const m = FF.money(t.mag, t.cur);
    if (t.kind === 'expense') return '<span class="amt neg">−' + esc(m) + '</span>';
    if (t.kind === 'income') return '<span class="amt pos">+' + esc(m) + '</span>';
    return '<span class="amt">' + esc(m) + '</span>';
  };
  U.kindBadge = t => '<span class="badge k-' + t.kind + '">' + esc(t.typeRaw || t.kind) + '</span>';

  U.txMini = t => '<button class="tx-mini" data-act="openTx" data-id="' + esc(t.id) + '"><span class="tm-date">' + esc(FF.fmtDate(t.day, 'md')) + '</span><span class="tm-desc">' + esc(t.desc || '(no description)') +
    '<small>' + esc(t.category || t.tags[0] || (t.kind === 'transfer' ? t.src + ' → ' + t.dst : t.src)) + '</small></span>' + U.amountHtml(t) + '</button>';

  U.tickFmt = c => d => FF.fmtDate(d, c.days > 400 ? 'my' : 'md');

  /* ---------- overview ---------- */
  V.overview = function (root, c) {
    const S = FF.S, cur = c.cur;
    const money = v => FF.money(v, cur), axis = (v, full) => FF.money(v, cur, !full);
    const inc = FF.sum(c.txs, 'income'), exp = FF.sum(c.txs, 'expense'), net = inc - exp;
    const pInc = c.prev ? FF.sum(c.prev, 'income') : null, pExp = c.prev ? FF.sum(c.prev, 'expense') : null;
    const pNet = c.prev ? pInc - pExp : null;
    const bal = FF.balances(S.ds, cur, c.sel, c.from, c.to);
    const nwEnd = bal.total[bal.total.length - 1];
    const opened = c.base.reduce((a, t) => a + (t.kind === 'opening' && t.day >= c.from && t.day <= c.to && t.dstOwned && (!c.sel || c.sel.has(t.dst)) ? t.mag : 0), 0);
    const Bi = FF.bucketize(c.txs, c.buckets, 'income'), Be = FF.bucketize(c.txs, c.buckets, 'expense');
    const expCount = c.txs.filter(t => t.kind === 'expense').length;

    const kpis = [
      { l: c.sel ? 'Balance (selected)' : 'Net worth', v: money(nwEnd), d: U.deltaAbs(nwEnd - bal.start - opened, money), sp: FF.charts.sample(bal.total, 40), color: ACCENT },
      { l: 'Income', v: money(inc), d: U.delta(inc, pInc, true), sp: Bi, color: GOOD },
      { l: 'Expenses', v: money(exp), d: U.delta(exp, pExp, false), sp: Be, color: BAD },
      { l: 'Net saved', v: money(net), d: U.delta(net, pNet, true), sub: 'Savings rate ' + (inc ? FF.pct(net / inc) : '–'), sp: Bi.map((v, i) => v - Be[i]), color: INFO },
      { l: 'Avg. daily spend', v: money(exp / c.days), sub: expCount + ' expense transaction' + (expCount === 1 ? '' : 's') + ' · ' + c.days + ' days', sp: Be, color: '#f59e0b' }
    ];

    const by = S.ovBy, base = c.ex({ [by]: true }), groups = FF.group(base, by, 'expense');
    const items = FF.topN(groups, 9).map(g => Object.assign({ color: FF.color(by, g.key) }, g));
    const baseTotal = groups.reduce((a, g) => a + g.value, 0);

    const accItems = bal.names.map((n, i) => ({ key: n, name: n, value: bal.vals[i][bal.vals[i].length - 1], color: FF.color('account', n) })).sort((a, b) => b.value - a.value);
    const posTotal = accItems.reduce((a, i) => a + Math.max(0, i.value), 0);

    const top = c.txs.filter(t => t.kind === 'expense').sort((a, b) => b.mag - a.mag).slice(0, 6);
    const latest = c.txs.filter(t => t.kind !== 'opening').slice(-6).reverse();

    // Net worth chart: one point per bucket, with the transactions behind each point for the tooltip.
    const nwGran = S.nwGran === 'auto' ? (c.days <= 120 ? 'day' : c.days <= 450 ? 'week' : 'month') : S.nwGran;
    const nwB = FF.makeBuckets(c.from, c.to, nwGran), nwDays = nwB.map(b => Math.min(b.end, c.to));
    const byAcc = S.nwMode === 'accounts';
    const nwSeries = byAcc
      ? bal.names.map((n, i) => ({ name: n, color: FF.color('account', n), values: nwDays.map(d => bal.vals[i][d - c.from]) }))
      : [{ name: c.sel ? 'Balance' : 'Net worth', color: ACCENT, values: nwDays.map(d => bal.total[d - c.from]) }];
    const inSel = n => !c.sel || c.sel.has(n);
    const nwTx = nwB.map(() => ({ list: [], internal: 0, net: 0 }));
    for (const t of c.base) {
      if (t.day < c.from || t.day > c.to) continue;
      const b = nwTx[nwB.idx(t.day)], eff = (t.dstOwned && inSel(t.dst) ? t.mag : 0) - (t.srcOwned && inSel(t.src) ? t.mag : 0);
      if (eff) { b.list.push({ t, eff }); b.net += eff; } else if (t.kind === 'transfer') b.internal++;
    }
    const signed = v => (v >= 0 ? '+' : '\u2212') + money(Math.abs(v));
    const nwTip = i => {
      const b = nwTx[i];
      if (!b.list.length && !b.internal) return '<div class="tt-sep"></div><div class="tt-more">No transactions</div>';
      let h = '<div class="tt-sep"></div>';
      if (b.list.length) h += FF.charts.tipRow(null, 'Change', signed(b.net), true);
      b.list.slice().sort((x, y) => Math.abs(y.eff) - Math.abs(x.eff)).slice(0, 8).forEach(r => { h += FF.charts.tipRow(null, r.t.desc.length > 30 ? r.t.desc.slice(0, 29) + '\u2026' : r.t.desc || '(no description)', signed(r.eff)); });
      if (b.list.length > 8) h += '<div class="tt-more">+' + (b.list.length - 8) + ' more</div>';
      if (b.internal) h += '<div class="tt-more">' + b.internal + ' transfer' + (b.internal === 1 ? '' : 's') + ' between your accounts</div>';
      return h;
    };

    root.innerHTML = '<div class="kpis">' + kpis.map(U.kpi).join('') + '</div><div class="grid">' +
      U.card({ cls: 'span-8', title: c.sel ? 'Balance over time' : 'Net worth over time', sub: 'Hover for the transactions behind each point \u00b7 drag to zoom',
        actions: U.seg('nwMode', [{ v: 'total', l: 'Total' }, { v: 'accounts', l: 'By account' }], S.nwMode) + '<label class="inline">Detail ' + U.select('nwGran', [{ v: 'auto', l: 'Auto' }, { v: 'day', l: 'Daily' }, { v: 'week', l: 'Weekly' }, { v: 'month', l: 'Monthly' }], S.nwGran) + '</label>',
        body: '<div id="c-nw"></div>' + (byAcc ? '<div class="legend">' + bal.names.map(n => '<span>' + U.dot(FF.color('account', n)) + esc(n) + '</span>').join('') + '</div>' : '') }) +
      U.card({ cls: 'span-4', title: 'Where your money is', sub: 'Balance per account at ' + FF.fmtDate(c.to, 'mdy'), body: accItems.length ? '<div id="c-acc" class="center"></div>' + U.breakdown(accItems, { dim: 'account', total: posTotal, fmt: money }) : U.empty('No accounts') }) +
      U.card({ cls: 'span-8', title: 'Money in vs. out', sub: 'Click a bar to zoom into that ' + c.buckets.g, actions: U.select('gran', [{ v: 'auto', l: 'Auto' }, { v: 'day', l: 'Daily' }, { v: 'week', l: 'Weekly' }, { v: 'month', l: 'Monthly' }], S.gran), body: '<div id="c-flow"></div><div class="legend"><span>' + U.dot(GOOD) + 'Income</span><span>' + U.dot(BAD) + 'Expenses</span><span>' + U.dot(INFO) + 'Net</span></div>' }) +
      U.card({ cls: 'span-4', title: 'Where it goes', actions: U.select('ovBy', U.dimOptions(['category', 'tag', 'budget', 'bill', 'payee', 'description', 'account']), by), body: items.length ? '<div id="c-by" class="center"></div>' + U.breakdown(items, { dim: by, total: baseTotal, fmt: money }) : U.empty('No expenses in this period') }) +
      U.card({ cls: 'span-6', title: 'Biggest expenses', body: top.length ? '<div class="tx-list">' + top.map(U.txMini).join('') + '</div>' : U.empty() }) +
      U.card({ cls: 'span-6', title: 'Latest activity', body: latest.length ? '<div class="tx-list">' + latest.map(U.txMini).join('') + '</div>' : U.empty() }) +
      '</div>';

    FF.charts.timeSeries(root.querySelector('#c-nw'), {
      xs: nwDays, series: nwSeries, stacked: byAcc, area: true, height: 330, tipExtra: nwTip,
      yFmt: axis, xTick: U.tickFmt(c), xFull: d => nwGran === 'day' ? FF.fmtDate(d, 'long') : nwB[nwB.idx(d)].full, onBrush: FF.setRange
    });
    FF.charts.bars(root.querySelector('#c-flow'), {
      cats: c.buckets, height: 430, yFmt: axis,
      series: [{ name: 'Income', color: GOOD, values: Bi }, { name: 'Expenses', color: BAD, values: Be }],
      line: { name: 'Net', color: INFO, values: Bi.map((v, i) => v - Be[i]) },
      onClick: i => FF.setRange(Math.max(c.from, c.buckets[i].start), Math.min(c.to, c.buckets[i].end))
    });
    const acc = root.querySelector('#c-acc');
    if (acc) FF.charts.donut(acc, { items: accItems.filter(i => i.value > 0), centerTop: 'Total', centerValue: axis(posTotal), fmt: axis, selected: S.dims.account, onClick: it => FF.acts.dim({ dim: 'account', key: it.key }), size: 190 });
    const dn = root.querySelector('#c-by');
    if (dn) FF.charts.donut(dn, { items, centerTop: 'Expenses', centerValue: axis(baseTotal), fmt: axis, selected: S.dims[by], onClick: it => FF.acts.dim({ dim: by, key: it.key }), size: 190 });
  };

  /* ---------- accounts ---------- */
  V.accounts = function (root, c) {
    const S = FF.S, cur = c.cur, ds = S.ds;
    const money = v => FF.money(v, cur), axis = (v, full) => FF.money(v, cur, !full);
    const all = FF.balances(ds, cur, null, c.from, c.to);
    const sel = FF.balances(ds, cur, c.sel, c.from, c.to);
    const flowTx = c.ex({ account: true });
    const opened = new Map();
    for (const t of c.base) if (t.kind === 'opening' && t.dstOwned && t.day >= c.from && t.day <= c.to) opened.set(t.dst, (opened.get(t.dst) || 0) + t.mag);
    const st = new Map(all.names.map(n => [n, { inc: 0, exp: 0, tin: 0, tout: 0 }]));
    for (const t of flowTx) {
      if (t.kind === 'income' && t.dstOwned && st.has(t.dst)) st.get(t.dst).inc += t.mag;
      else if (t.kind === 'expense' && t.srcOwned && st.has(t.src)) st.get(t.src).exp += t.mag;
      else if (t.kind === 'transfer') {
        if (t.srcOwned && st.has(t.src)) st.get(t.src).tout += t.mag;
        if (t.dstOwned && st.has(t.dst)) st.get(t.dst).tin += t.mag;
      }
    }
    const rows = all.names.map((n, i) => ({ name: n, i, end: all.vals[i][all.vals[i].length - 1], start: all.starts[i] + (opened.get(n) || 0), a: ds.accounts.get(n) })).sort((a, b) => b.end - a.end);
    const total = rows.reduce((a, r) => a + r.end, 0);
    const selSet = S.dims.account;

    const cards = rows.map(r => {
      const s = st.get(r.name), diff = r.end - r.start, on = selSet.has(r.name);
      return '<button class="acct' + (on ? ' sel' : '') + (selSet.size && !on ? ' dim' : '') + '" data-act="dim" data-dim="account" data-key="' + esc(r.name) + '">' +
        '<div class="acct-top">' + U.dot(FF.color('account', r.name)) + '<span class="acct-n">' + esc(r.name) + '</span>' + (r.a.liability ? '<span class="badge k-liab">Liability</span>' : '') + '</div>' +
        '<div class="acct-bal">' + esc(money(r.end)) + '</div>' + U.deltaAbs(diff, money) +
        '<div class="acct-spark">' + FF.charts.spark(FF.charts.sample(all.vals[r.i], 40), FF.color('account', r.name)) + '</div>' +
        '<div class="acct-meta"><span>In <b class="pos">+' + esc(money(s.inc)) + '</b></span><span>Out <b class="neg">−' + esc(money(s.exp)) + '</b></span>' +
        ((s.tin || s.tout) ? '<span>Transfers <b>+' + esc(money(s.tin)) + ' / −' + esc(money(s.tout)) + '</b></span>' : '') + '</div>' +
        (r.a.iban ? '<div class="acct-iban">' + esc(r.a.iban.slice(0, 4) + ' ···· ' + r.a.iban.slice(-4)) + '</div>' : '') + '</button>';
    }).join('');

    const tr = new Map();
    for (const t of c.txs) if (t.kind === 'transfer') { const k = t.src + '\u0000' + t.dst, g = tr.get(k) || { src: t.src, dst: t.dst, v: 0, n: 0 }; g.v += t.mag; g.n++; tr.set(k, g); }
    const trs = [...tr.values()].sort((a, b) => b.v - a.v), trMax = trs.length ? trs[0].v : 1;

    const legend = '<div class="legend clickable">' + rows.map(r => '<button class="' + (selSet.size && !selSet.has(r.name) ? 'dim' : '') + '" data-act="dim" data-dim="account" data-key="' + esc(r.name) + '">' + U.dot(FF.color('account', r.name)) + esc(r.name) + '</button>').join('') + '</div>';

    root.innerHTML = '<div class="grid">' +
      U.card({ cls: 'span-12', title: 'Accounts', sub: 'Total ' + esc(money(total)) + ' across ' + rows.length + ' account' + (rows.length === 1 ? '' : 's') + ' · click to focus one or more', body: '<div class="acct-grid">' + cards + '</div>' }) +
      U.card({ cls: 'span-12', title: 'Balance by account', sub: 'Stacked balances over time (negative balances are not drawn) · drag to zoom', body: '<div id="c-stack"></div>' + legend }) +
      U.card({ cls: 'span-7', title: 'Activity by account', sub: 'Income received vs. money spent in the period', body: '<div id="c-act"></div><div class="legend"><span>' + U.dot(GOOD) + 'Income</span><span>' + U.dot(BAD) + 'Expenses</span></div>' }) +
      U.card({ cls: 'span-5', title: 'Transfers between accounts', sub: 'Money moved, not earned or spent', body: trs.length ? '<div class="bl">' + trs.map(g => '<div class="bl-row static"><span class="bl-bar" style="width:' + g.v / trMax * 100 + '%;background:' + INFO + '"></span><span class="bl-n">' + esc(g.src) + ' → ' + esc(g.dst) + '</span><span class="bl-v">' + esc(money(g.v)) + '</span><span class="bl-p">' + g.n + '×</span></div>').join('') + '</div>' : U.empty('No transfers in this period') }) +
      '</div>';

    FF.charts.timeSeries(root.querySelector('#c-stack'), {
      xs: sel.xs, stacked: true, height: 300, yFmt: axis, xTick: U.tickFmt(c), xFull: d => FF.fmtDate(d, 'long'), onBrush: FF.setRange,
      series: sel.names.map((n, i) => ({ name: n, color: FF.color('account', n), values: sel.vals[i] }))
    });
    const act = rows.filter(r => st.get(r.name).inc || st.get(r.name).exp);
    FF.charts.bars(root.querySelector('#c-act'), {
      cats: act.map(r => ({ label: r.name.length > 13 ? r.name.slice(0, 12) + '…' : r.name, full: r.name })), height: 260, yFmt: axis,
      series: [{ name: 'Income', color: GOOD, values: act.map(r => st.get(r.name).inc) }, { name: 'Expenses', color: BAD, values: act.map(r => st.get(r.name).exp) }]
    });
  };

  /* ---------- cash flow (sankey) ---------- */
  V.flow = function (root, c) {
    const S = FF.S, F = S.flow, cur = c.cur;
    const shown = n => !c.sel || c.sel.has(n);
    const inD = FF.DIMS[F.inBy], outD = FF.DIMS[F.outBy];
    const keep = (kind, dim, n) => new Set(FF.topN(FF.group(c.txs, dim, kind), n).filter(g => !g.other).map(g => g.key));
    const keepIn = keep('income', F.inBy, 8), keepOut = keep('expense', F.outBy, 12);
    const nodes = new Map(), links = new Map();
    const node = (id, name, layer, color, extra) => { if (!nodes.has(id)) nodes.set(id, Object.assign({ id, name, layer, color }, extra)); return id; };
    const link = (a, b, v, color) => { const k = a + '>' + b; const l = links.get(k) || { source: a, target: b, value: 0, color }; l.value += v; links.set(k, l); };
    const acctNode = n => node('M:' + n, n, 1, FF.color('account', n), { dim: 'account', key: n });
    const inAcc = new Map(), outAcc = new Map();
    let incTot = 0, expTot = 0;

    for (const t of c.txs) {
      if (t.kind === 'income' && t.dstOwned && shown(t.dst)) {
        const ks = inD.keys(t), share = t.mag / ks.length;
        for (const k0 of ks) {
          const k = keepIn.has(k0) ? k0 : '__other';
          const id = node('L:' + k, k === '__other' ? 'Other income' : inD.name(k), 0, FF.color(F.inBy, k), k === '__other' ? {} : { dim: F.inBy, key: k });
          link(id, acctNode(t.dst), share, FF.color(F.inBy, k));
        }
        inAcc.set(t.dst, (inAcc.get(t.dst) || 0) + t.mag); incTot += t.mag;
      } else if (t.kind === 'expense' && t.srcOwned && shown(t.src)) {
        const ks = outD.keys(t), share = t.mag / ks.length;
        for (const k0 of ks) {
          const k = keepOut.has(k0) ? k0 : '__other';
          const id = node('R:' + k, k === '__other' ? 'Other spending' : outD.name(k), 2, FF.color(F.outBy, k), k === '__other' ? {} : { dim: F.outBy, key: k });
          link(acctNode(t.src), id, share, FF.color(F.outBy, k));
        }
        outAcc.set(t.src, (outAcc.get(t.src) || 0) + t.mag); expTot += t.mag;
      } else if (t.kind === 'transfer' && F.transfers) {
        if (t.dstOwned && shown(t.dst)) { link(node('L:__tin', 'Transfers in', 0, '#64748b', { special: 1 }), acctNode(t.dst), t.mag, '#64748b'); inAcc.set(t.dst, (inAcc.get(t.dst) || 0) + t.mag); }
        if (t.srcOwned && shown(t.src)) { link(acctNode(t.src), node('R:__tout', 'Transfers out', 2, '#64748b', { special: 1 }), t.mag, '#64748b'); outAcc.set(t.src, (outAcc.get(t.src) || 0) + t.mag); }
      }
    }
    for (const n of new Set([...inAcc.keys(), ...outAcc.keys()])) {
      const i = inAcc.get(n) || 0, o = outAcc.get(n) || 0;
      if (o > i + 0.005) link(node('L:__bal', F.transfers ? 'From balance' : 'Balance & transfers', 0, '#94a3b8', { special: 1 }), 'M:' + n, o - i, '#94a3b8');
      else if (i > o + 0.005) link('M:' + n, node('R:__sav', F.transfers ? 'Saved' : 'Saved / moved', 2, GOOD, { special: 1 }), i - o, GOOD);
    }

    const fmt = (v, full) => FF.money(v, cur, false);
    root.innerHTML = '<div class="grid">' + U.card({
      cls: 'span-12', title: 'Where your money comes from and where it goes',
      sub: 'Income sources → accounts → spending. Hover to trace a flow, click a node to filter.',
      actions: '<label class="inline">Income by ' + U.select('flowIn', U.dimOptions(['payee', 'category', 'description', 'tag']), F.inBy) + '</label>' +
        '<label class="inline">Spending by ' + U.select('flowOut', U.dimOptions(['category', 'tag', 'budget', 'bill', 'payee', 'description']), F.outBy) + '</label>' +
        '<label class="inline check"><input type="checkbox" data-change="flowTr"' + (F.transfers ? ' checked' : '') + '> Transfers</label>',
      body: '<div id="c-sankey"></div><div class="summary"><div><span>Income</span><b class="pos">' + esc(fmt(incTot)) + '</b></div><div><span>Spent</span><b class="neg">' + esc(fmt(expTot)) + '</b></div><div><span>Net</span><b>' + esc(fmt(incTot - expTot)) + '</b></div></div>'
    }) + '</div>';
    FF.charts.sankey(root.querySelector('#c-sankey'), {
      nodes: [...nodes.values()], links: [...links.values()], fmt,
      onNode: n => FF.acts.dim({ dim: n.dim, key: n.key })
    });
  };
})(globalThis.FF = globalThis.FF || {});
