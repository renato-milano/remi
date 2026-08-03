import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C, mono, sans } from "../theme";
import { Remi } from "../Remi";
import { useRise, useMockup3D, HolynMark, GlassPill } from "../ui";
import { EASE, ri, SectionHead, Cursor, Folder } from "../kit";
import { useLang } from "../i18n";

// ── 3 · COMPUTER-USE ─────────────────────────────────────────
// Montaggio di app reali e ricche che Remi "guarda" mentre agisce.
// Il cursore si muove ESATTAMENTE sull'elemento operato (target condivisi).
// Il badge "controllo schermo attivo" sta su Remi, non sullo schermo.

export const STAGE = 54; // durata per app
export const STARTS = [10, 64, 118, 172];
export const WIN_W = 1020;
export const WIN_H = 570;

const cl = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const mv = (f: number, a: number, b: number, from: number, to: number) =>
  interpolate(f, [a, b], [from, to], { ...cl, easing: EASE });

// barra-titolo finestra
const AppChrome: React.FC<{ bg: string; fg?: string; icon: React.ReactNode; title: string; sub?: string; right?: React.ReactNode }> = ({
  bg, fg = "#fff", icon, title, sub, right,
}) => (
  <div style={{ height: 44, background: bg, display: "flex", alignItems: "center", padding: "0 16px", gap: 10, flexShrink: 0 }}>
    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
    <div style={{ marginLeft: 14, display: "flex", alignItems: "center", gap: 9 }}>
      {icon}
      <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 16, color: fg }}>{title}</span>
      {sub && <span style={{ fontFamily: sans, fontSize: 14, color: fg, opacity: 0.6 }}>{sub}</span>}
    </div>
    {right && <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, color: fg }}>{right}</div>}
  </div>
);

const Avatar: React.FC<{ c: string; t: string; s?: number }> = ({ c, t, s = 34 }) => (
  <div style={{ width: s, height: s, borderRadius: 8, background: c, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans, fontWeight: 700, fontSize: s * 0.42, flexShrink: 0 }}>{t}</div>
);

