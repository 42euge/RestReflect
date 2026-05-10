# MindReflect Loop

Ship working features into the actual app. Each iteration: pick the highest-impact change to the user-facing product, implement it across whichever repos need it, launch the app, and verify it works in the GUI.

Invoke with: `/loop 25min LOOP.md`

---

## Rules

1. **The app is the product.** A module that isn't wired into the Electron app doesn't count. Don't check off VISION.md items based on component tests or simulations — only check them off when the user can see or use them in the running app.

2. **Launch and verify every iteration.** Every iteration that changes code must end with `npm start` from MindReflect, a screenshot, and visual confirmation. If you can't launch, fix that first.

3. **No research unless the code is blocked.** Don't escape into research when you should be writing integration code. Research is for when you genuinely don't know how to proceed, not when the work is hard.

4. **Fix what's broken before building new things.** If the app has errors (like STT 500s), fix those before adding features.

5. **Work across repos.** Most features touch multiple repos. Change mind-render, deep-reflect, geno-voice, and MindReflect in the same iteration if needed. Commit and push each one.

## Iteration

### 1. Launch the app

```bash
cd /Users/euge/code-red/mind-reflect-ws/MindReflect
pkill -9 -f 'Electron' 2>/dev/null; sleep 1
npm start 2>&1 &
# Wait for window
```

If it doesn't launch or has errors, fix those first. That IS the iteration.

### 2. Identify the biggest gap

Look at the running app. What's the most important thing that's missing or broken? Not what VISION.md says — what you can see with your eyes. Common gaps:

- Something is erroring (fix it)
- A feature exists in backend modules but isn't wired into the UI (wire it)
- The interaction model is wrong (change it)

### 3. Implement

Change the code. This usually means editing files in multiple repos:

- `mind-render/src/client.js` — renderer UI logic
- `mind-render/src/api.js` — IPC handlers
- `mind-render/src/index.js` — main process
- `mind-render/src/preload.js` — IPC bridge
- `mind-render/src/index.html` — HTML structure
- `mind-render/src/index.css` — styles
- `deep-reflect/runtime/` — persona, guardrails
- `geno-voice/server.py` — voice server endpoints
- `geno-voice/session/` — session modules
- `MindReflect/src/main.js` — wrapper config

After changing a dependency repo (mind-render, deep-reflect), update MindReflect:
```bash
npm install github:42euge/<repo>
```

### 4. Verify in the app

Relaunch, screenshot, confirm the change works visually. If it doesn't, fix it in the same iteration. Don't commit broken code.

### 5. Commit and report

Commit across all modified repos. Push. One sentence on what changed in the app.
