# MindReflect — Agent Research Playbook

Open research topics that support the [VISION.md](VISION.md) milestones. Each topic is self-contained — an agent can pick one up cold, investigate, and produce a deliverable.

See also: [AGENT-DEV.md](AGENT-DEV.md) (build), [AGENT-TEST.md](AGENT-TEST.md) (verify), [LOOP.md](LOOP.md) (autonomous mode selection).

---

## How to use this file

**For agents:** Pick a topic, do the research, and produce TWO outputs:

1. **Research doc** at `docs/research/<slug>/README.md` — sources, findings, recommendations
2. **Wiki entries** via geno-notes — use `/gt-notes` to journal findings and `/geno-notes-wiki-compile` to compile into wiki pages. This feeds the project's knowledge base and keeps research discoverable across sessions.

When journaling research via geno-notes:
- `add task "Research: <topic title>"` to track the work
- Journal timestamped findings as you go: `jot "R1 turn-taking: found Skantze 2021 — proposes a probabilistic model for end-of-turn prediction using prosodic features + syntax"`
- When done, compile the wiki: it synthesizes journal entries into linked topic pages

**For humans:** Add new topics as questions emerge from implementation. Mark topics `[done]` when research is complete and findings are written up. Link the deliverable.

---

## R1 — Turn-taking in human conversation

**Supports:** M1 (turn-taking engine)
**Slug:** `turn-taking`

The turn-taking engine needs to decide: stay silent, play a cue, or speak. Humans do this effortlessly. How?

**Research questions:**
- What are the acoustic and linguistic cues humans use to signal turn boundaries? (falling intonation, syntactic completion, gaze, gesture — we only have audio)
- What pause durations distinguish "thinking pause" from "I'm done"? Does this vary by emotional state?
- How do backchannels ("mhmm", "right") interact with turn-taking? Do they extend or interrupt the speaker's turn?
- What computational models exist for real-time turn-taking prediction? (Skantze 2021, Roddy et al., Meena/Switchboard work)
- What open-source implementations exist?

**Where to start:**
- Gabriel Skantze's work on turn-taking in spoken dialogue systems
- Switchboard corpus analysis (Jurafsky et al.)
- Google Meena / LaMDA turn-taking papers
- "Timing in Turn-Taking and Its Implications for Processing Models of Language" (Levinson & Torreira 2015)
- Search: "end-of-turn detection", "voice activity detection turn-taking", "backchanneling prediction"
- Repos: look for real-time turn-taking implementations in Python/JS

**Deliverable:** Summary of models, recommended approach for MindReflect (what signals to use, what thresholds, what architecture), pointers to reusable code.

---

## R2 — Backchanneling and active listening cues

**Supports:** M1 (dynamic active listening cues)
**Slug:** `backchanneling`

The system needs to produce "mhmm", "I see", "go on" at natural moments. When exactly? What makes a backchannel feel natural vs. robotic?

**Research questions:**
- When do human listeners produce backchannels? What triggers them? (prosodic cues, syntactic boundaries, semantic completion)
- What's the timing? How soon after a pause does a backchannel feel natural vs. rushed vs. late?
- What's the repertoire? How many distinct cues does a listener need to feel natural? What's the distribution?
- How do backchannels differ in therapeutic/counseling contexts vs. casual conversation?
- Can backchannels be predicted from audio features alone (pitch, energy, pause) without full transcription?
- What's the state of the art for backchannel prediction models?

**Where to start:**
- "Backchannel prediction" literature (Ruede et al. 2017, Ortega et al.)
- Counseling/therapy conversation analysis (motivational interviewing transcripts)
- IEMOCAP, DAIC-WOZ datasets (if they contain backchannel annotations)
- Search: "backchannel prediction real-time", "listener response generation", "minimal encouragers therapy"
- Carl Rogers' active listening — the clinical foundation for what we're building

**Deliverable:** Timing model for when to inject cues, recommended cue bank with distribution weights, whether audio-only prediction is viable or if we need transcript context.

