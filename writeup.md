# RestReflect: A Privacy-First Voice Companion for Therapeutic Reflection

## Subtitle
Reflect Mode mirrors back what you said before responding — a real-time reflective listening pipeline running Gemma 4 entirely on Apple Silicon with no cloud dependencies

---

## What RestReflect Is

RestReflect is a voice-first therapeutic reflection app built around a single idea: **mirror back what the user said before responding.** This is Reflect Mode — the system's core interaction. You speak, it listens via streaming Whisper STT, Gemma 4 concurrently analyzes your words for emotional content and themes, and then it speaks back a reflection — not an answer, but a paraphrase that makes you feel heard. "I keep trying but nothing changes" becomes "There's a part of you that hasn't given up, even though it's exhausting."

This implements reflective listening from motivational interviewing, where mirroring reduces defensiveness, externalizes thoughts for re-evaluation, and surfaces contradictions the speaker missed. Magill et al. (2018) found this technique correlates with client change talk at r = .55 — and Kumar et al. (2024) showed LLMs can generate these complex reflections with 88% clinician acceptability.

Everything runs locally: Gemma 4 for the LLM, Whisper for STT, Kokoro for TTS, and a 2200-particle visual canvas that mirrors the emotional texture of the conversation. No audio ever leaves your machine. People share things with a local system they'd never say to a cloud service — privacy isn't a feature, it's what makes the therapeutic interaction possible.

## Architecture

RestReflect is five repos working together:

- **RestReflect** — thin Electron orchestrator (3-line main.js)
- **Mind Render** — particle canvas engine with spring-physics animations, ambient drift, and spectrum-driven visualization
- **deep-reflect** — therapeutic persona implementing CBT and motivational interviewing via a structured system prompt with safety guardrails
- **geno-voice** — local voice pipeline: Whisper.cpp (STT), Kokoro (TTS), Silero (VAD), plus a custom turn-taking engine and emotional activation tracker
- **PHQ-9000** — validated depression screening (PHQ-9) as a local iOS companion

## How We Use Gemma 4

Gemma 4 e4b runs locally via Ollama on Apple Silicon. Three uses:

**1. Therapeutic conversation.** The persona prompt implements reflective listening — "paraphrase what you hear before responding" — drawing from motivational interviewing's OARS framework. Gemma 4's conversational quality handles nuanced emotional dialogue without cloud models.

**2. Background session analysis.** While the user speaks, a parallel Gemma 4 call runs `assess_moment` — analyzing transcript context to decide whether the system should stay silent, offer a brief reflection, or deliver a full response. This feeds into the multi-signal turn-taking engine.

**3. Native audio inference (experimental).** Gemma 4 e4b accepts audio natively, preserving paralinguistic cues (tone, hesitation, pace) that text-only pipelines discard. We discovered Ollama's Go sampler silently ignores repeat penalty parameters, causing severe repetition loops on audio >15s — 84.7% word error rate on 25-second passages. We implemented the fix (224 lines, [PR #15784](https://github.com/ollama/ollama/pull/15784)), but performance is too slow for real-time. Current approach: Whisper for live conversation, native audio for post-session analysis.

## What Makes This Different From Every Other Voice Agent

Every mainstream voice agent — ChatGPT, Gemini Live, Claude, Alexa+, Siri — follows the same loop: detect 300–500ms silence, assume the user is done, answer as fast as possible. RestReflect breaks this at every layer.

**Silence is the default.** Our turn-taking engine returns STAY_SILENT unless multiple independent signals agree otherwise. Base silence thresholds are 4–6 seconds (10× longer than standard agents), extending to +10s when the user is crying. Silence isn't latency — it's therapeutic space.

**Four-signal turn-taking.** We fuse NLP triggers (<1ms regex for "what do you think?" / "I don't know anymore..."), Smart Turn v2 confidence (intonation + pace analysis), emotional activation trajectory, and background LLM assessment. The fastest confident signal wins.

**Emotion changes behavior, not just tone.** A real-time activation tracker extracts pitch (F0), energy (RMS), and vocal tension (ZCR) from raw audio — pure numpy, <2ms/chunk, no ML. Dual-rate EMA tracks trajectory. When activation rises, silence thresholds extend. When the user is crying, the system adds 10 seconds before considering a response. Standard agents detect emotion and change their voice. RestReflect detects emotion and changes its behavior.

**Visual state machine.** The particle canvas communicates system state without sound. Ambient float = listening. Big crunch (particles collapse to singularity) = deep processing. Spectrum-driven disturbance (particles ripple to TTS frequency bands) = speaking. The canvas is the system's body language.

**Emotion wheel.** When the user can't name what they feel, particles rearrange into Plutchik's emotion wheel — rotatable, drillable from mild to intense. Selection feeds the named emotion to Gemma 4 as context. Affect labeling via fMRI research (Lieberman et al., 2007) reduces amygdala activation — the specificity itself is therapeutic.

## Challenges We Overcame

**Whisper hallucinations.** In always-listening mode, Whisper hallucinates on silence: "Thanks for watching," "[music]," repetitive loops. Built a dedicated filter with 8 regex patterns, filler detection, and a repetitiveness check.

**Backchannel triggering.** Pre-synthesized 63 cue clips ("mm-hmm," "I see") across 7 types × 3 variants × 3 voices. The triggering was unreliable — firing mid-sentence, on ambient noise, during contemplative pauses. Shelved pending better turn-boundary detection. Precomputed acknowledgments handle the latency gap instead.

**GPU contention.** Running Whisper + Gemma 4 + Kokoro concurrently on a single GPU. Solved by using the same model instance for chat and session analysis, avoiding context-switching overhead.

**The thinking-vs-waiting problem.** When the user is silent: are they processing (hold space) or waiting (respond)? A human therapist reads body language. We can't — audio only. Our NLP triggers, Smart Turn confidence, and activation trajectory help but fail in predictable ways. The visual state machine compensates: users read the canvas peripherally to know what the system is doing.

**Training data.** Calibrated 30+ NLP trigger patterns against 279 diarized examples from 6 Esther Perel therapy podcast episodes. Built the full diarization pipeline with speaker separation (resemblyzer + KMeans, no gated models).

## Why These Technical Choices

**Local-only:** Not a constraint — a therapeutic decision. Privacy changes what people say. Depth of disclosure correlates with outcomes. Removing the trust barrier changes the quality of the interaction.

**Gemma 4 e4b:** Open weights (auditable, fine-tunable), runs on Apple Silicon via Ollama's Metal backend, and quality sufficient for nuanced therapeutic dialogue. Fine-tuning via Unsloth with constitutional AI objectives to internalize safety in weights.

**Silence-first turn-taking:** Every other voice agent optimizes response speed. In therapy, interrupting someone processing an emotion is worse than making them wait. The safer default is silence.

**Particle canvas over chat UI:** Ambient visual feedback occupies peripheral attention without demanding focus. The visual metaphor (cosmic particles = thoughts, big crunch = concentration, big bang = release) maps naturally to the therapeutic process.
