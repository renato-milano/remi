import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { useZoomIn } from "../ui";
import { ri, SectionHead, Folder } from "../kit";
import { useLang } from "../i18n";

// ── 4 · FILE / CARTELLE ──────────────────────────────────────
// Remi riordina i file: chip che sfrecciano nelle 3 cartelle con
// atterraggio "clunk" (scale bump + glow), poi orgoglioso: "12 file in ordine".

const FOLDER_META = [
  { color: C.teal },
  { color: "#7fe4ff" },
  { color: C.amber },
];

// 6 file (contiamo fino a 12: il badge finale "raddoppia" il senso di lavoro svolto)
const FILES = [
  { n: "report_q3.pdf", to: 0, c: C.teal, lane: -2.4 },
  { n: "foto_2408.jpg", to: 1, c: "#7fe4ff", lane: -1.0 },
  { n: "fattura_88.pdf", to: 0, c: C.teal, lane: 0.2 },
  { n: "logo.png", to: 1, c: "#7fe4ff", lane: 1.3 },
  { n: "note.md", to: 2, c: C.amber, lane: -0.4 },
  { n: "budget.xlsx", to: 2, c: C.amber, lane: 2.4 },
];

const FX = [-430, 0, 430]; // x delle 3 cartelle
const FILE_START = 24; // primo file
const FILE_GAP = 8; // sfasamento tra un file e il successivo
const FLY = 20; // durata volo di un file
// frame in cui l'ultimo file atterra
const LAST_LAND = FILE_START + (FILES.length - 1) * FILE_GAP + FLY;

