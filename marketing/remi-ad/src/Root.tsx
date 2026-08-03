import "./index.css";
import { Composition } from "remotion";
import { RemiAd, AD_DURATION, SCENES, ScenePreview } from "./RemiAd";
import { RemiAdVertical, AD_DURATION_V, SCENES_V, ScenePreviewV } from "./RemiAdVertical";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="RemiAd"
        component={RemiAd}
        durationInFrames={AD_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* una composizione per scena: preview/render isolato a frame locali */}
      {SCENES.map((s, i) => (
        <Composition
          key={s.id}
          id={`Scene-${s.id}`}
          component={ScenePreview}
          defaultProps={{ index: i }}
          durationInFrames={s.d}
          fps={30}
          width={1920}
          height={1080}
        />
      ))}

      {/* ── Versione VERTICALE 9:16 (1080x1920) ── */}
      <Composition
        id="RemiAd-V"
        component={RemiAdVertical}
        durationInFrames={AD_DURATION_V}
        fps={30}
        width={1080}
        height={1920}
      />
      {SCENES_V.map((s, i) => (
        <Composition
          key={`v-${s.id}`}
          id={`SceneV-${s.id}`}
          component={ScenePreviewV}
          defaultProps={{ index: i }}
          durationInFrames={s.d}
          fps={30}
          width={1080}
          height={1920}
        />
      ))}

      {/* ── Versioni INGLESI (EN) ── */}
      <Composition
        id="RemiAd-EN"
        component={RemiAd}
        defaultProps={{ lang: "en" as const }}
        durationInFrames={AD_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="RemiAd-V-EN"
        component={RemiAdVertical}
        defaultProps={{ lang: "en" as const }}
        durationInFrames={AD_DURATION_V}
        fps={30}
        width={1080}
        height={1920}
      />
      {/* per-scena EN (per anteprima/verifica degli agenti) */}
      {SCENES.map((s, i) => (
        <Composition
          key={`en-${s.id}`}
          id={`Scene-${s.id}-EN`}
          component={ScenePreview}
          defaultProps={{ index: i, lang: "en" as const }}
          durationInFrames={s.d}
          fps={30}
          width={1920}
          height={1080}
        />
      ))}
      {SCENES_V.map((s, i) => (
        <Composition
          key={`env-${s.id}`}
          id={`SceneV-${s.id}-EN`}
          component={ScenePreviewV}
          defaultProps={{ index: i, lang: "en" as const }}
          durationInFrames={s.d}
          fps={30}
          width={1080}
          height={1920}
        />
      ))}
    </>
  );
};
