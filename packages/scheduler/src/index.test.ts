import { describe, expect, it } from 'vitest';
import { Scheduler, type SchedulerTrigger } from './index.js';

function makeScheduler(hasWork: () => boolean) {
  const cycles: SchedulerTrigger[] = [];
  let skips = 0;
  const scheduler = new Scheduler({
    intervalMs: 1_000_000, // irrilevante: nei test invochiamo i tick a mano
    shouldRun: () => hasWork(),
    onCycle: async (t) => {
      cycles.push(t);
    },
    onSkip: () => {
      skips += 1;
    },
  });
  return { scheduler, cycles, getSkips: () => skips };
}

describe('@openmate/scheduler — pre-check heartbeat', () => {
  it('con lavoro pendente il tick avvia un ciclo', async () => {
    const { scheduler, cycles } = makeScheduler(() => true);
    const ran = await scheduler.runHeartbeatOnce();
    expect(ran).toBe(true);
    expect(cycles).toEqual([{ kind: 'heartbeat' }]);
  });

  it('senza lavoro il tick NON avvia un ciclo (niente LLM)', async () => {
    const { scheduler, cycles, getSkips } = makeScheduler(() => false);
    const ran = await scheduler.runHeartbeatOnce();
    expect(ran).toBe(false);
    expect(cycles).toHaveLength(0);
    expect(getSkips()).toBe(1);
  });

  it('un messaggio utente bypassa il pre-check', async () => {
    const { scheduler, cycles } = makeScheduler(() => false);
    await scheduler.submitUserMessage('ciao');
    expect(cycles).toEqual([{ kind: 'user_message', content: 'ciao' }]);
  });

  it('setHeartbeat cambia il ritmo a runtime', () => {
    const { scheduler } = makeScheduler(() => false);
    expect(scheduler.getHeartbeatMs()).toBe(1_000_000);
    scheduler.setHeartbeat(30_000);
    expect(scheduler.getHeartbeatMs()).toBe(30_000);
    scheduler.setHeartbeat(10); // clamp minimo a 1000ms
    expect(scheduler.getHeartbeatMs()).toBe(1000);
  });

  it('start/stop con un cron non lancia eccezioni', () => {
    const { scheduler } = makeScheduler(() => false);
    scheduler.stop();
    const s2 = new Scheduler({
      intervalMs: 1_000_000,
      cron: ['0 0 * * *'],
      shouldRun: () => false,
      onCycle: async () => {},
    });
    expect(() => {
      s2.start();
      s2.stop();
    }).not.toThrow();
  });
});