// ============ APP 1 · GMAIL ============
const GMAIL_SEND = { x: 82, y: WIN_H - 30 }; // centro pulsante "Invia"
export const AppGmail: React.FC<{ f: number }> = ({ f }) => {
  const L = useLang();
  const T = ({
    it: {
      sub: "· Nuovo messaggio", header: "Nuovo messaggio", to: "A", subject: "Oggetto",
      recap: "Recap della settimana", greet: "Ciao a tutti,",
      draft: "ecco il riepilogo dei progressi di questa settimana. Ottimo lavoro a tutti! 🚀",
      ccbcc: "Cc  Ccn", send: "Invia", sent: "✓ Inviata",
    },
    en: {
      sub: "· New message", header: "New message", to: "To", subject: "Subject",
      recap: "Weekly recap", greet: "Hi everyone,",
      draft: "here's a summary of this week's progress. Great work everyone! 🚀",
      ccbcc: "Cc  Bcc", send: "Send", sent: "✓ Sent",
    },
  } as const)[L];
  const DRAFT = T.draft;
  const draft = DRAFT.slice(0, Math.floor(ri(f, 4, 24, 0, DRAFT.length)));
  const caret = f < 26 && Math.floor(f / 4) % 2 === 0;
  const cx = mv(f, 24, 38, 470, GMAIL_SEND.x - 4);
  const cy = mv(f, 24, 38, 300, GMAIL_SEND.y - 2);
  const click = interpolate(f, [39, 43, 49], [0, 1, 0], cl);
  const sent = f > 43;
  const IcoBtn: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#5f6368", fontSize: 16 }}>{children}</div>
  );
  return (
    <div style={{ width: "100%", height: "100%", background: "#fff", position: "relative", display: "flex", flexDirection: "column" }}>
      <AppChrome bg="#f6f8fc" fg="#202124" icon={<GmailIcon />} title="Gmail" sub={T.sub}
        right={<span style={{ color: "#5f6368", fontSize: 15, letterSpacing: 2 }}>⤢  ✕</span>} />
      {/* header compose scuro */}
      <div style={{ background: "#404040", color: "#fff", fontFamily: sans, fontSize: 15, padding: "8px 18px", flexShrink: 0 }}>{T.header}</div>
      <div style={{ padding: "0 18px", flex: 1, display: "flex", flexDirection: "column", fontFamily: sans, color: "#202124", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #f1f3f4" }}>
          <span style={{ color: "#80868b", width: 62, fontSize: 16 }}>{T.to}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#e8f0fe", borderRadius: 20, padding: "3px 10px 3px 3px" }}>
            <Avatar c="#1a73e8" t="T" s={22} /><span style={{ fontSize: 15, color: "#202124" }}>team@holyn.it</span>
          </span>
          <span style={{ marginLeft: "auto", color: "#5f6368", fontSize: 14 }}>{T.ccbcc}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #f1f3f4" }}>
          <span style={{ color: "#80868b", width: 62, fontSize: 16 }}>{T.subject}</span>
          <span style={{ fontSize: 16, color: "#202124", fontWeight: 500 }}>{T.recap}</span>
        </div>
        <div style={{ fontSize: 19, lineHeight: 1.55, color: "#3c4043", flex: 1, paddingTop: 14, minHeight: 0, overflow: "hidden" }}>
          {T.greet}<br />{draft}
          <span style={{ opacity: caret ? 1 : 0, color: "#1a73e8", fontWeight: 700 }}>|</span>
        </div>
      </div>
      {/* barra invio */}
      <div style={{ height: 58, borderTop: "1px solid #e8eaed", display: "flex", alignItems: "center", padding: "0 18px", gap: 14, flexShrink: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", borderRadius: 24, overflow: "hidden",
          background: sent ? "#188038" : "#1a73e8", color: "#fff", fontFamily: sans, fontWeight: 600, fontSize: 18,
          boxShadow: `0 2px ${6 + click * 22}px rgba(26,115,232,${0.3 + click * 0.45})`, scale: `${1 - click * 0.06}`,
        }}>
          <span style={{ padding: "10px 24px" }}>{sent ? T.sent : T.send}</span>
          <span style={{ padding: "10px 12px", borderLeft: "1px solid rgba(255,255,255,.3)", fontSize: 12 }}>▾</span>
        </div>
        <div style={{ display: "flex", gap: 4, marginLeft: 6 }}>
          <IcoBtn><b style={{ fontFamily: "Georgia,serif" }}>A</b></IcoBtn><IcoBtn>📎</IcoBtn><IcoBtn>🖼️</IcoBtn><IcoBtn>🙂</IcoBtn><IcoBtn>🔗</IcoBtn>
        </div>
        <div style={{ marginLeft: "auto", color: "#5f6368", fontSize: 18 }}>🗑️</div>
      </div>
      <Cursor x={cx} y={cy} press={click} />
    </div>
  );
};
const GmailIcon = () => (
  <svg width={20} height={16} viewBox="0 0 24 18"><rect width="24" height="18" rx="3" fill="#fff" stroke="#e0e0e0" /><path d="M2 3 L12 11 L22 3" fill="none" stroke="#ea4335" strokeWidth="2.4" /></svg>
);

// ============ APP 2 · SLACK ============
const AUBERGINE = "#3F0E40";
const SLACK_SEND = { x: WIN_W - 42, y: WIN_H - 38 };
export const AppSlack: React.FC<{ f: number }> = ({ f }) => {
  const L = useLang();
  const T = ({
    it: {
      search: "🔍  Cerca in Holyn", channels: "Canali",
      chGenerale: "generale", chTeam: "team", chReports: "reports",
      dms: "Messaggi diretti",
      remiMsg: "Fatto! Report della settimana caricato qui. 📊",
      giuliaMsg: "Qualcuno ha il recap di questa settimana?",
      now: "ora", topic: "Report e recap del team", placeholder: "Scrivi in #reports",
    },
    en: {
      search: "🔍  Search Holyn", channels: "Channels",
      chGenerale: "general", chTeam: "team", chReports: "reports",
      dms: "Direct messages",
      remiMsg: "Done! This week's report is up here. 📊",
      giuliaMsg: "Anyone got this week's recap?",
      now: "now", topic: "Team reports and recaps", placeholder: "Message #reports",
    },
  } as const)[L];
  const msg = T.remiMsg;
  const typed = msg.slice(0, Math.floor(ri(f, 4, 24, 0, msg.length)));
  const caret = f < 26 && Math.floor(f / 4) % 2 === 0;
  const cx = mv(f, 24, 38, 560, SLACK_SEND.x - 4);
  const cy = mv(f, 24, 38, 320, SLACK_SEND.y - 2);
  const click = interpolate(f, [39, 43, 49], [0, 1, 0], cl);
  const sent = f > 43;
  const sentRise = ri(f, 43, 52, 0, 1);
  const Ch: React.FC<{ n: string; on?: boolean; badge?: number }> = ({ n, on, badge }) => (
    <div style={{ display: "flex", alignItems: "center", fontSize: 16, padding: "5px 10px", borderRadius: 6, marginBottom: 1, background: on ? "#1164A3" : "transparent", color: on ? "#fff" : "rgba(255,255,255,.68)", fontWeight: on ? 700 : 400 }}>
      <span style={{ opacity: 0.7, marginRight: 8 }}>#</span>{n}
      {badge ? <span style={{ marginLeft: "auto", background: "#cd2553", color: "#fff", fontSize: 12, fontWeight: 700, borderRadius: 10, padding: "0 7px" }}>{badge}</span> : null}
    </div>
  );
  return (
    <div style={{ width: "100%", height: "100%", background: "#fff", position: "relative", display: "flex", flexDirection: "column" }}>
      <AppChrome bg={AUBERGINE} icon={<SlackIcon />} title="Slack" sub="· Holyn"
        right={<span style={{ fontSize: 14, opacity: 0.8 }}>{T.search}</span>} />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ width: 208, background: AUBERGINE, padding: "14px 10px", color: "#fff", fontFamily: sans, flexShrink: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 17, marginBottom: 14 }}>
            <Avatar c="#611f69" t="H" s={24} /> Holyn ▾
          </div>
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,.5)", margin: "6px 4px" }}>{T.channels}</div>
          <Ch n={T.chGenerale} /><Ch n={T.chTeam} badge={3} /><Ch n={T.chReports} on />
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,.5)", margin: "12px 4px 6px" }}>{T.dms}</div>
          {[["#2eb67d", "Giulia", "M"], ["#e01e5a", "Marco", "M"]].map(([c, n]) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, padding: "5px 8px", color: "rgba(255,255,255,.72)" }}>
              <span style={{ position: "relative" }}><Avatar c={c as string} t={(n as string)[0]} s={20} /><span style={{ position: "absolute", right: -2, bottom: -2, width: 8, height: 8, borderRadius: "50%", background: "#2bac76", border: "2px solid " + AUBERGINE }} /></span>{n}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "10px 20px", borderBottom: "1px solid #e8e8e8", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 18, color: "#1d1c1d" }}># reports</span>
            <span style={{ fontSize: 13, color: "#616061" }}>👥 8</span>
            <span style={{ fontSize: 13, color: "#616061", borderLeft: "1px solid #ddd", paddingLeft: 10 }}>{T.topic}</span>
          </div>
          <div style={{ flex: 1, padding: "14px 20px", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 14, minHeight: 0 }}>
            <div style={{ display: "flex", gap: 11 }}>
              <Avatar c="#2eb67d" t="G" />
              <div>
                <div style={{ fontFamily: sans, fontSize: 15, color: "#1d1c1d" }}><b>Giulia</b> <span style={{ color: "#616061", fontSize: 12 }}>10:24</span></div>
                <div style={{ fontFamily: sans, fontSize: 16, color: "#1d1c1d", marginTop: 1 }}>{T.giuliaMsg}</div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 5, border: "1px solid #ddd", borderRadius: 12, padding: "1px 8px", fontSize: 13 }}>👍 2</div>
              </div>
            </div>
            {sent && (
              <div style={{ display: "flex", gap: 11, opacity: sentRise, translate: `0 ${(1 - sentRise) * 12}px` }}>
                <Avatar c={C.teal} t="R" />
                <div>
                  <div style={{ fontFamily: sans, fontSize: 15, color: "#1d1c1d" }}><b>Remi</b> <span style={{ background: "#e8f5e9", color: "#188038", fontSize: 11, borderRadius: 3, padding: "0 4px" }}>APP</span> <span style={{ color: "#616061", fontSize: 12 }}>{T.now}</span></div>
                  <div style={{ fontFamily: sans, fontSize: 16, color: "#1d1c1d", marginTop: 1 }}>{msg}</div>
                </div>
              </div>
            )}
          </div>
          <div style={{ margin: "0 20px 18px", border: "1.5px solid #a5a5a5", borderRadius: 10, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 14, padding: "7px 12px", borderBottom: "1px solid #ececec", color: "#616061", fontSize: 14 }}>
              <b>B</b><i>I</i><span style={{ textDecoration: "line-through" }}>S</span><span>🔗</span><span>≣</span><span>{"</>"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px" }}>
              <span style={{ fontFamily: sans, fontSize: 17, color: sent ? "#8d8d8d" : "#1d1c1d" }}>
                {sent ? T.placeholder : typed}{!sent && <span style={{ opacity: caret ? 1 : 0 }}>|</span>}
              </span>
              <div style={{ width: 38, height: 30, borderRadius: 6, background: typed.length > 0 || sent ? "#007a5a" : "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 ${click * 18}px rgba(0,122,90,.6)`, scale: `${1 - click * 0.08}` }}>
                <svg width={17} height={17} viewBox="0 0 24 24"><path d="M2 21 L23 12 L2 3 L2 10 L17 12 L2 14 Z" fill={typed.length > 0 || sent ? "#fff" : "#c9c9c9"} /></svg>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Cursor x={cx} y={cy} press={click} />
    </div>
  );
};
const SlackIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24"><path fill="#36C5F0" d="M9 2a2 2 0 100 4h2V4a2 2 0 00-2-2z" /><path fill="#2EB67D" d="M22 9a2 2 0 10-4 0v2h2a2 2 0 002-2z" /><path fill="#ECB22E" d="M15 22a2 2 0 100-4h-2v2a2 2 0 002 2z" /><path fill="#E01E5A" d="M2 15a2 2 0 104 0v-2H4a2 2 0 00-2 2z" /></svg>
);

