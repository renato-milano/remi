import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { useBeat, useMockup3D } from "../ui";
import { ri, SectionHead, Check } from "../kit";

// ── 5 · TASK ─────────────────────────────────────────────────
// Lista che si spunta con pop soddisfacente, strike-through fluido,
// ultimo task "in corso" che pulsa, contatore "3 completati mentre
// eri altrove" e Remi che segue (acting -> grin) e si compiace.

const TASKS = [
  { t: "Rispondere alle email arretrate", done: 22 },
  { t: "Prenotare la sala riunioni", done: 40 },
  { t: "Aggiornare il foglio spese", done: 58 },
  { t: "Riepilogo settimanale per il team", done: -1 }, // in corso
];

export const SceneTasks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beat = useBeat();
  const panel3D = useMockup3D(4, 0.09, -7, 1.1);

  // Remi: prima "acting" (lavora), poi esulta con un "grin" appena
  // l'ultimo check è andato a segno (~frame 70).
  const grinning = frame >= 70;
  const remiExpr = grinning ? "grin" : "scan";

  // piccolo rimbalzo di gioia di Remi quando arriva la soddisfazione
  const joy = spring({ frame: frame - 70, fps, config: { damping: 9, mass: 0.7, stiffness: 150 } });
  const remiPop = spring({ frame: frame - 4, fps, config: { damping: 12, mass: 0.6, stiffness: 130 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead
        num="03 / Task"
        title={<>Porta a termine.</>}
        sub="Prende in carico i tuoi task e li chiude, uno dopo l'altro. Senza sforzo."
      />

      {/* pannello lista */}
      <div
        style={{
          position: "absolute",
          right: 130,
          top: "50%",
          translate: "0 -50%",
          width: 660,
          background: "rgba(13,15,14,.72)",
          border: `1px solid ${C.line}`,
          borderRadius: 20,
          padding: "26px 30px 24px",
          boxShadow: "0 30px 80px rgba(0,0,0,.5)",
          opacity: ri(frame, 2, 12, 0, 1),
          transform: panel3D,
        }}
      >
        {/* intestazione lista */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontFamily: mono,
              fontSize: 20,
              color: C.faint,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            la tua lista · oggi
          </div>
          {/* mini progress complessivo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 120, height: 6, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${ri(frame, 14, 74, 0, 0.75) * 100}%`,
                  background: C.teal,
                  borderRadius: 999,
                  boxShadow: `0 0 12px ${C.tealGlow}`,
                }}
              />
            </div>
            <div style={{ fontFamily: mono, fontSize: 17, color: C.teal, width: 46, textAlign: "right" }}>
              {Math.round(ri(frame, 14, 74, 0, 75))}%
            </div>
          </div>
        </div>

        {TASKS.map((task, i) => {
          const appear = ri(frame, 6 + i * 5, 16 + i * 5, 0, 1);
          const inProg = task.done < 0;
          // pop del check a molla per un "clic" soddisfacente
          const checkPop = inProg ? 0 : spring({ frame: frame - task.done, fps, config: { damping: 11, mass: 0.5, stiffness: 170 } });
          const on = inProg ? 0 : ri(frame, task.done, task.done + 10, 0, 1);
          // strike-through fluido (parte poco dopo la spunta)
          const strike = inProg ? 0 : ri(frame, task.done + 3, task.done + 15, 0, 1);
          // flash teal della riga quando viene spuntata
          const flash = inProg ? 0 : interpolate(frame, [task.done, task.done + 6, task.done + 18], [0, 0.16, 0], {
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
                gap: 18,
                padding: "15px 10px",
                margin: "0 -10px",
                borderRadius: 12,
                opacity: appear,
                translate: `${(1 - appear) * 34}px 0`,
                borderBottom: isLast ? "none" : `1px solid ${C.line}`,
                background: `rgba(0,255,200,${flash})`,
                // il task in corso respira dolcemente col beat
                boxShadow: inProg ? `inset 0 0 0 1px rgba(0,255,200,${0.12 + beat * 0.25})` : "none",
              }}
            >
              {/* check con pop */}
              <div style={{ scale: `${inProg ? 1 : interpolate(checkPop, [0, 1], [0.6, 1])}`, flexShrink: 0 }}>
                {inProg ? (
                  // spinner-checkbox che pulsa per il task in corso
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: `2px solid ${C.teal}`,
                      opacity: 0.5 + beat * 0.5,
                      boxShadow: `0 0 ${8 + beat * 14}px ${C.tealGlow}`,
                    }}
                  />
                ) : (
                  <Check on={on} />
                )}
              </div>

              <div
                style={{
                  position: "relative",
                  fontFamily: sans,
                  fontWeight: 500,
                  fontSize: 27,
                  color: on > 0.5 ? C.faint : C.ink,
                }}
              >
                {task.t}
                {/* strike-through fluido */}
                <div
                  style={{
                    position: "absolute",
                    top: "52%",
                    left: -2,
                    height: 2,
                    borderRadius: 2,
                    background: C.teal,
                    opacity: 0.85,
                    width: `${strike * 102}%`,
                    boxShadow: `0 0 8px ${C.tealGlow}`,
                  }}
                />
              </div>

              {inProg && (
                <div
                  style={{
                    marginLeft: "auto",
                    fontFamily: mono,
                    fontSize: 17,
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

        {/* contatore "3 completati mentre eri altrove" — con pop numerico */}
        <div
          style={{
            marginTop: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            opacity: ri(frame, 74, 84, 0, 1),
            translate: `0 ${(1 - ri(frame, 74, 84, 0, 1)) * 14}px`,
          }}
        >
          <div
            style={{
              scale: `${interpolate(
                spring({ frame: frame - 74, fps, config: { damping: 9, mass: 0.6, stiffness: 160 } }),
                [0, 1],
                [0.4, 1]
              )}`,
              width: 40,
              height: 40,
              borderRadius: 10,
              background: C.teal,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: mono,
              fontWeight: 600,
              fontSize: 24,
              color: "#04120a",
              boxShadow: `0 0 ${18 + beat * 12}px ${C.tealGlow}`,
              flexShrink: 0,
            }}
          >
            {Math.round(ri(frame, 74, 88, 0, 3))}
          </div>
          <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 24, color: C.ink }}>
            completati <span style={{ color: C.muted }}>mentre eri altrove</span>
          </div>
        </div>
      </div>

      {/* Remi — segue e si compiace */}
      <div
        style={{
          position: "absolute",
          left: 150,
          bottom: 110,
          translate: `0 ${-joy * 20}px`,
          rotate: `${Math.sin(joy * Math.PI) * -4}deg`,
        }}
      >
        <Remi state="acting" expr={remiExpr} size={224} seed={7} />
        {/* fumettino di soddisfazione */}
        <div
          style={{
            position: "absolute",
            top: -18,
            right: -40,
            fontFamily: mono,
            fontSize: 22,
            color: C.teal,
            opacity: ri(frame, 72, 82, 0, 1),
            scale: `${interpolate(joy, [0, 1], [0.5, 1])}`,
          }}
        >
          fatto!
        </div>
      </div>
    </AbsoluteFill>
  );
};
