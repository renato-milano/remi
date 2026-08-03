import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, mono } from "../theme";
import { Remi } from "../Remi";
import { useRise, useMockup3D } from "../ui";
import { ri, SectionHeadV } from "../kit";
import { useLang } from "../i18n";
import {
  AppGmail, AppSlack, AppExcel, AppVSCode,
  Window, STARTS, STAGE, WIN_W, WIN_H, actionText,
} from "../scenes/Desktop";

// ── 01 · COMPUTER-USE (verticale 9:16) ───────────────────────
// Impilato: titolo in alto, finestra (mockup 3D) al centro a tutta
// larghezza, pallini + didascalia sotto, Remi calmo in basso-centro
// con il badge "controllo schermo attivo" attaccato a lui.

const WIN_LEFT = (1080 - WIN_W) / 2; // 30
const WIN_TOP = 384;
const WIN_BOTTOM = WIN_TOP + WIN_H; // 954

export const SceneDesktopV: React.FC = () => {
  const L = useLang();
  const T = ({
    it: { title: "Vede il tuo schermo, agisce.", badge: "🖥️ controllo schermo attivo" },
    en: { title: "Sees your screen, takes action.", badge: "🖥️ screen control active" },
  } as const)[L];
  const ACTION_TEXT = actionText(L);
  const frame = useCurrentFrame();

  const pill = ri(frame, 14, 26, 0, 1);
  const pillPulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(frame * 0.3));

  // stage corrente (per la didascalia)
  const stageIdx = Math.max(0, STARTS.filter((s) => frame >= s - 4).length - 1);
  const sf = frame - STARTS[stageIdx];
  const capO =
    ri(sf, 12, 22, 0, 1) *
    (stageIdx === STARTS.length - 1 ? 1 : ri(sf, STAGE - 4, STAGE + 6, 1, 0));

  // Remi resta CALMO: idle, respiro + oscillazione dolce
  const breathe = 1 + Math.sin(frame / 12) * 0.015;
  const tilt = Math.sin(frame / 18) * 1.5;
  const remiEnter = ri(frame, 4, 20, 0.86, 1);

  const winRise = useRise(6, 12);
  const win3D = useMockup3D(6, 0.06, -6);

  return (
    <AbsoluteFill>
      <SectionHeadV num="01 / Computer use" title={<>{T.title}</>} />

      {/* pannello montaggio app (mockup 3D) — centrato orizzontalmente */}
      <div
        style={{
          position: "absolute",
          left: WIN_LEFT,
          top: WIN_TOP,
          width: WIN_W,
          height: WIN_H,
          opacity: winRise.opacity,
          transform: win3D,
          transformOrigin: "50% 0",
        }}
      >
        <Window start={STARTS[0]}>{(f) => <AppGmail f={f} />}</Window>
        <Window start={STARTS[1]}>{(f) => <AppSlack f={f} />}</Window>
        <Window start={STARTS[2]}>{(f) => <AppExcel f={f} />}</Window>
        <Window start={STARTS[3]}>{(f) => <AppVSCode f={f} />}</Window>
      </div>

      {/* pallini di avanzamento — sotto la finestra, centrati */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: WIN_BOTTOM + 44,
          translate: "-50% 0",
          display: "flex",
          gap: 14,
          opacity: pill,
        }}
      >
        {STARTS.map((s, i) => {
          const active =
            frame >= s - 4 && (i === STARTS.length - 1 || frame < STARTS[i + 1] - 4);
          return (
            <div
              key={i}
              style={{
                width: active ? 30 : 11,
                height: 11,
                borderRadius: 999,
                background: active ? C.teal : C.line2,
                boxShadow: active ? `0 0 12px ${C.tealGlow}` : "none",
              }}
            />
          );
        })}
      </div>

      {/* didascalia "Remi: <azione>" — sotto i pallini, centrata */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: WIN_BOTTOM + 90,
          translate: `-50% ${(1 - capO) * 12}px`,
          opacity: capO,
          background: "rgba(0,255,200,.12)",
          border: `1px solid ${C.teal}`,
          color: C.teal,
          fontFamily: mono,
          fontSize: 26,
          padding: "14px 30px",
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          gap: 14,
          whiteSpace: "nowrap",
          boxShadow: `0 8px 30px rgba(0,0,0,.5)`,
        }}
      >
        <span
          style={{
            width: 11,
            height: 11,
            borderRadius: "50%",
            background: C.teal,
            boxShadow: `0 0 12px ${C.tealGlow}`,
          }}
        />
        Remi: {ACTION_TEXT[stageIdx]}
      </div>

      {/* Remi in basso-centro, calmo, con il badge attaccato a lui */}
      <div style={{ position: "absolute", left: "50%", bottom: 130, translate: "-50% 0" }}>
        {/* badge su Remi */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 246,
            translate: "-50% 0",
            opacity: pill,
            background: "rgba(0,255,200,.14)",
            border: `1px solid ${C.teal}`,
            color: C.teal,
            fontFamily: mono,
            fontSize: 22,
            padding: "10px 20px",
            borderRadius: 999,
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: `0 0 ${pillPulse * 22}px ${C.tealGlow}`,
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: C.teal,
              opacity: pillPulse,
              boxShadow: `0 0 10px ${C.teal}`,
            }}
          />
          {T.badge}
        </div>
        {/* tail dal badge verso Remi */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 230,
            translate: "-50% 0",
            width: 2,
            height: 20,
            background: `linear-gradient(${C.teal}, transparent)`,
            opacity: pill,
          }}
        />
        <div style={{ rotate: `${tilt}deg`, scale: `${breathe * remiEnter}` }}>
          <Remi state="idle" size={230} seed={5} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
