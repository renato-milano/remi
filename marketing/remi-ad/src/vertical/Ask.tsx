import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, sans } from "../theme";
import { Remi } from "../Remi";
import type { Expr } from "../Remi";
import { EASE } from "../kit";
import { FakeDesktop } from "../desktopChrome";

// ── 2b · INTERAZIONE (VERTICALE) — Remi vive sul desktop ─────
const cl = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const USER_MSG = "Mi aiuti con le task di oggi?";
const REMI_MSG = "Nessun problema, partiamo!";

export const SceneAskV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // camera: desktop verticale → leggero zoom verso Remi + chat.
  // Focus SEMPRE centrato in orizzontale (cfx=540) così la chat non deriva verso i bordi.
  const camZ = interpolate(frame, [26, 52], [1, 1.15], { ...cl, easing: EASE });
  const cfy = interpolate(frame, [26, 52], [960, 1180], { ...cl, easing: EASE });
  const ctx = 540 - camZ * 540;
  const cty = 960 - camZ * cfy;

  const T0 = 58;
  const uTyped = USER_MSG.slice(0, Math.floor(interpolate(frame, [T0, T0 + 40], [0, USER_MSG.length], cl)));
  const uCaret = frame < T0 + 42 && Math.floor(frame / 6) % 2 === 0;
  const uBubble = spring({ frame: frame - (T0 - 6), fps, config: { damping: 13, mass: 0.6, stiffness: 130 } });
  const thinking = frame >= T0 + 46 && frame < T0 + 64;
  const rShow = frame >= T0 + 64;
  const rBubble = spring({ frame: frame - (T0 + 64), fps, config: { damping: 13, mass: 0.6, stiffness: 130 } });

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
      <AbsoluteFill style={{ transformOrigin: "0 0", scale: `${camZ}`, translate: `${ctx}px ${cty}px` }}>
        <FakeDesktop app="Remi" dockSize={64} />

        {/* conversazione (sopra Remi) — contenitore CENTRATO e stretto, safe dal crop */}
        <div style={{ position: "absolute", left: "50%", translate: "-50% 0", top: 780, width: 760, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ alignSelf: "flex-end", scale: `${uBubble}`, transformOrigin: "right center", background: "rgba(255,255,255,.08)", border: `1px solid ${C.line2}`, borderRadius: "20px 20px 6px 20px", padding: "20px 26px", maxWidth: 720, backdropFilter: "blur(6px)" }}>
            <span style={{ fontFamily: sans, fontWeight: 500, fontSize: 42, color: C.ink }}>
              {uTyped}<span style={{ opacity: uCaret ? 1 : 0, color: C.teal }}>|</span>
            </span>
          </div>

          {thinking && (
            <div style={{ alignSelf: "flex-start", display: "flex", gap: 10, background: "rgba(0,255,200,.08)", border: `1px solid ${C.tealDim}`, borderRadius: 20, padding: "22px 26px" }}>
              {[0, 1, 2].map((i) => <span key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: C.teal, opacity: dot(i) }} />)}
            </div>
          )}

          {rShow && (
            <div style={{ alignSelf: "flex-start", scale: `${rBubble}`, transformOrigin: "left center", background: "rgba(0,255,200,.12)", border: `1px solid ${C.teal}`, borderRadius: "20px 20px 20px 6px", padding: "20px 26px", maxWidth: 720, boxShadow: `0 0 34px ${C.tealGlow}` }}>
              <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 42, color: C.ink }}>{REMI_MSG} <span style={{ fontSize: 36 }}>😉</span></span>
            </div>
          )}
        </div>

        {/* Remi companion in basso a sinistra */}
        <div style={{ position: "absolute", left: 120, bottom: 360 }}>
          <div style={{ position: "absolute", left: 6, bottom: 300, opacity: introCap, background: "rgba(8,12,10,.92)", border: `1px solid ${C.line2}`, color: C.ink, fontFamily: sans, fontSize: 26, padding: "11px 20px", borderRadius: 999, whiteSpace: "nowrap" }}>
            👋 Remi vive qui
          </div>
          <div style={{ rotate: `${tilt}deg`, scale: `${breathe}`, transformOrigin: "50% 100%" }}>
            <Remi state="idle" expr={expr} size={280} seed={2} />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
