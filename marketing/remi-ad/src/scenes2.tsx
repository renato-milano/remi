import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { C, mono, sans } from "./theme";
import { Remi } from "./Remi";
import { useRise, useBeat } from "./ui";
import { EASE, ri, SectionHead, Bar, Check } from "./kit";

// ── 5 · TASK ─────────────────────────────────────────────────
const TASKS = [
  { t: "Rispondere alle email arretrate", done: 34 },
  { t: "Prenotare la sala riunioni", done: 48 },
  { t: "Aggiornare il foglio spese", done: 62 },
  { t: "Riepilogo settimanale per il team", done: -1 }, // in corso
];
export const SceneTasks: React.FC = () => {
  const frame = useCurrentFrame();
  const beat = useBeat();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num="03 / Task" title={<>Porta a termine.</>} sub="Prende in carico i tuoi task e li chiude, uno dopo l'altro." />
      <div style={{ position: "absolute", right: 150, top: "50%", translate: "0 -50%", width: 620 }}>
        <div style={{ fontFamily: mono, fontSize: 20, color: C.faint, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 18 }}>
          la tua lista · oggi
        </div>
        {TASKS.map((task, i) => {
          const appear = ri(frame, 6 + i * 6, 16 + i * 6, 0, 1);
          const inProg = task.done < 0;
          const on = inProg ? 0 : ri(frame, task.done, task.done + 12, 0, 1);
          const strike = inProg ? 0 : on;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 18, padding: "16px 4px", opacity: appear,
              translate: `${(1 - appear) * 30}px 0`, borderBottom: `1px solid ${C.line}`,
            }}>
              <Check on={on} />
              <div style={{ position: "relative", fontFamily: sans, fontWeight: 500, fontSize: 27, color: on > 0.5 ? C.faint : C.ink }}>
                {task.t}
                <div style={{ position: "absolute", top: "50%", left: 0, height: 2, background: C.faint, width: `${strike * 100}%` }} />
              </div>
              {inProg && (
                <div style={{ marginLeft: "auto", fontFamily: mono, fontSize: 17, color: C.teal, opacity: 0.6 + beat * 0.4 }}>in corso…</div>
              )}
            </div>
          );
        })}
        <div style={{ ...useRise(74, 10), marginTop: 22, fontFamily: mono, fontSize: 20, color: C.teal }}>
          ✓ 3 completati mentre eri altrove
        </div>
      </div>
      <div style={{ position: "absolute", left: 140, bottom: 90 }}>
        <Remi state="acting" size={190} seed={7} />
      </div>
    </AbsoluteFill>
  );
};

// ── 6 · OBIETTIVI (autonomia a lungo raggio) ─────────────────
const GOALS = [
  { t: "Inbox sempre a zero", p: 1.0 },
  { t: "Report mensile pronto in tempo", p: 0.72 },
  { t: "Backup settimanale garantito", p: 0.46 },
];
export const SceneGoals: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num="04 / Obiettivi" title={<>Insegue i tuoi<br />obiettivi.</>} sub="Progetti a lungo raggio che porta avanti da solo — anche mentre dormi." />
      <div style={{ position: "absolute", right: 150, top: "50%", translate: "0 -50%", width: 640, display: "flex", flexDirection: "column", gap: 26 }}>
        {GOALS.map((g, i) => {
          const at = 10 + i * 10;
          const appear = ri(frame, at, at + 12, 0, 1);
          const fill = ri(frame, at + 8, at + 46, 0, g.p);
          const pct = Math.round(fill * 100);
          return (
            <div key={i} style={{ opacity: appear, translate: `0 ${(1 - appear) * 24}px`, background: "rgba(255,255,255,.03)", border: `1px solid ${C.line}`, borderRadius: 14, padding: "22px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 27, color: C.ink }}>{g.t}</span>
                <span style={{ fontFamily: mono, fontSize: 24, color: fill >= g.p - 0.001 && g.p === 1 ? C.teal : C.muted }}>{pct}%</span>
              </div>
              <Bar pct={fill} />
            </div>
          );
        })}
      </div>
      {/* Remi dorme mentre gli obiettivi avanzano */}
      <div style={{ position: "absolute", left: 150, bottom: 100, textAlign: "center" }}>
        <Remi state="sleeping" size={200} seed={9} />
        <div style={{ fontFamily: mono, fontSize: 20, color: C.faint, marginTop: 6 }}>…mentre dormi</div>
      </div>
    </AbsoluteFill>
  );
};

