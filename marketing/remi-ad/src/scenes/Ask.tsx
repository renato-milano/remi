import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, sans } from "../theme";
import { Remi } from "../Remi";
import type { Expr } from "../Remi";
import { EASE } from "../kit";
import { FakeDesktop } from "../desktopChrome";
import { GlassPill } from "../ui";
import { useLang } from "../i18n";

// ── 2b · INTERAZIONE — Remi vive sul desktop ─────────────────
// Finto desktop + Remi in basso a sinistra → ZOOM su Remi → chat:
// l'utente scrive "Mi aiuti con le task di oggi?", Remi risponde
// "Nessun problema, partiamo!" con l'occhiolino → parte il Computer use.
const cl = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const SceneAsk: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLang();
  const T = ({
    it: { userMsg: "Mi aiuti con le task di oggi?", remiMsg: "Nessun problema, partiamo!", intro: "👋 Remi vive sul tuo desktop" },
    en: { userMsg: "Can you help with today's tasks?", remiMsg: "No problem, let's go!", intro: "👋 Remi lives on your desktop" },
  } as const)[L];
  const USER_MSG = T.userMsg;
  const REMI_MSG = T.remiMsg;

  // camera: desktop largo → ZOOM su Remi (+ area chat)
  const camZ = interpolate(frame, [26, 52], [1, 1.45], { ...cl, easing: EASE });
  const cfx = interpolate(frame, [26, 52], [960, 660], { ...cl, easing: EASE });
  const cfy = interpolate(frame, [26, 52], [540, 720], { ...cl, easing: EASE });
  const ctx = 960 - camZ * cfx;
  const cty = 540 - camZ * cfy;

  // chat (dopo lo zoom)
  const T0 = 58;
  const uTyped = USER_MSG.slice(0, Math.floor(interpolate(frame, [T0, T0 + 40], [0, USER_MSG.length], cl)));
  const uCaret = frame < T0 + 42 && Math.floor(frame / 6) % 2 === 0;
  const uBubble = spring({ frame: frame - (T0 - 6), fps, config: { damping: 13, mass: 0.6, stiffness: 130 } });
  const thinking = frame >= T0 + 46 && frame < T0 + 64;
  const rShow = frame >= T0 + 64;
  const rBubble = spring({ frame: frame - (T0 + 64), fps, config: { damping: 13, mass: 0.6, stiffness: 130 } });

  // espressioni Remi (calme, coerenti)
  let expr: Expr = "neutral";
  if (frame >= 28 && frame < 44) expr = "happy";
  else if (frame >= 44 && frame < T0) expr = "curious";
  else if (frame >= T0 + 44 && frame < T0 + 62) expr = "thinking";
  else if (frame >= T0 + 62 && frame < T0 + 80) expr = "wink";
  else if (frame >= T0 + 80) expr = "excited";

  const introCap = interpolate(frame, [6, 16, 26, 34], [0, 1, 1, 0], cl);
  const dot = (i: number) => 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((frame - (T0 + 46)) * 0.45 - i * 1.1));
  const breathe = 1 + Math.sin(frame / 12) * 0.015;
  const tilt = Math.sin(frame / 18) * 1.4;

  return (
    <AbsoluteFill>
      {/* il DESKTOP (mondo con la camera) */}
      <AbsoluteFill style={{ transformOrigin: "0 0", scale: `${camZ}`, translate: `${ctx}px ${cty}px` }}>
        <FakeDesktop app="Remi" />

        {/* Remi companion in basso a sinistra */}
        <div style={{ position: "absolute", left: 150, bottom: 118 }}>
          <GlassPill accent={C.teal} size={20} style={{ position: "absolute", left: 6, bottom: 250, opacity: introCap, color: C.ink, fontFamily: sans }}>{T.intro}</GlassPill>
          <div style={{ rotate: `${tilt}deg`, scale: `${breathe}`, transformOrigin: "50% 100%" }}>
            <Remi state="idle" expr={expr} size={230} seed={2} />
          </div>
        </div>

        {/* conversazione (a destra di Remi) */}
        <div style={{ position: "absolute", left: 470, top: 556, width: 700, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ alignSelf: "flex-end", scale: `${uBubble}`, transformOrigin: "right center", background: "rgba(255,255,255,.08)", border: `1px solid ${C.line2}`, borderRadius: "18px 18px 5px 18px", padding: "16px 22px", maxWidth: 640, backdropFilter: "blur(6px)" }}>
            <span style={{ fontFamily: sans, fontWeight: 500, fontSize: 30, color: C.ink }}>
              {uTyped}<span style={{ opacity: uCaret ? 1 : 0, color: C.teal }}>|</span>
            </span>
          </div>

          {thinking && (
            <div style={{ alignSelf: "flex-start", display: "flex", gap: 8, background: "rgba(0,255,200,.08)", border: `1px solid ${C.tealDim}`, borderRadius: 18, padding: "16px 20px" }}>
              {[0, 1, 2].map((i) => <span key={i} style={{ width: 11, height: 11, borderRadius: "50%", background: C.teal, opacity: dot(i) }} />)}
            </div>
          )}

          {rShow && (
            <div style={{ alignSelf: "flex-start", scale: `${rBubble}`, transformOrigin: "left center", background: "rgba(0,255,200,.12)", border: `1px solid ${C.teal}`, borderRadius: "18px 18px 18px 5px", padding: "16px 22px", maxWidth: 660, boxShadow: `0 0 30px ${C.tealGlow}` }}>
              <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 30, color: C.ink }}>{REMI_MSG} <span style={{ fontSize: 26 }}>😉</span></span>
            </div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
