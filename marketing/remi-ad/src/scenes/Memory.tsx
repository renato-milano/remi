import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { useMockup3D } from "../ui";
import { ri, SectionHead } from "../kit";
import { useLang } from "../i18n";

// ── 7 · MEMORIA ──────────────────────────────────────────────
// Le card entrano ordinate, poi una query si "digita" (memory.search)
// con caret e i risultati appaiono. Remi pensa, poi annuisce quando ricorda.
// Tutto sul dispositivo: pulito e rassicurante.

const TYPE_FROM = 34; // frame d'inizio digitazione
const TYPE_TO = 54; // frame di fine digitazione

export const SceneMemory: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLang();

  const T = ({
    it: {
      num: "05 / Memoria",
      title: "Ricorda tutto.",
      sub: "Un cervello in markdown leggibile, che vive sul tuo dispositivo.",
      onDevice: "sul tuo dispositivo",
      query: "cosa preferisce",
      mem: {
        core: "chi sei, cosa ti serve",
        semantic: "fatti su di te, versionati",
        episodic: "cosa è successo, e quando",
      },
      results: [
        "tono asciutto, niente fronzoli",
        "lavora la sera, fuso CET",
        "preferisce i riepiloghi brevi",
      ],
    },
    en: {
      num: "05 / Memory",
      title: "Remembers everything.",
      sub: "A brain in readable markdown, living on your device.",
      onDevice: "on your device",
      query: "what they prefer",
      mem: {
        core: "who you are, what you need",
        semantic: "facts about you, versioned",
        episodic: "what happened, and when",
      },
      results: [
        "dry tone, no fluff",
        "works evenings, CET timezone",
        "prefers short summaries",
      ],
    },
  } as const)[L];

  const MEM = [
    { k: "core", d: T.mem.core, c: C.teal },
    { k: "semantic", d: T.mem.semantic, c: "#7fe4ff" },
    { k: "episodic", d: T.mem.episodic, c: C.amber },
  ];
  const RESULTS = [
    { c: C.teal, t: T.results[0] },
    { c: "#7fe4ff", t: T.results[1] },
    { c: C.amber, t: T.results[2] },
  ];
  const QUERY = T.query;

  // testo digitato in base al frame
  const chars = Math.round(
    interpolate(frame, [TYPE_FROM, TYPE_TO], [0, QUERY.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const typed = QUERY.slice(0, chars);
  const typing = frame >= TYPE_FROM && frame < TYPE_TO;
  // caret: pieno mentre digita, lampeggia dopo
  const caretOn = typing ? true : Math.floor((frame - TYPE_TO) / 8) % 2 === 0;

  // Remi "ricorda" al momento in cui i risultati appaiono → cenno + espressione felice
  const REMEMBER = 58;
  const remExpr = frame < REMEMBER ? "thinking" : frame < REMEMBER + 10 ? "excited" : "happy";
  // cenno (nod): breve rotazione + rimbalzo verticale a molla al momento del ricordo
  const nod = spring({ frame: frame - REMEMBER, fps, config: { damping: 9, mass: 0.5, stiffness: 160 } });
  const nodDone = spring({ frame: frame - REMEMBER - 4, fps, config: { damping: 9, mass: 0.5, stiffness: 160 } });
  const nodY = (nod - nodDone) * 14; // giù e su
  const nodRot = (nod - nodDone) * 4;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead
        num={T.num}
        title={<>{T.title}</>}
        sub={T.sub}
      />

      {/* Pannello memoria: card ordinate + ricerca + risultati */}
      <div
        style={{
          position: "absolute",
          right: 130,
          top: "50%",
          translate: "0 -50%",
          width: 660,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          transform: useMockup3D(6, 0.09, -7),
        }}
      >
        {/* etichetta "on-device" rassicurante */}
        <div
          style={{
            ...(() => {
              const o = ri(frame, 4, 14, 0, 1);
              return { opacity: o };
            })(),
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: mono,
            fontSize: 18,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: C.teal,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: C.teal,
              boxShadow: `0 0 10px ${C.tealGlow}`,
            }}
          />
          {T.onDevice}
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
                borderLeft: `3px solid ${m.c}`,
                borderRadius: 12,
                padding: "16px 22px",
              }}
            >
              <div style={{ fontFamily: mono, fontSize: 22, color: m.c }}># {m.k}</div>
              <div
                style={{
                  fontFamily: sans,
                  fontWeight: 400,
                  fontSize: 25,
                  color: "#c9d0cc",
                  marginTop: 5,
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
            ...(() => {
              const o = ri(frame, 30, 40, 0, 1);
              const y = ri(frame, 30, 40, 14, 0);
              return { opacity: o, translate: `0 ${y}px` };
            })(),
            marginTop: 4,
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "rgba(0,255,200,.05)",
            border: `1px solid ${C.tealDim}`,
            borderRadius: 10,
            padding: "13px 18px",
            fontFamily: mono,
            fontSize: 22,
          }}
        >
          <span style={{ color: C.teal }}>memory.search</span>
          <span style={{ color: C.faint }}>(</span>
          <span style={{ color: C.ink }}>
            "{typed}
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: 24,
                marginLeft: 1,
                verticalAlign: "-4px",
                background: C.teal,
                opacity: caretOn ? 1 : 0,
              }}
            />
            "
          </span>
          <span style={{ color: C.faint }}>)</span>
        </div>

        {/* Risultati che appaiono uno a uno */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
          {RESULTS.map((r, i) => {
            const at = 56 + i * 5;
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
                  gap: 12,
                  fontFamily: mono,
                  fontSize: 20,
                  color: "#c9d0cc",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: r.c,
                    boxShadow: `0 0 8px ${r.c}`,
                  }}
                />
                {r.t}
              </div>
            );
          })}
        </div>
      </div>

      {/* Remi: pensa, poi annuisce quando ricorda */}
      <div style={{ position: "absolute", left: 150, bottom: 96 }}>
        <div style={{ translate: `0 ${nodY}px`, rotate: `${nodRot}deg`, transformOrigin: "50% 90%" }}>
          <Remi state="thinking" expr={remExpr} size={278} seed={3} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
