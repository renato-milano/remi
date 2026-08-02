import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C, mono } from "../theme";
import { Remi } from "../Remi";
import { ri, SectionHead, Folder } from "../kit";

// ── 4 · FILE / CARTELLE ──────────────────────────────────────
const FILES = [
  { n: "report_q3.pdf", to: 0, c: C.teal },
  { n: "foto_2408.jpg", to: 1, c: "#7fe4ff" },
  { n: "fattura_88.pdf", to: 0, c: C.teal },
  { n: "note.md", to: 2, c: C.amber },
  { n: "logo.png", to: 1, c: "#7fe4ff" },
  { n: "budget.xlsx", to: 2, c: C.amber },
];
const FOLDERS = ["Documenti", "Immagini", "Lavoro"];
export const SceneFolders: React.FC = () => {
  const frame = useCurrentFrame();
  const fx = [-430, 0, 430];
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num="02 / File" title={<>Mette ordine.</>} sub="Sposta, rinomina, archivia — da solo." />
      <div style={{ position: "relative", width: 1200, height: 620, marginTop: 120 }}>
        {FOLDERS.map((f, i) => (
          <div key={f} style={{ position: "absolute", left: "50%", top: 420, translate: `calc(-50% + ${fx[i]}px) 0`, textAlign: "center", opacity: ri(frame, 8, 20, 0, 1) }}>
            <Folder size={150} color={[C.teal, "#7fe4ff", C.amber][i]} />
            <div style={{ fontFamily: mono, fontSize: 22, color: C.muted, marginTop: 10 }}>{f}</div>
          </div>
        ))}
        {FILES.map((file, i) => {
          const start = 26 + i * 9;
          const t = ri(frame, start, start + 22, 0, 1);
          const startX = (i - 2.5) * 150;
          const startY = -40;
          const endX = fx[file.to];
          const endY = 360;
          const x = startX + (endX - startX) * t;
          const y = startY + (endY - startY) * t;
          const o = ri(frame, start, start + 8, 0, 1) * (1 - ri(frame, start + 16, start + 22, 0, 1) * 0.6);
          const scale = interpolate(t, [0, 1], [1, 0.55]);
          return (
            <div key={file.n} style={{
              position: "absolute", left: "50%", top: 220, translate: `calc(-50% + ${x}px) ${y}px`, opacity: o, scale: `${scale}`,
              fontFamily: mono, fontSize: 20, color: C.ink, background: "rgba(255,255,255,.04)",
              border: `1px solid ${file.c}`, borderRadius: 8, padding: "10px 16px", whiteSpace: "nowrap",
              boxShadow: `0 0 16px ${file.c}22`,
            }}>
              {file.n}
            </div>
          );
        })}
        <div style={{ position: "absolute", left: "50%", top: 150, translate: "-50% 0" }}>
          <Remi state="acting" size={170} seed={4} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
