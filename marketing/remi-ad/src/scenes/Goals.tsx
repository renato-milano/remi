import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { useMockup3D } from "../ui";
import { ri, SectionHead, Bar } from "../kit";

// ── 6 · OBIETTIVI (autonomia a lungo raggio) ─────────────────
// Le barre avanzano fluide mentre Remi DORME: "lavora per te anche
// mentre dormi". Atmosfera notturna/ambient, Zzz che salgono.
const GOALS = [
  { t: "Inbox sempre a zero", p: 1.0 },
  { t: "Report mensile pronto in tempo", p: 0.72 },
  { t: "Backup settimanale garantito", p: 0.46 },
];

// stelle statiche pseudo-casuali (seed fisso, niente Math.random a runtime)
const STARS = Array.from({ length: 26 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12543.1231;
  return {
    x: ((a - Math.floor(a)) * 100),
    y: ((b - Math.floor(b)) * 72),
    r: 0.8 + ((a - Math.floor(a)) * 1.6),
    ph: (b - Math.floor(b)) * 6.28,
  };
});

export const SceneGoals: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;

  // respiro lento del sonno per il gruppo Remi
  const breath = Math.sin(t * 0.9) * 0.5 + 0.5; // 0..1

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* velo notturno + luce lunare fredda in alto a destra */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 90% at 12% 118%, rgba(10,26,44,.55), transparent 60%)",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(38% 42% at 90% 6%, rgba(120,180,255,.10), transparent 70%)",
        }}
      />

      {/* stelle che pulsano piano (cielo) */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        {STARS.map((s, i) => {
          const tw = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.6 + s.ph));
          const born = ri(frame, 4 + i * 0.6, 20 + i * 0.6, 0, 1);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: s.r * 2,
                height: s.r * 2,
                borderRadius: "50%",
                background: "rgba(180,210,255,.9)",
                opacity: tw * born,
                boxShadow: "0 0 6px rgba(150,190,255,.7)",
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* luna sottile in alto a destra */}
      <div
        style={{
          position: "absolute",
          right: 130,
          top: 120,
          width: 74,
          height: 74,
          borderRadius: "50%",
          opacity: ri(frame, 6, 26, 0, 0.9),
          background:
            "radial-gradient(circle at 38% 34%, #eaf2ff 0%, #b9cbe6 55%, #8ea4c4 100%)",
          boxShadow: "0 0 40px rgba(150,190,255,.35), inset -14px -10px 22px rgba(20,40,70,.6)",
        }}
      />

      <SectionHead
        num="06 / Obiettivi"
        title={<>Insegue i tuoi<br />obiettivi.</>}
        sub="Progetti a lungo raggio che porta avanti da solo, anche mentre dormi."
      />

      {/* barre di avanzamento */}
      <div
        style={{
          position: "absolute",
          right: 150,
          top: "50%",
          translate: "0 -50%",
          width: 640,
          display: "flex",
          flexDirection: "column",
          gap: 26,
          transform: useMockup3D(8, 0.09, -7),
        }}
      >
        {GOALS.map((g, i) => {
          const at = 10 + i * 9;
          const appear = ri(frame, at, at + 12, 0, 1);
          const fill = ri(frame, at + 8, at + 60, 0, g.p);
          const pct = Math.round(fill * 100);
          const done = fill >= g.p - 0.001 && g.p === 1;
          // lieve pulsazione della cifra mentre "conta su"
          const counting = fill > 0.02 && fill < g.p - 0.002;
          return (
            <div
              key={i}
              style={{
                opacity: appear,
                translate: `0 ${(1 - appear) * 24}px`,
                background: "rgba(10,16,22,.55)",
                border: `1px solid ${done ? C.tealGlow : C.line}`,
                borderRadius: 14,
                padding: "22px 24px",
                boxShadow: done ? `0 0 24px rgba(0,255,200,.12)` : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 16,
                }}
              >
                <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 27, color: C.ink }}>
                  {g.t}
                </span>
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 26,
                    fontWeight: 600,
                    color: done ? C.teal : counting ? C.ink : C.muted,
                    textShadow: done ? `0 0 12px ${C.tealGlow}` : "none",
                  }}
                >
                  {pct}%
                </span>
              </div>
              <Bar pct={fill} />
            </div>
          );
        })}
      </div>

      {/* Remi che dorme, bottom-left, con respiro e Zzz che salgono */}
      <div
        style={{
          position: "absolute",
          left: 168,
          bottom: 120,
          textAlign: "center",
          translate: `0 ${-breath * 5}px`,
        }}
      >
        {/* Zzz che salgono a fluttuare (autonomi dallo schermo-faccia) */}
        <div style={{ position: "absolute", left: 158, top: -14, width: 130, height: 150, pointerEvents: "none" }}>
          {[0, 1, 2].map((k) => {
            const cycle = (t * 0.4 + k * 0.34) % 1; // 0..1
            const op = Math.sin(cycle * Math.PI); // fade in/out
            const start = ri(frame, 24 + k * 6, 40 + k * 6, 0, 1);
            return (
              <span
                key={k}
                style={{
                  position: "absolute",
                  left: cycle * 30,
                  top: 118 - cycle * 118,
                  fontFamily: mono,
                  fontWeight: 700,
                  fontSize: 22 + k * 12,
                  color: "rgb(176,206,255)",
                  opacity: op * start,
                  textShadow: "0 0 14px rgba(120,170,255,.7)",
                }}
              >
                Z
              </span>
            );
          })}
        </div>

        <div style={{ scale: `1 ${1 + breath * 0.02}`, transformOrigin: "bottom center" }}>
          <Remi state="sleeping" size={210} seed={9} />
        </div>
        <div
          style={{
            fontFamily: mono,
            fontSize: 21,
            color: C.faint,
            marginTop: 4,
            letterSpacing: "0.04em",
          }}
        >
          …mentre dormi
        </div>
      </div>
    </AbsoluteFill>
  );
};
