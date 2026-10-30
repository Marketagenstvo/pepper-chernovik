import { getJson, postJson, putJson } from '../assets/js/api.js';

const TABS = [
  { id: 'brand', title: 'Бренд' },
  { id: 'contacts', title: 'Контакты и соцсети' },
  { id: 'menu', title: 'Меню' },
  { id: 'blocks', title: 'Блоки страниц' },
  { id: 'services', title: 'Услуги' },
  { id: 'creatives', title: 'Креативы и карусель' },
  { id: 'quiz', title: 'Квиз' },
  { id: 'integrations', title: 'Интеграции' },
  { id: 'backups', title: 'Резервные копии' },
  { id: 'leads', title: 'Заявки' },
  { id: 'stats', title: 'Статистика' },
];

let C = null;
let csrf = null;
let backupFlash = '';
const dirty = new Set();

const $ = (sel, root = document) => root.querySelector(sel);

function tabFromHash() {
  const id = (window.location.hash || '').replace(/^#\/?/, '');
  return TABS.some((t) => t.id === id) ? id : 'brand';
}

let activeTab = tabFromHash();

function activateTab(id) {
  activeTab = TABS.some((t) => t.id === id) ? id : 'brand';
  renderTabs();
  render();
}

window.addEventListener('hashchange', () => activateTab(tabFromHash()));

async function boot() {
  const res = await fetch('/api/admin/me');
  if (res.ok) {
    const data = await res.json();
    csrf = data.csrf;
    await enterApp();
  } else {
    showLogin();
  }
}

function showLogin() {
  $('#login').hidden = false;
  $('#app').hidden = true;
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const out = await postJson('/api/admin/login', { login: fd.get('login'), password: fd.get('password') });
    if (out.ok) {
      csrf = out.data.csrf;
      $('#login-error').hidden = true;
      await enterApp();
    } else {
      const err = $('#login-error');
      err.hidden = false;
      err.textContent = out.data?.error || 'Ошибка входа';
    }
  });
}

async function enterApp() {
  C = (await getJson('/api/admin/content')).content;
  $('#login').hidden = true;
  $('#app').hidden = false;
  activeTab = tabFromHash();
  renderTabs();
  render();
  $('#save').addEventListener('click', saveAll);
  $('#logout').addEventListener('click', async () => {
    await postJson('/api/admin/logout', {});
    location.reload();
  });
}

function renderTabs() {
  const nav = $('#tabs');
  nav.innerHTML = '';
  for (const tab of TABS) {
    const b = document.createElement('button');
    b.textContent = tab.title;
    b.className = tab.id === activeTab ? 'is-active' : '';
    b.addEventListener('click', () => {
      const target = `#${tab.id}`;
      if (window.location.hash !== target) window.location.hash = target;
      else activateTab(tab.id);
    });
    nav.appendChild(b);
  }
}

function markDirty(key) {
  dirty.add(key);
  $('#save-status').textContent = 'Есть несохранённые изменения';
}

function render() {
  const tab = TABS.find((t) => t.id === activeTab);
  $('#page-title').textContent = tab.title;
  const panel = $('#panel');
  panel.innerHTML = '';
  const fn = renderers[activeTab];
  if (fn) fn(panel);
}

/* ── helpers ─────────────────────────────────────────── */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'value') node.value = v ?? '';
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') node.innerHTML = v;
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function card(title, children) {
  return el('div', { class: 'card' }, [title ? el('h2', { text: title }) : null, ...[].concat(children)]);
}

function input(label, value, onInput, opts = {}) {
  const inp = el(opts.multiline ? 'textarea' : 'input', {
    value: value ?? '',
    type: opts.type || 'text',
    placeholder: opts.placeholder || '',
  });
  inp.addEventListener('input', () => onInput(inp.value));
  return el('label', { class: 'field' }, [el('span', { text: label }), inp]);
}

function toggle(label, checked, onChange) {
  const inp = el('input', { type: 'checkbox' });
  inp.checked = Boolean(checked);
  inp.addEventListener('change', () => onChange(inp.checked));
  return el('label', { class: 'toggle' }, [inp, el('span', { text: label })]);
}

function fmtSize(n) {
  if (!n) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function number(label, value, onChange, opts = {}) {
  return input(label, value, (v) => onChange(v === '' ? '' : Number(v)), { type: 'number', ...opts });
}

function selectField(label, value, options, onChange) {
  const sel = el(
    'select',
    {},
    options.map((o) => el('option', { value: o.value, text: o.label, selected: o.value === value ? 'selected' : null })),
  );
  sel.value = value ?? '';
  sel.addEventListener('change', () => onChange(sel.value));
  return el('label', { class: 'field' }, [el('span', { text: label }), sel]);
}

function colorField(label, value, onChange) {
  const inp = el('input', { type: 'color', value: value || '#E11D2E' });
  inp.addEventListener('input', () => onChange(inp.value));
  return el('label', { class: 'field' }, [el('span', { text: label }), inp]);
}

function commaField(label, arr, onChange) {
  const inp = el('input', { value: (arr || []).join(', ') });
  inp.addEventListener('input', () =>
    onChange(inp.value.split(',').map((s) => s.trim()).filter(Boolean)),
  );
  return el('label', { class: 'field' }, [el('span', { text: label }), inp]);
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/admin/upload', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: fd });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'upload failed');
  return data.url;
}

function resolveLogo(value) {
  const v = String(value || '');
  if (!v) return '';
  if (v.startsWith('/') || v.startsWith('http')) return v;
  return `/assets/img/brands/${v}.svg`;
}

function logoField(label, value, onChange) {
  const preview = el('img', { class: 'thumb', src: resolveLogo(value), alt: '' });
  const file = el('input', { type: 'file', accept: 'image/*' });
  const inp = el('input', { type: 'text', value: value || '', placeholder: 'например bmw или /uploads/…' });
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    try {
      const url = await uploadFile(file.files[0]);
      onChange(url);
      inp.value = url;
      preview.src = url;
    } catch (err) {
      alert(err.message);
    }
  });
  inp.addEventListener('input', () => {
    onChange(inp.value);
    preview.src = resolveLogo(inp.value);
  });
  return el('div', { class: 'field' }, [el('span', { text: label }), preview, inp, file]);
}

function imageField(label, value, onChange) {
  const preview = el('img', { class: 'thumb', src: value || '', alt: '' });
  const file = el('input', { type: 'file', accept: 'image/*' });
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    try {
      const url = await uploadFile(file.files[0]);
      onChange(url);
      preview.src = url;
      inp.value = url;
    } catch (err) {
      alert(err.message);
    }
  });
  const inp = el('input', { type: 'text', value: value || '' });
  inp.addEventListener('input', () => {
    onChange(inp.value);
    preview.src = inp.value;
  });
  return el('div', { class: 'field' }, [el('span', { text: label }), preview, inp, file]);
}

function listEditor({ title, items, renderItem, onAdd, addLabel = 'Добавить' }) {
  const box = el('div', {}, [title ? el('h3', { text: title }) : null]);
  (items || []).forEach((item, i) => {
    box.appendChild(el('div', { class: 'list-item' }, renderItem(item, i)));
  });
  if (onAdd) box.appendChild(el('button', { class: 'btn btn--sm', text: addLabel, onClick: onAdd }));
  return box;
}

