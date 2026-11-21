'use strict';

/* ======================================================================
   Market Movers — frontend
   ====================================================================== */

const TF = [
  { id: '1D', label: 'Day', long: 'today', days: 1 },
  { id: '1W', label: 'Week', long: 'past week', days: 7 },
  { id: '1M', label: 'Month', long: 'past month', days: 30 },
  { id: '1Y', label: 'Year', long: 'past year', days: 365 },
];
const TF_BY_ID = Object.fromEntries(TF.map(t => [t.id, t]));
const MODES = {
  losers: { tagline: 'Top 5 biggest sell-offs' },
  gainers: { tagline: 'Top 5 biggest gainers' },
  volume: { tagline: 'Top 5 most traded by volume' },
};
const CHART_RANGES = [
  { id: '1W', days: 7 }, { id: '1M', days: 30 }, { id: '3M', days: 91 },
  { id: '6M', days: 182 }, { id: '1Y', days: 365 },
];
const REFRESH_MS = 5 * 60 * 1000;

const state = Object.assign(
  { mode: 'losers', tf: '1D', cat: 'all' },
  safeParse(localStorage.getItem('mm-state'))
);
let DATA = null;
let BY_SYM = new Map();
let modalAsset = null;
let modalRange = '1M';

/* ---------- helpers ---------- */
function safeParse(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function shortSym(sym) {
  return sym.replace(/^\^/, '').replace(/-USD$/, '').replace(/=F$/, '').replace(/=X$/, '')
    .replace(/^UNI7083$/, 'UNI').replace(/^000001\.SS$/, 'SSEC').replace(/^DX-Y\.NYB$/, 'DXY');
}
function fmtPrice(v, cat) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  let d;
  if (cat === 'forex') d = a >= 100 ? 2 : 4;
  else if (a >= 1000) d = 2;
  else if (a >= 1) d = 2;
  else if (a >= 0.01) d = 4;
  else return v.toPrecision(4);
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(v) {
  if (v == null || !isFinite(v)) return '—';
  const s = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
  return (v > 0 ? '+' : '') + s + '%';
}
function fmtVol(v) {
  if (!v) return '—';
  const u = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [n, s] of u) if (v >= n) return (v / n).toFixed(v / n >= 100 ? 0 : 1) + s;
  return String(Math.round(v));
}
function fmtDate(t, days) {
  const d = new Date(t * 1000);
  if (days <= 182) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
const cls = v => (v == null || !isFinite(v) || v === 0) ? 'flat' : v < 0 ? 'down' : 'up';
const catMeta = id => DATA.categories.find(c => c.id === id) || { label: id, icon: '•', color: '#888' };

/* ---------- ranking ---------- */
function rank(assets, tf, mode, n = 5) {
  let list;
  if (mode === 'volume') {
    list = assets.filter(a => a.volumes[tf] > 0).sort((a, b) => b.volumes[tf] - a.volumes[tf]);
  } else {
    // Only genuine decliners count as "most sold" (and only risers as gainers).
    list = assets.filter(a => a.changes[tf] != null && isFinite(a.changes[tf]) &&
      (mode === 'losers' ? a.changes[tf] < 0 : a.changes[tf] > 0));
    list.sort((a, b) => mode === 'losers' ? a.changes[tf] - b.changes[tf] : b.changes[tf] - a.changes[tf]);
  }
  return list.slice(0, n);
}

function sliceSeries(a, days) {
  const { t, c } = a.series;
  const cutoff = a.marketTime - days * 86400;
  let i = t.findIndex(x => x > cutoff);
  if (i < 0) i = t.length - 1;
  i = Math.max(0, i - 1);
  return { t: t.slice(i), c: c.slice(i) };
}

/* ---------- tiny visuals ---------- */
function sparkline(values, c) {
  if (!values || values.length < 2) return '';
  const w = 96, h = 30, p = 2;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [p + i * (w - 2 * p) / (values.length - 1), p + (h - 2 * p) * (1 - (v - min) / span)]);
  const d = 'M' + pts.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L');
  const area = `${d}L${pts.at(-1)[0].toFixed(1)},${h}L${pts[0][0].toFixed(1)},${h}Z`;
  return `<svg class="sparkline ${c}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path class="area" d="${area}"/><path class="line" d="${d}"/></svg>`;
}

