# MindReflect Loop

Ship working features into the actual app. Test with real audio. Fix what's broken.

Invoke with: `/loop 25min LOOP.md`

---

## Architecture

```
MindReflect (npm start)
  ├─ Pipecat sidecar (Python, auto-spawned)
  │    ├─ PyAudio mic capture (system mic, no browser)
  │    ├─ Silero VAD (speech detection)
  │    ├─ MLX Whisper STT (transcription)
  │    ├─ NLP triggers (detect invitations, resignation, etc.)
  │    ├─ Turn-taking engine (decide: silent, cue, or speak)
  │    ├─ Full session WAV recording
  │    └─ WebSocket broadcast → Electron
  ├─ Voice server (geno-voice, FastAPI)
  │    ├─ Kokoro TTS (am_michael male voice)
  │    ├─ Session notes (Ollama background tool use)
  │    └─ /cue endpoint (backchannel WAVs)
  └─ Electron app (mind-render)
       ├─ WebSocket client ← sidecar
       ├─ Chat UI + markdown rendering
       ├─ Canvas particle engine
       ├─ Reflect persona (deep-reflect)
       └─ Ollama LLM (gemma4:e4b)
```

## Rules

1. **The app is the product.** Test it by running it and speaking into the mic.
2. **Test with real audio every iteration.** Either speak yourself or use the podcast test.
3. **Fix what's broken before building new things.**
4. **Don't stop the loop.** Only stop when the user says stop.
5. **Be honest about what works and what doesn't.**

## Testing

### Live test (best)
```bash
cd /Users/euge/code-red/mind-reflect-ws/MindReflect
npm start
# Speak into the mic. The sidecar auto-starts.
```

### Podcast test (automated, no mic needed)
```bash
cd /Users/euge/code-red/mind-reflect-ws/geno-voice
.venv/bin/python examples/podcast_test.py --start 120 --duration 60
```

### Batch podcast (build training data)
```bash
.venv/bin/python examples/batch_podcast.py
```

## Iteration

### 1. Launch
```bash
cd /Users/euge/code-red/mind-reflect-ws/MindReflect
pkill -9 -f 'Electron' 2>/dev/null
pkill -f 'pipecat_server' 2>/dev/null
npm start
```

### 2. Check sidecar is capturing
```bash
ls -lh ~/.mindreflect/sessions/*/recordings/full-session.wav
```
File should be growing. If not, sidecar didn't start.

### 3. Test
Speak into the mic, or run podcast test. Check:
- Speech detected? (sidecar logs "VAD: speaking started")
- Transcription accurate? (check sidecar stdout)
- Trigger detected? (invitation, resignation, etc.)
- Electron shows transcript? (WebSocket connected)
- LLM responds on trigger? (only when invited)
- Recording saved? (full-session.wav + chunk WAVs)

### 4. Fix what's wrong
Change code. After changing mind-render or deep-reflect:
```bash
cd /Users/euge/code-red/mind-reflect-ws/MindReflect
rm -rf node_modules package-lock.json && npm install
```

### 5. Commit and continue

## What's in the app

- Sidecar captures mic via PyAudio (no browser audio)
- Silero VAD detects speech
- MLX Whisper transcribes
- NLP triggers gate LLM responses (listen-first)
- Session WAV recording (continuous + per-chunk)
- Reflect persona (CBT/MI) via Ollama
- TTS responses (Kokoro, am_michael)
- Canvas emotional particles
- Crisis detection (988, Crisis Text Line)
- Markdown rendering
- Session export (Cmd+S)
- Session timer (20min check-in)

## Training data pipeline

6 Esther Perel episodes processed → 5,152 training examples (AnnoMI + podcast + safety). Fine-tuning config ready at `deep-reflect/data/finetune.py`.
