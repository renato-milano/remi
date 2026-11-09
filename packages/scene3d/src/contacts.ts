import { sampleAnimation } from './animation.js';
import { type Scene, type SceneNode, type Vec3, validateScene } from './schema.js';

type Matrix = [Vec3, Vec3, Vec3];
type Pose = { position: Vec3; axes: Matrix; scale: number };
type Part = { node: SceneNode; chain: SceneNode[]; body: SceneNode };
const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]) as Vec3;
const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3;
const mul = (a: Vec3, n: number): Vec3 => a.map((v) => v * n) as Vec3;
const dot = (a: Vec3, b: Vec3) => a.reduce((n, v, i) => n + v * b[i], 0);
const length = (a: Vec3) => Math.hypot(...a);
const normalize = (a: Vec3) => mul(a, 1 / (length(a) || 1));
const identity = (): Matrix => [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const transform = (axes: Matrix, p: Vec3): Vec3 =>
  add(add(mul(axes[0], p[0]), mul(axes[1], p[1])), mul(axes[2], p[2]));
const inverse = (axes: Matrix, p: Vec3): Vec3 => axes.map((a) => dot(a, p)) as Vec3;
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const vector = (value: unknown, fallback: Vec3 = [0, 0, 0]) => (value ?? fallback) as Vec3;
const TOLERANCE = 0.002; // metri, non modificabile dal generatore

/** Stesso ordine Euler XYZ del viewer Three.js, vettori colonna. */
function rotation(node: SceneNode): Matrix {
  const [x, y, z] = vector(node.rotation).map((v) => (v * Math.PI) / 180);
  const rotate = ([a, b, c]: Vec3): Vec3 => {
    const u = a * Math.cos(z) - b * Math.sin(z);
    const v = a * Math.sin(z) + b * Math.cos(z);
    const w = -u * Math.sin(y) + c * Math.cos(y);
    const q = u * Math.cos(y) + c * Math.sin(y);
    return [q, v * Math.cos(x) - w * Math.sin(x), v * Math.sin(x) + w * Math.cos(x)];
  };
  return identity().map(rotate) as Matrix;
}
function pose(part: Part, time: number): Pose {
  let position: Vec3 = [0, 0, 0];
  let axes = identity();
  let scale = 1;
  for (const n of part.chain) {
    const p = add(vector(n.position), n.animation ? sampleAnimation(n.animation, time) : [0, 0, 0]);
    position = add(position, transform(axes, mul(p, scale)));
    axes = rotation(n).map((a) => transform(axes, a)) as Matrix;
    scale *= typeof n.scale === 'number' ? n.scale : 1;
  }
  return { position, axes, scale };
}
const worldPoint = (p: Pose, point: Vec3) =>
  add(p.position, transform(p.axes, mul(point, p.scale)));
const halfSize = (n: SceneNode) => mul(vector(n.size), 0.5);
function radius(n: SceneNode): number {
  if (n.shape === 'sphere') return (n.radius as number | undefined) ?? 1;
  if (n.shape === 'roundedBox') {
    const min = Math.min(...vector(n.size));
    return Math.max(0, Math.min((n.radius as number | undefined) ?? min * 0.15, min / 2 - 0.001));
  }
  return 0;
}
function distance(n: SceneNode, point: Vec3): number {
  if (n.shape === 'sphere') return length(point) - radius(n);
  const r = radius(n);
  const half = halfSize(n);
  const q = point.map((v, i) => Math.abs(v) - half[i] + r) as Vec3;
  return length(q.map((v) => Math.max(v, 0)) as Vec3) + Math.min(Math.max(...q), 0) - r;
}
/** Intersezione della direzione locale con la superficie, calcolata dal motore. */
function surfacePoint(node: SceneNode, endpoint: { point?: Vec3; direction?: Vec3 }): Vec3 {
  if (endpoint.point) return endpoint.point;
  const ray = normalize(endpoint.direction ?? [1, 0, 0]);
  if (node.shape === 'sphere') return mul(ray, radius(node));
  let lo = 0;
  let hi = length(halfSize(node)) * 2;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (distance(node, mul(ray, mid)) > 0) hi = mid;
    else lo = mid;
  }
  return mul(ray, (lo + hi) / 2);
}
function normal(n: SceneNode, point: Vec3): Vec3 {
  const h = 1e-5;
  return normalize(
    point.map((_, i) => {
      const a = [...point] as Vec3;
      const b = [...point] as Vec3;
      a[i] += h;
      b[i] -= h;
      return distance(n, a) - distance(n, b);
    }) as Vec3,
  );
}
/** Separazione firmata: positiva = distacco. RoundedBox supportato contro sfere. */
function gap(a: Part, b: Part, time: number): number {
  const pa = pose(a, time);
  const pb = pose(b, time);
  if (a.node.shape === 'sphere' || b.node.shape === 'sphere') {
    const sphere = a.node.shape === 'sphere' ? a : b;
    const other = sphere === a ? b : a;
    const ps = sphere === a ? pa : pb;
    const po = sphere === a ? pb : pa;
    const center = mul(inverse(po.axes, sub(ps.position, po.position)), 1 / po.scale);
    return distance(other.node, center) * po.scale - radius(sphere.node) * ps.scale;
  }
  // Separating Axis Theorem per due box orientati.
  const axes = [...pa.axes, ...pb.axes, ...pa.axes.flatMap((x) => pb.axes.map((y) => cross(x, y)))];
  const ha = mul(halfSize(a.node), pa.scale);
  const hb = mul(halfSize(b.node), pb.scale);
  const delta = sub(pb.position, pa.position);
  let separation = Number.NEGATIVE_INFINITY;
  for (const axis of axes) {
    if (length(axis) < 1e-8) continue;
    const n = normalize(axis);
    const project = (p: Pose, h: Vec3) =>
      p.axes.reduce((sum, v, i) => sum + Math.abs(dot(v, n)) * h[i], 0);
    separation = Math.max(separation, Math.abs(dot(delta, n)) - project(pa, ha) - project(pb, hb));
  }
  return separation;
}

