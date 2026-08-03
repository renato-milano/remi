import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, sans, mono } from "../theme";
import { Remi } from "../Remi";
import { HolynMark, useRise, usePop } from "../ui";

// ── 07 · COMPAGNO DI LAVORO — momento di marca (Holyn) ───────
export const SceneCompanion: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = usePop(2);
  const expr = frame > 8 && frame < 56 ? "hearts" : undefined;
  const l1 = useRise(22, 12);
  const l2 = useRise(32, 12);
  const sub = useRise(50, 12);
  const holyn = useRise(66, 12);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ scale: `${pop}`, marginBottom: 18 }}>
        <Remi state="idle" expr={expr as never} size={300} />
      </div>
      <div style={{ ...l1, fontFamily: sans, fontWeight: 500, fontSize: 52, color: C.muted, letterSpacing: "-0.02em" }}>
        Non uno strumento.
      </div>
      <div style={{ ...l2, fontFamily: sans, fontWeight: 800, fontSize: 96, color: C.ink, letterSpacing: "-0.03em", lineHeight: 1.02, marginTop: 6 }}>
        Un <span style={{ color: C.teal }}>compagno di lavoro</span>.
      </div>
      <div style={{ ...sub, fontFamily: sans, fontWeight: 400, fontSize: 33, color: C.muted, marginTop: 24, textAlign: "center", maxWidth: 1180, lineHeight: 1.4 }}>
        Lavora al tuo fianco: impara come lavori, c'è quando serve, cresce con te.
      </div>
      <div style={{ ...holyn, marginTop: 36, display: "flex", alignItems: "center", gap: 12 }}>
        <HolynMark size={26} />
        <span style={{ fontFamily: mono, fontSize: 22, letterSpacing: "0.16em", color: C.faint, textTransform: "uppercase" }}>creato da Holyn</span>
      </div>
    </AbsoluteFill>
  );
};
