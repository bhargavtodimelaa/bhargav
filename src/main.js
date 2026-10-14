import 'shaka-player/dist/controls.css';
import './style.css';
import { API, STORAGE, THEME_KEY, FAV_KEY, HIDE_DELAY, SEEK_STEP, COOKIE_TTL, AUDIO_PREF } from './config.js';
import { esc, key, fixUrl, avatar } from './utils.js';

/* ================================================================
 *  dom refs
 * ================================================================ */
const $ = (id) => document.getElementById(id);
const grid = $('grid'), search = $('search'), cats = $('cats'), counter = $('counter');
const player = $('player'), pc = $('pc'), video = $('video'), pname = $('pname'), plogo = $('plogo');
const lastSection = $('lastSection'), lastGrid = $('lastGrid');
const offlineBar = $('offlineBar'), themeBtn = $('themeToggle'), pload = $('pload'), toastEl = $('toast');
const randomBtn = $('randomBtn'), installBtn = $('installBtn'), toTop = $('toTop'), helpEl = $('help');

/* ================================================================
 *  state
 * ================================================================ */
let all = [], filtered = [], category = 'All', term = '', last = [];
const map = new Map();
let playerObj = null, overlay = null, playing = false, closing = false, hideTimer = null;
let shakaLib = null;            // lazily imported player chunk
let cookieCache = { v: null, t: 0 };
let popStateBusy = false;       // guards history juggling while closing

/* ---- favourites (persisted) ---- */
function loadFavs() {
  try {
    const d = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    return Array.isArray(d) ? d : [];
  } catch (_) { return []; }
}
const favs = new Set(loadFavs());
function saveFavs() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch (_) {}
}

/* ================================================================
 *  theme
 * ================================================================ */
const metaTheme = document.querySelector('meta[name="theme-color"]');
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch (_) {}
  if (metaTheme) metaTheme.content = t === 'light' ? '#f3f5fb' : '#0b0e14';
}
let savedTheme = null;
try { savedTheme = localStorage.getItem(THEME_KEY); } catch (_) {}
applyTheme(savedTheme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
themeBtn.addEventListener('click', () =>
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));

/* ================================================================
 *  toast + global error handling — never silent
 * ================================================================ */
let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}
function reportError(err) {
  const text = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  console.error('[LiveTV]', err);
  toast(text ? `Error: ${text.slice(0, 140)}` : 'Something went wrong — please try again.');
}
window.addEventListener('error', (e) => reportError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => reportError(e.reason));

/* ================================================================
 *  devtools protection: warn → (open >1s) → redirect, abuse → terminate
 * ================================================================ */
const DT_MSG = 'Access to developer utilities is impermissible on this platform, by virtue of stringent security protocols.';
const DT_REDIRECT = 'Insidious instrumentation detected — this session is being terminated forthwith, and you are being redirected.';
const DT_ABUSE = 'Wilful evasion or impermissible usage ascertained — this session concludes with immediate effect.';

let dtNuked = false;      // terminal state — nothing further runs
let dtSince = 0;          // timestamp of first consecutive detection
let probeStreak = 0;

/** Show a caution, then obliterate the session: wipe → window.close → google.com */
function terminate(reason) {
  if (dtNuked) return;
  dtNuked = true;
  toast(reason || DT_ABUSE);
  setTimeout(() => {
    try { window.open('', '_self'); window.close(); } catch (_) {}
    setTimeout(() => {
      try { location.replace('https://www.google.com'); } catch (_) {}
    }, 120);
  }, 700);
}

function flagDevtools() {
  const now = performance.now();
  if (!dtSince) { dtSince = now; toast(DT_REDIRECT); }
  else if (now - dtSince >= 1000) { terminate(DT_REDIRECT); }
}

/* `debugger` stalls only while devtools are open — a reliable timing oracle */
function timingProbe() {
  const t0 = performance.now();
  /* eslint-disable-next-line no-debugger */
  debugger;
  return performance.now() - t0 > 80;
}
/* console renders the Image object → fires the id getter only in devtools */
function consoleProbe() {
  let hit = false;
  const el = new Image();
  Object.defineProperty(el, 'id', { get() { hit = true; return 'x'; } });
  console.log('%c', el);
  return hit;
}
setInterval(() => {
  if (dtNuked) return;
  let opened = false;
  try { opened = timingProbe() || consoleProbe(); } catch (_) {}
  if (opened) { probeStreak++; flagDevtools(); }
  else { probeStreak = 0; dtSince = 0; }
}, 250);

