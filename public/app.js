(() => {
const K = 'sitesboard:v1', FK = 'sitesboard:frames:v1', HOUR = 36e5, BATCH = 48, TTL = 7 * 864e5;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" y1="2" x2="22" y2="22"></line></svg>';
const rd = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || '{}') }; } catch { return d; } };
const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const h = (s, seed) => { let x = (seed ^ 0x811c9dc5) >>> 0; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  x ^= x >>> 15; x = Math.imul(x, 2246822507); return (x ^ x >>> 13) >>> 0; };

let S = rd(K, { fav: {}, hide: {}, seen: {}, known: null, seed: Math.random() * 2 ** 32 >>> 0, at: Date.now(), pin: true });
let F = rd(FK, {});
const save = () => wr(K, S), saveF = () => wr(FK, F);
let items = [], list = [], shown = 0, cur = -1, curItem = null, view = { src: 'all', st: 'active', q: '' };
const byId = new Map();

// CSV: tolerant of quoted rows and unquoted rows whose description contains commas
function parse(text) {
  const out = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.trim(); if (!line) continue;
    let url, desc;
    if (line[0] === '"') { const m = line.match(/^"((?:[^"]|"")*)"\s*,?\s*(.*)$/); if (!m) continue; url = m[1].replace(/""/g, '"'); desc = m[2]; }
    else { const i = line.indexOf(','); url = i < 0 ? line : line.slice(0, i); desc = i < 0 ? '' : line.slice(i + 1); }
    desc = desc.trim(); if (desc[0] === '"' && desc.endsWith('"')) desc = desc.slice(1, -1).replace(/""/g, '"');
    url = url.trim(); if (!/^https?:\/\//i.test(url)) continue; // also skips the header row
    out.push({ url, desc: desc.replace(/\s+/g, ' ') });
  }
  return out;
}
const norm = u => { try { const x = new URL(u); return x.hostname.toLowerCase() + x.pathname.replace(/\/+$/, '') + x.search; } catch { return u; } };

async function boot() {
  const [g, d] = await Promise.all(['google', 'duckduckgo'].map(n => fetch(n + '.csv', { cache: 'no-cache' }).then(r => r.ok ? r.text() : '').catch(() => '')));
  for (const [txt, src] of [[g, 'g'], [d, 'd']]) for (const r of parse(txt)) {
    const id = norm(r.url); let it = byId.get(id);
    if (!it) { let u; try { u = new URL(r.url); } catch { continue; }
      it = { id, url: r.url, host: u.hostname.replace(/^www\./, ''), path: (u.pathname + u.search).replace(/^\/$/, ''), desc: r.desc, srcs: [] }; byId.set(id, it); }
    if (!it.srcs.includes(src)) it.srcs.push(src);
    if (!it.desc && r.desc) it.desc = r.desc;
  }
  items = [...byId.values()];
  if (S.known) { const k = new Set(S.known); items.forEach(i => i.isNew = !k.has(h(i.id, 0).toString(36))); }
  S.known = items.map(i => h(i.id, 0).toString(36)); save();
  $('#pin').checked = S.pin;
  apply(); tick(); setInterval(tick, 3e4);
}

const BLOCK_ICON_SVG = '<svg class="block-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>';
let stExpanded = false;
let srcExpanded = false;

