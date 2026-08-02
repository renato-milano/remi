import "./index.css";
import { Composition } from "remotion";
import { RemiAd, AD_DURATION, SCENES, ScenePreview } from "./RemiAd";

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
          id={`Scene_${s.id}`}
          component={ScenePreview}
          defaultProps={{ index: i }}
          durationInFrames={s.d}
          fps={30}
          width={1920}
          height={1080}
        />
      ))}
    </>
  );
};
