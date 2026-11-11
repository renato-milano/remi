/**
 * Formato della scena 3D (versione 1) e sua validazione. Ogni errore porta il
 * percorso JSON (`nodes[3].children[1].size: …`): in streaming i nodi non validi
 * si scartano e gli errori finiscono nel log, così si vede cosa sbaglia il modello.
 */

export type Vec3 = [number, number, number];

export interface SceneMaterial {
  color: string;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  doubleSide?: boolean;
  cut?: 'section' | 'always';
}

export interface SceneLabel {
  id?: string;
  title: string;
  text?: string;
  /** Punto della scena; sulle etichette dei nodi è facoltativo (default: centro della parte). */
  at?: Vec3;
  color?: string;
  lane?: 'top' | 'bottom';
}

export interface SceneAnimation {
  /** Tempi in secondi; offset locali rispetto alla posa iniziale. */
  duration: number;
  loop?: 'repeat' | 'pingpong' | 'once';
  /** rotation: assetto in gradi rispetto alla posa iniziale, negli assi del genitore (facoltativo). */
  keyframes: { time: number; offset: Vec3; rotation?: Vec3 }[];
}

/** Contatto tra due superfici: punti in metri nello spazio locale dei nodi. */
export interface SceneContact {
  id: string;
  time: number;
  mover: string;
  source: { node: string; point?: Vec3; direction?: Vec3 };
  target: { node: string; point?: Vec3; direction?: Vec3 };
  /** Corpo che reagisce (nodo di primo livello), se il bersaglio si muove. */
  response?: string;
}

/** Un nodo: forma (`shape`) o gruppo (`children`). I parametri della forma stanno sul nodo stesso. */
export interface SceneNode {
  id?: string;
  shape?: string;
  material?: string;
  label?: SceneLabel;
  children?: SceneNode[];
  animation?: SceneAnimation;
  [key: string]: unknown;
}

/** Tutto ciò che precede `nodes`: arriva per primo in streaming. */
export interface SceneHeader {
  version: 1;
  title?: string;
  camera?: { direction: Vec3 };
  section?: { y: number };
  /** Dimensione maggiore dell'oggetto vero, in metri: le misure dei nodi sono in metri. */
  size?: number;
  /** Campo storico, ignorato dal motore: i colori sono sempre quelli dei materiali (colori veri). */
  style?: 'maquette' | 'real';
  materials: Record<string, SceneMaterial>;
  contacts?: SceneContact[];
}

export interface Scene extends SceneHeader {
  nodes: SceneNode[];
  labels?: SceneLabel[];
}

export const AXES = ['x', 'y', 'z', '-x', '-y', '-z'] as const;
/** Oggetti massimi dopo ripetizioni e specchiature; annidamento e lunghezza delle liste. */
export const LIMITS = { depth: 12, objects: 6000, list: 64 };

type Check = (v: unknown) => string | null;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const check = (ok: boolean, message: string) => (ok ? null : message);
const tuple =
  (n: number, pred: (x: unknown) => boolean) =>
  (v: unknown): v is unknown[] =>
    Array.isArray(v) && v.length === n && v.every(pred);
const vec3 = tuple(3, num) as (v: unknown) => v is Vec3;
const list =
  (item: (x: unknown) => boolean, min: number, what: string): Check =>
  (v) =>
    check(
      Array.isArray(v) && v.length >= min && v.length <= LIMITS.list && v.every(item),
      `atteso un array di ${min}–${LIMITS.list} ${what}`,
    );
