import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { C, mono } from "./theme";

// Sfondo persistente del brand: verde-foresta scuro, griglia tecnica, aloni radiali.
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 1300], [0, -44]);
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {/* griglia 44px come sul sito */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.line} 1px,transparent 1px),linear-gradient(90deg,${C.line} 1px,transparent 1px)`,
          backgroundSize: "44px 44px",
          backgroundPosition: `center ${drift}px`,
          opacity: 0.9,
        }}
      />
      {/* aloni radiali (alive / cyan / amber) */}
      <AbsoluteFill
        style={{
          backgroundImage: [
            "radial-gradient(60% 40% at 50% -5%, rgba(94,242,160,.10), transparent 70%)",
            "radial-gradient(50% 30% at 90% 10%, rgba(127,228,255,.06), transparent 70%)",
            "radial-gradient(40% 40% at 5% 30%, rgba(255,191,92,.05), transparent 70%)",
          ].join(","),
        }}
      />
      {/* vignetta */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

// Il "battito" — pallino verde che pulsa, firma vivente di OpenMate.
export const Heartbeat: React.FC<{ size?: number }> = ({ size = 11 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beat = (frame % (2.4 * fps)) / (2.4 * fps);
  const scale = interpolate(beat, [0, 0.12, 0.24, 1], [1, 1.35, 1, 1]);
  const ring = interpolate(beat, [0, 1], [0, 14]);
  const ringOpacity = interpolate(beat, [0, 1], [0.55, 0]);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <div
        style={{
          position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: C.alive,
          scale: `${scale}`, boxShadow: `0 0 0 ${ring}px rgba(94,242,160,${ringOpacity})`,
        }}
      />
    </div>
  );
};

export const Chip: React.FC<{ children: React.ReactNode; accent?: string }> = ({ children, accent }) => (
  <div
    style={{
      fontFamily: mono, fontSize: 22, letterSpacing: "0.14em", textTransform: "uppercase",
      border: `1px solid ${accent ?? C.line2}`, borderRadius: 999, padding: "10px 22px",
      color: accent ?? C.muted, display: "inline-flex", alignItems: "center", gap: 12,
      backgroundColor: "rgba(18,23,21,.6)", backdropFilter: "blur(8px)",
    }}
  >
    {children}
  </div>
);

// eyebrow monospace maiuscolo con trattino, stile "sec-num" del sito
export const Kicker: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <div style={{ fontFamily: mono, fontSize: 24, letterSpacing: "0.22em", textTransform: "uppercase", color: color ?? C.aliveDim }}>
    {children}
  </div>
);

// helper d'ingresso: opacità + salita morbida
export const useRise = (from: number, dur = 18) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [from, from + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(frame, [from, from + dur], [26, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return { opacity, translate: `0 ${y}px` };
};

// wrapper scena con fade-in/out morbido ai bordi
export const Scene: React.FC<{ children: React.ReactNode; durationInFrames: number; style?: React.CSSProperties }> = ({
  children, durationInFrames, style,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, 12, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  return (
    <AbsoluteFill style={{ opacity, justifyContent: "center", alignItems: "center", ...style }}>
      {children}
    </AbsoluteFill>
  );
};
