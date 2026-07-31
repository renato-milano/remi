/**
 * Spiegatore di comandi shell in linguaggio semplice, per utenti non tecnici.
 * Deterministico: legge il comando REALE (non ingannabile), lo descrive in
 * italiano e ne classifica il rischio. Per i comandi non riconosciuti segnala
 * "non riconosciuto" (known:false) → il fallback LLM li spiegherà (step futuro).
 */

export type RiskLevel = 'read' | 'network' | 'write' | 'dangerous' | 'unknown';

export interface CommandExplanation {
  /** Riassunto in italiano, comprensibile a un non-esperto. */
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
      r = { text: `Elenca i file${hasFlag('a') ? ' (anche nascosti)' : ''}${files.length ? ` in ${files.join(', ')}` : ''}`, level: 'read', known: true };
      break;
    case 'cat':
    case 'less':
    case 'more':
      r = { text: `Legge il contenuto${inFiles}`, level: 'read', known: true };
      break;
    case 'head':
      r = { text: `Legge le prime righe${inFiles}`, level: 'read', known: true };
      break;
    case 'tail':
      r = { text: `Legge le ultime righe${inFiles}`, level: 'read', known: true };
      break;
    case 'pwd':
      r = { text: 'Mostra la cartella corrente', level: 'read', known: true };
      break;
    case 'echo':
    case 'printf':
      r = { text: 'Stampa un testo', level: 'read', known: true };
      break;
    case 'grep':
    case 'rg':
    case 'ag':
      r = { text: 'Cerca del testo nei file', level: 'read', known: true };
      break;
    case 'find':
      r = { text: 'Cerca file nel sistema', level: 'read', known: true };
      break;
    case 'which':
    case 'whereis':
      r = { text: 'Trova dove si trova un programma', level: 'read', known: true };
      break;
    case 'ps':
    case 'top':
    case 'htop':
      r = { text: 'Elenca i processi in esecuzione', level: 'read', known: true };
      break;
    case 'df':
    case 'du':
      r = { text: 'Controlla lo spazio su disco', level: 'read', known: true };
      break;
    case 'wc':
      r = { text: 'Conta righe o parole', level: 'read', known: true };
      break;
    case 'date':
    case 'whoami':
    case 'uname':
    case 'env':
    case 'hostname':
      r = { text: 'Mostra informazioni di sistema', level: 'read', known: true };
      break;
    case 'mkdir':
      r = { text: `Crea una cartella${inFiles}`, level: 'write', known: true };
      break;
    case 'touch':
      r = { text: `Crea o aggiorna un file${inFiles}`, level: 'write', known: true };
      break;
    case 'cp':
      r = { text: 'Copia file', level: 'write', known: true };
      break;
    case 'mv':
      r = { text: 'Sposta o rinomina file', level: 'write', known: true };
      break;
    case 'ln':
      r = { text: 'Crea un collegamento', level: 'write', known: true };
      break;
    case 'rmdir':
      r = { text: 'Elimina una cartella vuota', level: 'write', known: true };
      break;
    case 'rm':
      r = { text: `Elimina file${hasFlag('r') ? ' e cartelle intere' : ''}${inFiles}`, level: 'dangerous', known: true };
      break;
    case 'chmod':
      r = { text: 'Cambia i permessi di un file', level: args.includes('777') ? 'dangerous' : 'write', known: true };
      break;
    case 'chown':
      r = { text: 'Cambia il proprietario di un file', level: 'dangerous', known: true };
      break;
    case 'kill':
    case 'pkill':
    case 'killall':
      r = { text: 'Termina un processo', level: 'dangerous', known: true };
      break;
    case 'curl':
    case 'wget':
      r = { text: 'Scarica qualcosa da internet', level: 'network', known: true };
      break;
    case 'ping':
      r = { text: 'Verifica la connessione di rete', level: 'network', known: true };
      break;
    case 'git': {
      const sub = files[0] ?? '';
      const readSubs = ['status', 'log', 'diff', 'show', 'branch', 'remote'];
      r = { text: `Esegue git ${sub}`.trim(), level: readSubs.includes(sub) ? 'read' : 'write', known: true };
      break;
    }
    case 'npm':
    case 'pnpm':
    case 'yarn': {
      const sub = files[0] ?? '';
      const net = ['install', 'i', 'add', 'update', 'ci'].includes(sub);
      r = { text: `Gestisce dipendenze o script (${sub || '…'})`, level: net ? 'network' : 'write', known: true };
      break;
    }
    case 'node':
    case 'python':
    case 'python3':
    case 'sh':
    case 'bash':
    case 'zsh':
      r = { text: `Esegue uno script (${prog})`, level: 'dangerous', known: true };
      break;
    case 'open':
      r = { text: `Apre un file o un'app${inFiles}`, level: 'write', known: true };
      break;
    case 'dd':
    case 'mkfs':
      r = { text: 'Operazione sul disco a basso livello', level: 'dangerous', known: true };
      break;
    default:
      r = { text: prog ? `Comando "${prog}" non riconosciuto` : 'Comando vuoto', level: 'unknown', known: false };
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
  const joined = segs.map((s) => s.text).join(', poi ');
  return { text: joined.charAt(0).toUpperCase() + joined.slice(1), level, known };
}
