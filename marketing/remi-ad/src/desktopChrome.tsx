import React from "react";
import { AbsoluteFill } from "remotion";
import { C, sans } from "./theme";
import { HolynMark } from "./ui";
import { Folder } from "./kit";

// Finto DESKTOP macOS (verosimile): wallpaper, menu bar, dock, icone.

export const Wallpaper: React.FC = () => (
  <AbsoluteFill style={{ background: "radial-gradient(130% 100% at 28% 12%, #123a34 0%, #0c1e1b 38%, #060b0a 78%, #040706 100%)" }}>
    <AbsoluteFill style={{ background: "radial-gradient(55% 45% at 78% 88%, rgba(0,255,200,.12), transparent 70%)" }} />
    <AbsoluteFill style={{ background: "radial-gradient(40% 35% at 12% 78%, rgba(120,180,255,.06), transparent 70%)" }} />
    <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "center", opacity: 0.5 }}>
      <HolynMark size={520} color="rgba(0,255,200,.06)" />
    </div>
    {/* vignette */}
    <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,.5) 100%)" }} />
  </AbsoluteFill>
);

export const MenuBar: React.FC<{ app?: string; compact?: boolean }> = ({ app = "Remi", compact }) => (
  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: compact ? 40 : 32, background: "rgba(0,0,0,.4)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", padding: "0 16px", gap: 18, fontFamily: sans, fontSize: compact ? 18 : 14, color: "rgba(255,255,255,.92)" }}>
    <HolynMark size={compact ? 18 : 14} />
    <b style={{ fontWeight: 700 }}>{app}</b>
    {["File", "Modifica", "Vista", "Vai", "Finestra", "Aiuto"].map((m) => (
      <span key={m} style={{ opacity: 0.82 }}>{m}</span>
    ))}
    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, opacity: 0.9 }}>
      <span>🔍</span><span>📶</span><span>🔊</span><span>🔋 84%</span><span>mer 14 ago  9:41</span>
    </div>
  </div>
);

const Ic: React.FC<{ bg: string; e: string; size?: number }> = ({ bg, e, size = 56 }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.24, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.54, boxShadow: "0 8px 16px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.3)" }}>{e}</div>
);
export const Dock: React.FC<{ size?: number }> = ({ size = 56 }) => (
  <div style={{ position: "absolute", bottom: 14, left: "50%", translate: "-50% 0", display: "flex", alignItems: "flex-end", gap: size * 0.22, padding: `${size * 0.16}px ${size * 0.26}px`, borderRadius: size * 0.42, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)", backdropFilter: "blur(22px)", boxShadow: "0 14px 44px rgba(0,0,0,.55)" }}>
    <Ic size={size} bg="linear-gradient(#37c1ff,#0a7bd6)" e="🙂" />
    <Ic size={size} bg="linear-gradient(#4aa8ff,#1e6fd6)" e="🧭" />
    <Ic size={size} bg="linear-gradient(#5be36a,#1fae3a)" e="💬" />
    <Ic size={size} bg="#fff" e="✉️" />
    <Ic size={size} bg="#3F0E40" e="#️⃣" />
    <Ic size={size} bg="#fff" e="📊" />
    <Ic size={size} bg="#0f2b3d" e="🧩" />
    <Ic size={size} bg="#111" e="⌨️" />
    <div style={{ width: 1, height: size * 0.86, background: "rgba(255,255,255,.28)", margin: `0 ${size * 0.06}px` }} />
    <Ic size={size} bg="linear-gradient(135deg,#00ffc8,#0c8f74)" e="🥚" />
    <Ic size={size} bg="linear-gradient(#3a3f45,#23272c)" e="🗑️" />
  </div>
);

export const DesktopIcons: React.FC<{ scale?: number }> = ({ scale = 1 }) => (
  <div style={{ position: "absolute", top: 58, right: 56, display: "flex", flexDirection: "column", gap: 24 * scale, alignItems: "center" }}>
    {([["Progetti", C.teal], ["Cliente #1", "#7fe4ff"], ["Fatture", C.amber]] as const).map(([n, c]) => (
      <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <Folder size={66 * scale} color={c} />
        <span style={{ fontFamily: sans, fontSize: 14 * scale, color: "#fff", background: "rgba(0,0,0,.4)", padding: "1px 8px", borderRadius: 5 }}>{n}</span>
      </div>
    ))}
  </div>
);

// desktop completo
export const FakeDesktop: React.FC<{ app?: string; compact?: boolean; dockSize?: number }> = ({ app, compact, dockSize }) => (
  <>
    <Wallpaper />
    <MenuBar app={app} compact={compact} />
    <DesktopIcons />
    <Dock size={dockSize} />
  </>
);
