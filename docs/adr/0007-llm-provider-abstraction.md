# ADR-0007 — LLM: astrazione multi-provider, default Claude

**Stato:** Accettato

## Contesto

Il core deve interpellare un LLM per ragionamento, tool-use e vision (per il computer-use). Un progetto open source beneficia di libertà di scelta del fornitore; al contempo serve un default capace.

## Decisione

Un'**astrazione multi-provider** (`packages/llm`) con interfaccia comune per chat, tool-use, vision e streaming; **default Claude** (`claude-opus-4-8` / modello vision-capable). Il provider di default **deve** supportare vision, requisito del computer-use. Dettagli in [07](../07-llm-provider-abstraction.md).

## Alternative considerate

- **Single-provider (solo Claude).** Più semplice, ma vincola l'utente e riduce la resilienza (costi, disponibilità, opzioni locali).

## Conseguenze

- **+** Libertà di scelta e fallback tra provider; possibilità di usare modelli locali dove adeguati.
- **+** Default robusto per tool-use e vision.
- **−** Costo di normalizzare API eterogenee (tool-use/vision variano tra provider).
- **−** Modelli locali spesso privi di vision affidabile → non idonei al computer-use; il layer deve dichiarare onestamente le capacità.
- **Risolto** in [ADR-0009](0009-reasoning-backend-own-loop.md) (loop su misura) e [ADR-0010](0010-provider-aggregation-sdk-openai-compatible.md) (astrazione SDK in-process + OpenAI-compatible, no framework agent completo).
