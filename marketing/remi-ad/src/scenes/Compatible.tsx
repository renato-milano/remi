import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img, staticFile } from "remotion";
import { C, sans, mono } from "../theme";
import { useRise } from "../ui";
import { useLang } from "../i18n";

// ── 07 · COMPATIBILE CON — model-agnostic, loghi ufficiali ───
const providers = (ollamaTag: string) => [
  { f: "openai", n: "OpenAI", k: "GPT" },
  { f: "anthropic", n: "Anthropic", k: "Claude" },
  { f: "gemini", n: "Google", k: "Gemini" },
  { f: "meta", n: "Meta", k: "Llama" },
  { f: "mistral", n: "Mistral", k: "" },
  { f: "deepseek", n: "DeepSeek", k: "" },
  { f: "xai", n: "xAI", k: "Grok" },
  { f: "groq", n: "Groq", k: "" },
  { f: "cohere", n: "Cohere", k: "" },
  { f: "ollama", n: "Ollama", k: ollamaTag },
];

export const SceneCompatible: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLang();
  const T = ({
    it: { kicker: "Compatibile con", sub: "e con qualunque endpoint OpenAI compatibile.", ollama: "locale" },
    en: { kicker: "Compatible with", sub: "and any OpenAI compatible endpoint.", ollama: "local" },
  } as const)[L];
  const PROVIDERS = providers(T.ollama);
  const k = useRise(6, 10);
  const h = useRise(12, 10);
  const sub = useRise(82, 10);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ ...k, fontFamily: mono, fontSize: 24, letterSpacing: "0.28em", textTransform: "uppercase", color: C.teal, marginBottom: 14 }}>{T.kicker}</div>
      <div style={{ ...h, fontFamily: sans, fontWeight: 800, fontSize: 76, color: C.ink, letterSpacing: "-0.03em", marginBottom: 46 }}>
        {L === "it" ? (
          <>I migliori modelli <span style={{ color: C.teal }}>AI</span>.</>
        ) : (
          <>The best <span style={{ color: C.teal }}>AI</span> models.</>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 26, width: 1500 }}>
        {PROVIDERS.map((p, i) => {
          const at = 22 + i * 5;
          const pop = spring({ frame: frame - at, fps, config: { damping: 12, mass: 0.5, stiffness: 160 } });
          const on = interpolate(pop, [0, 1], [0, 1]);
          return (
            <div key={p.n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "24px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: `1px solid ${C.line}`, opacity: on, scale: `${interpolate(pop, [0, 1], [0.82, 1])}` }}>
              <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Img src={staticFile(`logos/${p.f}.svg`)} style={{ width: 54, height: 54, objectFit: "contain" }} />
              </div>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 24, color: C.ink }}>{p.n}</div>
              <div style={{ fontFamily: mono, fontSize: 15, color: C.muted, height: 18 }}>{p.k}</div>
            </div>
          );
        })}
      </div>

      <div style={{ ...sub, marginTop: 42, fontFamily: sans, fontSize: 30, color: C.muted }}>
        {T.sub}
      </div>
    </AbsoluteFill>
  );
};
