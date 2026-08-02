import React from "react";
import { AbsoluteFill, Series, Sequence, useCurrentFrame, interpolate } from "remotion";
import { Background, Heartbeat } from "./ui";
import { Scene } from "./ui";
import { C, mono } from "./theme";
import { SceneHero, SceneNotChatbot, SceneMemory } from "./scenes";
import { SceneHeartbeat, SceneComputerUse, SceneApproval, SceneLocalFirst, SceneCTA } from "./scenes2";

export const SCENES = [
  { C: SceneHero, d: 150 },
  { C: SceneNotChatbot, d: 120 },
  { C: SceneMemory, d: 180 },
  { C: SceneHeartbeat, d: 180 },
  { C: SceneComputerUse, d: 210 },
  { C: SceneApproval, d: 170 },
  { C: SceneLocalFirst, d: 130 },
  { C: SceneCTA, d: 180 },
] as const;

export const AD_DURATION = SCENES.reduce((a, s) => a + s.d, 0); // 1320

// piccola firma di brand, presente dopo l'hero
const BrandMark: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", top: 54, left: 64, display: "flex", alignItems: "center", gap: 14, opacity: o }}>
      <Heartbeat size={12} />
      <div style={{ fontFamily: mono, fontSize: 26, fontWeight: 600, color: C.ink, letterSpacing: "0.02em" }}>OpenMate</div>
    </div>
  );
};

export const RemiAd: React.FC = () => {
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
      {/* firma di brand: appare dalla seconda scena in poi */}
      <Sequence from={SCENES[0].d - 16} durationInFrames={AD_DURATION - SCENES[0].d - SCENES[SCENES.length - 1].d + 16}>
        <BrandMark />
      </Sequence>
    </AbsoluteFill>
  );
};