/* manual attempts (keys / context menu) — spam counted as forced usage */
let manualHits = 0, manualTimer = null;
function manualHit() {
  if (dtNuked) return;
  toast(DT_MSG);
  manualHits++;
  clearTimeout(manualTimer);
  manualTimer = setTimeout(() => { manualHits = 0; }, 10000);
  if (manualHits > 8) terminate();
}

/* ================================================================
 *  recently played
 * ================================================================ */
function loadLast() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE) || '[]');
    if (Array.isArray(d)) last = d.filter((c) => c && c.name);
  } catch (_) { last = []; }
}
function saveLast(ch) {
  if (!ch || !ch.name) return;
  const k = key(ch);
  last = last.filter((c) => key(c) !== k);
  last.unshift(ch);
  last.length = Math.min(last.length, 10);
  try { localStorage.setItem(STORAGE, JSON.stringify(last)); } catch (_) {}
  renderLast();
}
function renderLast() {
  if (!last.length) { lastSection.classList.remove('visible'); return; }
  lastSection.classList.add('visible');
  let h = '';
  for (const ch of last) {
    const k = key(ch);
    map.set(k, ch);
    const av = avatar(ch.name, 50);
    const logo = ch.logo || av;
    h += `<div class="lc" data-k="${esc(k)}"><div class="ll"><img src="${esc(logo)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${esc(av)}'"></div><div class="ln">${esc(ch.name)}</div><div class="lb">▶ Play</div></div>`;
  }
  lastGrid.innerHTML = h;
}
lastGrid.addEventListener('click', (e) => {
  const c = e.target.closest('.lc');
  if (!c || closing || playing) return;
  const ch = map.get(c.dataset.k);
  if (ch) playCh(ch);
});

/* ================================================================
 *  channels: fetch + filters + render
 * ================================================================ */
async function fetchChannels() {
  try {
    grid.innerHTML = Array(10).fill('<div class="skel"></div>').join('');
    const r = await fetch(API + '/channels', { headers: { 'X-Requested-With': 'XMLHttpRequest' }, cache: 'no-cache' });
    const d = await r.json();
    all = (Array.isArray(d) ? d : d.channels || []).filter((c) => c && c.name);
    map.clear();
    for (const ch of all) map.set(key(ch), ch);
    buildCats();
    apply();
  } catch (_) {
    reportError('Failed to load the channel list from the network.');
    grid.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24"><path d="M24 8.98A16.88 16.88 0 0 0 12 4C7.31 4 3.07 5.9 0 8.98L12 21 24 8.98zM2.92 9.07C5.51 7.08 8.67 6 12 6s6.49 1.08 9.08 3.07L12 18.17l-9.08-9.1z"/></svg>Could not load channels.</div>';
    counter.textContent = '0 channels';
  }
}

/** Cached so repeated plays don't re-hit the API */
async function fetchCookie() {
  if (cookieCache.v && Date.now() - cookieCache.t < COOKIE_TTL) return cookieCache.v;
  try {
    const r = await fetch(API + '/cookies', { cache: 'no-cache' });
    const d = await r.json();
    const f = Array.isArray(d) ? d.find((x) => x && x.cookie) : null;
    cookieCache = { v: f ? f.cookie : '', t: Date.now() };
    return cookieCache.v;
  } catch (_) {
    return '';
  }
}

function buildCats() {
  const s = new Set(['All']);
  for (const c of all) if (c.category && c.category.trim()) s.add(c.category.trim());
  const sorted = ['All', '__fav', ...[...s].filter((x) => x !== 'All').sort()];
  cats.innerHTML = sorted.map((c) =>
    `<button class="cat${c === 'All' ? ' active' : ''}" data-c="${esc(c)}">${esc(c === '__fav' ? '★ Favourites' : c)}</button>`
  ).join('');
}
cats.addEventListener('click', (e) => {
  const b = e.target.closest('.cat');
  if (!b) return;
  const prev = cats.querySelector('.cat.active');
  if (prev) prev.classList.remove('active');
  b.classList.add('active');
  category = b.dataset.c;
  apply();
});

