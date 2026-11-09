import { SHAPES, type Scene, type SceneNode, validateScene } from './schema.js';

export interface ScenePatch {
  remove: string[];
  nodes: SceneNode[];
}
/** Applica una revisione a una copia dell'intero albero; un errore lascia la scena originale intatta. */
export function applyScenePatch(
  input: Scene,
  patch: ScenePatch,
): { scene: Scene; errors: string[]; touched: string[] } {
  const scene = structuredClone(input);
  const errors: string[] = validateScene(scene);
  if (errors.length) return { scene, errors, touched: [] };
  const touched = new Set<string>();
  if (scene.contacts)
    return {
      scene,
      errors: ['patch: le scene con contatti richiedono una nuova compilazione'],
      touched: [],
    };
  const removed = new Set(patch.remove);
  const replacements = new Map<string, SceneNode>();
  for (const node of patch.nodes) {
    if (!node.id || replacements.has(node.id))
      errors.push('patch: ogni correzione richiede un id unico');
    else replacements.set(node.id, structuredClone(node));
  }
  const provided = new Set<string>();
  const walk = (
    nodes: SceneNode[],
    visit: (node: SceneNode, ancestors: string[]) => void,
    ancestors: string[] = [],
  ) => {
    for (const node of nodes) {
      visit(node, ancestors);
      walk(node.children ?? [], visit, node.id ? [...ancestors, node.id] : ancestors);
    }
  };
  walk(patch.nodes, (n) => {
    if (n.id) {
      if (provided.has(n.id)) errors.push(`patch: id duplicato nelle correzioni ${n.id}`);
      provided.add(n.id);
    }
  });
  const originalIds = new Set<string>();
  walk(scene.nodes, (n) => {
    if (n.id) originalIds.add(n.id);
  });
  const affected = new Set([...removed, ...provided]);
  const mark = (node: SceneNode, ancestors: string[]) => {
    if (!node.id || !affected.has(node.id)) return;
    for (const id of [...ancestors, node.id]) touched.add(id);
    walk(node.children ?? [], (n) => {
      if (n.id) touched.add(n.id);
    });
  };
  walk(scene.nodes, mark);
  const merge = (old: SceneNode, update?: SceneNode): SceneNode | undefined => {
    if (old.id && removed.has(old.id) && !provided.has(old.id)) return undefined;
    const replacement = update ?? (old.id ? replacements.get(old.id) : undefined);
    if (old.id && replacement) replacements.delete(old.id);
    const oldShape = old.shape ? SHAPES[old.shape] : {};
    const newShape = replacement?.shape ? SHAPES[replacement.shape] : undefined;
    const base =
      newShape && old.shape !== replacement?.shape
        ? (Object.fromEntries(
            Object.entries(old).filter(([key]) => !(key in oldShape) || key in newShape),
          ) as SceneNode)
        : old;
    const node = { ...base, ...replacement };
    // Le revisioni della geometria non riscrivono i meccanismi che governano il movimento.
    if (old.animation) node.animation = old.animation;
    if (old.spin) node.spin = old.spin;
    const children = new Map(
      (replacement?.children ?? []).filter((n) => n.id).map((n) => [n.id, n]),
    );
    const merged: SceneNode[] = [];
    for (const child of old.children ?? []) {
      const value = merge(child, child.id ? children.get(child.id) : undefined);
      if (child.id) children.delete(child.id);
      if (value) merged.push(value);
    }
    for (const child of replacement?.children ?? [])
      if (!child.id || children.has(child.id)) {
        merged.push(child);
        if (child.id) children.delete(child.id);
      }
    if (old.children || replacement?.children) node.children = merged;
    return node;
  };
  scene.nodes = scene.nodes.map((n) => merge(n)).filter((n): n is SceneNode => Boolean(n));
  let pending = [...replacements.values()];
  while (pending.length) {
    const next: SceneNode[] = [];
    for (const node of pending) {
      if (node.id && originalIds.has(node.id)) {
        errors.push(`patch: ${node.id} appartiene a un ramo rimosso`);
        continue;
      }
      const to = (node.attach as { to?: string } | undefined)?.to;
      let target: SceneNode | undefined;
      if (to)
        walk(scene.nodes, (n) => {
          if (n.id === to) target = n;
        });
      if (to && !target) next.push(node);
      else if (target) {
        target.children ??= [];
        target.children.push(node);
      } else scene.nodes.push(node);
    }
    if (next.length === pending.length) {
      errors.push('patch: nuovi montaggi senza una madre esistente');
      break;
    }
    pending = next;
  }
  const seen = new Set<string>();
  walk(scene.nodes, (node, ancestors) => {
    mark(node, ancestors);
    const to = (node.attach as { to?: string } | undefined)?.to;
    if (to && !seen.has(to))
      errors.push(`patch: aggancio di ${node.id} a ${to} non disponibile o ciclico`);
    if (node.id) {
      if (seen.has(node.id)) errors.push(`patch: id duplicato ${node.id}`);
      seen.add(node.id);
    }
  });
  errors.push(...validateScene(scene));
  return { scene: errors.length ? structuredClone(input) : scene, errors, touched: [...touched] };
}
