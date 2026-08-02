import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { C, mono, serif } from "./theme";
import { Remi } from "./Remi";
import { Chip, Kicker, Heartbeat, useRise } from "./ui";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const ri = (frame: number, a: number, b: number, from: number, to: number) =>
  interpolate(frame, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });

const SectionHead: React.FC<{ num: string; title: React.ReactNode; sub?: string; align?: "left" | "center" }> = ({ num, title, sub, align = "left" }) => {
  const k = useRise(6, 16), t = useRise(16, 18), s = useRise(30, 18);
  return (
    <div style={{ textAlign: align, marginBottom: 30 }}>
      <div style={{ ...k, display: "flex", justifyContent: align === "center" ? "center" : "flex-start" }}><Kicker>{num}</Kicker></div>
      <div style={{ ...t, fontFamily: serif, fontSize: 74, color: C.ink, letterSpacing: "-0.01em", marginTop: 10, lineHeight: 1.04 }}>{title}</div>
      {sub && <div style={{ ...s, fontFamily: serif, fontWeight: 300, fontSize: 32, color: C.muted, marginTop: 14, maxWidth: 760, marginLeft: align === "center" ? "auto" : 0, marginRight: align === "center" ? "auto" : 0 }}>{sub}</div>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 4 · HEARTBEAT — il ciclo cognitivo
// ─────────────────────────────────────────────────────────────
const STEPS = ["percepisce", "recupera", "pianifica", "agisce", "riflette", "consolida"];
export const SceneHeartbeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cx = 400, cy = 400, R = 300;
  // dot che percorre l'anello; indice attivo
  const loopDur = 3.2 * fps;
  const prog = ((frame - 30) % loopDur) / loopDur;
  const active = Math.floor(((prog % 1) + 1) % 1 * 6) % 6;
  const dotAng = (-90 + prog * 360) * (Math.PI / 180);
  const dotX = cx + R * Math.cos(dotAng), dotY = cy + R * Math.sin(dotAng);
  const ringReveal = ri(frame, 20, 70, 0, 1);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ position: "absolute", top: 90, left: 130 }}>
        <SectionHead num="02 — Autonomia" title={<>Un battito cognitivo.</>} sub="Ogni tot, Remi si sveglia e ripete il ciclo — senza che tu debba chiedere." />
      </div>
      <div style={{ position: "relative", width: 800, height: 800, marginTop: 70 }}>
        <svg width={800} height={800} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.line2} strokeWidth={2} strokeDasharray="2 10" strokeLinecap="round"
            style={{ opacity: ringReveal, strokeDashoffset: (1 - ringReveal) * 400 }} />
          {/* arco luminoso che segue il dot */}
          <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.alive} strokeWidth={3}
            strokeDasharray={`${2 * Math.PI * R * 0.16} ${2 * Math.PI * R}`}
            strokeDashoffset={-2 * Math.PI * R * (prog - 0.16)}
            style={{ filter: `drop-shadow(0 0 8px ${C.aliveGlow})`, opacity: ringReveal }} strokeLinecap="round" />
          <circle cx={dotX} cy={dotY} r={9} fill={C.alive} style={{ filter: `drop-shadow(0 0 12px ${C.alive})`, opacity: ringReveal }} />
        </svg>

        {STEPS.map((s, i) => {
          const ang = (-90 + i * 60) * (Math.PI / 180);
          const x = cx + R * Math.cos(ang), y = cy + R * Math.sin(ang);
          const on = i === active;
          const at = 34 + i * 8;
          const o = ri(frame, at, at + 16, 0, 1);
          return (
            <div key={s} style={{
              position: "absolute", left: x, top: y, translate: "-50% -50%", opacity: o,
              fontFamily: mono, fontSize: 26, letterSpacing: "0.02em", padding: "12px 20px", borderRadius: 12,
              whiteSpace: "nowrap", transition: "none",
              background: on ? "rgba(94,242,160,.12)" : C.panel,
              border: `1px solid ${on ? C.alive : C.line2}`,
              color: on ? C.alive : C.muted,
              boxShadow: on ? `0 0 22px ${C.aliveGlow}` : "none",
              scale: on ? "1.08" : "1",
            }}>
              {s}
            </div>
          );
        })}
        {/* Remi al centro dell'anello */}
        <div style={{ position: "absolute", left: cx, top: cy, translate: "-50% -50%" }}>
          <Remi state="acting" size={220} seed={6} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// cursore freccia (macOS-like) riutilizzabile
