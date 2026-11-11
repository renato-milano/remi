/* Finestra 3D: costruisce il modello mentre il daemon ne invia le parti, con etichette in stile lavagna. */
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { applyScenePatch } from '@openmate/scene3d';
import { createScene } from './build.js';

const bridge = window.scene3d;
const $ = (id) => document.getElementById(id);
const canvas = $('scene');
let renderer;
try {
  renderer = new T.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
} catch {
  $('error').textContent = 'La vista 3D richiede WebGL: verifica l’accelerazione grafica.';
  $('error').hidden = false;
  bridge?.ready?.();
  bridge?.interactive(true);
  throw new Error('WebGL non disponibile');
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setClearColor(0x000000, 0);
renderer.localClippingEnabled = true;
// ombre vere: le parti si distinguono fra loro e il modello "posa" sullo schermo (lo sfondo resta libero)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
const scene = new T.Scene();
// una stanza luminosa riflessa sulle superfici: metallo, plastica e vernice si distinguono
const pmrem = new T.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
scene.environmentIntensity = 0.55;
scene.add(new T.HemisphereLight('#ffffff', '#9aada9', 1.1));
const key = new T.DirectionalLight('#fff8eb', 2.2);
/** Direzione della luce chiave (dal modello verso la lampada): segue il modello, non cambia verso. */
const KEY_DIR = new T.Vector3(-4, 9, 7).normalize();
key.position.copy(KEY_DIR).multiplyScalar(12);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
scene.add(key, key.target);
const fill = new T.DirectionalLight('#d9e7ff', 0.6);
fill.position.set(5, 4, -5);
scene.add(fill);
// luce di contorno: dietro e sopra il modello rispetto a chi guarda, fredda e debole. Disegna un
// filo chiaro lungo il profilo, così la sagoma si stacca da qualunque desktop (non c'è sfondo)
const rim = new T.DirectionalLight('#dbe9ff', 0.9);
scene.add(rim, rim.target);
function placeRim() {
  if (!model || model.bounds.isEmpty()) return;
  const center = model.bounds.getCenter(new T.Vector3());
  const back = center.clone().sub(camera.position).normalize();
  const right = new T.Vector3().crossVectors(back, T.Object3D.DEFAULT_UP).normalize();
  rim.target.position.copy(center);
  // bassa e dietro: colpisce il profilo, non il dorso (che il fondo chiaro renderebbe slavato)
  rim.position.copy(center).addScaledVector(back, 10).addScaledVector(T.Object3D.DEFAULT_UP, 2.5).addScaledVector(right, 5);
}

/** Ombra morbida sotto il modello: lo "posa" sullo schermo. Fuori da model.root, quindi non si clicca. */
const shadow = (() => {
  const size = 128;
  const canvas2d = document.createElement('canvas');
  canvas2d.width = canvas2d.height = size;
  const ctx = canvas2d.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(20,30,32,0.2)');
  gradient.addColorStop(0.5, 'rgba(20,30,32,0.07)');
  gradient.addColorStop(1, 'rgba(20,30,32,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const mesh = new T.Mesh(
    new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new T.MeshBasicMaterial({
      map: new T.CanvasTexture(canvas2d),
      transparent: true,
      depthWrite: false,
    }),
  );
  mesh.renderOrder = -1;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
})();
/** Piano invisibile che riceve l'ombra proiettata dalla luce chiave: si vede solo l'ombra. */
const catcher = new T.Mesh(
  new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new T.ShadowMaterial({ color: '#16211f', opacity: 0.3, depthWrite: false }),
);
catcher.receiveShadow = true;
catcher.renderOrder = -1;
catcher.visible = false;
scene.add(catcher);
/** Macchia, piano d'ombra e luce chiave seguono il modello mentre cresce. */
function placeShadow() {
  if (!model || model.bounds.isEmpty()) {
    shadow.visible = catcher.visible = false;
    return;
  }
  const { min, max } = model.bounds;
  const size = max.clone().sub(min);
  const center = model.bounds.getCenter(new T.Vector3());
  const radius = size.length() / 2;
  shadow.position.set(center.x, min.y - size.y * 0.02, center.z);
  shadow.scale.set(size.x * 0.95, 1, size.z * 0.95);
  shadow.visible = true;
  catcher.position.set(center.x, min.y - size.y * 0.01, center.z);
  catcher.scale.setScalar(radius * 6);
  catcher.visible = true;
  // la lampada sta sempre dalla stessa parte del modello; il suo cono d'ombra abbraccia modello e ombra a terra
  key.target.position.copy(center);
  key.position.copy(center).addScaledVector(KEY_DIR, radius * 3);
  const cam = key.shadow.camera;
  cam.left = cam.bottom = -radius * 1.7;
  cam.right = cam.top = radius * 1.7;
  cam.near = radius * 0.5;
  cam.far = radius * 6;
  cam.updateProjectionMatrix();
  key.shadow.normalBias = radius * 0.004;
}
/** Tutte le mesh proiettano e ricevono ombra (i vetri e i flussi trasparenti non la proiettano). */
function shadowify() {
  model?.root.traverse((o) => {
    if (!o.isMesh) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    o.castShadow = !(mat.transparent && mat.opacity < 0.9);
    o.receiveShadow = true;
  });
}
const camera = new T.PerspectiveCamera(33, 1, 0.1, 150);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false;
controls.enablePan = true;
controls.maxPolarAngle = Math.PI * 0.88;
controls.addEventListener('change', invalidate);
// appena l'utente gira o ingrandisce, la camera non lo insegue più mentre il modello cresce
controls.addEventListener('start', () => {
  userMoved = true;
});

/** Durata dell'ingresso di una parte (scende in posizione). */
const ENTER_MS = 380;
/** Durata dello spostamento della camera verso la nuova inquadratura. */
const CAMERA_MS = 450;
let model;
let frame = 0;
let lastTime = 0;
let width = innerWidth;
let height = innerHeight;
let sceneVisiblePending = false;
function notifySceneVisible() { sceneVisiblePending = true; invalidate(); }
let validating = false;
let state = { section: true, motion: true, selected: null, building: false };
/** Moviola: velocità della riproduzione, scie e pose fantasma, camera che segue i corpi. */
const moviola = { speed: 1, trails: true, follow: false, shown: false, followAt: null, ghosts: [], dots: null, markers: [] };
let labels = [];
let dragging = false;
/** Etichetta del pezzo sotto il mouse; dove e quando è iniziato il gesto (clic o trascinamento). */
let hovered = null;
let press = null;
let interactive = false;
let userMoved = false;
let parts = 0;
/** Parti già sostituite dal loro dettaglio. */
let details = 0;
let pending = 0; // dettagli in arrivo
/** Parti in ingresso: { holder, from, start }. */
let entering = [];
/** Camera verso cui ci si sposta mentre il modello cresce. */
let cameraGoal;
/** Ingombri delle parti (coordinate di root): la sagoma vera del modello sullo schermo. */
let partBoxes = [];
/**
 * Com'è arrivata la scena (intestazione, parti, etichette, eventi dei dettagli per parte): serve alla
 * revisione con la vista, che corregge alcune parti e fa ricostruire il modello senza riscriverlo.
 */
let history = null;
/** Ricostruzione in corso (dopo una revisione): niente animazione d'ingresso, la camera resta dov'è. */
let rebuilding = false;
/** Ultima posa della camera con cui si sono scelte le ancore dei fili; timer del ricalcolo. */
const anchorsCamera = new T.Matrix4();
let anchorTimer = 0;
const raycaster = new T.Raycaster();
const pointer = new T.Vector2();
const projected = new T.Vector3();
const svgNS = 'http://www.w3.org/2000/svg';

function invalidate() {
  if (!frame && !document.hidden) frame = requestAnimationFrame(render);
}
let sharp = null;
/** Pixel ratio pieno (fino a 2) quando l'immagine è ferma, ridotto (1,5) in movimento. */
function setResolution(full) {
  if (sharp === full) return;
  sharp = full;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, full ? 2 : 1.5));
}
function render(time) {
  frame = 0;
  const dt = Math.min((time - lastTime) / 1000 || 0, 0.05);
  lastTime = time;
  let busy = false;
  if (model) {
    if (state.motion && !state.building) {
      model.animate(dt * moviola.speed);
      // "once": arrivati in fondo la moviola si ferma sull'ultimo fotogramma
      const tl = moviola.shown && model.timeline;
      if (tl && tl.loop === 'once' && model.elapsed >= tl.period) {
        model.seek(tl.period);
        state.motion = false;
        status();
      }
    }
    if (moviola.shown) {
      updateMoviola();
      busy = followMovers() || busy;
    }
    busy = animateEntering(time) || busy;
    busy = approachCamera() || busy;
    placeRim();
  }
  // piena risoluzione da fermo; mentre si gira, si costruisce o la camera si sposta basta meno
  setResolution(!(busy || dragging || state.building));
  renderer.render(scene, camera);
  if (sceneVisiblePending) { sceneVisiblePending = false; bridge?.ready?.(); }
  // quando la camera si ferma, i fili cercano di nuovo un punto visibile del loro pezzo
  if (labels.length && !anchorsCamera.equals(camera.matrixWorld)) {
    anchorsCamera.copy(camera.matrixWorld);
    clearTimeout(anchorTimer);
    anchorTimer = setTimeout(refreshAnchors, 160);
  }
  placeLabels();
  placeExplanation();
  if (busy || (state.motion && model?.hasMotion)) invalidate();
}
function animateEntering(time) {
  entering = entering.filter(({ holder, from, start }) => {
    const t = Math.min(1, (time - start) / ENTER_MS);
    const ease = 1 - (1 - t) ** 3;
    holder.position.y = from * (1 - ease);
    return t < 1;
  });
  return entering.length > 0;
}
/**
 * Camera che inquadra le parti visibili lungo la direzione della scena, lasciando spazio alle etichette.
 * Si inquadrano gli spigoli degli ingombri delle SINGOLE parti, non la scatola dell'intero modello:
 * un aereo visto in diagonale ha angoli vuoti enormi (davanti-sopra alle estremità alari) che
 * altrimenti allontanano la camera e lasciano metà schermo vuoto.
 */