---

## R3 — Streaming chunked STT architecture

**Supports:** M1 (continuous chunked STT)
**Slug:** `streaming-stt`

Whisper transcribes audio but it's designed for batch processing. We need continuous streaming with chunk boundaries that don't split words.

**Research questions:**
- What chunk sizes work for Whisper? (2s? 5s? 10s?) What's the latency/accuracy tradeoff?
- How to handle word boundaries across chunks? (overlap? VAD-guided segmentation?)
- What's the state of streaming Whisper implementations? (whisper-streaming, faster-whisper, whisper.cpp streaming mode)
- How does MLX Whisper (our current engine) handle streaming vs. batch?
- Can we do speculative/incremental transcription (show partial results, refine)?
- What's the memory/compute profile for continuous transcription on Apple Silicon?

**Where to start:**
- `whisper-streaming` repo (Macháček et al.)
- `faster-whisper` with VAD-based segmentation
- whisper.cpp streaming examples
- MLX Whisper documentation and source
- Search: "streaming speech recognition whisper", "online ASR chunking", "incremental speech recognition"

**Deliverable:** Recommended chunking strategy for MLX Whisper, latency benchmarks on Apple Silicon, code snippets or POC for continuous transcription with our geno-voice stack.

---

## R4 — Compute monitor / resource orchestration

**Supports:** M1 (compute monitor)
**Slug:** `compute-monitor`

Three resources (STT, LLM, TTS) need to run in parallel with intelligent scheduling. When one is idle, another should be working.

**Research questions:**
- What scheduling patterns exist for real-time multi-resource AI pipelines?
- How do voice assistants (Siri, Alexa, Google) orchestrate STT/NLU/TTS? Any public architecture docs?
- What's the right abstraction? Event loop? Priority queue? Actor model?
- How to handle preemption? (user starts talking while TTS is playing → stop TTS, resume STT)
- What's the compute budget on a single Apple Silicon Mac running Whisper + Gemma 4 + Kokoro simultaneously?
- Can we overlap Ollama inference with Whisper inference on the same GPU, or do they fight for Metal?

**Where to start:**
- Rasa architecture docs (dialogue management pipeline)
- LiveKit / Daily.co real-time AI voice agent architectures
- Pipecat (open-source voice AI framework)
- Search: "real-time voice AI pipeline architecture", "streaming AI agent orchestration"
- Apple Metal documentation on concurrent compute

**Deliverable:** Recommended architecture for the compute monitor, resource contention analysis for Apple Silicon, comparison of existing frameworks we could build on vs. rolling our own.

---

## R5 — NLP trigger patterns for conversational cues

**Supports:** M1 (turn-taking signal sources)
**Slug:** `nlp-triggers`

Fast pattern matching to detect when the user is inviting a response, expressing resignation, or at an emotional peak — without waiting for the LLM.

**Research questions:**
- What linguistic patterns reliably signal "your turn"? Compile a taxonomy.
- What patterns signal emotional resignation or surrender? ("I don't know", "it is what it is", "whatever")
- What patterns signal the user wants validation vs. advice vs. space?
- Can we use simple regex/keyword matching, or do we need a small classifier?
- What about cross-cultural and cross-linguistic variation? (English-first, but design for extensibility)
- How do these patterns map to motivational interviewing "change talk" vs. "sustain talk"?

**Where to start:**
- Motivational interviewing coding manuals (MITI, MISC) — they classify client utterances
- Dialogue act tagging literature (Stolcke et al., SWBD-DAMSL)
- Search: "dialogue act detection real-time", "turn-yielding cues linguistics", "change talk detection"
- Therapy transcript corpora with annotations

**Deliverable:** Pattern bank (regex + examples) organized by signal type, recommended architecture (regex tier + optional small classifier tier), mapping to turn-taking engine actions.

---

## R6 — Emotional state from voice (audio features)

