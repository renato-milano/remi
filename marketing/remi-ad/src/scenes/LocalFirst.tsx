import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C, sans } from "../theme";
import { Chip, useRise, usePop } from "../ui";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// ── 10 · APERTO E TRASPARENTE (onesto: niente claim "local-first") ──
export const SceneLocalFirst: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = usePop(2);
  const h = useRise(16, 10);
  const s = useRise(28, 10);
  const foot = useRise(44, 10);
  const breath = 1 + Math.sin(frame / 14) * 0.012;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* documento markdown leggibile (trasparenza, niente scatola nera) */}
      <div style={{ scale: `${pop * breath}`, marginBottom: 30, filter: `drop-shadow(0 0 26px ${C.tealGlow})` }}>
        <svg width={150} height={158} viewBox="0 0 150 158" style={{ overflow: "visible" }}>
          <rect x="34" y="16" width="82" height="118" rx="12" fill="none" stroke={C.teal} strokeWidth={4} />
          {[0, 1, 2, 3, 4].map((i) => {
            const w = [42, 58, 36, 52, 30][i];
            const on = interpolate(frame, [8 + i * 4, 16 + i * 4], [0, 1], clamp);
            return (
              <rect key={i} x="48" y={40 + i * 17} width={w} height={5} rx={2.5} fill={i === 0 ? C.teal : "#6f7b74"} opacity={on} style={{ transformOrigin: "left center", scale: `${on} 1` }} />
            );
          })}
        </svg>
      </div>

      <div style={{ ...h, fontFamily: sans, fontWeight: 800, fontSize: 92, color: C.ink, textAlign: "center", lineHeight: 1.02, letterSpacing: "-0.04em" }}>
        Aperto e <span style={{ color: C.teal }}>trasparente</span>.
      </div>

      <div style={{ ...s, fontFamily: sans, fontWeight: 400, fontSize: 33, color: C.muted, marginTop: 22, textAlign: "center", maxWidth: 1180, lineHeight: 1.4 }}>
        Open source, e la memoria di Remi è markdown che puoi leggere. Il modello? Lo scegli tu.
      </div>

      <div style={{ ...foot, marginTop: 38, display: "flex", gap: 14 }}>
        <Chip accent={C.teal}>open source · MIT</Chip>
        <Chip>memoria leggibile</Chip>
        <Chip>il modello lo scegli tu</Chip>
      </div>
    </AbsoluteFill>
  );
};