// ── 7 · MEMORIA ──────────────────────────────────────────────
const MEM = [
  { k: "core", d: "chi sei, cosa ti serve", c: C.teal },
  { k: "semantic", d: "fatti su di te, versionati", c: "#7fe4ff" },
  { k: "episodic", d: "cosa è successo, e quando", c: C.amber },
];
export const SceneMemory: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num="05 / Memoria" title={<>Ricorda tutto.</>} sub="Un cervello in markdown leggibile — che vive sul tuo dispositivo." />
      <div style={{ position: "absolute", right: 150, top: "50%", translate: "0 -50%", width: 620, display: "flex", flexDirection: "column", gap: 16 }}>
        {MEM.map((m, i) => {
          const at = 8 + i * 8;
          const o = ri(frame, at, at + 12, 0, 1);
          const x = ri(frame, at, at + 12, 50, 0);
          return (
            <div key={m.k} style={{ opacity: o, translate: `${x}px 0`, background: "rgba(255,255,255,.03)", border: `1px solid ${C.line}`, borderLeft: `3px solid ${m.c}`, borderRadius: 12, padding: "18px 22px" }}>
              <div style={{ fontFamily: mono, fontSize: 23, color: m.c }}># {m.k}</div>
              <div style={{ fontFamily: sans, fontWeight: 400, fontSize: 26, color: "#c9d0cc", marginTop: 6 }}>{m.d}</div>
            </div>
          );
        })}
        <div style={{ ...useRise(44, 10), fontFamily: mono, fontSize: 19, color: C.muted, marginTop: 4 }}>
          <span style={{ color: C.teal }}>memory.search</span>("cosa preferisce") → 3 note
        </div>
      </div>
      <div style={{ position: "absolute", left: 150, bottom: 96 }}>
        <Remi state="thinking" size={190} seed={3} />
      </div>
    </AbsoluteFill>
  );
};

// ── 8 · AUTONOMIA (battito cognitivo) ────────────────────────
const STEPS = ["percepisce", "recupera", "pianifica", "agisce", "riflette", "consolida"];
export const SceneLoop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cx = 380, cy = 380, R = 290;
  const loopDur = 2.4 * fps;
  const prog = ((frame - 14) % loopDur) / loopDur;
  const active = Math.floor((((prog % 1) + 1) % 1) * 6) % 6;
  const dotAng = (-90 + prog * 360) * (Math.PI / 180);
  const dotX = cx + R * Math.cos(dotAng), dotY = cy + R * Math.sin(dotAng);
  const reveal = ri(frame, 10, 40, 0, 1);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num="06 / Autonomia" title={<>Un battito<br />cognitivo.</>} sub="Si sveglia da solo e ripete il ciclo. Senza che tu chieda nulla." />
      <div style={{ position: "relative", width: 760, height: 760, marginLeft: 480, marginTop: 40 }}>
        <svg width={760} height={760} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.line2} strokeWidth={2} strokeDasharray="2 11" style={{ opacity: reveal }} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.teal} strokeWidth={3}
            strokeDasharray={`${2 * Math.PI * R * 0.16} ${2 * Math.PI * R}`}
            strokeDashoffset={-2 * Math.PI * R * (prog - 0.16)}
            style={{ filter: `drop-shadow(0 0 8px ${C.tealGlow})`, opacity: reveal }} strokeLinecap="round" />
          <circle cx={dotX} cy={dotY} r={9} fill={C.teal} style={{ filter: `drop-shadow(0 0 12px ${C.teal})`, opacity: reveal }} />
        </svg>
        {STEPS.map((s, i) => {
          const ang = (-90 + i * 60) * (Math.PI / 180);
          const x = cx + R * Math.cos(ang), y = cy + R * Math.sin(ang);
          const on = i === active;
          const at = 16 + i * 5;
          const o = ri(frame, at, at + 12, 0, 1);
          return (
            <div key={s} style={{
              position: "absolute", left: x, top: y, translate: "-50% -50%", opacity: o,
              fontFamily: mono, fontSize: 24, padding: "11px 18px", borderRadius: 10, whiteSpace: "nowrap",
              background: on ? "rgba(0,255,200,.12)" : C.panel, border: `1px solid ${on ? C.teal : C.line2}`,
              color: on ? C.teal : C.muted, boxShadow: on ? `0 0 22px ${C.tealGlow}` : "none", scale: on ? "1.08" : "1",
            }}>{s}</div>
          );
        })}
        <div style={{ position: "absolute", left: cx, top: cy, translate: "-50% -50%" }}>
          <Remi state="acting" size={200} seed={6} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
