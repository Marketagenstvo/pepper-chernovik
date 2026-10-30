// Тонкая обёртка над fetch с JSON и keepalive для уходов со страницы.

export async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}

export async function postJson(url, body, { keepalive = false, csrf } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (csrf) headers['x-csrf-token'] = csrf;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    keepalive,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

export function putJson(url, body, { csrf } = {}) {
  return fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf || '' },
    body: JSON.stringify(body),
  }).then(async (res) => ({ ok: res.ok, status: res.status, data: await res.json().catch(() => null) }));
}

export function sendEvent(event, keepalive = false) {
  const payload = JSON.stringify(event);
  if (keepalive && navigator.sendBeacon) {
    navigator.sendBeacon('/api/events', new Blob([payload], { type: 'application/json' }));
    return;
  }
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive,
  }).catch(() => {});
}
