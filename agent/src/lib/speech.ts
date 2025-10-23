import OpenAI from 'openai';
import { parseBuffer } from 'music-metadata';
import { getConfig } from '../config.js';
import { getOpenAIClient } from './openai-client.js';

interface TranscriptionResponse {
  text: string;
  duration?: number;
  segments?: Array<{ confidence?: number }>;
}

export interface TranscriptionResult {
  text: string;
  durationMs: number | null;
  confidence: number | null;
}

export async function transcribeAudioBuffer(buffer: Buffer, filename: string, mimetype?: string): Promise<TranscriptionResult> {
  const config = getConfig();
  const client = getOpenAIClient();

  const file = await OpenAI.toFile(buffer, filename || 'audio.wav', {
    type: mimetype || 'audio/wav'
  });

  const transcription = await client.audio.transcriptions.create({
    file,
    model: config.ASR_MODEL,
    response_format: 'verbose_json'
  }) as TranscriptionResponse;

  const durationMs = typeof transcription.duration === 'number' ? Math.round(transcription.duration * 1000) : null;
  let confidence: number | null = null;

  const segments = transcription.segments;
  if (Array.isArray(segments) && segments.length > 0) {
    const confidences = segments.map((segment) => segment.confidence).filter((value): value is number => typeof value === 'number');
    if (confidences.length > 0) {
      confidence = confidences.reduce((total, value) => total + value, 0) / confidences.length;
    }
  }

  return {
    text: transcription.text,
    durationMs,
    confidence
  };
}

export interface SynthesisOptions {
  voice?: string;
  format?: string;
}

export interface SynthesisResult {
  audio: Buffer;
  format: string;
  voice: string;
  durationMs: number | null;
}

export function inferAudioMimeType(format: string): string {
  switch (format.toLowerCase()) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
    case 'wave':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'flac':
      return 'audio/flac';
    case 'aac':
      return 'audio/aac';
    case 'pcm':
      return 'audio/pcm';
    default:
      return 'application/octet-stream';
  }
}

export async function synthesizeSpeech(text: string, options: SynthesisOptions = {}): Promise<SynthesisResult> {
  const config = getConfig();
  const client = getOpenAIClient();

  const voice = options.voice ?? config.TTS_VOICE;
  const format = options.format ?? config.TTS_FORMAT;

  const response = await client.audio.speech.create({
    model: config.TTS_MODEL,
    voice,
    response_format: format as 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm',
    input: text
  });

  const arrayBuffer = await response.arrayBuffer();

  const audio = Buffer.from(arrayBuffer);
  let durationMs: number | null = null;

  try {
    const metadata = await parseBuffer(audio, {
      mimeType: inferAudioMimeType(format),
      size: audio.length
    });
    if (typeof metadata.format.duration === 'number') {
      durationMs = Math.round(metadata.format.duration * 1000);
    }
  } catch {
    durationMs = null;
  }

  return {
    audio,
    format,
    voice,
    durationMs
  };
}
