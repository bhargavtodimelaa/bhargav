/* Shared pure helpers — no DOM access, fast and testable */

/** Escape a string for safe interpolation into HTML */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/** Stable identity key for a channel (prefer its id, fall back to name) */
const key = (ch) => (ch.id != null ? String(ch.id) : 'n:' + ch.name);

/** Normalize odd stream URL schemes */
const fixUrl = (u) => u.replace(/bpk-tv\/\//g, 'bpk-tv/');

/* --- offline-friendly SVG avatars (zero network requests) --- */
const avatarCache = new Map();
const AV_COLORS = ['1a73e8', '188038', 'd93025', 'f9ab00', 'a142f4', '24c1e0', 'e37400'];

function avatar(name, size) {
  const ck = name + '|' + size;
  let v = avatarCache.get(ck);
  if (v) return v;
  const initials = (name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0x7fffffff;
  const bg = AV_COLORS[h % AV_COLORS.length];
  v = 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<rect width="100%" height="100%" fill="#${bg}"/>` +
    `<text x="50%" y="50%" dy=".06em" text-anchor="middle" dominant-baseline="middle" ` +
    `font-family="Arial,sans-serif" font-size="${Math.round(size / 2.8)}" font-weight="600" fill="#fff">${esc(initials)}</text></svg>`
  );
  avatarCache.set(ck, v);
  return v;
}

export { esc, key, fixUrl, avatar };