function segs() {
  const n = f => items.filter(f).length;
  
  const allCount = items.length;
  const extraSrcs = [
    ['g', 'Google', i => i.srcs.includes('g')],
    ['d', 'DuckDuckGo', i => i.srcs.includes('d')]
  ];
  const isExtraSrcActive = ['g', 'd'].includes(view.src);
  const extraSrcBtns = extraSrcs.map(([k, l, f]) => `<button data-k="${k}" aria-pressed="${view.src === k}">${l}<small>${n(f)}</small></button>`).join('');

  $('#src').innerHTML = `
    <button data-k="all" aria-pressed="${view.src === 'all'}">All<small>${allCount}</small></button>
    <button id="src-toggle" class="btn-block-toggle${isExtraSrcActive && !srcExpanded ? ' has-active' : ''}" aria-expanded="${srcExpanded}" title="${srcExpanded ? 'Collapse sources' : 'Expand Google, DuckDuckGo'}" aria-label="Toggle Google and DuckDuckGo">
      ${BLOCK_ICON_SVG}
    </button>
    <div class="seg-collapsible${srcExpanded ? ' expanded' : ''}" id="src-more">
      ${extraSrcBtns}
    </div>
  `;
  
  const actCount = n(i => !S.hide[i.id]);
  const extraFilters = [
    ['fav', 'Favourites', i => S.fav[i.id]],
    ['checked', 'Checked', i => S.seen[i.id] && !S.hide[i.id]],
    ['hidden', 'Hidden', i => S.hide[i.id]]
  ];
  const isExtraActive = ['fav', 'checked', 'hidden'].includes(view.st);
  const extraBtns = extraFilters.map(([k, l, f]) => `<button data-k="${k}" aria-pressed="${view.st === k}">${l}<small>${n(f)}</small></button>`).join('');

  $('#st').innerHTML = `
    <button data-k="active" aria-pressed="${view.st === 'active'}">Active<small>${actCount}</small></button>
    <button id="st-toggle" class="btn-block-toggle${isExtraActive && !stExpanded ? ' has-active' : ''}" aria-expanded="${stExpanded}" title="${stExpanded ? 'Collapse options' : 'Expand Favourites, Checked, Hidden'}" aria-label="Toggle Favourites, Checked, and Hidden">
      ${BLOCK_ICON_SVG}
    </button>
    <div class="seg-collapsible${stExpanded ? ' expanded' : ''}" id="st-more">
      ${extraBtns}
    </div>
  `;
}

function apply() {
  const q = view.q.toLowerCase();
  list = items.filter(i => {
    if (view.src !== 'all' && !i.srcs.includes(view.src)) return false;
    const f = S.fav[i.id], hd = S.hide[i.id], seen = S.seen[i.id];
    if (view.st === 'active' && hd) return false;
    if (view.st === 'fav' && !f) return false;
    if (view.st === 'checked' && (!seen || hd)) return false;
    if (view.st === 'hidden' && !hd) return false;
    return !q || (i.url + ' ' + i.desc).toLowerCase().includes(q);
  });
  list.forEach(i => i.o = h(i.id, S.seed));
  list.sort((a, b) => (S.pin && view.st === 'active' ? (!!S.fav[b.id] - !!S.fav[a.id]) : 0) || a.o - b.o);
  $('#grid').innerHTML = ''; shown = 0; more(); segs();
  $('#count').textContent = list.length + (list.length === 1 ? ' program' : ' programs');
}

const card = i => {
  const f = S.fav[i.id], hd = S.hide[i.id], fr = F[i.id], seen = S.seen[i.id];
  const t = i.srcs.map(s => `<span class="tag ${s}">${s === 'g' ? 'Google' : 'DuckDuckGo'}</span>`);
  if (i.isNew) t.push('<span class="tag new">New</span>');
  if (seen) t.push('<span class="tag checked" title="Opened before">✓ Checked</span>');
  const frClass = fr ? (fr.ok ? ' fr-ok' : ' fr-no') : '';
  const seenClass = seen ? ' is-checked' : '';
  const srcClass = i.srcs.length > 1 ? 'gd' : i.srcs[0];
  return `<article class="card ${srcClass}${frClass}${seenClass}" data-id="${esc(i.id)}" tabindex="0">
<div class="ch"><img src="https://www.google.com/s2/favicons?domain=${esc(i.host)}&sz=64" alt="" width="28" height="28" loading="lazy" onerror="this.style.visibility='hidden'">
<div class="ch-info"><h3>${esc(i.host)}${seen ? ' <span class="chk-badge" title="Checked">✓</span>' : ''}</h3><p class="path">${esc(i.path || '/')}</p></div>
<button class="btn-copy-agent" data-a="agent" title="Copy target prompt for AI Agent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>Copy to Agent</button></div>
<p class="desc">${esc(i.desc) || 'No description'}</p>
<div class="cf"><div class="tags">${t.join('')}</div><div class="acts">
<button data-a="fav" aria-pressed="${!!f}" aria-label="Favourite" title="Favourite">${f ? '★' : '☆'}</button>
<button data-a="hide" aria-pressed="${!!hd}" aria-label="${hd ? 'Unhide' : 'Hide'}" title="${hd ? 'Unhide' : 'Hide'}">${hd ? EYE_OFF_SVG : EYE_SVG}</button></div></div></article>`;
};
const elOf = id => [...$('#grid').children].find(e => e.dataset.id === id);
const refresh = it => { const e = elOf(it.id); if (!e) return; e.insertAdjacentHTML('afterend', card(it)); const n = e.nextElementSibling; n.dataset.w = 1; e.remove(); };

