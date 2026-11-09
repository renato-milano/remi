export { SCENE_GUIDE } from './guide.js';
export {
  AXES,
  COMPOSITES,
  LIMITS,
  type Scene,
  type SceneContact,
  type SceneAnimation,
  type SceneHeader,
  type SceneLabel,
  type SceneMaterial,
  type SceneNode,
  SHAPES,
  type Vec3,
  validateHeader,
  validateLabel,
  validateNode,
  validateScene,
} from './schema.js';
export { type SceneDetailEvent, SceneStream, type SceneStreamEvent } from './stream.js';
export { sampleAnimation, spinAngle } from './animation.js';
export { compileContacts } from './contacts.js';

export { applyScenePatch, type ScenePatch } from './patch.js';
