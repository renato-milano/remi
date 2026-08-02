import React from "react";
import { AbsoluteFill, Series, Sequence, useCurrentFrame, interpolate } from "remotion";
import { Background, Scene, HolynMark } from "./ui";
import { C, mono } from "./theme";
import { SceneHero } from "./scenes/Hero";
import { SceneStatement } from "./scenes/Statement";
import { SceneDesktop } from "./scenes/Desktop";
import { SceneFolders } from "./scenes/Folders";
import { SceneTasks } from "./scenes/Tasks";
import { SceneGoals } from "./scenes/Goals";
import { SceneMemory } from "./scenes/Memory";
import { SceneLoop } from "./scenes/Loop";
import { SceneApproval } from "./scenes/Approval";
import { SceneLocalFirst } from "./scenes/LocalFirst";
import { SceneCTA } from "./scenes/CTA";

// id = usato anche per registrare una composizione singola per scena
export const SCENES = [
  { id: "Hero", C: SceneHero, d: 78 },
  { id: "Statement", C: SceneStatement, d: 54 },
  { id: "Desktop", C: SceneDesktop, d: 120 },
  { id: "Folders", C: SceneFolders, d: 102 },
  { id: "Tasks", C: SceneTasks, d: 108 },
  { id: "Goals", C: SceneGoals, d: 114 },
  { id: "Memory", C: SceneMemory, d: 84 },
  { id: "Loop", C: SceneLoop, d: 96 },
  { id: "Approval", C: SceneApproval, d: 96 },
  { id: "LocalFirst", C: SceneLocalFirst, d: 60 },
  { id: "CTA", C: SceneCTA, d: 108 },
] as const;

export const AD_DURATION = SCENES.reduce((a, s) => a + s.d, 0);

// firma di brand persistente (Remi · Holyn), dopo l'hero e prima della CTA
const BrandMark: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", top: 50, left: 60, display: "flex", alignItems: "center", gap: 12, opacity: o }}>
      <HolynMark size={26} />
      <div style={{ fontFamily: mono, fontSize: 24, fontWeight: 600, color: C.ink, letterSpacing: "0.02em" }}>Remi</div>
      <div style={{ fontFamily: mono, fontSize: 16, color: C.faint, letterSpacing: "0.14em", textTransform: "uppercase" }}>· Holyn</div>
    </div>
  );
};

export const RemiAd: React.FC = () => {
  const firstD = SCENES[0].d;
  const lastD = SCENES[SCENES.length - 1].d;
  return (
    <AbsoluteFill>
      <Background />
      <Series>
        {SCENES.map((s) => (
          <Series.Sequence key={s.id} durationInFrames={s.d}>
            <Scene durationInFrames={s.d}>
              <s.C />
            </Scene>
          </Series.Sequence>
        ))}
      </Series>
      <Sequence from={firstD - 10} durationInFrames={AD_DURATION - firstD - lastD + 10}>
        <BrandMark />
      </Sequence>
    </AbsoluteFill>
  );
};

// wrapper per anteprima singola scena (con sfondo brand) — usato dalle composizioni per-scena
export const ScenePreview: React.FC<{ index: number }> = ({ index }) => {
  const s = SCENES[index];
  return (
    <AbsoluteFill>
      <Background />
      <Scene durationInFrames={s.d}>
        <s.C />
      </Scene>
    </AbsoluteFill>
  );
};
