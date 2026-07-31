/**
 * Personaggio placeholder procedurale (SVG), espressivo:
 *  - pupille che seguono il mouse (+ sguardo autonomo a riposo)
 *  - sopracciglia / bocca / occhi che cambiano emozione per stato
 *  - bob fluttuante, respiro, blink, squash di reazione ai cambi di stato
 * Contratto Character: setState(status). Lo slot Rive usa la stessa interfaccia.
 */
function createSvgCharacter(mount) {
  mount.innerHTML = `
  <svg viewBox="0 0 200 200" id="creatureRoot" data-state="idle">
    <defs>
      <radialGradient id="body-g" cx="0.38" cy="0.28" r="0.9">
        <stop offset="0%" stop-color="#7dffbf"/>
        <stop offset="55%" stop-color="#2fae7c"/>
        <stop offset="100%" stop-color="#0f3a2c"/>
      </radialGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>
    </defs>

    <ellipse class="aura" cx="100" cy="112" rx="82" ry="76" filter="url(#soft)"></ellipse>
    <ellipse id="shadow" cx="100" cy="182" rx="52" ry="9" fill="#000" opacity="0.28"></ellipse>

    <g id="bob"><g id="breathe"><g id="body">
      <path class="skin" d="M100 42 C140 42 162 72 162 110 C162 152 134 176 100 176
               C66 176 38 152 38 110 C38 72 60 42 100 42 Z" fill="url(#body-g)"/>
      <path class="rim" d="M100 42 C140 42 162 72 162 110 C162 152 134 176 100 176
               C66 176 38 152 38 110 C38 72 60 42 100 42 Z"
               fill="none" stroke="#8affcf" stroke-width="2" opacity="0.7"/>
      <ellipse class="gloss" cx="78" cy="76" rx="20" ry="12" fill="#eafff4" opacity="0.25"/>
      <circle class="cheek" cx="66" cy="128" r="10"/>
      <circle class="cheek" cx="134" cy="128" r="10"/>

      <!-- occhi aperti -->
      <g class="eyes-open">
        <ellipse class="white" cx="80" cy="108" rx="12" ry="14" fill="#f2fff9"/>
        <ellipse class="white" cx="120" cy="108" rx="12" ry="14" fill="#f2fff9"/>
        <g class="pupils">
          <circle cx="80" cy="110" r="5.5" fill="#0c1a15"/>
          <circle cx="120" cy="110" r="5.5" fill="#0c1a15"/>
          <circle cx="82.5" cy="107" r="1.9" fill="#eafff4"/>
          <circle cx="122.5" cy="107" r="1.9" fill="#eafff4"/>
        </g>
      </g>
      <!-- occhi chiusi (sonno) -->
      <g class="eyes-closed">
        <path d="M69 110 Q80 118 91 110" fill="none" stroke="#0c1a15" stroke-width="3" stroke-linecap="round"/>
        <path d="M109 110 Q120 118 131 110" fill="none" stroke="#0c1a15" stroke-width="3" stroke-linecap="round"/>
      </g>

      <path class="brow brow-l" d="M69 92 Q80 87 91 91" fill="none" stroke="#0c1a15" stroke-width="3" stroke-linecap="round"/>
      <path class="brow brow-r" d="M109 91 Q120 87 131 92" fill="none" stroke="#0c1a15" stroke-width="3" stroke-linecap="round"/>

      <path id="mouth" d="M86 140 Q100 152 114 140" fill="none" stroke="#0c1a15" stroke-width="3" stroke-linecap="round"/>
    </g></g></g>

    <!-- indicatori -->
    <g class="ind ind-think" transform="translate(150,54)">
      <circle class="dot" cx="0" cy="0" r="4" fill="#5ef2a0"/>
      <circle class="dot" cx="12" cy="0" r="4" fill="#5ef2a0"/>
      <circle class="dot" cx="24" cy="0" r="4" fill="#5ef2a0"/>
    </g>
    <g class="ind ind-act" transform="translate(152,56)">
      <path class="spark" d="M0 -11 L3 -3 L11 0 L3 3 L0 11 L-3 3 L-11 0 L-3 -3 Z" fill="#5ef2a0"/>
    </g>
    <g class="ind ind-sleep">
      <text class="zz" x="150" y="52" fill="#9fb0b8" font-size="16" font-family="monospace">z</text>
      <text class="zz zz2" x="160" y="44" fill="#9fb0b8" font-size="12" font-family="monospace">z</text>
    </g>
    <text class="ind ind-ask" x="150" y="60" fill="#ffbf5c" font-size="28" font-family="monospace" font-weight="700">?</text>
  </svg>`;

  const root = mount.querySelector('#creatureRoot');
  const mouth = mount.querySelector('#mouth');
  const pupils = mount.querySelector('.pupils');

  const mouthByState = {
    idle: 'M86 140 Q100 152 114 140',
    thinking: 'M94 143 Q100 146 106 143',
    acting: 'M88 140 Q100 154 112 140',
    sleeping: 'M94 144 Q100 148 106 144',
    waiting_approval: 'M92 143 Q100 148 108 143',
  };

  // blink casuale
  const blink = () => {
    if (root.dataset.state === 'sleeping') return;
    root.classList.add('blink');
    setTimeout(() => root.classList.remove('blink'), 120);
  };
  let blinkTimer = setInterval(blink, 3200 + Math.random() * 1600);

  // sguardo: segue il mouse; a riposo guarda in giro
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let mx = 0, my = 0, lastMove = -9999, tgtX = 0, tgtY = 0, curX = 0, curY = 0, autoAt = 0;
  document.addEventListener('mousemove', (e) => {
    const r = mount.getBoundingClientRect();
    if (!r.width) return;
    mx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
    my = clamp((e.clientY - (r.top + r.height * 0.48)) / (r.height / 2), -1, 1);
    lastMove = performance.now();
  });
  const biasY = () => {
    const s = root.dataset.state;
    if (s === 'thinking') return -2.2;
    if (s === 'waiting_approval') return -0.6;
    return 0;
  };
  function frame(t) {
    if (t - lastMove < 1400) {
      tgtX = mx * 3.6;
      tgtY = my * 2.8;
    } else if (t > autoAt) {
      autoAt = t + 1500 + Math.random() * 2400;
      tgtX = (Math.random() * 2 - 1) * 2.6;
      tgtY = (Math.random() * 2 - 1) * 1.8;
    }
    curX += (tgtX - curX) * 0.12;
    curY += (tgtY + biasY() - curY) * 0.12;
    pupils.setAttribute('transform', `translate(${curX.toFixed(2)},${curY.toFixed(2)})`);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    setState(status) {
      if (root.dataset.state === status) return;
      root.dataset.state = status;
      if (mouth && mouthByState[status]) mouth.setAttribute('d', mouthByState[status]);
      // squash di reazione
      root.classList.remove('react');
      void root.offsetWidth;
      root.classList.add('react');
      // un blink "di risveglio" quando cambia stato (non da sonno)
      if (status !== 'sleeping') {
        clearInterval(blinkTimer);
        blink();
        blinkTimer = setInterval(blink, 3200 + Math.random() * 1600);
      }
    },
  };
}

window.createSvgCharacter = createSvgCharacter;
