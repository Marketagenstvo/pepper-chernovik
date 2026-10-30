// Модальная форма «Заказать звонок»: имя + телефон → лид в Bitrix24.

import { getJson, postJson } from './api.js';
import { createPhoneField, maskTotalDigits } from './phone.js';
import { track } from './track.js';

async function recaptchaToken(ctx) {
  const rc = ctx.recaptcha;
  if (!rc?.enabled || !rc.siteKey) return null;
  const g = window.grecaptcha;
  if (!g) return null;
  try {
    if (rc.version === 'v3') {
      await new Promise((res) => g.ready(res));
      return await g.execute(rc.siteKey, { action: 'callback' });
    }
    return g.getResponse() || null;
  } catch {
    return null;
  }
}

export function initCallback(ctx = {}) {
  const modal = document.getElementById('callback-modal');
  if (!modal) return;
  const form = document.getElementById('callback-form');
  const body = document.getElementById('callback-body');
  const success = document.getElementById('callback-success');
  const nameInput = document.getElementById('callback-name');
  const phoneInput = document.getElementById('callback-phone');
  const consentInput = document.getElementById('callback-consent');
  const errorEl = document.getElementById('callback-error');
  const submitBtn = document.getElementById('callback-submit');
  const quiz = ctx.quiz || {};
  const startedAt = Date.now();
  let submitted = false;
  let lastFocus = null;

  const phoneField = phoneInput ? createPhoneField(phoneInput, quiz, () => {}) : null;

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  function clearError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }
  function resetForm() {
    form.reset();
    if (phoneInput) phoneInput.value = '';
    phoneField?.render();
    nameInput?.classList.remove('invalid');
    phoneInput?.classList.remove('invalid');
    consentInput?.classList.remove('invalid');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Отправить';
    body.hidden = false;
    success.hidden = true;
    clearError();
  }
  function open(e) {
    e?.preventDefault();
    lastFocus = document.activeElement;
    if (submitted) {
      submitted = false;
      resetForm();
    }
    clearError();
    modal.hidden = false;
    document.body.classList.add('modal-open');
    setTimeout(() => nameInput?.focus(), 30);
  }
  function close() {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    lastFocus?.focus?.();
  }

  document.querySelectorAll('[data-callback-open], #header-call').forEach((b) => b.addEventListener('click', open));
  modal.querySelectorAll('[data-callback-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const name = (nameInput?.value || '').trim();
    const phoneDigits = phoneField ? phoneField.digits() : '';
    const expected = phoneField ? maskTotalDigits(phoneField.mask()) : 11;
    const consent = consentInput?.checked === true;

    const problems = [];
    if (name.length < 2) {
      nameInput?.classList.add('invalid');
      problems.push('Укажите имя');
    }
    if (phoneDigits.length !== expected) {
      phoneInput?.classList.add('invalid');
      problems.push('Укажите телефон полностью');
    }
    if (!consent) problems.push('Подтвердите согласие на обработку персональных данных');
    if (problems.length) {
      showError(problems.join('. '));
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем…';
    try {
      const [rcToken, tokenRes] = await Promise.all([recaptchaToken(ctx), getJson('/api/antispam-token')]);
      const out = await postJson('/api/callback', {
        name,
        phone: phoneDigits,
        consent,
        antispam: { token: tokenRes.token, hp: '', elapsedMs: Date.now() - startedAt },
        recaptchaToken: rcToken || undefined,
        sessionId: ctx.traffic?.sessionId,
        clickId: ctx.traffic?.clickId,
        utm: ctx.traffic?.utm,
        device: ctx.device,
        page: location.pathname,
        ymClientId: ctx.ymClientId || undefined,
      });
      if (!out.ok || !out.data?.ok) {
        const msg =
          out.data?.error ||
          (out.data?.errors
            ? Object.values(out.data.errors).join('. ')
            : 'Не удалось отправить. Попробуйте ещё раз.');
        throw new Error(msg);
      }
      submitted = true;
      track('lead_submitted', { form: 'callback' });
      body.hidden = true;
      success.hidden = false;
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Отправить';
      showError(err.message);
    }
  });
}
