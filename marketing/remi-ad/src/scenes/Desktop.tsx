import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { usePop } from "../ui";
import { EASE, ri, SectionHead, Cursor, WindowChrome } from "../kit";

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
