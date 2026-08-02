import React from "react";
import { AbsoluteFill, Series, Sequence, useCurrentFrame, interpolate } from "remotion";
import { Background, Scene, HolynMark } from "./ui";
import { C, mono } from "./theme";
import { SceneHero, SceneStatement, SceneDesktop, SceneFolders } from "./scenes";
import { SceneTasks, SceneGoals, SceneMemory, SceneLoop } from "./scenes2";
import { SceneApproval, SceneLocalFirst, SceneCTA } from "./scenes3";

export const SCENES = [
  { C: SceneHero, d: 78 },
  { C: SceneStatement, d: 54 },
  { C: SceneDesktop, d: 120 },
  { C: SceneFolders, d: 102 },
  { C: SceneTasks, d: 108 },
  { C: SceneGoals, d: 114 },
  { C: SceneMemory, d: 84 },
  { C: SceneLoop, d: 96 },
  { C: SceneApproval, d: 96 },
  { C: SceneLocalFirst, d: 60 },
  { C: SceneCTA, d: 108 },
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
        {SCENES.map((s, i) => (
          <Series.Sequence key={i} durationInFrames={s.d}>
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