// ============ APP 3 · EXCEL / OFFICE 365 ============
const XLGREEN = "#217346";
// layout griglia a coordinate fisse → cella C6 (Totale) nota
const GX = { num: 16, A: 60, B: 300, C: 430, end: 600 }; // x-start colonne
const XHEAD = 128; // chrome44+ribbon28+btns26+namebox30 (offset del container griglia)
const GY0 = 30, RH = 34; // top prima riga (dentro il container), altezza riga
// coordinata WINDOW della cella C6 (Totale) → il cursore ci va sopra esatto
const EXCEL_C6 = { x: (GX.C + GX.end) / 2, y: XHEAD + GY0 + RH * 5 + RH / 2 };
export const AppExcel: React.FC<{ f: number }> = ({ f }) => {
  const L = useLang();
  const T = ({
    it: {
      sub: "· Ore_progetti.xlsx",
      tabs: ["File", "Home", "Inserisci", "Layout", "Formule", "Dati", "Revisione"],
      sum: "Σ Somma", borders: "▦ Bordi", sort: "Ordina", formula: "=SOMMA(C2:C5)",
      head: ["Progetto", "Ore", "Fatturato"], total: "Totale",
      sheet1: "Foglio1", sheet2: "Foglio2",
      avg: "Media: €1.025", count: "Conteggio: 4", sumStatus: "Somma: €4.100",
    },
    en: {
      sub: "· Project_hours.xlsx",
      tabs: ["File", "Home", "Insert", "Layout", "Formulas", "Data", "Review"],
      sum: "Σ Sum", borders: "▦ Borders", sort: "Sort", formula: "=SUM(C2:C5)",
      head: ["Project", "Hours", "Revenue"], total: "Total",
      sheet1: "Sheet1", sheet2: "Sheet2",
      avg: "Average: €1,025", count: "Count: 4", sumStatus: "Sum: €4,100",
    },
  } as const)[L];
  const cx = mv(f, 6, 22, 640, EXCEL_C6.x - 4);
  const cy = mv(f, 6, 22, 210, EXCEL_C6.y - 2);
  const click = interpolate(f, [22, 26, 32], [0, 1, 0], cl);
  const sel = f > 24; // C6 selezionata
  const filled = f > 27;
  const fillRise = ri(f, 27, 38, 0, 1);
  const DATA = [
    [T.head[0], T.head[1], T.head[2]],
    ["Alfa", "12", "€1.200"],
    ["Beta", "8", "€800"],
    ["Gamma", "15", "€1.500"],
    ["Delta", "6", "€600"],
    [T.total, "41", "€4.100"],
  ];
  const cw = (c: "A" | "B" | "C") => (c === "A" ? GX.B - GX.A : c === "B" ? GX.C - GX.B : GX.end - GX.C);
  const Cell: React.FC<{ x: number; w: number; y: number; children?: React.ReactNode; head?: boolean; hl?: boolean; sel?: boolean; bold?: boolean; teal?: boolean }> = ({ x, w, y, children, head, hl, sel, bold, teal }) => (
    <div style={{
      position: "absolute", left: x, top: y, width: w, height: RH, display: "flex", alignItems: "center", padding: "0 12px",
      border: sel ? `2px solid ${XLGREEN}` : "1px solid #d4d4d4", boxSizing: "border-box",
      background: hl ? `rgba(33,115,70,${0.06 + fillRise * 0.1})` : head ? "#f3f2f1" : "#fff",
      fontFamily: sans, fontSize: 16, fontWeight: bold || head ? 700 : 400, color: teal ? XLGREEN : "#333",
    }}>{children}</div>
  );
  return (
    <div style={{ width: "100%", height: "100%", background: "#fff", position: "relative", display: "flex", flexDirection: "column" }}>
      <AppChrome bg={XLGREEN} icon={<ExcelIcon />} title="Excel" sub={T.sub}
        right={<Avatar c="#185a37" t="R" s={24} />} />
      {/* ribbon tabs */}
      <div style={{ height: 28, background: "#f3f2f1", borderBottom: "1px solid #e1dfdd", display: "flex", alignItems: "center", padding: "0 14px", gap: 16, fontFamily: sans, fontSize: 13, color: "#444", flexShrink: 0 }}>
        <span>{T.tabs[0]}</span><span style={{ color: XLGREEN, fontWeight: 700, borderBottom: `2px solid ${XLGREEN}`, paddingBottom: 3 }}>{T.tabs[1]}</span><span>{T.tabs[2]}</span><span>{T.tabs[3]}</span><span>{T.tabs[4]}</span><span>{T.tabs[5]}</span><span>{T.tabs[6]}</span>
      </div>
      {/* ribbon buttons */}
      <div style={{ height: 26, background: "#faf9f8", borderBottom: "1px solid #e1dfdd", display: "flex", alignItems: "center", padding: "0 14px", gap: 14, fontSize: 13, color: "#605e5c", flexShrink: 0 }}>
        <b>B</b><i>I</i><span>U</span><span>|</span><span>{T.sum}</span><span>%</span><span>{T.borders}</span><span>{T.sort}</span>
      </div>
      {/* name box + formula bar */}
      <div style={{ height: 30, background: "#fff", borderBottom: "1px solid #e1dfdd", display: "flex", alignItems: "center", padding: "0 8px", gap: 10, fontFamily: mono, fontSize: 14, color: "#333", flexShrink: 0 }}>
        <span style={{ width: 54, textAlign: "center", color: "#333", borderRight: "1px solid #e1dfdd", fontWeight: 600 }}>{sel ? "C6" : "A1"}</span>
        <span style={{ color: "#888", fontStyle: "italic" }}>fx</span>
        <span style={{ color: filled ? XLGREEN : "#333", fontWeight: filled ? 600 : 400 }}>{filled ? T.formula : ""}</span>
      </div>
      {/* griglia */}
      <div style={{ flex: 1, position: "relative", background: "#fff", minHeight: 0 }}>
        {/* header colonne */}
        <div style={{ position: "absolute", left: GX.A, top: GY0 - 26, width: GX.end - GX.A, height: 26, display: "flex" }}>
          {(["A", "B", "C"] as const).map((c) => (
            <div key={c} style={{ width: cw(c), height: 26, border: "1px solid #d4d4d4", background: c === "C" && sel ? "#cfe6da" : "#f3f2f1", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans, fontSize: 13, color: "#888", fontWeight: 600 }}>{c}</div>
          ))}
        </div>
        {/* numeri riga */}
        {DATA.map((_, r) => (
          <div key={r} style={{ position: "absolute", left: GX.num, top: GY0 + r * RH, width: GX.A - GX.num, height: RH, border: "1px solid #d4d4d4", background: r === 5 && sel ? "#cfe6da" : "#f3f2f1", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans, fontSize: 13, color: "#888", fontWeight: 600 }}>{r + 1}</div>
        ))}
        {/* celle */}
        {DATA.map((row, r) => (
          <React.Fragment key={r}>
            <Cell x={GX.A} w={cw("A")} y={GY0 + r * RH} head={r === 0} bold={r === 5}>{row[0]}</Cell>
            <Cell x={GX.B} w={cw("B")} y={GY0 + r * RH} head={r === 0} bold={r === 5}>{row[1]}</Cell>
            <Cell x={GX.C} w={cw("C")} y={GY0 + r * RH} head={r === 0} bold={r === 5}
              hl={r >= 1 && r <= 4} sel={r === 5 && sel} teal={r === 5 && filled}>
              {r === 5 ? (filled ? <span style={{ opacity: fillRise }}>{row[2]}</span> : "") : row[2]}
            </Cell>
          </React.Fragment>
        ))}
      </div>
      {/* sheet tabs + status bar */}
      <div style={{ height: 26, background: "#f3f2f1", borderTop: "1px solid #e1dfdd", display: "flex", alignItems: "center", padding: "0 12px", gap: 14, fontFamily: sans, fontSize: 13, color: "#605e5c", flexShrink: 0 }}>
        <span style={{ color: XLGREEN, fontWeight: 700, borderBottom: `2px solid ${XLGREEN}`, paddingBottom: 3 }}>{T.sheet1}</span><span>{T.sheet2}</span><span>+</span>
        <span style={{ marginLeft: "auto" }}>{T.avg}</span><span>{T.count}</span><span style={{ color: filled ? XLGREEN : "#605e5c", fontWeight: 600 }}>{T.sumStatus}</span>
      </div>
      <Cursor x={cx} y={cy} press={click} />
    </div>
  );
};
const ExcelIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="3" fill="#fff" /><path d="M7 7 L11 12 L7 17 M11 7 L15 12 L11 17" stroke="#217346" strokeWidth="2" fill="none" /></svg>
);

