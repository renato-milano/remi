import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { useMockup3D } from "../ui";
import { ri, SectionHeadV, Bar } from "../kit";
import { useLang } from "../i18n";

// ── 04 · OBIETTIVI (VERTICALE 9:16) ──────────────────────────
// Impilato: titolo in alto (SectionHeadV), le 3 barre di avanzamento
// centrate a tutta larghezza (i numeri % contano su), Remi SOTTO che
// DORME con Zzz che salgono, in atmosfera notturna (stelle + luna).
const GOALS_P = [1.0, 0.72, 0.46];

// stelle statiche pseudo-casuali (seed fisso, niente Math.random a runtime)
const STARS = Array.from({ length: 30 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12543.1231;
  return {
    x: (a - Math.floor(a)) * 100, // %
    y: (b - Math.floor(b)) * 46, // % (solo la metà superiore del cielo)
    r: 0.8 + (a - Math.floor(a)) * 1.7,
    ph: (b - Math.floor(b)) * 6.28,
  };
});

export const SceneGoalsV: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;

  const L = useLang();
  const T = ({
    it: {
      num: "04 / Obiettivi",
      title: <>Insegue i tuoi obiettivi.</>,
      sub: "…anche mentre dormi.",
      goals: [
        "Inbox sempre a zero",
        "Report mensile pronto in tempo",
        "Backup settimanale garantito",
      ],
      sleep: "…mentre dormi",
    },
    en: {
      num: "04 / Goals",
      title: <>Chases your goals.</>,
      sub: "…even while you sleep.",
      goals: [
        "Inbox always at zero",
        "Monthly report ready on time",
        "Weekly backup guaranteed",
      ],
      sleep: "…while you sleep",
    },
  } as const)[L];
  const GOALS = GOALS_P.map((p, i) => ({ t: T.goals[i], p }));

  // respiro lento del sonno per il gruppo Remi
  const breath = Math.sin(t * 0.9) * 0.5 + 0.5; // 0..1

  return (
    <AbsoluteFill>
      {/* velo notturno freddo dal basso + luce lunare in alto a destra */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 60% at 50% 120%, rgba(10,26,44,.55), transparent 62%)",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(40% 30% at 88% 8%, rgba(120,180,255,.12), transparent 70%)",
        }}
      />

      {/* stelle che pulsano piano (cielo) */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        {STARS.map((s, i) => {
          const tw = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.6 + s.ph));
          const born = ri(frame, 4 + i * 0.5, 20 + i * 0.5, 0, 1);
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
          right: 96,
          top: 132,
          width: 78,
          height: 78,
          borderRadius: "50%",
          opacity: ri(frame, 6, 26, 0, 0.9),
          background:
            "radial-gradient(circle at 38% 34%, #eaf2ff 0%, #b9cbe6 55%, #8ea4c4 100%)",
          boxShadow:
            "0 0 40px rgba(150,190,255,.35), inset -14px -10px 22px rgba(20,40,70,.6)",
        }}
      />

      <SectionHeadV num={T.num} title={T.title} sub={T.sub} />

      {/* ── barre di avanzamento, centrate a tutta larghezza ── */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 520,
          translate: "-50% 0",
          width: 900,
          display: "flex",
          flexDirection: "column",
          gap: 30,
          transform: useMockup3D(8, 0.06, -6),
          transformOrigin: "center top",
        }}
      >
        {GOALS.map((g, i) => {
          const at = 12 + i * 9;
          const appear = ri(frame, at, at + 12, 0, 1);
          const fill = ri(frame, at + 8, at + 62, 0, g.p);
          const pct = Math.round(fill * 100);
          const done = fill >= g.p - 0.001 && g.p === 1;
          const counting = fill > 0.02 && fill < g.p - 0.002;
          return (
            <div
              key={i}
              style={{
                opacity: appear,
                translate: `0 ${(1 - appear) * 26}px`,
                background: "rgba(10,16,22,.6)",
                border: `1px solid ${done ? C.tealGlow : C.line}`,
                borderRadius: 18,
                padding: "28px 32px",
                boxShadow: done ? "0 0 28px rgba(0,255,200,.14)" : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 20,
                }}
              >
                <span
                  style={{
                    fontFamily: sans,
                    fontWeight: 600,
                    fontSize: 36,
                    color: C.ink,
                  }}
                >
                  {g.t}
                </span>
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 36,
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

      {/* ── Remi che dorme SOTTO le barre, respiro + Zzz che salgono ── */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 190,
          textAlign: "center",
          translate: `-50% ${-breath * 5}px`,
        }}
      >
        {/* Zzz che salgono a fluttuare */}
        <div
          style={{
            position: "absolute",
            left: 196,
            top: -30,
            width: 150,
            height: 170,
            pointerEvents: "none",
          }}
        >
          {[0, 1, 2].map((k) => {
            const cycle = (t * 0.4 + k * 0.34) % 1; // 0..1
            const op = Math.sin(cycle * Math.PI); // fade in/out
            const start = ri(frame, 26 + k * 6, 42 + k * 6, 0, 1);
            return (
              <span
                key={k}
                style={{
                  position: "absolute",
                  left: cycle * 34,
                  top: 138 - cycle * 138,
                  fontFamily: mono,
                  fontWeight: 700,
                  fontSize: 26 + k * 14,
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

        <div
          style={{
            scale: `1 ${1 + breath * 0.02}`,
            transformOrigin: "bottom center",
          }}
        >
          <Remi state="sleeping" size={280} seed={9} />
        </div>
        <div
          style={{
            fontFamily: mono,
            fontSize: 26,
            color: C.faint,
            marginTop: 8,
            letterSpacing: "0.04em",
          }}
        >
          {T.sleep}
        </div>
      </div>
    </AbsoluteFill>
  );
};
