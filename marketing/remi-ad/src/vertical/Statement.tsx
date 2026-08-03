import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import { C, sans } from "../theme";
import { useBeat } from "../ui";
import { useLang } from "../i18n";

// ── 2 · STATEMENT (kinetic) — VERTICALE 9:16 ─────────────────
// "Non è un chatbot." (muted, sbarrato) → "È il tuo assistente"
// → "personale" (grande, teal, con swipe/glow). Impilato su 3 righe
// centrate, dimensionato per stare in 1000px. Pulsa a ritmo (useBeat).
export const SceneStatementV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beat = useBeat();

  const L = useLang();
  const T = ({
    it: { line1: ["Non", "è", "un", "chatbot."], line2: "È il tuo assistente", big: "personale" },
    en: { line1: ["Not", "a", "chatbot."], line2: "It's your personal", big: "assistant" },
  } as const)[L];

  // Snap-in a molla per ogni parola (entrata scattante, poco overshoot)
  const snap = (from: number) =>
    spring({ frame: frame - from, fps, config: { damping: 15, mass: 0.5, stiffness: 200 } });

  // Riga 1 — "Non è un chatbot." parola per parola (scatti serrati)
  const w1 = T.line1;
  const line1From = 3;

  // Riga 2 — "È il tuo assistente" arriva col beat
  const p2 = snap(20);
  const livePulse = 1 + beat * 0.03;

  // swipe teal che sottolinea "personale" (wipe da sinistra a destra)
  const swipe = interpolate(frame, [30, 42], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // barra che "cancella" chatbot quando arriva la seconda riga
  const strike = interpolate(frame, [22, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const line1Fade = interpolate(frame, [22, 34], [1, 0.34], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // glitch-jitter sottile sulla parola "personale" a ogni beat
  const jitterX = beat > 0.7 ? (frame % 2 === 0 ? 1.4 : -1.4) : 0;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          fontFamily: sans,
          fontWeight: 800,
          letterSpacing: "-0.045em",
          textAlign: "center",
          lineHeight: 1.02,
          width: 1000,
        }}
      >
        {/* Riga 1 — "Non è un chatbot." parole che scattano dentro una a una */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "0.3em",
            fontSize: 74,
            color: C.muted,
            opacity: line1Fade,
            position: "relative",
          }}
        >
          {w1.map((w, i) => {
            const from = line1From + i * 3;
            const s = snap(from);
            const op = interpolate(frame, [from, from + 4], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const ty = interpolate(s, [0, 1], [24, 0]);
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  opacity: op,
                  translate: `0 ${ty}px`,
                  scale: `${interpolate(s, [0, 1], [0.86, 1])}`,
                }}
              >
                {w}
              </span>
            );
          })}
          {/* barra che "cancella" chatbot quando arriva la seconda riga */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              height: 6,
              width: `${strike * 96}%`,
              maxWidth: "96%",
              backgroundColor: C.faint,
              translate: "-50% -50%",
              borderRadius: 3,
              transformOrigin: "left center",
            }}
          />
        </div>

        {/* Riga 2 + 3 — "È il tuo assistente / personale" pulsa col beat */}
        <div
          style={{
            marginTop: 54,
            scale: `${p2 * livePulse}`,
            opacity: interpolate(frame, [20, 26], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ fontSize: 82, color: C.ink, lineHeight: 1.0 }}>{T.line2}</div>
          <div
            style={{
              position: "relative",
              display: "inline-block",
              fontSize: 138,
              color: C.teal,
              marginTop: 14,
              translate: `${jitterX}px 0`,
              textShadow: `0 0 44px ${C.tealGlowStrong}, 0 0 90px ${C.tealGlow}`,
            }}
          >
            {T.big}
            {/* swipe teal che sottolinea "personale" */}
            <div
              style={{
                position: "absolute",
                left: 0,
                bottom: "-0.04em",
                height: 14,
                width: "100%",
                borderRadius: 8,
                background: `linear-gradient(90deg, ${C.teal}, ${C.tealDim})`,
                boxShadow: `0 0 24px ${C.tealGlowStrong}`,
                transformOrigin: "left center",
                scale: `${swipe} 1`,
                opacity: interpolate(frame, [30, 34], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            />
            {/* glow-blocco che pulsa dietro a ritmo */}
            <div
              style={{
                position: "absolute",
                inset: "-0.12em -0.14em",
                borderRadius: 24,
                background: `radial-gradient(60% 60% at 50% 50%, rgba(0,255,200,${0.12 +
                  beat * 0.16}), transparent 72%)`,
                zIndex: -1,
              }}
            />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
