import type { FastifyInstance } from 'fastify';
import { performance } from 'node:perf_hooks';
import { SpanStatusCode } from '@opentelemetry/api';
import { z } from 'zod';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';
import { getTracer } from '../tracing.js';
import { synthesizeSpeech, inferAudioMimeType } from '../lib/speech.js';

const synthBodySchema = z.object({
  text: z.string().min(1),
  voice: z.string().optional(),
  format: z.string().optional()
});

export async function registerTtsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/tts/synthesize', async (request, reply) => {
    const config = getConfig();

    if (!config.OPENAI_API_KEY) {
      reply.status(503);
      return { error: 'TTS is not configured (missing OPENAI_API_KEY)' };
    }

    const parsed = synthBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid payload', details: parsed.error.flatten().fieldErrors };
    }

    const tracer = getTracer();

    return await tracer.startActiveSpan('tts_synthesize', async (span) => {
      const startedAt = performance.now();
      try {
        const { text, voice, format } = parsed.data;
        span.setAttribute('tts.text_length', text.length);

        const result = await synthesizeSpeech(text, { voice, format });
        span.setAttribute('tts.output_size_bytes', result.audio.length);
        span.setAttribute('tts.output_format', result.format);
        span.setAttribute('tts.voice', result.voice);
        if (result.durationMs !== null) {
          span.setAttribute('tts.playback_duration_ms', result.durationMs);
        }
        span.setAttribute('tts.latency_ms', Math.round(performance.now() - startedAt));

        reply.header('Content-Type', inferAudioMimeType(result.format));
        reply.header('Content-Length', result.audio.length);
        reply.header('X-TTS-Voice', result.voice);
        reply.header('X-TTS-Format', result.format);
        if (result.durationMs !== null) {
          reply.header('X-Audio-Duration-Ms', result.durationMs);
        }
        return reply.send(result.audio);
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        logger.error({ error }, 'TTS synthesis failed');
        reply.status(500);
        return { error: 'Failed to synthesize speech' };
      } finally {
        span.end();
      }
    });
  });
}
