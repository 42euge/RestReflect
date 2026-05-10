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

### M1 — Listening-first voice loop

The core interaction is not a conversation — it's a listening session. The user opens the app and starts talking. The system listens for as long as the user needs. It doesn't interrupt or wait for a gap between sentences to jump in. It behaves like a good listener: present, nodding along, giving space.

**The model:**

1. **Always listening.** Mic is live from app launch. Continuous STT streams transcription into a growing buffer.
2. **Active listening cues.** While the user speaks, the system plays pre-computed affirmations at natural pause points — "mhmm," "okay," "I see," "go on." These are canned audio, not LLM-generated. They signal presence without interrupting flow.
3. **Short pause ≠ done.** A pause between sentences is normal. The system keeps listening and may offer a soft prompt ("how was that for you?") if the silence lingers but isn't long enough to be "done."
4. **Long pause = real response.** When the user is truly done (extended silence, maybe 5-10 seconds), the system sends the full accumulated transcript to Gemma and generates a real, thoughtful response. Then speaks it. Then returns to listening.
5. **The loop repeats.** After the companion responds, it goes back to step 1. The user can keep going or stay quiet.

**Implementation:**

- [x] geno-voice auto-discovery from MindReflect wrapper (detects sibling geno-voice repo)
- [ ] geno-voice auto-launch from mind-render (like Ollama) using MIND_RENDER_VOICE_COMMAND
- [ ] Always-listening mode: mic is live by default, continuous STT transcription
- [ ] Transcript buffer: accumulates everything the user says across short pauses
- [ ] Two-tier silence detection:
  - Short pause (1-3s): eligible for active listening cue ("mhmm", "okay")
  - Long pause (5-10s, configurable): triggers real LLM response
- [ ] Active listening cue bank: pre-recorded or pre-synthesized short affirmations
  - Varies cues to avoid repetition ("mhmm", "I see", "okay", "go on", "right")
  - Plays at natural sentence boundaries, not mid-thought
  - Optional soft prompts for medium pauses ("how was that for you?", "tell me more")
- [ ] LLM turn: full transcript buffer → Gemma → streamed TTS response → back to listening
- [ ] Sentence-level streaming TTS so the real response starts playing before it's fully generated
- [ ] Text input remains available as a fallback (type if you don't want to speak)
- [ ] Visual feedback: subtle ambient indicator when listening, distinct state when thinking/responding
- [ ] Graceful handling of background noise, false starts, and "never mind"

### M2 — Canvas as emotional mirror

The particle engine can render shapes from LLM output, but the persona doesn't use it yet. The canvas should reflect the conversation's emotional texture — not literal illustrations, but abstract resonance.

- [ ] deep-reflect persona emits render blocks based on emotional context
- [ ] Calm → slow-drifting constellations; tension → tight spirals; release → expanding scatter
- [ ] Canvas responds to voice tone/cadence (amplitude, pace) not just words
- [ ] Transitions between emotional states are smooth, never jarring
- [ ] User can toggle canvas off entirely (already possible via toolbar)

### M3 — Session structure

A good reflection has shape: arrival, exploration, and a gentle landing. Right now, conversations just start and end.

- [ ] Opening ritual: a brief grounding prompt ("What's on your mind?" or silence)
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
