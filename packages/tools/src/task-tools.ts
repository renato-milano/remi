import { z } from 'zod';
import { type Tool, defineTool } from './types.js';

export interface TaskInfo {
  id: string;
  goalId?: string;
  title: string;
  status: string;
  attempts: number;
  notes?: string;
}

/** Controllo dei task/goal persistenti, iniettato dal daemon (TaskStore). */
export interface TaskControl {
  createGoal(title: string): { id: string; title: string };
  addTask(title: string, goalId?: string): { id: string; title: string };
  listTasks(): TaskInfo[];
  getTask(id: string): TaskInfo | undefined;
  noteTask(id: string, note: string): boolean;
  completeTask(id: string): boolean;
  blockTask(id: string, reason?: string): boolean;
}

/**
 * Tool con cui l'agente si dà OBIETTIVI a lungo raggio. Un task creato qui è
 * persistente: l'heartbeat lo riprende ciclo dopo ciclo finché l'agente non lo
 * chiude (task.complete) o lo blocca (task.block). Sono 'safe' (auto-gestione).
 */
export function createTaskTools(ctl: TaskControl): Tool[] {
  const goalCreate = defineTool({
    name: 'goal.create',
    description:
      'Crea un OBIETTIVO di alto livello (goal) a cui appendere più task. Usalo per lavori grandi/lunghi da portare avanti nel tempo.',
    parameters: z.object({ title: z.string() }),
    permission: 'safe',
    explain: () => ({ text: 'creare un obiettivo', level: 'read', known: true }),
    execute: async (i) => ({ ok: true, goal: ctl.createGoal(i.title) }),
  });

  const taskAdd = defineTool({
    name: 'task.add',
    description:
      'Aggiunge un TASK persistente da portare avanti autonomamente. Verrà ripreso a ogni heartbeat finché non lo completi o lo blocchi. Scomponi i lavori lunghi in task. Facoltativo: goalId per legarlo a un obiettivo.',
    parameters: z.object({ title: z.string(), goalId: z.string().optional() }),
    permission: 'safe',
    explain: (i) => ({ text: `aggiungere il task "${i.title.slice(0, 40)}"`, level: 'read', known: true }),
    execute: async (i) => ({ ok: true, task: ctl.addTask(i.title, i.goalId) }),
  });

  const taskList = defineTool({
    name: 'task.list',
    description: 'Elenca i task (id, titolo, stato, tentativi, note di progresso).',
    parameters: z.object({}),
    permission: 'safe',
    explain: () => ({ text: 'elencare i miei task', level: 'read', known: true }),
    execute: async () => ({ tasks: ctl.listTasks() }),
  });

  const taskNote = defineTool({
    name: 'task.note',
    description:
      'Annota un progresso su un task (cosa hai fatto, dove sei arrivato). Fondamentale: al prossimo ciclo riprenderai da qui.',
    parameters: z.object({ id: z.string(), note: z.string() }),
    permission: 'safe',
    explain: () => ({ text: 'annotare un progresso', level: 'read', known: true }),
    execute: async (i) => ({ ok: ctl.noteTask(i.id, i.note) }),
  });

  const taskComplete = defineTool({
    name: 'task.complete',
    description: "Segna un task come COMPLETATO quando l'obiettivo è davvero raggiunto. Solo così l'heartbeat smette di riprenderlo.",
    parameters: z.object({ id: z.string() }),
    permission: 'safe',
    explain: () => ({ text: 'completare un task', level: 'read', known: true }),
    execute: async (i) => ({ ok: ctl.completeTask(i.id) }),
  });

  const taskBlock = defineTool({
    name: 'task.block',
    description: 'Blocca un task che non puoi portare avanti (manca qualcosa, serve l\'utente), con una motivazione.',
    parameters: z.object({ id: z.string(), reason: z.string().optional() }),
    permission: 'safe',
    explain: () => ({ text: 'bloccare un task', level: 'read', known: true }),
    execute: async (i) => ({ ok: ctl.blockTask(i.id, i.reason) }),
  });

  return [goalCreate, taskAdd, taskList, taskNote, taskComplete, taskBlock];
}
