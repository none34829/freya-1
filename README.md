# Freya Agent Console

Freya is a production-ready agent console built with Next.js 15, React 19, TanStack Query, and a Fastify back end. It streams LLM responses token-by-token, keeps metrics/logs, and optionally hosts a LiveKit voice assistant.

---

## Setup

### Local (pnpm workspace)

```bash
pnpm install
cp .env.example .env                 # fill in OpenAI & LiveKit secrets
pnpm --filter app dev                # Next.js console (http://localhost:3000)
pnpm --filter agent dev              # REST agent (http://localhost:4001)
pnpm --filter agent download-files  # grab LiveKit turn-detector assets
pnpm --filter agent dev:agent        # (optional) LiveKit voice worker
```

Run the first two terminals for chat. Launch `dev:agent` whenever you need live voice locally.

### Docker (one line)

```bash
docker compose build
docker compose up
```

Containers:

- `web` - Next.js console at <http://localhost:3000>
- `agent` - Fastify API and streaming responder (<http://localhost:4001/health>)
- `agent-voice` - LiveKit worker; downloads models automatically and stays registered

Data (`PERSIST_DB_URL=file:./data/freya.db`) is persisted to `./data` via bind mounts.

---

## Design Notes

- **App Router**: `/login` issues a JWT cookie for lightweight auth; `/console` renders the UI and fetches via `/api/*`. Token streams are delivered over SSE (`/api/stream/sessions/[id]/events`).
- **Fastify agent**: handles `/respond` streaming, metrics, logs, and LiveKit token issuance. Async generators keep token streaming simple.
- **Session store**: JSON/SQLite file for local/Docker ease. Swappable with Postgres in production.
- **Observability**: `/api/metrics` exposes avg first-token latency, tokens/sec, error rate; `/api/logs` streams structured log lines from the agent.

---

## Tradeoffs & Next Steps

1. Persistence would move to a managed database plus migrations for multi-user support.
2. Streaming reconnection uses exponential backoff only; production would add jitter, circuit breaking, and agent container probes.
3. Secrets currently live in `.env`; deploys should integrate a secrets manager (Vault, Doppler, AWS SSM).
4. Voice worker logs to stdout; centralize via a logging sink and add readiness checks.
5. Rate limiting is in-memory; a redis-backed store would support horizontal scaling.

---

## API Overview

| Method | Route | Notes |
| --- | --- | --- |
| GET/POST | `/api/auth/dev-login`, `/api/auth/logout` | Lightweight developer auth (JWT cookie). |
| GET/POST | `/api/prompts`, `/api/prompts/[id]` | Prompt CRUD (in-memory). |
| GET/POST | `/api/sessions` | List/create sessions. |
| GET | `/api/sessions/[id]` | Session detail (includes prompt). |
| GET/POST | `/api/sessions/[id]/messages` | Message history / append user message. |
| GET | `/api/stream/sessions/[id]/events` | SSE stream of assistant tokens. |
| GET | `/api/metrics` | Aggregate latency, throughput, error rate. |
| GET | `/api/logs` | Latest structured agent logs. |
| POST | `/api/livekit/token` | Issue LiveKit room token w/ prompt metadata. |
| GET | `/api/health` | Web health check (used by Docker). |
| Agent | `POST /respond`, `GET /health` | Streaming responder + health. |

---

## Tests

### Backend Tests (pnpm --filter app test -- backend)
- **Metrics Aggregator** (`metrics.test.ts`): Tests mean latency, throughput, and error rate calculations with isolated state resets.
- **Rate Limiting** (`rate-limit.test.ts`): Verifies limit enforcement and window reset using fake timers.
- **Streaming Generator** (`agent-client.test.ts`): Tests streamAgentCompletion, including fallback to local generator when remote agent is unavailable and emitting degraded events on fetch failures.
- **Token Rate Calculation** (`session-store.test.ts`): Validates token rate computation during message finalization, handling of unknown messages, and error recording for assistant messages.

### Frontend Tests (pnpm --filter app test -- chat-pane)                                                         
- **chat-pane.test.tsx** – React Testing Library suite covering two scenarios:                               
  1. Simulates sending a message and asserts streamed tokens render in order.                                  
  2. Verifies auto-scroll pauses while hovering the message list and resumes afterward.

`pnpm --filter app build` runs lint + type checks (Next.js build), and Docker builds do the same.

---

## 🔹 Bonus: Working APIs

### 1. `/api/tts/synthesize` – Text-to-Speech

**Method:** `POST http://localhost:4001/api/tts/synthesize`

* Converts text into spoken audio using OpenAI’s TTS model (`gpt-4o-mini-tts`).
* Accepts JSON payload with a single `"text"` field.
* Returns an MP3 file.

**Example (PowerShell):**

```powershell
Invoke-WebRequest `
  -Uri http://localhost:4001/api/tts/synthesize `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body '{"text":"Hello from Freya"}' `
  -OutFile reply.mp3
```

---

### 2. `/api/asr/transcribe` – Speech-to-Text

**Method:** `POST http://localhost:4001/api/asr/transcribe`

* Accepts `multipart/form-data` with an audio file.
* Transcribes user speech to text using `ASR_MODEL=whisper-1`.
* Returns recognized text, duration, and confidence.

**Example:**

```bash
curl -X POST http://localhost:4001/api/asr/transcribe \
  -F "file=@Recording.mp3"
```

---

### 3. `/api/messages/roundtrip` – Full Voice Roundtrip (ASR → LLM → TTS)

**Method:** `POST http://localhost:4001/api/messages/roundtrip`

* Accepts a voice clip and runs the full pipeline:
  speech → transcription → model reply → speech synthesis.
* Returns:

  * transcribed user text
  * generated assistant reply
  * base64-encoded MP3 of the reply
  * timing and token metrics
  * a `trace_id` for OpenTelemetry tracking

**Example:**

```bash
curl -X POST http://localhost:4001/api/messages/roundtrip \
  -F "audio_file=@Recording.mp3" \
  -F "sessionId=session-001" \
  -F "voice=alloy" -o response.json
```

---

### ✅ Summary

| API                           | Purpose                         | Output                                             |
| ----------------------------- | ------------------------------- | -------------------------------------------------- |
| **`/api/tts/synthesize`**     | Text → Audio                    | MP3 speech output                                  |
| **`/api/asr/transcribe`**     | Audio → Text                    | Transcript, duration, confidence                   |
| **`/api/messages/roundtrip`** | Audio → Text → Response → Audio | Transcript, reply, metrics, base64 MP3, `trace_id` |

These three endpoints form the complete, working voice interaction stack for the Freya Agent.
