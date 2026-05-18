# RestReflect: A Privacy-First Voice Companion for Therapeutic Reflection Using Local AI

**Abstract.** Mainstream AI voice assistants optimize for task completion speed — detecting silence, assuming the user is done, and generating an answer as fast as possible. This paradigm fails for therapeutic conversation, where silence is intentional, reflection precedes advice, and privacy determines what users are willing to say. We present RestReflect, a fully local voice companion for therapeutic reflection that runs entirely on Apple Silicon with no cloud dependencies. The system combines a multi-signal turn-taking engine that treats silence as therapeutic space, a reflective listening pipeline grounded in motivational interviewing (MI) and cognitive behavioral therapy (CBT), a real-time emotional activation tracker derived from audio features, and an ambient particle canvas that communicates system state through visual metaphor. All components — Whisper STT, Gemma 4 LLM, Kokoro TTS, Silero VAD, and a custom activation tracker — run on-device, ensuring that therapy-sensitive audio never leaves the user's machine. We describe the system architecture, the clinical grounding of our design decisions, the technical challenges encountered in building a silence-aware voice agent, and the novel visual interaction paradigms — including a particle-based emotion wheel for affect labeling and a visual state machine that uses cosmological metaphor (big bang, ambient drift, big crunch) to signal system state without breaking silence.

---

## 1. Introduction

There are things people cannot talk about — not to friends, not to family, not to anyone. The weight of carrying the unspeakable is itself a source of suffering. Traditional therapy, while effective, is inaccessible for most: constrained by cost, availability, and stigma. Even when accessible, some disclosures feel too raw to voice to another human.

AI-assisted mental health tools have emerged to fill this gap. Woebot, Wysa, and similar platforms deliver CBT-based interventions through text chatbots, and frontier voice agents like ChatGPT Advanced Voice Mode and Gemini Live now offer real-time spoken conversation with impressive latency. However, all existing approaches share a critical limitation: they require users to send their most sensitive thoughts to remote servers. This creates a privacy paradox — the population most in need of AI-assisted reflection (those dealing with trauma, shame, stigma, or trust issues) is precisely the population least likely to trust cloud services with their innermost thoughts.

Beyond privacy, mainstream voice agents are architecturally misaligned with therapeutic conversation. They detect silence for 300–500ms, assume the user has finished, and race to generate a response. No commercial voice agent produces reflective restatements before answering, holds therapeutic silence, or adjusts its behavior based on the user's emotional state. The optimization target is response speed, not felt understanding.

RestReflect addresses both problems simultaneously. It is a privacy-first reflection and mindfulness application where the entire AI pipeline runs on the user's device. It implements a therapeutic voice companion grounded in CBT and motivational interviewing, with a turn-taking engine that defaults to silence, an emotional activation tracker that adjusts system behavior (not just tone) based on audio features, and an ambient particle canvas that provides visual feedback without demanding attention.

**Research question.** Can a fully local, privacy-preserving AI system provide meaningful therapeutic reflection that users would trust with thoughts they would not share with any cloud service — while maintaining clinical safety and grounding?

## 2. Related Work

### 2.1 AI-Assisted Mental Health

Digital mental health interventions have progressed from Weizenbaum's ELIZA (1966) to evidence-based chatbots. **Woebot** delivers structured CBT exercises via text and has received FDA breakthrough device designation. **Wysa** combines CBT, DBT, and meditation techniques with clinician oversight. **Replika** provides an AI companion (not therapy-focused) but has faced privacy controversies that illustrate the cloud trust problem. All existing tools are cloud-hosted. RestReflect is, to our knowledge, the first fully local, privacy-by-design therapeutic AI system.

### 2.2 Voice Agents

Mainstream voice agents share five architectural commitments that make them unsuitable for therapeutic use:

1. **VAD-gated turn-taking.** Silence thresholds of 300–500ms treat every pause as a turn boundary. OpenAI's Semantic VAD is content-aware but still optimizes for speed, not therapeutic presence.

