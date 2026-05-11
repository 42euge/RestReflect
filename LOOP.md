# MindReflect Loop

Ship working features into the actual app. Each iteration: launch the app, find what's broken or missing, fix it, verify with loopback test.

Invoke with: `/loop 25min LOOP.md`

---

## Rules

1. **The app is the product.** If you can't see it in the running Electron window, it doesn't exist. Don't check off items based on tests or simulations.

2. **Test with loopback every iteration.** After any code change:
   ```bash
   cd /Users/euge/code-red/mind-reflect-ws/geno-voice
   .venv/bin/python examples/loopback_test.py "test phrase here"
   ```
   Then screenshot and verify visually.

3. **Fix what's broken before building new things.** Hallucinations, feedback loops, wrong persona — fix first.

4. **Don't stop the loop.** Only stop when the user tells you to stop. Not when you think you're done.

5. **Be honest about what works and what doesn't.** If a module exists but isn't wired into the app, say that. Don't call it complete.

## Iteration

### 1. Launch and check

```bash
cd /Users/euge/code-red/mind-reflect-ws/MindReflect
pkill -9 -f 'Electron' 2>/dev/null; sleep 1
npm start 2>&1 &
```

### 2. Loopback test

```bash
cd /Users/euge/code-red/mind-reflect-ws/geno-voice
.venv/bin/python examples/loopback_test.py
```

### 3. Screenshot and evaluate

```bash
screencapture -x /tmp/mr-test.png
```

What to check:
- Did the speech get transcribed correctly? (not hallucinated)
- Did the Reflect persona respond? (not generic)
- Was the response spoken back? (TTS working)
- No feedback loop? (app didn't transcribe its own output)
- Canvas rendered? (particles visible)

### 4. Fix what's wrong

Change code across repos as needed. After changing mind-render or deep-reflect:
```bash
cd /Users/euge/code-red/mind-reflect-ws/MindReflect
rm -rf node_modules/mind-render package-lock.json && npm install
```

### 5. Commit and continue

Commit each repo. Push. Don't stop — go to step 1.

## What's actually working in the app

- Always-listening mic (ContinuousListener, browser-side VAD)
- Whisper transcription via geno-voice
- Reflect persona (CBT/MI) via Ollama
- TTS response via Kokoro (am_michael male voice)
- Canvas emotional render blocks
- Markdown rendering in chat
- Crisis detection guardrails
- Session export (Cmd+S)
- Opening message ("What's on your mind?")

## What's built but NOT in the app

- Turn-taking engine (geno-voice/session/turn_taking.py)
- Session notes / background processing (geno-voice/session/notes.py)
- Backchannel cue playback (geno-voice/session/cues/)
- Activation tracker (geno-voice/session/activation.py)
- Session timer (geno-voice/session/timer.py)
- NLP triggers (geno-voice/session/triggers.py)
- Compute monitor (geno-voice/session/compute.py)

These need to be wired into the Electron app to actually work.
