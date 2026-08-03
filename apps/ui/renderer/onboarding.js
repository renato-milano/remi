/* Wizard di onboarding: step → schiusa → onboarding.complete(data). */
const bridge = window.onboarding || { platform: 'darwin', complete() {}, openPermission() {}, quit() {} };

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
  nextBtn.textContent = current === steps.length - 1 ? 'Inizia' : 'Avanti';
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
wireChips('trust');

// --- computer-use (opt-in) + permessi per-OS ---
const computerUseEl = document.getElementById('computerUse');
const cuPerms = document.getElementById('cuPerms');
function renderCuPerms() {
  if (!computerUseEl.checked) {
    cuPerms.classList.add('hidden');
    return;
  }
  cuPerms.classList.remove('hidden');
  const p = bridge.platform || 'darwin';
  if (p === 'darwin') {
    cuPerms.innerHTML = `
      <p class="perm-title">Concedi i permessi a “Remi”:</p>
      <button class="chip" data-perm="screen">Registrazione schermo…</button>
      <button class="chip" data-perm="accessibility">Accessibilità…</button>`;
  } else if (p === 'win32') {
    cuPerms.innerHTML = '<p class="perm-title">Su Windows non servono permessi speciali.</p>';
  } else {
    cuPerms.innerHTML = '<p class="perm-title">Su Linux è supportata solo la sessione X11 (non Wayland).</p>';
  }
}
computerUseEl.addEventListener('change', renderCuPerms);
cuPerms.addEventListener('click', (e) => {
  const b = e.target.closest('[data-perm]');
  if (b) bridge.openPermission(b.dataset.perm);
});

// --- provider (menu a tendina) ---
const PROVIDERS = {
  anthropic: { name: 'anthropic', key: 'sk-ant-…', model: 'claude-sonnet-4-5', help: 'https://console.anthropic.com/settings/keys', models: 'https://docs.anthropic.com/en/docs/about-claude/models', base: null, showBase: false },
  claudeSub: { name: 'anthropic', auth: 'claude-subscription', subscription: true, key: '', model: 'claude-sonnet-4-5', help: null, models: 'https://docs.anthropic.com/en/docs/about-claude/models', base: null, showBase: false },
  openai: { name: 'openai', key: 'sk-…', model: 'gpt-4o', help: 'https://platform.openai.com/api-keys', models: 'https://platform.openai.com/docs/models', base: null, showBase: false },
  openrouter: { name: 'openai-compatible', key: 'sk-or-…', model: 'anthropic/claude-3.5-sonnet', help: 'https://openrouter.ai/keys', models: 'https://openrouter.ai/models', base: 'https://openrouter.ai/api/v1', showBase: true },
  vercel: { name: 'openai-compatible', key: 'chiave Vercel AI Gateway', model: 'openai/gpt-4o', help: 'https://vercel.com/docs/ai-gateway', models: 'https://vercel.com/ai-gateway/models', base: 'https://ai-gateway.vercel.sh/v1', showBase: true },
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
const subBox = document.getElementById('subBox');
const subStatus = document.getElementById('subStatus');
const keyHint = document.getElementById('keyHint');

async function refreshSubStatus() {
  if (!bridge.claudeStatus) return;
  try {
    const s = await bridge.claudeStatus();
    subStatus.innerHTML = s?.loggedIn
      ? '✓ Claude Code è loggato — userò il tuo abbonamento.'
      : '✗ Claude Code non risulta loggato. Apri il terminale ed esegui <span class="mono">claude</span> (login) o <span class="mono">claude setup-token</span>.';
  } catch {
    subStatus.textContent = 'Non riesco a controllare il login di Claude Code.';
  }
}

function selectProvider(key) {
  provKey = key;
  const P = PROVIDERS[key];
  const sub = Boolean(P.subscription);
  apiKeyEl.placeholder = P.key;
  apiKeyEl.classList.toggle('hidden', sub);
  keyHint.classList.toggle('hidden', sub);
  subBox.classList.toggle('hidden', !sub);
  modelEl.value = P.model || '';
  baseURLEl.classList.toggle('hidden', !P.showBase);
  baseURLEl.value = P.base || '';
  toggleLink(provHelp, sub ? null : P.help);
  toggleLink(modelsLink, P.models);
  if (sub) refreshSubStatus();
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
  const name = document.getElementById('name').value.trim() || 'Remi';
  const tone = document.querySelector('#tones .chip.active')?.dataset.tone || 'curioso';
  const apiKey = apiKeyEl.value.trim();
  const heartbeatMinutes = Number(document.querySelector('#beat .chip.active')?.dataset.min) || 15;
  const autoApprove = document.querySelector('#trust .chip.active')?.dataset.trust || 'read';
  const P = PROVIDERS[provKey];
  const model = modelEl.value.trim() || P.model || 'claude-sonnet-4-5';
  const baseURL = P.showBase ? baseURLEl.value.trim() || P.base || undefined : P.base || undefined;
  const computerUse = computerUseEl.checked;
  const auth = P.auth === 'claude-subscription' ? 'claude-subscription' : 'api-key';
  return { name, tone, apiKey, heartbeatMinutes, autoApprove, computerUse, provider: { name: P.name, model, baseURL, auth } };
}

function hatch() {
  const data = collect();
  const overlay = document.getElementById('hatch');
  const text = overlay.querySelector('.hatch-text');
  overlay.classList.remove('hidden');
  setTimeout(() => {
    text.textContent = `Ciao, sono ${data.name}.`;
    text.classList.add('show');
  }, 400);
  setTimeout(() => bridge.complete(data), 1900);
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
