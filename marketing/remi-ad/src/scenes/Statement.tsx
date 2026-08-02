import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, sans } from "../theme";
import { usePop, useBeat } from "../ui";

// ── 2 · STATEMENT (kinetic) ──────────────────────────────────
export const SceneStatement: React.FC = () => {
  const beat = useBeat();
  const p1 = usePop(4);
  const p2 = usePop(22);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ fontFamily: sans, fontWeight: 800, letterSpacing: "-0.04em", textAlign: "center", lineHeight: 1.02 }}>
        <div style={{ scale: `${p1}`, fontSize: 96, color: C.muted }}>Non è un chatbot.</div>
        <div style={{ scale: `${p2 * (1 + beat * 0.02)}`, fontSize: 150, color: C.ink, marginTop: 6 }}>
          È <span style={{ color: C.teal, textShadow: `0 0 40px ${C.tealGlow}` }}>vivo</span>.
        </div>
      </div>
    </AbsoluteFill>
  );
};