export interface ContactCompilation {
  scene: Scene;
  errors: string[];
}

/** Compila su una copia; fallisce prima della riproduzione, senza correggere silenziosamente i vincoli incompatibili. */
export function compileContacts(input: Scene): ContactCompilation {
  const scene = structuredClone(input);
  const errors = validateScene(scene);
  const fail = (id: string, message: string) => errors.push(`contacts.${id}: ${message}`);
  if (errors.length || !scene.contacts?.length) return { scene, errors };
  const parts = new Map<string, Part>();
  const index = (node: SceneNode, body: SceneNode, chain: SceneNode[]) => {
    if (node.id) {
      if (parts.has(node.id)) fail(node.id, 'id duplicato');
      parts.set(node.id, { node, body, chain: [...chain, node] });
    }
    for (const child of node.children ?? []) index(child, body, [...chain, node]);
  };
  for (const node of scene.nodes) index(node, node, []);
  if (errors.length) return { scene, errors };
  const ids = new Set<string>();
  const movers = new Set<string>();
  const responses = new Set<string>();
  const pairs: { id: string; time: number; source: Part; target: Part; duration: number }[] = [];
  for (const contact of scene.contacts) {
    const { id, time } = contact;
    if (ids.has(id)) {
      fail(id, 'id contatto duplicato');
      continue;
    }
    ids.add(id);
    const mover = parts.get(contact.mover);
    const source = parts.get(contact.source.node);
    const target = parts.get(contact.target.node);
    const response = contact.response ? parts.get(contact.response) : undefined;
    if (!mover || !source || !target || (contact.response && !response)) {
      fail(id, 'riferimento a un nodo inesistente');
      continue;
    }
    if (mover.node !== mover.body || !mover.node.animation || source.body !== mover.node) {
      fail(id, 'mover deve essere il corpo animato di primo livello che contiene source');
      continue;
    }
    if (
      target.body === mover.body ||
      (response && (response.node !== target.body || !response.node.animation))
    ) {
      fail(
        id,
        'target deve essere un altro corpo; response deve essere il suo gruppo animato di primo livello',
      );
      continue;
    }
    if (!response && target.body.animation) {
      fail(id, 'un bersaglio animato richiede response');
      continue;
    }
    if (
      movers.has(contact.mover) ||
      responses.has(contact.mover) ||
      (contact.response && (movers.has(contact.response) || responses.has(contact.response)))
    ) {
      fail(id, 'prima versione: un solo contatto per corpo, senza catene di urti');
      continue;
    }
    const animation = mover.node.animation;
    if (time >= animation.duration || animation.loop === 'pingpong') {
      fail(id, 'time deve precedere duration; usare once o repeat');
      continue;
    }
    const responseAnimation = response?.node.animation;
    if (
      responseAnimation &&
      (responseAnimation.duration !== animation.duration ||
        (responseAnimation.loop ?? 'repeat') !== (animation.loop ?? 'repeat'))
    ) {
      fail(id, 'mover e response devono condividere duration e loop');
      continue;
    }
    let valid = true;
    for (const endpoint of [source, target]) {
      if (!['sphere', 'box', 'roundedBox'].includes(String(endpoint.node.shape))) {
        fail(id, 'superfici supportate: sphere, box, roundedBox contro sphere');
        valid = false;
      }
      for (const node of endpoint.chain) {
        if (
          node.attach ||
          node.repeat ||
          node.mirror ||
          (node.scale !== undefined && (typeof node.scale !== 'number' || node.scale <= 0)) ||
          (node !== endpoint.body && node.animation) ||
          node.spin
        ) {
          // Lo spin sferico non cambia la superficie di collisione.
          if (
            node === endpoint.node &&
            node.shape === 'sphere' &&
            endpoint === target &&
            response &&
            node.spin &&
            !node.attach &&
            !node.repeat &&
            !node.mirror &&
            node.scale === undefined &&
            (node === endpoint.body || !node.animation)
          )
            continue;
          fail(
            id,
            'corpi di contatto rigidi: niente attach, copie, scale non uniformi, animazioni interne o spin sui box',
          );
          valid = false;
        }
      }
    }
    if (
      source.node.shape !== 'sphere' &&
      target.node.shape !== 'sphere' &&
      (source.node.shape === 'roundedBox' || target.node.shape === 'roundedBox')
    ) {
      fail(id, 'roundedBox richiede una sfera come controparte');
      valid = false;
    }
    const sourcePoint = surfacePoint(source.node, contact.source);
    const targetPoint = surfacePoint(target.node, contact.target);
    contact.source = { node: contact.source.node, point: sourcePoint };
    contact.target = { node: contact.target.node, point: targetPoint };
    for (const [endpoint, point] of [
      [source, sourcePoint],
      [target, targetPoint],
    ] as const) {
      if (Math.abs(distance(endpoint.node, point)) > TOLERANCE) {
        const offset = distance(endpoint.node, point);
        const dimensions =
          endpoint.node.shape === 'sphere'
            ? `radius=${radius(endpoint.node)}`
            : `size=${JSON.stringify(endpoint.node.size)}, radius=${radius(endpoint.node)}`;
        fail(
          id,
          `${endpoint.node.id}: point ${JSON.stringify(point)} dista ${Math.abs(offset * 1000).toFixed(2)} mm dalla superficie (${offset < 0 ? 'interno' : 'esterno'}); ${dimensions}. Correggere il punto locale sulla superficie.`,
        );
        valid = false;
      }
    }
    if (!valid) continue;
    if (response && responseAnimation) {
      const a = responseAnimation;
      const initial = a.keyframes[0].offset;
      a.keyframes = [
        { time: 0, offset: [...initial] },
        { time, offset: [...initial] },
        ...a.keyframes.filter((f) => f.time > time),
      ];
      const syncSpin = (n: SceneNode) => {
        if (n.spin) n.spin = { ...(n.spin as object), start: time };
        for (const c of n.children ?? []) syncSpin(c);
      };
      syncSpin(response.node);
    }
    const ps = pose(source, time);
    const pt = pose(target, time);
    const ns = transform(ps.axes, normal(source.node, sourcePoint));
    const nt = transform(pt.axes, normal(target.node, targetPoint));
    if (dot(ns, nt) > -0.95) {
      const suggestedTarget =
        target.node.shape === 'sphere'
          ? ` Target.point compatibile con questa source: ${JSON.stringify(mul(inverse(pt.axes, mul(ns, -1)), radius(target.node)).map((v) => Number(v.toFixed(8))))}.`
          : '';
      fail(
        id,
        `le superfici non sono contrapposte: correggere orientamento o punto di contatto. Normale source nel mondo ${JSON.stringify(ns)}, target ${JSON.stringify(nt)}.${suggestedTarget}`,
      );
      continue;
    }
    if (responseAnimation) {
      const initial = responseAnimation.keyframes[0].offset;
      const firstMove = responseAnimation.keyframes.find(
        (frame) => frame.time > time && length(sub(frame.offset, initial)) > 1e-6,
      );
      if (firstMove && dot(sub(firstMove.offset, initial), nt) > 1e-6) {
        fail(
          id,
          `response parte verso il mover: primo spostamento ${JSON.stringify(sub(firstMove.offset, initial))}, normale esterna target ${JSON.stringify(nt)}. Scegliere target.point sul lato opposto alla partenza della palla e orientare source con normali contrapposte, oppure correggere la traiettoria di response.`,
        );
        continue;
      }
    }
    const delta = sub(worldPoint(pt, targetPoint), worldPoint(ps, sourcePoint));
    // Il mover è top-level: il delta è negli stessi assi degli offset della sua traiettoria.
    animation.keyframes = animation.keyframes.map((f) => ({
      time: f.time,
      offset: add(f.offset, delta),
    }));
    if (!animation.keyframes.some((f) => f.time === time))
      animation.keyframes.push({ time, offset: sampleAnimation(animation, time) });
    animation.keyframes.sort((a, b) => a.time - b.time);
    // L'avvicinamento segue la normale della superficie scelta: non attraversa il bersaglio
    // quando le coordinate libere del generatore provengono dal lato opposto.
    const impact = sampleAnimation(animation, time);
    for (const frame of animation.keyframes) {
      if (frame.time >= time) continue;
      const clearance = Math.max(length(sub(frame.offset, impact)), 0.05 * (1 - frame.time / time));
      frame.offset = add(impact, mul(nt, clearance));
    }

    movers.add(contact.mover);
    if (contact.response) responses.add(contact.response);
    pairs.push({ id, time, source, target, duration: animation.duration });
  }
  if (errors.length) return { scene, errors };
  for (const pair of pairs) {
    const { id, time, source, target, duration } = pair;
    const frames = [
      ...(source.body.animation?.keyframes ?? []),
      ...(target.body.animation?.keyframes ?? []),
    ];
    const travel = [source.body, target.body].reduce((sum, node) => {
      const frames = node.animation?.keyframes ?? [];
      return (
        sum +
        frames
          .slice(1)
          .reduce((distance, frame, i) => distance + length(sub(frame.offset, frames[i].offset)), 0)
      );
    }, 0);
    // Passo di campionamento: 2 mm, ma al massimo 4096 campioni in tutto. Su percorsi lunghi
    // (un tiro di 8 m, un elicottero che sale di 15 m) il passo si allarga di poco invece di
    // rifiutare la scena: su corpi di decine di centimetri qualche millimetro non cambia l'esito.
    const step = Math.max(TOLERANCE, travel / 4096);
    // Ogni tratto ha velocità costante. Campionamento spaziale <= step, più tutti i keyframe.
    const times = new Set<number>([
      0,
      time,
      duration - 1e-7,
      ...frames.map((f) => Math.min(f.time, duration - 1e-7)),
    ]);
    const breaks = [...new Set([0, time, ...frames.map((f) => f.time), duration])].sort(
      (a, b) => a - b,
    );
    for (let i = 1; i < breaks.length; i++) {
      const lo = breaks[i - 1];
      const hi = breaks[i];
      const displacement =
        length(
          sub(pose(source, hi === duration ? hi - 1e-7 : hi).position, pose(source, lo).position),
        ) +
        length(
          sub(pose(target, hi === duration ? hi - 1e-7 : hi).position, pose(target, lo).position),
        );
      const count = Math.max(2, Math.ceil(displacement / step));
      for (let k = 0; k <= count; k++)
        times.add(Math.min(lo + ((hi - lo) * k) / count, duration - 1e-7));
    }
    let reported = false;
    for (const t of [...times].sort((a, b) => a - b)) {
      const separation = gap(source, target, t);
      if (t < time - 1e-4 && separation <= 1e-7) {
        fail(id, `contatto anticipato a ${t.toFixed(3)} s, previsto a ${time} s`);
        reported = true;
        break;
      }
      if (separation < -TOLERANCE) {
        fail(
          id,
          `compenetrazione tra ${source.node.id} e ${target.node.id} a ${t.toFixed(3)} s (${t < time ? 'prima' : 'dopo'} del contatto a ${time} s)`,
        );
        reported = true;
        break;
      }
    }
    if (!reported && Math.abs(gap(source, target, time)) > TOLERANCE)
      fail(id, 'i punti coincidono ma le superfici non sono tangenti');
  }
  if (!errors.length) errors.push(...validateScene(scene));
  return { scene, errors };
}
