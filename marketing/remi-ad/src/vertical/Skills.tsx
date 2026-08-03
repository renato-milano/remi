import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, sans, mono } from "../theme";
import { Remi } from "../Remi";
import { ri, SectionHeadV } from "../kit";

// ── 07 · ESTENSIONI (VERTICALE) — estendibile con le skill ───
const SKILLS = [
  { i: "📧", n: "Email", at: 16 },
  { i: "📅", n: "Calendario", at: 24 },
  { i: "🔎", n: "Ricerca web", at: 32 },
  { i: "📊", n: "Fogli", at: 40 },
  { i: "💻", n: "Codice", at: 48 },
  { i: "🖥️", n: "Shell", at: 56 },
];

export const SceneSkillsV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const remiExpr = frame > 14 && frame < 76 ? "happy" : undefined;
  const remiPop = spring({ frame: frame - 4, fps, config: { damping: 12, mass: 0.6, stiffness: 130 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHeadV num="07 / Estensioni" title={<>Aggiungi nuove abilità.</>} sub="Con le skill, Remi fa sempre di più." />

      <div style={{ position: "absolute", left: "50%", translate: "-50% 0", top: 560, width: 860 }}>
        <div style={{ fontFamily: mono, fontSize: 24, color: C.faint, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 22 }}>abilità di Remi</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          {SKILLS.map((s, i) => {
            const pop = spring({ frame: frame - s.at, fps, config: { damping: 11, mass: 0.5, stiffness: 170 } });
            const on = frame >= s.at;
            const check = ri(frame, s.at + 2, s.at + 12, 0, 1);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "22px 24px", borderRadius: 16, background: on ? "rgba(0,255,200,.10)" : "rgba(255,255,255,.03)", border: `1px solid ${on ? C.teal : C.line}`, scale: `${interpolate(pop, [0, 1], [0.9, 1])}`, boxShadow: on ? `0 0 ${check * 22}px ${C.tealGlow}` : "none" }}>
                <span style={{ fontSize: 38 }}>{s.i}</span>
                <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 32, color: on ? C.ink : C.muted, whiteSpace: "nowrap" }}>{s.n}</span>
                <span style={{ marginLeft: "auto", color: C.teal, fontSize: 28, opacity: check }}>✓</span>
              </div>
            );
          })}
          <div style={{ gridColumn: "1 / span 2", display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "22px 24px", borderRadius: 16, border: `1.5px dashed ${C.tealDim}`, color: C.teal, opacity: ri(frame, 66, 78, 0, 1) }}>
            <span style={{ fontSize: 32 }}>➕</span>
            <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 32, opacity: 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(frame * 0.2)) }}>Aggiungi la tua skill</span>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", left: "50%", translate: "-50% 0", bottom: 200 }}>
        <div style={{ scale: `${remiPop}` }}>
          <Remi state="idle" expr={remiExpr as never} size={300} seed={3} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
