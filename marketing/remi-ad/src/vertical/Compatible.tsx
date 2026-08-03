import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img, staticFile } from "remotion";
import { C, sans, mono } from "../theme";
import { useRise } from "../ui";
import { useLang } from "../i18n";

// ── 07 · COMPATIBILE CON (VERTICALE) — loghi ufficiali ───────
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

export const SceneCompatibleV: React.FC = () => {
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
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 80px" }}>
      <div style={{ ...k, fontFamily: mono, fontSize: 28, letterSpacing: "0.28em", textTransform: "uppercase", color: C.teal, marginBottom: 16 }}>{T.kicker}</div>
      <div style={{ ...h, fontFamily: sans, fontWeight: 800, fontSize: 76, color: C.ink, letterSpacing: "-0.03em", marginBottom: 46, textAlign: "center", lineHeight: 1.05 }}>
        {L === "it" ? (
          <>I migliori modelli <span style={{ color: C.teal }}>AI</span>.</>
        ) : (
          <>The best <span style={{ color: C.teal }}>AI</span> models.</>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, width: 900 }}>
        {PROVIDERS.map((p, i) => {
          const at = 22 + i * 4;
          const pop = spring({ frame: frame - at, fps, config: { damping: 12, mass: 0.5, stiffness: 160 } });
          const on = interpolate(pop, [0, 1], [0, 1]);
          return (
            <div key={p.n} style={{ display: "flex", alignItems: "center", gap: 20, padding: "20px 24px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: `1px solid ${C.line}`, opacity: on, scale: `${interpolate(pop, [0, 1], [0.85, 1])}` }}>
              <div style={{ width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Img src={staticFile(`logos/${p.f}.svg`)} style={{ width: 58, height: 58, objectFit: "contain" }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, color: C.ink }}>{p.n}</div>
                {p.k ? <div style={{ fontFamily: mono, fontSize: 20, color: C.muted }}>{p.k}</div> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ ...sub, marginTop: 44, fontFamily: sans, fontSize: 32, color: C.muted, textAlign: "center", maxWidth: 860, lineHeight: 1.4 }}>
        {T.sub}
      </div>
    </AbsoluteFill>
  );
};