function rangeBar(a) {
  const lo = a.dayLow, hi = a.dayHigh;
  if (lo == null || hi == null || hi <= lo) return sparkline(sliceSeries(a, 7).c, cls(a.changes['1D']));
  const pos = Math.min(100, Math.max(0, (a.price - lo) / (hi - lo) * 100));
  return `<div class="range" title="Day range ${fmtPrice(lo, a.category)} – ${fmtPrice(hi, a.category)}">
    <div class="track"><div class="fill" style="width:${pos}%"></div><div class="knob" style="left:${pos}%"></div></div>
    <div class="rl"><span>Low</span><span>High</span></div></div>`;
}

/* ---------- rendering ---------- */
function render() {
  localStorage.setItem('mm-state', JSON.stringify(state));
  $$('#mode-seg button').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
  $$('#tf-seg button').forEach(b => b.classList.toggle('active', b.dataset.tf === state.tf));
  $('#tagline').textContent = MODES[state.mode].tagline +
    (state.tf === 'ALL' ? ' · day, week, month & year' : ' · ' + TF_BY_ID[state.tf].long);
  if (!DATA) return;
  renderChips();
  renderPulse();
  renderGrid();
}

function renderChips() {
  const counts = {};
  DATA.assets.forEach(a => counts[a.category] = (counts[a.category] || 0) + 1);
  const chip = (id, label, icon, color, n) => `
    <button class="chip ${state.cat === id ? 'active' : ''}" data-cat="${id}" style="--accent:${color}">
      <span class="ci">${icon}</span>${esc(label)}<span class="cn">${n}</span></button>`;
  $('#cat-chips').innerHTML =
    chip('all', 'All markets', '◉', '#e7eaf1', DATA.assets.length) +
    DATA.categories.map(c => chip(c.id, c.label, c.icon, c.color, counts[c.id] || 0)).join('');
}

function renderPulse() {
  const tf = state.tf === 'ALL' ? '1D' : state.tf;
  const tfl = TF_BY_ID[tf];
  const scope = DATA.assets.filter(a => state.cat === 'all' || a.category === state.cat);
  const withChg = scope.filter(a => a.changes[tf] != null);
  const down = withChg.filter(a => a.changes[tf] < 0).length;
  const up = withChg.filter(a => a.changes[tf] > 0).length;
  const worst = rank(scope, tf, 'losers', 1)[0];
  const best = rank(scope, tf, 'gainers', 1)[0];
  const sorted = withChg.map(a => a.changes[tf]).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  const total = down + up || 1;

  const assetTile = (label, a) => a ? `
    <div class="tile click" data-sym="${esc(a.symbol)}">
      <div class="tl">${label} · ${tfl.label}</div>
      <div class="tv">${esc(shortSym(a.symbol))} <span class="chg ${cls(a.changes[tf])}">${fmtPct(a.changes[tf])}</span></div>
      <div class="ts">${esc(a.name)} · ${esc(catMeta(a.category).label)}</div>
    </div>` : '';

  $('#pulse').innerHTML = `
    <div class="tile">
      <div class="tl">Market breadth · ${tfl.label}</div>
      <div class="tv"><span style="color:var(--down)">${down} ▼</span><span style="color:var(--up)">${up} ▲</span>
        <span class="ts">of ${withChg.length} assets</span></div>
      <div class="breadth"><div class="b-down" style="width:${down / total * 100}%"></div><div class="b-up" style="width:${up / total * 100}%"></div></div>
    </div>
    ${assetTile('Biggest sell-off', worst)}
    ${assetTile('Biggest gain', best)}
    <div class="tile">
      <div class="tl">Median move · ${tfl.label}</div>
      <div class="tv"><span class="chg ${cls(median)}">${fmtPct(median)}</span></div>
      <div class="ts">${median == null ? '' : median < 0 ? 'Sellers in control' : 'Buyers in control'}</div>
    </div>`;
}

