import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { C, mono, serif } from "./theme";
import { Remi } from "./Remi";
import { Chip, Kicker, Heartbeat, useRise } from "./ui";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const ri = (frame: number, a: number, b: number, from: number, to: number) =>
  interpolate(frame, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });

// ─────────────────────────────────────────────────────────────
// 1 · HERO — Remi si presenta
// ─────────────────────────────────────────────────────────────
export const SceneHero: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = ri(frame, 4, 34, 0, 1);
  const remiScale = interpolate(frame, [4, 40], [0.6, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.2, 0.9, 0.2, 1.05) });
  // saluto: happy nei primi istanti, poi idle
  const expr = frame > 20 && frame < 70 ? "happy" : undefined;
  const h = useRise(46, 20);
  const s = useRise(64, 20);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: enter, scale: `${remiScale}`, marginBottom: 8 }}>
        <Remi state="idle" expr={expr as never} size={360} />
      </div>
      <div style={{ ...h, fontFamily: serif, fontSize: 108, color: C.ink, letterSpacing: "-0.02em", lineHeight: 1 }}>
        Ciao, sono <span style={{ fontStyle: "italic", color: C.alive }}>Remi</span>.
      </div>
      <div style={{ ...s, marginTop: 26, fontFamily: serif, fontWeight: 300, fontSize: 40, color: "#cdd4cd", maxWidth: 1100, textAlign: "center" }}>
        Un agente AI personale che <b style={{ color: C.ink, fontWeight: 500 }}>vive sul tuo dispositivo</b>.
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────
// 2 · NON UN CHATBOT
// ─────────────────────────────────────────────────────────────
export const SceneNotChatbot: React.FC = () => {
  const frame = useCurrentFrame();
  const line1 = useRise(6, 18);
  const line2 = useRise(30, 18);
  const chips = useRise(58, 18);
  // fumetto reale che appare accanto a Remi
  const bubble = ri(frame, 40, 60, 0, 1);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 70 }}>
        <div style={{ position: "relative" }}>
          <Remi state="idle" size={260} seed={2} />
          <div
            style={{
              position: "absolute", top: 30, left: 250, opacity: bubble, translate: `${(1 - bubble) * -12}px 0`,
              background: C.bubbleBg, color: C.bubbleInk, fontFamily: mono, fontSize: 22, padding: "14px 18px",
              borderRadius: 14, border: `1px solid ${C.line}`, whiteSpace: "nowrap",
              boxShadow: "0 10px 30px rgba(0,0,0,.4)",
            }}
          >
            <span style={{ color: C.alive }}>›</span> pronto quando vuoi
          </div>
        </div>
        <div>
          <div style={{ ...line1, fontFamily: serif, fontSize: 96, color: C.muted, lineHeight: 1.02 }}>
            Non è un chatbot.
          </div>
          <div style={{ ...line2, fontFamily: serif, fontSize: 96, color: C.ink, lineHeight: 1.02 }}>
            È una presenza <span style={{ fontStyle: "italic", color: C.alive }}>viva</span>.
          </div>
          <div style={{ ...chips, marginTop: 40, display: "flex", gap: 16 }}>
            <Chip accent={C.alive}>local-first</Chip>
            <Chip>autonoma · persistente</Chip>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// blocco riutilizzabile: intestazione di sezione
const SectionHead: React.FC<{ num: string; title: React.ReactNode; sub?: string }> = ({ num, title, sub }) => {
  const k = useRise(6, 16);
  const t = useRise(16, 18);
  const s = useRise(30, 18);
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={k}><Kicker>{num}</Kicker></div>
      <div style={{ ...t, fontFamily: serif, fontSize: 74, color: C.ink, letterSpacing: "-0.01em", marginTop: 10, lineHeight: 1.04 }}>
        {title}
      </div>
      {sub && <div style={{ ...s, fontFamily: serif, fontWeight: 300, fontSize: 32, color: C.muted, marginTop: 14, maxWidth: 720 }}>{sub}</div>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 3 · MEMORIA — wiki markdown a livelli
// ─────────────────────────────────────────────────────────────
const MEM = [
  { k: "core", d: "chi è Remi · la sua persona", tint: C.alive },
  { k: "semantic", d: "fatti su di te, versionati", tint: C.cyan },
  { k: "episodic", d: "cosa è successo, e quando", tint: C.egg },
  { k: "working", d: "a cosa sta pensando ora", tint: C.amber },
];
export const SceneMemory: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 130px", justifyContent: "space-between" }}>
      <div style={{ maxWidth: 720 }}>
        <SectionHead num="01 — Memoria" title={<>Ricorda. E cura da sé<br />ciò che sa.</>} sub="Non uno storico chat, ma un cervello a livelli in markdown leggibile e versionabile." />
        <div style={{ ...useRise(46, 18), fontFamily: mono, fontSize: 22, color: C.faint, display: "flex", gap: 22, marginTop: 6 }}>
          <span>SQLite</span><span>·</span><span>FTS5</span><span>·</span><span style={{ color: C.aliveDim }}>wiki markdown</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 560 }}>
        {MEM.map((m, i) => {
          const at = 30 + i * 14;
          const o = ri(frame, at, at + 20, 0, 1);
          const x = ri(frame, at, at + 20, 60, 0);
          return (
            <div key={m.k} style={{
              opacity: o, translate: `${x}px 0`, background: `linear-gradient(180deg, ${C.panel}, ${C.bg2})`,
              border: `1px solid ${C.line}`, borderLeft: `3px solid ${m.tint}`, borderRadius: 14, padding: "18px 22px",
            }}>
              <div style={{ fontFamily: mono, fontSize: 24, color: m.tint, letterSpacing: "0.03em" }}># {m.k}</div>
              <div style={{ fontFamily: serif, fontWeight: 300, fontSize: 26, color: "#c3cbc4", marginTop: 6 }}>{m.d}</div>
            </div>
          );
        })}
        <div style={{ ...useRise(96, 16), fontFamily: mono, fontSize: 20, color: C.muted, marginTop: 4 }}>
          <span style={{ color: C.alive }}>memory.search</span>("cosa preferisce l'utente") → 3 note
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 90, left: 130 }}>
        <Remi state="thinking" size={180} seed={4} />
      </div>
    </AbsoluteFill>
  );
};
