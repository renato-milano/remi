import React from "react";
import { AbsoluteFill, Series, Sequence, useCurrentFrame, interpolate } from "remotion";
import { Background, Scene, HolynMark } from "./ui";
import { C, mono } from "./theme";
import { LangContext, Lang } from "./i18n";
import { SceneHeroV } from "./vertical/Hero";
import { SceneStatementV } from "./vertical/Statement";
import { SceneAskV } from "./vertical/Ask";
import { SceneDesktopV } from "./vertical/Desktop";
import { SceneFoldersV } from "./vertical/Folders";
import { SceneTasksV } from "./vertical/Tasks";
import { SceneGoalsV } from "./vertical/Goals";
import { SceneMemoryV } from "./vertical/Memory";
import { SceneLoopV } from "./vertical/Loop";
import { SceneCompatibleV } from "./vertical/Compatible";
import { SceneCTAV } from "./vertical/CTA";

// stesse durate della versione landscape (per coerenza / sync audio futuro)
export const SCENES_V = [
  { id: "Hero", C: SceneHeroV, d: 90 },
  { id: "Statement", C: SceneStatementV, d: 84 },
  { id: "Ask", C: SceneAskV, d: 186 },
  { id: "Desktop", C: SceneDesktopV, d: 240 },
  { id: "Folders", C: SceneFoldersV, d: 114 },
  { id: "Tasks", C: SceneTasksV, d: 126 },
  { id: "Goals", C: SceneGoalsV, d: 126 },
  { id: "Memory", C: SceneMemoryV, d: 132 },
  { id: "Loop", C: SceneLoopV, d: 120 },
  { id: "Compatible", C: SceneCompatibleV, d: 126 },
  { id: "CTA", C: SceneCTAV, d: 120 },
] as const;

export const AD_DURATION_V = SCENES_V.reduce((a, s) => a + s.d, 0);

const BrandMarkV: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", top: 64, left: 80, display: "flex", alignItems: "center", gap: 12, opacity: o }}>
      <HolynMark size={26} />
      <div style={{ fontFamily: mono, fontSize: 24, fontWeight: 600, color: C.ink, letterSpacing: "0.02em" }}>Remi</div>
      <div style={{ fontFamily: mono, fontSize: 16, color: C.faint, letterSpacing: "0.14em", textTransform: "uppercase" }}>· Holyn</div>
    </div>
  );
};

export const RemiAdVertical: React.FC<{ lang?: Lang }> = ({ lang = "it" }) => {
  const firstD = SCENES_V[0].d;
  const lastD = SCENES_V[SCENES_V.length - 1].d;
  return (
    <LangContext.Provider value={lang}>
      <AbsoluteFill>
        <Background />
        {/* padding di sicurezza: i social croppano/zoomano ~8-10% → tengo il contenuto
            rientrato (lo sfondo/griglia riempie comunque i bordi). */}
        <AbsoluteFill style={{ scale: "0.9" }}>
          <Series>
            {SCENES_V.map((s) => (
              <Series.Sequence key={s.id} durationInFrames={s.d}>
                <Scene durationInFrames={s.d}>
                  <s.C />
                </Scene>
              </Series.Sequence>
            ))}
          </Series>
          <Sequence from={firstD - 10} durationInFrames={AD_DURATION_V - firstD - lastD + 10}>
            <BrandMarkV />
          </Sequence>
        </AbsoluteFill>
      </AbsoluteFill>
    </LangContext.Provider>
  );
};

// wrapper per anteprima singola scena verticale
export const ScenePreviewV: React.FC<{ index: number; lang?: Lang }> = ({ index, lang = "it" }) => {
  const s = SCENES_V[index];
  return (
    <LangContext.Provider value={lang}>
      <AbsoluteFill>
        <Background />
        <Scene durationInFrames={s.d}>
          <s.C />
        </Scene>
      </AbsoluteFill>
    </LangContext.Provider>
  );
};
