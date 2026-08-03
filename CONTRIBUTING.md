# Contribuire a Remi

Grazie per l'interesse! Remi è un agente AI personale local-first (monorepo
TypeScript, pnpm + Turborepo, Node 22). I package interni usano lo scope
`@openmate/*`; il nome pubblico del prodotto è **Remi**.

## Ambiente di sviluppo

Requisiti: **Node 22** e **pnpm** (`corepack enable` o installazione manuale).

```sh
pnpm install        # con node-linker=hoisted (vedi .npmrc), richiesto dal packaging
pnpm build          # turbo: compila tutti i package (dipendenze in ordine)
pnpm test           # vitest su tutti i package
pnpm typecheck      # tsc --noEmit ovunque
pnpm lint           # biome check
pnpm format         # biome format --write
```

Avviare l'app desktop (Electron) dalla root:

```sh
apps/ui/node_modules/.bin/electron apps/ui
```

Al primo avvio l'onboarding chiede provider (API key **oppure** abbonamento
Claude via login di Claude Code) e livello di autonomia.

## Struttura del repo

- `packages/*` — cuore: `core` (cognitive loop), `daemon`, `llm`, `memory`,
  `tools`, `scheduler`, `computer`, `browser`, `config`.
- `apps/*` — `ui` (Electron), `cli`, `evals`, `extension` (Chrome MV3).
- `docs/*` — documentazione architetturale (in italiano) + [ADR](docs/adr/).

Mappa dettagliata: [`docs/01-architecture-overview.md`](docs/01-architecture-overview.md)
e [`docs/09-tech-stack-and-repo-layout.md`](docs/09-tech-stack-and-repo-layout.md).

## Convenzioni

- **Lingua**: documentazione in **italiano**; identificatori, nomi di
  file/package e codice in **inglese**.
- **Stile codice**: [Biome](https://biomejs.dev/) (`biome.json`). Prima di aprire
  una PR: `pnpm lint` e `pnpm format` puliti.
- **Commit**: Conventional Commits con descrizione in italiano, es.
  `feat(browser): …`, `fix(daemon): …`, `docs: …`, `test(evals): …`,
  `ci: …`, `build(packaging): …`.
- **Test**: aggiungi/aggiorna i test vitest per il codice che tocchi. Le eval
  end-to-end (token reali) sono in `apps/evals`
  (`OPENMATE_API_KEY=… pnpm --filter @openmate/evals eval [categoria]`).
- **ADR**: per decisioni architetturali significative aggiungi un ADR in
  [`docs/adr/`](docs/adr/) e linkalo dalla PR.

## Flusso di una Pull Request

1. Crea un branch dal `main`.
2. Fai le modifiche con test; verifica `pnpm build && pnpm test && pnpm typecheck && pnpm lint`.
3. Apri la PR descrivendo il **perché** oltre al cosa; linka issue/ADR pertinenti.
4. Mantieni la PR focalizzata (un tema per PR).

## Packaging e release

Gli installer (macOS/Windows/Linux) e la distribuzione sono descritti in
[`docs/12-packaging-and-distribution.md`](docs/12-packaging-and-distribution.md)
e [`packaging/README.md`](packaging/README.md). Le release sono automatizzate via
GitHub Actions al tag `v*`.

## Codice di condotta

Sii rispettoso e costruttivo. Le discussioni tecniche sono benvenute; gli
attacchi personali no.