2. **Answer-first response.** Every user turn is treated as a prompt requiring an answer. No agent produces reflective restatements. ChatGPT AVM inserts filler tokens ("um," "hmm") to mask latency, but users report these as distracting rather than supportive [OpenAI Community Forum, 2025].

3. **Cloud inference.** ChatGPT and Gemini process audio on provider infrastructure. Claude voice routes through Anthropic servers and ElevenLabs for TTS. Apple's Private Cloud Compute handles complex Siri requests server-side. No system offers a fully local voice pipeline.

4. **Speed-optimized latency.** ChatGPT Realtime targets 250–800ms first-token audio; Gemini Live achieves 320–800ms. Silence is treated as dead time to eliminate.

5. **Passive affect detection.** GPT-4o and Gemini 2.5 detect emotional cues in prosody with approximately 85% sentiment accuracy, but this adjusts response *tone*, never response *behavior* — the system never decides to stay silent because the user is emotional.

### 2.3 Reflective Listening and AI

Reflective listening originates from Carl Rogers' person-centered therapy and is a foundational skill in Miller and Rollnick's Motivational Interviewing (MI), forming part of the OARS framework (Open questions, Affirmations, Reflections, Summaries). Magill et al. (2018) meta-analyzed 21 MI studies and found that therapist reflective listening correlated strongly with client change talk (*r* = .55, *p* < .001), with complex reflections predicting higher proportions of change talk. Kumar et al. (2024) demonstrated that GPT-4 can generate complex backward-looking reflections for an MI chatbot with 88% acceptability rated by independent clinicians. Arnold (2014) traces the theoretical foundations of reflective listening from Rogers through contemporary practice. RestReflect operationalizes these findings in a voice-first, local-only system.

### 2.4 Affect Labeling

Lieberman et al. (2007) showed via fMRI that verbally labeling an emotion decreases amygdala activation and engages prefrontal regulation circuits — an effect that operates even when participants are not explicitly trying to regulate emotion. Plutchik's (1980) wheel of emotions provides a structured taxonomy that scaffolds this labeling process. RestReflect implements affect labeling as an interactive visual intervention (Section 4.5).

## 3. System Architecture

RestReflect is a modular system with a thin orchestrator delegating to specialized components (Figure 1).

```
┌──────────────────────────────────────────────┐
│                  RestReflect                  │
│           Electron app (3-line main)          │
└──────────┬───────────────────┬───────────────┘
           │                   │
┌──────────▼──────┐  ┌────────▼────────┐
│   Mind Render    │  │   deep-reflect   │
│  Particle canvas │  │  Therapy persona │
│  Gemma 4/Ollama  │  │  CBT + MI + safety│
└──────────┬──────┘  └────────┬────────┘
           │                   │
┌──────────▼───────────────────▼───────────────┐
│                  geno-voice                   │
│  Whisper.cpp (STT) · Kokoro (TTS) · Silero   │
│  Turn-taking · Activation · NLP triggers      │
└──────────────────────────────────────────────┘
```

**Figure 1.** Component architecture. All components run on-device.

| Component | Role | Technology |
|-----------|------|------------|
| RestReflect | Orchestrator | Electron, Node.js |
| Mind Render | Visual canvas + LLM interface | Particle engine, Ollama |
| deep-reflect | Therapeutic persona + safety | System prompt, guardrails |
| geno-voice | Voice pipeline | Whisper.cpp, Kokoro, Silero VAD |
| PHQ-9000 | Self-assessment | PHQ-9 instrument (iOS) |

### 3.1 Model Selection

RestReflect uses Gemma 4 (e4b variant, 4B active parameters via mixture-of-experts) running locally via Ollama. Selection criteria: open weights (auditable, fine-tunable), local execution on consumer hardware via Metal backend, and conversational quality sufficient for nuanced therapeutic dialogue. Fine-tuning uses Unsloth with LoRA on curated therapeutic dialogue datasets, with constitutional AI objectives to internalize safety constraints in model weights rather than relying solely on system prompts.

