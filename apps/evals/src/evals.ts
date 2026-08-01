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
];