// ============ APP 4 · VS CODE ============
const ACT = 46, SIDE = 168; // activity bar + explorer
const CODE_TOP = 108, LH = 30; // top area codice + line-height
const VSCODE_BUG = { x: ACT + SIDE + 190, y: CODE_TOP + 3 * LH + LH / 2 };
const kw = { color: "#569cd6" }, fn = { color: "#dcdcaa" }, vr = { color: "#9cdcfe" }, cm = { color: "#6a9955" }, nu = { color: "#b5cea8" };
export const AppVSCode: React.FC<{ f: number }> = ({ f }) => {
  const L = useLang();
  const T = ({
    it: {
      project: "PROGETTI-REMI", breadcrumb: "src › report.ts › totale()",
      comment: "// somma la fatturazione dei progetti", fnName: "totale", param: "righe",
      panels: "PROBLEMI · ", terminal: "TERMINALE",
      error: <>✗ report.test.ts: atteso <b>4100</b>, ricevuto <b>NaN</b></>,
    },
    en: {
      project: "REMI-PROJECTS", breadcrumb: "src › report.ts › total()",
      comment: "// sum the projects' revenue", fnName: "total", param: "rows",
      panels: "PROBLEMS · ", terminal: "TERMINAL",
      error: <>✗ report.test.ts: expected <b>4100</b>, received <b>NaN</b></>,
    },
  } as const)[L];
  const CODE = [
    { line: <><span style={cm}>{T.comment}</span></> },
    { line: <><span style={kw}>export function</span> <span style={fn}>{T.fnName}</span>(<span style={vr}>{T.param}</span>: <span style={{ color: "#4ec9b0" }}>Riga</span>[]) {"{"}</> },
    { line: <>{"  "}<span style={kw}>return</span> <span style={vr}>{T.param}</span></> },
    {
      bug: <>{"    "}.<span style={fn}>reduce</span>((a, r) =&gt; a <span style={{ color: "#ff8888" }}>+ r.fatt</span>, <span style={nu}>0</span>);</>,
      fixed: <>{"    "}.<span style={fn}>reduce</span>((a, r) =&gt; a <span style={{ color: "#4ec9b0" }}>+ Number(r.fatt)</span>, <span style={nu}>0</span>);</>,
    },
    { line: <>{"}"}</> },
  ];
  const cx = mv(f, 4, 20, 560, VSCODE_BUG.x - 4);
  const cy = mv(f, 4, 20, 170, VSCODE_BUG.y - 2);
  const click = interpolate(f, [20, 24, 30], [0, 1, 0], cl);
  const fixed = f > 24;
  const fixRise = ri(f, 24, 32, 0, 1);
  const testPass = f > 40;
  const passRise = ri(f, 40, 48, 0, 1);
  const ActIco: React.FC<{ children: React.ReactNode; on?: boolean }> = ({ children, on }) => (
    <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, color: on ? "#fff" : "#858585", borderLeft: on ? "2px solid #fff" : "2px solid transparent", width: ACT }}>{children}</div>
  );
  return (
    <div style={{ width: "100%", height: "100%", background: "#1e1e1e", position: "relative", display: "flex", flexDirection: "column" }}>
      <AppChrome bg="#323233" icon={<VSCodeIcon />} title="Visual Studio Code" sub="· report.ts" />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* activity bar */}
        <div style={{ width: ACT, background: "#333333", display: "flex", flexDirection: "column", paddingTop: 6, flexShrink: 0 }}>
          <ActIco on>🗎</ActIco><ActIco>🔍</ActIco><ActIco>⑃</ActIco><ActIco>▷</ActIco><ActIco>⬚</ActIco>
        </div>
        {/* explorer */}
        <div style={{ width: SIDE, background: "#252526", padding: "10px 0", fontFamily: sans, fontSize: 13.5, color: "#cccccc", flexShrink: 0 }}>
          <div style={{ padding: "0 14px 8px", fontSize: 11, letterSpacing: 1, color: "#8c8c8c" }}>{T.project}</div>
          {[["▾ 📁", "src", false], ["  📄", "report.ts", true], ["  📄", "utils.ts", false], ["  📄", "report.test.ts", false], ["📄", "package.json", false]].map(([ic, nm, on], i) => (
            <div key={i} style={{ padding: "4px 14px", background: on ? "#37373d" : "transparent", color: on ? "#fff" : "#cccccc", display: "flex", gap: 6 }}><span>{ic as string}</span>{nm as string}</div>
          ))}
        </div>
        {/* editor */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ height: 34, background: "#2d2d2d", display: "flex", flexShrink: 0 }}>
            <div style={{ background: "#1e1e1e", borderTop: `2px solid ${C.teal}`, padding: "0 14px", display: "flex", alignItems: "center", fontFamily: sans, fontSize: 13.5, color: "#fff", gap: 8 }}><span style={{ color: "#4ec9b0" }}>📄</span> report.ts <span style={{ color: "#858585", marginLeft: 6 }}>✕</span></div>
            <div style={{ padding: "0 14px", display: "flex", alignItems: "center", fontFamily: sans, fontSize: 13.5, color: "#8c8c8c", gap: 8 }}><span>📄</span> report.test.ts</div>
          </div>
          <div style={{ height: 24, background: "#1e1e1e", borderBottom: "1px solid #2a2a2a", display: "flex", alignItems: "center", padding: "0 16px", fontFamily: sans, fontSize: 12.5, color: "#8c8c8c", flexShrink: 0 }}>{T.breadcrumb}</div>
          <div style={{ flex: 1, position: "relative", fontFamily: mono, fontSize: 16, lineHeight: `${LH}px`, paddingTop: 8, minHeight: 0 }}>
            {CODE.map((ln, i) => {
              const isBug = i === 3;
              return (
                <div key={i} style={{ display: "flex", height: LH, alignItems: "center", padding: "0 16px", background: isBug ? (fixed ? `rgba(0,255,200,${fixRise * 0.1})` : "rgba(255,80,80,.12)") : "transparent", borderLeft: isBug ? `3px solid ${fixed ? C.teal : "#ff5050"}` : "3px solid transparent" }}>
                  <span style={{ width: 30, color: "#858585", textAlign: "right", marginRight: 20, flexShrink: 0 }}>{i + 1}</span>
                  <span>{isBug ? (fixed ? ln.fixed : ln.bug) : ln.line}</span>
                </div>
              );
            })}
            {/* minimap */}
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 44, background: "#232323", padding: "10px 6px", display: "flex", flexDirection: "column", gap: 4 }}>
              {[60, 80, 50, 70, 30].map((w, i) => <div key={i} style={{ height: 4, width: `${w}%`, background: i === 3 ? (fixed ? C.teal : "#ff6b6b") : "#3a3a3a", borderRadius: 2 }} />)}
            </div>
          </div>
          {/* terminale */}
          <div style={{ height: 70, background: "#181818", borderTop: "1px solid #333", padding: "8px 16px", fontFamily: mono, fontSize: 14.5, flexShrink: 0 }}>
            <div style={{ color: "#858585", fontSize: 12, marginBottom: 4, letterSpacing: 1 }}>{T.panels}<span style={{ color: "#fff" }}>{T.terminal}</span></div>
            {testPass
              ? <div style={{ color: "#4ec9b0", opacity: passRise }}>✓ Test Suites: 1 passed · <span style={{ color: "#858585" }}>Tests: 3 passed (0.4s)</span></div>
              : <div style={{ color: "#ff6b6b" }}>{T.error}</div>}
          </div>
        </div>
      </div>
      {/* status bar */}
      <div style={{ height: 24, background: "#007acc", display: "flex", alignItems: "center", padding: "0 12px", gap: 14, fontFamily: sans, fontSize: 12.5, color: "#fff", flexShrink: 0 }}>
        <span>⑃ main</span><span>{testPass ? "✓ 0  ⚠ 0" : "✗ 1  ⚠ 0"}</span><span style={{ marginLeft: "auto" }}>Ln 4, Col 12</span><span>TypeScript</span>
      </div>
      <Cursor x={cx} y={cy} press={click} />
    </div>
  );
};
const VSCodeIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24"><path d="M17 2 L22 5 L22 19 L17 22 L8 14 L4 17 L2 15 L6 12 L2 9 L4 7 L8 10 Z" fill="#0098d4" /><path d="M17 6 L17 18 L11 12 Z" fill="#29b6f6" /></svg>
);

