import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C, mono, sans } from "./theme";
import { Remi } from "./Remi";
import { Chip, HolynMark, Heartbeat, useRise, usePop } from "./ui";
import { EASE, ri, SectionHead, Cursor } from "./kit";

// ── 9 · SICUREZZA (approval gate) ────────────────────────────
export const SceneApproval: React.FC = () => {
  const frame = useCurrentFrame();
  const card = usePop(6);
  const cx = interpolate(frame, [26, 52], [1780, 1660], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const cy = interpolate(frame, [26, 52], [420, 636], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const clickT = interpolate(frame, [53, 58, 66], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const allowed = frame > 61;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num="07 / Sicurezza" title={<>Mai senza<br />il tuo sì.</>} sub="Ogni azione ad alto impatto passa da permessi e audit." />
      <div style={{ position: "absolute", left: 150, bottom: 96 }}>
        <Remi state="waiting_approval" size={220} seed={3} />
      </div>
      <div style={{
        position: "absolute", right: 150, top: "50%", translate: "0 -50%", width: 520, scale: `${card}`,
        background: C.bubbleBg, border: `1px solid ${C.amberGlow}`, borderRadius: 18, padding: 28,
        boxShadow: `0 0 40px ${C.amberGlow}, 0 20px 50px rgba(0,0,0,.6)`,
      }}>
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontFamily: mono, fontSize: 17, padding: "6px 14px", borderRadius: 999, border: `1px solid ${C.amberDim}`, color: C.amber }}>rischio · da approvare</span>
        </div>
        <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 30, color: "#f3f6f2", lineHeight: 1.35, marginBottom: 14 }}>
          Remi vuole <span style={{ color: C.amber }}>eseguire un comando</span> per riordinare i download.
        </div>
        <div style={{ fontFamily: mono, fontSize: 18, color: "#cdd6cd", background: "#0a0d0b", border: `1px solid ${C.line}`, borderRadius: 10, padding: "13px 15px", marginBottom: 18, wordBreak: "break-all" }}>
          <span style={{ color: C.faint }}>$</span> mv ~/Downloads/*.pdf ~/Documenti/pdf/
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <div style={{ fontFamily: mono, fontSize: 19, padding: "12px 22px", borderRadius: 10, border: `1px solid ${C.line2}`, color: C.muted }}>No</div>
          <div style={{
            fontFamily: mono, fontWeight: 600, fontSize: 19, padding: "12px 26px", borderRadius: 10,
            background: allowed ? C.tealDim : C.amber, color: allowed ? "#eafff8" : "#241800",
            boxShadow: `0 0 ${clickT * 24}px ${C.amberGlow}`, scale: `${1 - clickT * 0.05}`,
          }}>{allowed ? "✓ fatto" : "Consenti"}</div>
        </div>
      </div>
      <Cursor x={cx} y={cy} press={clickT} />
    </AbsoluteFill>
  );
};

// ── 10 · LOCAL-FIRST ─────────────────────────────────────────
export const SceneLocalFirst: React.FC = () => {
  const frame = useCurrentFrame();
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

// ── 11 · CTA ─────────────────────────────────────────────────
export const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = usePop(2);
  const expr = frame > 10 && frame < 70 ? "hearts" : undefined;
  const word = useRise(22, 10);
  const by = useRise(34, 10);
  const foot = useRise(50, 10);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ scale: `${pop}`, marginBottom: 10 }}>
        <Remi state="idle" expr={expr as never} size={300} />
      </div>
      <div style={{ ...word, fontFamily: sans, fontWeight: 800, fontSize: 128, color: C.ink, letterSpacing: "-0.05em", lineHeight: 1 }}>
        Remi
      </div>
      <div style={{ ...by, marginTop: 14, display: "flex", alignItems: "center", gap: 14 }}>
        <HolynMark size={34} />
        <span style={{ fontFamily: mono, fontSize: 28, letterSpacing: "0.16em", color: C.muted, textTransform: "uppercase" }}>by Holyn</span>
      </div>
      <div style={{ ...foot, marginTop: 34, display: "flex", alignItems: "center", gap: 18, fontFamily: mono, fontSize: 23, color: C.faint, letterSpacing: "0.05em" }}>
        <Heartbeat size={13} />
        <span>local-first</span><span>·</span><span>open source</span><span>·</span><span style={{ color: C.teal }}>holyn.ai</span>
      </div>
    </AbsoluteFill>
  );
};
