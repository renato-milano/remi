import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LocalWhisper, WHISPER_MODELS, isVercelGateway, matchWakePhrase, modelPath } from './index.js';

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

describe('@openmate/voice — "Hey Remi"', () => {
  // trascrizioni reali (whisper small) di registrazioni con la voce dell'utente
  it('riconosce la frase e restituisce la domanda che segue', () => {
    expect(matchWakePhrase('Ehi Remy')).toBe('');
    expect(matchWakePhrase('Hey Remy.')).toBe('');
    expect(matchWakePhrase('Ehi Rami, cosa è questo?')).toBe('cosa è questo?');
    expect(matchWakePhrase('Ehi Remy, spiegami come funziona.')).toBe('spiegami come funziona.');
    expect(matchWakePhrase('Remy aiuta mi')).toBe('aiuta mi');
    // come la scrivono i modelli cloud (domanda detta di fila con "Hey Remi")
    expect(matchWakePhrase('Ehi Remi, aprimi Spotify e metti Lucio Dalla.')).toBe('aprimi Spotify e metti Lucio Dalla.');
    // con un video in sottofondo whisper antepone etichette dei suoni
    expect(matchWakePhrase('[Musica] Ehi Remy!')).toBe('');
    expect(matchWakePhrase('[Musica] Ei Remy, cosa è questo?')).toBe('cosa è questo?');
    // "e i remi" detto da solo è un "Hey Remi" isolato
    expect(matchWakePhrase('E i remi.')).toBe('');
    expect(matchWakePhrase('e remi!')).toBe('');
  });
  it('non scatta su frasi simili', () => {
    for (const t of [
      'Ehi mi passi il prevo no?',
      'Premi il pulsante rosso.',
      'E i rimi della barca',
      'E i remi della barca',
      '[Musica]',
      '*Risate*',
      'e visto remo ieri sera',
      'Si però mi sembra strano',
      '*sipso*',
      'Remoto il server',
    ]) {
      expect(matchWakePhrase(t)).toBeUndefined();
    }
  });
});