### 3.2 Voice Pipeline

The voice pipeline is voice-first by design — typing disrupts reflective flow, and spoken interaction lowers the barrier to expression by enabling stream-of-consciousness disclosure.

- **STT:** Whisper.cpp with Metal acceleration. Audio is never serialized to a network request.
- **TTS:** Kokoro synthesis on localhost:5111. Multiple voices (af_heart, af_sarah, af_nova) for backchannel cue variety.
- **VAD:** Silero VAD for speech onset/offset detection.
- **Activation tracking:** Custom module extracting pitch (F0 via autocorrelation), energy (RMS), and vocal tension (ZCR) from raw PCM. Pure numpy, <2ms per chunk, no ML dependencies.

The full pipeline runs with WiFi off. No component has a network dependency.

## 4. Therapeutic Design

### 4.1 Clinical Framework

The persona is defined in a structured system prompt implementing:

**Motivational Interviewing (MI).** Reflective listening — mirroring the user's words back with clarity. Open-ended questions to explore ambivalence. Affirming autonomy and self-efficacy. Rolling with resistance rather than confronting.

**Cognitive Behavioral Therapy (CBT).** Identifying cognitive distortions (catastrophizing, black-and-white thinking). Guided reframing of negative thought patterns. Structured thought records adapted for voice interaction.

The persona is warm, non-judgmental, and grounded. It reflects thoughts back rather than giving advice, structures sessions with check-ins and grounding exercises, and never diagnoses or prescribes. The system prompt explicitly instructs: "Paraphrase what you hear before responding. Make the user feel heard before anything else."

### 4.2 Silence as Design

In every mainstream voice agent, silence is a failure state. RestReflect inverts this: silence is the system's primary therapeutic tool.

The turn-taking engine returns STAY_SILENT unless positive evidence — across multiple independent signals — says otherwise. This is a deliberate architectural choice, not a latency problem.

**Adaptive silence windows.** Thresholds expand based on detected emotional state:

| Condition | Backchannel | Response |
|-----------|-------------|----------|
| Baseline | 4.0s | 6.0s |
| Emotional content | 7.0s | 9.0s |
| User crying | 14.0s | 16.0s |
| Early session (first 2 min) | 6.0s | 8.0s |

These represent a 10–30× increase over standard voice agents' 300–500ms thresholds. The therapeutic rationale: self-completion (users continue unprompted, going deeper), emotional processing (premature acknowledgment short-circuits feeling), and safety signaling (comfortable silence communicates acceptance).

**Multi-signal turn-taking.** The engine fuses four independent signals through a tiered architecture:

| Tier | Signal | Latency | Detects |
|------|--------|---------|---------|
| 0 | Adaptive silence | real-time | Pause duration with emotional extension |
| 1 | Smart Turn v2 | ~50ms | Intonation, pace, filler words |
| 2 | NLP triggers | <1ms | 30+ patterns: invitations, resignation, questions, emotional peaks |
| 3 | LLM assessment | ~500ms | Semantic analysis of ambiguous moments |

The fastest confident signal wins. "I don't know anymore..." triggers the resignation pattern instantly via regex. A long pause after a monologue needs Smart Turn to distinguish thinking from done. Ambiguous cases escalate to background LLM assessment.

**The thinking-vs-waiting problem.** The fundamental challenge of silence-as-design: when the user is quiet, are they thinking (system should hold space) or waiting (system should respond)? A human therapist reads body language — posture, eye contact, breathing. RestReflect has only audio features and transcript history.

The system errs on the side of silence (interrupting processing is worse than making someone wait), with a 45-second gentle prompt as a safety net. The visual state machine (Section 4.4) provides a complementary solution by communicating system state visually.

### 4.3 Reflect Mode

