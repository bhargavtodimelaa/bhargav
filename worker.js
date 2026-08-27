// Web Worker: offloads filtering, sorting, and data processing from main thread
// Keeps the main thread free for rendering and user interaction

let channels = [];
let recentPlayed = [];
const CACHE_KEY = 'ltv_lp';

// Handle messages from main thread
self.onmessage = function(e) {
  const { type, payload } = e.data;

  switch (type) {
    case 'SET_CHANNELS':
      channels = payload || [];
      self.postMessage({ type: 'CHANNELS_SET', count: channels.length });
      break;

    case 'FILTER':
      filterChannels(payload);
      break;

    case 'BUILD_CATEGORIES':
      buildCategories();
      break;

    case 'LOAD_RECENT':
      loadRecent();
      break;

    case 'SAVE_RECENT':
      saveRecent(payload);
      break;

    case 'SORT_BY_CATEGORY':
      sortByCategory(payload);
      break;

    case 'SEARCH_SUGGESTIONS':
      getSuggestions(payload);
      break;
  }
};

function filterChannels({ search, category }) {
  const t = (search || '').toLowerCase().trim();
  const filtered = [];

  for (let i = 0, len = channels.length; i < len; i++) {
    const ch = channels[i];
    if (!ch || !ch.name) continue;
    const nameMatch = ch.name.toLowerCase().indexOf(t) !== -1;
    const catMatch = category === 'All' || ch.category === category;
    if (nameMatch && catMatch) filtered.push(ch);
  }

  self.postMessage({ type: 'FILTERED', data: filtered });
}

function buildCategories() {
  const set = ['All'];
  const seen = { 'All': true };

  for (let i = 0, len = channels.length; i < len; i++) {
    const cat = channels[i] && channels[i].category;
    if (cat && cat.trim() && !seen[cat]) {
      seen[cat] = true;
      set.push(cat.trim());
    }
  }

  // Sort categories (skip 'All' at index 0)
  for (let i = 1; i < set.length; i++) {
    for (let j = i + 1; j < set.length; j++) {
      if (set[j] < set[i]) {
        const tmp = set[i]; set[i] = set[j]; set[j] = tmp;
      }
    }
  }

  self.postMessage({ type: 'CATEGORIES', data: set });
}

function loadRecent() {
  try {
    // Workers can't access localStorage, so we request from main thread
    self.postMessage({ type: 'REQUEST_RECENT' });
  } catch (_) {
    self.postMessage({ type: 'RECENT_LOADED', data: [] });
  }
}

function saveRecent(data) {
  recentPlayed = data || [];
  self.postMessage({ type: 'RECENT_SAVED', data: recentPlayed });
}

function sortByCategory(category) {
  if (category === 'All') {
    self.postMessage({ type: 'SORTED', data: channels.slice() });
    return;
  }

  const sorted = [];
  for (let i = 0, len = channels.length; i < len; i++) {
    if (channels[i] && channels[i].category === category) {
      sorted.push(channels[i]);
    }
  }

  self.postMessage({ type: 'SORTED', data: sorted });
}

function getSuggestions(query) {
  if (!query || query.length < 2) {
    self.postMessage({ type: 'SUGGESTIONS', data: [] });
    return;
  }

  const q = query.toLowerCase();
  const suggestions = [];
  const seen = {};

  for (let i = 0, len = channels.length; i < len && suggestions.length < 8; i++) {
    const ch = channels[i];
    if (ch && ch.name && ch.name.toLowerCase().indexOf(q) !== -1 && !seen[ch.name]) {
      seen[ch.name] = true;
      suggestions.push({ name: ch.name, category: ch.category });
    }
  }

  self.postMessage({ type: 'SUGGESTIONS', data: suggestions });
}