/**
 * Volume dell'azione (mondo): dove passano i corpi che si muovono lungo tutto il ciclo. Si ricalcola
 * solo quando arrivano parti nuove (in streaming i corpi crescono).
 */
let action = { model: null, parts: -1, box: null };
function actionBox() {
  const tl = model.timeline;
  if (!tl) return null;
  if (action.model === model && action.parts === model.parts) return action.box;
  const keep = model.elapsed;
  const box = new T.Box3();
  for (let i = 0; i <= 16; i++) {
    model.seek((tl.period * i) / 16);
    for (const o of model.movers()) box.union(new T.Box3().setFromObject(o, true));
  }
  model.seek(keep);
  action = { model, parts: model.parts, box: box.isEmpty() ? null : box };
  return action.box;
}
function framing(bare = false) {
  let center = model.bounds.getCenter(new T.Vector3());
  const dir = new T.Vector3(...model.direction).normalize();
  const right = new T.Vector3(0, 1, 0).cross(dir).normalize();
  if (right.lengthSq() === 0) right.set(1, 0, 0);
  const up = dir.clone().cross(right);
  // spazio riservato: ai lati le colonne dei biglietti (se ci sono etichette), sotto la barra dei comandi
  // `bare` (miniatura del quaderno): niente biglietti né barre, il modello riempie l'immagine
  const side = model.labels.length && !bare ? Math.min(0.24, 250 / width) : 0.03;
  const tanV = Math.tan((camera.fov * Math.PI) / 360) * (bare ? 0.94 : model.timeline ? 0.72 : 0.82);
  const tanH = Math.tan((camera.fov * Math.PI) / 360) * camera.aspect * (1 - 2 * side);
  // ingombri delle parti in coordinate di root → mondo (root è scalato alla misura della scena)
  let boxes = model.partBounds().map((b) => b.applyMatrix4(model.root.matrixWorld));
  // scena animata: si inquadra l'azione. Il contesto molto più grande dei corpi che si muovono
  // (suolo, piazzola, campo) si taglia attorno all'azione invece di allontanare la camera.
  const acting = actionBox();
  if (acting) {
    const size = acting.getSize(new T.Vector3()).length();
    const zone = acting.clone().expandByScalar(size * 0.08);
    boxes = boxes
      .map((b) => (b.getSize(new T.Vector3()).length() > size * 1.5 ? b.clone().intersect(zone) : b))
      .filter((b) => !b.isEmpty());
    boxes.push(acting.clone());
    center = boxes.reduce((u, b) => u.union(b), new T.Box3()).getCenter(new T.Vector3());
  }
  if (!boxes.length) boxes.push(model.bounds);
  let distance = 0;
  const p = new T.Vector3();
  for (const { min, max } of boxes)
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).sub(center);
      const depth = p.dot(dir);
      distance = Math.max(
        distance,
        depth + Math.abs(p.dot(up)) / tanV,
        depth + Math.abs(p.dot(right)) / tanH,
      );
    }
  distance = Math.max(distance * 1.02, 1e-3);
  return { center, position: center.clone().addScaledVector(dir, distance), distance };
}
function applyFraming(goal) {
  controls.minDistance = goal.distance * 0.4;
  controls.maxDistance = goal.distance * 2.5;
  camera.near = goal.distance / 100;
  camera.far = goal.distance * 10;
  camera.updateProjectionMatrix();
}
/** Riporta subito la camera sull'inquadratura (↺, ridimensionamento, prima parte). */
function fitCamera(bare = false) {
  if (!model || model.bounds.isEmpty()) return;
  const goal = framing(bare);
  applyFraming(goal);
  controls.target.copy(goal.center);
  camera.position.copy(goal.position);
  cameraGoal = undefined;
  controls.update();
  invalidate();
}
/** Mentre arrivano le parti la camera si allarga con dolcezza verso la nuova inquadratura invece di saltare. */
function moveCamera() {
  if (!model || model.bounds.isEmpty()) return;
  const goal = framing();
  applyFraming(goal);
  cameraGoal = {
    ...goal,
    fromPosition: camera.position.clone(),
    fromCenter: controls.target.clone(),
    start: performance.now(),
  };
}
function approachCamera() {
  if (!cameraGoal) return false;
  const t = Math.min(1, (performance.now() - cameraGoal.start) / CAMERA_MS);
  const ease = 1 - (1 - t) ** 3;
  controls.target.lerpVectors(cameraGoal.fromCenter, cameraGoal.center, ease);
  camera.position.lerpVectors(cameraGoal.fromPosition, cameraGoal.position, ease);
  controls.update();
  if (t >= 1) cameraGoal = undefined;
  return Boolean(cameraGoal);
}
function svgElement(tag, attrs, parent) {
  const el = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent.append(el);
  return el;
}
function selectLabel(id) {
  state.selected = state.selected === id ? null : id;
  const label = model?.labels.find((part) => part.id === state.selected);
  const box = $('explanation');
  box.hidden = !label;
  if (label) {
    $('part-title').textContent = label.title;
    $('part-text').textContent = label.description || '';
    box.style.setProperty('--tint', label.color);
    // l'animazione d'apertura ricomincia a ogni pezzo scelto
    box.classList.remove('pop');
    void box.offsetWidth;
    box.classList.add('pop');
  }
  model?.highlight(state.selected ?? hovered);
  for (const item of labels)
    item.button.setAttribute('aria-pressed', String(item.part.id === state.selected));
  invalidate();
}
/** Il fumetto della spiegazione sta accanto al pezzo scelto e lo segue quando il modello gira. */
function placeExplanation() {
  const box = $('explanation');
  const pin = $('pin');
  const pinBack = $('pin-back');
  const item = labels.find((l) => l.part.id === state.selected);
  if (box.hidden || !item) {
    pin.setAttribute('d', '');
    pinBack.setAttribute('d', '');
    return;
  }
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  const gap = 34;
  const right = item.x + gap + w <= width - 16;
  const left = right ? item.x + gap : Math.max(16, item.x - gap - w);
  const top = Math.max(16, Math.min(height - 150 - h, item.y - h / 2));
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  const edge = right ? left : left + w;
  const d = `M ${item.x} ${item.y} L ${edge} ${Math.max(top + 14, Math.min(top + h - 14, item.y))}`;
  pin.setAttribute('d', d);
  pinBack.setAttribute('d', d);
}
/** Mette in evidenza il pezzo (e la sua etichetta) sotto il mouse. */
function hover(id) {
  if (hovered === id) return;
  hovered = id;
  model?.highlight(state.selected ?? hovered);
  for (const item of labels) item.button.classList.toggle('hover', item.part.id === hovered);
  invalidate();
}
/** Crea i biglietti delle etichette arrivate dopo l'ultima chiamata. */
function syncLabels() {
  for (const part of model.labels.slice(labels.length)) {
    const button = document.createElement('button');
    button.className = 'callout';
    button.textContent = part.title;
    button.style.background = part.color;
    button.dataset.part = part.id;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => selectLabel(part.id));
    button.addEventListener('mouseenter', () => hover(part.id));
    button.addEventListener('mouseleave', () => hover(null));
    $('labels').append(button);
    const group = svgElement('g', {}, $('leaders'));
    // alone chiaro sotto il filo: resta leggibile anche su un desktop scuro
    const back = svgElement(
      'path',
      { fill: 'none', stroke: '#fffef8', 'stroke-width': 7, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' },
      group,
    );
    const line = svgElement(
      'path',
      { fill: 'none', stroke: '#2c383d', 'stroke-width': 2, 'stroke-linejoin': 'round' },
      group,
    );
    const dot = svgElement(
      'circle',
      { r: 4.5, fill: '#fffef8', stroke: '#2c383d', 'stroke-width': 2 },
      group,
    );
    labels.push({ part, button, back, line, dot, x: 0, y: 0 });
  }
}
/**
 * Ingombro del modello sullo schermo (pixel): i biglietti gli stanno ai lati. Si proiettano gli
 * ingombri delle singole parti, non la scatola dell'intero modello: vista in diagonale quella è
 * molto più larga della sagoma e spingeva i biglietti ai bordi dello schermo, con fili lunghissimi.
 */