To mirror back what someone said with voice, three things must happen concurrently: live STT producing usable text, live LLM analysis identifying themes and key phrases, and TTS synthesis of the reflection. The full pipeline must complete before silence becomes uncomfortable (~1–2 seconds).

**Whisper hallucination filtering.** In always-listening therapeutic mode, silence is frequent. Whisper produces artifacts on silence and noise — "Thanks for watching," "Subscribe," "[music]," and repetitive word loops. A dedicated filter uses 8 regex patterns for common hallucinations, filler-only detection, and a repetitiveness check (discard when unique words < 30% of total).

**Precomputed acknowledgments.** Simple responses ("I hear you," "Go on," "That sounds difficult") are pre-synthesized at startup across 7 cue types × 3 variants × 3 voices = 63 WAV clips. When TTS latency exceeds the comfort threshold, a precomputed clip plays immediately while the real response generates.

**Training data.** NLP trigger patterns were calibrated against 279 diarized examples extracted from 6 episodes of *Where Should We Begin* (Esther Perel), a real-world therapy podcast.

### 4.4 Visual State Machine

The particle canvas communicates system state without breaking silence — the digital equivalent of a therapist's body language.

**Three states:**

1. **Listening (ambient float).** Post-big-bang: 2200 particles drift in gentle Lissajous patterns, modulated by the activation tracker via `breathe(activation)`. Communicates: *I'm here. The space is yours.*

2. **Responding (spectrum disturbance).** When the agent speaks, TTS audio is routed through a Web Audio AnalyserNode. Frequency bands map to particle displacement vectors — low frequencies create broad, slow displacement; high frequencies produce tight jitter. The ambient float is *disturbed* by the agent's voice, then settles back when speech ends.

3. **Deep reflect (big crunch).** When preparing a substantive synthesis, all particles collapse inward to a singularity — the reverse of the big bang. This communicates: *I'm gathering everything together.* When the reflection is ready, a new big bang explodes outward and spectrum disturbance begins.

The visual channel operates below conscious attention. Users absorb state changes peripherally — a shift from floating to collapsing registers as "something is happening" without requiring the system to produce sound.

### 4.5 Emotion Wheel

An interactive Plutchik emotion wheel rendered as particle clusters on the canvas. Triggered when the user struggles to name their feeling (detected via NLP patterns like "I don't know what I'm feeling," "it's hard to describe").

Particles rearrange from ambient float into a circular wheel layout using the engine's spring physics (`setTargets()`). The user rotates via scroll/swipe; the currently-facing petal enlarges with its emotion label. Drilling into a petal reveals the intensity spectrum (e.g., apprehension → fear → terror). Selection dissolves the wheel back to ambient float and feeds the named emotion to the LLM as context.

This implements affect labeling (Lieberman et al., 2007) as a purely visual + gestural interaction — no typing required. The system offers the wheel rather than imposing it, and accepts non-selection as valid information.

### 4.6 Emotional Activation Tracking

Real-time emotional state is derived from raw audio features without ML dependencies:

- **Pitch (F0):** Autocorrelation-based fundamental frequency estimation
- **Energy (RMS):** Root mean square amplitude per chunk
- **Vocal tension (ZCR):** Zero-crossing rate as a proxy for breathiness vs. tension
- **Energy variance:** Windowed RMS standard deviation for detecting vocal instability

Features are z-scored against a per-session speaker baseline (calibrated from the first 5 audio chunks) and fused into a weighted activation score: 0.30 × RMS + 0.25 × F0 + 0.25 × F0_variance + 0.10 × ZCR + 0.10 × energy_variance, passed through a sigmoid. Dual-rate EMA (fast α = 0.3, slow α = 0.05) tracks trajectory; the difference between fast and slow EMA indicates whether activation is rising or falling.

This feeds three systems: turn-taking (threshold extension), the visual canvas (particle turbulence), and crying detection (high F0 variance + high energy variance simultaneously triggers +10s silence extension).

## 5. Privacy and Ethics

### 5.1 Privacy by Design

Privacy is an architectural property, not a policy promise.

