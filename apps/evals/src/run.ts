import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DirectProviderBackend, createProvider } from '@openmate/llm';
import { EVALS } from './evals.js';
import { type RanEval, runEval } from './harness.js';

/* --- config: provider/modello dal file dell'app, chiave da OPENMATE_API_KEY --- */
function loadAppConfig(): { name: string; model: string; baseURL?: string } {
  const path =
    process.env.OPENMATE_CONFIG ||
    join(homedir(), 'Library', 'Application Support', '@openmate', 'ui', 'openmate.config.json');
  if (existsSync(path)) {
    try {
      const c = JSON.parse(readFileSync(path, 'utf8'));
      return { name: c.provider?.name ?? 'anthropic', model: c.provider?.model ?? 'claude-sonnet-4-5', baseURL: c.provider?.baseURL };
    } catch {
      /* usa i default */
    }
  }
  return { name: 'anthropic', model: 'claude-sonnet-4-5' };
}

const C = '\x1b[36m';
const G = '\x1b[32m';
const R = '\x1b[31m';
const D = '\x1b[2m';
const X = '\x1b[0m';

function fmtTok(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

async function main() {
  const apiKey = process.env.OPENMATE_API_KEY;
  if (!apiKey) {
    console.error(`${R}Manca OPENMATE_API_KEY.${X} Esempio:\n  OPENMATE_API_KEY=... pnpm --filter @openmate/evals eval [filtro]`);
    process.exit(1);
  }
  const cfg = loadAppConfig();
  const provider = createProvider({ name: cfg.name as 'anthropic', baseURL: cfg.baseURL, apiKey });
  const backend = new DirectProviderBackend(provider.languageModel(cfg.model));

  const filter = process.argv[2]?.toLowerCase();
  const suite = filter ? EVALS.filter((e) => e.category.includes(filter) || e.name.includes(filter)) : EVALS;

  console.log(`\n${C}OpenMate — Evals${X}  ${D}(modello: ${cfg.name} · ${cfg.model})${X}`);
  console.log(`${D}${suite.length} eval con token reali. Auto-approvazione attiva.${X}\n`);

  const results: RanEval[] = [];
  for (const ev of suite) {
    process.stdout.write(`${D}▸ ${ev.category}/${ev.name} …${X}`);
    let ran: RanEval;
    try {
      ran = await runEval(ev, backend);
    } catch (err) {
      ran = {
        name: ev.name,
        category: ev.category,
        checks: [{ ok: false, label: `errore: ${(err as Error).message}` }],
        pass: false,
        tools: [],
        usage: {},
      };
    }
    results.push(ran);
    const tok = ran.usage.totalTokens ?? (ran.usage.inputTokens ?? 0) + (ran.usage.outputTokens ?? 0);
    const badge = ran.pass ? `${G}PASS${X}` : `${R}FAIL${X}`;
    const name = `${ev.category}/${ev.name}`.padEnd(30, '.');
    process.stdout.write(`\r${badge}  ${name} ${D}${ran.tools.join(' ') || '—'} · ${fmtTok(tok)} tok${X}\n`);
    for (const c of ran.checks) console.log(`   ${c.ok ? `${G}✓${X}` : `${R}✗${X}`} ${D}${c.label}${X}`);
  }

  const passed = results.filter((r) => r.pass).length;
  const tin = results.reduce((a, r) => a + (r.usage.inputTokens ?? 0), 0);
  const tout = results.reduce((a, r) => a + (r.usage.outputTokens ?? 0), 0);
  const ttot = results.reduce(
    (a, r) => a + (r.usage.totalTokens ?? (r.usage.inputTokens ?? 0) + (r.usage.outputTokens ?? 0)),
    0,
  );
  const color = passed === results.length ? G : passed >= results.length * 0.6 ? C : R;
  console.log(`\n${color}Totale: ${passed}/${results.length} passati${X}`);
  console.log(`${D}Token: in ${fmtTok(tin)} · out ${fmtTok(tout)} · tot ${fmtTok(ttot)}${X}\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
