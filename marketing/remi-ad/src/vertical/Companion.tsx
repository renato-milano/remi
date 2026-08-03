import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, sans, mono } from "../theme";
import { Remi } from "../Remi";
import { HolynMark, useRise, usePop } from "../ui";

// ── 07 · COMPAGNO DI LAVORO (VERTICALE) — momento di marca ───
export const SceneCompanionV: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = usePop(2);
  const expr = frame > 8 && frame < 56 ? "hearts" : undefined;
  const l1 = useRise(22, 12);
  const l2 = useRise(32, 12);
  const sub = useRise(50, 12);
  const holyn = useRise(66, 12);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 90px" }}>
      <div style={{ scale: `${pop}`, marginBottom: 26 }}>
        <Remi state="idle" expr={expr as never} size={360} />
      </div>
      <div style={{ ...l1, fontFamily: sans, fontWeight: 500, fontSize: 46, color: C.muted, letterSpacing: "-0.02em" }}>
        Non uno strumento.
      </div>
      <div style={{ ...l2, fontFamily: sans, fontWeight: 800, fontSize: 84, color: C.ink, letterSpacing: "-0.03em", lineHeight: 1.05, marginTop: 8, textAlign: "center" }}>
        Un <span style={{ color: C.teal }}>compagno<br />di lavoro</span>.
      </div>
      <div style={{ ...sub, fontFamily: sans, fontWeight: 400, fontSize: 34, color: C.muted, marginTop: 28, textAlign: "center", maxWidth: 880, lineHeight: 1.45 }}>
        Lavora al tuo fianco: impara come lavori, c'è quando serve, cresce con te.
      </div>
      <div style={{ ...holyn, marginTop: 38, display: "flex", alignItems: "center", gap: 14 }}>
        <HolynMark size={30} />
        <span style={{ fontFamily: mono, fontSize: 26, letterSpacing: "0.16em", color: C.faint, textTransform: "uppercase" }}>creato da Holyn</span>
      </div>
    </AbsoluteFill>
  );
};
