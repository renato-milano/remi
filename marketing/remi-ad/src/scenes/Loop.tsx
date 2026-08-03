import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { C, mono } from "../theme";
import { Remi } from "../Remi";
import { useZoomIn } from "../ui";
import { ri, SectionHead } from "../kit";

// ── 8 · AUTONOMIA (battito cognitivo) ────────────────────────
// Il dot teal gira fluido, ogni step si accende (pulse) al passaggio.
// Remi al centro "recita" il ciclo: reattivo, vivo.
const STEPS = ["percepisce", "recupera", "pianifica", "agisce", "riflette", "consolida"];

export const SceneLoop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cx = 350, cy = 350, R = 260;

  // rotazione LENTA e costante (~0,5s per step). Dot e scia stanno nello STESSO
  // gruppo che ruota → sempre sincronizzati (niente sfasamento).
  const spin = Math.max(0, frame - 14) / 90; // giri completi (90 frame = 1 giro)
  const rotDeg = spin * 360;
  // step attivo = quello sotto il dot (in cima al gruppo che ruota)
  const active = Math.round(spin * 6) % 6;

  // geometria della scia: un arco fisso che finisce in cima (dove sta il dot),
  // il tutto avvolto in un gruppo ruotato di rotDeg.
  const P = (deg: number): [number, number] => [
    cx + R * Math.cos((deg * Math.PI) / 180),
    cy + R * Math.sin((deg * Math.PI) / 180),
  ];
  const [tx0, ty0] = P(-90 - 82); // coda della scia
  const [hx, hy] = P(-90); // testa (sotto il dot)
  const trailD = `M ${tx0.toFixed(1)} ${ty0.toFixed(1)} A ${R} ${R} 0 0 1 ${hx.toFixed(1)} ${hy.toFixed(1)}`;

  const reveal = ri(frame, 10, 40, 0, 1);

  // battito globale sincronizzato: pulsa ad ogni passaggio su uno step (6 per giro)
  const beatPhase = ((spin * 6) % 1 + 1) % 1;
  const beat = Math.max(0, 1 - beatPhase / 0.35); // 1 all'attacco, decadimento

  // Remi al centro resta CALMO (idle): respira e oscilla dolcemente, niente
  // scatti d'espressione sul battito (evita l'effetto "iperattivo").
  const breathe = 1 + Math.sin(frame / 12) * 0.015;
  const tilt = Math.sin(frame / 18) * 1.6;

  const CDeg = 2 * Math.PI * R;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead
        num="06 / Autonomia"
        title={<>Un battito<br />cognitivo.</>}
        sub="Percepisce, pianifica, agisce. E ricomincia da solo, senza che tu chieda nulla."
      />

      <div style={{ position: "absolute", left: 1000, top: 170, width: 700, height: 700, scale: `${useZoomIn(8, 0.08)}` }}>
        <svg width={700} height={700} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {/* alone che pulsa a ritmo, sincronizzato col battito */}
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
              cx={hx} cy={hy} r={6 + beat * 4}
              fill={C.teal}
              style={{ filter: `drop-shadow(0 0 ${14 + beat * 14}px ${C.teal})` }}
            />
          </g>
        </svg>

        {STEPS.map((s, i) => {
          const ang = (-90 + i * 60) * (Math.PI / 180);
          const x = cx + R * Math.cos(ang), y = cy + R * Math.sin(ang);
          const on = i === active;
          const pulse = on ? beat : 0; // il pulse dello step segue il battito globale
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

        {/* Remi al centro: respira, si inclina, reagisce ad ogni battito */}
        <div style={{
          position: "absolute", left: cx, top: cy,
          translate: "-50% -50%",
          rotate: `${tilt}deg`,
          scale: `${breathe}`,
        }}>
          <Remi state="idle" size={200} seed={6} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
