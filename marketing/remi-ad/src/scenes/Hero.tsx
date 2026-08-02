import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { HolynMark, useRise, usePop } from "../ui";

// ── 1 · HERO ──────────────────────────────────────────────────
export const SceneHero: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = usePop(2);
  const expr = frame > 8 && frame < 48 ? "hearts" : undefined;
  const h = useRise(24, 10);
  const s = useRise(36, 10);
  const holyn = useRise(50, 10);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ scale: `${pop}`, marginBottom: 6 }}>
        <Remi state="idle" expr={expr as never} size={340} />
      </div>
      <div style={{ ...h, fontFamily: sans, fontWeight: 800, fontSize: 118, color: C.ink, letterSpacing: "-0.045em", lineHeight: 1 }}>
        Ciao, sono <span style={{ color: C.teal }}>Remi</span>.
      </div>
      <div style={{ ...s, marginTop: 22, fontFamily: sans, fontWeight: 400, fontSize: 36, color: C.muted, letterSpacing: "-0.01em" }}>
        l'agente che vive sul tuo dispositivo.
      </div>
      <div style={{ ...holyn, marginTop: 40, display: "flex", alignItems: "center", gap: 12 }}>
        <HolynMark size={26} />
        <span style={{ fontFamily: mono, fontSize: 22, letterSpacing: "0.14em", color: C.faint, textTransform: "uppercase" }}>by Holyn</span>
      </div>
    </AbsoluteFill>
  );
};
