// Квиз: шаги без перезагрузки, валидация на каждом шаге,
// временное хранение ответов в sessionStorage до финальной отправки (ТЗ, этап 3).

import { postJson, getJson } from './api.js';
import { track } from './track.js';
import { createPhoneField, maskTotalDigits } from './phone.js';

export function initQuiz(root, quiz, ctx = {}) {
  if (!root) return null;
  const prefix = root.dataset.prefix || root.id;
  const steps = Array.from(root.querySelectorAll('.quiz-step'));
  const questions = quiz.questions || [];
  const contactIndex = steps.length - 1;
  const total = questions.length;

  const countEl = document.getElementById(`${prefix}-count`);
  const progressEl = document.getElementById(`${prefix}-progress`);
  const backBtn = document.getElementById(`${prefix}-back`);
  const nextBtn = document.getElementById(`${prefix}-next`);
  const navEl = document.getElementById(`${prefix}-nav`);
  const bodyEl = document.getElementById(`${prefix}-body`);
  const errorEl = document.getElementById(`${prefix}-error`);
  const nameInput = document.getElementById(`${prefix}-name`);
  const phoneInput = document.getElementById(`${prefix}-phone`);
  const consentInput = document.getElementById(`${prefix}-consent`);
  const storageKey = `pm.quiz.${prefix}`;
  const startedAt = Date.now();

  const state = loadState() || { step: 0, answers: {}, name: '', phone: '' };
  state.answers = state.answers || {};
  if (!Number.isInteger(state.step) || state.step < 0 || state.step > contactIndex) state.step = 0;

  let quizStarted = false;
  let completedTracked = false;

  if (nameInput) {
    nameInput.value = state.name || '';
    nameInput.addEventListener('input', () => {
      state.name = nameInput.value;
      nameInput.classList.remove('invalid');
      persist();
    });
  }
  let phoneField = null;
  if (phoneInput) {
    phoneInput.value = state.phone || '';
    phoneField = createPhoneField(phoneInput, quiz, () => {
      phoneInput.classList.remove('invalid');
    });
    phoneInput.addEventListener('input', () => {
      state.phone = phoneInput.value;
      persist();
    });
  }
  consentInput?.addEventListener('change', () => clearError());

  steps.forEach((stepEl) => {
    const qid = stepEl.dataset.qid;
    const question = questions.find((q) => q.id === qid);
    if (!question) return;
    stepEl.querySelectorAll('.opt').forEach((btn) => {
      btn.addEventListener('click', () => onOptionClick(question, btn, stepEl));
    });
  });

  backBtn?.addEventListener('click', () => {
    if (state.step > 0) {
      state.step -= 1;
      persist();
      render();
    }
  });
  nextBtn?.addEventListener('click', () => {
    if (state.step >= contactIndex) submit();
    else if (isAnswered(state.step)) {
      state.step += 1;
      persist();
      render();
      if (state.step === contactIndex) onFinalScreen();
    }
  });

  render();
  return { render, reset };

  /* ---------- helpers ---------- */

  function questionAt(index) {
    return questions[index];
  }

  function isAnswered(index) {
    const q = questionAt(index);
    if (!q) return true;
    const a = state.answers[q.id];
    return q.multi ? Array.isArray(a) && a.length > 0 : a !== undefined && a !== null && a !== '';
  }

  function onOptionClick(question, btn, stepEl) {
    const value = btn.dataset.value;
    if (question.multi) {
      const arr = Array.isArray(state.answers[question.id]) ? [...state.answers[question.id]] : [];
      const i = arr.indexOf(value);
      if (i >= 0) arr.splice(i, 1);
      else {
        if (question.max && arr.length >= question.max) return;
        arr.push(value);
      }
      state.answers[question.id] = arr;
      btn.classList.toggle('selected', i < 0);
      btn.setAttribute('aria-pressed', String(i < 0));
    } else {
      state.answers[question.id] = value;
      stepEl.querySelectorAll('.opt').forEach((x) => {
        x.classList.remove('selected');
        x.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('selected');
      btn.setAttribute('aria-pressed', 'true');
    }
    if (!quizStarted) {
      quizStarted = true;
      track('quiz_start');
      ymGoal('quiz_start');
    }
    persist();
    updateNav();
  }

  function render() {
    steps.forEach((el, i) => {
      el.hidden = i !== state.step;
    });
    const q = questionAt(state.step);
    if (q) {
      const stepEl = steps[state.step];
      stepEl.querySelectorAll('.opt').forEach((btn) => {
        const a = state.answers[q.id];
        const selected = q.multi ? Array.isArray(a) && a.includes(btn.dataset.value) : a === btn.dataset.value;
        btn.classList.toggle('selected', selected);
        btn.setAttribute('aria-pressed', String(selected));
      });
    }
    updateProgress();
    updateNav();
    if (state.step === contactIndex) onFinalScreen();
  }

  function updateProgress() {
    if (!countEl || !progressEl) return;
    if (state.step >= contactIndex) {
      countEl.innerHTML = 'Заявка';
      progressEl.style.width = '100%';
    } else {
      countEl.innerHTML = `Шаг <b>${state.step + 1} из ${total}</b>`;
      progressEl.style.width = `${Math.round(((state.step + 1) / total) * 100)}%`;
    }
  }

  function updateNav() {
    if (backBtn) backBtn.style.visibility = state.step > 0 ? 'visible' : 'hidden';
    if (!nextBtn) return;
    if (state.step >= contactIndex) {
      nextBtn.textContent = 'Оставить заявку';
      nextBtn.disabled = false;
    } else {
      nextBtn.textContent = 'Далее';
      nextBtn.disabled = !isAnswered(state.step);
    }
  }

  function onFinalScreen() {
    if (completedTracked) return;
    completedTracked = true;
    track('quiz_complete', { answers: state.answers });
    ymGoal('quiz_complete');
  }

  function persist() {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ step: state.step, answers: state.answers, name: state.name, phone: state.phone }),
      );
    } catch {
      /* storage unavailable */
    }
  }

  function loadState() {
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearState() {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* storage unavailable */
    }
  }

  function showError(text) {
    if (!errorEl) return;
    errorEl.hidden = false;
    errorEl.textContent = text;
  }

  function clearError() {
    if (!errorEl) return;
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  function ymGoal(goal) {
    if (typeof window.ym === 'function' && ctx.metrikaId) {
      try {
        window.ym(ctx.metrikaId, 'reachGoal', goal);
      } catch {
        /* metrika unavailable */
      }
    }
  }

  async function recaptchaToken() {
    const rc = ctx.recaptcha;
    if (!rc?.enabled || !rc.siteKey) return null;
    if (rc.version === 'v3') {
      if (typeof window.grecaptcha === 'undefined') return null;
      return new Promise((resolve) => {
        window.grecaptcha.ready(async () => {
          try {
            resolve(await window.grecaptcha.execute(rc.siteKey, { action: 'lead' }));
          } catch {
            resolve(null);
          }
        });
      });
    }
    if (typeof window.grecaptcha === 'undefined') return null;
    const slot = document.getElementById(`${prefix}-recaptcha`);
    if (slot && !slot.dataset.widgetId) {
      slot.dataset.widgetId = String(window.grecaptcha.render(slot, { siteKey: rc.siteKey }));
    }
    return window.grecaptcha.getResponse(Number(slot?.dataset.widgetId)) || null;
  }

  async function submit() {
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

    nextBtn.disabled = true;
    nextBtn.textContent = 'Отправляем…';

    try {
      const rcToken = await recaptchaToken();
      const { token } = await getJson('/api/antispam-token');
      const out = await postJson('/api/lead', {
        name,
        phone: phoneDigits,
        answers: state.answers,
        consent,
        channel: quiz.channelQuestion ? state.answers[quiz.channelQuestion] : undefined,
        antispam: { token, hp: '', elapsedMs: Date.now() - startedAt },
        recaptchaToken: rcToken || undefined,
        sessionId: ctx.traffic?.sessionId,
        clickId: ctx.traffic?.clickId,
        utm: ctx.traffic?.utm,
        device: ctx.device,
        page: 'home',
        ymClientId: ctx.ymClientId || undefined,
      });

      if (!out.ok || !out.data?.ok) {
        const msg =
          out.data?.error ||
          (out.data?.errors ? Object.values(out.data.errors).join('. ') : 'Не удалось отправить заявку. Попробуйте ещё раз.');
        throw new Error(msg);
      }

      onSuccess();
    } catch (err) {
      nextBtn.disabled = false;
      nextBtn.textContent = 'Оставить заявку';
      showError(err.message);
    }
  }

  function onSuccess() {
    clearState();
    track('lead_submitted', { channel: quiz.channelQuestion ? state.answers[quiz.channelQuestion] : null });
    ymGoal('lead');
    if (bodyEl) {
      bodyEl.innerHTML =
        '<div class="quiz-success"><span class="success-check"><svg><use href="#i-check"/></svg></span>' +
        '<h3>Спасибо!</h3><p>Менеджер свяжется с вами в течение 10 минут и подберёт варианты.</p>' +
        `<button class="btn btn-ghost" type="button" id="${prefix}-restart">Начать заново</button></div>`;
      document.getElementById(`${prefix}-restart`)?.addEventListener('click', reset);
    }
    if (navEl) navEl.style.display = 'none';
    if (countEl) countEl.innerHTML = 'Готово';
    if (progressEl) progressEl.style.width = '100%';
  }

  function reset() {
    state.step = 0;
    state.answers = {};
    state.name = '';
    state.phone = '';
    quizStarted = false;
    completedTracked = false;
    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
    if (phoneField) phoneField.render();
    if (consentInput) consentInput.checked = false;
    if (navEl) navEl.style.display = '';
    clearState();
    window.location.reload();
  }
}
