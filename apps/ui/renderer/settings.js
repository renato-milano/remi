/* Impostazioni: precompila dai valori correnti, salva → il main riavvia il daemon. */
const api = window.settings || { onData() {}, save() {}, close() {} };

const PROVIDERS = {
  anthropic: { name: 'anthropic', key: 'sk-ant-…', model: 'claude-sonnet-4-5', help: 'https://console.anthropic.com/settings/keys', models: 'https://docs.anthropic.com/en/docs/about-claude/models', base: null, showBase: false },
  openai: { name: 'openai', key: 'sk-…', model: 'gpt-4o', help: 'https://platform.openai.com/api-keys', models: 'https://platform.openai.com/docs/models', base: null, showBase: false },
  openrouter: { name: 'openai-compatible', key: 'sk-or-…', model: 'anthropic/claude-3.5-sonnet', help: 'https://openrouter.ai/keys', models: 'https://openrouter.ai/models', base: 'https://openrouter.ai/api/v1', showBase: true },
  vercel: { name: 'openai-compatible', key: 'chiave Vercel AI Gateway', model: 'openai/gpt-4o', help: 'https://vercel.com/docs/ai-gateway', models: 'https://vercel.com/ai-gateway/models', base: 'https://ai-gateway.vercel.sh/v1', showBase: true },
  ollama: { name: 'openai-compatible', key: '(nessuna chiave)', model: 'llama3.2', help: null, models: 'https://ollama.com/library', base: 'http://localhost:11434/v1', showBase: true },
  custom: { name: 'openai-compatible', key: 'chiave API', model: '', help: null, models: null, base: '', showBase: true },
};

const providerEl = document.getElementById('provider');
const apiKeyEl = document.getElementById('apiKey');
const baseURLEl = document.getElementById('baseURL');
const modelEl = document.getElementById('model');
const provHelp = document.getElementById('provHelp');
const modelsLink = document.getElementById('modelsLink');
let provKey = 'anthropic';

function toggleLink(el, href) {
  if (href) {
    el.href = href;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}
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
providerEl.addEventListener('change', (e) => selectProvider(e.target.value));

function wireChips(id) {
  const c = document.getElementById(id);
  c.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    for (const b of c.querySelectorAll('.chip')) b.classList.remove('active');
    chip.classList.add('active');
  });
}
wireChips('trust');
wireChips('beat');

function setChip(id, attr, value) {
  const c = document.getElementById(id);
  let found = false;
  for (const b of c.querySelectorAll('.chip')) {
    const on = b.dataset[attr] === value;
    b.classList.toggle('active', on);
    if (on) found = true;
  }
  if (!found) c.querySelector('.chip')?.classList.add('active');
}

function configToPreset(pv) {
  if (!pv) return 'anthropic';
  if (pv.name === 'anthropic') return 'anthropic';
  if (pv.name === 'openai') return 'openai';
  const b = pv.baseURL || '';
  if (b.includes('openrouter.ai')) return 'openrouter';
  if (b.includes('vercel.sh')) return 'vercel';
  if (b.includes('11434')) return 'ollama';
  return 'custom';
}

api.onData(({ config, hasKey }) => {
  const pv = config.provider || {};
  const preset = configToPreset(pv);
  providerEl.value = preset;
  selectProvider(preset);
  if (pv.model) modelEl.value = pv.model;
  if (pv.baseURL) baseURLEl.value = pv.baseURL;
  if (hasKey) apiKeyEl.placeholder = '•••••••• (lascia vuoto per non cambiare)';
  setChip('trust', 'trust', config.autonomy?.autoApprove || 'read');
  const min = Math.round((config.heartbeat?.intervalMs || 900000) / 60000);
  setChip('beat', 'min', min >= 1000 ? '100000' : String(min));
});

function collect() {
  const P = PROVIDERS[provKey];
  const model = modelEl.value.trim() || P.model || 'claude-sonnet-4-5';
  const baseURL = P.showBase ? baseURLEl.value.trim() || P.base || undefined : P.base || undefined;
  const autoApprove = document.querySelector('#trust .chip.active')?.dataset.trust || 'read';
  const heartbeatMinutes = Number(document.querySelector('#beat .chip.active')?.dataset.min) || 15;
  return {
    provider: { name: P.name, model, baseURL },
    autoApprove,
    heartbeatMinutes,
    apiKey: apiKeyEl.value.trim(), // vuoto = non cambiare
  };
}

document.getElementById('save').addEventListener('click', () => api.save(collect()));
document.getElementById('cancel').addEventListener('click', () => api.close());