function apply() {
  const t = term.toLowerCase().trim();
  filtered = all.filter((ch) => {
    if (t && !ch.name.toLowerCase().includes(t)) return false;
    if (category === 'All') return true;
    if (category === '__fav') return favs.has(key(ch));
    return ch.category === category;
  });
  counter.textContent = filtered.length + ' / ' + all.length + ' channels';
  // skip the DOM rebuild when the filter signature hasn't changed (cheap typing)
  const sig = category + '|' + t + '|' + all.length + '|' + favs.size;
  if (sig !== renderSig) { renderSig = sig; render(); }
}
let renderSig = '';

function render() {
  if (!filtered.length) {
    const msg = category === '__fav' ? 'No favourite channels yet — tap ★ on any card' : 'No channels found';
    grid.innerHTML = `<div class="empty"><svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>${esc(msg)}</div>`;
    return;
  }
  let h = '';
  let idx = 0;
  for (const ch of filtered) {
    const k = key(ch);
    map.set(k, ch);
    const delay = Math.min(idx, 40);
    idx++;
    const av = avatar(ch.name, 80);
    const logo = ch.logo || av;
    const fav = favs.has(k);
    h += `<div class="c" data-k="${esc(k)}" style="--i:${delay}" tabindex="0" role="button" aria-label="${esc(ch.name)}"><button class="fav${fav ? ' on' : ''}" data-fav="${esc(k)}" aria-label="Toggle favourite"><svg viewBox="0 0 24 24"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></button><div class="logo"><img src="${esc(logo)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${esc(av)}'"></div><div class="name">${esc(ch.name)}</div><span class="cat">${esc(ch.category || 'General')}</span></div>`;
  }
  grid.innerHTML = h;
}
grid.addEventListener('click', (e) => {
  const fb = e.target.closest('.fav');
  if (fb) { toggleFav(fb.dataset.fav, fb); return; }
  const c = e.target.closest('.c');
  if (!c || closing || playing) return;
  const ch = map.get(c.dataset.k);
  if (ch) playCh(ch);
});
function toggleFav(k, btn) {
  if (favs.has(k)) favs.delete(k); else favs.add(k);
  saveFavs();
  if (btn) btn.classList.toggle('on', favs.has(k));
  if (category === '__fav') { renderSig = ''; apply(); }
  else if (renderSig) { renderSig = renderSig.replace(/(\|[0-9]+)$/, '|' + favs.size); }
}
grid.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const c = e.target.closest('.c');
  if (!c || closing || playing) return;
  const ch = map.get(c.dataset.k);
  if (ch) playCh(ch);
});

let searchTimer;
search.addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { term = e.target.value; apply(); }, 150);
});

/* ---- random channel ---- */
randomBtn.addEventListener('click', () => {
  if (!filtered.length) { toast('Nothing to roll on — refine your filters first.'); return; }
  const ch = filtered[Math.floor(Math.random() * filtered.length)];
  if (ch) playCh(ch);
});

/* ---- PWA install ---- */
let installEv = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEv = e;
  installBtn.classList.remove('hidden');
});
installBtn.addEventListener('click', () => {
  if (!installEv) return;
  installEv.prompt();
  installEv = null;
  installBtn.classList.add('hidden');
});

/* ---- back to top ---- */
let topShown = false;
window.addEventListener('scroll', () => {
  const s = window.scrollY > 600;
  if (s !== topShown) { topShown = s; toTop.classList.toggle('show', s); }
}, { passive: true });
toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

/* ---- shortcut help overlay ---- */
function toggleHelp(force) {
  const show = force !== undefined ? force : !helpEl.classList.contains('show');
  helpEl.classList.toggle('show', show);
}
helpEl.addEventListener('click', (e) => { if (e.target === helpEl) toggleHelp(false); });

/* ================================================================
 *  player: UI chrome
 * ================================================================ */
