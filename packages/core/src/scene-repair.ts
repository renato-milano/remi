import type { Budget, ReasoningBackend, TokenUsage } from '@openmate/llm';
import { SCENE_GUIDE, SceneStream, type SceneStreamEvent } from '@openmate/scene3d';

type End = Extract<SceneStreamEvent, { op: 'end' }>;
/** Ritenta solo scene con contatti espliciti, una sola volta, entro 20 secondi e senza tool. */
export async function repairContactScene(opts: {
  backend: ReasoningBackend;
  end: End;
  budget: Budget;
  signal?: AbortSignal;
  emit: (events: SceneStreamEvent[]) => void;
}): Promise<TokenUsage> {
  const usage: TokenUsage = {};
  const cancelled = () =>
    opts.emit([
      { ...opts.end, nodes: 0, pendingRepair: false, errors: ['contacts: verifica interrotta'] },
    ]);
  let end = opts.end;
  let original: {
    contacts?: {
      id?: string;
      mover?: string;
      source?: { node?: string };
      target?: { node?: string };
    }[];
  };
  try {
    original = JSON.parse(end.source ?? '');
  } catch {
    return usage;
  }
  const originalContacts = original.contacts;
  if (!Array.isArray(originalContacts) || !end.errors.length) return usage;
  for (let attempt = 0; attempt < 1 && !opts.signal?.aborted; attempt++) {
    const parser = new SceneStream();
    const events: SceneStreamEvent[] = [];
    const timeout = new AbortController();
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout.signal]) : timeout.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const collect = async () => {
        for await (const event of opts.backend.run({
          system: `${SCENE_GUIDE}\nRipara la scena seguente usando gli errori geometrici del compilatore. Mantieni tutti i contatti: non eliminare contacts, né cambiare id dei contatti, mover e nodi source/target. Puoi correggere forme, orientamento, punti, tempi e traiettorie. Rispondi SOLO con <scene3d>{...}</scene3d>.`,
          messages: [
            { role: 'user', content: `Errori:\n${end.errors.join('\n')}\nScena:\n${end.source}` },
          ],
          budget: {
            ...opts.budget,
            maxSteps: 1,
            maxTokens: Math.min(opts.budget.maxTokens ?? 6000, 6000),
            wallClockMs: Math.min(opts.budget.wallClockMs ?? 20000, 20000),
          },
          signal,
          fast: true,
        })) {
          if (event.type === 'text-delta') events.push(...parser.feed(event.text).events);
          if (event.type === 'finish')
            for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const)
              usage[key] = (usage[key] ?? 0) + (event.usage[key] ?? 0);
        }
      };
      await Promise.race([
        collect(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            timeout.abort();
            reject(new Error('contacts: tempo massimo di correzione raggiunto'));
          }, 20000);
        }),
      ]);
      events.push(...parser.end().events);
      if (opts.signal?.aborted) {
        cancelled();
        return usage;
      }
      const candidate = [...events].reverse().find((e) => e.op === 'end');
      if (!candidate || candidate.op !== 'end') continue;
      const repaired = JSON.parse(candidate.source ?? '{}') as typeof original;
      const repairedContacts = repaired.contacts;
      const intact =
        Array.isArray(repairedContacts) &&
        repairedContacts.length === originalContacts.length &&
        originalContacts.every((c) =>
          repairedContacts.some(
            (r) =>
              r.id === c.id &&
              r.mover === c.mover &&
              r.source?.node === c.source?.node &&
              r.target?.node === c.target?.node,
          ),
        );
      if (!intact) {
        end = {
          ...end,
          errors: [
            'contacts.repair: conserva tutti i contatti e i loro riferimenti; non rimuovere la verifica',
          ],
        };
        continue;
      }
      end = candidate;
      if (!candidate.errors.length && candidate.nodes > 0) {
        opts.emit(events);
        return usage;
      }
    } catch {
      // Il primo errore geometrico resta disponibile anche se il backend fallisce.
      break;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  if (opts.signal?.aborted) cancelled();
  else
    opts.emit([
      {
        ...opts.end,
        nodes: 0,
        pendingRepair: false,
        errors: [
          ...end.errors,
          'contacts: correzione automatica non riuscita; animazione non riprodotta',
        ],
      },
    ]);
  return usage;
}
