export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

interface FetchOptions extends RequestInit {
  json?: unknown;
}

export async function apiFetch<T>(input: string, init: FetchOptions = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, {
    ...init,
    credentials: 'include',
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body
  });

  const contentType = response.headers.get('Content-Type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json().catch(() => ({})) : await response.text();

  if (!response.ok) {
    const message = isJson && payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as Record<string, unknown>).error)
      : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, isJson ? payload : undefined);
  }

  return payload as T;
}
