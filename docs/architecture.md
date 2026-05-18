# Architecture

## Data Flow

```
User speaks
  → Microphone (Web Audio API, 48kHz → 16kHz WAV)
  → mind-render voice client (src/service/voice/voice.js)
  → HTTP POST to geno-voice /stt/transcribe (localhost:5111)
  → Whisper Large v3 Turbo (MLX, Apple Silicon Metal)
  → Transcribed text returned to mind-render

Transcribed text (or typed input)
  → mind-render chat handler (src/api.js)
  → deep-reflect guardrails.preProcess (crisis detection)
  → Ollama chat API (gemma4:e4b, local)
  → System prompt from deep-reflect persona
  → Streamed response with optional render blocks
  → deep-reflect guardrails.postProcess (safety disclaimers)
  → Chat UI + particle canvas visualization

Response text
  → mind-render voice client
  → HTTP POST to geno-voice /tts/synthesize (localhost:5111)
  → Kokoro TTS engine (24kHz WAV)
  → Audio playback via afplay (macOS)
```

## Privacy Model

All processing is local:

- **LLM inference**: Ollama runs locally, no API keys or cloud calls
- **Voice processing**: geno-voice runs on localhost, rejects non-local connections
- **Data storage**: Electron app data stays in `~/Library/Application Support/mind-render/`
- **No telemetry**: no analytics, no crash reporting, no phone-home

The system prompt explicitly claims only what is true: "local model, no remote API calls." Tests in deep-reflect enforce that the prompt does not overclaim (e.g., no "no logs" or "no cloud" claims).

## Persona Contract

mind-render defines a persona contract in `src/persona.js`. Any persona must export:

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `id` | string | yes | Stable slug for logging/title |
| `name` | string | yes | Human-readable name |
| `description` | string | yes | One-line description |
| `model` | string | yes | Ollama model tag |
| `systemPrompt` | string | yes | System message for conversation |
| `generation` | object | no | Ollama generation options (temperature, top_p, etc.) |
| `guardrails` | object | no | `preProcess(userMsg)` and `postProcess(assistantReply)` hooks |

deep-reflect implements this contract with CBT-grounded reflective listening, clinical boundaries (no diagnoses, no prescriptions), and crisis detection guardrails.

## Persona Loading

1. RestReflect sets `MIND_RENDER_PERSONA=deep-reflect` in `src/main.js`
2. mind-render's `persona.js:loadPersona()` reads the env var
3. Since the value doesn't start with `.`, it's passed directly to `require()`
4. `require('deep-reflect')` resolves to `node_modules/deep-reflect/runtime/index.js` via the root `package.json`
5. The persona object is validated against the contract

## Voice Integration

mind-render communicates with geno-voice via HTTP/WebSocket:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Server status |
| `/voices` | GET | List available TTS voices |
| `/config` | GET/POST | Read/update configuration |
| `/stt/transcribe` | POST | Transcribe WAV bytes to text |
| `/tts/synthesize` | POST | Synthesize text to WAV audio |
| `/tts/stream` | WebSocket | Stream TTS per-sentence |

The voice client enforces localhost-only connections (127.0.0.1 or localhost). Default voice server URL: `http://127.0.0.1:5111`.

## phq-9000 — Future Integration

phq-9000 is currently a standalone iOS app that administers the PHQ-9 depression screener with local SwiftData persistence. Future integration paths:

- **Score sharing**: phq-9000 exposes latest PHQ-9 score via local API (Bonjour/mDNS), mind-render reads it and injects into persona context ("Your last check-in showed moderate symptoms")
- **Trend awareness**: deep-reflect's persona could receive PHQ-9 score history as additional context for more informed reflective responses
- **Shared Ollama**: phq-9000 could use mind-render's Ollama instance for AI-assisted interpretation of score trends
