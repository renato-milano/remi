import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { useBeat, useMockup3D } from "../ui";
import { ri, SectionHeadV, Check } from "../kit";

// ── 03 · TASK (VERTICALE 9:16) ───────────────────────────────
// Impilato: titolo in alto (SectionHeadV), lista "oggi" al centro a
// tutta larghezza (checkbox che si spuntano con pop, strike-through,
// "in corso…", "3 completati mentre eri altrove"), Remi SOTTO che si
// compiace (grin) con fumetto "fatto!".

const TASKS = [
  { t: "Rispondere alle email arretrate", done: 30 },
  { t: "Prenotare la sala riunioni", done: 44 },
  { t: "Aggiornare il foglio spese", done: 58 },
  { t: "Riepilogo settimanale per il team", done: -1 }, // in corso
];

export const SceneTasksV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beat = useBeat();
  const panel3D = useMockup3D(6, 0.06, -5, 1);

  // Remi esulta appena l'ultimo check è a segno (~frame 74)
  const grinning = frame >= 74;
  const remiExpr = grinning ? "grin" : "scan";
  const joy = spring({ frame: frame - 74, fps, config: { damping: 9, mass: 0.7, stiffness: 150 } });

  return (
    <AbsoluteFill>
      <SectionHeadV num="03 / Task" title={<>Porta a termine.</>} />

      {/* ── pannello lista, centrato a tutta larghezza ── */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 620,
          translate: "-50% 0",
          width: 920,
          background: "rgba(13,15,14,.72)",
          border: `1px solid ${C.line}`,
          borderRadius: 26,
          padding: "34px 40px 34px",
          boxShadow: "0 40px 100px rgba(0,0,0,.5)",
          opacity: ri(frame, 4, 16, 0, 1),
          transform: panel3D,
          transformOrigin: "center top",
        }}
      >
        {/* intestazione lista */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 22,
          }}
        >
          <div
            style={{
              fontFamily: mono,
              fontSize: 24,
              color: C.faint,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            la tua lista · oggi
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 150, height: 8, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${ri(frame, 18, 78, 0, 0.75) * 100}%`,
                  background: C.teal,
                  borderRadius: 999,
                  boxShadow: `0 0 12px ${C.tealGlow}`,
                }}
              />
            </div>
            <div style={{ fontFamily: mono, fontSize: 22, color: C.teal, width: 58, textAlign: "right" }}>
              {Math.round(ri(frame, 18, 78, 0, 75))}%
            </div>
          </div>
        </div>

        {TASKS.map((task, i) => {
          const appear = ri(frame, 10 + i * 4, 20 + i * 4, 0, 1);
          const inProg = task.done < 0;
          const checkPop = inProg
            ? 0
            : spring({ frame: frame - task.done, fps, config: { damping: 11, mass: 0.5, stiffness: 170 } });
          const on = inProg ? 0 : ri(frame, task.done, task.done + 10, 0, 1);
          const strike = inProg ? 0 : ri(frame, task.done + 3, task.done + 15, 0, 1);
          const flash = inProg
            ? 0
            : interpolate(frame, [task.done, task.done + 6, task.done + 18], [0, 0.16, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
          const isLast = i === TASKS.length - 1;

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 22,
                padding: "20px 14px",
                margin: "0 -14px",
                borderRadius: 14,
                opacity: appear,
                translate: `${(1 - appear) * 40}px 0`,
                borderBottom: isLast ? "none" : `1px solid ${C.line}`,
                background: `rgba(0,255,200,${flash})`,
                boxShadow: inProg ? `inset 0 0 0 1px rgba(0,255,200,${0.12 + beat * 0.25})` : "none",
              }}
            >
              {/* check con pop */}
              <div style={{ scale: `${inProg ? 1 : interpolate(checkPop, [0, 1], [0.6, 1])}`, flexShrink: 0 }}>
                {inProg ? (
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      border: `2px solid ${C.teal}`,
                      opacity: 0.5 + beat * 0.5,
                      boxShadow: `0 0 ${8 + beat * 14}px ${C.tealGlow}`,
                    }}
                  />
                ) : (
                  <Check on={on} size={38} />
                )}
              </div>

              <div
                style={{
                  position: "relative",
                  flex: 1,
                  fontFamily: sans,
                  fontWeight: 500,
                  fontSize: 34,
                  color: on > 0.5 ? C.faint : C.ink,
                }}
              >
                {task.t}
                <div
                  style={{
                    position: "absolute",
                    top: "52%",
                    left: -2,
                    height: 2.5,
                    borderRadius: 2,
                    background: C.teal,
                    opacity: 0.85,
                    width: `${strike * 100}%`,
                    boxShadow: `0 0 8px ${C.tealGlow}`,
                  }}
                />
              </div>

              {inProg && (
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: 22,
                    color: C.teal,
                    opacity: 0.55 + beat * 0.45,
                    flexShrink: 0,
                  }}
                >
                  in corso…
                </div>
              )}
            </div>
          );
        })}

        {/* contatore "3 completati mentre eri altrove" */}
        <div
          style={{
            marginTop: 26,
            display: "flex",
            alignItems: "center",
            gap: 16,
            opacity: ri(frame, 80, 92, 0, 1),
            translate: `0 ${(1 - ri(frame, 80, 92, 0, 1)) * 16}px`,
          }}
        >
          <div
            style={{
              scale: `${interpolate(
                spring({ frame: frame - 80, fps, config: { damping: 9, mass: 0.6, stiffness: 160 } }),
                [0, 1],
                [0.4, 1]
              )}`,
              width: 52,
              height: 52,
              borderRadius: 13,
              background: C.teal,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: mono,
              fontWeight: 600,
              fontSize: 30,
              color: "#04120a",
              boxShadow: `0 0 ${18 + beat * 12}px ${C.tealGlow}`,
              flexShrink: 0,
            }}
          >
            {Math.round(ri(frame, 80, 94, 0, 3))}
          </div>
          <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 32, color: C.ink }}>
            completati <span style={{ color: C.muted }}>mentre eri altrove</span>
          </div>
        </div>
      </div>

      {/* ── Remi SOTTO il pannello, si compiace ── */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 150,
          translate: `-50% ${-joy * 22}px`,
          rotate: `${Math.sin(joy * Math.PI) * -4}deg`,
        }}
      >
        <Remi state="acting" expr={remiExpr} size={240} seed={7} />
        {/* fumetto di soddisfazione */}
        <div
          style={{
            position: "absolute",
            top: -6,
            right: -72,
            fontFamily: mono,
            fontSize: 34,
            fontWeight: 600,
            color: "#04120a",
            background: C.teal,
            padding: "10px 22px",
            borderRadius: 16,
            boxShadow: `0 0 26px ${C.tealGlow}`,
            opacity: ri(frame, 76, 86, 0, 1),
            scale: `${interpolate(joy, [0, 1], [0.5, 1])}`,
            whiteSpace: "nowrap",
          }}
        >
          fatto!
        </div>
      </div>
    </AbsoluteFill>
  );
};