function rowHtml(a, i, tf, compact) {
  const ch = a.changes[tf];
  const c = cls(ch);
  const primary = state.mode === 'volume'
    ? `<span class="vol" title="Volume ${TF_BY_ID[tf].long}">${fmtVol(a.volumes[tf])}</span>`
    : (compact ? '' : `<span class="price">${fmtPrice(a.price, a.category)}</span>`);
  const visual = compact ? '' :
    `<div class="spark">${tf === '1D' ? rangeBar(a) : sparkline(sliceSeries(a, TF_BY_ID[tf].days).c, c)}</div>`;
  return `<li class="row" data-sym="${esc(a.symbol)}" tabindex="0">
    <span class="rank">${i + 1}</span>
    <div class="ident"><span class="sym">${esc(shortSym(a.symbol))}</span><span class="name">${esc(a.name)}</span></div>
    ${visual}
    <div class="vals">${primary}<span class="chg ${c}">${fmtPct(ch)}</span></div>
  </li>`;
}

function listHtml(assets, tf, compact) {
  const top = rank(assets, tf, state.mode);
  if (!top.length) {
    const msg = { volume: 'No volume data for this market', losers: 'Nothing declined in this period',
      gainers: 'Nothing gained in this period' }[state.mode];
    return `<div class="empty-row">${msg}</div>`;
  }
  return `<ol class="rows">${top.map((a, i) => rowHtml(a, i, tf, compact)).join('')}</ol>`;
}

function renderGrid() {
  const cats = DATA.categories.filter(c => state.cat === 'all' || c.id === state.cat);
  const html = cats.map((cat, idx) => {
    const assets = DATA.assets.filter(a => a.category === cat.id);
    const head = `<header class="card-h"><span class="badge">${cat.icon}</span><h2>${esc(cat.label)}</h2>
      <span class="sub">${assets.length} tracked</span></header>`;
    const style = `style="--accent:${cat.color};animation-delay:${idx * 30}ms"`;
    if (state.tf === 'ALL') {
      return `<article class="card wide" ${style}>${head}<div class="tf-cols">
        ${TF.map(t => `<div class="tf-col"><h3>${t.label}</h3>${listHtml(assets, t.id, true)}</div>`).join('')}
      </div></article>`;
    }
    return `<article class="card" ${style}>${head}${listHtml(assets, state.tf, false)}</article>`;
  }).join('');
  $('#grid').innerHTML = html || '<div class="empty">No data</div>';
}

/* ---------- modal ---------- */
function openModal(sym) {
  const a = BY_SYM.get(sym);
  if (!a) return;
  modalAsset = a;
  const cat = catMeta(a.category);
  modalRange = state.tf === '1D' || state.tf === 'ALL' ? '1M' : state.tf;
  const d1 = a.changes['1D'];
  $('#modal-body').innerHTML = `
    <div class="m-head" style="--accent:${cat.color}">
      <span class="badge">${cat.icon}</span>
      <div><h2 id="m-title">${esc(a.name)} <span style="color:var(--dim);font-weight:600">${esc(shortSym(a.symbol))}</span></h2>
      <p>${esc(cat.label)} · ${esc(a.symbol)}${a.exchange ? ' · ' + esc(a.exchange) : ''}</p></div>
    </div>
    <div class="m-price">
      <span class="big">${fmtPrice(a.price, a.category)}</span><span class="cur">${esc(a.currency)}</span>
      <span class="chg ${cls(d1)}">${fmtPct(d1)} today</span>
    </div>
    <div class="m-bar">
      <div class="seg" id="range-seg">${CHART_RANGES.map(r => `<button data-range="${r.id}">${r.id}</button>`).join('')}</div>
      <span id="range-chg"></span>
    </div>
    <div id="chart"></div>
    <div class="m-stats">
      ${TF.map(t => `<div class="m-stat"><div class="k">${t.label}</div>
        <div class="v"><span class="chg ${cls(a.changes[t.id])}">${fmtPct(a.changes[t.id])}</span></div>
        <div class="s">Vol ${fmtVol(a.volumes[t.id])}</div></div>`).join('')}
    </div>
    <div class="m-meta">
      <div class="m-stat"><div class="k">Day range</div><div class="v">${fmtPrice(a.dayLow, a.category)} – ${fmtPrice(a.dayHigh, a.category)}</div></div>
      <div class="m-stat"><div class="k">52-week range</div><div class="v">${fmtPrice(a.yearLow, a.category)} – ${fmtPrice(a.yearHigh, a.category)}</div></div>
      <div class="m-stat"><div class="k">Last update</div><div class="v">${new Date(a.marketTime * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div></div>
    </div>`;
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
  drawChart();
}

