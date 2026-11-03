/**
 * Trascrizione e sintesi vocale via Vercel AI Gateway (protocollo nativo
 * dell'AI SDK: gli endpoint audio non esistono sull'API OpenAI-compatible).
 * Usati come ripiego quando whisper locale non c'è, e per la voce di Remi.
 */
const GATEWAY = 'https://ai-gateway.vercel.sh/v4/ai';

export const GATEWAY_STT_MODEL = 'openai/whisper-1';
export const GATEWAY_TTS_MODEL = 'google/gemini-3.8-flash-lite-tts';

/** Il provider configurato è il Vercel AI Gateway? */
export function isVercelGateway(baseURL?: string): boolean {
  return Boolean(baseURL?.includes('ai-gateway.vercel.sh'));
}

function headers(apiKey: string, model: string, kind: 'transcription' | 'speech'): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
    'ai-gateway-protocol-version': '0.0.1',
    'ai-model-id': model,
    [`ai-${kind}-model-specification-version`]: '4',
  };
}

export async function gatewayTranscribe(
  apiKey: string,
  wav: Buffer,
  opts: { model?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const res = await fetch(`${GATEWAY}/transcription-model`, {
    method: 'POST',
    headers: headers(apiKey, opts.model ?? GATEWAY_STT_MODEL, 'transcription'),
    body: JSON.stringify({ audio: wav.toString('base64'), mediaType: 'audio/wav' }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`trascrizione gateway ${res.status}`);
  const json = (await res.json()) as { text?: string };
  return (json.text ?? '').replace(/\s+/g, ' ').trim();
}

/** Sintesi vocale: restituisce l'audio (base64) e il suo media type. */
export async function gatewaySpeak(
  apiKey: string,
  text: string,
  opts: { model?: string; voice?: string; signal?: AbortSignal } = {},
): Promise<{ audio: string; mediaType: string }> {
  const res = await fetch(`${GATEWAY}/speech-model`, {
    method: 'POST',
    headers: headers(apiKey, opts.model ?? GATEWAY_TTS_MODEL, 'speech'),
    body: JSON.stringify({ text, ...(opts.voice ? { voice: opts.voice } : {}) }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`sintesi vocale gateway ${res.status}`);
  const json = (await res.json()) as { audio?: string };
  if (!json.audio) throw new Error('sintesi vocale: nessun audio');
  return { audio: json.audio, mediaType: sniffAudioType(json.audio) };
}

/** Riconosce il formato dall'intestazione (il gateway non lo dichiara). */
function sniffAudioType(b64: string): string {
  const head = Buffer.from(b64.slice(0, 16), 'base64');
  if (head.subarray(0, 4).toString('ascii') === 'RIFF') return 'audio/wav';
  if (head.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (head.subarray(0, 3).toString('ascii') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) {
    return 'audio/mpeg';
  }
  return 'audio/wav';
}