function screenBox() {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const boxes = partBoxes.length ? partBoxes : [model.bounds];
  for (const b of boxes)
    for (let i = 0; i < 8; i++) {
      projected
        .set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z)
        .applyMatrix4(model.root.matrixWorld)
        .project(camera);
      if (projected.z > 1) continue; // dietro la camera
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      box.minX = Math.min(box.minX, x);
      box.maxX = Math.max(box.maxX, x);
      box.minY = Math.min(box.minY, y);
      box.maxY = Math.max(box.maxY, y);
    }
  box.minX = Math.max(0, box.minX);
  box.maxX = Math.min(width, box.maxX);
  return box;
}
/** I due segmenti si incrociano? (fili delle etichette) */
function crosses([ax, ay, bx, by], [cx, cy, dx, dy]) {
  const turn = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return (
    turn(ax, ay, bx, by, cx, cy) !== turn(ax, ay, bx, by, dx, dy) &&
    turn(cx, cy, dx, dy, ax, ay) !== turn(cx, cy, dx, dy, bx, by)
  );
}
/**
 * Il primo pezzo lungo un raggio che conta per l'occhio: non tagliato da sezione o spaccato, e o
 * ha un'etichetta o è un pezzo pieno che copre ciò che sta dietro (un vetro si guarda attraverso).
 */