const vis = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { vis.unobserve(e.target); const it = byId.get(e.target.dataset.id); it && enqueue(it); } }), { rootMargin: '200px' });
const sentinel = new IntersectionObserver(e => { if (e[0].isIntersecting && shown < list.length) { more(); sentinel.unobserve($('#more')); sentinel.observe($('#more')); } }, { rootMargin: '600px' });
function more() {
  const g = $('#grid'), end = Math.min(list.length, shown + BATCH);
  g.insertAdjacentHTML('beforeend', list.slice(shown, end).map(card).join(''));
  shown = end;
  g.querySelectorAll('.card:not([data-w])').forEach(e => { e.dataset.w = 1; vis.observe(e); });
  $('#empty').hidden = list.length > 0;
}

// Framing check (server-side, cached 7 days in this browser)
const queue = []; let running = 0;
const fresh = id => F[id] && Date.now() - F[id].t < TTL;
function setF(it, ok) { F[it.id] = { ok, t: Date.now() }; saveF(); if (!ok) refresh(it); return ok; }
async function check(it) {
  if (fresh(it.id)) return F[it.id].ok;
  if (/^http:/i.test(it.url)) return setF(it, false); // http can't be framed on an https site
  try { const j = await (await fetch('/api/check?url=' + encodeURIComponent(it.url))).json(); return setF(it, j.ok !== false); }
  catch { return true; }
}
function enqueue(it) { if (!fresh(it.id)) { queue.push(it); pump(); } }
function pump() { while (running < 4 && queue.length) { running++; check(queue.shift()).finally(() => { running--; pump(); }); } }

function open(id) {
  const it = byId.get(id); if (!it) return;
  S.seen[id] = 1; save(); refresh(it); segs();
  window.open(it.url, '_blank', 'noopener,noreferrer');
}

function toggle(kind, id) {
  const it = byId.get(id), m = S[kind]; m[id] ? delete m[id] : m[id] = 1; save();
  const keep = view.st === 'active' ? !S.hide[id] : view.st === 'fav' ? !!S.fav[id] : !!S.hide[id];
  const e = elOf(id);
  if (!keep) {
    list = list.filter(x => x !== it); shown = Math.max(0, shown - 1); e && e.remove();
    toast(kind === 'hide' ? (m[id] ? 'Hidden.' : 'Unhidden.') : (m[id] ? 'Favourited.' : 'Removed from favourites.'), () => { m[id] ? delete m[id] : m[id] = 1; save(); apply(); });
  } else refresh(it);
  segs(); $('#count').textContent = list.length + (list.length === 1 ? ' program' : ' programs');
}

let tt;
function toast(msg, undo) {
  const t = $('#toast'); t.innerHTML = msg + (undo ? '<button id="undo">Undo</button>' : ''); t.className = 'on';
  if (undo) $('#undo').onclick = () => { undo(); t.className = ''; };
  clearTimeout(tt); tt = setTimeout(() => t.className = '', 6000);
}

// Hourly shuffle (runs in this browser only)
function shuffle() { S.seed = Math.random() * 2 ** 32 >>> 0; S.at = Date.now(); save(); apply(); tick(); }
function tick() {
  const left = S.at + HOUR - Date.now();
  if (left <= 0) return shuffle();
}

function copyCardToAgent(id, btn) {
  const it = byId.get(id); if (!it) return;
  const prompt = `Target URL: ${it.url}\nDomain: ${it.host}\nProgram: ${it.desc || it.host}\nTask: Analyze this self-hosted bug bounty program, review its scope, and search for security vulnerabilities.`;
  navigator.clipboard.writeText(prompt).then(() => {
    if (btn) {
      const orig = btn.innerHTML;
      btn.classList.add('copied');
      btn.innerHTML = '✓ Copied!';
      setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = orig; }, 1800);
    }
    toast(`Copied ${it.host} to clipboard for Agent!`);
  }).catch(() => { toast('Failed to copy to clipboard.'); });
}

