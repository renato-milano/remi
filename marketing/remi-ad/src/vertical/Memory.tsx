import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { useMockup3D } from "../ui";
import { ri, SectionHeadV } from "../kit";

// ── 05 · MEMORIA (verticale 9:16) ────────────────────────────
// In verticale si impila: titolo in alto, il pannello memoria al centro
// (card ordinate → query che si digita → risultati), Remi GRANDE sotto
// che pensa e annuisce quando "ricorda". Tutto sul dispositivo.

const MEM = [
  { k: "core", d: "chi sei, cosa ti serve", c: C.teal },
  { k: "semantic", d: "fatti su di te, versionati", c: "#7fe4ff" },
  { k: "episodic", d: "cosa è successo, e quando", c: C.amber },
];

// query che si digita a caratteri, guidata dal frame
const QUERY = "cosa preferisce";
const TYPE_FROM = 40; // frame d'inizio digitazione
const TYPE_TO = 62; // frame di fine digitazione

const RESULTS = [
  { c: C.teal, t: "tono asciutto, niente fronzoli" },
  { c: "#7fe4ff", t: "lavora la sera, fuso CET" },
  { c: C.amber, t: "preferisce i riepiloghi brevi" },
];

export const SceneMemoryV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // testo digitato in base al frame
  const chars = Math.round(
    interpolate(frame, [TYPE_FROM, TYPE_TO], [0, QUERY.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const typed = QUERY.slice(0, chars);
  const typing = frame >= TYPE_FROM && frame < TYPE_TO;
  const caretOn = typing ? true : Math.floor((frame - TYPE_TO) / 8) % 2 === 0;

  // Remi "ricorda" quando i risultati appaiono → cenno + espressione felice
  const REMEMBER = 66;
  const remExpr = frame < REMEMBER ? "thinking" : frame < REMEMBER + 12 ? "excited" : "happy";
  // cenno (nod): breve rimbalzo verticale + micro-rotazione a molla
  const nod = spring({ frame: frame - REMEMBER, fps, config: { damping: 9, mass: 0.5, stiffness: 160 } });
  const nodDone = spring({ frame: frame - REMEMBER - 4, fps, config: { damping: 9, mass: 0.5, stiffness: 160 } });
  const nodY = (nod - nodDone) * 16;
  const nodRot = (nod - nodDone) * 4;

  return (
    <AbsoluteFill>
      <SectionHeadV num="05 / Memoria" title={<>Ricorda tutto.</>} />

      {/* Pannello memoria: on-device + card + ricerca + risultati */}
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: 470,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          transform: useMockup3D(6, 0.05, -5),
          transformOrigin: "50% 0%",
        }}
      >
        {/* etichetta "sul tuo dispositivo" rassicurante */}
        <div
          style={{
            opacity: ri(frame, 4, 14, 0, 1),
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontFamily: mono,
            fontSize: 22,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: C.teal,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: C.teal,
              boxShadow: `0 0 12px ${C.tealGlow}`,
            }}
          />
          sul tuo dispositivo
        </div>

        {MEM.map((m, i) => {
          const at = 8 + i * 7;
          const o = ri(frame, at, at + 12, 0, 1);
          const x = ri(frame, at, at + 12, 46, 0);
          return (
            <div
              key={m.k}
              style={{
                opacity: o,
                translate: `${x}px 0`,
                background: "rgba(255,255,255,.035)",
                border: `1px solid ${C.line}`,
                borderLeft: `4px solid ${m.c}`,
                borderRadius: 14,
                padding: "22px 28px",
              }}
            >
              <div style={{ fontFamily: mono, fontSize: 30, color: m.c }}># {m.k}</div>
              <div
                style={{
                  fontFamily: sans,
                  fontWeight: 400,
                  fontSize: 32,
                  color: "#c9d0cc",
                  marginTop: 8,
                }}
              >
                {m.d}
              </div>
            </div>
          );
        })}

        {/* Barra di ricerca: la query si digita con caret */}
        <div
          style={{
            opacity: ri(frame, 34, 44, 0, 1),
            translate: `0 ${ri(frame, 34, 44, 16, 0)}px`,
            marginTop: 6,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0 4px",
            background: "rgba(0,255,200,.05)",
            border: `1px solid ${C.tealDim}`,
            borderRadius: 12,
            padding: "20px 26px",
            fontFamily: mono,
            fontSize: 28,
          }}
        >
          <span style={{ color: C.teal }}>memory.search</span>
          <span style={{ color: C.faint }}>(</span>
          <span style={{ color: C.ink }}>
            "{typed}
            <span
              style={{
                display: "inline-block",
                width: 3,
                height: 30,
                marginLeft: 1,
                verticalAlign: "-5px",
                background: C.teal,
                opacity: caretOn ? 1 : 0,
              }}
            />
            "
          </span>
          <span style={{ color: C.faint }}>)</span>
        </div>

        {/* Risultati che appaiono uno a uno */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
          {RESULTS.map((r, i) => {
            const at = 64 + i * 5;
            const o = ri(frame, at, at + 8, 0, 1);
            const x = ri(frame, at, at + 8, 18, 0);
            return (
              <div
                key={r.t}
                style={{
                  opacity: o,
                  translate: `${x}px 0`,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  fontFamily: mono,
                  fontSize: 27,
                  color: "#c9d0cc",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: r.c,
                    boxShadow: `0 0 10px ${r.c}`,
                  }}
                />
                {r.t}
              </div>
            );
          })}
        </div>
      </div>

      {/* Remi GRANDE sotto: pensa, poi annuisce quando ricorda */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 96,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div style={{ translate: `0 ${nodY}px`, rotate: `${nodRot}deg`, transformOrigin: "50% 90%" }}>
          <Remi state="thinking" expr={remExpr} size={280} seed={3} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
