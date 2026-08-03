import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { useZoomIn } from "../ui";
import { ri, SectionHeadV, Folder } from "../kit";
import { useLang } from "../i18n";

// ── 02 · FILE / CARTELLE — versione VERTICALE 9:16 ───────────────
// Impaginazione verticale: titolo in alto (SectionHeadV), Remi al centro che
// smista, le 3 cartelle in una riga centrata nella metà bassa. I chip-file
// volano da Remi nelle cartelle con arco e atterraggio "clunk" (glow + bump).
// Fine: fumetto DA REMI "✓ Tutto in ordine!".

const FOLDER_META = [
  { color: C.teal },
  { color: "#7fe4ff" },
  { color: C.amber },
];

const FILES = [
  { n: "report_q3.pdf", to: 0, c: C.teal, lane: -1.6 },
  { n: "foto_2408.jpg", to: 1, c: "#7fe4ff", lane: -0.6 },
  { n: "fattura_88.pdf", to: 0, c: C.teal, lane: 0.2 },
  { n: "logo.png", to: 1, c: "#7fe4ff", lane: 0.9 },
  { n: "note.md", to: 2, c: C.amber, lane: -0.2 },
  { n: "budget.xlsx", to: 2, c: C.amber, lane: 1.5 },
];

// x delle 3 cartelle (riga centrata, tela larga 1080)
const FX = [-330, 0, 330];

// timing compresso in D=114 frame
const FILE_START = 20; // primo file parte
const FILE_GAP = 9; // sfasamento tra un file e il successivo
const FLY = 22; // durata volo di un file
const LAST_LAND = FILE_START + (FILES.length - 1) * FILE_GAP + FLY; // = 87

// geometria verticale (coordinate relative al contenitore feature)
const REMI_TOP = 40; // Remi in alto nel contenitore, sopra le cartelle
const FOLDER_TOP = 470; // riga cartelle nella metà bassa
const FLY_START_TOP = 240; // punto d'uscita dei chip (sotto Remi)
const FLY_START_Y = -110; // partenza chip relativa a FLY_START_TOP
const FLY_END_Y = 240; // atterraggio chip (dentro le cartelle)

