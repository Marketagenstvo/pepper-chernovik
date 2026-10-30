// Оркестратор страницы: баннер, слайдер, квиз, анимации.
// Страницы услуг — отдельные URL (SSR), поэтому переключения экранов больше нет.

import { captureTraffic, deviceType } from './utm.js';
import { initTracking } from './track.js';
import { initBanners, bannerMatches, hasRules } from './banner.js';
import { initQuiz } from './quiz.js';
import { initCallback } from './callback.js';

const data = JSON.parse(document.getElementById('app-data').textContent);
const traffic = captureTraffic();
initTracking({ traffic, page: 'page' });
initBanners(data.banner);

const ctx = {
  traffic,
  device: deviceType(),
  metrikaId: data.brand?.metrikaId || '',
  ymClientId: null,
  recaptcha: data.recaptcha,
};

let ymClientId = null;
try {
  ymClientId = sessionStorage.getItem('pm.ymClientId');
} catch {
  ymClientId = null;
}
ctx.ymClientId = ymClientId;
if (typeof window.ym === 'function' && ctx.metrikaId) {
  try {
    window.ym(ctx.metrikaId, 'params', {
      utm: traffic.utm,
      click_id: traffic.clickId,
      device: ctx.device,
      page: 'page',
    });
    window.ym(ctx.metrikaId, 'getClientID', (id) => {
      ctx.ymClientId = id;
      try {
        sessionStorage.setItem('pm.ymClientId', id);
      } catch {
        /* storage unavailable */
      }
    });
  } catch {
    /* metrika unavailable */
  }
}

initQuiz(document.getElementById('quiz'), data.quiz, ctx);
initQuiz(document.getElementById('quiz-service'), data.quiz, ctx);
initCallback({ ...ctx, quiz: data.quiz });

/* ---------- Slider (ссылки на страницы услуг, бесшовное зацикливание) ---------- */
function initSlider() {
  const slider = document.getElementById('slider');
  const track = document.getElementById('slider-track');
  if (!slider || !track) return;
  const dotsWrap = document.getElementById('slider-dots');
  const real = Array.from(track.children);
  const n = real.length;
  if (!n) return;
  // Единственный слайд — прокрутка не нужна: прячем стрелки и точки, оставляем как есть.
  if (n === 1) {
    slider.querySelectorAll('.slider-arrow, .slider-dots').forEach((el) => {
      el.style.display = 'none';
    });
    return;
  }
  const autoplay = Math.max(2000, Number(slider.dataset.autoplay) || 2000);
  let timer = null;

  // Клоны первого и последнего слайда — для бесшовного перехода по кругу.
  if (n > 1) {
    const firstClone = real[0].cloneNode(true);
    const lastClone = real[n - 1].cloneNode(true);
    firstClone.setAttribute('aria-hidden', 'true');
    lastClone.setAttribute('aria-hidden', 'true');
    firstClone.dataset.clone = '';
    lastClone.dataset.clone = '';
    track.appendChild(firstClone);
    track.insertBefore(lastClone, real[0]);
  }

  // pos — позиция в треке: 0 (клон последнего), 1..n (реальные), n+1 (клон первого).
  let pos = 1;
  const realIndex = (p) => (((p - 1) % n) + n) % n;

  function setTransform(p, animate) {
    if (animate) {
      track.style.transition = '';
      track.style.transform = `translateX(-${p * 100}%)`;
    } else {
      track.style.transition = 'none';
      track.style.transform = `translateX(-${p * 100}%)`;
      void track.offsetWidth;
      track.style.transition = '';
    }
  }

  function renderDots() {
    if (!dotsWrap) return;
    const active = realIndex(pos);
    Array.from(dotsWrap.children).forEach((b, i) => b.classList.toggle('active', i === active));
  }

  function normalize() {
    if (pos === n + 1) {
      pos = 1;
      setTransform(pos, false);
    } else if (pos === 0) {
      pos = n;
      setTransform(pos, false);
    }
  }

  function goTo(p, user) {
    pos = p;
    setTransform(pos, true);
    renderDots();
    if (user) start();
  }
  function next(user = true) {
    normalize();
    goTo(pos + 1, user);
  }
  function prev(user = true) {
    normalize();
    goTo(pos - 1, user);
  }
  function goIndex(i, user) {
    goTo(i + 1, user);
  }

  track.addEventListener('transitionend', (e) => {
    if (e.target !== track) return;
    normalize();
    renderDots();
  });

  real.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `Слайд ${i + 1}`);
    b.addEventListener('click', (e) => {
      e.preventDefault();
      goIndex(i, true);
    });
    dotsWrap?.appendChild(b);
  });

  function start() {
    stop();
    timer = setInterval(() => next(false), autoplay);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  document.getElementById('slider-next')?.addEventListener('click', (e) => {
    e.preventDefault();
    next(true);
  });
  document.getElementById('slider-prev')?.addEventListener('click', (e) => {
    e.preventDefault();
    prev(true);
  });
  // Пауза автопрокрутки при наведении мыши или фокусе внутри баннера
  slider.addEventListener('mouseenter', stop);
  slider.addEventListener('mouseleave', start);
  slider.addEventListener('focusin', stop);
  slider.addEventListener('focusout', start);
  let startX = 0;
  let dragged = false;
  slider.addEventListener(
    'touchstart',
    (e) => {
      startX = e.touches[0].clientX;
      dragged = false;
      stop();
    },
    { passive: true },
  );
  slider.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) {
      dragged = true;
      if (dx < 0) next(true);
      else prev(true);
    } else {
      start();
    }
  });
  slider.addEventListener(
    'click',
    (e) => {
      if (dragged) {
        e.preventDefault();
        dragged = false;
      }
    },
    true,
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') next(true);
    else if (e.key === 'ArrowLeft') prev(true);
  });

  setTransform(pos, false);
  renderDots();
  if (n > 1) start();
}

