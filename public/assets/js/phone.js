// Маска и валидация телефона. Формат подбирается по гео, не хардкодится.

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function maskLength(mask) {
  return (String(mask).match(/9/g) || []).length;
}

export function maskTotalDigits(mask) {
  return (String(mask).match(/\d/g) || []).length;
}

export function literalPrefix(mask) {
  const before = String(mask).split('9')[0];
  return (before.match(/\d/g) || []).join('');
}

export function extractDigits(value, mask) {
  let d = digitsOnly(value);
  const prefix = literalPrefix(mask);
  if (prefix && d.startsWith(prefix)) d = d.slice(prefix.length);
  return d;
}

export function formatPhone(digits, mask) {
  const d = String(digits || '');
  let out = '';
  let i = 0;
  for (const ch of String(mask)) {
    if (ch === '9') {
      if (i >= d.length) break;
      out += d[i++];
    } else {
      out += ch;
    }
  }
  return out;
}

export function phoneCountry(digits, fallback = 'RU') {
  const d = digitsOnly(digits);
  if (d.startsWith('375')) return 'BY';
  if (d.startsWith('380')) return 'UA';
  if (d.startsWith('7')) return 'RU';
  return fallback;
}

export function resolveMask(quiz, forcedCountry) {
  const country = forcedCountry || quiz.defaultCountry || 'RU';
  const masks = quiz.geoMasks || {};
  return masks[country] || masks.default || '+7 (999) 999-99-99';
}

export function isComplete(userDigits, mask) {
  return String(userDigits || '').length === maskLength(mask);
}

export function createPhoneField(input, quiz, onValidity) {
  const state = { country: quiz.defaultCountry || 'RU' };
  state.mask = resolveMask(quiz, state.country);

  const render = () => {
    const userDigits = extractDigits(input.value, state.mask);
    input.value = formatPhone(userDigits, state.mask);
    const complete = isComplete(userDigits, state.mask);
    const tooShort = userDigits.length > 0 && !complete;
    onValidity({ valid: complete, tooShort, digits: digitsOnly(input.value), mask: state.mask });
  };

  input.addEventListener('input', render);
  input.addEventListener('blur', render);
  render();

  return {
    setCountry(country) {
      state.country = country;
      state.mask = resolveMask(quiz, country);
      render();
    },
    digits: () => digitsOnly(input.value),
    mask: () => state.mask,
    render,
  };
}
