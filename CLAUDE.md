# RestReflect

Thin Electron wrapper that combines mind-render (engine) with deep-reflect (persona) into a privacy-first therapeutic reflection app.

## This repo

- `src/main.js` — 3-line entry point: sets persona + app name, delegates to mind-render
- `package.json` — Electron Forge project with mind-render and deep-reflect as git dependencies
- `forge.config.js` — packaging config (macOS zip)
- `docs/architecture.md` — data flow, privacy model, persona contract, voice integration

## Dependencies

- `mind-render` (npm, git dep) — Electron engine: chat UI, canvas, Ollama, voice I/O
- `deep-reflect` (npm, git dep) — CBT therapeutic persona with guardrails
- geno-voice (external service) — voice pipeline at localhost:5111, managed independently

## Sibling repos (in workspace)

- `../mind-render` — the engine
- `../deep-reflect` — the persona
- `../geno-voice` — the voice server
- `../phq-9000` — PHQ-9 iOS companion app

## Development

```bash
npm install
npm start          # launch in dev mode
npm run package    # build distributable
```

Requires Ollama running with `gemma4:e4b` pulled. Voice features require geno-voice at localhost:5111.