// Events
$('#grid').addEventListener('click', e => {
  const c = e.target.closest('.card'); if (!c) return;
  const b = e.target.closest('button');
  if (b) {
    if (b.dataset.a === 'agent') copyCardToAgent(c.dataset.id, b);
    else toggle(b.dataset.a, c.dataset.id);
  } else {
    open(c.dataset.id);
  }
});
$('#grid').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('card')) open(e.target.dataset.id); });
$('#src').onclick = e => {
  const toggleBtn = e.target.closest('#src-toggle');
  if (toggleBtn) {
    srcExpanded = !srcExpanded;
    segs();
    return;
  }
  const k = e.target.closest('button')?.dataset.k;
  if (k) {
    view.src = k;
    apply();
  }
};
$('#st').onclick = e => {
  const toggleBtn = e.target.closest('#st-toggle');
  if (toggleBtn) {
    stExpanded = !stExpanded;
    segs();
    return;
  }
  const k = e.target.closest('button')?.dataset.k;
  if (k) {
    view.st = k;
    apply();
  }
};
let qt; $('#q').oninput = e => { clearTimeout(qt); qt = setTimeout(() => { view.q = e.target.value.trim(); apply(); }, 150); };
$('#shuf').onclick = shuffle;
const copyAllBtn = $('#copy-all-agent');
if (copyAllBtn) {
  copyAllBtn.onclick = () => {
    const targets = list.slice(0, 25);
    if (!targets.length) return toast('No targets to copy.');
    const lines = targets.map((it, idx) => `${idx + 1}. ${it.host} - ${it.url}${it.desc ? ` (${it.desc})` : ''}`);
    const prompt = `Self-Hosted Bug Bounty Targets (${targets.length} programs):\n${lines.join('\n')}\n\nTask: Analyze these targets and test for security vulnerabilities.`;
    navigator.clipboard.writeText(prompt).then(() => {
      const orig = copyAllBtn.textContent;
      copyAllBtn.textContent = '✓ Copied!';
      setTimeout(() => { copyAllBtn.textContent = orig; }, 1800);
      toast(`Copied ${targets.length} targets to clipboard for Agent!`);
    }).catch(() => { toast('Failed to copy to clipboard.'); });
  };
}
$('#pin').onchange = e => { S.pin = e.target.checked; save(); apply(); };
$('#exp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ fav: S.fav, hide: S.hide, seen: S.seen })], { type: 'application/json' })); a.download = 'bugbounty-programs-data.json'; a.click(); };
$('#imp').onchange = async e => { try { const j = JSON.parse(await e.target.files[0].text()); ['fav', 'hide', 'seen'].forEach(k => Object.assign(S[k], j[k] || {})); save(); apply(); toast('Imported.'); } catch { toast('That file could not be read.'); } };
$('#clr').onclick = () => { F = {}; saveF(); apply(); toast('Framing checks cleared.'); };
const rstBtn = $('#rst-seen');
// Auto-hiding header (Headroom pattern)
(() => {
  const topEl = $('.top');
  if (!topEl) return;
  let lastY = window.scrollY, isHidden = false;
  const THRESHOLD = 8, MIN_SCROLL = 50;

  function onScroll() {
    const y = Math.max(0, window.scrollY);
    if (y <= 15) {
      if (isHidden) { topEl.classList.remove('nav-hidden'); isHidden = false; }
      topEl.classList.remove('nav-scrolled');
      lastY = y;
      return;
    }
    topEl.classList.add('nav-scrolled');
    if (document.activeElement && topEl.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
      lastY = y;
      return;
    }
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (y >= maxScroll - 5) return;

    const diff = y - lastY;
    if (diff > THRESHOLD && y > MIN_SCROLL) {
      if (!isHidden) {
        topEl.classList.add('nav-hidden');
        isHidden = true;
        const m = topEl.querySelector('.menu[open]');
        if (m) m.removeAttribute('open');
      }
      lastY = y;
    } else if (diff < -THRESHOLD) {
      if (isHidden) {
        topEl.classList.remove('nav-hidden');
        isHidden = false;
      }
      lastY = y;
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
})();

sentinel.observe($('#more'));
boot();
})();