function firstVisible(origin, direction) {
  raycaster.set(origin, direction);
  for (const h of raycaster.intersectObject(model.root, true)) {
    if (!h.object.isMesh || !shown(h.object)) continue;
    const mat = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material;
    if (clipped(mat, h.point)) continue;
    if (model.labelAt(h.object) || !(mat.transparent && mat.opacity < 0.5)) return h;
  }
  return null;
}
function shown(object) {
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}
/**
 * Il filo di ogni biglietto finisce su un punto VISIBILE del suo pezzo: il centro se si vede,
 * altrimenti il punto in vista più vicino al centro (facce e spigoli del suo ingombro). Prima
 * finiva sempre al centro geometrico, che per un pezzo interno o coperto cade su un'altra parte.
 */
function refreshAnchors() {
  if (!model || !labels.length) return;
  const origin = camera.position;
  const dir = new T.Vector3();
  const toRoot = model.root.matrixWorld.clone().invert();
  const screen = (p) => projected.copy(p).project(camera);
  for (const item of labels) {
    const id = item.part.id;
    const centerWorld = item.part.at.clone().applyMatrix4(model.root.matrixWorld);
    const look = (p) => {
      const hit = firstVisible(origin, dir.subVectors(p, origin).normalize());
      return hit && model.labelAt(hit.object) === id ? hit.point : null;
    };
    let best = look(centerWorld);
    if (!best) {
      // la copia del pezzo più vicina al suo centro (non quella specchiata dall'altra parte)
      const objects = model.labelObjects(id).filter(shown);
      let box = null;
      let nearest = Infinity;
      for (const o of objects) {
        const b = new T.Box3().setFromObject(o, true);
        const d = b.getCenter(new T.Vector3()).distanceTo(centerWorld);
        if (d < nearest) [nearest, box] = [d, b];
      }
      if (box) {
        const c = box.getCenter(new T.Vector3());
        const s = box.getSize(new T.Vector3()).multiplyScalar(0.42);
        const candidates = [];
        for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]])
          candidates.push(new T.Vector3(c.x + x * s.x, c.y + y * s.y, c.z + z * s.z));
        for (let i = 0; i < 8; i++)
          candidates.push(new T.Vector3(c.x + (i & 1 ? s.x : -s.x), c.y + (i & 2 ? s.y : -s.y), c.z + (i & 4 ? s.z : -s.z)));
        const c0 = screen(centerWorld).clone();
        let score = Infinity;
        for (const p of candidates) {
          const hit = look(p);
          if (!hit) continue;
          const d = screen(hit).distanceTo(c0);
          if (d < score) [score, best] = [d, hit.clone()];
        }
      }
    }
    item.anchor = best ? best.applyMatrix4(toRoot) : null;
  }
  invalidate();
}
/**
 * Biglietti in due colonne ai lati del modello, come in una tavola illustrata: ognuno sul lato
 * del suo pezzo, all'altezza del pezzo (spinto quel tanto che basta per non sovrapporsi), con un
 * filo corto fino al punto. Con molti biglietti diventano compatti; restano sempre nello schermo.
 */
function placeLabels() {
  if (!model) return;
  for (const item of labels) {
    projected.copy((item.part.dynamic ? item.part.at : item.anchor ?? item.part.at)).applyMatrix4(model.root.matrixWorld).project(camera);
    item.x = (projected.x * 0.5 + 0.5) * width;
    item.y = (-projected.y * 0.5 + 0.5) * height;
  }
  if (!labels.length || model.bounds.isEmpty()) return;
  const box = screenBox();
  const cx = (box.minX + box.maxX) / 2;
  const top = 16;
  const bottom = height - (moviola.shown ? 215 : 140); // sopra la barra degli strumenti (e la moviola)
  const gap = 10;
  for (const left of [true, false]) {
    const items = labels.filter((item) => item.x < cx === left).sort((a, b) => a.y - b.y);
    if (!items.length) continue;
    for (const item of items) item.button.classList.remove('compact');
    const tall = (list) => list.reduce((sum, item) => sum + item.button.offsetHeight + gap, -gap);
    if (tall(items) > bottom - top) for (const item of items) item.button.classList.add('compact');
    // dall'alto in basso, ognuno all'altezza del suo pezzo ma mai sopra il precedente
    const ys = [];
    let next = top;
    for (const item of items) {
      const h = item.button.offsetHeight;
      const y = Math.max(next, item.y - h / 2);
      ys.push(y);
      next = y + h + gap;
    }
    // se la colonna sborda in basso, risale dal fondo
    let limit = bottom;
    for (let i = items.length - 1; i >= 0; i--) {
      const h = items[i].button.offsetHeight;
      ys[i] = Math.max(top, Math.min(ys[i], limit - h));
      limit = ys[i] - gap;
    }
    const slotX = (item) => {
      const w = item.button.offsetWidth;
      return left ? Math.max(16, box.minX - 40 - w) : Math.min(width - 16 - w, box.maxX + 40);
    };
    const leader = (item, y) => {
      const x = slotX(item);
      return [item.x, item.y, left ? x + item.button.offsetWidth : x, y + item.button.offsetHeight / 2];
    };
    // due fili vicini che si incrociano: i biglietti si scambiano di posto (pezzi alla stessa altezza)
    for (let pass = 0; pass < 3; pass++) {
      let swapped = false;
      for (let i = 0; i + 1 < items.length; i++) {
        const [a, b] = [items[i], items[i + 1]];
        if (crosses(leader(a, ys[i]), leader(b, ys[i + 1])) && !crosses(leader(a, ys[i + 1]), leader(b, ys[i]))) {
          [items[i], items[i + 1]] = [b, a];
          swapped = true;
        }
      }
      if (!swapped) break;
    }
    items.forEach((item, i) => {
      const w = item.button.offsetWidth;
      const h = item.button.offsetHeight;
      const x = slotX(item);
      item.button.style.left = `${x}px`;
      item.button.style.top = `${ys[i]}px`;
      const endX = left ? x + w : x;
      const endY = ys[i] + h / 2;
      const d = `M ${item.x} ${item.y} L ${endX} ${endY}`;
      item.back.setAttribute('d', d);
      item.line.setAttribute('d', d);
      item.dot.setAttribute('cx', item.x);
      item.dot.setAttribute('cy', item.y);
    });
  }
}
function status() {
  $('title').textContent = model?.title || 'Modello 3D';
  $('hint').textContent = state.building
    ? validating ? 'Correggo il movimento…' : `Costruisco il modello… ${parts} ${parts === 1 ? 'parte' : 'parti'}`
    : pending
      ? `Aggiungo i dettagli… ${pending} ${pending === 1 ? 'parte' : 'parti'}`
      : 'Modello illustrativo · trascina per ruotare · scorri per ingrandire';
  $('section').disabled = !model?.hasSection;
  $('motion').disabled = !model?.hasMotion;
  const tl = model?.timeline;
  const show = Boolean(tl && model.hasMotion && !state.building);
  if (show !== moviola.shown) {
    moviola.shown = show;
    $('timeline').hidden = !show;
    if (show) buildMoviola();
    else clearTrails();
  }
  // con la moviola play e pausa stanno lì; Movimento resta per i modelli che girano soltanto
  $('motion').hidden = show;
  if (show) {
    $('tl-play').textContent = state.motion ? '❚❚' : '▶';
    $('tl-play').setAttribute('aria-label', state.motion ? 'Pausa' : 'Riproduci');
  }
  $('section').setAttribute('aria-pressed', String(state.section));
  $('motion').setAttribute('aria-pressed', String(state.motion));
}

