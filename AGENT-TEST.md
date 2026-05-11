# MindReflect — Agent Test Playbook

Test the running app. Not unit tests — the actual Electron app with real audio, real LLM responses, real user experience.

## Loopback testing

The primary test method: play TTS audio through the speakers so the app's always-listening mic captures it. Uses a female voice (af_heart) so it's distinct from the app's male response voice (am_michael).

```bash
# Prerequisites: MindReflect running + voice server at :5111
cd /Users/euge/code-red/mind-reflect-ws/geno-voice

# Run with default phrases
.venv/bin/python examples/loopback_test.py

# Run with custom phrase
.venv/bin/python examples/loopback_test.py "I feel stuck and I don't know what to do"
```

What to verify after loopback:
1. Transcribed text appears in the chat (not garbled/hallucinated)
2. Reflect persona responds (not generic assistant)
3. Response is spoken back in male voice (am_michael)
4. No feedback loop (app doesn't transcribe its own TTS)
5. Canvas renders particles on emotional responses
6. App returns to "listening" after response finishes

## Screenshot verification

```bash
screencapture -x /tmp/mr-test.png
# Then read the PNG to inspect visually
```

## Process management

```bash
# Kill everything
pkill -9 -f 'Electron' 2>/dev/null
pkill -f 'ollama serve' 2>/dev/null
pkill -f 'python.*server.py' 2>/dev/null

# Start voice server
cd /Users/euge/code-red/mind-reflect-ws/geno-voice
lsof -ti :5111 | xargs kill -9 2>/dev/null; sleep 1
.venv/bin/python server.py 2>&1 &

# Start app (from MindReflect dir!)
cd /Users/euge/code-red/mind-reflect-ws/MindReflect
npm start 2>&1 &
```

## Updating dependencies

When you change mind-render or deep-reflect, you MUST rebuild MindReflect:

```bash
cd /Users/euge/code-red/mind-reflect-ws/MindReflect
rm -rf node_modules/mind-render package-lock.json && npm install
```

`npm install github:42euge/mind-render` often doesn't update git deps. Delete and reinstall.

## Known issues to watch for

- **Whisper hallucinations**: repetitive text like "they used to apply they used to apply" — the client-side filter should catch these
- **Feedback loop**: app transcribes its own TTS output — the mute/unmute logic should prevent this
- **Echo cancellation**: currently OFF (kills real speech). Feedback prevention is via muting during response + 2s unmute delay
- **Persona not loading**: title shows "Mind Render" instead of "MindReflect · Reflect" — means npm install didn't pick up latest code

## Unit tests (secondary)

```bash
# geno-voice session modules: 89 tests
cd /Users/euge/code-red/mind-reflect-ws/geno-voice
.venv/bin/python -m pytest tests/ -v

# deep-reflect safety eval: 26 tests
cd /Users/euge/code-red/mind-reflect-ws/deep-reflect
python -m pytest tests/test_safety.py -v
```
