(function (FF) {
  'use strict';
  const esc = FF.esc, U = FF.ui, V = FF.views, K = FF.COLORS;
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  /* ---------- spending / income explorer ---------- */
  V.spending = function (root, c) {
    const S = FF.S, E = S.explore, by = E.by, flow = E.flow, cur = c.cur, D = FF.DIMS[by];
    const money = v => FF.money(v, cur), axis = (v, full) => FF.money(v, cur, !full);
    const fcolor = flow === 'expense' ? K.bad : K.good;
    const base = c.ex({ [by]: true });
    const groups = FF.group(base, by, flow);
    const total = groups.reduce((a, g) => a + g.value, 0);
    const colored = list => list.map(g => Object.assign({ color: FF.color(by, g.key) }, g));
    const tmItems = colored(FF.topN(groups, 40)), listItems = colored(FF.topN(groups, 13));
    const nb = c.buckets.length;

    // trend by group (respects all active filters)
    const g2 = FF.group(c.txs, by, flow), topKeys = g2.slice(0, 8).map(g => g.key), kset = new Set(topKeys);
    const trend = new Map(topKeys.map(k => [k, new Array(nb).fill(0)])), other = new Array(nb).fill(0);
    const daily = new Map(), wdTot = new Array(7).fill(0);
    for (const t of c.txs) {
      if (t.kind !== flow) continue;
      daily.set(t.day, (daily.get(t.day) || 0) + t.mag);
      wdTot[FF.weekday(t.day)] += t.mag;
      const i = c.buckets.idx(t.day); if (i === undefined) continue;
      const ks = D.keys(t), share = t.mag / ks.length;
      for (const k of ks) (kset.has(k) ? trend.get(k) : other)[i] += share;
    }
    const tseries = topKeys.map(k => ({ name: D.name(k), color: FF.color(by, k), values: trend.get(k) }));
    if (g2.length > 8) tseries.push({ name: 'Other', color: '#8a92b2', values: other });
    const wdCount = new Array(7).fill(0);
    for (let d = c.from; d <= c.to; d++) wdCount[FF.weekday(d)]++;

    // table with per-group sparklines
    const rowSpark = new Map();
    for (const t of base) {
      if (t.kind !== flow) continue;
      const i = c.buckets.idx(t.day); if (i === undefined) continue;
      const ks = D.keys(t), share = t.mag / ks.length;
      for (const k of ks) { let a = rowSpark.get(k); if (!a) rowSpark.set(k, a = new Array(nb).fill(0)); a[i] += share; }
    }
    const selSet = S.dims[by];
    const rows = groups.slice(0, 60).map(g => {
      const on = selSet.has(g.key), col = FF.color(by, g.key);
      return '<tr class="' + (on ? 'sel' : selSet.size ? 'dim' : '') + '" data-act="dim" data-dim="' + by + '" data-key="' + esc(g.key) + '"><td>' + U.dot(col) + esc(g.name) + '</td><td class="r">' + esc(money(g.value)) + '</td><td class="r">' + FF.pct(g.value / (total || 1), 1) +
        '</td><td class="r">' + g.count + '</td><td class="r">' + esc(money(g.value / g.count)) + '</td><td class="spark-cell">' + FF.charts.spark(rowSpark.get(g.key) || [], col) + '</td></tr>';
    }).join('');

    const flowLbl = flow === 'expense' ? 'Spending' : 'Income';
    root.innerHTML = '<div class="toolbar">' + U.seg('exFlow', [{ v: 'expense', l: 'Expenses' }, { v: 'income', l: 'Income' }], flow) +
      '<label class="inline">Group by ' + U.select('exBy', U.dimOptions(FF.DIM_ORDER), by) + '</label>' +
      '<span class="toolbar-note">' + (by === 'tag' ? 'Transactions with several tags are split evenly between them.' : '') + '</span></div><div class="grid">' +
      U.card({ cls: 'span-7', title: flowLbl + ' by ' + D.label.toLowerCase(), sub: esc(money(total)) + ' · click a tile to filter', body: groups.length ? '<div id="c-tm"></div>' : U.empty() }) +
      U.card({ cls: 'span-5', title: 'Ranking', body: groups.length ? U.breakdown(listItems, { dim: by, total, fmt: money }) : U.empty() }) +
      U.card({ cls: 'span-12', title: flowLbl + ' over time', sub: 'Top ' + Math.min(8, g2.length) + ' ' + D.label.toLowerCase() + ' groups per ' + c.buckets.g, actions: U.select('gran', [{ v: 'auto', l: 'Auto' }, { v: 'day', l: 'Daily' }, { v: 'week', l: 'Weekly' }, { v: 'month', l: 'Monthly' }], S.gran),
        body: '<div id="c-trend"></div><div class="legend">' + tseries.map(s => '<span>' + U.dot(s.color) + esc(s.name) + '</span>').join('') + '</div>' }) +
      U.card({ cls: 'span-8', title: 'Daily calendar', sub: 'Darker = more ' + (flow === 'expense' ? 'spent' : 'received') + ' · click a day to zoom', body: '<div id="c-cal" class="scroll-x"></div>' }) +
      U.card({ cls: 'span-4', title: 'Average by weekday', sub: 'Per calendar day in the period', body: '<div id="c-wd"></div>' }) +
      U.card({ cls: 'span-12', title: 'All ' + D.label.toLowerCase() + ' groups', body: groups.length ? '<div class="scroll-x"><table class="tbl hov"><thead><tr><th>' + esc(D.label) + '</th><th class="r">Total</th><th class="r">Share</th><th class="r">Txns</th><th class="r">Avg.</th><th>Trend</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : U.empty() }) +
      '</div>';

    const tm = root.querySelector('#c-tm');
    if (tm) FF.charts.treemap(tm, { items: tmItems, fmt: axis, selected: selSet, height: 360, onClick: it => FF.acts.dim({ dim: by, key: it.key }) });
    FF.charts.bars(root.querySelector('#c-trend'), { cats: c.buckets, series: tseries, stacked: true, height: 280, yFmt: axis, onClick: i => FF.setRange(Math.max(c.from, c.buckets[i].start), Math.min(c.to, c.buckets[i].end)) });
    FF.charts.calendar(root.querySelector('#c-cal'), { from: c.from, to: c.to, values: daily, color: fcolor, fmt: axis, onClick: d => FF.setRange(d, d) });
    FF.charts.bars(root.querySelector('#c-wd'), { cats: WD.map(w => ({ label: w })), series: [{ name: 'Average', color: fcolor, values: wdTot.map((v, i) => wdCount[i] ? v / wdCount[i] : 0) }], height: 250, yFmt: axis, labelW: 34 });
  };

  /* ---------- insights ---------- */
  V.insights = function (root, c) {
    const S = FF.S, cur = c.cur;
    const money = v => FF.money(v, cur), axis = (v, full) => FF.money(v, cur, !full);
    const exps = c.txs.filter(t => t.kind === 'expense');
    const mags = exps.map(t => t.mag).sort((a, b) => a - b);
    const total = mags.reduce((a, b) => a + b, 0);
    const median = mags.length ? (mags.length % 2 ? mags[(mags.length - 1) / 2] : (mags[mags.length / 2 - 1] + mags[mags.length / 2]) / 2) : 0;
    const spendDays = new Map(); exps.forEach(t => spendDays.set(t.day, (spendDays.get(t.day) || 0) + t.mag));
    let noSpend = 0, streak = 0, best = 0;
    for (let d = c.from; d <= c.to; d++) { if (spendDays.has(d)) streak = 0; else { noSpend++; streak++; if (streak > best) best = streak; } }
    let bigDay = null; spendDays.forEach((v, d) => { if (!bigDay || v > bigDay.v) bigDay = { d, v }; });
    const wd = new Array(7).fill(0), wdN = new Array(7).fill(0);
    exps.forEach(t => { wd[FF.weekday(t.day)] += t.mag; });
    for (let d = c.from; d <= c.to; d++) wdN[FF.weekday(d)]++;
    const wdAvg = wd.map((v, i) => wdN[i] ? v / wdN[i] : 0), wdTop = wdAvg.indexOf(Math.max.apply(null, wdAvg));

    // month pace: cumulative spending this month vs last month
    const all = c.ex({ date: true }), ms = FF.bucketStart(c.to, 'month'), me = FF.bucketEnd(ms, 'month');
    const pms = FF.bucketStart(ms - 1, 'month'), pme = ms - 1;
    const dim = me - ms + 1, pdim = pme - pms + 1, elapsed = Math.min(c.to, me) - ms + 1;
    const cum = (start, len, upto) => { const a = new Array(len).fill(0); for (const t of all) if (t.kind === 'expense' && t.day >= start && t.day < start + len) a[t.day - start] += t.mag; let s = 0; return a.map((v, i) => (s += v, i < upto ? s : null)); };
    const curCum = cum(ms, dim, elapsed), prevCum = cum(pms, pdim, pdim);
    const spentSoFar = curCum[elapsed - 1] || 0, projected = elapsed ? spentSoFar / elapsed * dim : 0, lastTotal = prevCum[pdim - 1] || 0;
    const L = Math.max(dim, pdim), pxs = Array.from({ length: L }, (_, i) => i + 1);
    const pad = (a, n) => a.concat(new Array(n - a.length).fill(null));

    // monthly summary
    const mb = FF.makeBuckets(c.from, c.to, 'month'), mi = FF.bucketize(c.txs, mb, 'income'), me2 = FF.bucketize(c.txs, mb, 'expense');
    const mrows = mb.map((b, i) => '<tr><td>' + esc(b.full) + '</td><td class="r pos">' + esc(money(mi[i])) + '</td><td class="r neg">' + esc(money(me2[i])) + '</td><td class="r">' + esc(money(mi[i] - me2[i])) + '</td><td class="r">' + (mi[i] ? FF.pct((mi[i] - me2[i]) / mi[i]) : '–') + '</td></tr>').join('');

    const rec = FF.recurring(all);
    const recMonthly = rec.reduce((a, r) => a + r.monthly, 0);
    const recRows = rec.map(r => '<tr data-act="openTx" data-id="' + esc(r.txs[r.txs.length - 1].id) + '"><td>' + esc(r.name) + '</td><td>' + esc(r.period.name) + '</td><td class="r">' + esc(money(r.avg)) + '</td><td class="r">' + r.count + '×</td><td>' + esc(FF.fmtDate(r.lastDay, 'mdy')) + '</td><td>' + esc(FF.fmtDate(r.nextDay, 'mdy')) + '</td><td class="r"><b>' + esc(money(r.monthly)) + '</b></td></tr>').join('');

    const freq = FF.group(exps, 'description', 'expense').sort((a, b) => b.count - a.count || b.value - a.value).slice(0, 8);
    const kp = [
      { l: 'Largest expense', v: exps.length ? money(mags[mags.length - 1]) : '–', sub: exps.length ? esc(exps.reduce((a, t) => t.mag > a.mag ? t : a).desc) : '', sp: [], color: K.bad },
      { l: 'Typical expense', v: money(median), sub: 'median · mean ' + esc(money(exps.length ? total / exps.length : 0)), sp: [], color: K.accent },
      { l: 'Priciest day', v: bigDay ? money(bigDay.v) : '–', sub: bigDay ? esc(FF.fmtDate(bigDay.d, 'long')) : '', sp: [], color: K.bad },
      { l: 'Heaviest weekday', v: exps.length ? FF.fmtDate(FF.dayNum('2024-01-01') + wdTop, 'wd') : '–', sub: exps.length ? 'avg ' + esc(money(wdAvg[wdTop])) + ' per day' : '', sp: [], color: K.info },
      { l: 'No-spend days', v: noSpend + ' / ' + c.days, sub: 'longest streak: ' + best + ' day' + (best === 1 ? '' : 's'), sp: [], color: K.good }
    ];

    root.innerHTML = '<div class="kpis">' + kp.map(U.kpi).join('') + '</div><div class="grid">' +
      U.card({ cls: 'span-8', title: 'Spending pace · ' + esc(FF.fmtDate(ms, 'month')), sub: 'Cumulative expenses by day of month vs. ' + esc(FF.fmtDate(pms, 'month')), body: '<div id="c-pace"></div><div class="legend"><span>' + U.dot(K.accent) + 'This month</span><span>' + U.dot('#8a92b2') + 'Last month</span></div>' }) +
      U.card({ cls: 'span-4', title: 'Month outlook', body: '<div class="stack-stats"><div><span>Spent so far</span><b>' + esc(money(spentSoFar)) + '</b></div><div><span>Projected month-end</span><b>' + esc(money(projected)) + '</b><small>at the current daily pace (' + elapsed + ' of ' + dim + ' days)</small></div><div><span>Last month total</span><b>' + esc(money(lastTotal)) + '</b>' +
        (lastTotal ? '<small class="' + (projected > lastTotal ? 'neg' : 'pos') + '">' + (projected >= lastTotal ? '▲ ' : '▼ ') + Math.abs((projected - lastTotal) / lastTotal * 100).toFixed(0) + '% vs last month</small>' : '') + '</div></div>' }) +
      U.card({ cls: 'span-12', title: 'Recurring payments', sub: rec.length ? 'Detected from repeating expenses · about ' + esc(money(recMonthly)) + ' per month · ' + esc(money(recMonthly * 12)) + ' per year (ignores the date filter)' : 'Detected from repeating expenses (ignores the date filter)',
        body: rec.length ? '<div class="scroll-x"><table class="tbl hov"><thead><tr><th>Payment</th><th>Frequency</th><th class="r">Typical</th><th class="r">Seen</th><th>Last</th><th>Next expected</th><th class="r">Per month</th></tr></thead><tbody>' + recRows + '</tbody></table></div>' : U.empty('No repeating payments found yet. At least two matching expenses are needed.') }) +
      U.card({ cls: 'span-6', title: 'Most frequent purchases', sub: 'By number of transactions', body: freq.length ? '<div class="bl">' + freq.map(g => '<div class="bl-row static"><span class="bl-bar" style="width:' + g.count / freq[0].count * 100 + '%;background:' + K.accent + '"></span><span class="bl-n">' + esc(g.name) + '</span><span class="bl-v">' + esc(money(g.value)) + '</span><span class="bl-p">' + g.count + '×</span></div>').join('') + '</div>' : U.empty() }) +
      U.card({ cls: 'span-6', title: 'Monthly summary', body: mb.length ? '<div class="scroll-x"><table class="tbl"><thead><tr><th>Month</th><th class="r">Income</th><th class="r">Expenses</th><th class="r">Net</th><th class="r">Saved</th></tr></thead><tbody>' + mrows + '</tbody></table></div>' : U.empty() }) +
      '</div>';

    FF.charts.timeSeries(root.querySelector('#c-pace'), {
      xs: pxs, height: 280, zero: true, yFmt: axis, xTick: d => String(d), xFull: d => 'Day ' + d,
      series: [{ name: FF.fmtDate(pms, 'my'), color: '#8a92b2', values: pad(prevCum, L), dash: '5 4', width: 1.8 }, { name: FF.fmtDate(ms, 'my'), color: K.accent, values: pad(curCum, L), area: false, width: 2.6 }]
    });
  };

  /* ---------- transactions table ---------- */
  const SORTS = {
    date: (a, b) => a.day - b.day || (a.time < b.time ? -1 : a.time > b.time ? 1 : 0),
    desc: (a, b) => a.desc.localeCompare(b.desc),
    kind: (a, b) => a.typeRaw.localeCompare(b.typeRaw),
    category: (a, b) => a.category.localeCompare(b.category),
    account: (a, b) => a.src.localeCompare(b.src),
    amount: (a, b) => signed(a) - signed(b)
  };
  const signed = t => t.kind === 'expense' ? -t.mag : t.mag;

  V.transactions = function (root, c) {
    const S = FF.S, T = S.tx, cur = c.cur;
    const kinds = [{ v: 'all', l: 'All' }, { v: 'expense', l: 'Expenses' }, { v: 'income', l: 'Income' }, { v: 'transfer', l: 'Transfers' }, { v: 'opening', l: 'Opening balances' }];
    let rows = T.kind === 'all' ? c.txs.slice() : c.txs.filter(t => t.kind === T.kind);
    rows.sort((a, b) => T.dir * SORTS[T.sort](a, b));
    const pages = Math.max(1, Math.ceil(rows.length / T.size));
    T.page = Math.min(T.page, pages - 1);
    const slice = rows.slice(T.page * T.size, (T.page + 1) * T.size);
    const inc = FF.sum(rows, 'income'), exp = FF.sum(rows, 'expense');
    const th = (col, label, cls) => '<th class="sortable ' + (cls || '') + (T.sort === col ? ' sorted' : '') + '" data-act="sort" data-col="' + col + '">' + label + (T.sort === col ? (T.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>';
    const body = slice.map(t => '<tr data-act="openTx" data-id="' + esc(t.id) + '"><td class="nowrap">' + esc(FF.fmtDate(t.day, 'mdy')) + '</td><td class="desc">' + esc(t.desc || '(no description)') + (t.notes ? ' <span class="note-ic" title="Has notes">✎</span>' : '') +
      (t.tags.length ? '<div class="tags">' + t.tags.map(g => U.pill(g, FF.color('tag', g))).join('') + '</div>' : '') + '</td><td>' + U.kindBadge(t) + '</td><td>' + (t.category ? U.pill(t.category, FF.color('category', t.category)) : '<span class="muted">–</span>') +
      '</td><td class="acc">' + esc(t.src) + ' <span class="arrow">→</span> ' + esc(t.dst) + '</td><td class="r">' + U.amountHtml(t) + '</td></tr>').join('');
    const pager = pages > 1 ? '<div class="pager"><button data-act="page" data-p="' + (T.page - 1) + '"' + (T.page === 0 ? ' disabled' : '') + '>‹ Prev</button><span>Page ' + (T.page + 1) + ' of ' + pages + '</span><button data-act="page" data-p="' + (T.page + 1) + '"' + (T.page >= pages - 1 ? ' disabled' : '') + '>Next ›</button></div>' : '';

    root.innerHTML = '<div class="toolbar">' + U.seg('txKind', kinds, T.kind) + '<span class="toolbar-note">' + rows.length + ' transaction' + (rows.length === 1 ? '' : 's') + ' · income ' + esc(FF.money(inc, cur)) + ' · expenses ' + esc(FF.money(exp, cur)) + '</span>' +
      '<button class="btn ghost" data-act="exportCsv">Export filtered CSV</button></div>' +
      '<section class="card"><div class="card-b flush">' + (rows.length ? '<div class="scroll-x"><table class="tbl hov tx"><thead><tr>' + th('date', 'Date') + th('desc', 'Description') + th('kind', 'Type') + th('category', 'Category') + th('account', 'Accounts') + th('amount', 'Amount', 'r') + '</tr></thead><tbody>' + body + '</tbody></table></div>' + pager : U.empty('No transactions match the current filters')) + '</div></section>';
  };
})(globalThis.FF = globalThis.FF || {});
