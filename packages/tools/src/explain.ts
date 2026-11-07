/**
 * Spiegatore di comandi shell in linguaggio semplice, per utenti non tecnici.
 * Deterministico e NON tecnico: descrive l'azione principale in una frase breve
 * ("Posso guardare i file nella cartella Desktop?"), senza dettagli tecnici
 * (flag, redirect, path grezzi). Il comando esatto resta disponibile a parte.
 */

export type RiskLevel = 'read' | 'network' | 'write' | 'dangerous' | 'unknown';

export interface CommandExplanation {
  /** Azione all'infinito, breve. La UI la incornicia come "Posso <text>?". */
  text: string;
  level: RiskLevel;
  known: boolean;
}

const RANK: Record<RiskLevel, number> = { read: 0, network: 1, write: 2, dangerous: 3, unknown: 4 };

interface Segment {
  text: string;
  level: RiskLevel;
  known: boolean;
}

const LOC_NAMES: Record<string, string> = {
  Desktop: 'Desktop',
  Documents: 'Documenti',
  Downloads: 'Download',
  Pictures: 'Immagini',
  Music: 'Musica',
  Movies: 'Video',
  tmp: 'temporanea',
  '.': 'corrente',
  '..': 'superiore',
  '~': 'home',
};

/** Estrae un nome di cartella/file "amichevole" dagli argomenti (ignora flag/redirect). */
function friendlyLocation(files: string[]): string {
  const p = files.find(
    (f) => !/[<>*]/.test(f) && !f.includes('dev/null') && (f.includes('/') || f.startsWith('~') || /^[\w.]+$/.test(f)),
  );
  if (!p) return '';
  const base = p.replace(/\/+$/, '').split('/').pop() || p;
  return LOC_NAMES[base] || base;
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
  const loc = friendlyLocation(files);
  const inLoc = loc ? ` nella cartella ${loc}` : '';
  const hasFlag = (letter: string) =>
    args.some((a) => a.startsWith('-') && !a.startsWith('--') && a.includes(letter));

  let r: Segment;
  switch (prog) {
    case 'ls':
    case 'dir':
      r = { text: `guardare i file${inLoc}`, level: 'read', known: true };
      break;
    case 'cat':
    case 'less':
    case 'more':
    case 'head':
    case 'tail':
      r = { text: 'leggere un file', level: 'read', known: true };
      break;
    case 'pwd':
      r = { text: 'vedere in quale cartella siamo', level: 'read', known: true };
      break;
    case 'echo':
    case 'printf':
      r = { text: 'stampare un messaggio', level: 'read', known: true };
      break;
    case 'grep':
    case 'rg':
    case 'ag':
    case 'find':
      r = { text: 'cercare qualcosa tra i file', level: 'read', known: true };
      break;
    case 'which':
    case 'whereis':
      r = { text: 'trovare un programma', level: 'read', known: true };
      break;
    case 'ps':
    case 'top':
    case 'htop':
      r = { text: 'vedere i programmi in esecuzione', level: 'read', known: true };
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
      r = { text: 'creare una cartella', level: 'write', known: true };
      break;
    case 'touch':
      r = { text: 'creare un file', level: 'write', known: true };
      break;
    case 'cp':
      r = { text: 'copiare dei file', level: 'write', known: true };
      break;
    case 'mv':
      r = { text: 'spostare dei file', level: 'write', known: true };
      break;
    case 'ln':
      r = { text: 'creare un collegamento', level: 'write', known: true };
      break;
    case 'rmdir':
      r = { text: 'eliminare una cartella vuota', level: 'write', known: true };
      break;
    case 'rm':
      r = { text: `eliminare dei file${hasFlag('r') ? ' e cartelle' : ''}`, level: 'dangerous', known: true };
      break;
    case 'chmod':
    case 'chown':
      r = { text: 'cambiare i permessi di un file', level: args.includes('777') ? 'dangerous' : 'write', known: true };
      break;
    case 'kill':
    case 'pkill':
    case 'killall':
      r = { text: 'chiudere un programma', level: 'dangerous', known: true };
      break;
    case 'curl':
    case 'wget':
      r = { text: 'scaricare qualcosa da internet', level: 'network', known: true };
      break;
    case 'ping':
      r = { text: 'controllare la connessione', level: 'network', known: true };
      break;
    case 'git':
      r = { text: 'usare git', level: 'write', known: true };
      break;
    case 'npm':
    case 'pnpm':
    case 'yarn':
      r = { text: 'gestire le dipendenze del progetto', level: 'write', known: true };
      break;
    case 'node':
    case 'python':
    case 'python3':
    case 'sh':
    case 'bash':
    case 'zsh':
      r = { text: 'eseguire uno script', level: 'dangerous', known: true };
      break;
    case 'osascript':
      // comandare un'app (play, pausa, attiva…) va bene; AppleScript che lancia comandi di shell no
      if (/do shell script/i.test(segment)) {
        r = { text: 'eseguire comandi tramite AppleScript', level: 'dangerous', known: true };
      } else if (/tell application/i.test(segment)) {
        r = { text: "comandare un'app", level: 'write', known: true };
      } else {
        r = { text: 'eseguire uno script AppleScript', level: 'unknown', known: false };
      }
      break;
    case 'open':
      // aprire un'app per nome o un link/deep-link non tocca i file: scorre senza conferma
      if (args.includes('-a') || /^["']?[a-z][\w+.-]*:/i.test(files[0] ?? '')) {
        r = { text: args.includes('-a') ? "aprire un'app" : 'aprire un link', level: 'read', known: true };
      } else {
        r = { text: "aprire un file o un'app", level: 'write', known: true };
      }
      break;
    case 'dd':
    case 'mkfs':
      r = { text: "fare un'operazione sul disco", level: 'dangerous', known: true };
      break;
    default:
      r = { text: 'eseguire un comando che non riconosco', level: 'unknown', known: false };
  }

  if (admin) return { text: `${r.text} (da amministratore)`, level: 'dangerous', known: r.known };
  return r;
}

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
  // descrivi l'azione a rischio PIÙ ALTO (allinea testo e badge, niente elenchi)
  let chosen = segs[0];
  for (const s of segs) if (RANK[s.level] > RANK[chosen.level]) chosen = s;
  const level: RiskLevel = looksDangerous(cmd) ? 'dangerous' : chosen.level;
  return { text: chosen.text, level, known };
}

