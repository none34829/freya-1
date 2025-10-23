import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { performance } from 'node:perf_hooks';
import { SpanStatusCode } from '@opentelemetry/api';
import { z } from 'zod';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';
import { getTracer } from '../tracing.js';
import { transcribeAudioBuffer, synthesizeSpeech } from '../lib/speech.js';
import type { AgentConversationMessage } from '../agent.js';
import { streamAgentResponse } from '../agent.js';

const promptSchema = z
  .object({
    id: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    body: z.string().min(1),
    tags: z.array(z.string()).optional()
  })
  .default({ body: 'You are Freya, a helpful voice assistant.', title: 'Voice Assistant', tags: [] });

const historySchema = z
  .array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string()
    })
  )
  .optional();

async function fileToBuffer(file: MultipartFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of file.file) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function extractField(file: MultipartFile, key: string): string | undefined {
  const raw = file.fields?.[key];
  if (!raw) {
    return undefined;
  }
  if (Array.isArray(raw)) {
    const first = raw[0];
    return typeof first === 'object' && first && 'value' in first ? String(first.value) : undefined;
  }
  return typeof raw === 'object' && raw && 'value' in raw ? String(raw.value) : undefined;
}

export async function registerRoundtripRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/messages/roundtrip', async (request, reply) => {
    const config = getConfig();
    if (!config.OPENAI_API_KEY) {
      reply.status(503);
      return { error: 'Voice roundtrip is not configured (missing OPENAI_API_KEY)' };
    }

    const file = await request.file();
    if (!file) {
      reply.status(400);
      return { error: 'Audio file is required' };
    }

    const tracer = getTracer();
    const start = performance.now();
    const requestedVoice = extractField(file, 'voice');
    const requestedFormat = extractField(file, 'format');

    return await tracer.startActiveSpan('message_roundtrip', async (parentSpan) => {
      try {
        const sessionId = extractField(file, 'sessionId') ?? `session-${Date.now()}`;
        parentSpan.setAttribute('session_id', sessionId);
        parentSpan.setAttribute('roundtrip.mode', 'voice');

        const promptField = extractField(file, 'prompt');
        let promptParsed;
        try {
          promptParsed = promptSchema.parse(promptField ? JSON.parse(promptField) : undefined);
        } catch (error) {
          reply.status(400);
          parentSpan.recordException(error as Error);
          parentSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid prompt payload' });
          return { error: 'Invalid prompt payload' };
        }

        const historyField = extractField(file, 'history');
        let history: AgentConversationMessage[] = [];
        if (historyField) {
          try {
            history = historySchema.parse(JSON.parse(historyField)) ?? [];
          } catch (error) {
            reply.status(400);
            parentSpan.recordException(error as Error);
            parentSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid history payload' });
            return { error: 'Invalid history payload' };
          }
        }

        const audioBuffer = await fileToBuffer(file);

        const asrResult = await tracer.startActiveSpan('asr_transcribe', async (span) => {
          try {
            span.setAttribute('audio.size_bytes', audioBuffer.length);
            span.setAttribute('audio.mimetype', file.mimetype ?? 'unknown');
            const result = await transcribeAudioBuffer(audioBuffer, file.filename ?? 'audio.wav', file.mimetype);
            span.setAttribute('asr.text_length', result.text.length);
            if (result.durationMs !== null) {
              span.setAttribute('asr.duration_ms', result.durationMs);
            }
            if (result.confidence !== null) {
              span.setAttribute('asr.confidence', result.confidence);
            }
            return result;
          } catch (error) {
            span.recordException(error as Error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
            throw error;
          } finally {
            span.end();
          }
        });

        const conversation: AgentConversationMessage[] = [...history, {
          role: 'user',
          content: asrResult.text
        }];

        let assistantText = '';
        let totalTokens = 0;

        await tracer.startActiveSpan('openai_chat', async (span) => {
          try {
            for await (const event of streamAgentResponse({
              sessionId,
              prompt: {
                id: promptParsed.id ?? `prompt-${sessionId}`,
                title: promptParsed.title ?? 'Voice Assistant',
                body: promptParsed.body,
                tags: promptParsed.tags ?? []
              },
              messages: conversation
            })) {
              if (event.type === 'assistant_token') {
                assistantText += event.token;
              } else if (event.type === 'assistant_done') {
                totalTokens = event.totalTokens;
              }
            }
            span.setAttribute('llm.output_length', assistantText.length);
            span.setAttribute('llm.total_tokens', totalTokens);
          } catch (error) {
            span.recordException(error as Error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
            throw error;
          } finally {
            span.end();
          }
        });

        const ttsResult = await tracer.startActiveSpan('tts_synthesize', async (span) => {
          try {
            const ttsStart = performance.now();
            const result = await synthesizeSpeech(assistantText, {
              voice: requestedVoice,
              format: requestedFormat
            });
            span.setAttribute('tts.output_size_bytes', result.audio.length);
            span.setAttribute('tts.output_format', result.format);
            span.setAttribute('tts.voice', result.voice);
            if (result.durationMs !== null) {
              span.setAttribute('tts.playback_duration_ms', result.durationMs);
            }
            span.setAttribute('tts.latency_ms', Math.round(performance.now() - ttsStart));
            return result;
          } catch (error) {
            span.recordException(error as Error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
            throw error;
          } finally {
            span.end();
          }
        });

        const totalDuration = Math.round(performance.now() - start);
        parentSpan.setAttribute('roundtrip.duration_ms', totalDuration);
        parentSpan.setAttribute('roundtrip.output_length', assistantText.length);
        parentSpan.setAttribute('roundtrip.tokens', totalTokens);
        parentSpan.setAttribute('roundtrip.voice', ttsResult.voice);
        if (ttsResult.durationMs !== null) {
          parentSpan.setAttribute('roundtrip.playback_duration_ms', ttsResult.durationMs);
        }

        return {
          trace_id: parentSpan.spanContext().traceId,
          sessionId,
          asr_text: asrResult.text,
          assistant_text: assistantText,
          metrics: {
            asr_duration_ms: asrResult.durationMs,
            roundtrip_duration_ms: totalDuration,
            llm_total_tokens: totalTokens,
            tts_duration_ms: ttsResult.durationMs
          },
          audio: {
            format: ttsResult.format,
            voice: ttsResult.voice,
            duration_ms: ttsResult.durationMs,
            base64: ttsResult.audio.toString('base64')
          }
        };
      } catch (error) {
        parentSpan.recordException(error as Error);
        parentSpan.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        logger.error({ error }, 'Voice roundtrip failed');
        reply.status(500);
        return { error: 'Failed to complete voice roundtrip' };
      } finally {
        parentSpan.end();
      }
    });
  });
}
