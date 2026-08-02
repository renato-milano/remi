import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { usePop } from "../ui";
import { EASE, ri, SectionHead, Cursor } from "../kit";

// ── 9 · SICUREZZA (approval gate) ────────────────────────────
export const SceneApproval: React.FC = () => {
  const frame = useCurrentFrame();
  const card = usePop(6);
  const cx = interpolate(frame, [26, 52], [1780, 1660], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const cy = interpolate(frame, [26, 52], [420, 636], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const clickT = interpolate(frame, [53, 58, 66], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const allowed = frame > 61;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num="07 / Sicurezza" title={<>Mai senza<br />il tuo sì.</>} sub="Ogni azione ad alto impatto passa da permessi e audit." />
      <div style={{ position: "absolute", left: 150, bottom: 96 }}>
        <Remi state="waiting_approval" size={220} seed={3} />
      </div>
      <div style={{
        position: "absolute", right: 150, top: "50%", translate: "0 -50%", width: 520, scale: `${card}`,
        background: C.bubbleBg, border: `1px solid ${C.amberGlow}`, borderRadius: 18, padding: 28,
        boxShadow: `0 0 40px ${C.amberGlow}, 0 20px 50px rgba(0,0,0,.6)`,
      }}>
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontFamily: mono, fontSize: 17, padding: "6px 14px", borderRadius: 999, border: `1px solid ${C.amberDim}`, color: C.amber }}>rischio · da approvare</span>
        </div>
        <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 30, color: "#f3f6f2", lineHeight: 1.35, marginBottom: 14 }}>
          Remi vuole <span style={{ color: C.amber }}>eseguire un comando</span> per riordinare i download.
        </div>
        <div style={{ fontFamily: mono, fontSize: 18, color: "#cdd6cd", background: "#0a0d0b", border: `1px solid ${C.line}`, borderRadius: 10, padding: "13px 15px", marginBottom: 18, wordBreak: "break-all" }}>
          <span style={{ color: C.faint }}>$</span> mv ~/Downloads/*.pdf ~/Documenti/pdf/
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <div style={{ fontFamily: mono, fontSize: 19, padding: "12px 22px", borderRadius: 10, border: `1px solid ${C.line2}`, color: C.muted }}>No</div>
          <div style={{
            fontFamily: mono, fontWeight: 600, fontSize: 19, padding: "12px 26px", borderRadius: 10,
            background: allowed ? C.tealDim : C.amber, color: allowed ? "#eafff8" : "#241800",
            boxShadow: `0 0 ${clickT * 24}px ${C.amberGlow}`, scale: `${1 - clickT * 0.05}`,
          }}>{allowed ? "✓ fatto" : "Consenti"}</div>
        </div>
      </div>
      <Cursor x={cx} y={cy} press={clickT} />
    </AbsoluteFill>
  );
};
