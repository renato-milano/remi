import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { HolynMark, Heartbeat, useRise, usePop, useBeat } from "../ui";
import type { Expr } from "../Remi";

// ── 11 · CTA finale ───────────────────────────────────────────
// Remi entra, saluta, manda cuoricini e strizza l'occhio.
// Wordmark "Remi" + "by Holyn" + riga local first · open source · holyn.it.
// Chiusura calda: "e' facile, lo voglio provare".
export const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beat = useBeat(128, 8);

  // Entrata a molla di Remi
  const pop = usePop(2, 12, 0.7);

  // Piccolo "saluto": inclinazione avanti-indietro nei primi ~30 frame,
  // poi si assesta. Sembra che Remi faccia ciao con la testa.
  const wave = interpolate(frame, [10, 16, 22, 28, 34], [0, 9, -7, 5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // rimbalzino verticale d'ingresso oltre alla molla
  const hop = interpolate(frame, [2, 12], [26, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  // Espressioni scandite nel tempo: excited all'entrata → hearts → wink → happy
  let expr: Expr;
  if (frame < 12) expr = "excited";
  else if (frame < 40) expr = "hearts";
  else if (frame >= 40 && frame < 52) expr = "wink";
  else expr = "happy";

  // Alone teal dietro Remi che pulsa col beat (energia SaaS)
  const glowScale = 1 + beat * 0.06;
  const glowOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * (0.55 + beat * 0.3);

  // Testi che salgono
  const word = useRise(24, 10);
  const by = useRise(36, 10);
  const foot = useRise(52, 10);

  // Sottolineatura teal che si estende sotto il wordmark
  const underline = interpolate(frame, [34, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  // Invito finale "prova ora" che appare con un pop leggero
  const tryPop = spring({ frame: frame - 66, fps, config: { damping: 12, mass: 0.7, stiffness: 130 } });
  const tryGlow = 0.5 + 0.5 * Math.sin((frame - 66) * 0.35);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Alone teal dietro a Remi */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 620,
          height: 620,
          marginTop: -320,
          marginLeft: -310,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.tealGlow} 0%, rgba(0,255,200,.08) 42%, transparent 68%)`,
          scale: `${glowScale}`,
          opacity: glowOpacity,
          filter: "blur(6px)",
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Remi che saluta */}
        <div
          style={{
            scale: `${pop}`,
            translate: `0 ${hop}px`,
            rotate: `${wave}deg`,
            transformOrigin: "50% 82%",
            marginBottom: 4,
          }}
        >
          <Remi state="idle" expr={expr} size={296} />
        </div>

        {/* Wordmark Remi */}
        <div style={{ position: "relative", paddingBottom: 14 }}>
          <div
            style={{
              ...word,
              fontFamily: sans,
              fontWeight: 800,
              fontSize: 132,
              color: C.ink,
              letterSpacing: "-0.05em",
              lineHeight: 1,
            }}
          >
            Remi
          </div>
          {/* sottolineatura teal animata */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: 0,
              height: 4,
              width: `${underline * 100}%`,
              maxWidth: 260,
              translate: "-50% 0",
              borderRadius: 999,
              background: C.teal,
              boxShadow: `0 0 14px ${C.tealGlow}`,
            }}
          />
        </div>

        {/* by Holyn */}
        <div style={{ ...by, marginTop: 20, display: "flex", alignItems: "center", gap: 14 }}>
          <HolynMark size={34} />
          <span
            style={{
              fontFamily: mono,
              fontSize: 28,
              letterSpacing: "0.16em",
              color: C.muted,
              textTransform: "uppercase",
            }}
          >
            by Holyn
          </span>
        </div>

        {/* riga local first · open source · holyn.it */}
        <div
          style={{
            ...foot,
            marginTop: 30,
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontFamily: mono,
            fontSize: 24,
            color: C.faint,
            letterSpacing: "0.05em",
          }}
        >
          <Heartbeat size={13} />
          <span>aperto</span>
          <span>·</span>
          <span>open source</span>
          <span>·</span>
          <span style={{ color: C.teal }}>holyn.it</span>
        </div>

        {/* invito caldo finale */}
        <div
          style={{
            marginTop: 28,
            scale: `${tryPop}`,
            opacity: interpolate(tryPop, [0, 1], [0, 1]),
            fontFamily: mono,
            fontSize: 22,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: C.teal,
            border: `1px solid ${C.tealDim}`,
            borderRadius: 10,
            padding: "12px 26px",
            background: "rgba(0,255,200,.05)",
            boxShadow: `0 0 ${10 + tryGlow * 14}px rgba(0,255,200,${0.15 + tryGlow * 0.2})`,
          }}
        >
          prova Remi oggi
        </div>
      </div>
    </AbsoluteFill>
  );
};
