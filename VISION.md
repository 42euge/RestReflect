# MindReflect Vision

A private space to think out loud — voice, visuals, and a companion that listens well.

## What it is

MindReflect is a local-only reflection app. You talk or type, a local AI companion reflects back, and a canvas responds with abstract visuals. Nothing leaves your device. Not therapy — a thinking tool for when you need to process something difficult and can't or won't say it to another person.

## Where we are now

The wrapper works. Three lines of code connect mind-render (the engine) to deep-reflect (the persona), and the app launches as MindReflect with the Reflect persona loaded. The foundation:

- [x] Chat with text input and streamed LLM responses
- [x] Particle canvas visualization from render blocks
- [x] Voice I/O controls (mic button, TTS toggle, voice/speed settings)
- [x] Local Ollama serving (gemma4:e4b, auto-start)
- [x] CBT-grounded system prompt with clinical guardrails
- [x] Configurable branding for wrapped apps
- [x] "running locally" trust indicator

## Where we're going

### M1 — Streaming listen-and-process pipeline

This is a space for the user to speak. The system's job is to listen, process continuously, and respond only when it has something worth saying — briefly. It does not wait for the user to finish before working. It does not give long-winded answers. Everything streams, everything chunks, compute is always busy.

**The model:**

The system is three resources running in parallel — STT, LLM, TTS — orchestrated by a compute monitor that maximizes utilization at all times.

```
┌─────────────────────────────────────────────────────────┐
│                   Compute Monitor                        │
│       Orchestrates all resources, maximizes utilization   │
└────┬──────────────┬──────────────┬──────────────────────┘
     │              │              │
┌────▼────┐   ┌─────▼──────┐  ┌───▼─────┐
│   STT   │   │    LLM     │  │   TTS   │
│ Whisper  │   │   Gemma    │  │ Kokoro  │
│          │   │            │  │         │
│ Chunked  │   │ Background │  │ Pre-gen │
│ transcr. │──▶│ processing │─▶│ cues +  │
│          │   │ + tool use │  │ replies │
└────┬─────┘   └─────▲──────┘  └─────────┘
     │               │
┌────▼───────────────┴───────────────────┐
│          Turn-Taking Engine             │
│                                         │
│ NLP triggers ("what do you think?")     │
│ Silence duration (short / long)         │
│ Emotional trajectory (from LLM bg)      │
│ Conversation state                      │
│                                         │
│ → stay silent | play cue | speak        │
└─────────────────────────────────────────┘
```

1. **STT streams continuously.** Mic is live. Whisper transcribes in chunks as the user speaks — not waiting for silence, not batching. Each chunk feeds immediately into the pipeline.

2. **LLM processes live, in the background.** As STT chunks arrive, the LLM is already working — not to generate a spoken response, but to:
   - Write down verbatim what the user said
   - Clean up and structure the transcript
   - Summarize emerging themes
   - Build wiki entries (llm-wiki pattern)
   - Track emotional texture for canvas
   - Identify if/when a brief spoken response would actually help

3. **Multiple signals feed the turn-taking engine.** The system doesn't rely on any single heuristic to decide when to respond. NLP pattern matching is one fast signal (detects "what do you think?", trailing "yeah idk, it's just hard"). But the LLM's own background assessment is another — it's been processing the transcript live and may recognize a moment that calls for a response without any explicit invitation. Silence duration is another. Emotional trajectory is another. The turn-taking engine weighs all of these.

4. **Spoken responses match the moment.** The system mostly listens. When it does speak, the length matches what's needed — usually brief (a reflection, a question), but sometimes long when the user has opened a door that calls for a real, substantive response. The default is silence, not verbosity. But the system has the full range.

5. **Active listening cues are dynamic.** "Mhmm," "I see," "go on" — but contextually chosen by the LLM (not random), pre-synthesized by TTS during idle cycles, and played at natural boundaries. The system sounds present, not mechanical.

5. **Compute monitor keeps everything busy.** When STT is idle (silence), the LLM uses that time for deeper processing (summarize, wiki). When the LLM is idle, TTS pre-synthesizes the next likely cue. No resource sits waiting.

**Implementation:**

- [x] geno-voice auto-discovery from MindReflect wrapper (detects sibling geno-voice repo)
- [x] geno-voice auto-launch from mind-render (like Ollama) using MIND_RENDER_VOICE_COMMAND
- [ ] Always-listening mode: mic live by default, continuous chunked STT
- [ ] Compute monitor: orchestrates STT/LLM/TTS resources, schedules work by priority
- [x] Streaming transcript pipeline:
  - STT chunk → append to running transcript
  - Each chunk triggers background LLM processing
  - LLM outputs: verbatim log, cleaned transcript, running summary, wiki entries
