/** Live TV app configuration */

const API = 'https://fragrant-butterfly-575f.bhargavtodimela4.workers.dev';
const STORAGE = 'liveTV_lastPlayed';
const THEME_KEY = 'liveTV_theme';
/** persisted favourite-channel ids */
const FAV_KEY = 'liveTV_favs';

/** UI auto-hide delay in the player (ms) */
const HIDE_DELAY = 4000;
/** Keyboard seek step (seconds) */
const SEEK_STEP = 10;
/** How long a fetched playback cookie stays fresh (ms) */
const COOKIE_TTL = 10 * 60 * 1000;
/** Preferred audio language chain */
const AUDIO_PREF = ['te', 'hi', 'ta', 'ml', 'kn', 'mr', 'bn'];

export { API, STORAGE, THEME_KEY, FAV_KEY, HIDE_DELAY, SEEK_STEP, COOKIE_TTL, AUDIO_PREF };