const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const types: Record<string, Check> = {
  number: (v) => check(num(v), 'atteso un numero'),
  positive: (v) => check(num(v) && v > 0, 'atteso un numero > 0'),
  nonNegative: (v) => check(num(v) && v >= 0, 'atteso un numero ≥ 0'),
  unit: (v) => check(num(v) && v >= 0 && v <= 1, 'atteso un numero tra 0 e 1'),
  opacity: (v) => check(num(v) && v > 0 && v <= 1, 'atteso un numero > 0 e ≤ 1'),
  boolean: (v) => check(typeof v === 'boolean', 'atteso true o false'),
  text: (v) => check(typeof v === 'string' && v.trim() !== '', 'attesa una stringa non vuota'),
  color: (v) =>
    check(typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v), 'atteso un colore #rrggbb'),
  axis: (v) => check((AXES as readonly unknown[]).includes(v), `atteso uno di: ${AXES.join(', ')}`),
  vec3: (v) => check(vec3(v), 'atteso [x, y, z]'),
  size3: (v) => check(vec3(v) && v.every((n) => n > 0), 'atteso [x, y, z] con valori > 0'),
  scale: (v) =>
    check(
      (num(v) && v !== 0) || (vec3(v) && v.every((n) => n !== 0)),
      'atteso un numero o [x, y, z], diversi da 0',
    ),
  points2: list(tuple(2, num), 3, 'punti [x, z]'),
  outline2: list(tuple(2, num), 3, 'punti [x, y]'),
  profile: list(
    (p) => tuple(2, num)(p) && (p as number[])[1] >= 0,
    2,
    'punti [posizione, raggio ≥ 0]',
  ),
  path: list(vec3, 2, 'punti [x, y, z]'),
  stations: list(
    (s) => tuple(4, num)(s) && (s as number[])[1] >= 0 && (s as number[])[2] >= 0,
    2,
    'sezioni [x, mezza larghezza, mezza altezza, y]',
  ),
  holes: list((h) => tuple(3, num)(h) && (h as number[])[2] > 0, 1, 'fori [x, z, raggio]'),
  balls: (v) =>
    check(
      Array.isArray(v) &&
        v.length >= 1 &&
        v.length <= 24 &&
        v.every((b) => tuple(4, num)(b) && (b as number[])[3] > 0),
      'attese 1-24 sfere [x, y, z, raggio > 0]',
    ),
  rect: (v) =>
    check(
      tuple(2, num)(v) && (v as number[]).every((n) => n > 0),
      'atteso [larghezza x, profondità z] > 0',
    ),
  count: (v) =>
    check(
      Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 128,
      'atteso un intero tra 1 e 128',
    ),
  rotorCount: (v) =>
    check(
      Number.isInteger(v) && (v as number) >= 2 && (v as number) <= 64,
      'atteso un intero tra 2 e 64',
    ),
  grid: (v) =>
    check(
      tuple(3, (n) => Number.isInteger(n) && (n as number) >= 1)(v) &&
        (v as number[])[0] * (v as number[])[1] * (v as number[])[2] <= 400,
      'atteso [nx, ny, nz] interi ≥ 1, al massimo 400 copie',
    ),
  signed: (v) => check(num(v) && v >= -1 && v <= 1, 'atteso un numero tra -1 e 1'),
  spokes: (v) =>
    check(
      Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 24,
      'atteso un intero tra 0 e 24',
    ),
  span: (v) => check(v === 'z' || v === 'y', 'atteso "z" (ala) o "y" (deriva)'),
  style: (v) => check(v === 'maquette' || v === 'real', 'atteso "maquette" o "real"'),
  section: (v) => check(v === 'section' || v === 'always', 'atteso "section" o "always"'),
  when: (v) => check(v === 'section' || v === 'motion', 'atteso "section" o "motion"'),
  lane: (v) => check(v === 'top' || v === 'bottom', 'atteso "top" o "bottom"'),
};

