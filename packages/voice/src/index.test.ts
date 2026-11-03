import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LocalWhisper, WHISPER_MODELS, isVercelGateway, modelPath } from './index.js';

describe('@openmate/voice', () => {
  it('riconosce il Vercel AI Gateway dal base URL', () => {
    expect(isVercelGateway('https://ai-gateway.vercel.sh/v1')).toBe(true);
    expect(isVercelGateway('https://openrouter.ai/api/v1')).toBe(false);
    expect(isVercelGateway(undefined)).toBe(false);
  });

  it('whisper locale non è disponibile senza binario o modello', () => {
    const w = new LocalWhisper({ binPath: '/nope/whisper-server', modelPath: '/nope/model.bin', language: 'it' });
    expect(w.available()).toBe(false);
    expect(modelPath('/data/voice', 'small')).toBe(`/data/voice/${WHISPER_MODELS.small.file}`);
  });

  // Integrazione reale: solo se binario, modello e un WAV di prova sono indicati via env.
  const bin = process.env.OPENMATE_WHISPER_BIN;
  const model = process.env.OPENMATE_WHISPER_MODEL;
  const wav = process.env.OPENMATE_WHISPER_WAV;
  it.runIf(bin && model && wav && existsSync(bin) && existsSync(model))(
    'trascrive un WAV con whisper-server',
    async () => {
      const w = new LocalWhisper({ binPath: bin ?? '', modelPath: model ?? '', language: 'it' });
      try {
        const text = await w.transcribe(readFileSync(wav ?? ''));
        expect(text.length).toBeGreaterThan(0);
      } finally {
        w.stop();
      }
    },
    60_000,
  );
});