function showUI() { if (player.classList.contains('active')) player.classList.remove('hide-ui'); }
function schedHide() {
  if (!player.classList.contains('active')) return;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (player.classList.contains('active')) player.classList.add('hide-ui');
  }, HIDE_DELAY);
}
function resetUI() { showUI(); schedHide(); }
player.addEventListener('mousemove', resetUI, { passive: true });
player.addEventListener('touchstart', resetUI, { passive: true });
player.addEventListener('click', resetUI);
video.addEventListener('play', resetUI);
video.addEventListener('pause', resetUI);

async function goFs() {
  try {
    const e = document.documentElement;
    if (e.requestFullscreen) await e.requestFullscreen();
    else if (e.webkitRequestFullscreen) await e.webkitRequestFullscreen();
  } catch (_) {}
}
function exitFs() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
  } catch (_) {}
}

/* ================================================================
 *  player: media engine (shaka)
 * ================================================================ */
async function ensureShaka() {
  if (!shakaLib) {
    // code-split: the player bundle is only downloaded on first playback
    const mod = await import('shaka-player/dist/shaka-player.ui.js');
    shakaLib = mod.default || mod;
  }
  shakaLib.polyfill.installAll();
  if (!shakaLib.Player.isBrowserSupported()) throw new Error('unsupported');
  return shakaLib;
}

function seekBy(seconds) {
  try {
    const buffered = video.buffered;
    if (buffered.length) {
      const live = buffered.end(buffered.length - 1);
      const target = Math.max(0, Math.min(live, video.currentTime + seconds));
      if (video.seekable && video.seekable.length) {
        const start = video.seekable.start(0);
        const end = video.seekable.end(video.seekable.length - 1);
        video.currentTime = Math.max(start, Math.min(end, target));
      } else {
        video.currentTime = target;
      }
    } else {
      video.currentTime = Math.max(0, video.currentTime + seconds);
    }
  } catch (_) {}
}

function applyNetworkProfile(cookie) {
  const eng = playerObj.getNetworkingEngine();
  if (!eng) return;
  eng.registerRequestFilter((type, req) => {
    req.headers.Referer = 'https://www.jiotv.com/';
    req.headers['User-Agent'] = 'plaYtv/7.1.5';
    if (cookie && (type === 0 || type === 1)) req.uris[0] = req.uris[0].split('?')[0] + '?' + cookie;
  });
}

function pickAudioTrack() {
  try {
    const ts = playerObj.getAudioTracks();
    if (!ts || !ts.length) return;
    const tel = ts.find((t) => t.language === 'te') || ts.find((t) => AUDIO_PREF.includes(t.language));
    if (tel) playerObj.selectAudioTrack(tel);
  } catch (_) {}
}

async function playCh(ch) {
  if (!ch || closing || playing) return;
  playing = true;
  try {
    const n = ch.name || 'Channel';
    pname.textContent = n;
    plogo.src = ch.logo || avatar(n, 40);
    saveLast(ch);
    destroyMedia();
    player.classList.add('active');
    document.body.classList.add('lock');
    if (!history.state || !history.state.tv) history.pushState({ tv: 1 }, '');
    pload.classList.add('show');
    goFs();
    resetUI();

    const shaka = await ensureShaka();
    // native <video> controls OFF — shaka's overlay is the only UI
    video.controls = false;
    playerObj = new shaka.Player(video);

    try { overlay = new shaka.ui.Overlay(playerObj, pc, video); }
    catch (_) { overlay = null; video.controls = true; } // graceful fallback

    const cfg = {
      preferredAudioLanguage: 'te',
      streaming: { lowLatencyMode: true, rebufferingGoal: 2, bufferBehind: 30 },
    };
    if (ch.keyId && ch.keyId !== 'null' && ch.key && ch.key !== 'null') {
      cfg.drm = { clearKeys: { [ch.keyId]: ch.key } };
    }
    playerObj.configure(cfg);

    applyNetworkProfile((await fetchCookie()) || '');

    const urls = [ch.url, ch.url1, ch.url2, ch.url3].filter(Boolean).map(fixUrl);
    let ok = false;
    for (const u of urls) {
      try { await playerObj.load(u); ok = true; break; } catch (_) { /* try next */ }
    }
    if (!ok) throw new Error('no stream');

    setTimeout(pickAudioTrack, 500);

    try { await video.play(); }
    catch (_) {
      // autoplay blocked → retry muted, tell the user once
      try { video.muted = true; await video.play(); toast('Playing muted — tap 🔊 to unmute'); }
      catch (_2) { /* user interaction needed */ }
    }
  } catch (err) {
    toast(err && err.message === 'unsupported'
      ? 'Playback is not supported on this browser.'
      : 'Channel unavailable right now — try another.');
    closePlayer();
  } finally {
    playing = false;
    pload.classList.remove('show');
    resetUI();
  }
}

