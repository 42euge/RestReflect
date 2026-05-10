# MindReflect — Agent Dev Playbook

Build towards the [VISION.md](VISION.md) milestones. Pick the next unchecked item, implement it, and verify it works.

See also: [AGENT-RESEARCH.md](AGENT-RESEARCH.md) (investigate), [AGENT-TEST.md](AGENT-TEST.md) (verify), [LOOP.md](LOOP.md) (autonomous mode selection).

---

## How to use this file

1. **Read VISION.md** — find the current milestone and its first unchecked item.
2. **Check for research** — if `docs/research/<slug>/README.md` exists for the feature, read it first. Don't re-derive what's already been investigated.
3. **Understand the codebase** — this is a multi-repo workspace. Know which repo to change:

| Repo | What lives here | When to change it |
|------|----------------|-------------------|
| `MindReflect/` | Wrapper, config, docs, vision | App-level config, new env vars, docs |
| `../mind-render/` | Electron engine, UI, canvas, IPC | New features, UI changes, engine work |
| `../deep-reflect/` | Persona, system prompt, guardrails | Prompt changes, guardrail logic, persona contract |
| `../geno-voice/` | STT, TTS, VAD, FastAPI server | Voice pipeline changes, new endpoints, streaming |
| `../phq-9000/` | iOS PHQ-9 app | Assessment features, data sharing |

4. **Implement** — make changes across whichever repos are needed.
5. **Test via GUI** — don't just check that code compiles. Launch the app and verify the feature visually. See [AGENT-TEST.md](AGENT-TEST.md) for the GUI testing methodology.
6. **Journal your work** — use `/gt-notes` to record what you built, decisions made, and any open questions.
7. **Commit across all repos** — push changes to each repo that was modified. Update VISION.md to check off completed items.

---

## Dev workflow

### Starting the app

```bash
cd /Users/euge/code-red/mind-reflect-ws/MindReflect

# Kill any leftover processes
pkill -9 -f 'MindReflect/node_modules/electron/dist/Electron.app' || true

# If you changed mind-render or deep-reflect, reinstall
npm install github:42euge/mind-render  # only if mind-render changed
npm install github:42euge/deep-reflect  # only if deep-reflect changed

# Launch
npm start
```

### Key integration points

**Persona loading:** MindReflect sets `MIND_RENDER_PERSONA=deep-reflect` → mind-render's `src/persona.js:loadPersona()` calls `require('deep-reflect')` → returns persona object from `deep-reflect/runtime/index.js`.

**Voice server:** MindReflect sets `MIND_RENDER_VOICE_COMMAND` if geno-voice is found as a sibling → mind-render manages the voice server lifecycle. Voice client in `mind-render/src/service/voice/voice.js` talks to `http://127.0.0.1:5111`.

**App branding:** `MIND_RENDER_APP_NAME=MindReflect` flows into window title, loading screen, and dialogs via `getAppName()` in `mind-render/src/index.js` and `applyAppBranding()` in `mind-render/src/client.js`.

**Canvas rendering:** LLM responses containing ` ```render ``` ` blocks are parsed by `mind-render/src/client.js:extractAndRender()` and fed to the particle engine in `mind-render/src/engine.js`.

**Ollama:** `mind-render/src/service/ollama/ollama.js` — `OllamaOrchestrator` manages serving, model pulling, and streaming chat. Falls back to system-installed `ollama` binary.

### Committing across repos

When a feature touches multiple repos, commit each repo separately with a descriptive message. Push all repos. The order doesn't matter for development, but mind-render and deep-reflect must be pushed before MindReflect if MindReflect's `package.json` references a new commit.

```bash
# Example: feature touches mind-render and MindReflect
cd ../mind-render && git add -A && git commit -m "feat: add streaming STT support" && git push origin main
cd ../MindReflect && npm install github:42euge/mind-render && git add -A && git commit -m "feat: enable streaming STT in wrapper" && git push origin main
```

---

## Architecture notes

### Current state (src/main.js)

```
MindReflect entry point (src/main.js)
  ├─ Sets MIND_RENDER_PERSONA = "deep-reflect"
  ├─ Sets MIND_RENDER_APP_NAME = "MindReflect"
  ├─ Auto-discovers geno-voice in sibling directory
  ├─ Sets MIND_RENDER_VOICE_COMMAND if found
  └─ require("mind-render") — delegates everything
```

### Where new M1 components likely live

| Component | Likely repo | Rationale |
|-----------|------------|-----------|
| Compute monitor | mind-render | Core engine orchestration |
| Turn-taking engine | mind-render or new module | Decides when to respond |
| NLP trigger patterns | deep-reflect | Persona-specific patterns |
| Streaming STT | geno-voice | Voice pipeline concern |
| Background LLM tool use | mind-render + deep-reflect | Engine + persona contract |
| Active listening cue bank | deep-reflect | Persona-specific content |
| Session notes / wiki | mind-render + geno-notes | Engine writes, geno-notes stores |
