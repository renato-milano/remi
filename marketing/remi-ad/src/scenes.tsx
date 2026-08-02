import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C, mono, sans } from "./theme";
import { Remi } from "./Remi";
import { Chip, Kicker, HolynMark, useRise, usePop, useBeat } from "./ui";
import { EASE, ri, SectionHead, Cursor, WindowChrome, Folder } from "./kit";

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

// ── 2 · STATEMENT (kinetic) ──────────────────────────────────
export const SceneStatement: React.FC = () => {
  const frame = useCurrentFrame();
  const beat = useBeat();
  const p1 = usePop(4);
  const p2 = usePop(22);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ fontFamily: sans, fontWeight: 800, letterSpacing: "-0.04em", textAlign: "center", lineHeight: 1.02 }}>
        <div style={{ scale: `${p1}`, fontSize: 96, color: C.muted }}>Non è un chatbot.</div>
        <div style={{ scale: `${p2 * (1 + beat * 0.02)}`, fontSize: 150, color: C.ink, marginTop: 6 }}>
          È <span style={{ color: C.teal, textShadow: `0 0 40px ${C.tealGlow}` }}>vivo</span>.
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── 3 · COMPUTER-USE ─────────────────────────────────────────
export const SceneDesktop: React.FC = () => {
  const frame = useCurrentFrame();
  const win = usePop(6);
  const banner = ri(frame, 20, 32, 0, 1);
  const bannerPulse = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(frame * 0.35));
  // cursore veloce → clic su "Invia" ~ frame 58
  const cx = interpolate(frame, [26, 56], [860, 800], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const cy = interpolate(frame, [26, 56], [120, 470], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const clickT = interpolate(frame, [57, 62, 70], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sent = frame > 66;
  const snap = frame > 66 && frame < 84;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num="01 / Computer-use" title={<>Vede. Capisce.<br />Agisce.</>} />
      <div style={{ position: "relative", width: 820, height: 470, scale: `${win}`, marginTop: 130, marginLeft: 260 }}>
        <div style={{
          position: "absolute", top: -24, left: "50%", translate: "-50% 0", zIndex: 5, opacity: banner,
          background: "rgba(255,120,80,.16)", border: "1px solid rgba(255,120,80,.5)", color: "#ffd0c4",
          fontFamily: mono, fontSize: 18, padding: "7px 16px", borderRadius: 999, whiteSpace: "nowrap",
        }}>
          <span style={{ opacity: bannerPulse }}>🖥️ controllo schermo attivo</span>
        </div>
        <div style={{ width: "100%", height: "100%", background: "#0b0d0c", border: `1px solid ${C.line2}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,.7)" }}>
          <WindowChrome title="Mail — Nuovo messaggio" />
          <div style={{ padding: 28, fontFamily: mono, fontSize: 19, color: C.muted, position: "relative", height: "calc(100% - 44px)" }}>
            <div style={{ marginBottom: 16 }}><span style={{ color: C.faint }}>A:</span> <span style={{ color: C.ink }}>team@holyn.ai</span></div>
            <div style={{ marginBottom: 16 }}><span style={{ color: C.faint }}>Oggetto:</span> <span style={{ color: C.ink }}>Recap della settimana</span></div>
            <div style={{ height: 1, background: C.line, margin: "4px 0 20px" }} />
            <div style={{ fontFamily: sans, fontSize: 22, color: "#c9d0cc", lineHeight: 1.6, fontWeight: 400 }}>
              Ciao a tutti,<br />ecco il riepilogo dei progressi di questa settimana…
            </div>
            <div style={{
              position: "absolute", right: 28, bottom: 24, padding: "13px 30px", borderRadius: 9,
              background: sent ? C.tealDim : C.teal, color: "#04120a", fontFamily: mono, fontWeight: 600, fontSize: 20,
              boxShadow: `0 0 ${clickT * 26}px ${C.tealGlow}`, scale: `${1 - clickT * 0.06}`,
            }}>
              {sent ? "✓ inviata" : "Invia"}
            </div>
          </div>
        </div>
        <Cursor x={cx} y={cy} press={clickT} />
      </div>
      <div style={{ position: "absolute", right: 120, bottom: 90 }}>
        <Remi state="acting" expr={(snap ? "surprised" : undefined) as never} size={200} seed={5} />
      </div>
    </AbsoluteFill>
  );
};

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
  // posizioni cartelle (x) lungo il fondo
  const fx = [ -430, 0, 430 ];
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num="02 / File" title={<>Mette ordine.</>} sub="Sposta, rinomina, archivia — da solo." />
      <div style={{ position: "relative", width: 1200, height: 620, marginTop: 120 }}>
        {/* cartelle */}
        {FOLDERS.map((f, i) => (
          <div key={f} style={{ position: "absolute", left: "50%", top: 420, translate: `calc(-50% + ${fx[i]}px) 0`, textAlign: "center", opacity: ri(frame, 8, 20, 0, 1) }}>
            <Folder size={150} color={[C.teal, "#7fe4ff", C.amber][i]} />
            <div style={{ fontFamily: mono, fontSize: 22, color: C.muted, marginTop: 10 }}>{f}</div>
          </div>
        ))}
        {/* file che volano nelle cartelle */}
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