function stringsEditor(items, key, addLabel = 'Добавить') {
  const box = el('div', { class: 'strings' });
  (items || []).forEach((value, i) => {
    const inp = el('input', { value });
    inp.addEventListener('input', () => {
      items[i] = inp.value;
      markDirty(key);
    });
    const del = el('button', {
      class: 'btn btn--sm btn--danger',
      text: 'Удалить',
      onClick: () => {
        items.splice(i, 1);
        markDirty(key);
        render();
      },
    });
    box.appendChild(el('div', { class: 'row' }, [inp, del]));
  });
  box.appendChild(
    el('button', {
      class: 'btn btn--sm',
      text: addLabel,
      onClick: () => {
        items.push('');
        markDirty(key);
        render();
      },
    }),
  );
  return box;
}

function move(arr, index, delta, key) {
  const target = index + delta;
  if (target < 0 || target >= arr.length) return;
  const [item] = arr.splice(index, 1);
  arr.splice(target, 0, item);
  markDirty(key);
  render();
}

/* ── tabs ────────────────────────────────────────────── */
const renderers = {
  brand(panel) {
    const b = C.brand;
    panel.appendChild(
      card('Бренд', [
        el('div', { class: 'grid' }, [
          input('Название', b.name, (v) => { b.name = v; markDirty('brand'); }),
          input('Слоган', b.tagline, (v) => { b.tagline = v; markDirty('brand'); }),
          input('Описание', b.description, (v) => { b.description = v; markDirty('brand'); }, { multiline: true }),
          input('Нижний колонтитул', b.footerNote, (v) => { b.footerNote = v; markDirty('brand'); }),
          input('Яндекс.Метрика ID', b.metrikaId, (v) => { b.metrikaId = v; markDirty('brand'); }, { placeholder: 'например 112941470' }),
        ]),
        el('div', { class: 'grid' }, [
          imageField('Логотип (если пусто — фирменный знак)', b.logo, (v) => { b.logo = v; markDirty('brand'); }),
          colorField('Основной цвет', b.primaryColor, (v) => { b.primaryColor = v; markDirty('brand'); }),
          colorField('Акцентный цвет', b.accentColor, (v) => { b.accentColor = v; markDirty('brand'); }),
        ]),
      ]),
    );
    b.legal = b.legal || {};
    panel.appendChild(
      card('Юридические данные (колонтитул)', [
        el('div', { class: 'grid' }, [
          input('Копирайт', b.legal.copyright, (v) => { b.legal.copyright = v; markDirty('brand'); }),
          input('Реквизиты', b.legal.requisites, (v) => { b.legal.requisites = v; markDirty('brand'); }),
        ]),
      ]),
    );
  },

  contacts(panel) {
    const ct = C.contacts;
    panel.appendChild(
      card('Контакты', [
        el('div', { class: 'grid' }, [
          input('Телефон', ct.phone, (v) => { ct.phone = v; markDirty('contacts'); }),
          input('Email', ct.email, (v) => { ct.email = v; markDirty('contacts'); }),
          input('Адрес', ct.address, (v) => { ct.address = v; markDirty('contacts'); }),
          input('Часы работы', ct.workHours, (v) => { ct.workHours = v; markDirty('contacts'); }),
          input('Примечание об офисе', ct.officeNote, (v) => { ct.officeNote = v; markDirty('contacts'); }),
        ]),
      ]),
    );
    ct.representatives = ct.representatives || [];
    panel.appendChild(card('Города-представители', [stringsEditor(ct.representatives, 'contacts', 'Добавить город')]));
    ct.socials = ct.socials || [];
    panel.appendChild(
      card('Соцсети', [
        listEditor({
          title: 'Список',
          items: ct.socials,
          addLabel: 'Добавить соцсеть',
          onAdd: () => { ct.socials.push({ id: 'new', label: '', short: '', url: '', image: '' }); markDirty('contacts'); render(); },
          renderItem: (s, i) => {
            const row = el('div', { class: 'grid' }, [
              input('ID', s.id, (v) => { s.id = v; markDirty('contacts'); }),
              input('Название', s.label, (v) => { s.label = v; markDirty('contacts'); }),
              input('Коротко (TG)', s.short, (v) => { s.short = v; markDirty('contacts'); }),
              input('URL', s.url, (v) => { s.url = v; markDirty('contacts'); }),
            ]);
            const del = el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить', onClick: () => { ct.socials.splice(i, 1); markDirty('contacts'); render(); } });
            return [row, imageField('Иконка (png/svg/webp)', s.image, (v) => { s.image = v; markDirty('contacts'); }), del];
          },
        }),
      ]),
    );
    ct.channels = ct.channels || [];
    panel.appendChild(
      card('Каналы связи для квиза', [
        el('p', { class: 'hint', text: 'ID каналов должны совпадать со значениями вопроса «мессенджер» в квизе.' }),
        listEditor({
          title: '',
          items: ct.channels,
          addLabel: 'Добавить канал',
          onAdd: () => { ct.channels.push({ id: 'new', label: '', hint: '' }); markDirty('contacts'); render(); },
          renderItem: (c, i) => {
            const row = el('div', { class: 'grid' }, [
              input('ID', c.id, (v) => { c.id = v; markDirty('contacts'); }),
              input('Название', c.label, (v) => { c.label = v; markDirty('contacts'); }),
              input('Подсказка', c.hint, (v) => { c.hint = v; markDirty('contacts'); }),
            ]);
            const del = el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить', onClick: () => { ct.channels.splice(i, 1); markDirty('contacts'); render(); } });
            return [row, del];
          },
        }),
      ]),
    );
  },

  menu(panel) {
    const m = C.menu;
    m.headerLinks = m.headerLinks || [];
    m.footerLinks = m.footerLinks || [];
    panel.appendChild(
      card('Шапка', [
        input('Текст по центру (если нет ссылок)', m.headerCenter, (v) => { m.headerCenter = v; markDirty('menu'); }),
        listEditor({
          title: 'Ссылки в шапке',
          items: m.headerLinks,
          addLabel: 'Добавить ссылку',
          onAdd: () => { m.headerLinks.push({ label: '', href: '#' }); markDirty('menu'); render(); },
          renderItem: (l, i) => {
            const del = el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить', onClick: () => { m.headerLinks.splice(i, 1); markDirty('menu'); render(); } });
            return [el('div', { class: 'grid' }, [
              input('Текст', l.label, (v) => { l.label = v; markDirty('menu'); }),
              input('Ссылка', l.href, (v) => { l.href = v; markDirty('menu'); }),
            ]), del];
          },
        }),
      ]),
    );
    panel.appendChild(
      card('Подвал', [
        listEditor({
          title: 'Ссылки в подвале',
          items: m.footerLinks,
          addLabel: 'Добавить ссылку',
          onAdd: () => { m.footerLinks.push({ label: '', href: '#' }); markDirty('menu'); render(); },
          renderItem: (l, i) => {
            const del = el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить', onClick: () => { m.footerLinks.splice(i, 1); markDirty('menu'); render(); } });
            return [el('div', { class: 'grid' }, [
              input('Текст', l.label, (v) => { l.label = v; markDirty('menu'); }),
              input('Ссылка', l.href, (v) => { l.href = v; markDirty('menu'); }),
            ]), del];
          },
        }),
      ]),
    );
  },

  blocks(panel) {
    const B = C.blocks;
    B.seo = B.seo || {};
    B.seo.faq = B.seo.faq || [];
    B.home = B.home || {};
    B.home.hero = B.home.hero || {};
    B.home.hero.trust = B.home.hero.trust || [];
    B.home.quizSection = B.home.quizSection || {};
    B.home.servicesSection = B.home.servicesSection || {};
    B.service = B.service || {};
    B.service.route = B.service.route || [];
    B.service.routeSection = B.service.routeSection || {};
    B.service.cta = B.service.cta || {};

    panel.appendChild(
      card('SEO страницы', [
        input('Title', B.seo.title, (v) => { B.seo.title = v; markDirty('blocks'); }),
        input('Description', B.seo.description, (v) => { B.seo.description = v; markDirty('blocks'); }, { multiline: true }),
        listEditor({
          title: 'FAQ (для llms.txt)',
          items: B.seo.faq,
          addLabel: 'Добавить вопрос',
          onAdd: () => { B.seo.faq.push({ q: '', a: '' }); markDirty('blocks'); render(); },
          renderItem: (f, i) => {
            const del = el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить', onClick: () => { B.seo.faq.splice(i, 1); markDirty('blocks'); render(); } });
            return [input('Вопрос', f.q, (v) => { f.q = v; markDirty('blocks'); }), input('Ответ', f.a, (v) => { f.a = v; markDirty('blocks'); }, { multiline: true }), del];
          },
        }),
      ]),
    );

    const hero = B.home.hero;
    panel.appendChild(
      card('Главная — первый экран', [
        el('div', { class: 'grid' }, [
          input('Надзаголовок', hero.eyebrow, (v) => { hero.eyebrow = v; markDirty('blocks'); }),
          input('Заголовок', hero.title, (v) => { hero.title = v; markDirty('blocks'); }),
          input('Акцент в заголовке', hero.titleAccent, (v) => { hero.titleAccent = v; markDirty('blocks'); }),
          input('Подзаголовок', hero.subtitle, (v) => { hero.subtitle = v; markDirty('blocks'); }, { multiline: true }),
          input('Кнопка 1', hero.ctaText, (v) => { hero.ctaText = v; markDirty('blocks'); }),
          input('Кнопка 2', hero.cta2Text, (v) => { hero.cta2Text = v; markDirty('blocks'); }),
          input('Плашка: подпись', hero.chipLabel, (v) => { hero.chipLabel = v; markDirty('blocks'); }),
          input('Плашка: значение', hero.chipValue, (v) => { hero.chipValue = v; markDirty('blocks'); }),
          input('Карточка: заголовок', hero.cardTitle, (v) => { hero.cardTitle = v; markDirty('blocks'); }),
          input('Карточка: текст', hero.cardText, (v) => { hero.cardText = v; markDirty('blocks'); }),
          input('Alt изображения', hero.imageAlt, (v) => { hero.imageAlt = v; markDirty('blocks'); }),
        ]),
        imageField('Фото первого экрана (одиночное, если нет карусели)', hero.image, (v) => { hero.image = v; markDirty('blocks'); }),
        number('Автопрокрутка фото, мс', hero.autoplayMs, (v) => { hero.autoplayMs = v; markDirty('blocks'); }),
        el('p', { class: 'hint', text: 'Карусель первого экрана: слайд с UTM-метками показывается первым при переходе по ним, слайд без меток — по умолчанию.' }),
        (() => {
          hero.images = hero.images || [];
          return listEditor({
            title: 'Фото карусели',
            items: hero.images,
            addLabel: 'Добавить фото',
            onAdd: () => {
              hero.images.push({ image: '', alt: '', rules: { utmSource: [], utmMedium: [], utmCampaign: [], utmContent: [], clickIds: [] } });
              markDirty('blocks');
              render();
            },
            renderItem: (im, i) => {
              im.rules = im.rules || { utmSource: [], utmMedium: [], utmCampaign: [], utmContent: [], clickIds: [] };
              const del = el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить', onClick: () => { hero.images.splice(i, 1); markDirty('blocks'); render(); } });
              return [
                el('div', { class: 'row row--between' }, [
                  el('strong', { text: im.alt || im.image || `Фото ${i + 1}` }),
                  el('div', { class: 'row' }, [
                    el('button', { class: 'btn btn--sm', text: '↑', onClick: () => move(hero.images, i, -1, 'blocks') }),
                    el('button', { class: 'btn btn--sm', text: '↓', onClick: () => move(hero.images, i, 1, 'blocks') }),
                    del,
                  ]),
                ]),
                imageField('Изображение', im.image, (v) => { im.image = v; markDirty('blocks'); }),
                input('Alt', im.alt, (v) => { im.alt = v; markDirty('blocks'); }),
                el('h3', { text: 'Показывать при UTM (пусто — по умолчанию)' }),
                el('div', { class: 'grid' }, [
                  commaField('utm_source', im.rules.utmSource, (v) => { im.rules.utmSource = v; markDirty('blocks'); }),
                  commaField('utm_medium', im.rules.utmMedium, (v) => { im.rules.utmMedium = v; markDirty('blocks'); }),
                  commaField('utm_campaign', im.rules.utmCampaign, (v) => { im.rules.utmCampaign = v; markDirty('blocks'); }),
                  commaField('utm_content', im.rules.utmContent, (v) => { im.rules.utmContent = v; markDirty('blocks'); }),
                  commaField('click id', im.rules.clickIds, (v) => { im.rules.clickIds = v; markDirty('blocks'); }),
                ]),
              ];
            },
          });
        })(),
        el('h3', { text: 'Преимущества' }),
        stringsEditor(hero.trust, 'blocks', 'Добавить преимущество'),
      ]),
    );

    const qs = B.home.quizSection;
    const ss = B.home.servicesSection;
    panel.appendChild(
      card('Главная — блоки', [
        el('h3', { text: 'Квиз' }),
        el('div', { class: 'grid' }, [
          input('Надзаголовок', qs.eyebrow, (v) => { qs.eyebrow = v; markDirty('blocks'); }),
          input('Заголовок', qs.title, (v) => { qs.title = v; markDirty('blocks'); }),
          input('Подзаголовок', qs.subtitle, (v) => { qs.subtitle = v; markDirty('blocks'); }, { multiline: true }),
        ]),
        el('h3', { text: 'Услуги' }),
        el('div', { class: 'grid' }, [
          input('Надзаголовок', ss.eyebrow, (v) => { ss.eyebrow = v; markDirty('blocks'); }),
          input('Заголовок', ss.title, (v) => { ss.title = v; markDirty('blocks'); }),
          input('Подзаголовок', ss.subtitle, (v) => { ss.subtitle = v; markDirty('blocks'); }, { multiline: true }),
        ]),
      ]),
    );

    const svc = B.service;
    panel.appendChild(
      card('Страница услуги', [
        el('div', { class: 'grid' }, [
          input('Назад', svc.backLabel, (v) => { svc.backLabel = v; markDirty('blocks'); }),
          input('Заголовок преимуществ', svc.benefitsTitle, (v) => { svc.benefitsTitle = v; markDirty('blocks'); }),
        ]),
        el('h3', { text: 'Маршрут' }),
        el('div', { class: 'grid' }, [
          input('Надзаголовок', svc.routeSection.eyebrow, (v) => { svc.routeSection.eyebrow = v; markDirty('blocks'); }),
          input('Заголовок', svc.routeSection.title, (v) => { svc.routeSection.title = v; markDirty('blocks'); }),
          input('Подзаголовок', svc.routeSection.subtitle, (v) => { svc.routeSection.subtitle = v; markDirty('blocks'); }, { multiline: true }),
        ]),
        listEditor({
          title: 'Этапы',
          items: svc.route,
          addLabel: 'Добавить этап',
          onAdd: () => { svc.route.push({ n: '0' + (svc.route.length + 1), title: '', text: '' }); markDirty('blocks'); render(); },
          renderItem: (s, i) => {
            const del = el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить', onClick: () => { svc.route.splice(i, 1); markDirty('blocks'); render(); } });
            return [el('div', { class: 'grid' }, [
              input('Номер', s.n, (v) => { s.n = v; markDirty('blocks'); }),
              input('Заголовок', s.title, (v) => { s.title = v; markDirty('blocks'); }),
            ]), input('Текст', s.text, (v) => { s.text = v; markDirty('blocks'); }, { multiline: true }), del];
          },
        }),
        el('h3', { text: 'CTA-баннер' }),
        el('div', { class: 'grid' }, [
          input('Заголовок', svc.cta.title, (v) => { svc.cta.title = v; markDirty('blocks'); }),
          input('Текст', svc.cta.text, (v) => { svc.cta.text = v; markDirty('blocks'); }, { multiline: true }),
        ]),
      ]),
    );
  },

  services(panel) {
    const S = C.services;
    S.items = S.items || [];
    panel.appendChild(
      card('Услуги и страницы', [
        el('p', { class: 'hint', text: 'Каждая услуга — отдельная страница по адресу /slug/. Меняйте slug осторожно: ссылка и индексация изменятся.' }),
        listEditor({
          title: '',
          items: S.items,
          addLabel: 'Добавить услугу',
          onAdd: () => {
            S.items.push({ id: `service-${Date.now()}`, slug: 'novaya-usluga', title: '', days: '', tag: '', intro: '', note: '', photo: '', bgMode: 'photo', bgDesktop: '', bgMobile: '', bgGradient: false, benefits: [{ title: '', text: '' }], inGrid: true, showRoute: true });
            markDirty('services');
            render();
          },
          renderItem: (s, i) => {
            const details = el('div', { class: 'collapse', hidden: 'hidden' }, [
              el('div', { class: 'grid' }, [
                input('ID', s.id, (v) => { s.id = v; markDirty('services'); }),
                input('Slug (адрес страницы)', s.slug, (v) => { s.slug = v; markDirty('services'); }),
                input('Заголовок', s.title, (v) => { s.title = v; markDirty('services'); }),
                input('Флаг (cn/us/eu/kr/ae)', s.flag, (v) => { s.flag = v || undefined; markDirty('services'); }),
                input('Моно-плашка (МОТО)', s.mono, (v) => { s.mono = v || undefined; markDirty('services'); }),
                input('Срок', s.days, (v) => { s.days = v; markDirty('services'); }),
                input('Метка', s.tag, (v) => { s.tag = v; markDirty('services'); }),
                el('div', { class: 'row' }, [
                  toggle('Показывать в сетке', s.inGrid, (v) => { s.inGrid = v; markDirty('services'); }),
                  toggle('Показывать «Маршрут автомобиля»', s.showRoute !== false, (v) => { s.showRoute = v; markDirty('services'); }),
                ]),
              ]),
              input('Описание', s.intro, (v) => { s.intro = v; markDirty('services'); }, { multiline: true }),
              input('Примечание', s.note, (v) => { s.note = v; markDirty('services'); }),
              ...(() => {
                const photoField = imageField('Фото страницы (svc-photo)', s.photo, (v) => { s.photo = v; markDirty('services'); });
                const bgFields = el('div', {}, [
                  el('div', { class: 'grid' }, [
                    imageField('Фон — десктоп', s.bgDesktop, (v) => { s.bgDesktop = v || ''; markDirty('services'); }),
                    imageField('Фон — мобильная', s.bgMobile, (v) => { s.bgMobile = v || ''; markDirty('services'); }),
                  ]),
                  el('div', { class: 'row' }, [
                    toggle('Градиент (тёмный, светлый текст)', s.bgGradient === true, (v) => { s.bgGradient = v; markDirty('services'); }),
                  ]),
                ]);
                const sync = () => {
                  const cover = (s.bgMode || 'photo') === 'cover';
                  photoField.style.display = cover ? 'none' : '';
                  bgFields.style.display = cover ? '' : 'none';
                };
                const mode = selectField('Вариант верхней картинки', s.bgMode || 'photo', [{ value: 'photo', label: 'Картинка + отдельно фон' }, { value: 'cover', label: 'Картинка-фон' }], (v) => { s.bgMode = v; markDirty('services'); sync(); });
                sync();
                return [mode, el('p', { class: 'hint', text: '«Картинка + отдельно фон» — фото авто справа, фон секции тёмный. «Картинка-фон» — загруженная картинка на весь верхний блок: отдельно для десктопа и мобильной.' }), photoField, bgFields];
              })(),
              listEditor({
                title: 'Преимущества',
                items: s.benefits || [],
                addLabel: 'Добавить преимущество',
                onAdd: () => { s.benefits = s.benefits || []; s.benefits.push({ title: '', text: '' }); markDirty('services'); render(); },
                renderItem: (b, j) => {
                  const del = el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить', onClick: () => { s.benefits.splice(j, 1); markDirty('services'); render(); } });
                  return [input('Заголовок', b.title, (v) => { b.title = v; markDirty('services'); }), input('Текст', b.text, (v) => { b.text = v; markDirty('services'); }, { multiline: true }), del];
                },
              }),
            ]);

            const toggleBtn = el('button', { class: 'btn btn--sm', text: 'Развернуть' });
            toggleBtn.addEventListener('click', () => {
              const opening = details.hasAttribute('hidden');
              if (opening) details.removeAttribute('hidden');
              else details.setAttribute('hidden', '');
              toggleBtn.textContent = opening ? 'Свернуть' : 'Развернуть';
            });

            return [
              el('div', { class: 'row row--between' }, [
                el('strong', { text: s.title || s.id }),
                el('div', { class: 'row' }, [
                  toggleBtn,
                  el('button', { class: 'btn btn--sm', text: '↑', onClick: () => move(S.items, i, -1, 'services') }),
                  el('button', { class: 'btn btn--sm', text: '↓', onClick: () => move(S.items, i, 1, 'services') }),
                  el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить', onClick: () => { S.items.splice(i, 1); markDirty('services'); render(); } }),
                ]),
              ]),
              details,
            ];
          },
        }),
      ]),
    );
  },

  creatives(panel) {
    const s = C.slides;
    s.items = s.items || [];
    s.banners = s.banners || [];
    if (!s.mode) s.mode = 'countries';

    const children = [
      el('p', { class: 'hint', text: 'Вариант главного слайдера: «Страны» (генерируется из услуг) или «Баннеры» (загружаете картинки десктоп/мобильная и ссылку).' }),
      el('div', { class: 'grid' }, [
        selectField('Вариант', s.mode, [{ value: 'countries', label: 'Страны (текущий)' }, { value: 'banners', label: 'Баннеры (картинки)' }], (v) => { s.mode = v; markDirty('slides'); render(); }),
        number('Интервал автопрокрутки, мс', s.autoplayMs, (v) => { s.autoplayMs = v; markDirty('slides'); }),
      ]),
    ];

    if (s.mode === 'banners') {
      children.push(
        listEditor({
          title: 'Баннеры',
          items: s.banners,
          addLabel: 'Добавить баннер',
          onAdd: () => { s.banners.push({ id: `banner-${Date.now()}`, image: '', imageMobile: '', link: '', alt: '', moreLeft: 26, moreTop: 70 }); markDirty('slides'); render(); },
          renderItem: (bn, i) => {
            const del = el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить', onClick: () => { s.banners.splice(i, 1); markDirty('slides'); render(); } });
            return [
              el('div', { class: 'row row--between' }, [
                el('strong', { text: bn.alt || bn.id }),
                el('div', { class: 'row' }, [
                  el('button', { class: 'btn btn--sm', text: '↑', onClick: () => move(s.banners, i, -1, 'slides') }),
                  el('button', { class: 'btn btn--sm', text: '↓', onClick: () => move(s.banners, i, 1, 'slides') }),
                  del,
                ]),
              ]),
              el('div', { class: 'grid' }, [
                input('ID', bn.id, (v) => { bn.id = v; markDirty('slides'); }),
                input('Ссылка (URL или /slug/)', bn.link, (v) => { bn.link = v; markDirty('slides'); }),
                input('Alt', bn.alt, (v) => { bn.alt = v; markDirty('slides'); }),
              ]),
              imageField('Картинка — десктоп', bn.image, (v) => { bn.image = v; markDirty('slides'); }),
              imageField('Картинка — мобильная', bn.imageMobile, (v) => { bn.imageMobile = v; markDirty('slides'); }),
              el('div', { class: 'grid' }, [
                number('Кнопка «Подробнее» — слева, %', bn.moreLeft ?? 26, (v) => { bn.moreLeft = v; markDirty('slides'); }, { min: 0, max: 100, step: 0.1 }),
                number('Кнопка «Подробнее» — сверху, %', bn.moreTop ?? 70, (v) => { bn.moreTop = v; markDirty('slides'); }, { min: 0, max: 100, step: 0.1 }),
              ]),
              el('p', { class: 'hint', text: 'Положение кнопки «Подробнее» на десктопе в процентах от баннера (по умолчанию 26% слева, 70% сверху). На мобильной кнопка располагается под баннером.' }),
            ];
          },
        }),
      );
    } else {
      children.push(
        listEditor({
          title: 'Слайды стран',
          items: s.items,
          addLabel: 'Добавить слайд',
          onAdd: () => { s.items.push({ id: `slide-${Date.now()}`, service: C.services.items[0]?.id || '', from: '', car: '', alt: '' }); markDirty('slides'); render(); },
          renderItem: (slide, i) => {
            const del = el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить', onClick: () => { s.items.splice(i, 1); markDirty('slides'); render(); } });
            return [
              el('div', { class: 'grid' }, [
                input('ID', slide.id, (v) => { slide.id = v; markDirty('slides'); }),
                selectField('Услуга', slide.service, C.services.items.map((x) => ({ value: x.id, label: x.title })), (v) => { slide.service = v; markDirty('slides'); }),
                input('Из (родительный падеж)', slide.from, (v) => { slide.from = v; markDirty('slides'); }),
                input('Alt', slide.alt, (v) => { slide.alt = v; markDirty('slides'); }),
              ]),
              imageField('Изображение авто (webp/png)', slide.car, (v) => { slide.car = v; markDirty('slides'); }),
              el('div', { class: 'row' }, [
                el('button', { class: 'btn btn--sm', text: '↑', onClick: () => move(s.items, i, -1, 'slides') }),
                del,
              ]),
            ];
          },
        }),
      );
    }

    panel.appendChild(card('Главный слайдер', children));

    const b = C.banner;
    b.items = b.items || [];
    panel.appendChild(
      card('Welcome-баннеры (рекламный трафик)', [
        el('p', { class: 'hint', text: 'Показывается только посетителям с рекламными метками, держится не менее 2 секунд, блокирует скролл. Баннеры проверяются по порядку — выигрывает первый подошедший.' }),
        el('div', { class: 'row' }, [
          toggle('Раздел включён', b.enabled, (v) => { b.enabled = v; markDirty('banner'); }),
          number('Задержка по умолчанию, мс (минимум 2000)', b.delayMs, (v) => { b.delayMs = v; markDirty('banner'); }),
        ]),
        listEditor({
          title: '',
          items: b.items,
          addLabel: 'Добавить баннер',
          onAdd: () => {
            b.items.push({
              id: `banner-${Date.now().toString(36)}`,
              enabled: true,
              matchAll: false,
              label: 'Реклама · Pepper Motors',
              title: '',
              titleAccent: '',
              text: '',
              buttonText: 'Перейти на сайт',
              skipText: 'Пропустить',
              image: '',
              rules: { utmSource: [], utmMedium: [], utmCampaign: [], utmContent: [], clickIds: [] },
            });
            markDirty('banner');
            render();
          },
          renderItem: (item, i) => {
            item.rules = item.rules || { utmSource: [], utmMedium: [], utmCampaign: [], utmContent: [], clickIds: [] };
            const del = el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить', onClick: () => { b.items.splice(i, 1); markDirty('banner'); render(); } });
            return [
              el('div', { class: 'row row--between' }, [
                el('strong', { text: item.title || item.id }),
                el('div', { class: 'row' }, [
                  el('button', { class: 'btn btn--sm', text: '↑', onClick: () => move(b.items, i, -1, 'banner') }),
                  el('button', { class: 'btn btn--sm', text: '↓', onClick: () => move(b.items, i, 1, 'banner') }),
                  del,
                ]),
              ]),
              el('div', { class: 'row' }, [
                toggle('Включён', item.enabled, (v) => { item.enabled = v; markDirty('banner'); }),
                toggle('Ловить любой рекламный трафик', item.matchAll, (v) => { item.matchAll = v; markDirty('banner'); }),
              ]),
              el('div', { class: 'grid' }, [
                input('ID', item.id, (v) => { item.id = v; markDirty('banner'); }),
                number('Задержка, мс (пусто — общая)', item.delayMs, (v) => { item.delayMs = v; markDirty('banner'); }),
                input('Метка «Реклама»', item.label, (v) => { item.label = v; markDirty('banner'); }),
                input('Заголовок', item.title, (v) => { item.title = v; markDirty('banner'); }),
                input('Акцент в заголовке', item.titleAccent, (v) => { item.titleAccent = v; markDirty('banner'); }),
                input('Кнопка', item.buttonText, (v) => { item.buttonText = v; markDirty('banner'); }),
                input('Кнопка «Пропустить»', item.skipText, (v) => { item.skipText = v; markDirty('banner'); }),
              ]),
              input('Текст', item.text, (v) => { item.text = v; markDirty('banner'); }, { multiline: true }),
              imageField('Креатив (необязательно)', item.image, (v) => { item.image = v; markDirty('banner'); }),
              el('h3', { text: 'Правила UTM' }),
              el('p', { class: 'hint', text: 'Проверяются только те группы, чей параметр есть в ссылке — они должны совпасть. Отсутствующие в ссылке группы не мешают. Click id — отдельный сигнал. Пусто во всех полях + «Ловить любой» = баннер для всего рекламного трафика.' }),
              el('div', { class: 'grid' }, [
                commaField('utm_source', item.rules.utmSource, (v) => { item.rules.utmSource = v; markDirty('banner'); }),
                commaField('utm_medium', item.rules.utmMedium, (v) => { item.rules.utmMedium = v; markDirty('banner'); }),
                commaField('utm_campaign', item.rules.utmCampaign, (v) => { item.rules.utmCampaign = v; markDirty('banner'); }),
                commaField('utm_content', item.rules.utmContent, (v) => { item.rules.utmContent = v; markDirty('banner'); }),
                commaField('click id (yclid, gclid…)', item.rules.clickIds, (v) => { item.rules.clickIds = v; markDirty('banner'); }),
              ]),
            ];
          },
        }),
      ]),
    );
  },

  quiz(panel) {
    const q = C.quiz;
    q.contact = q.contact || { fields: ['name', 'phone'] };
    q.geoMasks = q.geoMasks || {};
    panel.appendChild(
      card('Общие настройки', [
        el('div', { class: 'grid' }, [
          input('Заголовок', q.title, (v) => { q.title = v; markDirty('quiz'); }),
          input('Ссылка на политику', q.policyUrl, (v) => { q.policyUrl = v; markDirty('quiz'); }),
          input('Страна по умолчанию', q.defaultCountry, (v) => { q.defaultCountry = v; markDirty('quiz'); }),
          input('Вопрос-канал (id)', q.channelQuestion, (v) => { q.channelQuestion = v; markDirty('quiz'); }),
          commaField('Поля контактов', q.contact.fields, (v) => { q.contact.fields = v; markDirty('quiz'); }),
        ]),
        input('Текст согласия', q.consentText, (v) => { q.consentText = v; markDirty('quiz'); }, { multiline: true }),
      ]),
    );
    panel.appendChild(
      card('Маски телефонов по гео', [
        listEditor({
          title: '',
          items: Object.entries(q.geoMasks),
          addLabel: 'Добавить страну',
          onAdd: () => { q.geoMasks.NEW = '+7 (999) 999-99-99'; markDirty('quiz'); render(); },
          renderItem: ([country, mask], i) => {
            const inp = el('input', { value: mask });
            inp.addEventListener('input', () => { q.geoMasks[country] = inp.value; markDirty('quiz'); });
            const del = el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить', onClick: () => { delete q.geoMasks[country]; markDirty('quiz'); render(); } });
            return [el('div', { class: 'row' }, [el('span', { class: 'badge', text: country }), inp, del])];
          },
        }),
      ]),
    );
    panel.appendChild(
      card('Вопросы', [
        listEditor({
          title: '',
          items: q.questions,
          addLabel: 'Добавить вопрос',
          onAdd: () => { q.questions.push({ id: `q${q.questions.length + 1}`, type: 'single', title: '', hint: '', options: [] }); markDirty('quiz'); render(); },
          renderItem: (question, i) => {
            const rows = [
              el('div', { class: 'row row--between' }, [
                el('strong', { text: question.id || '(без id)' }),
                el('div', { class: 'row' }, [
                  el('button', { class: 'btn btn--sm', text: '↑', onClick: () => move(q.questions, i, -1, 'quiz') }),
                  el('button', { class: 'btn btn--sm', text: '↓', onClick: () => move(q.questions, i, 1, 'quiz') }),
                  el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить', onClick: () => { q.questions.splice(i, 1); markDirty('quiz'); render(); } }),
                ]),
              ]),
              el('div', { class: 'grid' }, [
                input('ID', question.id, (v) => { question.id = v; markDirty('quiz'); }),
                selectField('Тип', question.type, [{ value: 'single', label: 'single' }, { value: 'multi', label: 'multi' }], (v) => { question.type = v; markDirty('quiz'); render(); }),
                input('Ширина сетки (brand/country)', question.wide, (v) => { question.wide = v || undefined; markDirty('quiz'); }),
                question.type === 'multi' ? number('Максимум выбора', question.max, (v) => { question.max = v; markDirty('quiz'); }) : null,
                el('div', { class: 'row' }, [toggle('Несколько ответов', question.multi, (v) => { question.multi = v; markDirty('quiz'); })]),
                el('div', { class: 'row' }, [toggle('Необязательный', question.optional, (v) => { question.optional = v; markDirty('quiz'); })]),
              ]),
              input('Заголовок', question.title, (v) => { question.title = v; markDirty('quiz'); }),
              input('Подсказка', question.hint, (v) => { question.hint = v; markDirty('quiz'); }),
              listEditor({
                title: 'Варианты',
                items: question.options,
                addLabel: 'Добавить вариант',
                onAdd: () => { question.options.push({ v: '', label: '' }); markDirty('quiz'); render(); },
                renderItem: (opt, k) => {
                  const del = el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить', onClick: () => { question.options.splice(k, 1); markDirty('quiz'); render(); } });
                  return [
                    el('div', { class: 'grid' }, [
                      input('Значение', opt.v, (v) => { opt.v = v; markDirty('quiz'); }),
                      input('Текст', opt.label, (v) => { opt.label = v; markDirty('quiz'); }),
                      input('Подпись', opt.sub, (v) => { opt.sub = v || undefined; markDirty('quiz'); }),
                      input('Крупно (10)', opt.lead, (v) => { opt.lead = v || undefined; markDirty('quiz'); }),
                      input('Цвет (swatch)', opt.swatch, (v) => { opt.swatch = v || undefined; markDirty('quiz'); }),
                      input('Флаг (cn/us/eu/kr/ae)', opt.flag, (v) => { opt.flag = v || undefined; markDirty('quiz'); }),
                      logoField('Логотип (загрузка или имя файла)', opt.logo, (v) => { opt.logo = v || undefined; markDirty('quiz'); }),
                      input('Моно-плашка (MAX)', opt.mono, (v) => { opt.mono = v || undefined; markDirty('quiz'); }),
                    ]),
                    del,
                  ];
                },
              }),
            ];
            return rows;
          },
        }),
      ]),
    );
  },

  integrations(panel) {
    const it = C.integrations;
    it.recaptcha = it.recaptcha || {};
    it.bitrix = it.bitrix || {};
    it.smtp = it.smtp || {};
    it.metrika = it.metrika || {};
    panel.appendChild(
      card('reCAPTCHA (защита от спама)', [
        el('p', { class: 'hint', text: 'Пока ключи не заполнены, работает защита токеном и honeypot. После ввода ключей проверка включается автоматически.' }),
        el('div', { class: 'row' }, [
          toggle('Включена', it.recaptcha.enabled, (v) => { it.recaptcha.enabled = v; markDirty('integrations'); }),
          selectField('Версия', it.recaptcha.version, [{ value: 'v2', label: 'v2 (чекбокс)' }, { value: 'v3', label: 'v3 (невидимая)' }], (v) => { it.recaptcha.version = v; markDirty('integrations'); }),
        ]),
        el('div', { class: 'grid' }, [
          input('Site key', it.recaptcha.siteKey, (v) => { it.recaptcha.siteKey = v; markDirty('integrations'); }),
          input('Secret key', it.recaptcha.secretKey, (v) => { it.recaptcha.secretKey = v; markDirty('integrations'); }),
        ]),
      ]),
    );
    const bitrixResult = el('span', { class: 'hint', text: '' });
    async function testBitrix(send) {
      bitrixResult.style.color = '';
      bitrixResult.textContent = 'Проверяю…';
      const out = await postJson('/api/admin/integrations/test-bitrix', { send, bitrix: it.bitrix }, { csrf });
      if (out.ok) {
        const v = out.data.verified;
        const parts = [`Вебхук OK (права: ${(v.scopes || []).join(', ') || '—'}; пользователь: ${v.user?.name || v.user?.id || '—'})`];
        if (out.data.sent) parts.push(`тестовый лид создан, ID ${out.data.sent.id}`);
        bitrixResult.textContent = parts.join('; ');
      } else {
        bitrixResult.style.color = '#E11D2E';
        bitrixResult.textContent = `Ошибка: ${out.data?.error || out.status}`;
      }
    }
    panel.appendChild(
      card('Bitrix24', [
        el('p', { class: 'hint', text: 'Заявки с сайта автоматически создаются в CRM (crm.lead.add). Ниже можно проверить вебхук и создать тестовый лид.' }),
        el('div', { class: 'grid' }, [
          input('Вебхук (URL)', it.bitrix.webhookUrl, (v) => { it.bitrix.webhookUrl = v; markDirty('integrations'); }),
          input('Ответственный (ID)', it.bitrix.assignedBy, (v) => { it.bitrix.assignedBy = v; markDirty('integrations'); }),
          input('Воронка (categoryId)', it.bitrix.categoryId, (v) => { it.bitrix.categoryId = v; markDirty('integrations'); }),
          input('Этап (stageId)', it.bitrix.stageId, (v) => { it.bitrix.stageId = v; markDirty('integrations'); }),
        ]),
        el('div', { class: 'row' }, [
          el('button', { class: 'btn btn--sm', text: 'Проверить вебхук', onClick: () => testBitrix(false) }),
          el('button', { class: 'btn btn--sm', text: 'Создать тестовый лид', onClick: () => testBitrix(true) }),
          bitrixResult,
        ]),
      ]),
    );
    const smtpResult = el('span', { class: 'hint', text: '' });
    async function testSmtp(send) {
      smtpResult.style.color = '';
      smtpResult.textContent = 'Проверяю…';
      const out = await postJson('/api/admin/integrations/test-smtp', { send, smtp: it.smtp }, { csrf });
      if (out.ok) {
        const v = out.data.verified;
        const parts = [`Соединение и авторизация: OK (${v.host}:${v.port})`];
        if (out.data.sent) parts.push(`письмо отправлено на ${(out.data.sent.accepted || []).join(', ') || out.data.sent.to}`);
        smtpResult.textContent = parts.join('; ');
      } else {
        smtpResult.style.color = '#E11D2E';
        smtpResult.textContent = `Ошибка: ${out.data?.error || out.status}`;
      }
    }
    panel.appendChild(
      card('Резервная почта SMTP', [
        el('div', { class: 'grid' }, [
          input('SMTP-хост', it.smtp.host, (v) => { it.smtp.host = v; markDirty('integrations'); }),
          input('Порт', it.smtp.port, (v) => { it.smtp.port = v; markDirty('integrations'); }),
          input('Логин', it.smtp.user, (v) => { it.smtp.user = v; markDirty('integrations'); }),
          input('Пароль', it.smtp.password, (v) => { it.smtp.password = v; markDirty('integrations'); }, { type: 'password' }),
          input('Получатель', it.smtp.to, (v) => { it.smtp.to = v; markDirty('integrations'); }),
        ]),
        el('div', { class: 'row' }, [
          el('button', { class: 'btn btn--sm', text: 'Проверить соединение', onClick: () => testSmtp(false) }),
          el('button', { class: 'btn btn--sm', text: 'Проверить и отправить письмо', onClick: () => testSmtp(true) }),
          smtpResult,
        ]),
      ]),
    );
    panel.appendChild(
      card('Яндекс.Метрика', [
        input('ID счётчика', it.metrika.id, (v) => { it.metrika.id = v; markDirty('integrations'); }),
      ]),
    );
  },

  async backups(panel) {
    const data = await getJson('/api/admin/backups');
    const status = el('span', { class: 'hint', text: backupFlash });
    backupFlash = '';
    const createBtn = el('button', { class: 'btn btn--sm btn--primary', text: 'Создать резервную копию' });
    createBtn.addEventListener('click', async () => {
      createBtn.disabled = true;
      status.style.color = '';
      status.textContent = 'Создаю резервную копию…';
      const out = await postJson('/api/admin/backups', {}, { csrf });
      if (out.ok) {
        backupFlash = `Готово: ${out.data.backup.name.replace(/\.pmbak$/, '')} (${fmtSize(out.data.backup.size)})`;
        render();
      } else {
        createBtn.disabled = false;
        status.style.color = '#E11D2E';
        status.textContent = `Ошибка: ${out.data?.error || out.status}`;
      }
    });

    panel.appendChild(
      card('Резервные копии', [
        el('p', {
          class: 'hint',
          text: 'Архив содержит все файлы приложения (сервер и рендеринг, админку, публичные файлы, контент, загрузки, .env) и базу данных. Не включаются только node_modules, data и сами бэкапы. Копия создаётся вручную и автоматически по расписанию — ежедневно в 03:15; хранятся последние 30.',
        }),
        el('div', { class: 'row' }, [createBtn, status]),
      ]),
    );

    const rows = (data.backups || []).map((b) => {
      const displayName = b.name.replace(/\.pmbak$/, '');
      const download = el('a', {
        class: 'btn btn--sm',
        href: `/api/admin/backups/${encodeURIComponent(b.name)}/download`,
        text: 'Скачать',
      });
      const restore = el('button', { class: 'btn btn--sm', text: 'Восстановить' });
      const del = el('button', { class: 'btn btn--sm btn--danger', text: 'Удалить' });

      restore.addEventListener('click', async () => {
        if (dirty.size && !confirm('Есть несохранённые изменения — они будут потеряны. Продолжить?')) return;
        if (!confirm(`Восстановить резервную копию ${b.name}?\n\nТекущие файлы сайта, контент и заявки будут заменены. Сайт перезапустится, потребуется снова войти.`)) return;
        restore.disabled = true;
        del.disabled = true;
        status.style.color = '';
        status.textContent = 'Восстанавливаю… не закрывайте страницу';
        const out = await postJson(`/api/admin/backups/${encodeURIComponent(b.name)}/restore`, {}, { csrf });
        if (out.ok) {
          status.textContent = `Восстановлено. Перезапуск… Предыдущее состояние сохранено как ${out.data.safety}`;
          setTimeout(() => location.assign('/admin/'), 8000);
        } else {
          restore.disabled = false;
          del.disabled = false;
          status.style.color = '#E11D2E';
          status.textContent = `Ошибка: ${out.data?.error || out.status}`;
        }
      });

      del.addEventListener('click', async () => {
        if (!confirm(`Удалить ${b.name}?`)) return;
        const res = await fetch(`/api/admin/backups/${encodeURIComponent(b.name)}`, {
          method: 'DELETE',
          headers: { 'x-csrf-token': csrf },
        });
        if (res.ok) {
          backupFlash = `Удалено: ${displayName}`;
          render();
        } else {
          const out = await res.json().catch(() => null);
          status.style.color = '#E11D2E';
          status.textContent = `Ошибка: ${out?.error || res.status}`;
        }
      });

      return el('tr', {}, [
        el('td', { text: displayName }),
        el('td', { text: new Date(b.createdAt).toLocaleString('ru-RU') }),
        el('td', { text: fmtSize(b.size) }),
        el('td', {}, [el('div', { class: 'row' }, [download, restore, del])]),
      ]);
    });

    panel.appendChild(
      card('Сохранённые копии', [
        rows.length
          ? el('table', {}, [
              el('thead', {}, [el('tr', {}, ['Файл', 'Дата', 'Размер', 'Действия'].map((h) => el('th', { text: h })))]),
              el('tbody', {}, rows),
            ])
          : el('p', { class: 'hint', text: 'Пока нет резервных копий.' }),
      ]),
    );
  },

  async leads(panel) {
    const data = await getJson('/api/admin/leads');
    panel.appendChild(
      card(`Заявки (${data.count})`, [
        el('p', { class: 'hint', text: 'Полные данные: контакты, источник трафика и ответы квиза.' }),
      ]),
    );
    (data.leads || []).forEach((lead) => panel.appendChild(leadCard(lead)));
  },

  async stats(panel) {
    const data = await getJson('/api/admin/stats');
    panel.appendChild(
      card('Сводка', [
        el('div', { class: 'grid' }, [
          el('div', { class: 'stat' }, [el('b', { text: String(data.leadsTotal) }), 'Всего заявок']),
          el('div', { class: 'stat' }, [el('b', { text: String(data.leadsToday) }), 'Заявок сегодня']),
        ]),
      ]),
    );
    panel.appendChild(
      card('События воронки', [
        el('table', {}, [
          el('thead', {}, [el('tr', {}, [el('th', { text: 'Событие' }), el('th', { text: 'Кол-во' })])]),
          el('tbody', {}, (data.funnel || []).map((r) => el('tr', {}, [el('td', { text: r.event_type }), el('td', { text: String(r.c) })]))),
        ]),
      ]),
    );
    panel.appendChild(
      card('Источники заявок', [
        el('table', {}, [
          el('thead', {}, [el('tr', {}, [el('th', { text: 'Источник' }), el('th', { text: 'Кол-во' })])]),
          el('tbody', {}, (data.bySource || []).map((r) => el('tr', {}, [el('td', { text: r.src }), el('td', { text: String(r.c) })]))),
        ]),
      ]),
    );
    panel.appendChild(
      card('Каналы связи', [
        el('table', {}, [
          el('thead', {}, [el('tr', {}, [el('th', { text: 'Канал' }), el('th', { text: 'Кол-во' })])]),
          el('tbody', {}, (data.byChannel || []).map((r) => el('tr', {}, [el('td', { text: r.ch }), el('td', { text: String(r.c) })]))),
        ]),
      ]),
    );
    const leadRows = (data.recentLeads || []).map((l) => {
      const cells = [l.id, l.ts, l.name, l.phone_mask, l.channel, l.utm_source, l.utm_campaign, l.utm_content, l.status];
      return el('tr', {}, cells.map((v) => el('td', { text: String(v ?? '') })));
    });
    panel.appendChild(
      card('Последние заявки', [
        el('table', {}, [
          el('thead', {}, [
            el('tr', {}, ['ID', 'Время', 'Имя', 'Телефон', 'Канал', 'Источник', 'Кампания', 'Баннер', 'Статус'].map((h) => el('th', { text: h }))),
          ]),
          el('tbody', {}, leadRows),
        ]),
      ]),
    );
  },
};

