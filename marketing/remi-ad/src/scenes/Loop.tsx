import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, mono } from "../theme";
import { Remi } from "../Remi";
import { ri, SectionHead } from "../kit";

// ── 8 · AUTONOMIA (battito cognitivo) ────────────────────────
const STEPS = ["percepisce", "recupera", "pianifica", "agisce", "riflette", "consolida"];
export const SceneLoop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cx = 380, cy = 380, R = 290;
  const loopDur = 2.4 * fps;
  const prog = ((frame - 14) % loopDur) / loopDur;
  const active = Math.floor((((prog % 1) + 1) % 1) * 6) % 6;
  const dotAng = (-90 + prog * 360) * (Math.PI / 180);
  const dotX = cx + R * Math.cos(dotAng), dotY = cy + R * Math.sin(dotAng);
  const reveal = ri(frame, 10, 40, 0, 1);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num="06 / Autonomia" title={<>Un battito<br />cognitivo.</>} sub="Si sveglia da solo e ripete il ciclo. Senza che tu chieda nulla." />
      <div style={{ position: "relative", width: 760, height: 760, marginLeft: 480, marginTop: 40 }}>
        <svg width={760} height={760} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.line2} strokeWidth={2} strokeDasharray="2 11" style={{ opacity: reveal }} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.teal} strokeWidth={3}
            strokeDasharray={`${2 * Math.PI * R * 0.16} ${2 * Math.PI * R}`}
            strokeDashoffset={-2 * Math.PI * R * (prog - 0.16)}
            style={{ filter: `drop-shadow(0 0 8px ${C.tealGlow})`, opacity: reveal }} strokeLinecap="round" />
          <circle cx={dotX} cy={dotY} r={9} fill={C.teal} style={{ filter: `drop-shadow(0 0 12px ${C.teal})`, opacity: reveal }} />
        </svg>
        {STEPS.map((s, i) => {
          const ang = (-90 + i * 60) * (Math.PI / 180);
          const x = cx + R * Math.cos(ang), y = cy + R * Math.sin(ang);
          const on = i === active;
          const at = 16 + i * 5;
          const o = ri(frame, at, at + 12, 0, 1);
          return (
            <div key={s} style={{
              position: "absolute", left: x, top: y, translate: "-50% -50%", opacity: o,
              fontFamily: mono, fontSize: 24, padding: "11px 18px", borderRadius: 10, whiteSpace: "nowrap",
              background: on ? "rgba(0,255,200,.12)" : C.panel, border: `1px solid ${on ? C.teal : C.line2}`,
              color: on ? C.teal : C.muted, boxShadow: on ? `0 0 22px ${C.tealGlow}` : "none", scale: on ? "1.08" : "1",
            }}>{s}</div>
          );
        })}
        <div style={{ position: "absolute", left: cx, top: cy, translate: "-50% -50%" }}>
          <Remi state="acting" size={200} seed={6} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
