import { apiFetch } from './api-client';
import type { Prompt, Session, Message, LogLine, SessionMetrics } from './types';

export interface DevLoginResponse {
  user: {
    id: string;
    name: string;
    role: string;
  };
}

export async function devLogin(name?: string): Promise<DevLoginResponse> {
  return apiFetch<DevLoginResponse>('/api/auth/dev-login', {
    method: 'POST',
    json: name ? { name } : {}
  });
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}

export async function fetchPrompts(params: { search?: string; tag?: string } = {}): Promise<{ prompts: Prompt[] }> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.tag) query.set('tag', params.tag);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiFetch(`/api/prompts${suffix}`);
}

export async function createPrompt(payload: { title: string; body: string; tags: string[] }): Promise<Prompt> {
  return apiFetch<Prompt>('/api/prompts', { method: 'POST', json: payload });
}

export async function updatePrompt(id: string, payload: { title: string; body: string; tags: string[] }): Promise<Prompt> {
  return apiFetch<Prompt>(`/api/prompts/${id}`, { method: 'PUT', json: payload });
}

export async function deletePrompt(id: string): Promise<void> {
  await apiFetch(`/api/prompts/${id}`, { method: 'DELETE' });
}

export async function createSession(payload: { promptId: string; mode: 'chat' | 'voice' | 'hybrid' }): Promise<Session> {
  return apiFetch<Session>('/api/sessions', { method: 'POST', json: payload });
}

export async function fetchSessions(limit = 10): Promise<{ sessions: Session[] }> {
  return apiFetch(`/api/sessions?limit=${limit}`);
}

export async function fetchSession(sessionId: string): Promise<{ session: Session & { metrics: SessionMetrics } }> {
  return apiFetch(`/api/sessions/${sessionId}`);
}

export async function fetchSessionMessages(sessionId: string): Promise<{ messages: Message[] }> {
  return apiFetch(`/api/sessions/${sessionId}/messages`);
}

export async function sendSessionMessage(
  sessionId: string,
  payload: { text?: string; audioUrl?: string; audioDurationMs?: number }
): Promise<{ message: Message }> {
  return apiFetch(`/api/sessions/${sessionId}/messages`, { method: 'POST', json: payload });
}

export async function fetchMetrics(): Promise<SessionMetrics> {
  return apiFetch('/api/metrics');
}

export async function fetchLogs(limit = 20): Promise<{ logs: LogLine[] }> {
  return apiFetch(`/api/logs?limit=${limit}`);
}

export interface SynthesizeSpeechOptions {
  voice?: string;
  format?: string;
}

export async function synthesizeSpeech(
  text: string,
  options: SynthesizeSpeechOptions = {}
): Promise<{ blob: Blob; mimeType: string }> {
  const payload = {
    text,
    ...(options.voice ? { voice: options.voice } : {}),
    ...(options.format ? { format: options.format } : {})
  };

  const response = await fetch("/api/tts/synthesize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const data = (await response.json()) as { error?: string; detail?: string };
      detail = data.error ?? data.detail;
    } catch {
      detail = undefined;
    }

    throw new Error(detail ?? `TTS request failed (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const mimeType = response.headers.get("content-type") ?? "audio/mpeg";
  return {
    blob: new Blob([arrayBuffer], { type: mimeType }),
    mimeType
  };
}