export const SceneFolders: React.FC = () => {
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

  // quanti file sono già atterrati (per il conteggio a schermo)
  const landed = FILES.filter((_, i) => frame >= FILE_START + i * FILE_GAP + FLY).length;

  // Remi: legge/agisce mentre smista, poi esulta a fine lavoro
  const done = frame >= LAST_LAND + 2;
  const remiExpr = frame < 16 ? "scan" : done ? (frame < LAST_LAND + 12 ? "excited" : "grin") : "scan";

  // piccolo scatto verso il basso quando "spinge" ogni file, + rimbalzo finale
  const remiPush = FILES.reduce((acc, _, i) => {
    const s = FILE_START + i * FILE_GAP;
    const p = interpolate(frame, [s - 3, s, s + 6], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return Math.max(acc, p);
  }, 0);
  const remiCheer = spring({ frame: frame - (LAST_LAND + 2), fps, config: { damping: 9, mass: 0.5, stiffness: 150 } });
  const remiBobY = remiPush * 12 - remiCheer * 16;
  const remiScale = 1 + remiCheer * 0.06;

  // pulsazione dell'alone di ogni cartella quando ci atterra un file dentro
  const folderGlow = (fi: number) => {
    let g = 0;
    FILES.forEach((f, i) => {
      if (f.to !== fi) return;
      const land = FILE_START + i * FILE_GAP + FLY;
      g = Math.max(g, interpolate(frame, [land - 2, land, land + 14], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    });
    return g;
  };
  // "clunk": scatto di scala della cartella all'ingresso
  const folderBump = (fi: number) => {
    let b = 0;
    FILES.forEach((f, i) => {
      if (f.to !== fi) return;
      const land = FILE_START + i * FILE_GAP + FLY;
      b = Math.max(b, interpolate(frame, [land - 1, land + 2, land + 12], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    });
    return b;
  };

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num={T.kicker} title={<>{T.title}</>} sub={T.sub} />

      <div style={{ position: "relative", width: 1240, height: 640, marginTop: 130, scale: `${1.1 * useZoomIn(6, 0.07)}` }}>
        {/* Remi che smista */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 118,
            translate: "-50% 0",
            zIndex: 5,
          }}
        >
          <div style={{ translate: `0 ${remiBobY}px`, scale: `${remiScale}` }}>
            <Remi state="acting" expr={remiExpr} size={172} seed={4} />
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
                top: 430,
                translate: `calc(-50% + ${FX[i]}px) 0`,
                textAlign: "center",
                opacity: appear,
                scale: `${scale}`,
                filter: `drop-shadow(0 0 ${8 + glow * 34}px ${f.color}${glow > 0.02 ? "cc" : "44"})`,
              }}
            >
              <Folder size={156} color={f.color} />
              <div style={{ fontFamily: mono, fontSize: 23, color: glow > 0.1 ? f.color : C.muted, marginTop: 10, letterSpacing: "0.02em" }}>
                {f.name}
              </div>
              {/* badge contatore per cartella */}
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 18,
                  color: f.color,
                  marginTop: 4,
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
          // curva di volo con easing morbido in ingresso + arrivo secco
          const t = interpolate(frame, [start, land], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.55, 0, 0.2, 1),
          });
          const startX = file.lane * 165;
          const startY = -30;
          const endX = FX[file.to];
          const endY = 372;
          const x = startX + (endX - startX) * t;
          // arco: sale un filo poi cala nella cartella (traiettoria "gettato")
          const arc = -70 * Math.sin(Math.PI * t);
          const y = startY + (endY - startY) * t + arc;
          // chip: scompare appena "entra" nella cartella
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
                top: 235,
                translate: `calc(-50% + ${x}px) ${y}px`,
                opacity: o,
                scale: `${scale}`,
                rotate: `${rot}deg`,
                fontFamily: mono,
                fontSize: 21,
                color: C.ink,
                background: "rgba(255,255,255,.05)",
                border: `1px solid ${file.c}`,
                borderRadius: 9,
                padding: "10px 17px",
                whiteSpace: "nowrap",
                boxShadow: `0 0 20px ${file.c}33`,
                backdropFilter: "blur(2px)",
              }}
            >
              {file.n}
            </div>
          );
        })}

        {/* messaggio finale DA REMI: "Tutto in ordine!" (fumetto accanto a Remi) */}
        {done && (
          <div
            style={{
              position: "absolute", left: "50%", top: 150, translate: "calc(-50% + 270px) 0",
              scale: `${0.7 + remiCheer * 0.3}`, opacity: interpolate(remiCheer, [0, 1], [0, 1]),
              transformOrigin: "left center",
            }}
          >
            <div
              style={{
                position: "relative", background: C.bubbleBg, border: `1px solid ${C.teal}`, borderRadius: 18,
                padding: "16px 26px", display: "flex", alignItems: "center", gap: 14, whiteSpace: "nowrap",
                boxShadow: `0 0 34px ${C.tealGlow}, 0 12px 30px rgba(0,0,0,.5)`,
              }}
            >
              <span style={{ width: 30, height: 30, borderRadius: "50%", background: C.teal, display: "flex", alignItems: "center", justifyContent: "center", color: "#04120a", fontWeight: 800, fontSize: 18 }}>✓</span>
              <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 36, color: C.ink, letterSpacing: "-0.01em" }}>{T.done}</span>
              {/* codina verso Remi */}
              <div style={{ position: "absolute", left: -9, top: "50%", width: 16, height: 16, background: C.bubbleBg, borderLeft: `1px solid ${C.teal}`, borderBottom: `1px solid ${C.teal}`, translate: "0 -50%", rotate: "45deg" }} />
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// contatore che sale e badge orgoglioso a fine scena
const FinalBadge: React.FC<{ frame: number; fps: number; from: number; count: number }> = ({ frame, fps, from, count }) => {
  const pop = spring({ frame: frame - from, fps, config: { damping: 11, mass: 0.6, stiffness: 140 } });
  const local = frame - from;
  const shown = Math.min(count, Math.max(0, Math.round(interpolate(local, [0, 9], [0, count], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }))));
  const checkOn = ri(frame, from + 10, from + 18, 0, 1);
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: 610,
        translate: "-50% 0",
        scale: `${0.7 + pop * 0.3}`,
        opacity: interpolate(pop, [0, 1], [0, 1]),
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 24px",
        borderRadius: 999,
        border: `1px solid ${C.teal}`,
        background: "rgba(0,255,200,.08)",
        boxShadow: `0 0 30px ${C.tealGlow}`,
        whiteSpace: "nowrap",
        zIndex: 6,
      }}
    >
      <svg width={30} height={30} viewBox="0 0 30 30">
        <circle cx="15" cy="15" r="13" fill="none" stroke={C.teal} strokeWidth="2.4" />
        <path
          d="M8 15 L13 20 L22 10"
          fill="none"
          stroke={C.teal}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="22"
          strokeDashoffset={22 * (1 - checkOn)}
        />
      </svg>
      <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 34, color: C.ink, letterSpacing: "-0.01em" }}>
        <span style={{ fontFamily: mono, color: C.teal, fontWeight: 600 }}>{shown}</span> file in ordine
      </span>
    </div>
  );
};
