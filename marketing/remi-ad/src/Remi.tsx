import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { EYE_TINT, Tint } from "./theme";

// Remi — la creatura reale di OpenMate, portata 1:1 da apps/ui/renderer/character.js
// e styles.css, ma con ogni animazione guidata da useCurrentFrame() (niente CSS anim).

export type RemiState =
  | "idle"
  | "thinking"
  | "acting"
  | "sleeping"
  | "waiting_approval";

export type Expr =
  | "neutral"
  | "blink"
  | "happy"
  | "hearts"
  | "thinking"
  | "scan"
  | "sleepy"
  | "curious"
  | "sad"
  | "surprised"
  | "confused";

const STATE_EXPR: Record<RemiState, Expr> = {
  idle: "neutral",
  thinking: "thinking",
  acting: "scan",
  sleeping: "sleepy",
  waiting_approval: "curious",
};

const MOUTH: Record<string, string> = {
  neutral: "M86 120 Q100 129 114 120",
  thinking: "M94 122 Q100 125 106 122",
  scan: "M88 120 Q100 132 112 120",
  sleepy: "M95 122 Q100 126 105 122",
  curious: "M95 121 Q100 126 105 121",
  happy: "M84 119 Q100 133 116 119",
  hearts: "M82 118 Q100 136 118 118",
  sad: "M86 128 Q100 119 114 128",
  surprised: "M94 122 Q100 132 106 122",
  confused: "M88 124 Q100 120 112 126",
};

const STATE_TINT: Record<RemiState, Tint> = {
  idle: "default",
  thinking: "default",
  acting: "default",
  sleeping: "default",
  waiting_approval: "amber",
};

const EMO_TINT: Partial<Record<Expr, Tint>> = {
  hearts: "green",
  sad: "red",
  happy: "green",
  curious: "amber",
};

