/**
 * Spiegatore di comandi shell in linguaggio semplice, per utenti non tecnici.
 * Deterministico: legge il comando REALE (non ingannabile). Restituisce l'azione
 * all'INFINITO, così la UI la incornicia come domanda ("Posso …?").
 * I comandi non riconosciuti hanno known:false → li spiegherà il fallback LLM.
 */

export type RiskLevel = 'read' | 'network' | 'write' | 'dangerous' | 'unknown';

export interface CommandExplanation {
  /** Azione all'infinito, es. "leggere le ultime righe" → "Posso leggere le ultime righe?". */
  text: string;
  level: RiskLevel;
  /** true se tutti i segmenti sono stati riconosciuti dalle regole. */
  known: boolean;
}

const RANK: Record<RiskLevel, number> = { read: 0, network: 1, write: 2, dangerous: 3, unknown: 4 };

interface Segment {
  text: string;
  level: RiskLevel;
  known: boolean;
}

function explainSegment(segment: string): Segment {
  const parts = segment.trim().split(/\s+/).filter(Boolean);
  let prog = parts[0] ?? '';
  let args = parts.slice(1);
  let admin = false;
  if (prog === 'sudo') {
    admin = true;
    prog = args[0] ?? '';
    args = args.slice(1);
  }
  const files = args.filter((a) => !a.startsWith('-'));
  const hasFlag = (letter: string) =>
    args.some((a) => a.startsWith('-') && !a.startsWith('--') && a.includes(letter));
  const inFiles = files.length ? ` (${files.join(', ')})` : '';

  let r: Segment;
  switch (prog) {
    case 'ls':
      r = { text: `elencare i file${hasFlag('a') ? ' (anche nascosti)' : ''}${files.length ? ` in ${files.join(', ')}` : ''}`, level: 'read', known: true };
      break;
    case 'cat':
    case 'less':
    case 'more':
      r = { text: `leggere il contenuto${inFiles}`, level: 'read', known: true };
      break;
    case 'head':
      r = { text: `leggere le prime righe${inFiles}`, level: 'read', known: true };
      break;
    case 'tail':
      r = { text: `leggere le ultime righe${inFiles}`, level: 'read', known: true };
      break;
    case 'pwd':
      r = { text: 'vedere la cartella corrente', level: 'read', known: true };
      break;
    case 'echo':
    case 'printf':
      r = { text: 'stampare un testo', level: 'read', known: true };
      break;
    case 'grep':
    case 'rg':
    case 'ag':
      r = { text: 'cercare del testo nei file', level: 'read', known: true };
      break;
    case 'find':
      r = { text: 'cercare file nel sistema', level: 'read', known: true };
      break;
    case 'which':
    case 'whereis':
      r = { text: 'trovare dove si trova un programma', level: 'read', known: true };
      break;
    case 'ps':
    case 'top':
    case 'htop':
      r = { text: 'vedere i processi in esecuzione', level: 'read', known: true };
      break;
    case 'df':
    case 'du':
      r = { text: 'controllare lo spazio su disco', level: 'read', known: true };
      break;
    case 'wc':
      r = { text: 'contare righe o parole', level: 'read', known: true };
      break;
    case 'date':
    case 'whoami':
    case 'uname':
    case 'env':
    case 'hostname':
      r = { text: 'vedere informazioni di sistema', level: 'read', known: true };
      break;
    case 'mkdir':
      r = { text: `creare una cartella${inFiles}`, level: 'write', known: true };
      break;
    case 'touch':
      r = { text: `creare o aggiornare un file${inFiles}`, level: 'write', known: true };
      break;
    case 'cp':
      r = { text: 'copiare dei file', level: 'write', known: true };
      break;
    case 'mv':
      r = { text: 'spostare o rinominare dei file', level: 'write', known: true };
      break;
    case 'ln':
      r = { text: 'creare un collegamento', level: 'write', known: true };
      break;
    case 'rmdir':
      r = { text: 'eliminare una cartella vuota', level: 'write', known: true };
      break;
    case 'rm':
      r = { text: `eliminare dei file${hasFlag('r') ? ' e cartelle intere' : ''}${inFiles}`, level: 'dangerous', known: true };
      break;
    case 'chmod':
      r = { text: 'cambiare i permessi di un file', level: args.includes('777') ? 'dangerous' : 'write', known: true };
      break;
    case 'chown':
      r = { text: 'cambiare il proprietario di un file', level: 'dangerous', known: true };
      break;
    case 'kill':
    case 'pkill':
    case 'killall':
      r = { text: 'terminare un processo', level: 'dangerous', known: true };
      break;
    case 'curl':
    case 'wget':
      r = { text: 'scaricare qualcosa da internet', level: 'network', known: true };
      break;
    case 'ping':
      r = { text: 'verificare la connessione di rete', level: 'network', known: true };
      break;
    case 'git': {
      const sub = files[0] ?? '';
      const readSubs = ['status', 'log', 'diff', 'show', 'branch', 'remote'];
      r = { text: `eseguire git ${sub}`.trim(), level: readSubs.includes(sub) ? 'read' : 'write', known: true };
      break;
    }
    case 'npm':
    case 'pnpm':
    case 'yarn': {
      const sub = files[0] ?? '';
      const net = ['install', 'i', 'add', 'update', 'ci'].includes(sub);
      r = { text: `gestire dipendenze o script (${sub || '…'})`, level: net ? 'network' : 'write', known: true };
      break;
    }
    case 'node':
    case 'python':
    case 'python3':
    case 'sh':
    case 'bash':
    case 'zsh':
      r = { text: `eseguire uno script (${prog})`, level: 'dangerous', known: true };
      break;
    case 'open':
      r = { text: `aprire un file o un'app${inFiles}`, level: 'write', known: true };
      break;
    case 'dd':
    case 'mkfs':
      r = { text: 'fare un\'operazione sul disco a basso livello', level: 'dangerous', known: true };
      break;
    default:
      r = { text: prog ? `eseguire "${prog}", che non riconosco` : 'eseguire un comando vuoto', level: 'unknown', known: false };
  }

  if (admin) return { text: `${r.text} (come amministratore)`, level: 'dangerous', known: r.known };
  return r;
}

/** Pattern palesemente pericolosi (alzano il livello a "dangerous" nel display). */
function looksDangerous(cmd: string): boolean {
  return (
    /\bsudo\b/.test(cmd) ||
    /\brm\b\s+-\w*r/.test(cmd) ||
    /\|\s*(sh|bash|zsh)\b/.test(cmd) ||
    /\bmkfs\b/.test(cmd) ||
    /\bdd\b\s+if=/.test(cmd) ||
    /:\(\)\s*\{/.test(cmd)
  );
}

export function explainCommand(command: string): CommandExplanation {
  const cmd = command.trim();
  const segments = cmd.split(/\s*(?:\|\||&&|;|\|)\s*/).filter(Boolean);
  const segs = segments.length ? segments.map(explainSegment) : [explainSegment('')];
  const known = segs.every((s) => s.known);
  let level: RiskLevel = segs.reduce<RiskLevel>(
    (acc, s) => (RANK[s.level] > RANK[acc] ? s.level : acc),
    'read',
  );
  if (looksDangerous(cmd)) level = 'dangerous';
  return { text: segs.map((s) => s.text).join(' e poi '), level, known };
}
