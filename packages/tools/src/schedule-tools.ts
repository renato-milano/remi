import { z } from 'zod';
import { type Tool, defineTool } from './types.js';

export interface ScheduleInfo {
  id: string;
  cron: string;
  title: string;
  instruction: string;
  nextRun?: string | null;
}

/** Controllo dei task ricorrenti, iniettato dal daemon. */
export interface ScheduleControl {
  create(input: { cron: string; instruction: string; title?: string }): ScheduleInfo;
  list(): ScheduleInfo[];
  cancel(id: string): boolean;
  isValidCron(expr: string): boolean;
}

/**
 * Tool con cui l'agente crea/elenca/annulla task RICORRENTI. Il modello traduce
 * la richiesta ("ogni giorno alle 17…") in un'espressione cron e nell'istruzione
 * da eseguire a ogni scatto. Sono 'safe' (gestione dei propri promemoria).
 */
export function createScheduleTools(ctl: ScheduleControl): Tool[] {
  const create = defineTool({
    name: 'schedule.create',
    description:
      'Crea un task RICORRENTE: a ogni scatto del cron eseguirai l\'istruzione data. Usalo quando l\'utente chiede qualcosa di periodico (es. "ogni giorno alle 17…"). cron: 5 campi "min ora giorno mese giorno-settimana" (es. "0 17 * * *" = ogni giorno alle 17:00).',
    parameters: z.object({
      cron: z.string().describe('espressione cron a 5 campi, es. "0 17 * * *"'),
      instruction: z.string().describe("cosa fare a ogni scatto (istruzione completa e autosufficiente)"),
      title: z.string().optional().describe('titolo breve del task'),
    }),
    permission: 'safe',
    explain: (i) => ({ text: `creare un task ricorrente (${i.cron})`, level: 'read', known: true }),
    execute: async (i) => {
      if (!ctl.isValidCron(i.cron)) {
        return { ok: false, error: `espressione cron non valida: "${i.cron}" (usa 5 campi, es. "0 17 * * *")` };
      }
      const s = ctl.create({ cron: i.cron, instruction: i.instruction, title: i.title });
      return { ok: true, id: s.id, title: s.title, cron: s.cron, nextRun: s.nextRun };
    },
  });

  const list = defineTool({
    name: 'schedule.list',
    description: 'Elenca i task ricorrenti attivi (id, titolo, cron, prossima esecuzione).',
    parameters: z.object({}),
    permission: 'safe',
    explain: () => ({ text: 'elencare i task ricorrenti', level: 'read', known: true }),
    execute: async () => ({ schedules: ctl.list() }),
  });

  const cancel = defineTool({
    name: 'schedule.cancel',
    description: "Annulla un task ricorrente dato il suo id (l'utente ha chiesto di smettere).",
    parameters: z.object({ id: z.string() }),
    permission: 'safe',
    explain: () => ({ text: 'annullare un task ricorrente', level: 'read', known: true }),
    execute: async (i) => ({ ok: ctl.cancel(i.id) }),
  });

  return [create, list, cancel];
}
