# MindReflect — Agent Test Playbook

Verify features against [VISION.md](VISION.md) using GUI-driven testing. Screenshot the app, interact via AppleScript, and confirm things work visually — not just that code compiles.

See also: [AGENT-DEV.md](AGENT-DEV.md) (build), [AGENT-RESEARCH.md](AGENT-RESEARCH.md) (investigate), [LOOP.md](LOOP.md) (autonomous mode selection).

---

## How to use this file

1. **Read VISION.md** — identify what to test (recently checked items, or items that should be checked).
2. **Launch the app** from a clean state.
3. **Interact and screenshot** — use AppleScript to drive the UI, `screencapture` to capture state, and read the PNGs to verify visually.
4. **Fix issues** — if something doesn't work, fix it (switch to dev mode), then re-test.
5. **Journal results** — use `/gt-notes` to record what passed, what failed, what was fixed.

---

## Test toolkit

### Process management

```bash
# Kill leftover Electron processes (always do this before a clean test)
pkill -9 -f 'MindReflect/node_modules/electron/dist/Electron.app' || true

# Kill Ollama if needed
pkill -f 'ollama serve' || true

# Verify nothing is running
ps aux | rg -i 'electron|ollama' | rg -v rg || echo "clean"
```

### Launch and wait

```bash
cd /Users/euge/code-red/mind-reflect-ws/MindReflect
npm start &

# Wait for window to appear
until osascript -e 'tell application "System Events" to tell application process "Electron" to get title of window 1' 2>/dev/null | grep -qi 'MindReflect'; do sleep 2; done
```

### Screenshot

```bash
# Full screen capture
screencapture -x /tmp/mindreflect-test.png

# Then read the PNG to inspect visually
```

### Window inspection

```bash
# Get window title
osascript -e 'tell application "System Events" to tell application process "Electron" to get {name of every window, title of every window}'

# Get window size/position
osascript -e 'tell application "System Events" to tell application process "Electron" to get {position of window 1, size of window 1}'
```

### UI interaction via AppleScript

```bash
# Activate the window
osascript -e 'tell application "Electron" to activate'

# Type text into the chat input
osascript -e 'tell application "Electron" to activate' -e 'delay 0.2' -e 'tell application "System Events" to keystroke "Hello, how are you?"'

# Press Enter to send
osascript -e 'tell application "System Events" to key code 36'

# Toggle DevTools
osascript -e 'tell application "System Events" to keystroke "i" using {command down, option down}'

# Close DevTools (same toggle)
osascript -e 'tell application "System Events" to keystroke "i" using {command down, option down}'

# Click a button by position (x, y from top-left of screen)
osascript -e 'tell application "System Events" to click at {x, y}'
```

### Service health checks

```bash
# Ollama running?
curl -sS http://127.0.0.1:11434/api/tags 2>/dev/null | head -c 200 || echo "Ollama not running"

# geno-voice running?
curl -sS http://127.0.0.1:5111/health 2>/dev/null || echo "geno-voice not running"

# What model is loaded?
curl -sS http://127.0.0.1:11434/api/tags 2>/dev/null | python3 -c "import sys,json; [print(m['name']) for m in json.load(sys.stdin).get('models',[])]" 2>/dev/null || true
```

---

## Test patterns

### Smoke test (run after any change)

1. Kill all processes, launch fresh
2. Screenshot loading screen — verify it says "MindReflect" not "Mind Render"
3. Wait for chat screen
4. Screenshot — verify window title is "MindReflect · Reflect · gemma4:e4b"
5. Type a message, press enter
6. Wait 10s for response
7. Screenshot — verify response appeared in chat
8. Kill processes

### Voice test (when geno-voice is running)

1. Start geno-voice: `cd ../geno-voice && python3 server.py &`
2. Wait for health: `until curl -sS http://127.0.0.1:5111/health 2>/dev/null; do sleep 1; done`
3. Launch MindReflect
4. Verify voice server status in settings view
5. Test TTS by enabling speaker toggle and sending a message
6. Kill processes

### Regression test

After any change, verify ALL of these still work:
- [ ] App launches with correct branding
- [ ] Persona loads (check terminal output for "persona loaded: reflect")
- [ ] Ollama starts and loads model
- [ ] Chat input works
- [ ] LLM responds
- [ ] Canvas toggle works
- [ ] Settings view opens and closes
- [ ] Voice server URL is configurable

---

## Cleanup

Always clean up after testing:

```bash
pkill -9 -f 'MindReflect/node_modules/electron/dist/Electron.app' || true
pkill -f 'ollama serve' || true  # only if we started it
pkill -f 'python3 server.py' || true  # only if we started geno-voice
rm -f /tmp/mindreflect-test*.png
```
