/* Costruisce in Three.js una scena 3D (formato @openmate/scene3d) un nodo alla volta, mentre arriva. */
import { SHAPES } from '@openmate/scene3d';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DEG = Math.PI / 180;
const LABEL_COLORS = ['#f6e6a3', '#ead0e2', '#d6edd7', '#d5e1f8', '#efcddd', '#e1e2f1'];
const DEFAULT_MATERIAL = { color: '#a7b0b4' };
/** Materiali di serie dei componenti, se il modello non ne indica uno. */
const RUBBER = { color: '#1f2224', roughness: 0.85, metalness: 0 };
const RIM_METAL = { color: '#b9bec2', roughness: 0.3, metalness: 0.85 };
/** Scala in cui il motore porta un oggetto misurato in metri (la sua dimensione maggiore). */
const SCENE_SIZE = 10;
const PAINT_MAX = 8;
/** Forme che non fanno mai da guscio (un pezzo "dentro" un'elica o una ruota è il suo mozzo). */
const NOT_SHELLS = new Set(['propeller', 'rotor', 'wheel', 'duct', 'arrow', 'line']);
/** Stile maquette: tutto di questo materiale chiaro e opaco, tranne le parti spiegate e i flussi. */
const CLAY = { color: '#bfc5c6', roughness: 0.62, metalness: 0.08 };
const FLOW = { color: '#3d9be0', roughness: 0.4, metalness: 0 };
const AXIS = { x: new T.Vector3(1, 0, 0), y: new T.Vector3(0, 1, 0), z: new T.Vector3(0, 0, 1) };

/** Ruota una geometria costruita attorno a +Y perché giaccia lungo l'asse richiesto. */
function orient(geometry, axis = 'y') {
  if (axis === 'x') geometry.rotateZ(-Math.PI / 2);
  else if (axis === '-x') geometry.rotateZ(Math.PI / 2);
  else if (axis === 'z') geometry.rotateX(Math.PI / 2);
  else if (axis === '-z') geometry.rotateX(-Math.PI / 2);
  else if (axis === '-y') geometry.rotateZ(Math.PI);
  return geometry;
}
const curve = (points) => new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));

function loft(stations) {
  const positions = [];
  const indices = [];
  const rings = 32;
  for (const [x, w, h, y] of stations)
    for (let j = 0; j < rings; j++) {
      const a = (j / rings) * Math.PI * 2;
      positions.push(x, y + Math.sin(a) * h, Math.cos(a) * w);
    }
  for (let i = 0; i < stations.length - 1; i++)
    for (let j = 0; j < rings; j++) {
      const a = i * rings + j;
      const b = i * rings + ((j + 1) % rings);
      indices.push(a, b + rings, b, a, a + rings, b + rings);
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Estrusione lungo +Z con bordi smussati: lo spessore totale resta `depth` anche con la smussatura. */
function extrude(shape, depth, bevel = 0) {
  const b = Math.min(bevel, depth / 2 - 1e-3);
  const smooth = b > 0;
  return new T.ExtrudeGeometry(shape, {
    depth: smooth ? depth - 2 * b : depth,
    bevelEnabled: smooth,
    bevelSize: b,
    bevelThickness: b,
    bevelOffset: -b,
    bevelSegments: 4,
    curveSegments: 16,
  }).translate(0, 0, smooth ? b : 0);
}

function profile({ points, width, bevel = 0 }) {
  const s = new T.Shape(points.map(([x, y]) => new T.Vector2(x, y)));
  // sagoma vista di fianco (piano x-y), spessore centrato lungo z
  return extrude(s, width, bevel).translate(0, 0, -width / 2);
}

function plate({ points, rect, corner = 0, holes = [], thickness, bevel = 0 }) {
  const s = new T.Shape();
  if (rect) {
    const [w, d] = rect.map((n) => n / 2);
    const r = Math.min(corner, w, d);
    s.moveTo(-w + r, -d);
    s.lineTo(w - r, -d);
    s.quadraticCurveTo(w, -d, w, -d + r);
    s.lineTo(w, d - r);
    s.quadraticCurveTo(w, d, w - r, d);
    s.lineTo(-w + r, d);
    s.quadraticCurveTo(-w, d, -w, d - r);
    s.lineTo(-w, -d + r);
    s.quadraticCurveTo(-w, -d, -w + r, -d);
  } else s.setFromPoints(points.map(([x, z]) => new T.Vector2(x, z)));
  for (const [x, z, r] of holes) {
    const hole = new T.Path();
    hole.absarc(x, z, r, 0, Math.PI * 2, true);
    s.holes.push(hole);
  }
  const g = extrude(s, thickness, bevel);
  // la Y della forma diventa la Z del mondo: faccia superiore a y = 0, spessore verso il basso
  g.rotateX(Math.PI / 2);
  return g;
}

function blade({ axis = 'y', inner, outer, width: w, sweep = 0, thickness = 0.02, pitch = 0 }) {
  const shape = new T.Shape();
  shape.moveTo(inner, -w * 0.35);
  shape.bezierCurveTo(outer * 0.5, -w, outer * 0.85, sweep - w, outer, sweep - w * 0.5);
  shape.lineTo(outer, sweep + w * 0.5);
  shape.bezierCurveTo(outer * 0.8, sweep + w, outer * 0.45, w, inner, w * 0.35);
  shape.closePath();
  const g = new T.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 10,
  });
  // pala canonica: radiale lungo +X, gira attorno a Z; pitch la torce attorno alla sua lunghezza
  g.translate(0, 0, -thickness / 2);
  g.rotateX(pitch * DEG);
  const a = axis.replace('-', '');
  if (a === 'x') g.rotateY(Math.PI / 2);
  else if (a === 'y') g.rotateX(Math.PI / 2);
  return g;
}

