import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { useRise, useBeat } from "../ui";
import { ri, SectionHead, Check } from "../kit";

// ── 5 · TASK ─────────────────────────────────────────────────
const TASKS = [
  { t: "Rispondere alle email arretrate", done: 34 },
  { t: "Prenotare la sala riunioni", done: 48 },
  { t: "Aggiornare il foglio spese", done: 62 },
  { t: "Riepilogo settimanale per il team", done: -1 }, // in corso
];
export const SceneTasks: React.FC = () => {
  const frame = useCurrentFrame();
  const beat = useBeat();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num="03 / Task" title={<>Porta a termine.</>} sub="Prende in carico i tuoi task e li chiude, uno dopo l'altro." />
      <div style={{ position: "absolute", right: 150, top: "50%", translate: "0 -50%", width: 620 }}>
        <div style={{ fontFamily: mono, fontSize: 20, color: C.faint, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 18 }}>
          la tua lista · oggi
        </div>
        {TASKS.map((task, i) => {
          const appear = ri(frame, 6 + i * 6, 16 + i * 6, 0, 1);
          const inProg = task.done < 0;
          const on = inProg ? 0 : ri(frame, task.done, task.done + 12, 0, 1);
          const strike = inProg ? 0 : on;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 18, padding: "16px 4px", opacity: appear,
              translate: `${(1 - appear) * 30}px 0`, borderBottom: `1px solid ${C.line}`,
            }}>
              <Check on={on} />
              <div style={{ position: "relative", fontFamily: sans, fontWeight: 500, fontSize: 27, color: on > 0.5 ? C.faint : C.ink }}>
                {task.t}
                <div style={{ position: "absolute", top: "50%", left: 0, height: 2, background: C.faint, width: `${strike * 100}%` }} />
              </div>
              {inProg && (
                <div style={{ marginLeft: "auto", fontFamily: mono, fontSize: 17, color: C.teal, opacity: 0.6 + beat * 0.4 }}>in corso…</div>
              )}
            </div>
          );
        })}
        <div style={{ ...useRise(74, 10), marginTop: 22, fontFamily: mono, fontSize: 20, color: C.teal }}>
          ✓ 3 completati mentre eri altrove
        </div>
      </div>
      <div style={{ position: "absolute", left: 140, bottom: 90 }}>
        <Remi state="acting" size={190} seed={7} />
      </div>
    </AbsoluteFill>
  );
};
