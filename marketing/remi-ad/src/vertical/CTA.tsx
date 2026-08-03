import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { HolynMark, Heartbeat, useRise, usePop, useBeat } from "../ui";
import type { Expr } from "../Remi";

// ── CTA finale · VERTICALE 9:16 ───────────────────────────────
// Impilato e centrato: Remi grande in alto (excited→hearts→wink→happy),
// wordmark "Remi" enorme, HolynMark + "by Holyn", pill teal "prova Remi oggi",
// footer mono local first · open source · holyn.it con Heartbeat.
export const SceneCTAV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beat = useBeat(128, 8);

  // Entrata a molla di Remi
  const pop = usePop(2, 12, 0.7);

  // Piccolo "saluto": inclinazione avanti-indietro poi si assesta
  const wave = interpolate(frame, [10, 16, 22, 28, 34], [0, 9, -7, 5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // rimbalzino verticale d'ingresso oltre alla molla
  const hop = interpolate(frame, [2, 12], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  // Espressioni scandite: excited → hearts → wink → happy (calmo, non iperattivo)
  let expr: Expr;
  if (frame < 12) expr = "excited";
  else if (frame < 42) expr = "hearts";
  else if (frame < 56) expr = "wink";
  else expr = "happy";

  // Alone teal dietro Remi che pulsa col beat
  const glowScale = 1 + beat * 0.06;
  const glowOpacity =
    interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) *
    (0.55 + beat * 0.3);

  // Testi che salgono in sequenza
  const word = useRise(24, 10);
  const by = useRise(38, 10);
  const foot = useRise(60, 10);

  // Sottolineatura teal che si estende sotto il wordmark
  const underline = interpolate(frame, [36, 54], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  // Pill invito finale con pop + glow pulsante
  const tryPop = spring({ frame: frame - 72, fps, config: { damping: 12, mass: 0.7, stiffness: 130 } });
  const tryGlow = 0.5 + 0.5 * Math.sin((frame - 72) * 0.35);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Alone teal dietro Remi */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 860,
          height: 860,
          marginTop: -560,
          marginLeft: -430,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.tealGlow} 0%, rgba(0,255,200,.08) 42%, transparent 68%)`,
          scale: `${glowScale}`,
          opacity: glowOpacity,
          filter: "blur(8px)",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: 920,
        }}
      >
        {/* Remi grande che saluta */}
        <div
          style={{
            scale: `${pop}`,
            translate: `0 ${hop}px`,
            rotate: `${wave}deg`,
            transformOrigin: "50% 82%",
            marginBottom: 24,
          }}
        >
          <Remi state="idle" expr={expr} size={420} />
        </div>

        {/* Wordmark Remi enorme */}
        <div style={{ position: "relative", paddingBottom: 22 }}>
          <div
            style={{
              ...word,
              fontFamily: sans,
              fontWeight: 800,
              fontSize: 216,
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
              height: 6,
              width: `${underline * 100}%`,
              maxWidth: 380,
              translate: "-50% 0",
              borderRadius: 999,
              background: C.teal,
              boxShadow: `0 0 18px ${C.tealGlow}`,
            }}
          />
        </div>

        {/* by Holyn */}
        <div style={{ ...by, marginTop: 34, display: "flex", alignItems: "center", gap: 18 }}>
          <HolynMark size={48} />
          <span
            style={{
              fontFamily: mono,
              fontSize: 40,
              letterSpacing: "0.16em",
              color: C.muted,
              textTransform: "uppercase",
            }}
          >
            by Holyn
          </span>
        </div>

        {/* invito caldo finale — pill teal */}
        <div
          style={{
            marginTop: 52,
            scale: `${tryPop}`,
            opacity: interpolate(tryPop, [0, 1], [0, 1]),
            fontFamily: mono,
            fontSize: 34,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: C.teal,
            border: `1.5px solid ${C.tealDim}`,
            borderRadius: 16,
            padding: "20px 44px",
            background: "rgba(0,255,200,.06)",
            boxShadow: `0 0 ${14 + tryGlow * 20}px rgba(0,255,200,${0.15 + tryGlow * 0.2})`,
          }}
        >
          prova Remi oggi
        </div>

        {/* footer mono */}
        <div
          style={{
            ...foot,
            marginTop: 48,
            display: "flex",
            alignItems: "center",
            gap: 22,
            fontFamily: mono,
            fontSize: 32,
            color: C.faint,
            letterSpacing: "0.05em",
          }}
        >
          <Heartbeat size={16} />
          <span>aperto</span>
          <span>·</span>
          <span>open source</span>
          <span>·</span>
          <span style={{ color: C.teal }}>holyn.it</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
