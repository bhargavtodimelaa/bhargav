async function fetchChannels() {
  setLoading(true);
  try {
    const r = await fetch(API + '/channels', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      cache: 'no-cache'
    });
    const d = await r.json();
    all = (Array.isArray(d) ? d : d.channels || []).filter(c => c && c.name);
    map.clear();
    for (const ch of all) map.set(key(ch), ch);
    buildCats();
    apply();
  } catch (_) {
    grid.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24"><path d="M24 8.98A16.88 16.88 0 0 0 12 4C7.31 4 3.07 5.9 0 8.98L12 21 24 8.98zM2.92 9.07C5.51 7.08 8.67 6 12 6s6.49 1.08 9.08 3.07L12 18.17l-9.08-9.1z"/></svg>Could not load channels.</div>';
    counter.textContent = '0 channels';
  } finally {
    setLoading(false);
  }
}

async function fetchCookie() {
  try {
    const r = await fetch(API + '/cookies', { cache: 'no-cache' });
    const d = await r.json();
    const f = Array.isArray(d) ? d.find(x => x && x.cookie) : null;
    return f ? f.cookie : null;
  } catch (_) {
    return null;
  }
}

function buildCats() {
  const s = new Set(['All']);
  for (const c of all) if (c.category && c.category.trim()) s.add(c.category.trim());
  const sorted = ['All', ...[...s].filter(x => x !== 'All').sort()];
  cats.innerHTML = sorted.map(c => '<button class="cat' + (c === 'All' ? ' active' : '') + '" data-c="' + esc(c) + '">' + esc(c) + '</button>').join('');
}

cats.addEventListener('click', e => {
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
  filtered = all.filter(ch => (category === 'All' || ch.category === category) && (!t || ch.name.toLowerCase().includes(t)));
  render();
  counter.textContent = filtered.length + ' / ' + all.length + ' channels';
}

function render() {
  if (!filtered.length) {
    grid.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>No channels found</div>';
    return;
  }
  let h = '';
  for (const ch of filtered) {
    const k = key(ch);
    map.set(k, ch);
    const logo = esc(ch.logo || av(ch.name, 80));
    h += '<div class="c" data-k="' + esc(k) + '">';
    h += '<div class="channel-logo"><img src="' + logo + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + esc(av(ch.name, 80)) + '\'"><div class="play-ico"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>';
    h += '<div class="channel-name">' + esc(ch.name) + '</div>';
    h += '<span class="channel-cat">' + esc(ch.category || 'General') + '</span>';
    h += '</div>';
  }
  grid.innerHTML = h;
}

grid.addEventListener('click', e => {
  const c = e.target.closest('.c');
  if (!c || closing || playing) return;
  const ch = map.get(c.dataset.k);
  if (ch) playCh(ch);
});

let searchTimer;
search.addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    term = e.target.value;
    apply();
  }, 150);
});
