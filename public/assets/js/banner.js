// Welcome-баннеры для рекламного трафика (ТЗ, этап 2.4).
// Несколько баннеров с разными utm-правилами: показывается первый подходящий.
//
// Правила баннера:
//  - заданные utm-группы (source, medium, campaign, content) проверяются по «И»:
//    подходят, только если совпали все непустые группы;
//  - click id (yclid/gclid/…) — отдельный сильный сигнал: достаточно любого;
//  - баннер с matchAll или без правил ловит любой рекламный трафик.
// Органический трафик (без рекламных меток) баннер не видит.

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const CLICK_IDS = ['click_id', 'yclid', 'gclid', 'fbclid', 'vk_click_id', 'ttclid'];

export function adMarkersPresent(search = window.location.search) {
  const p = new URLSearchParams(search);
  return UTM_KEYS.some((k) => p.get(k)) || CLICK_IDS.some((k) => p.get(k));
}

export function hasRules(item) {
  const r = (item && item.rules) || {};
  return Boolean(
    (r.utmSource || []).length ||
      (r.utmMedium || []).length ||
      (r.utmCampaign || []).length ||
      (r.utmContent || []).length ||
      (r.clickIds || []).length,
  );
}

// Совпадение группы. null — группа не задана ИЛИ её параметра нет в ссылке
// (тогда группа не применяется и не мешает совпадению).
function groupMatch(values, actual) {
  const list = (values || []).map((v) => String(v).toLowerCase()).filter(Boolean);
  if (!list.length) return null;
  const a = String(actual || '').toLowerCase();
  if (!a) return null;
  return list.some((v) => a === v || a.includes(v));
}

export function bannerMatches(item, search = window.location.search) {
  if (!item) return false;
  const p = new URLSearchParams(search);
  const rules = item.rules || {};
  const clickIds = (rules.clickIds || []).filter(Boolean);

  if (clickIds.some((k) => p.get(k))) return true;

  // Применяются только те группы, чей параметр присутствует в ссылке;
  // они все должны совпасть. Отсутствующие в ссылке группы игнорируются.
  const groups = [
    groupMatch(rules.utmSource, p.get('utm_source')),
    groupMatch(rules.utmMedium, p.get('utm_medium')),
    groupMatch(rules.utmCampaign, p.get('utm_campaign')),
    groupMatch(rules.utmContent, p.get('utm_content')),
  ].filter((g) => g !== null);

  if (groups.length > 0) return groups.every((g) => g === true);

  // Ни одна группа не применима: баннер без правил / matchAll ловит любой рекламный трафик.
  const emptyRules = !hasRules(item);
  return Boolean((item.matchAll || emptyRules) && adMarkersPresent(search));
}

export function selectBanner(items = [], search = window.location.search) {
  const list = (items || []).filter((i) => i && i.enabled !== false);
  const forced = new URLSearchParams(search).get('pm_banner');
  if (forced) {
    if (forced !== '1') {
      const byId = list.find((i) => i.id === forced);
      if (byId) return byId;
    }
    return list[0] || null;
  }
  return list.find((i) => bannerMatches(i, search)) || null;
}

function shownIds() {
  try {
    return JSON.parse(sessionStorage.getItem('pm.banner.shown') || '[]');
  } catch {
    return [];
  }
}

function markShown(id) {
  try {
    const arr = shownIds();
    if (!arr.includes(id)) {
      arr.push(id);
      sessionStorage.setItem('pm.banner.shown', JSON.stringify(arr));
    }
  } catch {
    /* storage unavailable */
  }
}

function findBySelector(id) {
  const safe = window.CSS && CSS.escape ? CSS.escape(id) : String(id).replace(/["\\]/g, '\\$&');
  return document.querySelector(`.splash[data-banner-id="${safe}"]`);
}

export function initBanners(config) {
  if (!config || config.enabled === false) return;
  const search = window.location.search;
  const forced = new URLSearchParams(search).get('pm_banner');
  const chosen = selectBanner(config.items, search);
  if (!chosen) return;

  const id = chosen.id || 'banner';
  if (!forced && shownIds().includes(id)) return;

  const splash = findBySelector(id);
  if (!splash) return;

  splash.hidden = false;
  splash.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');

  let closed = false;
  const hide = () => {
    if (closed) return;
    closed = true;
    splash.classList.add('hide');
    document.body.classList.remove('no-scroll');
    if (!forced) markShown(id);
    setTimeout(() => splash.remove(), 600);
  };

  const delay = Math.max(2000, Number(chosen.delayMs) || Number(config.delayMs) || 3000);
  const timer = setTimeout(hide, delay);

  splash.querySelector('[data-banner-go]')?.addEventListener('click', () => {
    clearTimeout(timer);
    hide();
  });
  splash.querySelector('[data-banner-skip]')?.addEventListener('click', () => {
    clearTimeout(timer);
    hide();
  });
  splash.addEventListener('click', (e) => {
    if (e.target === splash) {
      clearTimeout(timer);
      hide();
    }
  });
}

// Обратная совместимость с одиночным баннером.
export function initBanner(banner) {
  if (!banner) return;
  const config = banner.items ? banner : { enabled: banner.enabled, delayMs: banner.delayMs, items: [banner] };
  initBanners(config);
}
