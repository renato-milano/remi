import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import { C, sans } from "../theme";
import { useBeat } from "../ui";

// ── 2 · STATEMENT (kinetic) ──────────────────────────────────
// "Non è un chatbot. / È vivo." — tipografia cinetica: le parole
// scattano dentro, uno swipe teal sottolinea "vivo", pulsazione a
// ritmo (useBeat) + micro-glitch. Energia da trailer SaaS, pulito.
export const SceneStatement: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beat = useBeat();

  // Snap-in a molla per ogni parola (entrata scattante, poco overshoot)
  const snap = (from: number) =>
    spring({ frame: frame - from, fps, config: { damping: 15, mass: 0.5, stiffness: 200 } });

  // Riga 1 — "Non è un chatbot." parola per parola (scatti serrati)
  const w1 = ["Non", "è", "un", "chatbot."];
  const line1From = 3;

  // Riga 2 — "È vivo." colpo grosso col beat
  const p2 = snap(20);
  // pulsazione sul beat, leggermente più marcata sulla riga viva
  const livePulse = 1 + beat * 0.035;

  // swipe teal che sottolinea "vivo" (wipe da sinistra a destra)
  const swipe = interpolate(frame, [30, 42], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // micro-glitch su "chatbot." quando arriva la seconda riga (sbarrato via)
  const strike = interpolate(frame, [22, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const line1Fade = interpolate(frame, [22, 34], [1, 0.32], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // glitch-jitter sottile sulla parola "vivo" a ogni beat
  const jitterX = (beat > 0.7 ? (frame % 2 === 0 ? 1.5 : -1.5) : 0);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          fontFamily: sans,
          fontWeight: 800,
          letterSpacing: "-0.045em",
          textAlign: "center",
          lineHeight: 1.02,
          maxWidth: 1600,
        }}
      >
        {/* Riga 1 — parole che scattano dentro una a una */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "0.32em",
            fontSize: 92,
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
            const ty = interpolate(s, [0, 1], [26, 0]);
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
          {/* barra che "cancella" chatbot quando arriva È vivo */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              height: 6,
              width: `${strike * 118}%`,
              maxWidth: "118%",
              backgroundColor: C.faint,
              translate: "-50% -50%",
              borderRadius: 3,
              transformOrigin: "left center",
            }}
          />
        </div>

        {/* Riga 2 — "È il tuo assistente 24/7" colpo grosso, pulsa col beat */}
        <div
          style={{
            marginTop: 18,
            scale: `${p2 * livePulse}`,
            opacity: interpolate(frame, [20, 26], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ fontSize: 88, color: C.ink, lineHeight: 1.0 }}>È il tuo assistente</div>
          <div
            style={{
              position: "relative",
              display: "inline-block",
              fontSize: 150,
              color: C.teal,
              marginTop: 6,
              translate: `${jitterX}px 0`,
              textShadow: `0 0 44px ${C.tealGlowStrong}, 0 0 90px ${C.tealGlow}`,
            }}
          >
            personale
            {/* swipe teal che sottolinea/evidenzia "24/7" */}
            <div
              style={{
                position: "absolute",
                left: 0,
                bottom: "-0.02em",
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
                borderRadius: 20,
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