/* ---------- Hero carousel (фото первого экрана) ---------- */
function pickHeroIndex(images, search) {
  if (!images || !images.length) return 0;
  for (let i = 0; i < images.length; i += 1) {
    if (hasRules(images[i]) && bannerMatches(images[i], search)) return i;
  }
  const def = images.findIndex((im) => !hasRules(im));
  return def >= 0 ? def : 0;
}

function initHeroCarousel() {
  const root = document.getElementById('hero-carousel');
  if (!root) return;
  const track = root.querySelector('.hero-carousel-track');
  if (!track) return;
  const slides = Array.from(track.children);
  if (slides.length < 2) return;
  const dotsWrap = document.getElementById('hero-dots');
  const hero = (data.blocks && data.blocks.home && data.blocks.home.hero) || {};
  const images = hero.images || [];
  const autoplay = Math.max(2500, Number(root.dataset.autoplay) || 4000);
  let idx = 0;
  let timer = null;

  slides.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `Фото ${i + 1}`);
    b.addEventListener('click', () => go(i, true));
    dotsWrap?.appendChild(b);
  });

  function render() {
    slides.forEach((s, i) => s.classList.toggle('is-active', i === idx));
    if (dotsWrap) Array.from(dotsWrap.children).forEach((b, i) => b.classList.toggle('active', i === idx));
  }
  function go(i, user) {
    idx = (i + slides.length) % slides.length;
    render();
    if (user) start();
  }
  function start() {
    stop();
    timer = setInterval(() => go(idx + 1, false), autoplay);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  root.addEventListener('mouseenter', stop);
  root.addEventListener('mouseleave', start);
  document.getElementById('hero-prev')?.addEventListener('click', (e) => {
    e.preventDefault();
    go(idx - 1, true);
  });
  document.getElementById('hero-next')?.addEventListener('click', (e) => {
    e.preventDefault();
    go(idx + 1, true);
  });
  let startX = 0;
  let startY = 0;
  root.addEventListener(
    'touchstart',
    (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      stop();
    },
    { passive: true },
  );
  root.addEventListener(
    'touchmove',
    (e) => {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10 && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
  root.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) {
      if (dx < 0) go(idx + 1, true);
      else go(idx - 1, true);
    } else {
      start();
    }
  });

  const activeNow = slides.findIndex((s) => s.classList.contains('is-active'));
  idx = activeNow >= 0 ? activeNow : images.length === slides.length ? pickHeroIndex(images, window.location.search) : 0;
  render();
  start();
}

/* ---------- Scroll ---------- */
function scrollToEl(id) {
  const n = document.getElementById(id);
  if (!n) return;
  const top = n.getBoundingClientRect().top + window.pageYOffset - 80;
  window.scrollTo({ top, behavior: 'smooth' });
}
document.querySelectorAll('[data-scroll]').forEach((b) => {
  b.addEventListener('click', () => scrollToEl(b.dataset.scroll));
});

/* ---------- Reveal ---------- */
function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach((e) => e.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px' },
  );
  els.forEach((e) => io.observe(e));
}

initSlider();
initHeroCarousel();
initReveal();