/* ---------- moviola: tempo, marcatori, scie ---------- */

/** Istante della scena dentro il suo ciclo (repeat ricomincia, once si ferma, pingpong va e torna). */
function phaseOf(tl, elapsed) {
  if (tl.loop === 'once') return Math.min(elapsed, tl.period);
  return ((elapsed % tl.period) + tl.period) % tl.period;
}
const fmt = (t) => t.toFixed(2).replace('.', ',');
const ghostMaterial = new T.MeshStandardMaterial({
  color: '#f2efe6',
  transparent: true,
  opacity: 0.24,
  depthWrite: false,
  roughness: 0.6,
});
const dotMaterial = new T.MeshBasicMaterial({ color: '#e2674f', transparent: true, opacity: 0.9 });
const trailGroup = new T.Group();
scene.add(trailGroup);
function clearTrails() {
  for (const child of [...trailGroup.children]) {
    trailGroup.remove(child);
    if (child.isInstancedMesh) {
      child.geometry.dispose();
      child.dispose();
    }
  }
  moviola.ghosts = [];
  moviola.dots = null;
}
/** Centro dell'ingombro visibile di un oggetto, nel mondo. */
function centerOf(obj, out = new T.Vector3()) {
  return new T.Box3().setFromObject(obj, true).getCenter(out);
}
/**
 * Scie dei corpi che si spostano: la traiettoria intera a puntini e alcune pose fantasma lungo il
 * percorso (solo dove il corpo si è davvero spostato). Si calcolano una volta, rimettendo la scena in
 * ogni istante campionato; durante la riproduzione si accendono solo le pose già passate.
 */