/** Comandi e codice che eliminano dati o chiudono programmi: con fiducia "Autonomo" sono gli unici che chiedono. */
const DESTRUCTIVE: [RegExp, string][] = [
  [/(^|[\s;&|(`$])(sudo\s+)?(rm|rmdir|unlink|shred|srm|trash)(\s|$)/, 'eliminare dei file'],
  [/\s-delete(\s|$)|\bgit\s+clean\b|\bgit\s+reset\s+--hard\b/, 'eliminare dei file'],
  [/\bdd\b[^\n]*\bof=|\bmkfs|\bdiskutil\s+(erase|zero|secureErase|partitionDisk)/i, 'cancellare un disco'],
  [/os\.(remove|unlink|rmdir|removedirs)\(|shutil\.rmtree|send2trash|\.unlink\(|unlinkSync|rmSync|rmdirSync|fs\.rm\(/, 'eliminare dei file'],
  [/(^|[\s;&|(`$])(sudo\s+)?(kill|killall|pkill)(\s|$)|os\.kill\(|process\.kill\(/, 'chiudere un programma'],
  [/\bto\s+quit\b|\bquit\s+app/i, 'chiudere un programma'],
];

/** Cosa c'è di distruttivo in un comando o in un pezzo di codice (eliminare, chiudere programmi), se c'è. */
export function destructiveAction(text: string): string | undefined {
  for (const [re, what] of DESTRUCTIVE) if (re.test(text)) return what;
  return undefined;
}