- [x] Background LLM tool use while user speaks:
  - `write_verbatim` — raw transcript as spoken
  - `write_clean` — structured, readable version
  - `summarize` — running themes, updated with each chunk
  - `wiki_update` — llm-wiki entries from emerging topics
  - `assess_moment` — should the system speak now? (usually: no)
- [x] Turn-taking signal sources (all feed into the engine):
  - **NLP triggers** (fast, no LLM): "what do you think?", "yeah idk", "it's just hard"
  - **LLM background assessment**: `assess_moment` tool output from live processing
  - **Silence duration**: short pause vs. long pause vs. extended silence
  - **Emotional trajectory**: intensity shifts detected from transcript and audio amplitude
  - **Conversation state**: how long since system last spoke, how much user has said
  - Any signal can trigger a response — NLP is the fastest, LLM assessment is the richest
- [x] Dynamic active listening cues:
  - LLM selects contextually appropriate cue (not random)
  - TTS pre-synthesizes cues during idle cycles
  - Played at natural sentence boundaries
- [x] Turn-taking engine: decides when and how the system should respond
  - Inputs: NLP triggers, silence duration, emotional trajectory, conversation state
  - Outputs: action type (stay silent, play cue, speak briefly, speak at length)
  - Default bias toward silence — this is the user's space
  - But has the full range: a brief "tell me more" or a substantive multi-sentence reflection
  - LLM already has full context from background processing, so responses are fast when called
- [ ] Sentence-level streaming TTS for spoken responses
- [x] Text input as fallback (type if you don't want to speak)
- [ ] Visual feedback: ambient indicator for listening state, processing state
- [ ] Graceful handling of background noise, false starts

### M2 — Canvas as emotional mirror

The particle engine can render shapes from LLM output, but the persona doesn't use it yet. The canvas should reflect the conversation's emotional texture — not literal illustrations, but abstract resonance.

- [ ] deep-reflect persona emits render blocks based on emotional context
- [ ] Calm → slow-drifting constellations; tension → tight spirals; release → expanding scatter
- [ ] Canvas responds to voice tone/cadence (amplitude, pace) not just words
- [ ] Transitions between emotional states are smooth, never jarring
- [ ] User can toggle canvas off entirely (already possible via toolbar)

### M3 — Session structure

A good reflection has shape: arrival, exploration, and a gentle landing. Right now, conversations just start and end.

- [x] Opening ritual: a brief grounding prompt ("What's on your mind?" or silence)
- [ ] Closing ritual: summarize themes, offer a takeaway thought, gentle ending
- [ ] Session timer (optional, non-intrusive) to prevent doom-spiraling
- [ ] Session export: save conversation as local markdown with timestamp
- [ ] No cross-session memory by default (privacy) — but opt-in "journal" mode that saves themes

### M4 — PHQ-9 integration

phq-9000 tracks depression scores over time. MindReflect should be aware of that context without violating the "not a therapist" boundary.

- [ ] Local API between phq-9000 (iOS) and MindReflect (macOS) via Bonjour/mDNS
- [ ] Persona receives latest PHQ-9 score as soft context ("recent self-assessment suggests moderate symptoms")
- [ ] Score trends inform gentle nudges ("You mentioned things have been harder lately — is that still true?")
- [ ] Never display scores in the MindReflect UI — that's phq-9000's job
- [ ] Referral-to-human guardrail if scores consistently indicate severe range

### M5 — Fine-tuned Reflect model

gemma4:e4b is general-purpose. A fine-tuned model would internalize the CBT/MI approach rather than relying on a long system prompt.

- [ ] Curate training data: anonymized therapeutic dialog examples, MI transcripts
- [ ] Fine-tune with Unsloth (already a dependency in deep-reflect)
- [ ] Eval suite: does the model still respect clinical boundaries without the system prompt?
- [ ] A/B testing: base model + system prompt vs. fine-tuned model
- [ ] Reduce system prompt to safety-only once the model internalizes the approach

## Principles

**Privacy is structural, not policy.** Local model, local voice, local storage. The system prompt doesn't claim "no cloud" — it claims "no remote API calls," which is true and verifiable. Tests enforce that the prompt doesn't overclaim.

**Not therapy.** A reflective companion that helps you think, not a replacement for professional help. The persona knows its scope and names the boundary honestly when it's reached.

**Warm, not performative.** No "I hear you and that's valid" on repeat. No toxic positivity. Sitting with a hard feeling is more useful than fixing it.

**Canvas is ambient, not illustrative.** The visuals are abstract and felt, not literal. They should feel like looking at moving water while thinking — present but not demanding attention.

**Listening first, responding second.** The system's primary job is to listen, not to talk. It holds space while the user processes out loud. Pre-computed "mhmm" and "I see" cues signal presence without demanding attention. The LLM only speaks when the user is truly done — after a long, real silence. No buttons, no interruptions. It should feel like someone is in the room with you, sitting quietly, paying attention.
