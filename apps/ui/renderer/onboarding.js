/* Wizard di onboarding: 4 step → schiusa → onboarding.complete(data). */
const bridge = window.onboarding || { complete() {}, quit() {} };

const steps = [...document.querySelectorAll('.step')];
const dotsEl = document.getElementById('dots');
const backBtn = document.getElementById('back');
const nextBtn = document.getElementById('next');
let current = 0;

// dots
steps.forEach(() => {
  const i = document.createElement('i');
  dotsEl.appendChild(i);
});
const dots = [...dotsEl.children];

function render() {
  steps.forEach((s, i) => s.classList.toggle('active', i === current));
  dots.forEach((d, i) => d.classList.toggle('on', i === current));
  backBtn.disabled = current === 0;
  nextBtn.textContent = current === steps.length - 1 ? 'Schiudi 🥚' : 'Avanti';
  const focusable = steps[current].querySelector('input');
  if (focusable) setTimeout(() => focusable.focus(), 60);
}

// selezione chip (tono, heartbeat)
function wireChips(containerId) {
  const c = document.getElementById(containerId);
  c.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    for (const b of c.querySelectorAll('.chip')) b.classList.remove('active');
    chip.classList.add('active');
  });
}
wireChips('tones');
wireChips('beat');

// --- provider (menu a tendina) ---
const PROVIDERS = {
  anthropic: { name: 'anthropic', key: 'sk-ant-…', model: 'claude-sonnet-4-5', help: 'https://console.anthropic.com/settings/keys', models: 'https://docs.anthropic.com/en/docs/about-claude/models', base: null, showBase: false },
  openai: { name: 'openai', key: 'sk-…', model: 'gpt-4o', help: 'https://platform.openai.com/api-keys', models: 'https://platform.openai.com/docs/models', base: null, showBase: false },
  openrouter: { name: 'openai-compatible', key: 'sk-or-…', model: 'anthropic/claude-3.5-sonnet', help: 'https://openrouter.ai/keys', models: 'https://openrouter.ai/models', base: 'https://openrouter.ai/api/v1', showBase: true },
  vercel: { name: 'openai-compatible', key: 'chiave Vercel AI Gateway', model: 'anthropic/claude-3.5-sonnet', help: 'https://vercel.com/docs/ai-gateway', models: 'https://vercel.com/ai-gateway/models', base: 'https://ai-gateway.vercel.sh/v1', showBase: true },
  ollama: { name: 'openai-compatible', key: '(nessuna chiave)', model: 'llama3.2', help: null, models: 'https://ollama.com/library', base: 'http://localhost:11434/v1', showBase: true },
  custom: { name: 'openai-compatible', key: 'chiave API', model: '', help: null, models: null, base: '', showBase: true },
};
let provKey = 'anthropic';
const providerEl = document.getElementById('provider');
const apiKeyEl = document.getElementById('apiKey');
const baseURLEl = document.getElementById('baseURL');
const modelEl = document.getElementById('model');
const provHelp = document.getElementById('provHelp');
const modelsLink = document.getElementById('modelsLink');

function selectProvider(key) {
  provKey = key;
  const P = PROVIDERS[key];
  apiKeyEl.placeholder = P.key;
  modelEl.value = P.model || '';
  baseURLEl.classList.toggle('hidden', !P.showBase);
  baseURLEl.value = P.base || '';
  toggleLink(provHelp, P.help);
  toggleLink(modelsLink, P.models);
}
function toggleLink(el, href) {
  if (href) {
    el.href = href;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}
providerEl.addEventListener('change', (e) => selectProvider(e.target.value));
selectProvider('anthropic');

function collect() {
  const name = document.getElementById('name').value.trim() || 'OpenMate';
  const tone = document.querySelector('#tones .chip.active')?.dataset.tone || 'curioso';
  const apiKey = apiKeyEl.value.trim();
  const heartbeatMinutes = Number(document.querySelector('#beat .chip.active')?.dataset.min) || 15;
  const P = PROVIDERS[provKey];
  const model = modelEl.value.trim() || P.model || 'claude-sonnet-4-5';
  const baseURL = P.showBase ? baseURLEl.value.trim() || P.base || undefined : P.base || undefined;
  return { name, tone, apiKey, heartbeatMinutes, provider: { name: P.name, model, baseURL } };
}

function hatch() {
  const data = collect();
  const overlay = document.getElementById('hatch');
  const egg = overlay.querySelector('.hatch-egg');
  const bot = overlay.querySelector('.hatch-bot');
  const text = overlay.querySelector('.hatch-text');
  overlay.classList.remove('hidden');
  setTimeout(() => {
    egg.classList.add('hidden');
    bot.classList.remove('hidden');
    text.textContent = `Ciao, sono ${data.name}!`;
  }, 1100);
  setTimeout(() => bridge.complete(data), 2100);
}

nextBtn.addEventListener('click', () => {
  if (current === steps.length - 1) hatch();
  else {
    current += 1;
    render();
  }
});
backBtn.addEventListener('click', () => {
  if (current > 0) {
    current -= 1;
    render();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') nextBtn.click();
});

render();
