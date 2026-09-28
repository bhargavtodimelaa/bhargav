const API = 'https://fragrant-butterfly-575f.bhargavtodimela4.workers.dev';
const STORAGE = 'liveTV_lastPlayed';
const THEME_KEY = 'liveTV_theme';
const HIDE_DELAY = 4000;
const SEEK_STEP = 10;
const AVATAR = 'https://ui-avatars.com/api/?name=';

const $ = id => document.getElementById(id);

const grid = $('grid');
const search = $('search');
const cats = $('cats');
const counter = $('counter');
const player = $('player');
const pc = $('pc');
const video = $('video');
const pname = $('pname');
const plogo = $('plogo');
const lastSection = $('lastSection');
const lastGrid = $('lastGrid');
const themeToggle = $('themeToggle');
const closeBtn = $('close');
const backBtn = $('back');
const loadingEl = $('loading');

function setLoading(on) {
  if (!loadingEl) return;
  loadingEl.classList.toggle('active', on);
}

let all = [], filtered = [], category = 'All', term = '', last = [];
const map = new Map();
let playerObj = null, overlay = null, playing = false, closing = false, hideTimer = null;
let appInitialized = false;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const av = (n, s) => AVATAR + encodeURIComponent(n) + '&background=e8eaed&color=202124&size=' + s;
const key = ch => ch.id != null ? String(ch.id) : 'n:' + ch.name;
const url = u => u.replace(/bpk-tv\/\//g, 'bpk-tv/');

document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {
  'use strict';
  if (e.key === 'F12' || e.keyCode === 123 || (e.ctrlKey && e.shiftKey && 'IJC'.includes(e.key)) || (e.ctrlKey && 'uUsS'.includes(e.key))) {
    e.preventDefault();
    return false;
  }
});
