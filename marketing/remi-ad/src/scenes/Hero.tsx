import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { HolynMark, useRise, usePop } from "../ui";
import type { Expr } from "../Remi";

// ── 1 · HERO ──────────────────────────────────────────────────
// Remi entra a molla, fa un "saluto" (rimbalzo + inclinazione) e
// mostra cuoricini/occhiolino verso lo spettatore. Anello teal soft
// + particelle in orbita per micro-motion di contorno.

// Anello teal soft che pulsa dietro Remi (respiro, non distrae)
const SoftRing: React.FC<{ appear: number }> = ({ appear }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const breathe = 1 + 0.03 * Math.sin(t * 1.8);
  const glow = 0.5 + 0.5 * Math.sin(t * 1.8);
  return (
    <div
      style={{
        position: "absolute",
        width: 470,
        height: 470,
        borderRadius: "50%",
        border: `1.5px solid rgba(0,255,200,${0.14 + 0.06 * glow})`,
        boxShadow: `0 0 60px rgba(0,255,200,${0.06 + 0.05 * glow}) inset, 0 0 40px rgba(0,255,200,${0.05 + 0.04 * glow})`,
        scale: `${appear * breathe}`,
        opacity: appear,
      }}
    />
  );
};

// Particelle teal in orbita morbida attorno a Remi
const Particles: React.FC<{ appear: number }> = ({ appear }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const dots = [
    { r: 260, a0: 0.2, sp: 0.5, sz: 6, ph: 0 },
    { r: 300, a0: 2.1, sp: -0.35, sz: 4, ph: 1.3 },
    { r: 235, a0: 4.0, sp: 0.62, sz: 5, ph: 2.6 },
    { r: 320, a0: 1.0, sp: 0.28, sz: 3, ph: 0.7 },
    { r: 280, a0: 5.2, sp: -0.48, sz: 4, ph: 3.4 },
    { r: 250, a0: 3.3, sp: 0.4, sz: 3, ph: 4.1 },
  ];
  return (
    <>
      {dots.map((d, i) => {
        const ang = d.a0 + t * d.sp;
        const x = Math.cos(ang) * d.r;
        const y = Math.sin(ang) * d.r * 0.62;
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.4 + d.ph));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: d.sz,
              height: d.sz,
              borderRadius: "50%",
              backgroundColor: C.teal,
              translate: `${x}px ${y}px`,
              opacity: tw * appear,
              boxShadow: `0 0 ${d.sz * 1.6}px ${C.tealGlow}`,
            }}
          />
        );
      })}
    </>
  );
};

export const SceneHero: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // entrata a molla di Remi
  const pop = usePop(2);
  // apparizione contorno (anello + particelle) leggermente ritardata
  const ambient = interpolate(frame, [4, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // GESTO "saluto": piccolo rimbalzo + inclinazione dopo l'entrata (frame 26→46)
  const wave = spring({ frame: frame - 26, fps, config: { damping: 6, mass: 0.7, stiffness: 120 } });
  const waveOut = interpolate(frame, [42, 52], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tilt = Math.sin((frame - 26) * 0.5) * 6 * wave * waveOut; // inclinazione oscillante
  const hop = -14 * wave * waveOut; // piccolo saltello su

  // Espressione: entra gasato → saluta felice → cuoricini/occhiolino verso lo spettatore
  const expr: Expr | undefined =
    frame < 14 ? "excited" :
    frame < 26 ? "happy" :
    frame < 34 ? "wink" :
    frame < 70 ? "hearts" : "happy";

  const h = useRise(30, 10);
  const s = useRise(40, 10);
  const holyn = useRise(52, 10);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* zona Remi + contorno */}
      <div
        style={{
          position: "relative",
          width: 480,
          height: 420,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <SoftRing appear={ambient} />
        <Particles appear={ambient} />
        <div
          style={{
            scale: `${pop}`,
            translate: `0 ${hop}px`,
            rotate: `${tilt}deg`,
            transformOrigin: "center 78%",
          }}
        >
          <Remi state="idle" expr={expr as never} size={340} />
        </div>
      </div>

      <div style={{ ...h, fontFamily: sans, fontWeight: 800, fontSize: 118, color: C.ink, letterSpacing: "-0.045em", lineHeight: 1 }}>
        Ciao, sono <span style={{ color: C.teal }}>Remi</span>.
      </div>
      <div style={{ ...s, marginTop: 22, fontFamily: sans, fontWeight: 400, fontSize: 36, color: C.muted, letterSpacing: "-0.01em" }}>
        l'agente che vive sul tuo dispositivo.
      </div>
      <div style={{ ...holyn, marginTop: 40, display: "flex", alignItems: "center", gap: 12 }}>
        <HolynMark size={26} />
        <span style={{ fontFamily: mono, fontSize: 22, letterSpacing: "0.14em", color: C.faint, textTransform: "uppercase" }}>by Holyn</span>
      </div>
    </AbsoluteFill>
  );
};
