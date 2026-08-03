import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";
import { C, mono } from "../theme";
import { Remi } from "../Remi";
import { useZoomIn } from "../ui";
import { ri, SectionHeadV } from "../kit";

// ── 06 · AUTONOMIA — battito cognitivo (VERTICALE 9:16) ───────────
// Anello dei 6 step centrato; dot teal + scia nello STESSO gruppo che
// ruota (sincronizzati), rotazione lenta e costante (~90 frame/giro);
// lo step sotto il dot si accende. Remi al centro CALMO (idle).
const STEPS = ["percepisce", "recupera", "pianifica", "agisce", "riflette", "consolida"];

export const SceneLoopV: React.FC = () => {
  const frame = useCurrentFrame();

  // Box SVG quadrato ~760 con margine per le etichette → 900x900.
  const BOX = 900;
  const cx = BOX / 2, cy = BOX / 2, R = 300;

  // rotazione LENTA e costante: 90 frame = 1 giro completo.
  const spin = Math.max(0, frame - 14) / 90;
  const rotDeg = spin * 360;
  // step attivo = quello sotto il dot (in cima al gruppo che ruota)
  const active = Math.round(spin * 6) % 6;

  // geometria della scia: arco fisso che termina in cima (sotto il dot),
  // avvolto in un gruppo ruotato di rotDeg.
  const P = (deg: number): [number, number] => [
    cx + R * Math.cos((deg * Math.PI) / 180),
    cy + R * Math.sin((deg * Math.PI) / 180),
  ];
  const [tx0, ty0] = P(-90 - 82); // coda della scia
  const [hx, hy] = P(-90); // testa (sotto il dot)
  const trailD = `M ${tx0.toFixed(1)} ${ty0.toFixed(1)} A ${R} ${R} 0 0 1 ${hx.toFixed(1)} ${hy.toFixed(1)}`;

  const reveal = ri(frame, 10, 40, 0, 1);

  // battito globale sincronizzato: pulsa ad ogni passaggio su uno step
  const beatPhase = ((spin * 6) % 1 + 1) % 1;
  const beat = Math.max(0, 1 - beatPhase / 0.35);

  // Remi al centro resta CALMO (idle): respira e oscilla dolcemente,
  // niente scatti d'espressione (evita effetto iperattivo).
  const breathe = 1 + Math.sin(frame / 12) * 0.015;
  const tilt = Math.sin(frame / 18) * 1.6;

  const zoom = useZoomIn(8, 0.08);

  return (
    <AbsoluteFill>
      <SectionHeadV
        num="06 / Autonomia"
        title="Un battito cognitivo."
        sub="Si sveglia da solo e ripete il ciclo."
      />

      {/* Anello centrato sotto il titolo, a tutta larghezza */}
      <div style={{ position: "absolute", left: 1080 / 2 - BOX / 2, top: 620, width: BOX, height: BOX, scale: `${zoom}` }}>
        <svg width={BOX} height={BOX} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {/* alone che pulsa a ritmo */}
          <circle
            cx={cx} cy={cy} r={R}
            fill="none" stroke={C.teal} strokeWidth={1}
            style={{ opacity: reveal * beat * 0.28, filter: `blur(2px) drop-shadow(0 0 ${8 + beat * 26}px ${C.tealGlowStrong})` }}
          />
          {/* anello tratteggiato di base */}
          <circle
            cx={cx} cy={cy} r={R}
            fill="none" stroke={C.line2} strokeWidth={2} strokeDasharray="2 11"
            style={{ opacity: reveal * 0.9 }} strokeLinecap="round"
          />
          {/* scia + dot nello stesso gruppo che ruota: sempre sincronizzati */}
          <g style={{ rotate: `${rotDeg}deg`, transformBox: "view-box", transformOrigin: `${cx}px ${cy}px`, opacity: reveal }}>
            <path
              d={trailD}
              fill="none" stroke={C.teal} strokeWidth={4} strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 ${8 + beat * 10}px ${C.tealGlow})` }}
            />
            <circle
              cx={hx} cy={hy} r={7 + beat * 4}
              fill={C.teal}
              style={{ filter: `drop-shadow(0 0 ${14 + beat * 14}px ${C.teal})` }}
            />
          </g>
        </svg>

        {STEPS.map((s, i) => {
          const ang = (-90 + i * 60) * (Math.PI / 180);
          const x = cx + R * Math.cos(ang), y = cy + R * Math.sin(ang);
          const on = i === active;
          const pulse = on ? beat : 0;
          const at = 16 + i * 5;
          const o = ri(frame, at, at + 12, 0, 1);
          return (
            <div key={s} style={{
              position: "absolute", left: x, top: y,
              translate: "-50% -50%", opacity: o,
              fontFamily: mono, fontSize: 30, padding: "13px 22px", borderRadius: 10, whiteSpace: "nowrap",
              background: on ? `rgba(0,255,200,${0.1 + pulse * 0.14})` : C.panel,
              border: `1px solid ${on ? C.teal : C.line2}`,
              color: on ? C.teal : C.muted,
              boxShadow: on ? `0 0 ${16 + pulse * 24}px ${C.tealGlow}` : "none",
              scale: `${1 + pulse * 0.12}`,
            }}>{s}</div>
          );
        })}

        {/* Remi al centro: respira e oscilla, calmo (idle) */}
        <div style={{
          position: "absolute", left: cx, top: cy,
          translate: "-50% -50%",
          rotate: `${tilt}deg`,
          scale: `${breathe}`,
        }}>
          <Remi state="idle" size={230} seed={6} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