/** Parametri di ogni forma: [tipo, obbligatorio]. */
export const SHAPES: Record<string, Record<string, [string, boolean?]>> = {
  box: { size: ['size3', true] },
  cylinder: {
    radius: ['positive', true],
    radiusTop: ['nonNegative'],
    height: ['positive'],
    axis: ['axis'],
    from: ['vec3'],
    to: ['vec3'],
  },
  cone: { radius: ['positive', true], height: ['positive', true], axis: ['axis'] },
  sphere: { radius: ['positive'] },
  roundedBox: { size: ['size3', true], radius: ['positive'] },
  capsule: { radius: ['positive', true], length: ['nonNegative', true], axis: ['axis'] },
  profile: { points: ['outline2', true], width: ['positive', true], bevel: ['nonNegative'] },
  torus: { radius: ['positive', true], tube: ['positive', true], axis: ['axis'] },
  lathe: { profile: ['profile', true], axis: ['axis'] },
  loft: { stations: ['stations', true] },
  blob: { balls: ['balls', true], blend: ['positive'] },
  plate: {
    thickness: ['positive', true],
    points: ['points2'],
    rect: ['rect'],
    corner: ['nonNegative'],
    holes: ['holes'],
    bevel: ['nonNegative'],
  },
  tube: { path: ['path', true], radius: ['positive', true] },
  rotor: {
    axis: ['axis'],
    count: ['rotorCount', true],
    inner: ['nonNegative', true],
    outer: ['positive', true],
    width: ['positive', true],
    sweep: ['number'],
    thickness: ['positive'],
    pitch: ['number'],
  },
  line: { points: ['path', true] },
  // componenti: il motore conosce la forma, il modello dà solo le misure
  body: {
    length: ['positive', true],
    width: ['positive', true],
    height: ['positive', true],
    nose: ['unit'],
    tail: ['unit'],
    noseSize: ['unit'],
    tailSize: ['unit'],
    noseHeight: ['signed'],
    tailHeight: ['signed'],
    square: ['unit'],
    keel: ['unit'],
  },
  wing: {
    span: ['positive', true],
    root: ['positive', true],
    tip: ['positive'],
    sweep: ['number'],
    dihedral: ['number'],
    thickness: ['unit'],
    axis: ['span'],
  },
  wheel: {
    radius: ['positive', true],
    width: ['positive', true],
    rim: ['unit'],
    spokes: ['spokes'],
    axis: ['axis'],
    rimMaterial: ['text'],
  },
  duct: {
    radius: ['positive', true],
    height: ['positive', true],
    thickness: ['positive'],
    spokes: ['spokes'],
    axis: ['axis'],
  },
  stages: {
    count: ['count', true],
    length: ['positive', true],
    radius: ['positive', true],
    radiusEnd: ['positive'],
    hub: ['positive'],
    blades: ['rotorCount'],
    axis: ['axis'],
  },
  arrow: {
    length: ['positive', true],
    radius: ['positive'],
    axis: ['axis'],
  },
  propeller: {
    radius: ['positive', true],
    count: ['rotorCount'],
    chord: ['positive'],
    pitch: ['number'],
    spinner: ['nonNegative'],
    axis: ['axis'],
  },
};
/** Forme fatte di più pezzi (e materiali): non hanno una geometria sola. */
export const COMPOSITES = new Set(['wheel', 'propeller', 'stages']);

const NODE_KEYS: Record<string, string | null> = {
  id: 'text',
  shape: null,
  material: null,
  label: null,
  position: 'vec3',
  rotation: 'vec3',
  scale: 'scale',
  outline: 'boolean',
  children: null,
  mirror: null,
  repeat: null,
  spin: null,
  animation: null,
  showWhen: 'when',
  attach: null,
  paint: null,
};
const MATERIAL_KEYS = {
  color: 'color',
  metalness: 'unit',
  roughness: 'unit',
  opacity: 'opacity',
  doubleSide: 'boolean',
  cut: 'section',
};
const LABEL_KEYS = {
  id: 'text',
  title: 'text',
  text: 'text',
  at: 'vec3',
  color: 'color',
  lane: 'lane',
};

type Fail = (path: string, message: string) => void;

function fields(
  obj: Record<string, unknown>,
  spec: Record<string, string | null>,
  path: string,
  fail: Fail,
) {
  for (const [key, value] of Object.entries(obj)) {
    if (!(key in spec)) fail(`${path}.${key}`, 'campo sconosciuto');
    else {
      const type = spec[key];
      const message = type ? types[type](value) : null;
      if (message) fail(`${path}.${key}`, message);
    }
  }
}