/** Geometria da anelli di punti (tutti della stessa lunghezza), chiusa alle due estremità. */
function ringsToGeometry(rings) {
  const positions = [];
  const indices = [];
  const R = rings[0].length;
  for (const ring of rings) for (const p of ring) positions.push(...p);
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < R; j++) {
      const a = i * R + j;
      const b = i * R + ((j + 1) % R);
      indices.push(a, b, b + R, a, b + R, a + R);
    }
  // tappi: un ventaglio dal centro di ciascun anello estremo. I vertici dell'anello si copiano,
  // così il tappo ha normali sue (piatte) e non media quelle della parete: muso e coda puliti
  for (const [k, flip] of [
    [0, true],
    [rings.length - 1, false],
  ]) {
    const c = rings[k].reduce((s, p) => s.map((v, i) => v + p[i] / R), [0, 0, 0]);
    const ci = positions.length / 3;
    positions.push(...c);
    const base = positions.length / 3;
    for (const p of rings[k]) positions.push(...p);
    for (let j = 0; j < R; j++) {
      const a = base + j;
      const b = base + ((j + 1) % R);
      indices.push(...(flip ? [ci, b, a] : [ci, a, b]));
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * Corpo affusolato lungo x (muso verso -x): fusoliere, scafi, siluri, carrozzerie, gondole.
 * Sezione da ellisse (square 0) a rettangolo arrotondato (square 1), muso e coda che si
 * restringono in modo morbido; noseHeight/tailHeight alzano o abbassano le punte (1 = fino
 * alla linea superiore), keel fa la carena a V sotto.
 */
function body({
  length: L, width: W, height: H, nose = 0.2, tail = 0.3, noseSize = 0.05, tailSize = 0.15,
  noseHeight = 0, tailHeight = 0, square = 0, keel = 0,
}) {
  const N = 56;
  const R = 40;
  const e = 2 / (2 + square * 6); // esponente della superellisse
  const pow = (v) => Math.sign(v) * Math.abs(v) ** e;
  const rings = [];
  for (let i = 0; i < N; i++) {
    const t = (1 - Math.cos((Math.PI * i) / (N - 1))) / 2; // più anelli verso le punte
    let s = 1;
    let lift = 0;
    if (nose > 0 && t < nose) {
      const u = 1 - t / nose;
      s = noseSize + (1 - noseSize) * Math.sqrt(1 - u * u);
      lift = noseHeight;
    } else if (tail > 0 && t > 1 - tail) {
      const u = (t - (1 - tail)) / tail;
      s = tailSize + (1 - tailSize) * Math.cos((u * Math.PI) / 2);
      lift = tailHeight;
    }
    const yc = lift * (H / 2) * (1 - s);
    const ring = [];
    for (let j = 0; j < R; j++) {
      const a = (-j / R) * Math.PI * 2; // verso orario: facce rivolte all'esterno
      const cz = pow(Math.cos(a));
      let cy = pow(Math.sin(a));
      if (cy < 0 && keel > 0) cy = cy * (1 - keel) - (1 - Math.abs(cz)) * keel;
      ring.push([-L / 2 + t * L, yc + (cy * s * H) / 2, (cz * s * W) / 2]);
    }
    rings.push(ring);
  }
  return ringsToGeometry(rings);
}

/** Profilo alare (NACA a 4 cifre, poco curvo) di corda 1: punti dal bordo d'uscita, sopra, poi sotto. */
function airfoil(t, C = 22) {
  const m = 0.02;
  const p = 0.4;
  const pts = [];
  const at = (x, upper) => {
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const yc = x < p ? (m / p ** 2) * (2 * p * x - x * x) : (m / (1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x * x);
    return [x, yc + (upper ? yt : -yt)];
  };
  for (let i = C; i >= 0; i--) pts.push(at((1 - Math.cos((Math.PI * i) / C)) / 2, true));
  for (let i = 1; i < C; i++) pts.push(at((1 - Math.cos((Math.PI * i) / C)) / 2, false));
  return pts;
}

/**
 * Ala (o deriva, pinna, pala, vela) con profilo vero: dalla radice (z = 0) all'estremità
 * (z = span), corda lungo x con l'origine al centro della corda alla radice, spessore in y.
 * axis "y": stessa ala in piedi, verso l'alto (derive, timoni).
 */
function wing({ span, root, tip = root * 0.6, sweep = 0, dihedral = 0, thickness = 0.12, axis = 'z' }) {
  const foil = airfoil(thickness);
  const S = 12;
  const rings = [];
  for (let k = 0; k <= S; k++) {
    const f = k / S;
    const z = f * span;
    const c = root + (tip - root) * f;
    const le = -root / 2 + z * Math.tan(sweep * DEG);
    const y = z * Math.tan(dihedral * DEG);
    rings.push(foil.map(([x, h]) => [le + x * c, y + h * c, z]));
  }
  const g = ringsToGeometry(rings);
  if (axis === 'y') g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * Condotto: anello cavo di raggio esterno `radius`, alto `height`, con la parete di spessore
 * `thickness` e bordi arrotondati; `spokes` razze sopra a griglia (gabbie di eliche, griglie).
 * Gabbie e condotti di droni, ventole intubate, prese d'aria dei motori a reazione.
 */
function duct({ radius: r, height: h, thickness = r * 0.08, spokes = 0, axis = 'y' }) {
  const t = Math.min(thickness, r * 0.9);
  const prof = [];
  // sezione della parete: un rettangolo t × h con gli angoli arrotondati, percorso chiuso
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    prof.push(new T.Vector2(r - t / 2 + (Math.sign(c) * Math.abs(c) ** 0.4 * t) / 2, (Math.sign(s) * Math.abs(s) ** 0.4 * h) / 2));
  }
  const parts = [new T.LatheGeometry(prof, 64)];
  for (let i = 0; i < spokes; i++) {
    const bar = new T.BoxGeometry(2 * (r - t / 2), t * 0.5, t * 0.5).translate(0, h / 2 - t * 0.25, 0);
    parts.push(bar.rotateY((i / spokes) * Math.PI));
  }
  // lathe e barre hanno già normali (lisce) e uv: si uniscono in una geometria sola
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return orient(g, axis);
}

/** Freccia di forza o di flusso: asta e punta, dalla coda (origine) verso axis (default y). */
function arrow({ length: L, radius = L * 0.05, axis = 'y' }) {
  const head = Math.min(L * 0.4, radius * 5);
  const shaft = new T.CylinderGeometry(radius, radius, L - head, 24).translate(0, (L - head) / 2, 0);
  const tip = new T.ConeGeometry(radius * 2.4, head, 32).translate(0, L - head / 2, 0);
  const g = mergeGeometries([shaft, tip]);
  shaft.dispose();
  tip.dispose();
  return orient(g, axis);
}

function geometryFor(n) {
  switch (n.shape) {
    case 'arrow':
      return arrow(n);
    case 'duct':
      return duct(n);
    case 'body':
      return body(n);
    case 'wing':
      return wing(n);
    case 'box':
      return new T.BoxGeometry(...n.size);
    case 'cylinder':
      if (n.from) {
        const length = new T.Vector3(...n.from).distanceTo(new T.Vector3(...n.to));
        return new T.CylinderGeometry(n.radius, n.radius, length, 48);
      }
      return orient(
        new T.CylinderGeometry(n.radiusTop ?? n.radius, n.radius, n.height, 48),
        n.axis,
      );
    case 'cone':
      return orient(new T.ConeGeometry(n.radius, n.height, 48), n.axis);
    case 'roundedBox': {
      const radius = Math.min(
        n.radius ?? Math.min(...n.size) * 0.15,
        Math.min(...n.size) / 2 - 1e-3,
      );
      return new RoundedBoxGeometry(...n.size, 4, radius);
    }
    case 'capsule':
      return orient(new T.CapsuleGeometry(n.radius, n.length, 8, 32), n.axis);
    case 'profile':
      return profile(n);
    case 'sphere':
      return new T.SphereGeometry(n.radius ?? 1, 40, 20);
    case 'torus':
      return orient(new T.TorusGeometry(n.radius, n.tube, 24, 64).rotateX(Math.PI / 2), n.axis);
    case 'lathe':
      return orient(
        new T.LatheGeometry(
          n.profile.map(([t, r]) => new T.Vector2(r, t)),
          48,
        ),
        n.axis,
      );
    case 'loft':
      return loft(n.stations);
    case 'plate':
      return plate(n);
    case 'tube':
      return new T.TubeGeometry(curve(n.path), 32, n.radius, 48, false);
    case 'rotor':
      return blade(n);
    case 'line':
      return new T.BufferGeometry().setFromPoints(n.points.map((p) => new T.Vector3(...p)));
  }
}

/** Il testo delle etichette è scuro: un colore scuro diventa una tinta chiara della stessa tonalità. */
function readable(color) {
  const c = new T.Color(color);
  const hsl = c.getHSL({}, T.SRGBColorSpace);
  if (hsl.l < 0.75) c.setHSL(hsl.h, Math.min(hsl.s, 0.6), 0.85, T.SRGBColorSpace);
  return `#${c.getHexString()}`;
}

/**
 * Scena vuota costruita dall'intestazione (già validata dal daemon). I nodi si
 * aggiungono con addNode mentre arrivano; finish() unisce i box fermi per
 * ridurre le draw call una volta che la scena è completa.
 */
export function createScene(header) {
  const root = new T.Group();
  // misure in metri: tutto l'oggetto si riporta alla scala della scena
  const unit = header.size ? SCENE_SIZE / header.size : 1;
  root.scale.setScalar(unit);
  const clip = header.section ? new T.Plane(new T.Vector3(0, -1, 0), header.section.y * unit) : null;
  const defs = { __rubber: RUBBER, __rim: RIM_METAL, __clay: CLAY, __flow: FLOW, ...header.materials };
  const maquette = header.style !== 'real';
  /** In maquette restano colorati solo flussi, frecce e materiali trasparenti (vetri, getti). */
  const keepsColor = (n, material) =>
    n.shape === 'arrow' || n.showWhen === 'motion' || (defs[material]?.opacity ?? 1) < 1;
  /** Colore della parte spiegata: la tinta della sua etichetta, più piena (pezzo ↔ biglietto). */
  const accents = new Map();
  const accentOf = (labelColor, base, lightness = 0.55) => {
    const key = `${labelColor}|${base.uuid}|${lightness}`;
    if (!accents.has(key)) {
      const c = new T.Color(labelColor);
      const hsl = c.getHSL({});
      c.setHSL(hsl.h, Math.max(0.62, hsl.s), lightness);
      const m = base.clone();
      m.color = c;
      materials.add(m);
      accents.set(key, m);
    }
    return accents.get(key);
  };
  /** Parti con un id (la prima copia): bersagli degli agganci. */
  const parts = new Map();
  /** Dettagli in costruzione o montati: id della parte → sotto-scena. */
  const details = new Map();
  /** Gusci: parti che contengono parti montate al loro interno; con Sezione diventano trasparenti. */
  const shells = new Set();
  /**
   * Spaccato: in ogni guscio si apre una finestra sul lato rivolto verso chi guarda (+z), grande
   * quanto la zona delle parti interne e aperta verso l'alto (la camera guarda dall'alto): si toglie
   * il quarto di pelle davanti-sopra. La sagoma resta; dentro si vede il meccanismo.
   * La finestra è l'intersezione di 4 piani (clipIntersection): x nella zona, y sopra il fondo
   * delle parti interne, z oltre il centro.
   */
  const windows = new Map(); // guscio → { box (spazio di root), planes }
  const windowOf = (shell) => {
    if (!windows.has(shell)) {
      const planes = Array.from({ length: 4 }, () => new T.Plane());
      windows.set(shell, { box: new T.Box3(), planes, materials: new Map() });
    }
    return windows.get(shell);
  };
  const openWindow = (shell, inner, shellBox) => {
    const w = windowOf(shell);
    const size = shellBox.getSize(new T.Vector3());
    w.box.union(inner.clone().expandByVector(size.clone().multiplyScalar(0.08)));
    w.zc = Math.min(w.zc ?? Infinity, shellBox.getCenter(new T.Vector3()).z, inner.getCenter(new T.Vector3()).z);
    placeWindow(w);
  };
  /** I piani stanno nello spazio del mondo: si ricalcolano se la scena intera viene spostata. */
  const placeWindow = (w) => {
    root.updateMatrixWorld(true);
    const { min, max } = w.box;
    const zc = w.zc;
    const at = (x, y, z) => root.localToWorld(new T.Vector3(x, y, z));
    const [px0, px1, py0, pz] = w.planes;
    // dentro la finestra ogni piano dà distanza negativa: lì il guscio non si disegna
    px0.setFromNormalAndCoplanarPoint(new T.Vector3(-1, 0, 0), at(min.x, 0, 0));
    px1.setFromNormalAndCoplanarPoint(new T.Vector3(1, 0, 0), at(max.x, 0, 0));
    py0.setFromNormalAndCoplanarPoint(new T.Vector3(0, -1, 0), at(0, min.y, 0));
    pz.setFromNormalAndCoplanarPoint(new T.Vector3(0, 0, -1), at(0, 0, zc));
  };
  const ghostOf = (m, shell) => {
    const w = windowOf(shell);
    if (!w.materials.has(m)) {
      const g = m.clone();
      // stessi piani (stesso array): se la finestra cresce, il taglio la segue; anche l'ombra è tagliata
      Object.assign(g, { clippingPlanes: w.planes, clipIntersection: true, clipShadows: true, side: T.DoubleSide });
      // l'interno del guscio, visto dalla finestra, è più scuro: si capisce che è aperto
      const prev = g.onBeforeCompile;
      g.onBeforeCompile = (shader, r) => {
        prev?.call(g, shader, r);
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          '#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb *= 0.42;',
        );
      };
      g.customProgramCacheKey = () => 'cutaway';
      materials.add(g);
      w.materials.set(m, g);
    }
    return w.materials.get(m);
  };
  // tutte le copie del guscio (specchiate, ripetute): stesso id di parte
  const copiesOf = (shell) => {
    const id = shell.userData.part;
    if (!id) return [shell];
    const out = [];
    root.traverse((o) => {
      if (o.userData.part === id) out.push(o);
    });
    return out;
  };
  const setGhost = (shell, on) =>
    copiesOf(shell).forEach((copy) => ghostOne(copy, on, shell));
  const ghostOne = (copy, on, shell) =>
    copy.traverse((o) => {
      if (!o.isMesh) return;
      if (on && !o.userData.solid) {
        o.userData.solid = o.material;
        o.material = ghostOf(o.material, shell);
      } else if (!on && o.userData.solid) {
        o.material = o.userData.solid;
        delete o.userData.solid;
      }
    });
  const geometries = new Set();
  const materials = new Set();
  const standard = new Map();
  const lines = new Map();
  const shapes = new Map();
  const edges = new Map();
  const cutOnSection = [];
  const spinners = [];
  const toggles = { section: [], motion: [] };
  const edgeMat = new T.LineBasicMaterial({ color: '#333e43', transparent: true, opacity: 0.65 });
  materials.add(edgeMat);
  let section = true; // l'interno si vede subito: i gusci sono trasparenti, l'utente può richiuderli
  let motion = false;

  const surface = (name = '') => {
    if (!standard.has(name)) {
      const def = defs[name] ?? DEFAULT_MATERIAL;
      const translucent = def.opacity !== undefined && def.opacity < 1;
      const m = new T.MeshStandardMaterial({
        color: def.color,
        roughness: def.roughness ?? 0.5,
        metalness: def.metalness ?? 0.2,
        side: def.doubleSide ? T.DoubleSide : T.FrontSide,
        transparent: translucent,
        opacity: def.opacity ?? 1,
        depthWrite: !translucent,
        clipShadows: true, // ciò che la sezione toglie non fa ombra
      });
      if (def.cut === 'always' && clip) m.clippingPlanes = [clip];
      if (def.cut === 'section' && clip) {
        cutOnSection.push(m);
        if (section) m.clippingPlanes = [clip];
      }
      standard.set(name, m);
      materials.add(m);
    }
    return standard.get(name);
  };
  const stroke = (name = '') => {
    if (!lines.has(name)) {
      const def = defs[name] ?? DEFAULT_MATERIAL;
      const m = new T.LineBasicMaterial({
        color: def.color,
        transparent: def.opacity !== undefined,
        opacity: def.opacity ?? 1,
      });
      lines.set(name, m);
      materials.add(m);
    }
    return lines.get(name);
  };
  // forme identiche condividono una geometria; la chiave usa solo i parametri della forma
  const geometry = (n) => {
    const params = Object.fromEntries(Object.keys(SHAPES[n.shape]).map((k) => [k, n[k]]));
    const key = `${n.shape}:${JSON.stringify(params)}`;
    if (!shapes.has(key)) {
      const g = geometryFor(n);
      shapes.set(key, g);
      geometries.add(g);
    }
    return shapes.get(key);
  };
  const outline = (g) => {
    if (!edges.has(g)) {
      const e = new T.EdgesGeometry(g, 28);
      edges.set(g, e);
      geometries.add(e);
    }
    return edges.get(g);
  };

  /** Ruota: gomma (materiale del nodo o gomma nera), cerchio con razze e mozzo, asse lungo axis (default z). */
  function wheelObject(n, material) {
    const { radius: r, width: w, rim = 0.62, spokes = 5 } = n;
    const g = new T.Group();
    const inner = r * rim;
    const tireProfile = [];
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      // sezione della gomma: quasi rettangolare con fianchi arrotondati
      tireProfile.push(new T.Vector2((r + inner) / 2 + (Math.sign(c) * Math.abs(c) ** 0.6 * (r - inner)) / 2,
        (Math.sign(s) * Math.abs(s) ** 0.5 * w) / 2));
    }
    const tire = new T.LatheGeometry(tireProfile, 48);
    geometries.add(tire);
    g.add(new T.Mesh(tire, surface(material ?? '__rubber')));
    const rimMat = surface(n.rimMaterial ?? '__rim');
    const disc = new T.CylinderGeometry(inner * 1.02, inner * 1.02, w * 0.55, 40);
    const hub = new T.CylinderGeometry(inner * 0.22, inner * 0.26, w * 0.8, 24);
    geometries.add(disc).add(hub);
    const discMesh = new T.Mesh(disc, rimMat);
    discMesh.scale.set(1, 1, 1);
    g.add(discMesh, new T.Mesh(hub, rimMat));
    if (spokes > 0) {
      // razze: incise come raggi più chiari sul disco
      const spoke = new T.BoxGeometry(inner * 0.16, w * 0.62, inner * 0.92);
      geometries.add(spoke);
      for (let i = 0; i < spokes; i++) {
        const m = new T.Mesh(spoke, surface('__rim'));
        m.rotation.y = (i / spokes) * Math.PI * 2;
        m.position.set(Math.sin(m.rotation.y) * inner * 0.46, 0, Math.cos(m.rotation.y) * inner * 0.46);
        g.add(m);
      }
    }
    // la ruota è costruita attorno a y: si orienta sull'asse richiesto
    const axis = n.axis ?? 'z';
    if (axis.endsWith('x')) g.rotation.z = Math.PI / 2;
    else if (axis.endsWith('z')) g.rotation.x = Math.PI / 2;
    const holder = new T.Group();
    holder.add(g);
    return holder;
  }
  /**
   * Stadi: `count` dischi palettati in fila lungo axis (default x), da raggio `radius` a
   * `radiusEnd`, su un mozzo: compressori, turbine, pompe a più stadi. Pale con passo alterno
   * (rotore/statore), come nelle sezioni dei motori.
   */
  function stagesObject(n, material) {
    const { count, length, radius, radiusEnd = radius, blades = 18 } = n;
    const axis = (n.axis ?? 'x').replace('-', '');
    const hub = n.hub ?? Math.min(radius, radiusEnd) * 0.32;
    const g = new T.Group();
    const along = (v, t) => {
      v[axis] = -length / 2 + (count === 1 ? length / 2 : (t * length));
      return v;
    };
    const shaft = orient(new T.CylinderGeometry(hub, hub, length * 1.04, 32), axis);
    geometries.add(shaft);
    g.add(new T.Mesh(shaft, surface(material)));
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const r = radius + (radiusEnd - radius) * t;
      const width = ((2 * Math.PI * r) / blades) * 0.55;
      const geo = blade({ axis, inner: hub * 0.95, outer: r, width, sweep: 0, thickness: Math.max(r * 0.025, 0.002), pitch: i % 2 ? -32 : 32 });
      geometries.add(geo);
      const disc = new T.InstancedMesh(geo, surface(material), blades);
      for (let k = 0; k < blades; k++)
        disc.setMatrixAt(k, new T.Matrix4().makeRotationAxis(AXIS[axis], (k / blades) * Math.PI * 2));
      disc.instanceMatrix.needsUpdate = true;
      along(disc.position, t);
      g.add(disc);
    }
    return g;
  }
  /** Elica: pale a profilo ritorto attorno ad axis (default x) e ogiva davanti (verso -axis). */
  function propellerObject(n, material) {
    const { radius: r, count = 4, chord = r * 0.2, pitch = 22, spinner = r * 0.16 } = n;
    const axis = n.axis ?? 'x';
    const a = axis.replace('-', '');
    const g = new T.Group();
    const bladeGeo = blade({ axis: a, inner: spinner * 0.7, outer: r, width: chord, sweep: chord * 0.25, thickness: chord * 0.12, pitch });
    geometries.add(bladeGeo);
    const blades = new T.InstancedMesh(bladeGeo, surface(material), count);
    for (let i = 0; i < count; i++)
      blades.setMatrixAt(i, new T.Matrix4().makeRotationAxis(AXIS[a], (i / count) * Math.PI * 2));
    blades.instanceMatrix.needsUpdate = true;
    g.add(blades);
    if (spinner > 0) {
      const prof = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        prof.push(new T.Vector2(spinner * Math.sqrt(Math.sin((u * Math.PI) / 2)), -spinner * 2.2 * (1 - u)));
      }
      prof.push(new T.Vector2(spinner, spinner * 0.5), new T.Vector2(0, spinner * 0.5));
      const cone = orient(new T.LatheGeometry(prof, 32), a);
      geometries.add(cone);
      const m = new T.Mesh(cone, surface(material));
      if (axis.startsWith('-')) m.scale[a] = -1;
      g.add(m);
    }
    return g;
  }
  /**
   * Vernice: fasce e strisce di colore sulla parte, in frazioni del suo ingombro (x dal muso
   * alla coda, y dal basso all'alto, z da un fianco all'altro). Disegnata nello shader: bordi netti
   * su qualsiasi forma, senza geometria in più.
   */
  function painted(mesh, rules) {
    const g = mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const { min, max } = g.boundingBox;
    const size = new T.Vector3().subVectors(max, min);
    const lo = [];
    const hi = [];
    const colors = [];
    for (let i = 0; i < PAINT_MAX; i++) {
      const r = rules[i];
      const span = (k) => {
        const range = r?.[k] ?? [-1, 2];
        return [min[k] + range[0] * size[k], min[k] + range[1] * size[k]];
      };
      const [x, y, z] = ['x', 'y', 'z'].map(span);
      lo.push(new T.Vector3(x[0], y[0], z[0]));
      hi.push(new T.Vector3(x[1], y[1], z[1]));
      const c = new T.Color(r?.color ?? '#000000');
      colors.push(new T.Vector3(c.r, c.g, c.b));
    }
    const m = mesh.material.clone();
    materials.add(m);
    m.onBeforeCompile = (shader) => {
      shader.uniforms.paintCount = { value: Math.min(rules.length, PAINT_MAX) };
      shader.uniforms.paintLo = { value: lo };
      shader.uniforms.paintHi = { value: hi };
      shader.uniforms.paintColor = { value: colors };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPaintPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaintPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vPaintPos;
uniform int paintCount;
uniform vec3 paintLo[${PAINT_MAX}];
uniform vec3 paintHi[${PAINT_MAX}];
uniform vec3 paintColor[${PAINT_MAX}];`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
for (int i = 0; i < ${PAINT_MAX}; i++) {
  if (i >= paintCount) break;
  if (all(greaterThanEqual(vPaintPos, paintLo[i])) && all(lessThanEqual(vPaintPos, paintHi[i]))) diffuseColor.rgb = paintColor[i];
}`,
        );
    };
    m.customProgramCacheKey = () => 'paint';
    mesh.material = m;
  }

  function single(n, parent, material, labelled) {
    // le frecce devono vedersi: misura minima rispetto all'oggetto intero
    if (n.shape === 'arrow' && header.size) {
      const length = Math.max(n.length, header.size * 0.14);
      n = { ...n, length, radius: Math.max(n.radius ?? length * 0.05, header.size * 0.012) };
    }
    let obj;
    if (!n.shape) obj = new T.Group();
    else if (n.shape === 'wheel') obj = wheelObject(n, maquette ? '__clay' : material);
    else if (n.shape === 'propeller') obj = propellerObject(n, maquette ? '__clay' : material);
    else if (n.shape === 'stages') obj = stagesObject(n, maquette ? '__clay' : material);
    else if (n.shape === 'line') obj = new T.Line(geometry(n), stroke(material));
    else if (n.shape === 'rotor') {
      obj = new T.InstancedMesh(geometry(n), surface(maquette ? '__clay' : material), n.count);
      const axis = AXIS[(n.axis ?? 'y').replace('-', '')];
      for (let i = 0; i < n.count; i++)
        obj.setMatrixAt(i, new T.Matrix4().makeRotationAxis(axis, (i / n.count) * Math.PI * 2));
      obj.instanceMatrix.needsUpdate = true;
    } else {
      const mat = maquette && !keepsColor(n, material) ? '__clay' : n.shape === 'arrow' && !material ? '__flow' : material;
      obj = new T.Mesh(geometry(n), surface(mat));
    }
    if (n.shape === 'cylinder' && n.from) {
      const from = new T.Vector3(...n.from);
      const to = new T.Vector3(...n.to);
      obj.position.copy(from).add(to).multiplyScalar(0.5);
      obj.quaternion.setFromUnitVectors(AXIS.y, to.sub(from).normalize());
    }
    // con from/to la posizione e il verso li danno i due estremi
    if (n.position && !n.from) obj.position.set(...n.position);
    if (n.rotation && !n.from) obj.rotation.set(...n.rotation.map((a) => a * DEG));
    if (n.scale !== undefined)
      obj.scale.set(...(Array.isArray(n.scale) ? n.scale : [n.scale, n.scale, n.scale]));
    if (n.outline && obj.isMesh && !obj.isInstancedMesh)
      obj.add(new T.LineSegments(outline(obj.geometry), edgeMat));
    if (n.spin)
      spinners.push({
        obj,
        axis: n.spin.axis.replace('-', ''),
        speed: n.spin.speed * (n.spin.axis[0] === '-' ? -1 : 1),
      });
    if (n.showWhen) {
      obj.userData.when = n.showWhen;
      toggles[n.showWhen].push(obj);
      obj.visible = n.showWhen === 'section' ? section : motion;
    }
    if (n.spin || n.showWhen) obj.userData.dynamic = true;
    if (n.paint && !maquette && obj.isMesh && !obj.isInstancedMesh) painted(obj, n.paint);
    // un condotto lungo (un tubo, non una gabbia) fa da carter: può aprirsi nello spaccato
    obj.userData.shape = n.shape === 'duct' && n.height >= n.radius * 1.2 ? 'casing' : n.shape;
    // parte spiegata: tutte le sue copie (specchiate, ripetute) rimandano alla stessa etichetta
    if (n.label) obj.userData.labelNode = n;
    if (n.id) {
      obj.userData.part = n.id;
      if (!parts.has(n.id)) parts.set(n.id, obj);
    }
    parent.add(obj);
    if (n.label && !labelled.has(n)) labelled.set(n, obj);
    for (const child of n.children ?? []) {
      // un'elica dentro un condotto, senza asse, gira come il condotto (non come quella di un aereo)
      const inDuct = child.shape === 'propeller' && !child.axis && n.shape === 'duct';
      place(inDuct ? { ...child, axis: n.axis ?? 'y' } : child, obj, material, labelled);
    }
  }
  function repeated(n, parent, inherited, labelled) {
    const r = n.repeat;
    const own = n.material ?? inherited;
    if (!r) return single(n, parent, own, labelled);
    const pick = (i) => (r.materials ? r.materials[i % r.materials.length] : own);
    const copy = (i, setup) => {
      const g = new T.Group();
      setup(g);
      parent.add(g);
      single(n, g, pick(i), labelled);
    };
    if (r.grid) {
      const [nx, ny, nz] = r.grid;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++)
          for (let k = 0; k < nz; k++)
            copy(i + j + k, (g) => g.position.set(i * r.step[0], j * r.step[1], k * r.step[2]));
    } else if (r.radial) {
      const axis = AXIS[r.axis.replace('-', '')];
      for (let i = 0; i < r.radial; i++)
        copy(i, (g) => g.quaternion.setFromAxisAngle(axis, (i / r.radial) * Math.PI * 2));
    } else {
      const path = curve(r.along);
      for (let i = 0; i < r.count; i++) {
        const t = r.count === 1 ? 0 : i / (r.count - 1);
        copy(i, (g) => {
          g.position.copy(path.getPoint(t));
          g.quaternion.setFromUnitVectors(AXIS.z, path.getTangent(t));
        });
      }
    }
  }
  function place(n, parent, inherited, labelled) {
    repeated(n, parent, inherited, labelled);
    if (n.mirror) {
      const m = new T.Group();
      m.scale[n.mirror] = -1;
      parent.add(m);
      repeated(n, m, inherited, labelled);
    }
  }

  // ingombro delle parti visibili, senza ciò che appare solo col movimento (frecce, flussi)
  const visibleBounds = (obj, box) => {
    obj.updateWorldMatrix(true, true);
    const visit = (o) => {
      if (!o.visible || o.userData.when === 'motion') return;
      if (o.isMesh) box.expandByObject(o, false);
      for (const child of o.children) visit(child);
    };
    visit(obj);
    return box;
  };
  const addLabel = (l, at) => {
    const i = model.labels.length;
    model.labels.push({
      id: l.id ?? `label-${i}`,
      title: l.title,
      description: l.text ?? '',
      at,
      color: readable(l.color ?? LABEL_COLORS[i % LABEL_COLORS.length]),
      lane: l.lane ?? (i % 2 ? 'bottom' : 'top'),
    });
  };

  /** Ingombro di un oggetto nello spazio della scena (in metri se la scena è in metri). */
  const localBounds = (obj) => {
    root.updateMatrixWorld(true);
    const box = new T.Box3();
    obj.updateWorldMatrix(true, true);
    obj.traverse((o) => {
      if (o.isMesh && o.visible) box.expandByObject(o, true);
    });
    return box.applyMatrix4(root.matrixWorld.clone().invert());
  };
  const raycaster = new T.Raycaster();
  /** Nodo con etichetta → id dell'etichetta; e i materiali "accesi" del pezzo sotto il mouse. */
  const labelOf = new Map();
  const glows = new Map();
  const glowOf = (m) => {
    if (!glows.has(m)) {
      const g = m.clone();
      // azzurro: si stacca da quasi tutti i colori veri (gialli, rossi, grigi, neri)
      g.emissive = new T.Color('#2fa8ff');
      g.emissiveIntensity = 0.75;
      if (g.opacity < 0.5) g.opacity = 0.55; // un guscio trasparente si vede quando è acceso
      materials.add(g);
      glows.set(m, g);
    }
    return glows.get(m);
  };
  let lit = null;
  /**
   * Monta una parte su un'altra: `at` è un punto dell'ingombro della parte madre in frazioni
   * (x dal muso alla coda, y dal basso all'alto, z da un fianco all'altro). Se una frazione è 0 o 1
   * (con più d'una: prima z, poi y, poi x)
   * la parte si appoggia sulla superficie VERA della madre da quel lato (un raggio la cerca),
   * con l'origine sul punto; altrimenti l'origine va nel punto (parti interne). La copia
   * specchiata si fa dopo, così finisce dall'altra parte del piano di simmetria.
   */
  function attached(node, holder, labelled) {
    const { mirror, attach, ...own } = node;
    const f = { x: attach.at[0], y: attach.at[1], z: attach.at[2] };
    // la faccia della madre su cui si appoggia: la prima frazione a 0 o 1 (prima i fianchi,
    // es. ruota "in basso, sul fianco"); nessuna = parte interna
    const side = ['z', 'y', 'x'].find((k) => f[k] <= 0 || f[k] >= 1);
    // elica senza asse: gira attorno a quella faccia (sopra un motore = orizzontale come su un
    // drone, sul muso di una gondola = verticale come su un aereo)
    if (own.shape === 'propeller' && !own.axis) own.axis = side ?? 'x';
    const g = new T.Group();
    holder.add(g);
    repeated(own, g, undefined, labelled);
    const target = parts.get(attach.to);
    if (!target) {
      console.warn(`aggancio: parte «${attach.to}» non trovata, uso le coordinate`);
      if (attach.offset) g.position.set(...attach.offset);
    } else {
      // la parte madre può essere ancora in volo (animazione d'ingresso): si misura al suo posto
      let top = target;
      while (top.parent && top.parent !== root) top = top.parent;
      const flying = top.position.y;
      top.position.y = 0;
      const tb = localBounds(target);
      const cb = localBounds(g);
      const p = new T.Vector3(...['x', 'y', 'z'].map((k) => tb.min[k] + f[k] * (tb.max[k] - tb.min[k])));
      const pos = p.clone();
      if (side && !cb.isEmpty()) {
        const dir = f[side] >= 1 ? 1 : -1;
        // raggio da fuori verso l'interno della parte madre: dove tocca, lì c'è la superficie
        const from = p.clone();
        from[side] = dir > 0 ? tb.max[side] + 1 : tb.min[side] - 1;
        const ray = new T.Vector3();
        ray[side] = -dir;
        raycaster.set(root.localToWorld(from.clone()), ray);
        const hit = raycaster.intersectObject(target, true).find((h) => h.object.isMesh);
        if (hit) p[side] = root.worldToLocal(hit.point.clone())[side];
        // un filo dentro, niente fessure; una ruota entra per metà nel suo passaruota
        const sink = (node.shape === 'wheel' ? 0.5 : 0.04) * (cb.max[side] - cb.min[side]);
        pos[side] = dir > 0 ? p[side] - cb.min[side] - sink : p[side] - cb.max[side] + sink;
      }
      g.position.copy(pos);
      if (!side) {
        // parte interna (sta quasi tutta dentro la madre): la madre è un guscio, che Sezione rende
        // trasparente. Una parte solo infilata in superficie (cabina, gondola nell'ala) non conta.
        const box = localBounds(g);
        const vol = (b) => (b.isEmpty() ? 0 : (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z));
        const inside = vol(box) > 0 ? vol(box.clone().intersect(tb)) / vol(box) : 0;
        if (inside >= 0.8 && !NOT_SHELLS.has(target.userData.shape)) {
          shells.add(target);
          openWindow(target, box, tb);
          if (section) setGhost(target, true);
        }
      }
      if (attach.offset) {
        g.position.add(new T.Vector3(...attach.offset));
        // l'offset sposta, ma non stacca: se la parte non tocca più la madre, torna a contatto
        const box = localBounds(g);
        for (const k of ['x', 'y', 'z']) {
          if (box.min[k] > tb.max[k]) g.position[k] -= box.min[k] - tb.max[k];
          else if (box.max[k] < tb.min[k]) g.position[k] += tb.min[k] - box.max[k];
        }
      }
      top.position.y = flying;
    }
    if (mirror) {
      const m = new T.Group();
      m.scale[mirror] = -1;
      holder.add(m);
      const g2 = new T.Group();
      g2.position.copy(g.position);
      m.add(g2);
      repeated(own, g2, undefined, labelled);
    }
  }

  const model = {
    root,
    /** Scala della scena rispetto alle misure del modello (≠ 1 con le misure in metri). */
    unit,
    /** Parti di primo livello arrivate finora. */
    parts: 0,
    /** Riposiziona le finestre degli spaccati (dopo aver spostato root, es. un dettaglio). */
    refreshWindows() {
      for (const w of windows.values()) placeWindow(w);
    },
    /**
     * Dettaglio di una parte (seconda chiamata al modello): una scena a sé nello spazio della
     * parte, costruita a parte e messa al suo posto, in tutte le copie, quando è completa.
     */
    beginDetail(target, detailHeader) {
      if (!parts.has(target)) return false;
      const sub = createScene({ ...detailHeader, size: undefined, style: 'real' });
      details.set(target, sub);
      return true;
    },
    addDetailNode(target, node) {
      const sub = details.get(target);
      if (!sub) return;
      try {
        sub.addNode(node);
      } catch (err) {
        console.warn('dettaglio: parte scartata', err);
      }
    },
    endDetail(target) {
      const sub = details.get(target);
      const first = parts.get(target);
      if (!sub || !first || sub.parts === 0) return false;
      sub.finish();
      model.highlight(null);
      // in maquette il dettaglio prende la tinta dell'etichetta della parte, in più toni
      const id = first.userData.labelNode ? labelOf.get(first.userData.labelNode) : null;
      const color = id ? model.labels.find((l) => l.id === id)?.color : null;
      if (maquette && color) {
        sub.root.children.forEach((holder, i) =>
          holder.traverse((m) => {
            if (!m.isMesh || m.material.transparent || m.userData.shape === 'arrow') return;
            if (m.parent?.userData.shape === 'arrow') return;
            const c = m.material.color.getHSL({});
            const hot = c.s > 0.5 && (c.h < 0.11 || c.h > 0.95); // ciò che brucia resta caldo
            if (!hot) m.material = accentOf(color, m.material, [0.42, 0.55, 0.68][i % 3]);
          }),
        );
      }
      for (const copy of copiesOf(first)) {
        const holder = copy === first ? sub.root : sub.root.clone();
        holder.position.copy(copy.position);
        holder.quaternion.copy(copy.quaternion);
        holder.scale.copy(copy.scale);
        holder.userData.labelNode = copy.userData.labelNode;
        copy.parent.add(holder);
        copy.visible = false;
      }
      // il dettaglio ora sta al posto del pezzo: le sue finestre di spaccato vanno spostate lì
      sub.refreshWindows();
      return true;
    },
    /** Id dell'etichetta della parte a cui appartiene un oggetto colpito (o null). */
    labelAt(object) {
      for (let o = object; o && o !== root; o = o.parent)
        if (o.userData.labelNode) return labelOf.get(o.userData.labelNode) ?? null;
      return null;
    },
    /** Accende (o spegne, con null) tutte le copie della parte con quell'etichetta. */
    highlight(id) {
      if (lit === id) return;
      lit = id;
      root.traverse((o) => {
        if (!o.isMesh) return;
        let on = false;
        for (let p = o; p && p !== root; p = p.parent)
          if (p.userData.labelNode) {
            on = id !== null && labelOf.get(p.userData.labelNode) === id;
            break;
          }
        if (on && !o.userData.lit) {
          o.userData.lit = o.material;
          o.material = glowOf(o.material);
        } else if (!on && o.userData.lit) {
          o.material = o.userData.lit;
          delete o.userData.lit;
        }
      });
    },
    /** Parti che fanno da guscio (prove della Sezione). */
    shellIds: () =>
      [...shells].map((o) => {
        const w = windows.get(o);
        let cut = 0;
        o.traverse((m) => {
          if (m.isMesh && m.material.clipIntersection) cut++;
        });
        const r = (v) => Math.round(v * 100) / 100;
        return `${o.userData.part ?? '?'} [finestra x ${r(w.box.min.x)}..${r(w.box.max.x)} y ${r(w.box.min.y)}..${r(w.box.max.y)}, mesh tagliate ${cut}]`;
      }),
    /** Ingombro di ogni parte di primo livello (coordinate di root): la sagoma vera, per le etichette. */
    partBounds() {
      root.updateMatrixWorld(true);
      const inv = root.matrixWorld.clone().invert();
      const out = [];
      for (const holder of root.children) {
        const box = visibleBounds(holder, new T.Box3());
        if (!box.isEmpty()) out.push(box.applyMatrix4(inv));
      }
      return out;
    },
    /** Gli oggetti (tutte le copie, dettaglio compreso) della parte con quell'etichetta. */
    labelObjects(id) {
      const out = [];
      root.traverse((o) => {
        if (o.userData.labelNode && labelOf.get(o.userData.labelNode) === id) out.push(o);
      });
      return out;
    },
    partBoxes() {
      const r1 = (v) => Math.round(v * 10000) / 10000;
      return Object.fromEntries(
        [...parts].map(([id, o]) => {
          const b = localBounds(o);
          return [id, { min: b.min.toArray().map(r1), max: b.max.toArray().map(r1) }];
        }),
      );
    },
    title: header.title ?? '',
    labels: [],
    direction: header.camera?.direction ?? [-0.45, 0.32, 0.8],
    /** Ingombro delle parti visibili: serve a inquadrare (le frecce di Movimento non lo allargano). */
    bounds: new T.Box3(),
    /** Sezione disponibile: piano di taglio del modello o parti interne con il loro guscio. */
    get hasSection() {
      return Boolean(clip) || shells.size > 0;
    },
    hasMotion: false,
    /** Aggiunge un nodo di primo livello; restituisce il gruppo che lo contiene (per l'animazione d'ingresso). */
    addNode(node) {
      const holder = new T.Group();
      root.add(holder);
      model.parts++;
      const labelled = new Map();
      if (node.attach) attached(node, holder, labelled);
      else place(node, holder, undefined, labelled);
      model.hasMotion = spinners.length > 0 || toggles.motion.length > 0;
      const box = visibleBounds(holder, new T.Box3());
      if (!box.isEmpty()) model.bounds.union(box);
      // etichetta della parte: nel punto indicato o al centro della parte. Una parte montata con
      // attach non ha coordinate note al modello: lì "at" non vuol dire nulla, vale il centro
      for (const [n, obj] of labelled) {
        // in coordinate di root (il visore applica lui la trasformazione di root)
        const at = n.label.at && !node.attach
          ? new T.Vector3(...n.label.at)
          : root.worldToLocal(visibleBounds(obj, new T.Box3()).getCenter(new T.Vector3()));
        addLabel(n.label, at);
        labelOf.set(n, model.labels.at(-1).id);
        // maquette: la parte spiegata prende la tinta della sua etichetta (non il corpo principale)
        // una parte grande (ala, scocca) colorata coprirebbe tutto: resta chiara, si accende al passaggio
        const big = header.size && Math.max(...localBounds(obj).getSize(new T.Vector3()).toArray()) > header.size * 0.5;
        if (maquette && model.parts > 1 && !big) {
          const color = model.labels.at(-1).color;
          root.traverse((o) => {
            if (o.userData.labelNode !== n) return;
            o.traverse((m) => {
              if (m.isMesh && !(m.material.transparent && m.material.opacity < 1)) m.material = accentOf(color, m.material);
            });
          });
        }
      }
      return holder;
    },
    addLabels(list) {
      for (const l of list) addLabel(l, new T.Vector3(...l.at));
    },
    /** Scena completa: i box fermi con lo stesso materiale diventano una mesh sola. */
    finish() {
      root.updateMatrixWorld(true);
      const batches = new Map();
      root.traverse((o) => {
        if (
          !o.isMesh ||
          o.isInstancedMesh ||
          o.geometry.constructor !== T.BoxGeometry ||
          o.children.length
        )
          return;
        // restano a sé le parti che si muovono, i gusci (Sezione) e quelle spiegate (si accendono)
        for (let p = o; p; p = p.parent)
          if (p.userData.dynamic || p.userData.labelNode || shells.has(p)) return;
        const batch = batches.get(o.material) ?? [];
        batch.push(o);
        batches.set(o.material, batch);
      });
      // la mesh unita sta dentro root (che può essere scalata): coordinate relative a root
      const toRoot = root.matrixWorld.clone().invert();
      for (const [material, objects] of batches) {
        if (objects.length < 2) continue;
        const copies = objects.map((o) => {
          const g = o.geometry.clone().applyMatrix4(toRoot.clone().multiply(o.matrixWorld));
          // una copia specchiata ha i triangoli rovesciati: ripristina il verso prima di unirla
          if (o.matrixWorld.determinant() < 0) {
            const index = g.index.array;
            for (let i = 0; i < index.length; i += 3)
              [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
          }
          return g;
        });
        const merged = mergeGeometries(copies);
        geometries.add(merged);
        root.add(new T.Mesh(merged, material));
        for (const g of copies) g.dispose();
        for (const o of objects) o.removeFromParent();
      }
    },
    setSection(on) {
      model.highlight(null); // i materiali accesi si scambiano: prima si spegne, poi si cambia
      section = on;
      for (const m of cutOnSection) {
        m.clippingPlanes = on ? [clip] : null;
        m.needsUpdate = true;
      }
      for (const o of toggles.section) o.visible = on;
      for (const s of shells) setGhost(s, on);
    },
    setMotion(on) {
      motion = on;
      for (const o of toggles.motion) o.visible = on;
    },
    animate(dt) {
      for (const s of spinners) s.obj.rotation[s.axis] += dt * s.speed;
    },
    dispose() {
      for (const sub of details.values()) sub.dispose();
      root.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
  return model;
}
