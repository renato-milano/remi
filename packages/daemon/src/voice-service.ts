import { join } from 'node:path';
import type { OpenMateConfig } from '@openmate/config';
import {
  LocalWhisper,
  downloadModel,
  GATEWAY_STT_MODEL,
  gatewaySpeak,
  gatewayTranscribe,
  hasModel,
  isVercelGateway,
  matchWakePhrase,
  modelPath,
} from '@openmate/voice';

/** Oltre questo tempo la domanda si trascrive in locale: meglio un nome sbagliato che aspettare. */
const CLOUD_TIMEOUT_MS = 3000;

/** Stato della voce, per l'interfaccia (Impostazioni, lavagna). */
export interface VoiceStatus {
  enabled: boolean;
  /** Come verrà trascritta la prossima domanda. */
  stt: 'local' | 'cloud' | 'none';
  /** Download del modello locale: frazione 0..1, se in corso. */
  downloading?: number;
  /** Voce di Remi: audio dal cloud, voce di sistema (sintesi nell'interfaccia) o nessuna. */
  tts: 'cloud' | 'system' | 'off';
  /** "Hey Remi" attivo (richiede whisper locale: l'ascolto non va mai in rete). */
  wakeWord: boolean;
  error?: string;
}

/**
 * Voce: trascrizione (whisper.cpp locale, ripiego sul gateway) e sintesi vocale
 * (gateway, altrimenti la fa l'interfaccia con la voce di sistema).
 */
export class VoiceService {
  private readonly local?: LocalWhisper;
  private readonly modelsDir: string;
  private readonly gatewayKey?: string;
  private readonly onStatus?: (s: VoiceStatus) => void;
  private downloading?: number;
  private error?: string;

  constructor(
    private readonly config: OpenMateConfig,
    opts: { apiKey?: string; whisperBin?: string; onStatus?: (s: VoiceStatus) => void } = {},
  ) {
    this.onStatus = opts.onStatus;
    this.modelsDir = join(config.storage.root, 'voice');
    const p = config.provider;
    if (p.name === 'openai-compatible' && isVercelGateway(p.baseURL) && opts.apiKey) this.gatewayKey = opts.apiKey;
    if (config.voice.stt === 'local' && opts.whisperBin) {
      this.local = new LocalWhisper({
        binPath: opts.whisperBin,
        modelPath: modelPath(this.modelsDir, config.voice.model),
        language: config.voice.language,
        pidFile: join(this.modelsDir, 'whisper-server.pid'),
        // in ascolto di "Hey Remi" il modello resta caricato, altrimenti si libera dopo 5 min
        idleMs: config.voice.enabled && config.voice.wakeWord ? 0 : undefined,
      });
    }
  }

  status(): VoiceStatus {
    const v = this.config.voice;
    const stt = !v.enabled ? 'none' : this.local?.available() ? 'local' : this.gatewayKey ? 'cloud' : 'none';
    let tts: VoiceStatus['tts'] = 'off';
    if (v.enabled && v.tts !== 'off') {
      tts = v.tts === 'system' || !this.gatewayKey ? 'system' : 'cloud';
    }
    const s: VoiceStatus = { enabled: v.enabled, stt, tts, wakeWord: v.enabled && v.wakeWord && stt === 'local' };
    if (this.downloading !== undefined) s.downloading = this.downloading;
    if (this.error) s.error = this.error;
    return s;
  }

  /** Scarica il modello locale se manca (in background, all'avvio). */
  async ensureModel(): Promise<void> {
    const v = this.config.voice;
    if (!v.enabled || !this.local || hasModel(this.modelsDir, v.model) || this.downloading !== undefined) return;
    this.downloading = 0;
    this.error = undefined;
    this.emitStatus();
    try {
      await downloadModel(this.modelsDir, v.model, (f) => {
        this.downloading = f;
        this.emitStatus();
      });
    } catch (err) {
      this.error = `download del modello vocale fallito: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.downloading = undefined;
      this.emitStatus();
    }
  }

  /** Prepara la trascrizione (avvia whisper-server) mentre l'utente parla. */
  warm(): void {
    if (this.config.voice.enabled) this.local?.warm();
  }

  /**
   * Trascrive una domanda: col gateway usa il modello cloud (preciso sui nomi), con ripiego
   * su whisper locale se il cloud non risponde in tempo. `wake`: l'audio inizia con
   * "Hey Remi", e si restituisce solo ciò che segue (vuoto se il cloud non lo riconosce).
   */
  async transcribeQuestion(wav: Buffer, opts: { wake?: boolean } = {}): Promise<{ text: string; engine: string }> {
    if (!this.config.voice.enabled) throw new Error('voce disattivata');
    const model = this.config.voice.questionModel;
    if (this.gatewayKey && model !== 'local') {
      try {
        const text = await gatewayTranscribe(this.gatewayKey, wav, {
          model,
          signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
        });
        return { text: opts.wake ? (matchWakePhrase(text) ?? '') : text, engine: model };
      } catch {
        /* cloud non raggiungibile o lento: whisper locale */
      }
    }
    const text = await this.transcribe(wav);
    return { text: opts.wake ? (matchWakePhrase(text) ?? '') : text, engine: this.local?.available() ? 'locale' : GATEWAY_STT_MODEL };
  }

  async transcribe(wav: Buffer): Promise<string> {
    if (!this.config.voice.enabled) throw new Error('voce disattivata');
    if (this.local?.available()) return this.local.transcribe(wav);
    if (this.gatewayKey) return gatewayTranscribe(this.gatewayKey, wav);
    throw new Error(
      this.downloading !== undefined
        ? `sto ancora scaricando il modello vocale (${Math.round(this.downloading * 100)}%)`
        : 'trascrizione non disponibile: manca whisper locale',
    );
  }

  /**
   * Un pezzo di parlato ascoltato in sottofondo: inizia con "Hey Remi"? Solo whisper
   * locale: l'audio ambientale non deve mai lasciare il computer.
   */
  async detectWake(wav: Buffer): Promise<{ wake: boolean; question: string; text: string }> {
    if (!this.status().wakeWord || !this.local?.available()) throw new Error('"Hey Remi" non disponibile');
    const text = await this.local.transcribe(wav);
    const question = matchWakePhrase(text);
    return { wake: question !== undefined, question: question ?? '', text };
  }

  /** Audio della risposta, o undefined se la voce è di sistema/spenta (la fa l'interfaccia). */
  async speak(text: string): Promise<{ audio: string; mediaType: string } | undefined> {
    if (this.status().tts !== 'cloud' || !this.gatewayKey) return undefined;
    return gatewaySpeak(this.gatewayKey, text, { language: this.config.voice.language });
  }

  stop(): void {
    this.local?.stop();
  }

  private emitStatus(): void {
    this.onStatus?.(this.status());
  }
}
