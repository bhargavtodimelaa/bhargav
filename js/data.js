function loadLast() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE) || '[]');
    if (Array.isArray(d)) last = d.filter(c => c && c.name);
  } catch (_) {
    last = [];
  }
}

function saveLast(ch) {
  if (!ch || !ch.name) return;
  const k = key(ch);
  last = last.filter(c => key(c) !== k);
  last.unshift(ch);
  last.length = Math.min(last.length, 10);
  try { localStorage.setItem(STORAGE, JSON.stringify(last)); } catch (_) {}
  renderLast();
}

function renderLast() {
  if (!last.length) {
    lastSection.classList.remove('visible');
    return;
  }
  lastSection.classList.add('visible');
  let h = '';
  for (const ch of last) {
    const k = key(ch);
    map.set(k, ch);
    const logo = esc(ch.logo || av(ch.name, 50));
    h += '<div class="lc" data-k="' + esc(k) + '">';
    h += '<div class="channel-logo"><img src="' + logo + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + esc(av(ch.name, 50)) + '\'"><div class="play-ico"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>';
    h += '<div class="channel-name">' + esc(ch.name) + '</div>';
    h += '<span class="channel-cat">' + esc(ch.category || 'General') + '</span>';
    h += '</div>';
  }
  lastGrid.innerHTML = h;
}

lastGrid.addEventListener('click', e => {
  const c = e.target.closest('.lc');
  if (!c || closing || playing) return;
  const ch = map.get(c.dataset.k);
  if (ch) playCh(ch);
});