export const SceneFoldersV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLang();
  const T = ({
    it: {
      kicker: "02 / File",
      title: "Mette ordine.",
      sub: "Da solo, in un attimo. Sposta, rinomina, archivia.",
      folders: ["Cliente #1", "Progetto A", "Progetto B"],
      files: "file",
      done: "Tutto in ordine!",
    },
    en: {
      kicker: "02 / Files",
      title: "Keeps it tidy.",
      sub: "On its own, in seconds. Moves, renames, archives.",
      folders: ["Client #1", "Project A", "Project B"],
      files: "files",
      done: "All tidy!",
    },
  } as const)[L];
  const FOLDERS = FOLDER_META.map((m, i) => ({ ...m, name: T.folders[i] }));

  const done = frame >= LAST_LAND + 2;
  const remiExpr = frame < 14 ? "scan" : done ? (frame < LAST_LAND + 12 ? "excited" : "grin") : "scan";

  // scatto verso il basso quando "spinge" ogni file + rimbalzo finale
  const remiPush = FILES.reduce((acc, _, i) => {
    const s = FILE_START + i * FILE_GAP;
    const p = interpolate(frame, [s - 3, s, s + 6], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return Math.max(acc, p);
  }, 0);
  const remiCheer = spring({ frame: frame - (LAST_LAND + 2), fps, config: { damping: 9, mass: 0.5, stiffness: 150 } });
  const remiBobY = remiPush * 12 - remiCheer * 18;
  const remiScale = 1 + remiCheer * 0.06;

  // pulsazione dell'alone di una cartella quando ci atterra un file
  const folderGlow = (fi: number) => {
    let g = 0;
    FILES.forEach((f, i) => {
      if (f.to !== fi) return;
      const land = FILE_START + i * FILE_GAP + FLY;
      g = Math.max(g, interpolate(frame, [land - 2, land, land + 14], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    });
    return g;
  };
  // "clunk": scatto di scala della cartella all'ingresso di un file
  const folderBump = (fi: number) => {
    let b = 0;
    FILES.forEach((f, i) => {
      if (f.to !== fi) return;
      const land = FILE_START + i * FILE_GAP + FLY;
      b = Math.max(b, interpolate(frame, [land - 1, land + 2, land + 12], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    });
    return b;
  };

  const zoom = useZoomIn(6, 0.05);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHeadV num={T.kicker} title={<>{T.title}</>} sub={T.sub} />

      {/* contenitore feature: al centro/basso della tela, sotto il titolo */}
      <div style={{ position: "absolute", left: "50%", top: 640, translate: "-50% 0", width: 920, height: 780, scale: `${zoom}` }}>
        {/* Remi che smista (al centro, sopra le cartelle) */}
        <div style={{ position: "absolute", left: "50%", top: REMI_TOP, translate: "-50% 0", zIndex: 5 }}>
          <div style={{ translate: `0 ${remiBobY}px`, scale: `${remiScale}` }}>
            <Remi state="acting" expr={remiExpr} size={210} seed={4} />
          </div>
        </div>

        {/* le 3 cartelle */}
        {FOLDERS.map((f, i) => {
          const appear = ri(frame, 6 + i * 3, 20 + i * 3, 0, 1);
          const pop = spring({ frame: frame - (6 + i * 3), fps, config: { damping: 12, mass: 0.6, stiffness: 130 } });
          const glow = folderGlow(i);
          const bump = folderBump(i);
          const scale = (0.6 + pop * 0.4) * (1 + bump * 0.12);
          const count = FILES.filter((x, xi) => x.to === i && frame >= FILE_START + xi * FILE_GAP + FLY).length;
          return (
            <div
              key={f.name}
              style={{
                position: "absolute",
                left: "50%",
                top: FOLDER_TOP,
                translate: `calc(-50% + ${FX[i]}px) 0`,
                textAlign: "center",
                opacity: appear,
                scale: `${scale}`,
                filter: `drop-shadow(0 0 ${8 + glow * 34}px ${f.color}${glow > 0.02 ? "cc" : "44"})`,
              }}
            >
              <Folder size={188} color={f.color} />
              <div style={{ fontFamily: mono, fontSize: 27, color: glow > 0.1 ? f.color : C.muted, marginTop: 12, letterSpacing: "0.02em" }}>
                {f.name}
              </div>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 22,
                  color: f.color,
                  marginTop: 6,
                  opacity: count > 0 ? 0.9 : 0,
                }}
              >
                {count > 0 ? `${count} ${T.files}` : ""}
              </div>
            </div>
          );
        })}

        {/* i file che sfrecciano nelle cartelle */}
        {FILES.map((file, i) => {
          const start = FILE_START + i * FILE_GAP;
          const land = start + FLY;
          const t = interpolate(frame, [start, land], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.55, 0, 0.2, 1),
          });
          const startX = file.lane * 120;
          const startY = FLY_START_Y;
          const endX = FX[file.to];
          const endY = FLY_END_Y;
          const x = startX + (endX - startX) * t;
          // arco: sale un filo poi cala nella cartella
          const arc = -80 * Math.sin(Math.PI * t);
          const y = startY + (endY - startY) * t + arc;
          const fadeIn = ri(frame, start, start + 6, 0, 1);
          const fadeOut = ri(frame, land - 4, land, 1, 0);
          const o = fadeIn * fadeOut;
          const scale = interpolate(t, [0, 1], [1, 0.5]);
          const rot = interpolate(t, [0, 1], [file.lane > 0 ? -8 : 8, 0]);
          if (o <= 0) return null;
          return (
            <div
              key={file.n}
              style={{
                position: "absolute",
                left: "50%",
                top: FLY_START_TOP,
                translate: `calc(-50% + ${x}px) ${y}px`,
                opacity: o,
                scale: `${scale}`,
                rotate: `${rot}deg`,
                fontFamily: mono,
                fontSize: 24,
                color: C.ink,
                background: "rgba(255,255,255,.05)",
                border: `1px solid ${file.c}`,
                borderRadius: 10,
                padding: "11px 19px",
                whiteSpace: "nowrap",
                boxShadow: `0 0 22px ${file.c}33`,
                backdropFilter: "blur(2px)",
                zIndex: 4,
              }}
            >
              {file.n}
            </div>
          );
        })}

        {/* messaggio finale DA REMI: fumetto sotto Remi, centrato */}
        {done && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 280,
              translate: "-50% 0",
              scale: `${0.7 + remiCheer * 0.3}`,
              opacity: interpolate(remiCheer, [0, 1], [0, 1]),
              transformOrigin: "center top",
              zIndex: 8,
            }}
          >
            <div
              style={{
                position: "relative",
                background: C.bubbleBg,
                border: `1px solid ${C.teal}`,
                borderRadius: 20,
                padding: "18px 30px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                whiteSpace: "nowrap",
                boxShadow: `0 0 34px ${C.tealGlow}, 0 12px 30px rgba(0,0,0,.5)`,
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: C.teal,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#04120a",
                  fontWeight: 800,
                  fontSize: 22,
                }}
              >
                ✓
              </span>
              <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 44, color: C.ink, letterSpacing: "-0.01em" }}>{T.done}</span>
              {/* codina verso Remi (in alto) */}
              <div
                style={{
                  position: "absolute",
                  top: -9,
                  left: "50%",
                  width: 16,
                  height: 16,
                  background: C.bubbleBg,
                  borderTop: `1px solid ${C.teal}`,
                  borderLeft: `1px solid ${C.teal}`,
                  translate: "-50% 0",
                  rotate: "45deg",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
