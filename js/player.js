function showUI() {
  if (player.classList.contains('active')) player.classList.remove('hide-ui');
}

const SHAKA_JS = 'https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.7.11/shaka-player.ui.min.js';
const SHAKA_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.7.11/controls.min.css';
let shakaReadyPromise = null;

function loadShakaOnce() {
  if (shakaReadyPromise) return shakaReadyPromise;
  shakaReadyPromise = new Promise((resolve, reject) => {
    if (window.shaka && shaka.Player) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = SHAKA_CSS;
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = SHAKA_JS;
    script.defer = true;
    script.onload = () => {
      const start = Date.now();
      const poll = () => {
        if (window.shaka && shaka.Player) {
          resolve();
        } else if (Date.now() - start > 20000) {
          reject(new Error('Shaka Player failed to load'));
        } else {
          setTimeout(poll, 50);
        }
      };
      poll();
    };
    script.onerror = () => reject(new Error('Shaka Player script failed to load'));
    document.head.appendChild(script);
  });
  return shakaReadyPromise;
}

function schedHide() {
  if (!player.classList.contains('active')) return;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (player.classList.contains('active')) player.classList.add('hide-ui');
  }, HIDE_DELAY);
}

function reset() {
  showUI();
  schedHide();
}

player.addEventListener('mousemove', reset, { passive: true });
player.addEventListener('touchstart', reset, { passive: true });
player.addEventListener('click', reset);
video.addEventListener('play', reset);
video.addEventListener('pause', reset);

function goFs() {
  try {
    const e = document.documentElement;
    if (e.requestFullscreen) return e.requestFullscreen();
    if (e.webkitRequestFullscreen) return e.webkitRequestFullscreen();
  } catch (_) {}
}

function exitFs() {
  try {
    if (document.fullscreenElement) return document.exitFullscreen();
    if (document.webkitFullscreenElement) return document.webkitExitFullscreen();
  } catch (_) {}
}

function seekBy(seconds) {
  try {
    if (!video) return;
    const buffered = video.buffered;
    if (buffered.length) {
      const live = buffered.end(buffered.length - 1);
      let target = Math.max(0, Math.min(live, video.currentTime + seconds));
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

async function playCh(ch) {
  if (!ch || closing || playing) return;
  playing = true;
  try {
    const n = ch.name || 'Channel';
    pname.textContent = n;
    plogo.src = ch.logo || av(n, 40);
    saveLast(ch);
    destroy();
    player.classList.add('active');
    player.classList.remove('hide-ui');
    goFs();
    reset();

    await loadShakaOnce();
    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) {
      playing = false;
      alert('Your browser is not supported by Shaka Player.');
      return;
    }

    playerObj = new shaka.Player(video);
    try {
      overlay = new shaka.ui.Overlay(playerObj, pc, video);
    } catch (_) {
      overlay = null;
    }

    const cfg = {
      preferredAudioLanguage: 'te',
      streaming: { lowLatencyMode: true, rebufferingGoal: 2, bufferBehind: 30 }
    };
    if (ch.keyId && ch.keyId !== 'null' && ch.key && ch.key !== 'null') {
      cfg.drm = { clearKeys: { [ch.keyId]: ch.key } };
    }
    playerObj.configure(cfg);

    const cookie = await fetchCookie() || '';
    const eng = playerObj.getNetworkingEngine();
    if (eng) {
      eng.registerRequestFilter((type, req) => {
        req.headers.Referer = 'https://www.jiotv.com/';
        req.headers['User-Agent'] = 'plaYtv/7.1.5';
        if (cookie && (type === 0 || type === 1)) {
          req.uris[0] = req.uris[0].split('?')[0] + '?' + cookie;
        }
      });
    }

    const urls = [ch.url, ch.url1, ch.url2, ch.url3].filter(Boolean).map(url);
    let ok = false;
    for (const u of urls) {
      try {
        await playerObj.load(u);
        ok = true;
        break;
      } catch (_) {}
    }
    if (!ok) throw new Error('no stream');

    setTimeout(() => {
      try {
        const ts = playerObj.getAudioTracks();
        if (ts && ts.length) {
          const tel = ts.find(t => t.language === 'te') || ts.find(t => ['hi', 'ta', 'ml', 'kn', 'mr', 'bn'].includes(t.language));
          if (tel) playerObj.selectAudioTrack(tel);
        }
      } catch (_) {}
    }, 500);

    try {
      await video.play();
    } catch (_) {}
  } catch (_) {
    alert('This channel is currently unavailable.');
    closePlayer();
  } finally {
    playing = false;
    reset();
  }
}

function closePlayer() {
  if (closing) return;
  closing = true;
  playing = false;
  destroy();
  try {
    video.pause();
    video.removeAttribute('src');
    video.load();
  } catch (_) {}
  player.classList.remove('active');
  player.classList.remove('hide-ui');
  clearTimeout(hideTimer);
  hideTimer = null;
  exitFs();
  setTimeout(() => { closing = false; }, 200);
}

function destroy() {
  if (overlay) {
    try { overlay.destroy(); } catch (_) {}
    overlay = null;
  }
  if (playerObj) {
    try { playerObj.destroy(); } catch (_) {}
    playerObj = null;
  }
}

closeBtn.onclick = closePlayer;
backBtn.onclick = closePlayer;
pc.addEventListener('click', e => {
  if (e.target === pc) closePlayer();
});

document.addEventListener('keydown', e => {
  const active = player.classList.contains('active');

  if (e.key === 'Escape' && active) {
    e.preventDefault();
    closePlayer();
    return;
  }

  if (!active) return;

  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (video.paused) video.play().catch(() => {}); else video.pause();
    reset();
    return;
  }

  if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
    e.preventDefault();
    seekBy(SEEK_STEP);
    reset();
    return;
  }

  if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
    e.preventDefault();
    seekBy(-SEEK_STEP);
    reset();
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    video.volume = Math.min(1, video.volume + 0.1);
    video.muted = false;
    reset();
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    video.volume = Math.max(0, video.volume - 0.1);
    reset();
    return;
  }

  if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    video.muted = !video.muted;
    reset();
    return;
  }

  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    if (document.fullscreenElement) exitFs(); else goFs();
    reset();
    return;
  }
});