// testo micro-azione per ogni app (bilingue)
import type { Lang } from "../i18n";
export const actionText = (l: Lang): string[] =>
  l === "en"
    ? [
        "draft written, email sent",
        "message posted in #reports",
        "column summed automatically",
        "bug fixed, test passed",
      ]
    : [
        "bozza scritta e mail inviata",
        "messaggio pubblicato in #reports",
        "colonna sommata in automatico",
        "bug corretto, test superato",
      ];

const RemiCaption: React.FC = () => {
  const L = useLang();
  const ACTION_TEXT = actionText(L);
  const frame = useCurrentFrame();
  const stageIdx = Math.max(0, STARTS.filter((s) => frame >= s - 4).length - 1);
  const f = frame - STARTS[stageIdx];
  const o = ri(f, 12, 22, 0, 1) * (stageIdx === STARTS.length - 1 ? 1 : ri(f, STAGE - 4, STAGE + 6, 1, 0));
  return (
    <GlassPill size={22} style={{ position: "absolute", left: 1050, bottom: 120, translate: `-50% ${(1 - o) * 12}px`, opacity: o }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.teal, boxShadow: `0 0 10px ${C.tealGlow}` }} />
      Remi: {ACTION_TEXT[stageIdx]}
    </GlassPill>
  );
};

