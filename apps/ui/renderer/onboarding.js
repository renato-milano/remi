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

function collect() {
  const name = document.getElementById('name').value.trim() || 'OpenMate';
  const tone = document.querySelector('#tones .chip.active')?.dataset.tone || 'curioso';
  const apiKey = document.getElementById('apiKey').value.trim();
  const heartbeatMinutes = Number(document.querySelector('#beat .chip.active')?.dataset.min) || 15;
  return { name, tone, apiKey, heartbeatMinutes };
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