/** Errori dell'intestazione (tutto tranne nodes e labels). */
export function validateHeader(header: unknown): string[] {
  const errors: string[] = [];
  const fail: Fail = (path, message) => errors.push(`${path}: ${message}`);
  if (!isObject(header)) return ['scena: attesa un oggetto JSON'];
  const { nodes: _nodes, labels: _labels, ...rest } = header;
  fields(
    rest,
    {
      version: null,
      title: 'text',
      size: 'positive',
      style: 'style',
      camera: null,
      section: null,
      contacts: null,
      materials: null,
    },
    'scena',
    fail,
  );
  if (header.version !== 1) fail('scena.version', 'atteso 1');
  if (header.contacts !== undefined) {
    if (!Array.isArray(header.contacts) || header.contacts.length < 1 || header.contacts.length > 8)
      fail('scena.contacts', 'attesi 1–8 contatti');
    else
      header.contacts.forEach((c, i) => {
        const cp = `contacts[${i}]`;
        if (!isObject(c)) return fail(cp, 'atteso un contatto');
        fields(
          c,
          {
            id: 'text',
            time: 'positive',
            mover: 'text',
            source: null,
            target: null,
            response: 'text',
          },
          cp,
          fail,
        );
        for (const key of ['id', 'time', 'mover'])
          if (c[key] === undefined) fail(`${cp}.${key}`, 'obbligatorio');
        for (const key of ['source', 'target']) {
          const endpoint = c[key];
          if (!isObject(endpoint)) fail(`${cp}.${key}`, 'atteso { node, point }');
          else {
            fields(
              endpoint,
              { node: 'text', point: 'vec3', direction: 'vec3' },
              `${cp}.${key}`,
              fail,
            );
            if (
              endpoint.node === undefined ||
              (endpoint.point === undefined) === (endpoint.direction === undefined)
            )
              fail(`${cp}.${key}`, 'servono node e uno solo tra point e direction');
            if (vec3(endpoint.direction) && endpoint.direction.every((v) => v === 0))
              fail(`${cp}.${key}.direction`, 'la direzione non può essere nulla');
          }
        }
      });
  }
  const camera = header.camera;
  if (camera !== undefined) {
    if (!isObject(camera)) fail('scena.camera', 'atteso { direction }');
    else {
      fields(camera, { direction: 'vec3' }, 'scena.camera', fail);
      if (!camera.direction) fail('scena.camera.direction', 'obbligatorio');
      else if (vec3(camera.direction) && camera.direction.every((n) => n === 0))
        fail('scena.camera.direction', 'non può essere [0, 0, 0]');
    }
  }
  if (header.section !== undefined) {
    if (!isObject(header.section)) fail('scena.section', 'atteso { y }');
    else fields(header.section, { y: 'number' }, 'scena.section', fail);
  }
  if (!isObject(header.materials)) fail('scena.materials', 'atteso un oggetto { nome: materiale }');
  else
    for (const [name, def] of Object.entries(header.materials)) {
      const path = `materials.${name}`;
      if (!isObject(def)) {
        fail(path, 'atteso un oggetto');
        continue;
      }
      fields(def, MATERIAL_KEYS, path, fail);
      if (!def.color) fail(path, 'manca color');
      if (def.cut && !header.section) fail(`${path}.cut`, 'richiede scena.section');
    }
  return errors;
}

/** Errori di un'etichetta; `onNode`: sta su un nodo, quindi `at` è facoltativo. */
export function validateLabel(label: unknown, path: string, onNode = false): string[] {
  const errors: string[] = [];
  const fail: Fail = (p, message) => errors.push(`${p}: ${message}`);
  if (!isObject(label)) return [`${path}: atteso un oggetto`];
  fields(label, LABEL_KEYS, path, fail);
  if (!label.title) fail(`${path}.title`, 'obbligatorio');
  if (!onNode && !label.at) fail(`${path}.at`, 'obbligatorio');
  return errors;
}

/**
 * Errori di un nodo (e dei suoi figli) rispetto all'intestazione già nota.
 * `objects`: quanti oggetti produce dopo ripetizioni e specchiature.
 */