export const Window: React.FC<{ start: number; children: (f: number) => React.ReactNode }> = ({ start, children }) => {
  const frame = useCurrentFrame();
  const f = frame - start;
  const isLast = start === STARTS[STARTS.length - 1];
  const end = start + STAGE;
  if (frame < start - 8 || (!isLast && frame > end + 8)) return null;
  const enterX = interpolate(f, [-8, 4], [90, 0], { ...cl, easing: EASE });
  const enterS = interpolate(f, [-8, 6], [0.9, 1], { ...cl, easing: EASE, output: "perceptual-scale" });
  const enterO = interpolate(f, [-8, 2], [0, 1], cl);
  const exitX = isLast ? 0 : interpolate(f, [STAGE - 4, STAGE + 8], [0, -90], cl);
  const exitO = isLast ? 1 : interpolate(f, [STAGE - 2, STAGE + 8], [1, 0], cl);
  return (
    <div style={{ position: "absolute", inset: 0, borderRadius: 16, overflow: "hidden", border: `1px solid ${C.line2}`, boxShadow: "0 40px 100px rgba(0,0,0,.7)", opacity: enterO * exitO, translate: `${enterX + exitX}px 0`, scale: `${enterS}` }}>
      {children(f)}
    </div>
  );
};

export const SceneDesktop: React.FC = () => {
  const L = useLang();
  const T = ({
    it: { title: "Vede il tuo schermo, agisce.", badge: "🖥️ controllo schermo attivo" },
    en: { title: "Sees your screen, takes action.", badge: "🖥️ screen control active" },
  } as const)[L];
  const frame = useCurrentFrame();
  const pill = ri(frame, 14, 26, 0, 1);
  const pillPulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(frame * 0.3));

  // Remi resta CALMO (idle): respiro + oscillazione dolce, nessun cambio d'espressione.
  const breathe = 1 + Math.sin(frame / 12) * 0.015;
  const tilt = Math.sin(frame / 18) * 1.6;
  const remiEnter = interpolate(frame, [4, 20], [0.86, 1], { ...cl, easing: EASE, output: "perceptual-scale" });

  const winRise = useRise(6, 12);
  const win3D = useMockup3D(6, 0.08, -9);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <SectionHead num="01 / Computer use" title={<>{T.title}</>} />

      <div style={{ position: "absolute", left: 540, top: 272, width: WIN_W, height: WIN_H, opacity: winRise.opacity, transform: win3D, transformOrigin: "50% 0" }}>
        <Window start={STARTS[0]}>{(f) => <AppGmail f={f} />}</Window>
        <Window start={STARTS[1]}>{(f) => <AppSlack f={f} />}</Window>
        <Window start={STARTS[2]}>{(f) => <AppExcel f={f} />}</Window>
        <Window start={STARTS[3]}>{(f) => <AppVSCode f={f} />}</Window>
      </div>

      <RemiCaption />

      <div style={{ position: "absolute", left: 1050, bottom: 128, translate: "-50% 0", display: "flex", gap: 12, opacity: pill }}>
        {STARTS.map((s, i) => {
          const active = frame >= s - 4 && (i === STARTS.length - 1 || frame < STARTS[i + 1] - 4);
          return <div key={i} style={{ width: active ? 26 : 9, height: 9, borderRadius: 999, background: active ? C.teal : C.line2, boxShadow: active ? `0 0 10px ${C.tealGlow}` : "none" }} />;
        })}
      </div>

      <div style={{ position: "absolute", left: 150, bottom: 120 }}>
        <GlassPill size={18} style={{ position: "absolute", left: 8, bottom: 250, opacity: pill }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.teal, opacity: pillPulse, boxShadow: `0 0 10px ${C.teal}` }} />
          {T.badge}
        </GlassPill>
        <div style={{ position: "absolute", left: 60, bottom: 236, width: 2, height: 18, background: `linear-gradient(${C.teal}, transparent)`, opacity: pill }} />
        <div style={{ rotate: `${tilt}deg`, scale: `${breathe * remiEnter}` }}>
          <Remi state="idle" size={230} seed={5} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
