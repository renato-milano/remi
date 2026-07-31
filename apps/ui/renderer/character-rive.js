/**
 * Slot Rive (dormiente finché non aggiungi @rive-app/canvas + un character.riv).
 * Stesso contratto Character: setState(status).
 *
 * Contratto atteso nel file .riv:
 *   - una state machine chiamata "State"
 *   - un input numerico "state" con la mappatura:
 *       0 idle · 1 thinking · 2 acting · 3 sleeping · 4 waiting_approval
 * Vedi assets/README.md.
 */
const STATE_INDEX = {
  idle: 0,
  thinking: 1,
  acting: 2,
  sleeping: 3,
  waiting_approval: 4,
};

function createRiveCharacter(mount, rivUrl) {
  if (typeof window.rive === 'undefined') {
    // Rive non caricato: nessun personaggio Rive disponibile.
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  mount.innerHTML = '';
  mount.appendChild(canvas);

  let stateInput = null;
  const instance = new window.rive.Rive({
    src: rivUrl,
    canvas,
    autoplay: true,
    stateMachines: 'State',
    onLoad: () => {
      instance.resizeDrawingSurfaceToCanvas();
      const inputs = instance.stateMachineInputs('State') || [];
      stateInput = inputs.find((i) => i.name === 'state') || null;
    },
  });

  return {
    setState(status) {
      if (stateInput) stateInput.value = STATE_INDEX[status] ?? 0;
    },
  };
}

window.createRiveCharacter = createRiveCharacter;
