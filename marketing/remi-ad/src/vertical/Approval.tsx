import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import type { Expr } from "../Remi";
import { usePop, useMockup3D } from "../ui";
import { EASE, SectionHeadV, Cursor } from "../kit";

// ── 07 · SICUREZZA (approval gate) — VERTICALE ───────────────────
// Impilata: titolo in alto, card ambra "Consenti/No" al centro, Remi
// (waiting_approval, grande) sotto. Il cursore raggiunge "Consenti",
// clicca → la card diventa teal "✓ fatto" e Remi fa un cenno felice
// (grin) con un fumetto "grazie! ✓". Rassicurante, sei sempre tu al comando.
export const SceneApprovalV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const CLICK = 60; // frame del click su "Consenti"
  const allowed = frame >= CLICK + 1;

  // Geometria card (centrata) + pulsante "Consenti"
  const cardW = 720;
  const cardLeft = (1080 - cardW) / 2; // 180
  const cardTop = 640;
  // "Consenti" si trova in basso a destra nella card
  const btnX = cardLeft + cardW - 150; // ~750
  const btnY = cardTop + 372; // dentro la card, riga bottoni

  // cursore: arriva da fuori campo in basso fino a "Consenti"
  const cx = interpolate(frame, [18, CLICK - 2], [980, btnX], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const cy = interpolate(frame, [18, CLICK - 2], [1780, btnY], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const clickT = interpolate(frame, [CLICK, CLICK + 4, CLICK + 12], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // pulsante "Consenti": pulsa gentile prima del click (invitante, non allarmante)
  const invite = allowed ? 0 : 0.5 + 0.5 * Math.sin((frame - 8) * 0.16);

  // onda verde di conferma dopo il click
  const confirm = spring({ frame: frame - CLICK, fps, config: { damping: 16, mass: 0.7, stiffness: 120 } });

  // Remi: da "in attesa" a felice (grin) al momento del sì
  const reactExpr: Expr | undefined = allowed ? (frame < CLICK + 24 ? "grin" : "happy") : undefined;

  // cenno felice: bob + rimbalzo di scala all'ok
  const nod = spring({ frame: frame - CLICK, fps, config: { damping: 8, mass: 0.5, stiffness: 150 } });
  const remiNodY = allowed ? interpolate(nod, [0, 1], [0, -20]) * Math.cos((frame - CLICK) * 0.5) : 0;
  const remiBounce = allowed ? 1 + interpolate(nod, [0, 1], [0.12, 0]) : 1;
  const remiTilt = allowed ? 0 : 2.5 * Math.sin(frame * 0.06);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHeadV
        num="07 / Sicurezza"
        title="Mai senza il tuo sì."
        sub="Ogni azione importante aspetta il tuo ok."
      />

      {/* Card di approvazione (ambra → teal), centrata */}
      <div
        style={{
          position: "absolute",
          left: cardLeft,
          top: cardTop,
          width: cardW,
          transform: useMockup3D(6, 0.08, -6),
          background: C.bubbleBg,
          border: `1px solid ${allowed ? C.tealGlow : C.amberGlow}`,
          borderRadius: 26,
          padding: 40,
          boxShadow: allowed
            ? `0 0 54px ${C.tealGlow}, 0 24px 60px rgba(0,0,0,.6)`
            : `0 0 50px ${C.amberGlow}, 0 24px 60px rgba(0,0,0,.6)`,
        }}
      >
        {/* chip stato */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 26 }}>
          <span
            style={{
              fontFamily: mono,
              fontSize: 24,
              padding: "9px 20px",
              borderRadius: 999,
              border: `1px solid ${allowed ? C.tealDim : C.amberDim}`,
              color: allowed ? C.teal : C.amber,
            }}
          >
            {allowed ? "approvato · da te" : "chiede il permesso"}
          </span>
        </div>

        <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 44, color: "#f3f6f2", lineHeight: 1.32, marginBottom: 26 }}>
          Remi vuole <span style={{ color: allowed ? C.teal : C.amber }}>riordinare i download</span> per te.
        </div>

        <div
          style={{
            fontFamily: mono,
            fontSize: 26,
            color: "#cdd6cd",
            background: "#0a0d0b",
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            padding: "18px 20px",
            marginBottom: 32,
            wordBreak: "break-all",
          }}
        >
          <span style={{ color: C.faint }}>$</span> sposta i PDF in ~/Documenti/pdf/
        </div>

        <div style={{ display: "flex", gap: 20, justifyContent: "flex-end", alignItems: "center" }}>
          <div
            style={{
              fontFamily: mono,
              fontSize: 28,
              padding: "16px 34px",
              borderRadius: 12,
              border: `1px solid ${C.line2}`,
              color: C.muted,
              opacity: allowed ? 0.4 : 1,
            }}
          >
            No
          </div>
          <div
            style={{
              position: "relative",
              fontFamily: mono,
              fontWeight: 600,
              fontSize: 28,
              padding: "16px 40px",
              borderRadius: 12,
              background: allowed ? C.teal : C.amber,
              color: allowed ? "#04120a" : "#241800",
              boxShadow: allowed
                ? `0 0 ${24 + confirm * 12}px ${C.tealGlow}`
                : `0 0 ${12 + invite * 22 + clickT * 28}px ${C.amberGlow}`,
              scale: `${(1 - clickT * 0.06) * (1 + (allowed ? 0 : invite * 0.02))}`,
            }}
          >
            {allowed ? "✓ fatto" : "Consenti"}
            {allowed && confirm < 1 && (
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 12,
                  border: `2px solid ${C.teal}`,
                  scale: `${1 + confirm * 0.9}`,
                  opacity: 1 - confirm,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Remi sotto la card: aspetta, poi esulta */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 190,
          translate: `-50% ${remiNodY}px`,
          scale: `${remiBounce}`,
          rotate: `${remiTilt}deg`,
          transformOrigin: "50% 100%",
        }}
      >
        {/* fumetto di conferma sopra Remi quando approvi */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: -66,
            translate: `-50% ${interpolate(confirm, [0, 1], [14, 0])}px`,
            opacity: allowed
              ? interpolate(frame, [CLICK + 2, CLICK + 10, 112, 118], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
              : 0,
            fontFamily: mono,
            fontSize: 30,
            fontWeight: 600,
            whiteSpace: "nowrap",
            color: C.teal,
            background: "rgba(8,20,16,.92)",
            border: `1px solid ${C.tealDim}`,
            borderRadius: 16,
            padding: "12px 22px",
            boxShadow: `0 0 30px ${C.tealGlow}`,
          }}
        >
          grazie! ✓
        </div>

        <Remi state="waiting_approval" expr={reactExpr} size={300} seed={3} />
      </div>

      <Cursor x={cx} y={cy} press={clickT} />
    </AbsoluteFill>
  );
};