function closePlayer(fromPop = false) {
  if (closing) return;
  closing = true;
  playing = false;
  destroyMedia();
  try {
    video.pause();
    video.removeAttribute('src');
    video.load();
  } catch (_) {}
  player.classList.remove('active', 'hide-ui');
  document.body.classList.remove('lock');
  pload.classList.remove('show');
  clearTimeout(hideTimer);
  hideTimer = null;
  exitFs();
  // consume the history entry we pushed while opening
  if (!fromPop && history.state && history.state.tv) {
    popStateBusy = true;
    history.back();
    setTimeout(() => { popStateBusy = false; }, 100);
  }
  setTimeout(() => { closing = false; }, 200);
}
function destroyMedia() {
  if (overlay) { try { overlay.destroy(); } catch (_) {} overlay = null; }
  if (playerObj) { try { playerObj.destroy(); } catch (_) {} playerObj = null; }
}

/* hardware/browser back closes the player instead of leaving the site */
window.addEventListener('popstate', () => {
  if (player.classList.contains('active') && !popStateBusy) closePlayer(true);
});

$('close').onclick = closePlayer;
$('back').onclick = closePlayer;
pc.addEventListener('click', (e) => { if (e.target === pc) closePlayer(); });

/* ================================================================
 *  keyboard shortcuts
 * ================================================================ */
document.addEventListener('keydown', (e) => {
  const active = player.classList.contains('active');

  if (e.key === 'Escape') { if (helpEl.classList.contains('show')) { toggleHelp(false); return; } }
  if (e.key === '?' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
    e.preventDefault();
    toggleHelp();
    return;
  }

  if (e.key === 'Escape' && active) { e.preventDefault(); closePlayer(); return; }
  if (!active) return;

  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (video.paused) video.play().catch(() => {}); else video.pause();
    resetUI(); return;
  }
  if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') { e.preventDefault(); seekBy(SEEK_STEP); resetUI(); return; }
  if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') { e.preventDefault(); seekBy(-SEEK_STEP); resetUI(); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); video.volume = Math.min(1, video.volume + 0.1); video.muted = false; resetUI(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); resetUI(); return; }
  if (e.key === 'm' || e.key === 'M') { e.preventDefault(); video.muted = !video.muted; resetUI(); return; }
  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    if (document.fullscreenElement) exitFs(); else goFs();
    resetUI(); return;
  }
});

/* ================================================================
 *  offline handling
 * ================================================================ */
let offline = !navigator.onLine;
let probeTimer = null;

function setOfflineUI(o) {
  offline = o;
  offlineBar.hidden = !o;
  document.title = o ? 'You are offline — Live TV' : 'Live TV';
  if (!o) {
    clearInterval(probeTimer);
    probeTimer = null;
    if (!all.length && !grid.querySelector('.c')) fetchChannels();
  } else {
    probeTimer = setInterval(probeOnline, 15000);
  }
}
async function probeOnline() {
  try {
    const r = await fetch(API + '/cookies', { cache: 'no-store' });
    if (r.ok) setOfflineUI(false);
  } catch (_) { /* still offline */ }
}
window.addEventListener('online', () => setOfflineUI(false));
window.addEventListener('offline', () => setOfflineUI(true));
if (offline) setOfflineUI(true);

/* ================================================================
 *  service worker
 * ================================================================ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

/* ================================================================
 *  protections (manual triggers → escalating warning)
 * ================================================================ */
document.addEventListener('contextmenu', (e) => { e.preventDefault(); manualHit(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'F12' || e.keyCode === 123 ||
      (e.ctrlKey && e.shiftKey && 'IJC'.includes(e.key)) ||
      (e.ctrlKey && 'uUsS'.includes(e.key))) { e.preventDefault(); manualHit(); return false; }
});

/* ================================================================
 *  boot
 * ================================================================ */
loadLast();
renderLast();
document.body.classList.add('ready');
fetchChannels();
