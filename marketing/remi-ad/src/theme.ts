// Brand identity Holyn (da holyn-web): nero, bianco, accento teal #00FFC8, font Geist.
import { loadFont as loadSans } from "@remotion/google-fonts/Geist";
import { loadFont as loadMonoFont } from "@remotion/google-fonts/GeistMono";

export const sans = loadSans("normal", { weights: ["400", "500", "600", "700", "800"] }).fontFamily;
export const mono = loadMonoFont("normal", { weights: ["400", "500", "600"] }).fontFamily;

export const C = {
  bg: "#000000",
  bg2: "#0a0a0a",
  panel: "#0d0f0e",
  panel2: "#141614",
  ink: "#ffffff",
  muted: "#a3a3a3",
  faint: "#5f6663",
  line: "rgba(255,255,255,.10)",
  line2: "rgba(255,255,255,.18)",
  // accento Holyn
  teal: "#00ffc8",
  tealDim: "#0c8f74",
  tealGlow: "rgba(0,255,200,.35)",
  tealGlowStrong: "rgba(0,255,200,.55)",
  // semantici
  amber: "#ffbf5c",
  amberDim: "#7a5a24",
  amberGlow: "rgba(255,191,92,.4)",
  danger: "#ff6b6b",
  bubbleBg: "rgba(8,10,9,.97)",
  bubbleInk: "#f2f5f3",
} as const;

// colore dei glifi-occhi di Remi per tinta emotiva
export const EYE_TINT = {
  cyan: "#8fe9ff",
  white: "#ffffff",
  default: "#ffffff",
  amber: "#ffd27a",
  red: "#ff8a7a",
  green: "#00ffc8", // hearts nel teal Holyn
} as const;

export type Tint = keyof typeof EYE_TINT;
