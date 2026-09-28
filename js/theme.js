(function initTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  } catch (_) {
    document.documentElement.removeAttribute('data-theme');
  }
})();

function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (isLight) {
    document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem(THEME_KEY, 'dark'); } catch (_) {}
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    try { localStorage.setItem(THEME_KEY, 'light'); } catch (_) {}
  }
}

themeToggle.addEventListener('click', toggleTheme);
