import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, sans, mono } from "../theme";
import { Remi } from "../Remi";
import { useMockup3D } from "../ui";
import { ri, SectionHead } from "../kit";

// ── 07 · ESTENSIONI — Remi è estendibile con le skill/tool ───
const SKILLS = [
  { i: "📧", n: "Email", at: 16 },
  { i: "📅", n: "Calendario", at: 24 },
  { i: "🔎", n: "Ricerca web", at: 32 },
  { i: "📊", n: "Fogli", at: 40 },
  { i: "💻", n: "Codice", at: 48 },
  { i: "🖥️", n: "Shell", at: 56 },
];

export const SceneSkills: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const panel3D = useMockup3D(4, 0.09, -7, 1.05);
  const remiExpr = frame > 14 && frame < 76 ? "happy" : undefined;
  const remiPop = spring({ frame: frame - 4, fps, config: { damping: 12, mass: 0.6, stiffness: 130 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num="07 / Estensioni" title={<>Aggiungi nuove<br />abilità.</>} sub="Con le skill, Remi fa sempre di più." />

      <div style={{ position: "absolute", right: 130, top: "50%", translate: "0 -50%", width: 680, transform: panel3D }}>
        <div style={{ fontFamily: mono, fontSize: 20, color: C.faint, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 18 }}>abilità di Remi</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {SKILLS.map((s, i) => {
            const pop = spring({ frame: frame - s.at, fps, config: { damping: 11, mass: 0.5, stiffness: 170 } });
            const on = frame >= s.at;
            const check = ri(frame, s.at + 2, s.at + 12, 0, 1);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "17px 20px", borderRadius: 14, background: on ? "rgba(0,255,200,.10)" : "rgba(255,255,255,.03)", border: `1px solid ${on ? C.teal : C.line}`, scale: `${interpolate(pop, [0, 1], [0.9, 1])}`, boxShadow: on ? `0 0 ${check * 20}px ${C.tealGlow}` : "none" }}>
                <span style={{ fontSize: 30 }}>{s.i}</span>
                <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 25, color: on ? C.ink : C.muted, whiteSpace: "nowrap" }}>{s.n}</span>
                <span style={{ marginLeft: "auto", color: C.teal, fontSize: 22, opacity: check }}>✓</span>
              </div>
            );
          })}
          <div style={{ gridColumn: "1 / span 2", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "17px 20px", borderRadius: 14, border: `1.5px dashed ${C.tealDim}`, color: C.teal, opacity: ri(frame, 66, 78, 0, 1) }}>
            <span style={{ fontSize: 26 }}>➕</span>
            <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 25, opacity: 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(frame * 0.2)) }}>Aggiungi la tua skill</span>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", left: 150, bottom: 96 }}>
        <div style={{ scale: `${remiPop}` }}>
          <Remi state="idle" expr={remiExpr as never} size={300} seed={3} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
