import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** Modelli whisper.cpp scaricabili (formato ggml). sha256 = etag di Hugging Face. */
export const WHISPER_MODELS = {
  small: {
    file: 'ggml-small.bin',
    bytes: 487_601_967,
    sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
  },
} as const;

export type WhisperModelName = keyof typeof WHISPER_MODELS;

const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

export function modelPath(dir: string, name: WhisperModelName): string {
  return join(dir, WHISPER_MODELS[name].file);
}

export function hasModel(dir: string, name: WhisperModelName): boolean {
  return existsSync(modelPath(dir, name));
}

/**
 * Scarica il modello in `dir` (file .part, poi rinominato solo se dimensione e
 * sha256 tornano). `onProgress` riceve la frazione 0..1.
 */
export async function downloadModel(
  dir: string,
  name: WhisperModelName,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const spec = WHISPER_MODELS[name];
  const dest = modelPath(dir, name);
  const part = `${dest}.part`;
  await mkdir(dir, { recursive: true });
  const res = await fetch(`${BASE_URL}/${spec.file}`, { signal });
  if (!res.ok || !res.body) throw new Error(`download del modello fallito (${res.status})`);
  const hash = createHash('sha256');
  let received = 0;
  let lastReport = 0;
  const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
  body.on('data', (chunk: Buffer) => {
    hash.update(chunk);
    received += chunk.length;
    const fraction = received / spec.bytes;
    if (fraction - lastReport >= 0.01) {
      lastReport = fraction;
      onProgress?.(Math.min(1, fraction));
    }
  });
  try {
    await pipeline(body, createWriteStream(part));
    if (received !== spec.bytes || hash.digest('hex') !== spec.sha256) {
      throw new Error('modello scaricato non valido (checksum diverso)');
    }
    await rename(part, dest);
  } catch (err) {
    await rm(part, { force: true });
    throw err;
  }
  onProgress?.(1);
  return dest;
}
