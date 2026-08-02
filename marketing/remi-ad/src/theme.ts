// Palette e tipografia estratte 1:1 dal prodotto reale (site/index.html + renderer/styles.css)
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";
import { loadFont as loadSerif } from "@remotion/google-fonts/Fraunces";

export const mono = loadMono("normal", { weights: ["400", "500", "600"] }).fontFamily;
export const serif = loadSerif("normal", { weights: ["300", "400", "500"] }).fontFamily;

export const C = {
  bg: "#0a0c0b",
  bg2: "#0e1210",
  panel: "#121715",
  panel2: "#161c19",
  ink: "#e9ede8",
  muted: "#8b958c",
  faint: "#5c665e",
  line: "rgba(255,255,255,.08)",
  line2: "rgba(255,255,255,.14)",
  alive: "#5ef2a0",
  aliveDim: "#2f7d55",
  aliveGlow: "rgba(94,242,160,.35)",
  amber: "#ffbf5c",
  amberDim: "#7a5a24",
  amberGlow: "rgba(255,191,92,.4)",
  egg: "#f2e7cb",
  cyan: "#7fe4ff",
  danger: "#ff7a6b",
  bubbleBg: "rgba(16,22,19,.97)",
  bubbleInk: "#eef3ee",
} as const;

// colore dei glifi-occhi per tinta emotiva (da styles.css #creatureRoot)
export const EYE_TINT = {
  cyan: "#8fe9ff",
  white: "#ffffff",
  default: "#ffffff",
  amber: "#ffd27a",
  red: "#ff8a7a",
  green: "#5ef2a0",
} as const;

export type Tint = keyof typeof EYE_TINT;
