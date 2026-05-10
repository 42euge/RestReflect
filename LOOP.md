# MindReflect Loop

Autonomous development loop. Each iteration: assess the project state, choose a mode (research, dev, or test), execute one unit of work, commit, and report.

Invoke with: `/loop 22min LOOP.md`

---

## Loop iteration

### 1. Assess

Read these files to understand current state:
- `VISION.md` — what's checked, what's next
- `AGENT-RESEARCH.md` — which research topics have deliverables, which are open
- Recent git log across all repos (MindReflect, mind-render, deep-reflect, geno-voice)
- Recent geno-notes journal entries (`/gt-notes list`) for context on what's been done

### 2. Choose mode

Pick ONE mode for this iteration based on what the project needs right now:

**RESEARCH** — when the next VISION.md item has open questions or no research deliverable yet.
- Is there a topic in AGENT-RESEARCH.md that blocks the next implementation item?
- Does the next feature require understanding something we haven't investigated?
- Follow [AGENT-RESEARCH.md](AGENT-RESEARCH.md) for methodology.

**DEV** — when research exists and the next VISION.md item is ready to build.
- Is there a research deliverable (`docs/research/<slug>/README.md`) for this feature?
- Are the dependencies clear — which repos need changes?
- Follow [AGENT-DEV.md](AGENT-DEV.md) for methodology.

**TEST** — when recent dev work hasn't been GUI-verified, or when regression testing is due.
- Were changes committed since the last GUI test?
- Did a dev iteration claim to finish a feature but not screenshot-verify it?
- Follow [AGENT-TEST.md](AGENT-TEST.md) for methodology.

**Priority order:** If multiple modes are valid, prefer:
1. **TEST** if there are unverified changes (don't build on untested ground)
2. **DEV** if research exists and something is ready to build
3. **RESEARCH** if the next item needs investigation first

### 3. Execute

Do ONE focused unit of work in the chosen mode:

- **RESEARCH:** Investigate one topic. Web search, read papers/repos, write findings to `docs/research/<slug>/README.md`. Journal via geno-notes. Compile wiki if enough material.
- **DEV:** Implement one VISION.md checklist item (or a meaningful chunk of one). Change code, test locally, commit across repos.
- **TEST:** Run the full test suite from AGENT-TEST.md. Screenshot, interact, verify. Fix issues found. Commit fixes.

One unit = something completable in ~15 minutes. Don't start something you can't finish in this iteration.

### 4. Record

- Commit all changes across all modified repos
- Update VISION.md if an item was completed (check it off)
- Journal what was done via `/gt-notes jot`
- Compile wiki if research findings were added: `/geno-notes-wiki-compile`

### 5. Report

End the iteration with a brief summary:
- **Mode:** research / dev / test
- **What was done:** one sentence
- **What's next:** what the next iteration should probably do
- **Blockers:** anything that needs human input before continuing
