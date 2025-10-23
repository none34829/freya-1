import { z } from "zod";

export const promptCreateSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(5000),
  tags: z.array(z.string().min(1)).max(10)
});

export const promptUpdateSchema = promptCreateSchema;

export const promptQuerySchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional()
});

export const sessionCreateSchema = z.object({
  promptId: z.string().uuid(),
  mode: z.enum(["chat", "voice", "hybrid"]).default("chat")
});

export const messageCreateSchema = z.object({
  text: z.string().optional(),
  audioUrl: z.string().url().optional(),
  audioDurationMs: z.coerce.number().int().positive().optional()
});

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(10)
});