| Aspect | Privacy by Policy | Privacy by Design |
|--------|-------------------|-------------------|
| Data location | Cloud servers | User's device only |
| Guarantee | Terms of service | No network calls in code |
| Trust model | Trust the company | Trust the code (auditable) |
| Breach risk | Data exists on servers | Data never leaves device |
| Subpoena risk | Company may be compelled | No data to compel |

No telemetry, no analytics, no crash reports. If local resources are insufficient, the app degrades gracefully rather than falling back to cloud services. The Electron app works with WiFi off.

### 5.2 Therapeutic Implications of Privacy

Privacy changes what people say. The difference between "your data goes to a server with a privacy policy" and "your data never leaves this machine" is behavioral, not just legal. In therapy, depth of disclosure correlates with therapeutic outcomes. Removing the trust barrier changes the quality of the interaction.

### 5.3 Safety Guardrails

**Multi-layer safety:**

1. **Crisis detection.** PHQ-9 item 9 (suicidal ideation) triggers immediate crisis protocol. Keyword and semantic detection for self-harm intent. Response: compassionate acknowledgment + 988 Suicide & Crisis Lifeline referral + grounding exercise.

2. **Session-level safety.** Grounding checks woven into conversation flow. Reality grounding to prevent unhealthy dependency. Session time awareness with gentle wind-down. Emotional escalation detection with de-escalation.

3. **Model-level safety.** Therapeutic constraints in system prompt. Fine-tuning with constitutional AI objectives. Safety should survive prompt injection attempts — not relying solely on prompting.

4. **Structural framing.** Positioned as a reflection tool, not therapy. Clear disclaimers. Open source: safety mechanisms are auditable. Design prevents harm rather than warning about it.

### 5.4 PHQ-9 Integration

PHQ-9000 implements the Patient Health Questionnaire-9 as a local self-assessment companion. Optional check-in at session close. Longitudinal score tracking shows trajectory. Positive response on item 9 (suicidal ideation) triggers the crisis protocol. All scores stored locally — no aggregation, no third-party reporting.

## 6. Technical Challenges

### 6.1 Native Audio Inference

Passing raw audio directly to Gemma 4 e4b preserves paralinguistic cues (tone, hesitation, pace) that a text-only ASR pipeline discards. However, Ollama's Go-native sampler silently ignores repeat_penalty, frequency_penalty, and presence_penalty parameters. On audio longer than 15 seconds, the model falls into severe repetition loops — 84.7% word error rate on 25-second passages vs. 0% on short sentences.

We implemented the missing penalties (224 lines, 6 files) matching llama.cpp's sampling_repetition_penalties algorithm (PR #15784). WER dropped to 30.6% on long passages. However, native audio inference causes significant system slowdown on Apple Silicon, making it unsuitable for interactive use.

**Resolution:** A hybrid pipeline — Whisper for real-time STT during the session, with raw audio saved for post-session analysis through native inference where latency is irrelevant and voice encoding is preserved.

### 6.2 Time to First Speech

The full pipeline (VAD → STT → LLM → TTS → playback) must complete within ~1–2 seconds. Precomputed acknowledgments provide sub-second perceived response while the full LLM reflection generates in the background.

Backchannel cues (63 pre-synthesized clips) were attempted but shelved — triggers fired during within-utterance pauses, on ambient noise, and during contemplative silences. Distinguishing "pause within a thought" from "pause inviting acknowledgment" requires pragmatic understanding that silence duration alone cannot provide.

### 6.3 GPU Contention

Running Whisper + Gemma 4 + Kokoro concurrently on a single Apple Silicon GPU creates contention. Using the same model (gemma4:e4b) for both chat and session notes analysis avoids GPU context-switching overhead, at the cost of serialized inference.

## 7. Evaluation Framework

We propose evaluation across six dimensions:

