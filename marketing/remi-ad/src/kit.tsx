import React from "react";
import { interpolate, Easing } from "remotion";
import { C, mono, sans } from "./theme";
import { Kicker, useRise } from "./ui";

export const EASE = Easing.bezier(0.16, 1, 0.3, 1);
export const ri = (frame: number, a: number, b: number, from: number, to: number) =>
  interpolate(frame, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });

// intestazione di sezione compatta (in alto a sinistra)
export const SectionHead: React.FC<{ num: string; title: React.ReactNode; sub?: string }> = ({ num, title, sub }) => {
  const k = useRise(2, 8), t = useRise(8, 10), s = useRise(16, 10);
  return (
    <div style={{ position: "absolute", top: 96, left: 110 }}>
      <div style={k}><Kicker>{num}</Kicker></div>
      <div style={{ ...t, fontFamily: sans, fontWeight: 700, fontSize: 76, color: C.ink, letterSpacing: "-0.03em", marginTop: 12, lineHeight: 1.0 }}>{title}</div>
      {sub && <div style={{ ...s, fontFamily: sans, fontWeight: 400, fontSize: 28, color: C.muted, marginTop: 16, maxWidth: 640, letterSpacing: "-0.01em" }}>{sub}</div>}
    </div>
  );
};

// cursore freccia macOS
export const Cursor: React.FC<{ x: number; y: number; press?: number }> = ({ x, y, press = 0 }) => (
  <svg width={30} height={34} viewBox="0 0 30 34" style={{ position: "absolute", left: x, top: y, filter: "drop-shadow(0 3px 5px rgba(0,0,0,.6))", scale: `${1 - press * 0.14}` }}>
    <path d="M3 2 L3 26 L10 20 L14 30 L19 28 L15 18 L24 18 Z" fill="#fff" stroke="#0a0a0a" strokeWidth={1.4} strokeLinejoin="round" />
  </svg>
);

// barra del titolo di una finestra (mac)
export const WindowChrome: React.FC<{ title: string }> = ({ title }) => (
  <div style={{ height: 44, background: "#131513", display: "flex", alignItems: "center", padding: "0 16px", gap: 9, borderBottom: `1px solid ${C.line}` }}>
    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
    <div style={{ marginLeft: 14, fontFamily: mono, fontSize: 17, color: C.faint }}>{title}</div>
  </div>
);

// barra di avanzamento
export const Bar: React.FC<{ pct: number; color?: string }> = ({ pct, color = C.teal }) => (
  <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
    <div style={{ height: "100%", width: `${pct * 100}%`, background: color, borderRadius: 999, boxShadow: `0 0 12px ${C.tealGlow}` }} />
  </div>
);

// checkbox che si spunta
export const Check: React.FC<{ on: number; size?: number }> = ({ on, size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 30 30">
    <rect x="2" y="2" width="26" height="26" rx="8" fill={on > 0.1 ? C.teal : "none"} stroke={on > 0.1 ? C.teal : C.line2} strokeWidth="2" />
    <path d="M8 15 L13 20 L22 10" fill="none" stroke="#04120a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      strokeDasharray="22" strokeDashoffset={22 * (1 - on)} />
  </svg>
);

// icona cartella
export const Folder: React.FC<{ size?: number; color?: string; open?: boolean }> = ({ size = 74, color = C.teal }) => (
  <svg width={size} height={size * 0.8} viewBox="0 0 74 60" style={{ overflow: "visible" }}>
    <path d="M4 14 a6 6 0 0 1 6 -6 h16 l7 7 h31 a6 6 0 0 1 6 6 v27 a6 6 0 0 1 -6 6 H10 a6 6 0 0 1 -6 -6 Z"
      fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />
    <path d="M4 22 h66" stroke={color} strokeWidth="2" opacity="0.5" />
  </svg>
);