function buildTrails() {
  clearTrails();
  const tl = model?.timeline;
  if (!tl) return;
  const keep = model.elapsed;
  const diag = model.bounds.getSize(new T.Vector3()).length() || 1;
  const SAMPLES = 72;
  const dots = [];
  for (const obj of model.movers()) {
    let meshes = 0;
    obj.traverse((o) => {
      if (o.isMesh) meshes++;
    });
    const path = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = (tl.period * i) / SAMPLES;
      model.seek(t);
      path.push({ t, at: centerOf(obj) });
    }
    let travel = 0;
    for (let i = 1; i < path.length; i++) travel += path[i].at.distanceTo(path[i - 1].at);
    if (travel < diag * 0.03) continue; // fermo, o quasi: niente scia
    // puntini lungo il percorso, fitti dove il corpo è veloce
    let since = Number.POSITIVE_INFINITY;
    for (let i = 1; i < path.length; i++) {
      since += path[i].at.distanceTo(path[i - 1].at);
      if (since >= diag * 0.018) {
        dots.push(path[i].at);
        since = 0;
      }
    }
    // pose fantasma: solo dove il corpo si è spostato più della sua misura, così le pose non si
    // sovrappongono (pose fitte e trasparenti una sull'altra confondono); al massimo 5.
    // Un corpo che si muove meno di due volte la sua misura ha solo i puntini.
    if (meshes > 90) continue;
    model.seek(path[0].t);
    const reach = new T.Box3().setFromObject(obj, true).getSize(new T.Vector3()).length() * 0.85;
    if (travel < reach * 2) continue;
    const start = new T.Box3().setFromObject(obj, true);
    let last = path[0].at;
    let lastBox = start;
    let count = 0;
    for (const { t, at } of path) {
      if (count >= 5 || at.distanceTo(last) < reach) continue;
      model.seek(t);
      const box = new T.Box3().setFromObject(obj, true);
      // niente posa che copre la precedente o quella di partenza
      if (box.intersectsBox(lastBox) || box.intersectsBox(start)) continue;
      const ghost = obj.clone(true);
      ghost.traverse((o) => {
        if (o.isMesh) {
          o.material = ghostMaterial;
          o.castShadow = false;
          o.receiveShadow = false;
        }
        if (o.isLine || o.isLineSegments) o.visible = false;
      });
      ghost.matrixAutoUpdate = false;
      ghost.matrix.copy(obj.matrixWorld);
      ghost.userData.time = t;
      ghost.renderOrder = -0.5;
      trailGroup.add(ghost);
      moviola.ghosts.push(ghost);
      last = at;
      lastBox = box;
      count++;
    }
  }
  if (dots.length) {
    const dot = new T.InstancedMesh(new T.SphereGeometry(diag * 0.0032, 8, 6), dotMaterial, dots.length);
    const m = new T.Matrix4();
    dots.forEach((p, i) => dot.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    dot.renderOrder = -0.4;
    trailGroup.add(dot);
    moviola.dots = dot;
  }
  model.seek(keep);
  trailGroup.updateMatrixWorld(true);
}
/** Marcatori sulla barra: inizio, contatti dichiarati, fine. */
function buildMarkers() {
  const tl = model.timeline;
  const list = [{ time: 0, label: 'inizio', kind: 'start' }];
  for (const c of tl.contacts) if (c.time > 0 && c.time < tl.period) list.push({ time: c.time, label: `contatto ${fmt(c.time)} s`, kind: 'contact', title: c.id });
  if (tl.loop === 'pingpong') list.push({ time: tl.duration, label: 'ritorno', kind: 'turn' });
  list.push({ time: tl.period, label: 'fine', kind: 'end' });
  moviola.markers = list;
  const box = $('tl-marks');
  box.replaceChildren();
  for (const m of list) {
    const el = document.createElement('span');
    el.className = `tl-mark ${m.kind}`;
    el.style.left = `${(m.time / tl.period) * 100}%`;
    if (m.title) el.title = m.title;
    const label = document.createElement('b');
    label.textContent = m.label;
    el.append(document.createElement('i'), label);
    box.append(el);
  }
}
function buildMoviola() {
  if (!model?.timeline) return;
  buildMarkers();
  buildTrails();
  $('tl-trails').setAttribute('aria-pressed', String(moviola.trails));
  $('tl-follow').setAttribute('aria-pressed', String(moviola.follow));
  updateMoviola();
}
/** Cursore, tempo e pose fantasma all'istante attuale. */
function updateMoviola() {
  const tl = model?.timeline;
  if (!tl) return;
  const now = phaseOf(tl, model.elapsed);
  const scrub = $('tl-scrub');
  if (document.activeElement !== scrub || state.motion) scrub.value = String(now / tl.period);
  $('tl-fill').style.width = `${(now / tl.period) * 100}%`;
  $('tl-time').textContent = `${fmt(now)} / ${fmt(tl.period)} s`;
  for (const g of moviola.ghosts) g.visible = moviola.trails && g.userData.time < now - 1e-3;
  if (moviola.dots) moviola.dots.visible = moviola.trails;
}
function togglePlay() {
  const tl = model?.timeline;
  if (!tl) return;
  // ripartire dalla fine di una scena "once" significa rivederla
  if (!state.motion && tl.loop === 'once' && model.elapsed >= tl.period - 1e-3) model.seek(0);
  state.motion = !state.motion;
  status();
  invalidate();
}
function seekTo(t) {
  model.seek(t);
  state.motion = false;
  status();
  updateMoviola(); // tempo e cursore subito, non al prossimo fotogramma
  invalidate();
}
function jumpMarker(dir) {
  const tl = model?.timeline;
  if (!tl) return;
  const now = phaseOf(tl, model.elapsed);
  const times = moviola.markers.map((m) => m.time);
  const next = dir > 0 ? times.find((t) => t > now + 0.01) : [...times].reverse().find((t) => t < now - 0.01);
  seekTo(next ?? (dir > 0 ? tl.period : 0));
}
/** «Segui»: centro della camera sui corpi che si spostano, che restano in mezzo allo schermo. */
function followMovers() {
  if (!moviola.follow || !model) return false;
  const movers = model.movers();
  if (!movers.length) return false;
  const box = new T.Box3();
  for (const obj of movers) box.expandByObject(obj, true);
  const at = box.getCenter(new T.Vector3());
  if (moviola.followAt) {
    const delta = at.clone().sub(moviola.followAt);
    controls.target.add(delta);
    camera.position.add(delta);
    controls.update();
  }
  moviola.followAt = at;
  return false;
}
$('tl-play').onclick = togglePlay;
$('tl-prev').onclick = () => jumpMarker(-1);
$('tl-next').onclick = () => jumpMarker(1);
$('tl-scrub').addEventListener('input', (event) => {
  const tl = model?.timeline;
  if (tl) seekTo(Number(event.target.value) * tl.period);
});
for (const b of document.querySelectorAll('[data-speed]')) {
  b.onclick = () => {
    moviola.speed = Number(b.dataset.speed);
    for (const o of document.querySelectorAll('[data-speed]')) o.setAttribute('aria-pressed', String(o === b));
  };
}
$('tl-trails').onclick = () => {
  moviola.trails = !moviola.trails;
  $('tl-trails').setAttribute('aria-pressed', String(moviola.trails));
  updateMoviola();
  invalidate();
};
$('tl-follow').onclick = () => {
  moviola.follow = !moviola.follow;
  moviola.followAt = null;
  if (moviola.follow) userMoved = true; // la camera non torna da sola all'inquadratura intera
  $('tl-follow').setAttribute('aria-pressed', String(moviola.follow));
  invalidate();
};

/**
 * Miniatura per il quaderno (PNG base64, sfondo trasparente): solo il 3D, inquadrato da capo.
 * Una scena animata si ferma dopo l'ultimo contatto, con le scie: la figura del libro di fisica.
 */
function thumbnail(size = 640) {
  if (!model || model.bounds.isEmpty()) return null;
  for (const { holder } of entering) holder.position.y = 0;
  entering = [];
  fitCamera(true);
  const tl = model.timeline;
  if (tl && model.hasMotion) {
    const last = Math.max(0, ...tl.contacts.map((c) => c.time));
    const t = tl.loop === 'pingpong' ? tl.duration * 0.8 : last + (tl.period - last) * 0.8;
    if (!moviola.ghosts.length && !moviola.dots) buildTrails();
    model.seek(t);
    for (const g of moviola.ghosts) g.visible = g.userData.time < t - 1e-3;
  }
  placeRim();
  renderer.render(scene, camera);
  const out = document.createElement('canvas');
  out.width = size;
  out.height = Math.round((size * height) / Math.max(1, width));
  out.getContext('2d').drawImage(renderer.domElement, 0, 0, out.width, out.height);
  return out.toDataURL('image/png').split(',')[1];
}

/* ---------- eventi dello streaming ---------- */

