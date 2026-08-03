import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi, Expr } from "../Remi";
import { usePop, useMockup3D } from "../ui";
import { EASE, SectionHead, Cursor } from "../kit";

// ── 9 · SICUREZZA (approval gate) ────────────────────────────
// La card ambra chiede il permesso. Il cursore raggiunge "Consenti",
// clicca, e la card diventa "✓ fatto" nel teal Holyn. Remi — in attesa
// (waiting_approval) — appena approvi fa un cenno felice: rassicurante,
// "sei sempre tu al comando", NON allarmante.
export const SceneApproval: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const card = usePop(6);

  // momenti chiave della scena
  const CLICK = 56; // frame del click su "Consenti"
  const allowed = frame >= CLICK + 1;

  // cursore: arriva da fuori campo in basso-destra fino al pulsante "Consenti"
  const btnX = 1660;
  const btnY = 646;
  const cx = interpolate(frame, [16, CLICK - 2], [1980, btnX], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const cy = interpolate(frame, [16, CLICK - 2], [1080, btnY], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const clickT = interpolate(frame, [CLICK, CLICK + 4, CLICK + 12], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // pulsante "Consenti": pulsa gentile prima del click per invitare (non allarmante)
  const invite = allowed ? 0 : 0.5 + 0.5 * Math.sin((frame - 8) * 0.16);

  // onda verde di conferma che si espande dal pulsante dopo il click
  const confirm = spring({ frame: frame - CLICK, fps, config: { damping: 16, mass: 0.7, stiffness: 120 } });

  // ── Remi: da "in attesa" (curioso/ambra) a felice (grin) al momento del sì ──
  const reactExpr: Expr | undefined = allowed
    ? (frame < CLICK + 20 ? "grin" : "happy")
    : undefined; // undefined => usa lo stato waiting_approval (curious/amber)

  // cenno felice: un piccolo bob + rimbalzo di scala quando approvi
  const nod = spring({ frame: frame - CLICK, fps, config: { damping: 8, mass: 0.5, stiffness: 150 } });
  const remiNodY = allowed ? interpolate(nod, [0, 1], [0, -18]) * Math.cos((frame - CLICK) * 0.5) : 0;
  const remiBounce = allowed ? 1 + interpolate(nod, [0, 1], [0.12, 0]) : 1;
  // leggera inclinazione "vivo" mentre aspetta, si raddrizza felice all'ok
  const remiTilt = allowed ? 0 : 2.5 * Math.sin(frame * 0.06);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead
        num="07 / Sicurezza"
        title={<>Mai senza<br />il tuo sì.</>}
        sub="Ogni azione importante aspetta il tuo ok. Sei sempre tu al comando."
      />

      {/* Remi in basso a sinistra: aspetta, poi esulta */}
      <div
        style={{
          position: "absolute",
          left: 168,
          bottom: 118,
          translate: `0 ${remiNodY}px`,
          scale: `${remiBounce}`,
          rotate: `${remiTilt}deg`,
          transformOrigin: "50% 100%",
        }}
      >
        <Remi state="waiting_approval" expr={reactExpr} size={310} seed={3} />
        {/* fumetto di conferma sopra Remi quando approvi */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: -58,
            translate: `-50% ${interpolate(confirm, [0, 1], [12, 0])}px`,
            opacity: allowed ? interpolate(frame, [CLICK + 2, CLICK + 10, 92, 96], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0,
            fontFamily: mono,
            fontSize: 22,
            fontWeight: 600,
            whiteSpace: "nowrap",
            color: C.teal,
            background: "rgba(8,20,16,.92)",
            border: `1px solid ${C.tealDim}`,
            borderRadius: 12,
            padding: "9px 16px",
            boxShadow: `0 0 24px ${C.tealGlow}`,
          }}
        >
          grazie! ✓
        </div>
      </div>

      {/* Card di approvazione (ambra → teal) */}
      <div
        style={{
          position: "absolute",
          right: 150,
          top: "50%",
          translate: "0 -50%",
          width: 560,
          transform: useMockup3D(6, 0.1, -8),
          background: C.bubbleBg,
          border: `1px solid ${allowed ? C.tealGlow : C.amberGlow}`,
          borderRadius: 20,
          padding: 30,
          boxShadow: allowed
            ? `0 0 44px ${C.tealGlow}, 0 20px 50px rgba(0,0,0,.6)`
            : `0 0 40px ${C.amberGlow}, 0 20px 50px rgba(0,0,0,.6)`,
        }}
      >
        {/* riga stato / chip */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <span
            style={{
              fontFamily: mono,
              fontSize: 17,
              padding: "6px 14px",
              borderRadius: 999,
              border: `1px solid ${allowed ? C.tealDim : C.amberDim}`,
              color: allowed ? C.teal : C.amber,
            }}
          >
            {allowed ? "approvato · da te" : "chiede il permesso"}
          </span>
        </div>

        <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 31, color: "#f3f6f2", lineHeight: 1.35, marginBottom: 16 }}>
          Remi vuole <span style={{ color: allowed ? C.teal : C.amber }}>riordinare i download</span> per te.
        </div>

        <div
          style={{
            fontFamily: mono,
            fontSize: 18,
            color: "#cdd6cd",
            background: "#0a0d0b",
            border: `1px solid ${C.line}`,
            borderRadius: 10,
            padding: "13px 15px",
            marginBottom: 20,
            wordBreak: "break-all",
          }}
        >
          <span style={{ color: C.faint }}>$</span> sposta i PDF in ~/Documenti/pdf/
        </div>

        <div style={{ display: "flex", gap: 14, justifyContent: "flex-end", alignItems: "center" }}>
          <div
            style={{
              fontFamily: mono,
              fontSize: 19,
              padding: "12px 24px",
              borderRadius: 10,
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
              fontSize: 19,
              padding: "12px 28px",
              borderRadius: 10,
              background: allowed ? C.teal : C.amber,
              color: allowed ? "#04120a" : "#241800",
              boxShadow: allowed
                ? `0 0 ${20 + confirm * 10}px ${C.tealGlow}`
                : `0 0 ${10 + invite * 18 + clickT * 24}px ${C.amberGlow}`,
              scale: `${(1 - clickT * 0.06) * (1 + (allowed ? 0 : invite * 0.02))}`,
            }}
          >
            {allowed ? "✓ fatto" : "Consenti"}
            {/* onda verde che parte dal pulsante al momento del sì */}
            {allowed && confirm < 1 && (
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 10,
                  border: `2px solid ${C.teal}`,
                  scale: `${1 + confirm * 0.9}`,
                  opacity: 1 - confirm,
                }}
              />
            )}
          </div>
        </div>
      </div>

      <Cursor x={cx} y={cy} press={clickT} />
    </AbsoluteFill>
  );
};
