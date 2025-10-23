import OpenAI from 'openai';
import { getConfig } from '../config.js';

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (client) {
    return client;
  }

  const config = getConfig();
  if (!config.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  client = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_API_BASE_URL
  });

  return client;
}
