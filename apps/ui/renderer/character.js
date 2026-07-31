/**
 * Personaggio: robot-testa con grande faccia-schermo nero, bordo sottile,
 * occhi + bocca come glifi cyan luminosi che cambiano espressione per stato.
 * Contratto Character: setState(status), flash(expr, ms). Slot Rive = drop-in.
 */
function createSvgCharacter(mount) {
  mount.innerHTML = `
  <svg viewBox="0 0 200 200" id="creatureRoot" data-state="idle" data-tint="cyan">
    <defs>
      <linearGradient id="head-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2b3037"/><stop offset="1" stop-color="#0c0f13"/>
      </linearGradient>
      <linearGradient id="ear-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#31363d"/><stop offset="1" stop-color="#12161b"/>
      </linearGradient>
      <radialGradient id="screen-g" cx="0.5" cy="0.3" r="0.95">
        <stop offset="0" stop-color="#17212f"/><stop offset="1" stop-color="#04070c"/>
      </radialGradient>
      <linearGradient id="rim-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.32"/>
        <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.08"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.03"/>
      </linearGradient>
      <!-- effetto catodico (CRT) -->
      <clipPath id="screen-clip">
        <rect x="35" y="45" width="130" height="110" rx="28"/>
      </clipPath>
      <pattern id="scanlines" width="3" height="3" patternUnits="userSpaceOnUse">
        <rect y="0" width="3" height="1.3" fill="#000" opacity="0.28"/>
      </pattern>
      <radialGradient id="crt-vignette" cx="0.5" cy="0.45" r="0.72">
        <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity="0.5"/>
      </radialGradient>
    </defs>

    <ellipse id="shadow" cx="100" cy="178" rx="62" ry="8" fill="#000" opacity="0.22"></ellipse>

    <g id="bob">
      <!-- orecchie / nubs -->
      <rect x="18" y="92" width="12" height="34" rx="6" fill="url(#ear-g)"/>
      <rect x="170" y="92" width="12" height="34" rx="6" fill="url(#ear-g)"/>
      <!-- testa -->
      <rect x="28" y="38" width="144" height="124" rx="34" fill="url(#head-g)"/>
      <!-- rim-light: riflesso chiaro sul bordo della scocca -->
      <rect x="28.8" y="38.8" width="142.4" height="122.4" rx="33.4" fill="none" stroke="url(#rim-g)" stroke-width="1.6"/>
      <!-- schermo (ampio) -->
      <rect x="35" y="45" width="130" height="110" rx="28" fill="url(#screen-g)"/>
      <!-- bevel: ombra interna scura + sottile filo chiaro attorno allo schermo -->
      <rect x="35" y="45" width="130" height="110" rx="28" fill="none" stroke="#000" stroke-width="2.5" opacity="1"/>
      <rect x="33.4" y="43.4" width="133.2" height="113.2" rx="29.4" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1"/>
      <path d="M43 52 L84 52 L56 92 L43 92 Z" fill="#ffffff" opacity="0.05"/>

      <g id="screenEyes">
        <g class="expr" data-expr="neutral">
          <rect class="glyph" x="70" y="74" width="16" height="32" rx="8"/>
          <rect class="glyph" x="114" y="74" width="16" height="32" rx="8"/>
        </g>
        <g class="expr" data-expr="blink">
          <rect class="glyph" x="68" y="86" width="20" height="7" rx="3.5"/>
          <rect class="glyph" x="112" y="86" width="20" height="7" rx="3.5"/>
        </g>
        <g class="expr" data-expr="happy">
          <path class="arc" d="M67 96 Q78 78 89 96"/>
          <path class="arc" d="M111 96 Q122 78 133 96"/>
        </g>
        <g class="expr" data-expr="thinking">
          <rect class="glyph" x="70" y="78" width="16" height="18" rx="8"/>
          <rect class="glyph" x="114" y="78" width="16" height="18" rx="8"/>
          <g class="think-dots" transform="translate(126,60)">
            <circle class="glyph td" cx="0" cy="0" r="3.2"/>
            <circle class="glyph td td2" cx="9" cy="0" r="3.2"/>
            <circle class="glyph td td3" cx="18" cy="0" r="3.2"/>
          </g>
        </g>
        <g class="expr" data-expr="focused">
          <path class="glyph tw" transform="translate(78,90)" d="M0 -13 L3.4 -3.4 L13 0 L3.4 3.4 L0 13 L-3.4 3.4 L-13 0 L-3.4 -3.4 Z"/>
          <path class="glyph tw tw2" transform="translate(122,90)" d="M0 -13 L3.4 -3.4 L13 0 L3.4 3.4 L0 13 L-3.4 3.4 L-13 0 L-3.4 -3.4 Z"/>
        </g>
        <g class="expr" data-expr="sleepy">
          <path class="arc" d="M67 90 Q78 103 89 90"/>
          <path class="arc" d="M111 90 Q122 103 133 90"/>
          <text class="q zdrift" x="132" y="70">z</text>
        </g>
        <g class="expr" data-expr="curious">
          <rect class="glyph" x="70" y="74" width="16" height="30" rx="8"/>
          <rect class="glyph" x="114" y="76" width="16" height="24" rx="8"/>
          <text class="q qmove" x="130" y="74" font-size="28">?</text>
        </g>

        <path id="mouth" class="mouth" d="M86 120 Q100 129 114 120"/>
      </g>

      <!-- overlay catodico: scanline + vignette + banda che scorre -->
      <g id="crt" clip-path="url(#screen-clip)">
        <rect x="35" y="45" width="130" height="110" fill="url(#scanlines)"/>
        <rect x="35" y="45" width="130" height="110" fill="url(#crt-vignette)"/>
        <rect id="crt-scan" x="35" y="43" width="130" height="16"/>
      </g>
    </g>
  </svg>`;

  const root = mount.querySelector('#creatureRoot');
  const eyes = mount.querySelector('#screenEyes');
  const mouth = mount.querySelector('#mouth');
  const groups = [...mount.querySelectorAll('.expr')];

  const EXPR = {
    idle: 'neutral',
    thinking: 'thinking',
    acting: 'focused',
    sleeping: 'sleepy',
    waiting_approval: 'curious',
  };
  const MOUTH = {
    idle: 'M86 120 Q100 129 114 120',
    thinking: 'M94 122 Q100 125 106 122',
    acting: 'M88 120 Q100 132 112 120',
    sleeping: 'M95 122 Q100 126 105 122',
    waiting_approval: 'M95 121 Q100 126 105 121',
    happy: 'M84 119 Q100 133 116 119',
  };

  let currentExpr = 'neutral';
  let currentMouth = MOUTH.idle;
  let flashTimer = null;

  function showExpr(name) {
    for (const g of groups) g.classList.toggle('show', g.dataset.expr === name);
  }
  showExpr('neutral');

  function blink() {
    if (root.dataset.state === 'sleeping') return;
    showExpr('blink');
    setTimeout(() => showExpr(currentExpr), 120);
  }
  let blinkTimer = setInterval(blink, 3400 + Math.random() * 1800);

  // occhi/bocca che si spostano leggermente verso il cursore
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let mx = 0, my = 0, lastMove = -9999, cx = 0, cy = 0, tx = 0, ty = 0, autoAt = 0;
  document.addEventListener('mousemove', (e) => {
    const r = mount.getBoundingClientRect();
    if (!r.width) return;
    mx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
    my = clamp((e.clientY - (r.top + r.height * 0.42)) / (r.height / 2), -1, 1);
    lastMove = performance.now();
  });
  function frame(t) {
    if (t - lastMove < 1400) {
      tx = mx * 4.5;
      ty = my * 3;
    } else if (t > autoAt) {
      autoAt = t + 1600 + Math.random() * 2400;
      tx = (Math.random() * 2 - 1) * 2.8;
      ty = (Math.random() * 2 - 1) * 1.8;
    }
    cx += (tx - cx) * 0.1;
    cy += (ty - cy) * 0.1;
    eyes.setAttribute('transform', `translate(${cx.toFixed(2)},${cy.toFixed(2)})`);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  setInterval(() => {
    if (root.dataset.state === 'idle') flash('happy', 1100);
  }, 16000);

  function flash(name, ms = 1000) {
    showExpr(name);
    if (MOUTH[name]) mouth.setAttribute('d', MOUTH[name]);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      showExpr(currentExpr);
      mouth.setAttribute('d', currentMouth);
    }, ms);
  }

  return {
    setState(status) {
      const expr = EXPR[status] || 'neutral';
      root.dataset.tint = status === 'waiting_approval' ? 'amber' : 'cyan';
      if (root.dataset.state === status) return;
      root.dataset.state = status;
      currentExpr = expr;
      currentMouth = MOUTH[status] || MOUTH.idle;
      clearTimeout(flashTimer);
      showExpr(expr);
      mouth.setAttribute('d', currentMouth);
      root.classList.remove('react');
      void root.offsetWidth;
      root.classList.add('react');
      if (status !== 'sleeping') {
        clearInterval(blinkTimer);
        blink();
        blinkTimer = setInterval(blink, 3400 + Math.random() * 1800);
      }
    },
    flash,
  };
}

window.createSvgCharacter = createSvgCharacter;