const Cursor: React.FC<{ x: number; y: number; press?: number }> = ({ x, y, press = 0 }) => (
  <svg width={30} height={34} viewBox="0 0 30 34" style={{ position: "absolute", left: x, top: y, translate: "0 0", filter: "drop-shadow(0 3px 5px rgba(0,0,0,.5))", scale: `${1 - press * 0.12}` }}>
    <path d="M3 2 L3 26 L10 20 L14 30 L19 28 L15 18 L24 18 Z" fill="#fff" stroke="#111" strokeWidth={1.4} strokeLinejoin="round" />
  </svg>
);

// ─────────────────────────────────────────────────────────────
// 5 · COMPUTER-USE — vede lo schermo e agisce
// ─────────────────────────────────────────────────────────────
export const SceneComputerUse: React.FC = () => {
  const frame = useCurrentFrame();
  const win = ri(frame, 8, 34, 0, 1);
  const winY = ri(frame, 8, 34, 40, 0);
  const banner = ri(frame, 30, 46, 0, 1);
  // cursore: parte in alto a dx, scende sul bottone "Invia" e clicca a ~110
  const cx = interpolate(frame, [40, 105], [1180, 792], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const cy = interpolate(frame, [40, 105], [360, 690], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const clickT = interpolate(frame, [106, 112, 120], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sent = frame > 116;
  // Remi: focused, poi "snap" sorpreso sullo screenshot
  const snap = frame > 118 && frame < 140;
  const bannerPulse = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(frame * 0.3));

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ position: "absolute", top: 80, left: 130 }}>
        <SectionHead num="03 — Computer-use" title={<>Vede lo schermo.<br />E lo usa davvero.</>} />
      </div>

      <div style={{ position: "relative", width: 900, height: 560, opacity: win, translate: `0 ${winY}px`, marginTop: 90, marginLeft: 120 }}>
        {/* banner controllo schermo attivo (dal prodotto) */}
        <div style={{
          position: "absolute", top: -26, left: "50%", translate: "-50% 0", opacity: banner, zIndex: 5,
          background: "rgba(255,120,80,.16)", border: "1px solid rgba(255,120,80,.5)", color: "#ffd0c4",
          fontFamily: mono, fontSize: 20, padding: "8px 18px", borderRadius: 999, whiteSpace: "nowrap",
          boxShadow: "0 0 18px rgba(255,120,80,.3)",
        }}>
          <span style={{ opacity: bannerPulse }}>🖥️ controllo schermo attivo</span>
        </div>

        {/* finestra mock */}
        <div style={{ width: "100%", height: "100%", background: "#0f1512", border: `1px solid ${C.line2}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,.6)" }}>
          <div style={{ height: 46, background: "#151b18", display: "flex", alignItems: "center", padding: "0 18px", gap: 10, borderBottom: `1px solid ${C.line}` }}>
            <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#ff5f57" }} />
            <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#febc2e" }} />
            <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#28c840" }} />
            <div style={{ marginLeft: 16, fontFamily: mono, fontSize: 18, color: C.faint }}>Mail — Nuovo messaggio</div>
          </div>
          <div style={{ padding: 30, fontFamily: mono, fontSize: 20, color: C.muted }}>
            <div style={{ display: "flex", gap: 14, marginBottom: 18 }}><span style={{ color: C.faint }}>A:</span><span style={{ color: C.ink }}>team@holyn.ai</span></div>
            <div style={{ display: "flex", gap: 14, marginBottom: 18 }}><span style={{ color: C.faint }}>Oggetto:</span><span style={{ color: C.ink }}>Recap della settimana</span></div>
            <div style={{ height: 1, background: C.line, margin: "6px 0 22px" }} />
            <div style={{ fontFamily: serif, fontSize: 24, color: "#c3cbc4", lineHeight: 1.6, fontWeight: 300 }}>
              Ciao a tutti,<br />ecco il riepilogo dei progressi di questa settimana…
            </div>
            {/* bottone invia */}
            <div style={{
              position: "absolute", left: 700, top: 470, padding: "14px 34px", borderRadius: 10,
              background: sent ? C.aliveDim : C.alive, color: "#04120a", fontFamily: mono, fontWeight: 600, fontSize: 22,
              boxShadow: `0 0 ${clickT * 26}px ${C.aliveGlow}`, scale: `${1 - clickT * 0.06}`,
            }}>
              {sent ? "✓ inviata" : "Invia"}
            </div>
          </div>
        </div>
        <Cursor x={cx - 120} y={cy - 60} press={clickT} />
      </div>

      <div style={{ position: "absolute", right: 120, bottom: 90 }}>
        <Remi state="acting" expr={(snap ? "surprised" : undefined) as never} size={210} seed={5} />
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────
// 6 · SICUREZZA — approval gate (card reale)
// ─────────────────────────────────────────────────────────────
export const SceneApproval: React.FC = () => {
  const frame = useCurrentFrame();
  const card = ri(frame, 12, 40, 0, 1);
  const cardY = ri(frame, 12, 40, 30, 0);
  // cursore preme "Consenti"
  const cx = interpolate(frame, [60, 118], [1200, 1015], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const cy = interpolate(frame, [60, 118], [420, 560], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const clickT = interpolate(frame, [119, 125, 134], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const allowed = frame > 128;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ position: "absolute", top: 90, left: 130 }}>
        <SectionHead num="04 — Sicurezza" title={<>Autonoma, ma mai<br />senza il tuo sì.</>} sub="Shell, file, controllo schermo: ogni azione ad alto impatto passa da permessi e audit." />
      </div>

      <div style={{ position: "absolute", left: 150, bottom: 90 }}>
        <Remi state="waiting_approval" size={230} seed={3} />
      </div>

      {/* card di approvazione — replica di renderer/styles.css .approval */}
      <div style={{
        position: "absolute", right: 150, top: "50%", translate: `0 ${-50}%`, width: 520, opacity: card,
        marginTop: cardY, background: C.bubbleBg, border: `1px solid ${C.amberGlow}`, borderRadius: 18, padding: 28,
        boxShadow: `0 0 40px ${C.amberGlow}, 0 20px 50px rgba(0,0,0,.5)`,
      }}>
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontFamily: mono, fontSize: 18, padding: "6px 14px", borderRadius: 999, border: `1px solid ${C.amberDim}`, color: C.amber }}>
            rischio · da approvare
          </span>
        </div>
        <div style={{ fontFamily: serif, fontSize: 30, color: "#eef1ec", lineHeight: 1.4, marginBottom: 12 }}>
          Remi vuole <b style={{ color: C.amber, fontWeight: 500 }}>eseguire un comando</b> per riordinare i download.
        </div>
        <div style={{ fontFamily: mono, fontSize: 19, color: "#cdd6cd", background: "#0c100e", border: `1px solid ${C.line}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16, wordBreak: "break-all" }}>
          <span style={{ color: C.faint }}>$</span> mv ~/Downloads/*.pdf ~/Documenti/pdf/
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <div style={{ fontFamily: mono, fontSize: 20, padding: "12px 22px", borderRadius: 10, border: `1px solid ${C.line2}`, color: "#cdd4cd" }}>No</div>
          <div style={{
            fontFamily: mono, fontWeight: 600, fontSize: 20, padding: "12px 26px", borderRadius: 10,
            background: allowed ? C.aliveDim : C.amber, color: allowed ? "#eafff2" : "#241800",
            boxShadow: `0 0 ${clickT * 24}px ${C.amberGlow}`, scale: `${1 - clickT * 0.05}`,
          }}>
            {allowed ? "✓ fatto" : "Consenti"}
          </div>
        </div>
      </div>
      <Cursor x={cx} y={cy} press={clickT} />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────
// 7 · LOCAL-FIRST
// ─────────────────────────────────────────────────────────────
export const SceneLocalFirst: React.FC = () => {
  const frame = useCurrentFrame();
  const lock = ri(frame, 6, 34, 0, 1);
  const h = useRise(28, 20);
  const s = useRise(48, 20);
  const foot = useRise(66, 18);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <svg width={120} height={140} viewBox="0 0 120 140" style={{ opacity: lock, scale: `${0.8 + lock * 0.2}`, marginBottom: 30, filter: `drop-shadow(0 0 24px ${C.aliveGlow})` }}>
        <rect x="20" y="60" width="80" height="66" rx="14" fill="none" stroke={C.alive} strokeWidth={5} />
        <path d="M36 60 V44 a24 24 0 0 1 48 0 V60" fill="none" stroke={C.alive} strokeWidth={5} strokeLinecap="round" />
        <circle cx="60" cy="88" r="8" fill={C.alive} />
        <rect x="56" y="92" width="8" height="20" rx="4" fill={C.alive} />
      </svg>
      <div style={{ ...h, fontFamily: serif, fontSize: 92, color: C.ink, textAlign: "center", lineHeight: 1.05, letterSpacing: "-0.01em" }}>
        I tuoi dati <span style={{ fontStyle: "italic", color: C.alive }}>restano tuoi</span>.
      </div>
      <div style={{ ...s, fontFamily: serif, fontWeight: 300, fontSize: 36, color: "#cdd4cd", marginTop: 22, textAlign: "center", maxWidth: 1000 }}>
        Memoria e cronologia vivono sul dispositivo. La rete serve solo al modello.
      </div>
      <div style={{ ...foot, marginTop: 40, display: "flex", gap: 16 }}>
        <Chip accent={C.alive}>local-first</Chip>
        <Chip>nessun cloud obbligato</Chip>
        <Chip>open source · MIT</Chip>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────
// 8 · CTA — chiusura
// ─────────────────────────────────────────────────────────────
export const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const remi = ri(frame, 4, 30, 0, 1);
  const expr = frame > 14 && frame < 80 ? "happy" : undefined;
  const word = useRise(30, 20);
  const tag = useRise(48, 20);
  const foot = useRise(66, 18);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: remi, scale: `${0.7 + remi * 0.3}`, marginBottom: 16 }}>
        <Remi state="idle" expr={expr as never} size={300} />
      </div>
      <div style={{ ...word, display: "flex", alignItems: "center", gap: 22 }}>
        <Heartbeat size={18} />
        <div style={{ fontFamily: mono, fontSize: 72, fontWeight: 600, color: C.ink, letterSpacing: "0.01em" }}>OpenMate</div>
      </div>
      <div style={{ ...tag, fontFamily: serif, fontWeight: 300, fontSize: 40, color: "#cdd4cd", marginTop: 18 }}>
        il tuo agente personale, <span style={{ fontStyle: "italic", color: C.alive }}>vivo</span>.
      </div>
      <div style={{ ...foot, marginTop: 34, fontFamily: mono, fontSize: 24, color: C.muted, letterSpacing: "0.06em", display: "flex", gap: 20 }}>
        <span>local-first</span><span style={{ color: C.faint }}>·</span><span>open source</span><span style={{ color: C.faint }}>·</span><span>sul tuo dispositivo</span>
      </div>
    </AbsoluteFill>
  );
};
