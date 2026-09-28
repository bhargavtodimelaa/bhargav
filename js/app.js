function initApp() {
  if (appInitialized) return;
  appInitialized = true;
  loadLast();
  renderLast();
  fetchChannels();
}

document.addEventListener('DOMContentLoaded', initApp);
