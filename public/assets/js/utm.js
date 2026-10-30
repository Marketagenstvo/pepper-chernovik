// Сбор utm-меток и идентификатора клика. Значения фиксируются при первом
// заходе и не перезаписываются до конца визита (в т.ч. между вкладками).

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const CLICK_KEYS = ['click_id', 'yclid', 'gclid', 'fbclid', 'vk_click_id', 'ttclid'];
const STORE_KEY = 'pm.traffic';
const SESSION_KEY = 'pm.session';

function readStore(store) {
  try {
    const raw = store.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStore(store, value) {
  try {
    store.setItem(STORE_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function captureTraffic(search = window.location.search) {
  const params = new URLSearchParams(search);
  const urlUtm = {};
  let hasUrlUtm = false;
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) {
      urlUtm[key] = value.slice(0, 256);
      hasUrlUtm = true;
    }
  }
  let clickId = null;
  for (const key of CLICK_KEYS) {
    const value = params.get(key);
    if (value) {
      clickId = value.slice(0, 256);
      break;
    }
  }

  const existing = readStore(sessionStorage) || readStore(localStorage);
  if (existing && (existing.clickId || Object.keys(existing.utm || {}).length)) {
    return { ...existing, sessionId: getSessionId(), fromUrl: false };
  }

  const utm = {};
  for (const key of UTM_KEYS) utm[key] = urlUtm[key] || null;
  const traffic = { utm, clickId: clickId || null, ts: Date.now() };
  writeStore(sessionStorage, traffic);
  writeStore(localStorage, traffic);
  return { ...traffic, sessionId: getSessionId(), fromUrl: hasUrlUtm || Boolean(clickId) };
}

export function deviceType() {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
}