function closeModal() {
  $('#modal').hidden = true;
  document.body.style.overflow = '';
  modalAsset = null;
}

function drawChart() {
  const a = modalAsset;
  if (!a) return;
  $$('#range-seg button').forEach(b => b.classList.toggle('active', b.dataset.range === modalRange));
  const range = CHART_RANGES.find(r => r.id === modalRange);
  const wrap = $('#chart');
  const { t, c } = sliceSeries(a, range.days);
  const n = c.length;
  if (n < 2) { wrap.innerHTML = '<div class="empty">Not enough history</div>'; return; }

  const W = wrap.clientWidth || 640, H = 260;
  const P = { l: 6, r: 70, t: 14, b: 26 };
  const min = Math.min(...c), max = Math.max(...c);
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.01 || 1;
  const lo = min - pad, hi = max + pad;
  const x = i => P.l + i * (W - P.l - P.r) / (n - 1);
  const y = v => P.t + (H - P.t - P.b) * (1 - (v - lo) / (hi - lo));
  const chg = (c[n - 1] / c[0] - 1) * 100;
  const k = cls(chg);

  let d = '';
  c.forEach((v, i) => { d += (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); });
  const area = `${d}L${x(n - 1).toFixed(1)},${H - P.b}L${x(0).toFixed(1)},${H - P.b}Z`;

  let grid = '';
  for (let g = 0; g <= 4; g++) {
    const v = lo + (hi - lo) * g / 4, yy = y(v).toFixed(1);
    grid += `<line class="gl" x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}"/>
      <text class="gt" x="${W - P.r + 8}" y="${+yy + 4}">${fmtPrice(v, a.category)}</text>`;
  }
  let xl = '';
  for (let g = 0; g <= 4; g++) {
    const i = Math.round(g * (n - 1) / 4);
    const anchor = g === 0 ? 'start' : g === 4 ? 'end' : 'middle';
    xl += `<text class="gt" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}">${fmtDate(t[i], range.days)}</text>`;
  }

  wrap.innerHTML = `
    <svg class="chart ${k}" width="${W}" height="${H}">
      <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="currentColor" stop-opacity=".28"/>
        <stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
      ${grid}
      <line class="base" x1="${P.l}" x2="${W - P.r}" y1="${y(c[0]).toFixed(1)}" y2="${y(c[0]).toFixed(1)}"/>
      <path d="${area}" fill="url(#cg)"/><path class="cl" d="${d}"/>
      ${xl}
      <g class="hover" style="display:none"><line class="hl" y1="${P.t}" y2="${H - P.b}"/><circle class="hd" r="4.5"/></g>
      <rect class="overlay" x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent"/>
    </svg>
    <div class="tip" hidden></div>`;

  $('#range-chg').innerHTML = `<span class="chg ${k}">${fmtPct(chg)}</span> over ${range.id}`;

  const svg = $('svg', wrap), hover = $('.hover', svg), line = $('.hl', hover), dot = $('.hd', hover), tip = $('.tip', wrap);
  const move = ev => {
    const rect = svg.getBoundingClientRect();
    const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
    const i = Math.max(0, Math.min(n - 1, Math.round((px - P.l) / (W - P.l - P.r) * (n - 1))));
    const xx = x(i), yy = y(c[i]);
    hover.style.display = '';
    line.setAttribute('x1', xx); line.setAttribute('x2', xx);
    dot.setAttribute('cx', xx); dot.setAttribute('cy', yy);
    tip.hidden = false;
    tip.innerHTML = `<span>${new Date(t[i] * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>${fmtPrice(c[i], a.category)}`;
    tip.style.left = Math.max(70, Math.min(W - 90, xx)) + 'px';
  };
  const leave = () => { hover.style.display = 'none'; tip.hidden = true; };
  const overlay = $('.overlay', svg);
  overlay.addEventListener('mousemove', move);
  overlay.addEventListener('touchmove', move, { passive: true });
  overlay.addEventListener('mouseleave', leave);
  overlay.addEventListener('touchend', leave);
}

