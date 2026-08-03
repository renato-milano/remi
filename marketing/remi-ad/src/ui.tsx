import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import { C, mono, sans } from "./theme";

// ── Motion helpers ────────────────────────────────────────────
// beat elettronico ~128 BPM: spike 0..1 all'attacco di ogni beat
export const useBeat = (bpm = 128, decay = 7) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fpb = (60 / bpm) * fps;
  const phase = frame % fpb;
  return Math.max(0, 1 - phase / decay);
};

// entrata a molla (pop) — ritorna 0..~1 con overshoot
export const usePop = (from: number, damping = 13, mass = 0.6) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - from, fps, config: { damping, mass, stiffness: 130 } });
};

// entrata secca: opacità + salita
export const useRise = (from: number, dur = 10) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [from, from + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(frame, [from, from + dur], [22, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return { opacity, translate: `0 ${y}px` };
};

// ── Sfondo Holyn: nero, griglia sottile, alone teal, particelle ──
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 1100], [0, -48]);
  const beat = useBeat();
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.line} 1px,transparent 1px),linear-gradient(90deg,${C.line} 1px,transparent 1px)`,
          backgroundSize: "48px 48px",
          backgroundPosition: `center ${drift}px`,
          opacity: 0.5,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: [
            `radial-gradient(60% 45% at 50% -8%, rgba(0,255,200,${0.06 + beat * 0.04}), transparent 70%)`,
            "radial-gradient(45% 35% at 88% 8%, rgba(0,255,200,.05), transparent 70%)",
            "radial-gradient(40% 40% at 8% 92%, rgba(0,255,200,.045), transparent 70%)",
          ].join(","),
        }}
      />
      <AbsoluteFill style={{ background: "radial-gradient(125% 95% at 50% 45%, transparent 52%, rgba(0,0,0,.75) 100%)" }} />
    </AbsoluteFill>
  );
};

// ── Logo Holyn: 4 schegge teal (da public/holyn.svg) ──────────
export const HolynMark: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = C.teal }) => (
  <svg width={size} height={size} viewBox="0 0 800 800" style={{ overflow: "visible" }}>
    <g fill={color}>
      <polygon points="476.26,139.77 323.99,53.41 323.99,315.64 475.12,399.7" />
      <polygon points="476.26,486.66 323.99,400.3 323.99,662.53 475.12,746.59" />
      <polygon points="701.86,337.54 549.6,251.18 549.6,513.41 700.73,597.47" />
      <polygon points="250.4,295.13 98.14,208.77 98.14,471 249.26,555.06" />
    </g>
  </svg>
);

// ── Heartbeat teal ────────────────────────────────────────────
export const Heartbeat: React.FC<{ size?: number }> = ({ size = 11 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beat = (frame % (1.4 * fps)) / (1.4 * fps);
  const scale = interpolate(beat, [0, 0.1, 0.22, 1], [1, 1.4, 1, 1]);
  const ring = interpolate(beat, [0, 1], [0, 13]);
  const ringOpacity = interpolate(beat, [0, 1], [0.6, 0]);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: C.teal, scale: `${scale}`, boxShadow: `0 0 0 ${ring}px rgba(0,255,200,${ringOpacity})` }} />
    </div>
  );
};

export const Chip: React.FC<{ children: React.ReactNode; accent?: string }> = ({ children, accent }) => (
  <div
    style={{
      fontFamily: mono, fontSize: 20, letterSpacing: "0.1em", textTransform: "uppercase",
      border: `1px solid ${accent ?? C.line2}`, borderRadius: 8, padding: "9px 18px",
      color: accent ?? C.muted, display: "inline-flex", alignItems: "center", gap: 10,
      backgroundColor: "rgba(255,255,255,.03)",
    }}
  >
    {children}
  </div>
);

export const Kicker: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <div style={{ fontFamily: mono, fontSize: 26, letterSpacing: "0.28em", textTransform: "uppercase", color: color ?? C.teal }}>
    {children}
  </div>
);

// ── wrapper scena: fade rapido (motion serrato) ──────────────
export const Scene: React.FC<{ children: React.ReactNode; durationInFrames: number; style?: React.CSSProperties }> = ({
  children, durationInFrames, style,
}) => {
  const frame = useCurrentFrame();
  const d = durationInFrames;
  const opacity = interpolate(
    frame,
    [0, 6, d - 6, d],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  return (
    <AbsoluteFill style={{ opacity, justifyContent: "center", alignItems: "center", ...style }}>
      {children}
    </AbsoluteFill>
  );
};

// Zoom mirato SULLA box della feature (non su tutta la scena): entra a molla,
// poi fa un lento push-in per portare il riquadro "più nel dettaglio".
// Ritorna un fattore di scala da applicare al contenitore della feature.
export const useZoomIn = (from = 2, amount = 0.12) => {
  const frame = useCurrentFrame();
  const { durationInFrames: d } = useVideoConfig();
  const enter = interpolate(frame, [from, from + 16], [0.9, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const push = interpolate(frame, [from + 16, d - 8], [0, amount], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return enter * (1 + push);
};

// Effetto "mockup 3D": la superficie della feature (finestra app, lista, card) è
// inclinata in prospettiva ed effettua un lento scorrimento/rotazione mentre la
// feature si anima. Ritorna una stringa `transform` da applicare al riquadro.
export const useMockup3D = (from = 6, zoomAmount = 0.1, restRy = -7, base = 1) => {
  const frame = useCurrentFrame();
  const { durationInFrames: d } = useVideoConfig();
  const clampE = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const ease = Easing.bezier(0.16, 1, 0.3, 1);
  const p = interpolate(frame, [from, from + 22], [0, 1], { ...clampE, easing: ease });
  const scale = base * (0.9 + p * 0.1) * (1 + interpolate(frame, [from + 22, d - 8], [0, zoomAmount], clampE));
  const t = frame - from;
  // entra ruotato → si assesta → "scorre" piano verso una posa più frontale, + micro-oscillazione viva
  const ry =
    interpolate(frame, [from, from + 22, d - 8], [restRy - 9, restRy, restRy + 4], { ...clampE, easing: ease }) +
    Math.sin(t / 26) * 1.1;
  const rx =
    interpolate(frame, [from, from + 22], [5.5, 3], { ...clampE, easing: ease }) + Math.cos(t / 32) * 0.7;
  return `perspective(1700px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
};
