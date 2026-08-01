# @openmate/evals

Suite di **eval end-to-end** che valida la qualità dell'agente nell'eseguire compiti reali, **con utilizzo effettivo di token**. A differenza degli unit test (backend fake), qui gira il vero `CognitiveLoop` col modello configurato: il modello sceglie i tool, noi verifichiamo che abbia usato gli strumenti giusti e prodotto l'effetto/risposta richiesti.

## Come si esegue

```bash
# tutta la suite
OPENMATE_API_KEY=... pnpm --filter @openmate/evals eval

# solo una categoria o un eval (filtro sul nome)
OPENMATE_API_KEY=... pnpm --filter @openmate/evals eval code
```

- Provider/modello letti dal config dell'app (`~/Library/Application Support/@openmate/ui/openmate.config.json`) o da `OPENMATE_CONFIG`.
- La chiave si passa via `OPENMATE_API_KEY` (non viene letta dal keystore cifrato).
- Ogni eval gira in una cartella di lavoro temporanea, con storage separato; auto-approvazione attiva.

## Categorie coperte
`file` (read/write/list) · `code` (esecuzione) · `memoria` (core/semantica) · `progetto` (.remi) · `scheduling` (task ricorrenti) · `autonomia` (heartbeat) · `ragionamento` (multi-step).

## Principio
Gli assert verificano **l'esito** (file creato, risposta corretta, tool-categoria usata), non il singolo tool: `crea un file` è valido sia via `file.write` sia via `shell.run`. Aggiungere un eval = una voce in `src/evals.ts`.

Il report mostra PASS/FAIL per check, i tool usati e i token (in/out/tot) per eval e totali.
