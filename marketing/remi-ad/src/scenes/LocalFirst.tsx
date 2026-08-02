import React from "react";
import { AbsoluteFill } from "remotion";
import { C, sans } from "../theme";
import { Chip, useRise, usePop } from "../ui";

// ── 10 · LOCAL-FIRST ─────────────────────────────────────────
export const SceneLocalFirst: React.FC = () => {
  const lock = usePop(2);
  const h = useRise(14, 10);
  const s = useRise(26, 10);
  const foot = useRise(38, 10);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <svg width={116} height={136} viewBox="0 0 120 140" style={{ scale: `${lock}`, marginBottom: 28, filter: `drop-shadow(0 0 26px ${C.tealGlow})` }}>
        <rect x="20" y="60" width="80" height="66" rx="14" fill="none" stroke={C.teal} strokeWidth={5} />
        <path d="M36 60 V44 a24 24 0 0 1 48 0 V60" fill="none" stroke={C.teal} strokeWidth={5} strokeLinecap="round" />
        <circle cx="60" cy="88" r="8" fill={C.teal} />
        <rect x="56" y="92" width="8" height="20" rx="4" fill={C.teal} />
      </svg>
      <div style={{ ...h, fontFamily: sans, fontWeight: 800, fontSize: 96, color: C.ink, textAlign: "center", lineHeight: 1.02, letterSpacing: "-0.04em" }}>
        I tuoi dati <span style={{ color: C.teal }}>restano tuoi</span>.
      </div>
      <div style={{ ...s, fontFamily: sans, fontWeight: 400, fontSize: 34, color: C.muted, marginTop: 20, textAlign: "center" }}>
        Local-first. Memoria e cronologia vivono solo qui.
      </div>
      <div style={{ ...foot, marginTop: 36, display: "flex", gap: 14 }}>
        <Chip accent={C.teal}>local-first</Chip>
        <Chip>nessun cloud obbligato</Chip>
        <Chip>open source</Chip>
      </div>
    </AbsoluteFill>
  );
};
