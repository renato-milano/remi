import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { HolynMark, Heartbeat, useRise, usePop } from "../ui";

// ── 11 · CTA ─────────────────────────────────────────────────
export const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = usePop(2);
  const expr = frame > 10 && frame < 70 ? "hearts" : undefined;
  const word = useRise(22, 10);
  const by = useRise(34, 10);
  const foot = useRise(50, 10);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ scale: `${pop}`, marginBottom: 10 }}>
        <Remi state="idle" expr={expr as never} size={300} />
      </div>
      <div style={{ ...word, fontFamily: sans, fontWeight: 800, fontSize: 128, color: C.ink, letterSpacing: "-0.05em", lineHeight: 1 }}>
        Remi
      </div>
      <div style={{ ...by, marginTop: 14, display: "flex", alignItems: "center", gap: 14 }}>
        <HolynMark size={34} />
        <span style={{ fontFamily: mono, fontSize: 28, letterSpacing: "0.16em", color: C.muted, textTransform: "uppercase" }}>by Holyn</span>
      </div>
      <div style={{ ...foot, marginTop: 34, display: "flex", alignItems: "center", gap: 18, fontFamily: mono, fontSize: 23, color: C.faint, letterSpacing: "0.05em" }}>
        <Heartbeat size={13} />
        <span>local-first</span><span>·</span><span>open source</span><span>·</span><span style={{ color: C.teal }}>holyn.ai</span>
      </div>
    </AbsoluteFill>
  );
};
