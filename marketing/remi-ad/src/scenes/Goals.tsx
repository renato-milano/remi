import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { ri, SectionHead, Bar } from "../kit";

// ── 6 · OBIETTIVI (autonomia a lungo raggio) ─────────────────
const GOALS = [
  { t: "Inbox sempre a zero", p: 1.0 },
  { t: "Report mensile pronto in tempo", p: 0.72 },
  { t: "Backup settimanale garantito", p: 0.46 },
];
export const SceneGoals: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num="04 / Obiettivi" title={<>Insegue i tuoi<br />obiettivi.</>} sub="Progetti a lungo raggio che porta avanti da solo — anche mentre dormi." />
      <div style={{ position: "absolute", right: 150, top: "50%", translate: "0 -50%", width: 640, display: "flex", flexDirection: "column", gap: 26 }}>
        {GOALS.map((g, i) => {
          const at = 10 + i * 10;
          const appear = ri(frame, at, at + 12, 0, 1);
          const fill = ri(frame, at + 8, at + 46, 0, g.p);
          const pct = Math.round(fill * 100);
          return (
            <div key={i} style={{ opacity: appear, translate: `0 ${(1 - appear) * 24}px`, background: "rgba(255,255,255,.03)", border: `1px solid ${C.line}`, borderRadius: 14, padding: "22px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 27, color: C.ink }}>{g.t}</span>
                <span style={{ fontFamily: mono, fontSize: 24, color: fill >= g.p - 0.001 && g.p === 1 ? C.teal : C.muted }}>{pct}%</span>
              </div>
              <Bar pct={fill} />
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 150, bottom: 100, textAlign: "center" }}>
        <Remi state="sleeping" size={200} seed={9} />
        <div style={{ fontFamily: mono, fontSize: 20, color: C.faint, marginTop: 6 }}>…mentre dormi</div>
      </div>
    </AbsoluteFill>
  );
};
