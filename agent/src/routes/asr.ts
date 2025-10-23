import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { SpanStatusCode } from '@opentelemetry/api';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';
import { getTracer } from '../tracing.js';
import { transcribeAudioBuffer } from '../lib/speech.js';

async function fileToBuffer(file: MultipartFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of file.file) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export async function registerAsrRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/asr/transcribe', async (request, reply) => {
    const config = getConfig();

    if (!config.OPENAI_API_KEY) {
      reply.status(503);
      return { error: 'ASR is not configured (missing OPENAI_API_KEY)' };
    }

    const file = await request.file();
    if (!file) {
      reply.status(400);
      return { error: 'Audio file is required' };
    }

    const tracer = getTracer();

    return await tracer.startActiveSpan('asr_transcribe', async (span) => {
      try {
        const buffer = await fileToBuffer(file);
        span.setAttribute('audio.size_bytes', buffer.length);
        span.setAttribute('audio.mimetype', file.mimetype ?? 'unknown');

        const result = await transcribeAudioBuffer(buffer, file.filename ?? 'audio.wav', file.mimetype);

        if (result.durationMs !== null) {
          span.setAttribute('asr.duration_ms', result.durationMs);
        }
        if (result.confidence !== null) {
          span.setAttribute('asr.confidence', result.confidence);
        }
        span.setAttribute('asr.text_length', result.text.length);

        return {
          text: result.text,
          duration_ms: result.durationMs,
          confidence: result.confidence
        };
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        logger.error({ error }, 'ASR transcription failed');
        reply.status(500);
        return { error: 'Failed to transcribe audio' };
      } finally {
        span.end();
      }
    });
  });
}
