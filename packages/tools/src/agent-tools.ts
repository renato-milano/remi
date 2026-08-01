import { z } from 'zod';
import { type Tool, defineTool } from './types.js';

/** Controllo del proprio ritmo, iniettato dal daemon (accesso allo scheduler). */
export interface AgentControl {
  /** Imposta il ritmo dell'heartbeat (secondi). */
  setHeartbeat(seconds: number): void;
  getHeartbeatSeconds(): number;
  /** Programma un risveglio tra N secondi per continuare un lavoro (con nota). */
  wakeIn(seconds: number, note: string): void;
}

/**
 * Tool con cui l'agente gestisce la propria autonomia: cambia il ritmo di
 * risveglio e programma continuazioni per i task lunghi. Sono 'safe'
 * (l'agente regola se stesso; il pre-check e il budget restano le guardie).
 */
export function createAgentTools(ctl: AgentControl): Tool[] {
  const setHeartbeat = defineTool({
    name: 'agent.set_heartbeat',
    description:
      'Cambia il TUO ritmo di risveglio autonomo (heartbeat, in secondi). Abbassalo quando hai un lavoro lungo da portare avanti spesso; alzalo quando sei in attesa, per non consumare inutilmente.',
    parameters: z.object({ seconds: z.number().min(10).max(86400) }),
    permission: 'safe',
    explain: (i) => ({ text: `impostare il mio ritmo a ${i.seconds}s`, level: 'read', known: true }),
    execute: async (i) => {
      ctl.setHeartbeat(i.seconds);
      return { ok: true, heartbeatSeconds: i.seconds };
    },
  });

  const wakeIn = defineTool({
    name: 'agent.wake_in',
    description:
      'Programma un tuo risveglio tra N secondi per CONTINUARE un lavoro lungo, senza aspettare il prossimo heartbeat. Lascia una nota chiara su cosa riprendere (salva anche i progressi in memoria/.remi).',
    parameters: z.object({
      seconds: z.number().min(3).max(3600),
      note: z.string().describe('cosa riprendere/continuare al risveglio'),
    }),
    permission: 'safe',
    explain: (i) => ({ text: `programmare un mio risveglio tra ${i.seconds}s`, level: 'read', known: true }),
    execute: async (i) => {
      ctl.wakeIn(i.seconds, i.note);
      return { ok: true, inSeconds: i.seconds };
    },
  });

  return [setHeartbeat, wakeIn];
}
