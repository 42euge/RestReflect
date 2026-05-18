# RestReflect — Agent Dev Playbook

Build features into the running Electron app. A module that isn't wired into the app doesn't count.

## The app today

RestReflect is an always-listening voice reflection app:
- Opens with "What's on your mind?"
- Mic is live from launch (ContinuousListener in voice.js)
- Browser-side VAD detects speech (RMS > 0.02 for 200ms+)
- Whisper (MLX) transcribes on 1.5s silence
- Reflect persona (CBT/MI) responds via Ollama gemma4:e4b
- Response spoken back via Kokoro TTS (am_michael, male voice)
- Canvas renders emotional particles via postProcess guardrails
- Crisis detection surfaces 988/Crisis Text Line
- Session export via Cmd+S

## Repos and what lives where

| Repo | What | Key files |
|------|------|-----------|
| `RestReflect/` | Wrapper + config | `src/main.js` (3 lines + voice discovery) |
| `mind-render/` | Electron engine | `src/client.js` (renderer), `src/voice.js` (ContinuousListener, VoiceRecorder), `src/api.js` (IPC), `src/index.js` (main process) |
| `deep-reflect/` | Persona + guardrails | `runtime/index.js` (persona), `runtime/safety.js` (crisis), `runtime/canvas.js` (render blocks), `runtime/phq9.js` (score injection) |
| `geno-voice/` | Voice server + session modules | `server.py` (FastAPI), `session/` (8 modules, 89 tests) |

## Dev workflow

1. Change code in the relevant repo(s)
2. Commit and push each repo
3. If you changed mind-render or deep-reflect:
   ```bash
   cd /Users/euge/code-red/rest-reflect-ws/RestReflect
   rm -rf node_modules/mind-render package-lock.json && npm install
   ```
4. Kill and relaunch: `pkill -9 -f 'Electron'; npm start`
5. Test with loopback: `cd ../geno-voice && .venv/bin/python examples/loopback_test.py`
6. Screenshot and verify

## Current problems to fix

- **Whisper hallucinations on ambient noise** — client-side filter exists but threshold tuning needed
- **Feedback loop risk** — mute/unmute during TTS works but 2s delay is a guess
- **No backchannel cues playing** — 63 WAV clips exist in geno-voice/session/cues/ but aren't wired into the Electron app
- **Turn-taking engine not integrated** — exists in geno-voice/session/ but the Electron app doesn't use it
- **Session notes not running** — SessionNoteProcessor exists but isn't called from the Electron app
- **Activation tracker not feeding canvas** — /activation endpoint exists but renderer doesn't poll it

## What's NOT in the app yet (despite being "built")

These modules exist in geno-voice/session/ with tests passing but are NOT wired into the Electron app:

| Module | Status | What's needed |
|--------|--------|---------------|
| `turn_taking.py` | 12 tests pass | Wire into client.js decision flow |
| `notes.py` | Tested with Ollama | Run as background process from Electron |
| `activation.py` | 6 tests pass | Poll /activation endpoint, feed to canvas |
| `compute.py` | 6 tests pass | Track pipeline state in renderer |
| `timer.py` | 9 tests pass | Show timer in UI, trigger check-ins |
| `triggers.py` | 21 tests pass | Run on transcriptions before submitting |
| `generate_cues.py` | 63 clips generated | Play clips on turn-taking cue decisions |
