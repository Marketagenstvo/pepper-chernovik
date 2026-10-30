import { sendEvent } from './api.js';

let traffic = null;
let pageName = null;

export function initTracking(ctx) {
  traffic = ctx.traffic;
  pageName = ctx.page;
  sendEvent(base('session_start'));

  trackScrollDepth();
  window.addEventListener('pagehide', () => {
    sendEvent(base('session_end'), true);
  });
}

export function track(type, payload) {
  sendEvent(base(type, payload));
}

function base(type, payload) {
  return {
    type,
    sessionId: traffic?.sessionId,
    clickId: traffic?.clickId,
    page: pageName,
    utm: traffic?.utm,
    device: device(),
    payload,
  };
}

function device() {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
}

function trackScrollDepth() {
  const marks = [25, 50, 75, 100];
  const fired = new Set();
  const onScroll = () => {
    const doc = document.documentElement;
    const total = doc.scrollHeight - doc.clientHeight;
    const depth = total <= 0 ? 100 : Math.round((doc.scrollTop / total) * 100);
    for (const mark of marks) {
      if (depth >= mark && !fired.has(mark)) {
        fired.add(mark);
        track('scroll', { depth: mark });
      }
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
}