/* ---------- data ---------- */
const PUBLIC_URL = 'https://hiquyenok.github.io/market-movers/';
const REMOTE_DATA_URL = 'https://hiquyenok.github.io/market-movers/data.json';

function setStatus(kind, text) {
  $('#status-dot').className = 'dot ' + kind;
  $('#status-text').textContent = text;
  $('#refresh-btn').classList.toggle('spinning', kind === 'loading');
}

function applyData(data) {
  if (!data || !data.assets || !data.assets.length) return false;
  DATA = data;
  BY_SYM = new Map(DATA.assets.map(a => [a.symbol, a]));
  render();
  return true;
}

async function overlayLiveCrypto() {
  if (!DATA || !DATA.assets) return false;
  const cryptos = DATA.assets.filter(a => a.category === 'crypto');
  if (!cryptos.length) return false;
  const map = new Map();
  for (const a of cryptos) {
    const bSym = a.symbol.replace(/^UNI7083-USD$/, 'UNIUSDT').replace(/-USD$/, 'USDT');
    map.set(bSym, a);
  }
  const q = encodeURIComponent(JSON.stringify([...map.keys()]));
  const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${q}`, { cache: 'no-store' });
  if (!res.ok) return false;
  const rows = await res.json();
  const nowSec = Math.floor(Date.now() / 1000);
  for (const r of rows) {
    const a = map.get(r.symbol);
    if (!a) continue;
    const price = parseFloat(r.lastPrice);
    if (!isFinite(price) || price <= 0) continue;
    a.price = price;
    a.dayLow = parseFloat(r.lowPrice) || a.dayLow;
    a.dayHigh = parseFloat(r.highPrice) || a.dayHigh;
    a.changes['1D'] = parseFloat(r.priceChangePercent);
    a.volumes['1D'] = Math.round(parseFloat(r.quoteVolume) || a.volumes['1D']);
    a.marketTime = nowSec;
    if (a.series && a.series.c && a.series.c.length) {
      a.series.c[a.series.c.length - 1] = price;
      for (const [tf, days] of [['1W', 7], ['1M', 30], ['1Y', 365]]) {
        const cutoff = nowSec - days * 86400;
        let idx = a.series.t.findIndex(t => t > cutoff) - 1;
        if (idx >= 0 && a.series.c[idx]) {
          a.changes[tf] = +((price / a.series.c[idx] - 1) * 100).toFixed(4);
        }
      }
    }
  }
  return true;
}

async function tryFetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data || !data.assets || !data.assets.length) throw new Error('empty dataset');
  return data;
}

async function load(force = false) {
  if (!DATA && window.__EMBEDDED_DATA__) {
    applyData(window.__EMBEDDED_DATA__);
  }
  setStatus('loading', DATA ? 'Refreshing…' : 'Fetching market data…');

  const isLocalServer = location.protocol.startsWith('http') &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

  let updatedFrom = null;
  if (isLocalServer) {
    try {
      const d = await tryFetchJson('/api/movers' + (force ? '?refresh=1' : ''));
      applyData(d);
      updatedFrom = d.source === 'demo' ? 'demo' : 'local';
    } catch { /* fall through to static/cloud sources */ }
  }

  if (!updatedFrom) {
    const candidates = [];
    if (location.protocol.startsWith('http')) {
      candidates.push(`./data.json?t=${Date.now()}`);
    }
    candidates.push(`${REMOTE_DATA_URL}?t=${Date.now()}`);
    for (const url of candidates) {
      try {
        const d = await tryFetchJson(url);
        if (!DATA || (d.generatedAt || 0) >= (DATA.generatedAt || 0)) {
          applyData(d);
        }
        updatedFrom = 'cloud';
        break;
      } catch { /* try next candidate */ }
    }
    try {
      if (await overlayLiveCrypto()) {
        render();
        if (modalAsset) drawChart();
        updatedFrom = updatedFrom || 'binance';
      }
    } catch { /* offline or blocked */ }
  }

  if (DATA) {
    const dt = new Date((DATA.generatedAt || Math.floor(Date.now() / 1000)) * 1000);
    const time = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (DATA.source === 'demo') {
      setStatus('demo', `Demo data · ${time}`);
    } else if (updatedFrom) {
      setStatus('live', `Live · ${DATA.assets.length}/${DATA.total} assets · ${time}`);
    } else {
      const day = dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
      setStatus('live', `Snapshot · ${DATA.assets.length} assets · ${day} ${time}`);
    }
  } else {
    setStatus('error', 'Could not load market data');
    $('#grid').innerHTML = `<div class="empty"><p>Couldn't reach the market data feed.</p>
      <p style="color:var(--dim)">Check your connection or run <code>./start.sh</code> locally.</p></div>`;
  }
}

async function copyShareLink() {
  const url = location.protocol === 'https:' ? location.href : PUBLIC_URL;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const btn = $('#share-btn'), lbl = $('#share-label');
  if (btn && lbl) {
    btn.classList.add('copied');
    lbl.textContent = 'Link Copied!';
    setTimeout(() => { btn.classList.remove('copied'); lbl.textContent = 'Copy Link'; }, 2200);
  }
}

async function downloadStandaloneHtml() {
  if (!DATA) return;
  let css = $('#app-css')?.textContent;
  if (!css) {
    try { css = await (await fetch('styles.css')).text(); } catch { css = ''; }
  }
  let js = $('#app-js')?.textContent;
  if (!js) {
    try { js = await (await fetch('app.js')).text(); } catch { js = ''; }
  }
  const doc = document.documentElement.cloneNode(true);
  const modal = doc.querySelector('#modal');
  if (modal) modal.setAttribute('hidden', '');
  doc.querySelectorAll('link[rel="stylesheet"][href="styles.css"], script[src="app.js"], #app-css, #app-js, #embedded-data').forEach(el => el.remove());

  const styleEl = document.createElement('style');
  styleEl.id = 'app-css';
  styleEl.textContent = css;
  doc.querySelector('head').appendChild(styleEl);

  const dataEl = document.createElement('script');
  dataEl.id = 'embedded-data';
  dataEl.textContent = `window.__EMBEDDED_DATA__ = ${JSON.stringify(DATA)};`;
  doc.querySelector('body').appendChild(dataEl);

  const jsEl = document.createElement('script');
  jsEl.id = 'app-js';
  jsEl.textContent = js;
  doc.querySelector('body').appendChild(jsEl);

  const html = '<!doctype html>\n' + doc.outerHTML;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'market-movers.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- events ---------- */
$('#mode-seg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.mode = b.dataset.mode; render();
});
$('#tf-seg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.tf = b.dataset.tf; render();
});
$('#cat-chips').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  state.cat = b.dataset.cat; render();
});
document.addEventListener('click', e => {
  const r = e.target.closest('[data-sym]');
  if (r && !e.target.closest('#modal')) openModal(r.dataset.sym);
  if (e.target.closest('[data-close]')) closeModal();
  const rb = e.target.closest('#range-seg button');
  if (rb) { modalRange = rb.dataset.range; drawChart(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalAsset) closeModal();
  if (e.key === 'Enter' && e.target.matches('.row')) openModal(e.target.dataset.sym);
});
$('#refresh-btn').addEventListener('click', () => load(true));
$('#share-btn')?.addEventListener('click', copyShareLink);
$('#download-btn')?.addEventListener('click', downloadStandaloneHtml);
let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(drawChart, 120); });

render();
load();
setInterval(() => load(false), REFRESH_MS);