function leadCard(lead) {
  const details = el('div', { class: 'lead__details', hidden: 'hidden' });
  const toggleBtn = el('button', { class: 'btn btn--sm', text: 'Подробнее' });
  toggleBtn.addEventListener('click', () => {
    const opening = details.hasAttribute('hidden');
    if (opening) details.removeAttribute('hidden');
    else details.setAttribute('hidden', '');
    toggleBtn.textContent = opening ? 'Свернуть' : 'Подробнее';
  });

  const head = el('div', { class: 'lead__head' }, [
    el('strong', { text: `#${lead.id}` }),
    el('span', { class: 'badge', text: lead.status || '—' }),
    el('span', { text: lead.ts ? new Date(lead.ts).toLocaleString('ru-RU') : '' }),
    el('span', { text: lead.name || 'без имени' }),
    el('span', { text: lead.phone_mask || '' }),
    el('span', { class: 'badge', text: lead.channel || '—' }),
  ]);

  const rows = [
    ['Телефон (полный)', lead.phone_norm, 'reveal'],
    ['Источник (utm_source)', lead.utm_source || 'прямой заход'],
    ['Тип (utm_medium)', lead.utm_medium || '—'],
    ['Кампания (utm_campaign)', lead.utm_campaign || '—'],
    ['Объявление (utm_content)', lead.utm_content || '—'],
    ['Ключевая фраза (utm_term)', lead.utm_term || '—'],
    ['Click id', lead.click_id || '—'],
    ['Метрика ClientID', lead.ym_client_id || '—'],
    ['Session id', lead.session_id || '—'],
  ];
  rows.forEach(([label, value, kind]) => {
    if (kind === 'reveal') {
      const v = el('span', { text: '••••••••' });
      const b = el('button', { class: 'link', text: 'показать' });
      b.addEventListener('click', () => {
        v.textContent = lead.phone_norm || '—';
        b.remove();
      });
      details.appendChild(el('div', { class: 'lead__row' }, [el('span', { class: 'lead__label', text: label }), el('span', {}, [v, ' ', b])]));
      return;
    }
    details.appendChild(el('div', { class: 'lead__row' }, [el('span', { class: 'lead__label', text: label }), el('span', { text: value ?? '—' })]));
  });

  const answersBox = el('div', { class: 'lead__row' }, [el('span', { class: 'lead__label', text: 'Ответы квиза' })]);
  const ans = formatAnswers(lead.answers);
  if (!ans.length) answersBox.appendChild(el('span', { text: '—' }));
  else {
    const box = el('div', {});
    ans.forEach(({ q, a }) => box.appendChild(el('div', { class: 'lead__answer', text: `${q}: ${a}` })));
    answersBox.appendChild(box);
  }
  details.appendChild(answersBox);

  return el('div', { class: 'list-item' }, [el('div', { class: 'row row--between' }, [head, toggleBtn]), details]);
}

function formatAnswers(answers) {
  if (!answers || typeof answers !== 'object') return [];
  const qs = (C && C.quiz && C.quiz.questions) || [];
  return Object.entries(answers).map(([qid, val]) => {
    const q = qs.find((x) => x.id === qid);
    const one = (v) => q?.options?.find((o) => o.v === v)?.label || v;
    return {
      q: q?.title || qid,
      a: Array.isArray(val) ? val.map(one).join(', ') : one(val),
    };
  });
}

async function saveAll() {
  const status = $('#save-status');
  status.textContent = 'Сохраняем…';
  const keys = dirty.size ? [...dirty] : Object.keys(C);
  try {
    for (const key of keys) {
      const out = await putJson(`/api/admin/content/${key}`, C[key], { csrf });
      if (!out.ok) throw new Error(out.data?.error || `Ошибка сохранения ${key}`);
    }
    dirty.clear();
    status.textContent = `Сохранено ${new Date().toLocaleTimeString('ru-RU')}`;
  } catch (err) {
    status.textContent = `Ошибка: ${err.message}`;
  }
}

boot();
