const { contextBridge } = require('electron');

// Finestra fuori schermo del quaderno: carica la lavagna o il visore 3D per farne la miniatura.
// Le pagine si aspettano il loro ponte col processo principale: qui è muto (niente ascolto,
// niente invii), e il processo principale le pilota con executeJavaScript.
const noop = () => {};
const pointerMethods = [
  'submit',
  'cancel',
  'setInteractive',
  'onTrace',
  'onAnchor',
  'onRecStart',
  'onRecStop',
  'sendRecData',
  'onSpeak',
  'speaking',
  'onAck',
  'onWindow',
  'onWakeConfig',
  'onWakeDone',
  'sendWakeSegment',
  'onListen',
  'sendListenData',
  'onPanelStart',
  'onPanelStep',
  'onPanelEnd',
  'onStep',
  'onAsk',
  'onThinking',
  'onAnswer',
  'onStatus',
  'onDone',
  'onDraw',
  'onClear',
];
const scene3dMethods = [
  'onEvent',
  'interactive',
  'ready',
  'close',
  'onSnapshot',
  'snapshot',
  'openNotebook',
];
contextBridge.exposeInMainWorld(
  'pointer',
  Object.fromEntries(pointerMethods.map((m) => [m, noop])),
);
contextBridge.exposeInMainWorld(
  'scene3d',
  Object.fromEntries(scene3dMethods.map((m) => [m, noop])),
);