**Supports:** M1 (emotional trajectory), M2 (canvas as emotional mirror)
**Slug:** `voice-emotion`

The canvas should respond to emotional texture, and the turn-taking engine needs emotional trajectory as an input. What can we extract from audio without cloud APIs?

**Research questions:**
- What audio features correlate with emotional state? (pitch, energy, speech rate, pause patterns, jitter, shimmer)
- What's achievable with simple feature extraction (librosa, pyaudio) vs. a trained model?
- What on-device emotion recognition models exist? (SpeechBrain, Hugging Face models that run locally)
- How reliable is voice emotion detection? What's the false positive rate? Should we use it as a soft signal only?
- Can we track emotional *trajectory* (getting more tense, calming down) rather than absolute state?
- What's the privacy story? (all local, but users should know their voice is being analyzed)

**Where to start:**
- IEMOCAP, RAVDESS datasets and benchmarks
- SpeechBrain emotion recognition recipes
- openSMILE feature extraction toolkit
- Search: "speech emotion recognition on-device", "affective computing voice", "emotional prosody features"
- librosa documentation for pitch/energy extraction

**Deliverable:** Recommended approach (simple features vs. model), what emotional dimensions we can reliably track, how to represent trajectory over time, privacy considerations.

---

## R7 — LLM-wiki pattern for live session notes [done]

**Supports:** M1 (background LLM tool use)
**Slug:** `session-wiki`
**Deliverable:** [docs/research/session-wiki/README.md](docs/research/session-wiki/README.md)

The LLM should be building structured notes while the user speaks — verbatim transcript, cleaned version, running summary, wiki entries. How to do this incrementally from chunked input?

**Research questions:**
- How does the llm-wiki pattern (Karpathy) work? How to adapt it for streaming input?
- What's the right chunking for incremental summarization? (per-sentence? per-paragraph? per-topic-shift?)
- How to detect topic shifts in a stream of transcribed speech?
- What tool-use patterns work for "process this chunk and update your notes"?
- How to handle corrections? (user says something, then "no wait, I mean...")
- What's the Ollama tool-use API for Gemma 4? Structured output?

**Where to start:**
- Karpathy's llm-wiki pattern / blog posts
- geno-notes wiki-compile skill (already in the ecosystem, `geno-notes-wiki-compile`)
- Ollama tool-use / function-calling documentation for Gemma 4
- Search: "incremental summarization streaming", "topic segmentation speech", "dialogue summarization"
- Meeting notes AI tools (Otter.ai, Fireflies) — what do they produce?

**Deliverable:** Schema for session notes (verbatim, clean, summary, wiki), incremental update strategy, tool-use prompt design for Gemma 4, integration plan with geno-notes.

---

## R8 — Therapeutic dialogue and reflective listening

**Supports:** M1 (response quality), M5 (fine-tuning data)
**Slug:** `therapeutic-dialogue`

deep-reflect's system prompt implements CBT + motivational interviewing. How good is the current approach? What does the literature say about AI in reflective listening?

**Research questions:**
- What makes a reflective response "good"? (MI fidelity, MITI coding, empathy scales)
- What existing AI therapy/coaching tools exist and how are they evaluated? (Woebot, Wysa, Replika)
- What datasets of therapeutic dialogue exist? (anonymized, ethically sourced)
- What are the known failure modes of LLM-based reflective listening? (over-validation, false empathy, advice-giving when not asked)
- How do clinicians evaluate AI companions? What metrics matter?
- What does the clinical/legal line look like between "helpful reflection" and "practicing therapy"?

**Where to start:**
- Woebot Health publications (Fitzpatrick et al. 2017)
- "Can AI Provide CBT?" literature reviews
- MITI (Motivational Interviewing Treatment Integrity) coding manual
- Search: "AI mental health companion evaluation", "LLM therapeutic dialogue safety"
- APA / ethical guidelines for AI in mental health support

