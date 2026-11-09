import type { SceneAnimation, Vec3 } from './schema.js';

/** Campiona una traiettoria validata, senza accumulare errori tra i cicli. */
export function sampleAnimation(animation: SceneAnimation, elapsed: number): Vec3 {
  const { keyframes } = animation;
  const time = animationTime(animation, elapsed);
  const end = keyframes.findIndex((frame) => frame.time >= time);
  if (end <= 0) return [...keyframes[0].offset];
  const a = keyframes[end - 1];
  const b = keyframes[end];
  const u = (time - a.time) / (b.time - a.time);
  return a.offset.map((v, i) => v + (b.offset[i] - v) * u) as Vec3;
}

/** Tempo locale condiviso da traiettoria e rotazione. */
export function animationTime(animation: SceneAnimation, elapsed: number): number {
  const { duration, loop = 'repeat' } = animation;
  const t = Math.max(0, elapsed);
  const phase = t % (duration * 2);
  const time =
    loop === 'once'
      ? Math.min(t, duration)
      : loop === 'pingpong'
        ? phase <= duration
          ? phase
          : duration * 2 - phase
        : t % duration;
  return time;
}

export function spinAngle(
  spin: { speed: number; start?: number; end?: number },
  elapsed: number,
  animation?: SceneAnimation,
): number {
  const time = animation ? animationTime(animation, elapsed) : Math.max(0, elapsed);
  // Nei vecchi output il corpo attende prima dell'impatto: anche lo spin attende.
  const frames = animation?.keyframes;
  const moving = frames?.findIndex(
    (f, i) => i > 0 && f.offset.some((v, axis) => v !== frames[i - 1].offset[axis]),
  );
  const inferredStart = frames && moving !== undefined && moving > 0 ? frames[moving - 1].time : 0;
  const start = spin.start ?? inferredStart;
  return spin.speed * Math.max(0, Math.min(time, spin.end ?? Infinity) - start);
}