export const Remi: React.FC<{
  state?: RemiState;
  expr?: Expr; // override esplicito
  tint?: Tint; // override esplicito
  size?: number;
  blink?: boolean;
  // sfasa i cicli (bob/blink) così più Remi non sono sincroni
  seed?: number;
}> = ({ state = "idle", expr, tint, size = 220, blink = true, seed = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame + seed * 13) / fps; // secondi

  const activeExpr: Expr = expr ?? STATE_EXPR[state];
  const eyeTint: Tint = tint ?? EMO_TINT[activeExpr] ?? STATE_TINT[state];
  const eye = EYE_TINT[eyeTint];

  // --- bob (fluttuare) --- periodo per stato, come nel prodotto
  const bobPeriod = state === "acting" ? 1.6 : state === "sleeping" ? 7 : 3.8;
  const bobPhase = (t / bobPeriod) * Math.PI * 2;
  const bobY = -6 * (0.5 - 0.5 * Math.cos(bobPhase)); // 0 -> -6 -> 0
  const bobRot = -1.2 * Math.sin(bobPhase);
  const shadowScale = interpolate(Math.cos(bobPhase), [-1, 1], [0.9, 1]);
  const shadowOpacity = interpolate(Math.cos(bobPhase), [-1, 1], [0.15, 0.22]);

  // --- blink --- palpebra ogni ~4s per 120ms (guidato dal frame)
  const blinkPeriod = 4.2;
  const blinkLocal = t % blinkPeriod;
  const isBlinking =
    blink && state !== "sleeping" && blinkLocal < 0.12 && activeExpr !== "sleepy";
  const shownExpr: Expr = isBlinking ? "blink" : activeExpr;

  // --- CRT scanline che scorre ---
  const crtY = interpolate((t % 5.5) / 5.5, [0, 1], [43, 155]);
  // flicker
  const flick = 1 - 0.12 * Math.pow(Math.max(0, Math.sin(t * 7)), 8);

  // --- orecchie: alert dritte, sleeping abbassate ---
  const alert = state === "waiting_approval";
  const earY = state === "sleeping" ? 4 : alert ? -3 : 0;
  const earScaleY = state === "sleeping" ? 0.82 : 1;

  // --- alone allerta (approvazione): pulsa ambra ---
  const alertGlow = alert
    ? `drop-shadow(0 0 ${8 + 6 * (0.5 + 0.5 * Math.sin(t * 5))}px rgba(255,191,92,.8))`
    : "none";

  const mouthKey =
    MOUTH[shownExpr] !== undefined ? shownExpr : STATE_EXPR[state];
  const mouthD = MOUTH[mouthKey] ?? MOUTH.neutral;

  const glow = `drop-shadow(0 0 5px ${eye}) drop-shadow(0 0 9px ${eye})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      style={{ overflow: "visible", filter: "drop-shadow(0 14px 22px rgba(0,0,0,.4))" }}
    >
      <defs>
        <linearGradient id="head-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4e9ef" />
          <stop offset="1" stopColor="#a7b2bf" />
        </linearGradient>
        <linearGradient id="ear-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef2f7" />
          <stop offset="1" stopColor="#b0bbc7" />
        </linearGradient>
        <radialGradient id="screen-g" cx="0.5" cy="0.3" r="0.95">
          <stop offset="0" stopColor="#17212f" />
          <stop offset="1" stopColor="#04070c" />
        </radialGradient>
        <linearGradient id="rim-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.03" />
        </linearGradient>
        <clipPath id="screen-clip">
          <rect x="35" y="45" width="130" height="110" rx="28" />
        </clipPath>
        <pattern id="scanlines" width="3" height="3" patternUnits="userSpaceOnUse">
          <rect y="0" width="3" height="1.3" fill="#000" opacity="0.28" />
        </pattern>
        <radialGradient id="crt-vignette" cx="0.5" cy="0.45" r="0.72">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.5" />
        </radialGradient>
      </defs>

      <ellipse
        cx="100"
        cy="178"
        rx="62"
        ry="8"
        fill="#000"
        style={{ opacity: shadowOpacity, scale: `${shadowScale} 1`, transformOrigin: "100px 178px" }}
      />

      <g style={{ translate: `0 ${bobY}px`, rotate: `${bobRot}deg`, transformOrigin: "100px 150px", filter: alertGlow }}>
        {/* orecchie */}
        <rect
          x="18" y="92" width="12" height="34" rx="6" fill="url(#ear-g)"
          style={{ translate: `0 ${earY}px`, scale: `1 ${earScaleY}`, transformOrigin: "24px 126px" }}
        />
        <rect
          x="170" y="92" width="12" height="34" rx="6" fill="url(#ear-g)"
          style={{ translate: `0 ${earY}px`, scale: `1 ${earScaleY}`, transformOrigin: "176px 126px" }}
        />
        {/* testa */}
        <rect x="28" y="38" width="144" height="124" rx="34" fill="url(#head-g)" />
        <rect x="28.8" y="38.8" width="142.4" height="122.4" rx="33.4" fill="none" stroke="url(#rim-g)" strokeWidth="1.6" />
        {/* schermo */}
        <rect x="35" y="45" width="130" height="110" rx="28" fill="url(#screen-g)" />
        <rect x="35" y="45" width="130" height="110" rx="28" fill="none" stroke="#000" strokeWidth="2.5" />
        <rect x="33.4" y="43.4" width="133.2" height="113.2" rx="29.4" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="1" />
        <path d="M43 52 L84 52 L56 92 L43 92 Z" fill="#ffffff" opacity="0.05" />

        {/* occhi + bocca */}
        <g style={{ filter: glow }}>
          <Glyphs expr={shownExpr} eye={eye} t={t} />
          <path
            d={mouthD}
            fill="none"
            stroke={eye}
            strokeWidth="6"
            strokeLinecap="round"
          />
        </g>

        {/* overlay CRT */}
        <g clipPath="url(#screen-clip)" style={{ opacity: flick }}>
          <rect x="35" y="45" width="130" height="110" fill="url(#scanlines)" />
          <rect x="35" y="45" width="130" height="110" fill="url(#crt-vignette)" />
          <rect x="35" y={crtY} width="130" height="16" fill={eye} opacity="0.05" />
        </g>
      </g>
    </svg>
  );
};

// cuoricino centrato in (cx,cy) con "raggio" s
const heartPath = (cx: number, cy: number, s: number) =>
  `M ${cx} ${cy + 0.95 * s}` +
  ` C ${cx - 0.45 * s} ${cy + 0.45 * s}, ${cx - 1.25 * s} ${cy + 0.25 * s}, ${cx - 1.25 * s} ${cy - 0.35 * s}` +
  ` C ${cx - 1.25 * s} ${cy - 0.95 * s}, ${cx - 0.55 * s} ${cy - 1.1 * s}, ${cx} ${cy - 0.45 * s}` +
  ` C ${cx + 0.55 * s} ${cy - 1.1 * s}, ${cx + 1.25 * s} ${cy - 0.95 * s}, ${cx + 1.25 * s} ${cy - 0.35 * s}` +
  ` C ${cx + 1.25 * s} ${cy + 0.25 * s}, ${cx + 0.45 * s} ${cy + 0.45 * s}, ${cx} ${cy + 0.95 * s} Z`;

// Glifi occhio per espressione (porting fedele dei gruppi .expr)
const Glyphs: React.FC<{ expr: Expr; eye: string; t: number }> = ({ expr, eye, t }) => {
  const g = { fill: eye };
  const arc = { fill: "none", stroke: eye, strokeWidth: 7, strokeLinecap: "round" as const };
  const q = { fill: eye, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700 };

  switch (expr) {
    case "blink":
      return (
        <>
          <rect x="68" y="86" width="20" height="7" rx="3.5" style={g} />
          <rect x="112" y="86" width="20" height="7" rx="3.5" style={g} />
        </>
      );
    case "happy":
      return (
        <>
          <path d="M67 96 Q78 78 89 96" style={arc} />
          <path d="M111 96 Q122 78 133 96" style={arc} />
        </>
      );
    case "thinking": {
      const dot = (i: number) => 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 5 - i * 1.1));
      return (
        <>
          <rect x="70" y="78" width="16" height="18" rx="8" style={g} />
          <rect x="114" y="78" width="16" height="18" rx="8" style={g} />
          <g transform="translate(126,60)">
            <circle cx="0" cy="0" r="3.2" style={{ ...g, opacity: dot(0) }} />
            <circle cx="9" cy="0" r="3.2" style={{ ...g, opacity: dot(1) }} />
            <circle cx="18" cy="0" r="3.2" style={{ ...g, opacity: dot(2) }} />
          </g>
        </>
      );
    }
    case "hearts": {
      // battito dei cuori: doppio thump come un cuore vero
      const beat = t % 0.85;
      const pulse = 1 + 0.18 * (Math.max(0, Math.sin(beat * 12)) + 0.6 * Math.max(0, Math.sin((beat - 0.18) * 12)));
      return (
        <g style={{ scale: `${pulse}`, transformOrigin: "100px 90px", transformBox: "view-box" as never }}>
          <path d={heartPath(78, 90, 11)} style={g} />
          <path d={heartPath(122, 90, 11)} style={g} />
        </g>
      );
    }
    case "scan": {
      // occhi decisi + linea che scandaglia lo schermo (sta "leggendo" il PC)
      const sy = 58 + ((t * 130) % 96);
      return (
        <>
          <rect x="70" y="82" width="16" height="18" rx="8" style={g} />
          <rect x="114" y="82" width="16" height="18" rx="8" style={g} />
          <rect x="42" y={sy} width="116" height="2.4" rx="1.2" style={{ fill: eye, opacity: 0.55 }} />
        </>
      );
    }
    case "sleepy": {
      const zy = (t % 3) / 3;
      return (
        <>
          <path d="M67 90 Q78 103 89 90" style={arc} />
          <path d="M111 90 Q122 103 133 90" style={arc} />
          <text
            x="132" y="70" style={{ ...q, fontSize: 22, opacity: interpolate(zy, [0, 0.3, 1], [0, 1, 0]), translate: `${zy * 9}px ${-zy * 14}px` }}
          >
            z
          </text>
        </>
      );
    }
    case "curious":
      return (
        <>
          <rect x="70" y="74" width="16" height="30" rx="8" style={g} />
          <rect x="114" y="76" width="16" height="24" rx="8" style={g} />
          <text x="130" y="74" style={{ ...q, fontSize: 28, translate: `0 ${-3 * Math.sin(t * 3.5)}px` }}>?</text>
        </>
      );
    case "sad":
      return (
        <>
          <path d="M67 84 Q78 96 89 84" style={arc} />
          <path d="M111 84 Q122 96 133 84" style={arc} />
        </>
      );
    case "surprised":
      return (
        <>
          <circle cx="78" cy="88" r="12" style={g} />
          <circle cx="122" cy="88" r="12" style={g} />
        </>
      );
    case "confused":
      return (
        <>
          <rect x="70" y="72" width="16" height="30" rx="8" style={g} />
          <rect x="115" y="84" width="14" height="8" rx="4" style={g} />
          <text x="132" y="74" style={{ ...q, fontSize: 26 }}>?</text>
        </>
      );
    case "neutral":
    default:
      return (
        <>
          <rect x="70" y="74" width="16" height="32" rx="8" style={g} />
          <rect x="114" y="74" width="16" height="32" rx="8" style={g} />
        </>
      );
  }
};