**Deliverable:** Evaluation framework for deep-reflect's responses, dataset sources for fine-tuning, known pitfalls and how to test for them, legal/ethical boundaries summary.

---

## R9 — Real-time voice AI frameworks

**Supports:** M1 (overall architecture)
**Slug:** `voice-ai-frameworks`

Before building everything from scratch, what existing frameworks solve parts of this problem?

**Research questions:**
- What open-source real-time voice AI frameworks exist? (Pipecat, LiveKit Agents, Vocode, Retell)
- Which ones run fully local (no cloud dependency)?
- How do they handle turn-taking, backchanneling, interruption?
- Could we use one as the backbone and plug in our STT/LLM/TTS?
- What are the tradeoffs of adopting a framework vs. building on our current geno-voice + mind-render stack?
- Licensing compatibility with MIT?

**Where to start:**
- Pipecat (Daily.co) — open-source voice AI framework
- LiveKit Agents — real-time AI agent framework
- Vocode — open-source voice AI
- Retell AI — voice agent platform (check if local mode exists)
- Search: "open source voice ai agent framework", "local voice assistant framework python"

**Deliverable:** Comparison table (framework, local support, turn-taking, license, integration effort), recommendation on build vs. adopt.

---

## R10 — PHQ-9 in AI systems

**Supports:** M4 (PHQ-9 integration)
**Slug:** `phq9-ai-integration`

How should validated clinical instruments like the PHQ-9 be used (and not used) in AI companion systems?

**Research questions:**
- How is the PHQ-9 validated? What are its sensitivity/specificity characteristics?
- What are the ethical guidelines for using PHQ-9 scores in non-clinical AI systems?
- How do existing apps (Woebot, Wysa) integrate standardized assessments?
- What's the right way to surface score context to an AI companion without creating liability?
- How to handle item 9 (suicidal ideation) responsibly in an automated system?
- What local data-sharing protocols work between iOS and macOS? (Bonjour/mDNS, Bluetooth LE, shared iCloud container)

**Where to start:**
- Kroenke et al. 2001 (original PHQ-9 validation paper)
- Woebot / Wysa clinical validation studies
- Apple HealthKit mental health data sharing capabilities
- Search: "PHQ-9 digital mental health", "validated screener AI integration", "item 9 suicidal ideation automated"

**Deliverable:** Guidelines for how MindReflect should consume PHQ-9 scores, item 9 safety protocol, recommended data-sharing mechanism between iOS and macOS, what NOT to do.

---

## R11 — Particle visualization for emotional state

**Supports:** M2 (canvas as emotional mirror)
**Slug:** `emotional-canvas`

The particle engine exists. How to map emotional dimensions to visual parameters in a way that feels ambient and resonant, not literal?

**Research questions:**
- What research exists on abstract visualization for emotional states? (affective computing + generative art)
- What visual parameters map to emotional dimensions? (speed → arousal, color temperature → valence, density → intensity?)
- How do existing meditation/mindfulness apps use abstract visuals? (Calm, Headspace, Endel)
- What makes a visualization feel "ambient" vs. "distracting"?
- How to handle transitions between emotional states smoothly?
- What's the right update rate? (every second? every sentence? every topic shift?)

**Where to start:**
- Russell's circumplex model of affect (valence × arousal)
- Endel (adaptive soundscapes + visuals) — design philosophy
- Processing.org / p5.js generative art community
- Search: "affective visualization", "generative art emotion", "ambient display emotional state"
- Casey Reas, Ben Fry — generative aesthetics literature

**Deliverable:** Mapping from emotional dimensions to particle engine parameters (shape, speed, density, color, spread), transition model, reference implementations or inspirations.

---

## Adding new topics

When a new question emerges from implementation, add it here with:

```markdown
## RN — Title

**Supports:** which milestone
**Slug:** `kebab-case-slug`

One paragraph framing the question.

**Research questions:** (bullet list)
**Where to start:** (papers, repos, search terms)
**Deliverable:** what the agent should produce
```