function start(header) {
  sceneVisiblePending = false;
  validating = false;
  $('error').hidden = true;
  if (model) {
    scene.remove(model.root);
    model.dispose();
  }
  model = createScene(header);
  // sezione e movimento accesi all'apertura: l'interno si vede (gusci trasparenti) e le parti girano
  model.setMotion(true);
  scene.add(model.root);
  state = { section: true, motion: true, selected: null, building: true };
  hovered = null;
  labels = [];
  parts = 0;
  details = 0;
  pending = 0;
  entering = [];
  cameraGoal = undefined;
  userMoved = false;
  partBoxes = [];
  clearTimeout(anchorTimer);
  clearTrails();
  moviola.shown = false;
  moviola.follow = false;
  moviola.speed = 1; // una scena nuova parte a velocità normale
  for (const b of document.querySelectorAll('[data-speed]')) b.setAttribute('aria-pressed', String(b.dataset.speed === '1'));
  $('timeline').hidden = true;
  $('labels').replaceChildren();
  $('leaders').replaceChildren($('pin-back'), $('pin')); // il filo del fumetto resta
  $('pin').setAttribute('d', '');
  $('pin-back').setAttribute('d', '');
  $('explanation').hidden = true;
  placeShadow();
  status();
  invalidate();
}
function addNode(node) {
  if (!model) return;
  const first = model.bounds.isEmpty();
  let holder;
  try {
    holder = model.addNode(node);
  } catch (err) {
    console.warn('parte 3D scartata', err);
    return;
  }
  parts++;
  history?.nodes.push(node);
  syncLabels();
  shadowify();
  placeShadow();
  partBoxes = model.partBounds();
  refreshAnchors();
  if (first) fitCamera();
  else if (!userMoved) moveCamera();
  if (!model.bounds.isEmpty() && !rebuilding) {
    // l'altezza di partenza è nella scala della scena; il gruppo sta dentro root (misure del modello)
    holder.position.y = (model.bounds.getSize(new T.Vector3()).y * 0.25 + 0.2) / model.unit;
    entering.push({ holder, from: holder.position.y, start: performance.now() });
  }
  status();
  invalidate();
}
function addLabels(list) {
  if (!model) return;
  history?.labels.push(list);
  model.addLabels(list);
  syncLabels();
  invalidate();
}
function end(event) {
  if (!model) return;
  if (event?.pendingRepair) {
    if (event.preview) {
      for (const { holder } of entering) holder.position.y = 0;
      entering = [];
      model.finish();
      state.motion = false;
      model.hasMotion = false;
      model.setMotion(false);
      if (!userMoved) moveCamera();
      notifySceneVisible();
    }
    validating = true;
    state.building = true;
    $('error').hidden = true;
    status();
    invalidate();
    return;
  }
  validating = false;
  // le parti ancora in ingresso vanno al loro posto prima di unire i box fermi
  for (const { holder } of entering) holder.position.y = 0;
  entering = [];
  model.finish();
  shadowify(); // anche le mesh unite da finish()
  partBoxes = model.partBounds();
  refreshAnchors();
  state.building = false;
  if ((history?.header.contacts && event?.errors?.length) || event?.errors?.some((e) => e.includes('contacts'))) {
    if (event.preview) {
      // anteprima: le traiettorie sono quelle scritte dal modello, senza le correzioni del contatto.
      // Meglio un movimento non garantito che una scena ferma: si avvisa e si lascia girare.
      console.warn('Contatto non verificato, movimento come scritto:', event.errors);
      $('error').textContent = 'Movimento non verificato: le traiettorie sono quelle scritte, il contatto può essere impreciso.';
    } else {
      state.motion = false;
      model.setMotion(false);
      model.hasMotion = false;
      console.warn('Scena non riprodotta:', event.errors);
      $('error').textContent = event.errors.some((e) => e.includes('verifica interrotta'))
        ? 'Verifica del movimento interrotta.'
        : 'Non sono riuscito a costruire un movimento coerente tra gli oggetti.';
    }
    $('error').hidden = false;
  }
  if (moviola.shown) buildMoviola(); // fine di una scena già in riproduzione (patch): scie da capo
  if (!userMoved) moveCamera();
  if (history) history.ended = event ?? { errors: [] };
  if (parts) notifySceneVisible();
  status();
  invalidate();
}
/**
 * Revisione con la vista: alcune parti riscritte (stesso id), nuove o da togliere. Si ricostruisce la
 * scena dalla cronologia con le correzioni, nello stesso giro di eventi (niente sfarfallio), senza
 * animazione d'ingresso; la camera resta dov'è se l'utente l'ha mossa; i dettagli delle parti
 * rimaste uguali si rimettono al loro posto.
 */
function patch(event) {
  // I contatti compilati non possono essere modificati da una patch non verificata.
  if (!model || !history || !history.ended || history.header.contacts) return;
  const checked = applyScenePatch({ ...history.header, nodes: history.nodes }, event);
  if (checked.errors.length) {
    console.warn('Revisione scartata:', checked.errors);
    return;
  }
  const nodes = checked.scene.nodes;
  const touched = new Set(checked.touched);
  const prev = { ...state, time: model.elapsed, position: camera.position.clone(), target: controls.target.clone(), moved: userMoved };
  const old = history;
  rebuilding = true;
  try {
    start(old.header);
    // la cronologia riparte: addNode/addLabels/recordDetail la riempiono con la scena corretta
    history = { header: old.header, nodes: [], labels: [], details: new Map(), ended: null };
    for (const n of nodes) addNode(n);
    for (const list of old.labels) addLabels(list);
    end(old.ended);
    for (const [target, events] of old.details) {
      if (touched.has(target)) continue;
      for (const e of events) handle(e);
    }
  } finally {
    rebuilding = false;
  }
  model.animate(prev.time);
  if (!prev.section) {
    state.section = false;
    model.setSection(false);
  }
  if (!prev.motion) {
    state.motion = false;
    model.setMotion(false);
  }
  if (prev.moved) {
    userMoved = true;
    camera.position.copy(prev.position);
    controls.target.copy(prev.target);
    controls.update();
  } else fitCamera();
  partBoxes = model.partBounds();
  refreshAnchors();
  status();
  invalidate();
}
/**
 * Due viste del modello costruito (PNG base64, sfondo bianco) per la revisione con la vista:
 * quella attuale e una dall'altro lato, un po' più dall'alto. Solo il 3D, senza biglietti né barra.
 */
function snapshot() {
  if (history?.header.contacts || !model || model.bounds.isEmpty()) return [];
  const W = 960;
  const H = Math.round((W * height) / width);
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const ctx = off.getContext('2d');
  const out = [];
  const shoot = () => {
    renderer.render(scene, camera); // il canvas WebGL non conserva il buffer: si disegna appena reso
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(renderer.domElement, 0, 0, W, H);
    out.push(off.toDataURL('image/png').split(',')[1]);
  };
  shoot();
  const position = camera.position.clone();
  const target = controls.target.clone();
  const offset = position.clone().sub(target);
  const other = new T.Vector3(-offset.x, Math.abs(offset.y) * 1.4 + offset.length() * 0.1, -offset.z).setLength(offset.length());
  camera.position.copy(target).add(other);
  camera.lookAt(target);
  shoot();
  camera.position.copy(position);
  camera.lookAt(target);
  controls.update();
  invalidate();
  return out;
}
function handle(event) {
  if (history?.header.contacts && event.op.startsWith('detail-')) return;
  if (event.op === 'start') {
    start(event.header);
    history = { header: event.header, nodes: [], labels: [], details: new Map(), ended: null };
  } else if (event.op === 'node') addNode(event.node);
  else if (event.op === 'labels') addLabels(event.labels);
  else if (event.op === 'end') end(event);
  else if (event.op === 'patch') patch(event);
  // dettaglio di una parte (seconda chiamata): si costruisce a parte e sostituisce il pezzo
  else if (event.op === 'detail-plan') {
    pending = event.targets.length;
    status();
  } else if (event.op === 'detail-start') {
    recordDetail(event);
    model?.beginDetail(event.target, event.header);
  } else if (event.op === 'detail-node') {
    recordDetail(event);
    model?.addDetailNode(event.target, event.node);
  } else if (event.op === 'detail-end') {
    recordDetail(event);
    if (event.errors?.length || !event.nodes) model?.discardDetail(event.target);
    else if (model?.endDetail(event.target)) {
      details++;
      shadowify();
      partBoxes = model.partBounds();
      refreshAnchors();
    }
    pending = Math.max(0, pending - 1);
    status();
    invalidate();
  }
}
function recordDetail(event) {
  if (!history) return;
  const list = history.details.get(event.target) ?? [];
  list.push(event);
  history.details.set(event.target, list);
}
bridge?.onEvent(handle);
bridge?.onSnapshot?.(() => bridge.snapshot(snapshot()));