export function validateNode(
  node: unknown,
  header: Pick<SceneHeader, 'materials' | 'section'>,
  path: string,
): { errors: string[]; objects: number } {
  const errors: string[] = [];
  const fail: Fail = (p, message) => errors.push(`${p}: ${message}`);
  const materials = isObject(header.materials) ? header.materials : {};
  const material = (name: unknown, p: string) => {
    if (typeof name !== 'string' || !(name in materials))
      fail(
        p,
        `materiale non definito; disponibili: ${Object.keys(materials).join(', ') || 'nessuno'}`,
      );
  };
  let objects = 0;
  const visit = (n: unknown, p: string, depth: number, copies: number) => {
    if (!isObject(n)) return fail(p, 'atteso un oggetto nodo');
    if (depth > LIMITS.depth) return fail(p, `annidamento oltre ${LIMITS.depth} livelli`);
    const shapeName = typeof n.shape === 'string' ? n.shape : undefined;
    const shape = shapeName ? SHAPES[shapeName] : undefined;
    if (n.shape !== undefined && !shape)
      fail(
        `${p}.shape`,
        `forma sconosciuta «${String(n.shape)}»; disponibili: ${Object.keys(SHAPES).join(', ')}`,
      );
    for (const [key, value] of Object.entries(n)) {
      if (key in NODE_KEYS) {
        const type = NODE_KEYS[key];
        const message = type ? types[type](value) : null;
        if (message) fail(`${p}.${key}`, message);
      } else if (shape && key in shape) {
        const message = types[shape[key][0]](value);
        if (message) fail(`${p}.${key}`, message);
      } else
        fail(`${p}.${key}`, shapeName ? `campo sconosciuto per ${shapeName}` : 'campo sconosciuto');
    }
    if (shape)
      for (const [key, [, required]] of Object.entries(shape))
        if (required && n[key] === undefined) fail(`${p}.${key}`, `obbligatorio per ${shapeName}`);
    if (shapeName === 'cylinder') {
      const ends = Number(n.from !== undefined) + Number(n.to !== undefined);
      if (ends === 1) fail(p, 'from e to vanno indicati insieme');
      if (ends === 0 && n.height === undefined) fail(`${p}.height`, 'obbligatorio senza from/to');
    }
    if (shapeName === 'plate') {
      if (!n.points === !n.rect) fail(p, 'indica points oppure rect');
      if (n.corner !== undefined && !n.rect) fail(`${p}.corner`, 'valido solo con rect');
    }
    if (shapeName === 'rotor' && num(n.inner) && num(n.outer) && n.inner >= n.outer)
      fail(`${p}.inner`, 'deve essere minore di outer');
    if (n.material !== undefined) material(n.material, `${p}.material`);
    if (n.rimMaterial !== undefined) material(n.rimMaterial, `${p}.rimMaterial`);
    if (n.attach !== undefined) {
      const a = n.attach;
      if (!isObject(a)) fail(`${p}.attach`, 'atteso { to, at, offset }');
      else {
        fields(a, { to: 'text', at: 'vec3', offset: 'vec3' }, `${p}.attach`, fail);
        if (a.to === undefined || a.at === undefined) fail(`${p}.attach`, 'servono to e at');
        else if (vec3(a.at) && !a.at.every((f) => f >= 0 && f <= 1))
          fail(`${p}.attach.at`, 'frazioni tra 0 e 1');
      }
    }
    if (n.paint !== undefined) {
      const range = (v: unknown) =>
        tuple(2, num)(v) &&
        (v as number[])[0] >= 0 &&
        (v as number[])[1] <= 1 &&
        (v as number[])[0] < (v as number[])[1];
      if (!Array.isArray(n.paint) || !n.paint.length || n.paint.length > 8)
        fail(`${p}.paint`, 'atteso un array di 1–8 { color, x, y, z }');
      else
        n.paint.forEach((r, i) => {
          const rp = `${p}.paint[${i}]`;
          if (!isObject(r)) return fail(rp, 'atteso { color, x, y, z }');
          fields(r, { color: 'color', x: null, y: null, z: null }, rp, fail);
          if (!r.color) fail(`${rp}.color`, 'obbligatorio');
          for (const k of ['x', 'y', 'z'])
            if (r[k] !== undefined && !range(r[k]))
              fail(`${rp}.${k}`, 'atteso [da, a] tra 0 e 1, da < a');
        });
    }
    if (n.label !== undefined) errors.push(...validateLabel(n.label, `${p}.label`, true));
    if (n.mirror !== undefined && !['x', 'y', 'z'].includes(n.mirror as string))
      fail(`${p}.mirror`, 'atteso "x", "y" o "z"');
    if (n.showWhen === 'section' && !header.section)
      fail(`${p}.showWhen`, 'richiede scena.section');
    if (n.animation !== undefined) {
      const a = n.animation;
      const ap = `${p}.animation`;
      if (!isObject(a)) fail(ap, 'atteso { duration, loop, keyframes }');
      else {
        fields(a, { duration: 'positive', loop: null, keyframes: null }, ap, fail);
        if (a.duration === undefined) fail(`${ap}.duration`, 'obbligatorio');
        if (a.loop !== undefined && !['repeat', 'pingpong', 'once'].includes(a.loop as string))
          fail(`${ap}.loop`, 'atteso repeat, pingpong o once');
        if (
          !Array.isArray(a.keyframes) ||
          a.keyframes.length < 2 ||
          a.keyframes.length > LIMITS.list
        )
          fail(`${ap}.keyframes`, 'attesi 2–64 fotogrammi');
        else {
          let previous = -1;
          const frames = a.keyframes;
          frames.forEach((frame, i) => {
            const fp = `${ap}.keyframes[${i}]`;
            if (!isObject(frame)) return fail(fp, 'atteso { time, offset, rotation? }');
            fields(frame, { time: 'nonNegative', offset: 'vec3', rotation: 'vec3' }, fp, fail);
            if (
              !num(frame.time) ||
              frame.time <= previous ||
              (num(a.duration) && frame.time > a.duration)
            )
              fail(`${fp}.time`, 'tempi crescenti tra 0 e duration');
            if (frame.offset === undefined) fail(`${fp}.offset`, 'obbligatorio');
            if (i === 0 && frame.time !== 0) fail(`${fp}.time`, 'il primo tempo deve essere 0');
            if (i === frames.length - 1 && frame.time !== a.duration)
              fail(`${fp}.time`, 'l’ultimo tempo deve essere duration');
            if (num(frame.time)) previous = frame.time;
          });
        }
      }
    }
    if (n.spin !== undefined) {
      if (!isObject(n.spin)) fail(`${p}.spin`, 'atteso { axis, speed }');
      else {
        fields(
          n.spin,
          { axis: 'axis', speed: 'number', start: 'nonNegative', end: 'positive' },
          `${p}.spin`,
          fail,
        );
        if (num(n.spin.end) && n.spin.end <= (num(n.spin.start) ? n.spin.start : 0))
          fail(`${p}.spin.end`, 'deve essere maggiore di start');
        if (n.spin.axis === undefined || n.spin.speed === undefined)
          fail(`${p}.spin`, 'servono axis e speed');
      }
    }
    let factor = n.mirror ? 2 : 1;
    if (n.repeat !== undefined) {
      const r = n.repeat;
      const rp = `${p}.repeat`;
      if (!isObject(r)) fail(rp, 'atteso un oggetto');
      else {
        const kinds = ['grid', 'radial', 'along'].filter((k) => r[k] !== undefined);
        if (kinds.length !== 1) fail(rp, 'indica esattamente uno tra grid, radial, along');
        const kind = kinds[0];
        const spec: Record<string, string | null> =
          kind === 'grid'
            ? { grid: 'grid', step: 'vec3', materials: null }
            : kind === 'radial'
              ? { radial: 'count', axis: 'axis', materials: null }
              : kind === 'along'
                ? { along: 'path', count: 'count', materials: null }
                : { grid: null, radial: null, along: null, materials: null };
        fields(r, spec, rp, fail);
        if (kind === 'grid' && !r.step) fail(`${rp}.step`, 'obbligatorio con grid');
        if (kind === 'radial' && !r.axis) fail(`${rp}.axis`, 'obbligatorio con radial');
        if (kind === 'along' && !r.count) fail(`${rp}.count`, 'obbligatorio con along');
        if (r.materials !== undefined) {
          if (!Array.isArray(r.materials) || !r.materials.length)
            fail(`${rp}.materials`, 'atteso un array di nomi di materiali');
          else r.materials.forEach((m, i) => material(m, `${rp}.materials[${i}]`));
        }
        if (kind === 'grid' && types.grid(r.grid) === null) {
          const [x, y, z] = r.grid as number[];
          factor *= x * y * z;
        }
        if (kind === 'radial' && Number.isInteger(r.radial)) factor *= r.radial as number;
        if (kind === 'along' && Number.isInteger(r.count)) factor *= r.count as number;
      }
    }
    objects += copies * factor;
    if (n.children !== undefined) {
      if (!Array.isArray(n.children)) fail(`${p}.children`, 'atteso un array di nodi');
      else
        n.children.forEach((c, i) => visit(c, `${p}.children[${i}]`, depth + 1, copies * factor));
    } else if (!shape) fail(p, 'un nodo senza shape deve avere children');
  };
  visit(node, path, 0, 1);
  return { errors, objects };
}

/** Validazione della scena intera: l'elenco vuoto vuol dire scena valida. */
export function validateScene(scene: unknown): string[] {
  const errors = validateHeader(scene);
  if (!isObject(scene)) return errors;
  const header = scene as unknown as SceneHeader;
  let objects = 0;
  if (!Array.isArray(scene.nodes) || !scene.nodes.length)
    errors.push('scena.nodes: atteso un array di nodi non vuoto');
  else
    scene.nodes.forEach((n, i) => {
      const r = validateNode(n, header, `nodes[${i}]`);
      errors.push(...r.errors);
      objects += r.objects;
    });
  if (objects > LIMITS.objects)
    errors.push(
      `scena.nodes: ${objects} oggetti dopo le ripetizioni: il massimo è ${LIMITS.objects}`,
    );
  if (scene.labels !== undefined) {
    if (!Array.isArray(scene.labels)) errors.push('scena.labels: atteso un array');
    else scene.labels.forEach((l, i) => errors.push(...validateLabel(l, `labels[${i}]`)));
  }
  return errors;
}
