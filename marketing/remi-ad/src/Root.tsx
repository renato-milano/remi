import "./index.css";
import { Composition } from "remotion";
import { RemiAd, AD_DURATION } from "./RemiAd";

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
    </>
  );
};