1. **Therapeutic quality.** Expert review of conversation transcripts against CBT/MI criteria. Does the system reflect accurately? Does it avoid harmful patterns?
2. **Safety.** Red-team testing of crisis detection sensitivity/specificity. Adversarial prompt testing.
3. **Privacy.** Network traffic analysis confirming zero outbound connections. Code audit.
4. **Voice quality.** End-to-end latency benchmarks. TTS naturalness ratings. STT word error rate.
5. **User experience.** Qualitative assessment of voice-first interaction, visual canvas utility, and trust calibration.
6. **Clinical outcome.** Longitudinal PHQ-9 score trajectories. Self-reported helpfulness. (Requires IRB-approved pilot.)

## 8. Limitations and Future Work

**Technical.** Hardware requirements (16–32GB RAM) limit accessibility. Local inference is slower than cloud APIs. Model quality lags frontier cloud models in nuanced conversation. GPU contention between pipeline components creates scheduling challenges.

**Clinical.** No clinical validation via controlled trials. No professional oversight or therapist-in-the-loop. CBT and MI are Western-centric frameworks that may not transfer across cultures. The system cannot handle severe mental illness, complex trauma, or crisis situations beyond routing to hotlines.

**Safety.** Local models may be more susceptible to jailbreaking than API-guarded models. Users may develop unhealthy reliance on an AI companion. The privacy guarantee may lead users to disclose more than is safe without professional support.

**Future directions.** Clinical pilot study with IRB approval. Expanded modalities (DBT, ACT, narrative therapy). Per-user silence adaptation learning individual pause patterns across sessions. Multimodal input (camera-based body language, with consent) to resolve the thinking-vs-waiting ambiguity. Wearable sensor integration (HRV, sleep) for physiological grounding. Smaller, more efficient models for broader hardware accessibility.

## 9. Conclusion

RestReflect demonstrates that a therapeutic voice companion can be built on a fundamentally different set of assumptions than mainstream voice agents. Where standard agents optimize for response speed, RestReflect optimizes for felt understanding. Where standard agents send audio to the cloud, RestReflect keeps everything local. Where standard agents treat silence as dead time, RestReflect treats it as the primary therapeutic tool.

The system is not a replacement for human therapy. It is a reflection tool for the space between sessions, for the things too raw to say to another person, and for the many people who will never access professional care. By solving the privacy problem architecturally rather than contractually, RestReflect removes the trust barrier that prevents the most vulnerable users from engaging with AI-assisted mental health support.

---

## References

Arnold, K. (2014). Behind the mirror: Reflective listening and its tain in the work of Carl Rogers. *The Humanistic Psychologist*, 42(4), 354–369.

Kroenke, K., Spitzer, R. L., & Williams, J. B. (2001). The PHQ-9: Validity of a brief depression severity measure. *Journal of General Internal Medicine*, 16(9), 606–613.

Kumar, A., et al. (2024). GPT-4 generated complex reflections for a motivational interviewing chatbot. *JMIR Mental Health*, 11, e57058.

Lieberman, M. D., et al. (2007). Putting feelings into words: Affect labeling disrupts amygdala activity in response to affective stimuli. *Psychological Science*, 18(5), 421–428.

Magill, M., et al. (2018). A meta-analysis of motivational interviewing process: Technical, relational, and conditional process models of change. *Journal of Consulting and Clinical Psychology*, 86(2), 140–157.

Miller, W. R., & Rollnick, S. (2013). *Motivational Interviewing: Helping People Change* (3rd ed.). Guilford Press.

Plutchik, R. (1980). A general psychoevolutionary theory of emotion. In R. Plutchik & H. Kellerman (Eds.), *Emotion: Theory, Research, and Experience* (Vol. 1, pp. 3–33). Academic Press.

Rogers, C. R. (1957). The necessary and sufficient conditions of therapeutic personality change. *Journal of Consulting Psychology*, 21(2), 95–103.

Weizenbaum, J. (1966). ELIZA — A computer program for the study of natural language communication between man and machine. *Communications of the ACM*, 9(1), 36–45.
