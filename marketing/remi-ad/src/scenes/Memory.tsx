import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { useRise } from "../ui";
import { ri, SectionHead } from "../kit";

// ── 7 · MEMORIA ──────────────────────────────────────────────
const MEM = [
  { k: "core", d: "chi sei, cosa ti serve", c: C.teal },
  { k: "semantic", d: "fatti su di te, versionati", c: "#7fe4ff" },
  { k: "episodic", d: "cosa è successo, e quando", c: C.amber },
];
export const SceneMemory: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num="05 / Memoria" title={<>Ricorda tutto.</>} sub="Un cervello in markdown leggibile — che vive sul tuo dispositivo." />
      <div style={{ position: "absolute", right: 150, top: "50%", translate: "0 -50%", width: 620, display: "flex", flexDirection: "column", gap: 16 }}>
        {MEM.map((m, i) => {
          const at = 8 + i * 8;
          const o = ri(frame, at, at + 12, 0, 1);
          const x = ri(frame, at, at + 12, 50, 0);
          return (
            <div key={m.k} style={{ opacity: o, translate: `${x}px 0`, background: "rgba(255,255,255,.03)", border: `1px solid ${C.line}`, borderLeft: `3px solid ${m.c}`, borderRadius: 12, padding: "18px 22px" }}>
              <div style={{ fontFamily: mono, fontSize: 23, color: m.c }}># {m.k}</div>
              <div style={{ fontFamily: sans, fontWeight: 400, fontSize: 26, color: "#c9d0cc", marginTop: 6 }}>{m.d}</div>
            </div>
          );
        })}
        <div style={{ ...useRise(44, 10), fontFamily: mono, fontSize: 19, color: C.muted, marginTop: 4 }}>
          <span style={{ color: C.teal }}>memory.search</span>("cosa preferisce") → 3 note
        </div>
      </div>
      <div style={{ position: "absolute", left: 150, bottom: 96 }}>
        <Remi state="thinking" size={190} seed={3} />
      </div>
    </AbsoluteFill>
  );
};