/* ---------- interazione e clic passanti ---------- */

function resize() {
  width = innerWidth;
  height = innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  if (model) fitCamera();
}
function setInteractive(on) {
  if (interactive === on) return;
  interactive = on;
  bridge?.interactive(on);
}
/** Il punto è tagliato via dal materiale? (sezione: basta un piano; spaccato: tutti i piani insieme) */
function clipped(mat, point) {
  const planes = mat.clippingPlanes;
  if (!planes?.length) return false;
  const out = (plane) => plane.distanceToPoint(point) < 0;
  return mat.clipIntersection ? planes.every(out) : planes.some(out);
}
/** Il primo pezzo visibile sotto il mouse (non tagliato dalla sezione), o null. */
function hitAt(event) {
  if (!model) return null;
  pointer.set((event.clientX / width) * 2 - 1, (-event.clientY / height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(model.root, true).find((h) => {
    if (!h.object.isMesh) return false;
    for (let node = h.object; node; node = node.parent) if (!node.visible) return false;
    const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material];
    return mats.some((mat) => !clipped(mat, h.point));
  });
  return hit?.object ?? null;
}
const hitsModel = (event) => Boolean(hitAt(event));
/** L'etichetta del pezzo sotto il mouse: prima i pezzi spiegati, anche dietro un guscio trasparente. */
function labelUnder(event) {
  if (!model) return null;
  pointer.set((event.clientX / width) * 2 - 1, (-event.clientY / height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  // dove il guscio è tagliato il mouse passa; un pezzo pieno senza etichetta copre quelli dietro
  const hit = firstVisible(raycaster.ray.origin.clone(), raycaster.ray.direction.clone());
  return hit ? model.labelAt(hit.object) : null;
}
const onUI = (target) => Boolean(target.closest?.('button, input, .toolbar, .timeline, #explanation'));
document.addEventListener('mousemove', (event) => {
  const hit = dragging || onUI(event.target) || hitsModel(event);
  setInteractive(hit);
  // sopra un pezzo spiegato: si accende e il cursore diventa una mano (si può cliccare)
  const part = !dragging && !onUI(event.target) ? labelUnder(event) : null;
  if (!onUI(event.target)) hover(part);
  canvas.style.cursor = dragging ? 'grabbing' : part ? 'pointer' : hit ? 'grab' : 'default';
});
canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  press = { x: event.clientX, y: event.clientY, t: performance.now() };
  setInteractive(true);
});
window.addEventListener('pointerup', (event) => {
  dragging = false;
  // un clic (non un trascinamento per girare il modello) apre la spiegazione del pezzo
  const click =
    press &&
    Math.hypot(event.clientX - press.x, event.clientY - press.y) < 5 &&
    performance.now() - press.t < 450 &&
    !onUI(event.target);
  press = null;
  if (click) {
    const id = labelUnder(event);
    if (id && id !== state.selected) selectLabel(id);
    else if (!id && state.selected) selectLabel(state.selected);
  }
  setInteractive(onUI(event.target) || hitsModel(event));
  invalidate(); // finito il trascinamento: un fotogramma a piena risoluzione
});
window.addEventListener('blur', () => {
  dragging = false;
  setInteractive(false);
});
document.addEventListener('pointerleave', () => {
  if (!dragging) setInteractive(false);
});
$('section').onclick = () => {
  state.section = !state.section;
  model?.setSection(state.section);
  refreshAnchors(); // ciò che si vede cambia: i fili cercano di nuovo il loro pezzo
  status();
  invalidate();
};
$('motion').onclick = () => {
  state.motion = !state.motion;
  model?.setMotion(state.motion);
  status();
  invalidate();
};
$('reset').onclick = () => {
  userMoved = false;
  fitCamera();
};
$('dismiss').onclick = () => selectLabel(state.selected);
$('close').onclick = () => close();
$('notebook').onclick = () => bridge?.openNotebook?.();
function close() {
  if (bridge) bridge.close();
  else window.close();
}
window.addEventListener('keydown', (event) => {
  if (moviola.shown && !event.metaKey && !event.ctrlKey && !event.altKey) {
    if (event.key === ' ') {
      event.preventDefault();
      togglePlay();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      jumpMarker(event.key === 'ArrowRight' ? 1 : -1);
      return;
    }
  }
  if (event.key !== 'Escape') return;
  if (state.selected) selectLabel(state.selected);
  else close();
});
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(frame);
    frame = 0;
  } else invalidate();
});

// Banco di prova (smoke test): stessi eventi del daemon, più lo stato del rendering.
window.remi3d = {
  feed: handle,
  thumbnail,
  seek: (t) => model && seekTo(t),
  refreshAnchors,
  snapshot,
  getSnapshot: () => ({
    state: { ...state },
    parts,
    triangles: renderer.info.render.triangles,
    drawCalls: renderer.info.render.calls,
    geometries: renderer.info.memory.geometries,
    labels: model ? model.labels.map((part) => part.id) : [],
    // ingombro di ogni parte con un id, nelle misure del modello (prove degli agganci)
    boxes: model ? model.partBoxes() : {},
    shells: model ? model.shellIds() : [],
    labelPoints: model ? model.labels.map((l) => [l.title, ...l.at.toArray().map((v) => Math.round(v * 100) / 100)]) : [],
    renderScheduled: Boolean(frame),
    moviola: { shown: moviola.shown, elapsed: model?.elapsed ?? 0, timeline: model?.timeline ?? null, ghosts: moviola.ghosts.length, markers: moviola.markers.map((m) => m.time) },
  }),
};
resize();
status();
document.fonts.ready.then(invalidate);
