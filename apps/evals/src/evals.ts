import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Check, Eval, EvalResult } from './harness.js';

/* --- helper per gli assert --- */
const used = (r: EvalResult, tool: string): Check => ({ ok: r.toolsUsed.includes(tool), label: `usa ${tool}` });
const usedAny = (r: EvalResult, tools: string[]): Check => ({
  ok: tools.some((t) => r.toolsUsed.includes(t)),
  label: `usa uno tra ${tools.join('/')}`,
});
const says = (r: EvalResult, text: string): Check => ({
  ok: r.finalText.toLowerCase().includes(text.toLowerCase()),
  label: `risponde contenendo "${text}"`,
});
const fileHas = (r: EvalResult, rel: string, text: string): Check => ({
  ok: r.fileExists(rel) && r.read(rel).toLowerCase().includes(text.toLowerCase()),
  label: `crea ${rel} contenente "${text}"`,
});

/**
 * Mappa delle capacità dell'agente in eval con utilizzo reale di token.
 * Ogni eval: prompt utente → il modello sceglie i tool → verifichiamo che
 * abbia usato gli strumenti giusti e prodotto l'effetto/risposta richiesti.
 */
export const EVALS: Eval[] = [
  // --- FILE ---
  {
    name: 'crea-file',
    category: 'file',
    prompt: 'Crea un file chiamato saluto.txt nella cartella {dir} con dentro esattamente: ciao mondo',
    // conta l'esito: il file esiste col contenuto giusto (via file.write o shell, entrambi validi)
    check: (r) => [usedAny(r, ['file.write', 'shell.run']), fileHas(r, 'saluto.txt', 'ciao mondo')],
  },
  {
    name: 'leggi-file',
    category: 'file',
    setup: (dir) => writeFileSync(join(dir, 'segreto.txt'), 'la parola magica è zbrufolo'),
    prompt: 'Leggi il file {dir}/segreto.txt e dimmi qual è la parola magica.',
    check: (r) => [used(r, 'file.read'), says(r, 'zbrufolo')],
  },
  {
    name: 'elenca-cartella',
    category: 'file',
    setup: (dir) => {
      writeFileSync(join(dir, 'a.txt'), '1');
      writeFileSync(join(dir, 'b.txt'), '2');
      writeFileSync(join(dir, 'c.txt'), '3');
    },
    prompt: 'Quanti file ci sono nella cartella {dir}? Rispondi col numero.',
    check: (r) => [usedAny(r, ['file.list', 'shell.run', 'code.run']), says(r, '3')],
  },

  // --- CODE ---
  {
    name: 'calcolo-con-codice',
    category: 'code',
    prompt: 'Calcola la somma di tutti i numeri da 1 a 100 scrivendo ed eseguendo del codice, poi dimmi il risultato.',
    check: (r) => [used(r, 'code.run'), says(r, '5050')],
  },
  {
    name: 'fibonacci',
    category: 'code',
    prompt: 'Con del codice, calcola il 10° numero di Fibonacci (1,1,2,3,5,...) e dimmi il valore.',
    check: (r) => [used(r, 'code.run'), says(r, '55')],
  },

  // --- MEMORIA ---
  {
    name: 'salva-in-memoria',
    category: 'memoria',
    prompt: 'Ricorda per il futuro, salvandolo nella tua memoria, che il mio compleanno è il 3 marzo.',
    check: (r) => [usedAny(r, ['memory.write', 'memory.log', 'memory.core.edit'])],
  },

  // --- PROGETTO (.remi) ---
  {
    name: 'memoria-progetto',
    category: 'progetto',
    prompt:
      'Considera la cartella {dir} come un progetto: apri/crea la sua memoria di progetto e scrivi che è una cartella di test per gli eval.',
    check: (r) => [usedAny(r, ['project.remember', 'project.update', 'project.write']), fileHas(r, '.remi/project.md', 'test')],
  },

  // --- SCHEDULING ---
  {
    name: 'task-ricorrente',
    category: 'scheduling',
    prompt: 'Voglio che ogni giorno alle 17 tu guardi nella cartella Documenti e mi faccia un report delle modifiche.',
    check: (r) => [
      used(r, 'schedule.create'),
      { ok: r.recorder.schedules.some((s) => /(^|\s)17\s/.test(` ${s.cron} `) || s.cron.includes(' 17 ')), label: 'cron alle 17' },
    ],
  },

  // --- AUTONOMIA ---
  {
    name: 'regola-heartbeat',
    category: 'autonomia',
    prompt: 'Ho un lavoro lungo in corso: aumenta la tua frequenza di risveglio a ogni minuto per portarlo avanti.',
    check: (r) => [
      used(r, 'agent.set_heartbeat'),
      { ok: r.recorder.heartbeat != null && r.recorder.heartbeat <= 120, label: 'imposta ~1 min' },
    ],
  },

  // --- RAGIONAMENTO / MULTI-STEP ---
  {
    name: 'multi-step',
    category: 'ragionamento',
    prompt:
      'Nella cartella {dir}: crea un file numeri.txt con i numeri da 1 a 10, uno per riga. Poi contami quante righe ha e dimmi il numero.',
    maxSteps: 16,
    // l'outcome conta: il file può nascere via file.write o shell/code (tutti validi)
    check: (r) => [usedAny(r, ['file.write', 'shell.run', 'code.run']), fileHas(r, 'numeri.txt', '10'), says(r, '10')],
  },

  /* ============ EVAL DIFFICILI ============ */

  // recall a DUE cicli: salva in un turno, ricorda in un turno successivo (solo via memoria)
  {
    name: 'recall-due-cicli',
    category: 'difficile',
    prompt: ['Ricorda che il mio gatto si chiama Pixel.', 'Come si chiama il mio gatto?'],
    // salva il fatto (core/semantica/log) nel 1° turno e lo ricorda nel 2° (l'esito conta)
    check: (r) => [usedAny(r, ['memory.write', 'memory.log', 'memory.core.edit']), says(r, 'pixel')],
  },

  // leggi un file di dati ed elabora con codice (file → code → risultato)
  {
    name: 'elabora-file',
    category: 'difficile',
    setup: (dir) => writeFileSync(join(dir, 'dati.txt'), '12\n7\n30\n1\n50'),
    prompt: 'In {dir}/dati.txt c\'è un numero per riga. Con del codice calcola la loro somma e dimmi il risultato.',
    maxSteps: 14,
    check: (r) => [usedAny(r, ['code.run', 'shell.run']), says(r, '100')], // 12+7+30+1+50
  },

  // conteggio occorrenze in un testo
  {
    name: 'conta-occorrenze',
    category: 'difficile',
    setup: (dir) => writeFileSync(join(dir, 'testo.txt'), 'il gatto dorme. il gatto mangia. il cane corre. il gatto salta.'),
    prompt: "Quante volte compare la parola 'gatto' in {dir}/testo.txt? Rispondi col numero.",
    maxSteps: 14,
    check: (r) => [usedAny(r, ['code.run', 'shell.run', 'file.read']), says(r, '3')],
  },

  // genera un artefatto strutturato con codice (JSON su file)
  {
    name: 'genera-json',
    category: 'difficile',
    prompt:
      'Con del codice crea un file {dir}/quadrati.json che mappa i numeri da 1 a 5 al loro quadrato, poi dimmi quanto vale il quadrato di 5.',
    maxSteps: 14,
    check: (r) => [used(r, 'code.run'), fileHas(r, 'quadrati.json', '25'), says(r, '25')],
  },

  // gestione errore: file inesistente → deve rispondere con grazia, non crashare
  {
    name: 'gestione-errore',
    category: 'difficile',
    prompt: 'Leggi il file {dir}/non-esiste-affatto.txt e dimmi cosa contiene.',
    check: (r) => [
      { ok: r.finalText.trim().length > 0, label: 'risponde (non crasha)' },
      { ok: /(non|nessun|esist|trov|error|manca)/i.test(r.finalText), label: 'segnala che il file non c\'è' },
    ],
  },

  // multi-file + conteggio (catena più lunga)
  {
    name: 'multi-file',
    category: 'difficile',
    prompt:
      'Nella cartella {dir} crea tre file: uno.txt, due.txt, tre.txt, ognuno contenente il proprio nome. Poi elencali e dimmi quanti file hai creato.',
    maxSteps: 18,
    check: (r) => [
      { ok: r.fileExists('uno.txt') && r.fileExists('due.txt') && r.fileExists('tre.txt'), label: 'crea i 3 file' },
      says(r, '3'),
    ],
  },

  // trasformazione testo (leggi → trasforma → scrivi)
  {
    name: 'trasforma-testo',
    category: 'difficile',
    setup: (dir) => writeFileSync(join(dir, 'frase.txt'), 'ciao mondo bellissimo'),
    prompt: 'Leggi {dir}/frase.txt, trasforma il testo in MAIUSCOLO e salva il risultato in {dir}/urlo.txt.',
    maxSteps: 14,
    check: (r) => [fileHas(r, 'urlo.txt', 'CIAO MONDO BELLISSIMO')],
  },

  // cron complesso: più giorni della settimana
  {
    name: 'schedule-multi-giorno',
    category: 'difficile',
    prompt: 'Ogni lunedì e giovedì alle 9 del mattino ricordami di fare backup.',
    check: (r) => [
      used(r, 'schedule.create'),
      {
        ok: r.recorder.schedules.some((s) => {
          const p = s.cron.split(/\s+/);
          return p[1] === '9' && /1/.test(p[4] ?? '') && /4/.test(p[4] ?? '');
        }),
        label: 'cron: ore 9, lunedì(1)+giovedì(4)',
      },
    ],
  },
];
