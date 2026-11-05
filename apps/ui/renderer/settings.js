/* Impostazioni: precompila dai valori correnti, salva → il main riavvia il daemon. */
const api = window.settings || { onData() {}, save() {}, close() {} };

const PROVIDERS = {
  anthropic: { name: 'anthropic', key: 'sk-ant-…', model: 'claude-sonnet-4-5', help: 'https://console.anthropic.com/settings/keys', models: 'https://docs.anthropic.com/en/docs/about-claude/models', base: null, showBase: false },
  claudeSub: { name: 'anthropic', auth: 'claude-subscription', subscription: true, key: '', model: 'claude-sonnet-4-5', help: null, models: 'https://docs.anthropic.com/en/docs/about-claude/models', base: null, showBase: false },
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
const subBox = document.getElementById('subBox');
const subStatus = document.getElementById('subStatus');
let provKey = 'anthropic';

function toggleLink(el, href) {
  if (href) {
    el.href = href;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}
async function refreshSubStatus() {
  if (!api.claudeStatus) return;
  try {
    const s = await api.claudeStatus();
    subStatus.innerHTML = s?.loggedIn
      ? '✓ Claude Code è loggato — userò il tuo abbonamento.'
      : '✗ Claude Code non risulta loggato. Esegui <span class="mono">claude</span> (login) o <span class="mono">claude setup-token</span>.';
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
  subBox.classList.toggle('hidden', !sub);
  modelEl.value = P.model || '';
  baseURLEl.classList.toggle('hidden', !P.showBase);
  baseURLEl.value = P.base || '';
  toggleLink(provHelp, sub ? null : P.help);
  toggleLink(modelsLink, P.models);
  if (sub) refreshSubStatus();
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

// --- computer-use: toggle + permessi per-OS ---
const computerUseEl = document.getElementById('computerUse');
const cuPerms = document.getElementById('cuPerms');
const platform = api.platform || 'darwin';

function renderPerms() {
  if (!computerUseEl.checked) {
    cuPerms.classList.add('hidden');
    return;
  }
  cuPerms.classList.remove('hidden');
  if (platform === 'darwin') {
    cuPerms.innerHTML = `
      <p class="perm-title">Concedi i permessi macOS a “Remi”:</p>
      <button class="btn ghost small" data-perm="screen">Registrazione schermo…</button>
      <button class="btn ghost small" data-perm="accessibility">Accessibilità…</button>
      <p class="note">Dopo averli concessi potrebbe servire riavviare Remi.</p>`;
  } else if (platform === 'win32') {
    cuPerms.innerHTML = '<p class="note">Su Windows non servono permessi speciali. Alcuni antivirus potrebbero segnalare l’input automatico.</p>';
  } else {
    cuPerms.innerHTML = '<p class="note">Su Linux è supportata solo la sessione X11 (non Wayland).</p>';
  }
}
computerUseEl.addEventListener('change', renderPerms);
cuPerms.addEventListener('click', (e) => {
  const b = e.target.closest('[data-perm]');
  if (b) api.openPermission(b.dataset.perm);
});

function configToPreset(pv) {
  if (!pv) return 'anthropic';
  if (pv.auth === 'claude-subscription') return 'claudeSub';
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
  computerUseEl.checked = Boolean(config.computerUse?.enabled);
  document.getElementById('browserEnabled').checked = Boolean(config.browser?.enabled);
  document.getElementById('browserMode').value = config.browser?.mode || 'auto';
  document.getElementById('voiceEnabled').checked = Boolean(config.voice?.enabled);
  document.getElementById('voiceTts').value = config.voice?.tts === 'cloud' ? 'auto' : config.voice?.tts || 'auto';
  document.getElementById('wakeWord').checked = Boolean(config.voice?.wakeWord);
  renderPerms();
  void showVoiceStatus();
});

function collect() {
  const P = PROVIDERS[provKey];
  const model = modelEl.value.trim() || P.model || 'claude-sonnet-4-5';
  const baseURL = P.showBase ? baseURLEl.value.trim() || P.base || undefined : P.base || undefined;
  const autoApprove = document.querySelector('#trust .chip.active')?.dataset.trust || 'read';
  const heartbeatMinutes = Number(document.querySelector('#beat .chip.active')?.dataset.min) || 15;
  const auth = P.auth === 'claude-subscription' ? 'claude-subscription' : 'api-key';
  return {
    provider: { name: P.name, model, baseURL, auth },
    autoApprove,
    heartbeatMinutes,
    computerUse: computerUseEl.checked,
    browser: document.getElementById('browserEnabled').checked,
    browserMode: document.getElementById('browserMode').value,
    voice: document.getElementById('voiceEnabled').checked,
    voiceTts: document.getElementById('voiceTts').value,
    wakeWord: document.getElementById('wakeWord').checked,
    apiKey: apiKeyEl.value.trim(), // vuoto = non cambiare
  };
}

/** Stato della voce dal daemon: modello pronto, in download o trascrizione cloud. */
async function showVoiceStatus() {
  const el = document.getElementById('voiceStatus');
  try {
    const { voice } = await (await fetch(`${api.daemonUrl}/status`)).json();
    if (!voice?.enabled) {
      el.textContent = '';
    } else if (voice.downloading !== undefined) {
      el.textContent = `Scarico il modello vocale… ${Math.round(voice.downloading * 100)}%`;
      setTimeout(showVoiceStatus, 1500);
    } else if (voice.error) {
      el.textContent = `⚠️ ${voice.error}`;
    } else {
      el.textContent =
        voice.stt === 'local'
          ? '✓ Trascrizione locale pronta.'
          : voice.stt === 'cloud'
            ? 'Trascrizione via cloud (whisper locale non disponibile).'
            : '⚠️ Trascrizione non disponibile.';
    }
  } catch {
    el.textContent = '';
  }
}

document.getElementById('save').addEventListener('click', () => api.save(collect()));
document.getElementById('cancel').addEventListener('click', () => api.close());
