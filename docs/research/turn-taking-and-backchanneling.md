# Turn-Taking and Backchanneling for a Listening-First Voice AI

## Research Date: 2026-05-09

## Context

MindReflect is a listening-first reflection/mindfulness app. Users talk for extended periods (2-5 minutes). The system needs a turn-taking engine that decides: stay silent (default), play a backchannel cue ("mhmm", "I see"), or generate a full LLM response. The app is closer to a therapist listening to a client than a chatbot. Pauses are often contemplation, not turn-endings.

Current stack: Pipecat (voice AI framework) with Smart Turn v2/v3 for end-of-turn detection, Silero VAD, mlx-whisper for STT, Ollama for LLM inference, all local/private.

---

## Part 1: Human Turn-Taking Signals

### 1.1 How Humans Signal Turn Boundaries

Turn-taking in conversation is governed by a set of cues identified by Sacks, Schegloff, and Jefferson (1974) in their foundational work on conversation analysis. Speakers construct their turns from **Turn Construction Units (TCUs)** -- sentential, clausal, phrasal, or lexical units -- each ending at a **Transition Relevance Place (TRP)** where speaker change becomes possible.

Listeners predict the end of a TCU using four types of cues:

| Cue type | Signal | Example |
|---|---|---|
| **Syntactic** | Grammatical completion of a clause/sentence | "I think that's what happened." |
| **Prosodic** | Falling pitch, final-syllable lengthening, drop in intensity | Terminal falling intonation on last word |
| **Pragmatic** | Speech act completion -- listener has heard enough to know the action | A complete question, a finished story |
| **Visual** | Gaze shift toward listener, gesture completion | Speaker looks up at listener after a statement |

**Key prosodic signals for end-of-turn:**

- **Falling terminal pitch**: The most reliable acoustic signal that a speaker is yielding the floor. A final pitch contour that falls to the speaker's baseline.
- **Final syllable lengthening**: In English, speakers lengthen the final syllable when yielding. (Note: in Japanese, lengthening signals turn-holding -- this is language-specific.)
- **Intensity drop**: Speakers lower their vocal intensity when approaching a turn boundary.
- **Pitch flattening**: Reduced pitch variation in the final portion of an utterance.

**Turn-holding signals** (speaker wants to continue):

- Rising or level terminal pitch (continuation intonation)
- Filled pauses ("um", "uh") -- explicitly signal "I'm not done"
- Mid-clause syntax (incomplete grammatical structure)
- Inhalation followed by continuation
- Increasing tempo before a pause

### 1.2 Thinking Pause vs. "Your Turn" Pause

This is the central challenge for MindReflect. Research does not provide a single clean threshold, but offers converging evidence:

**Duration alone is insufficient.** While longer pauses correlate with turn-yielding, a 2-second pause mid-thought and a 2-second pause at the end of a statement are different animals. Context matters enormously.

**Distinguishing features:**

| Feature | Thinking pause (hold) | Yielding pause (shift) |
|---|---|---|
| Preceding prosody | Level/rising pitch, mid-clause | Falling pitch, clause-final |
| Syntactic completeness | Incomplete structure | Complete clause/sentence |
| Gaze (in person) | Averted (looking away, inward) | Toward listener |
| Breathing | Often no preparatory breath | May involve exhalation/settling |
| Filled pauses | Often preceded by "um", "uh" | Clean silence |
| Duration | Typically 0.5-3s | Typically >1s, but overlaps with thinking |

**Typical durations in conversation:**

- Average gap between turns in casual conversation: **~200ms** (Levinson & Torreira, 2015)
- Cross-linguistic median: **0-300ms** for question-answer pairs (Stivers et al., 2009)
- "Noticeable" silence in casual conversation: **>1 second**
- Therapeutic silences: **3-30+ seconds** (see section 1.3)

The 200ms figure is remarkable -- it means listeners begin preparing their response *before* the speaker finishes, based on predictive cues. This "anticipatory planning" is a fundamental feature of human turn-taking.

### 1.3 Turn-Taking in Therapeutic Contexts

Therapy represents a fundamentally different turn-taking regime from casual conversation. The asymmetry is intentional: the therapist's job is to create space, not fill it.

**Key differences from casual conversation:**

| Dimension | Casual conversation | Therapeutic conversation |
|---|---|---|
| Target gap | ~200ms | Variable, often 2-10s+ |
| Silence tolerance | >1s feels awkward | Silence is a tool, not a failure |
| Default speaker | Neither (balanced) | Client (therapist defaults to listening) |
| Overlap | Common, signals engagement | Rare, may signal interruption |
| Backchannel rate | High (every 5-15s) | Lower, more deliberate |

**Therapeutic silence research:**

- Pauses of **>3 seconds** are classified as "therapeutic silences" in research methodology (Levitt, 2001).
- Three categories identified: **productive** (client connecting with emotions, deepening), **obstructive** (client defending against emotions), and **neutral** (natural speech pauses).
- Higher rates of productive silence correlate with positive therapeutic outcomes.
- In studied therapies, ~26% of session time was "obstructive" silence, ~5.4% was "productive" silence.
- In psychotherapy, there is a **preference for gaps and pauses** while immediate responses are dispreferred -- the opposite of casual conversation.
- Therapists were more connectional during silences in later sessions vs. first sessions (alliance-dependent).

**Carl Rogers' person-centered therapy model:**

Rogers' approach is directly relevant to MindReflect's design philosophy. The three core conditions:

1. **Unconditional positive regard**: Accepting without judgment. For an AI: no corrective or evaluative responses.
2. **Empathic understanding**: Reflecting back what the client communicates. For an AI: reflections, not interpretations.
3. **Congruence/genuineness**: Being authentic. For an AI: not pretending to be human, being transparent about its nature.

The therapist's role is to provide a space conducive to uncensored self-exploration. The client leads; the therapist follows. Reflective listening -- paraphrasing the feeling behind what the client says rather than the content -- is the primary verbal tool.

**Motivational Interviewing (MI) timing:**

MI uses the OARS framework (Open questions, Affirmations, Reflective listening, Summarizing). Key timing principles:

- Open questions are used to get the client talking, then the counselor steps back.
- Reflections are offered when the counselor detects a key statement worth amplifying.
- Summaries are used at natural transition points (after a topic, after a personal experience, near session end).
- The counselor's primary posture is listening. Interjections serve the client's exploration, not the counselor's agenda.

---

## Part 2: Computational Models for Turn-Taking

### 2.1 The Landscape

End-of-turn detection has evolved from simple silence timers to ML models operating on multiple signal types:

| Approach | Signals used | Latency | Accuracy | Example |
|---|---|---|---|---|
| **Silence timer** | VAD only (is speech happening?) | Fixed (e.g., 700ms) | Poor (many false positives) | Traditional IVR systems |
| **Acoustic classifier** | Pitch, energy, pace from raw audio | Low (~12-65ms) | Good | Smart Turn v3, Krisp Turn-Taking |
| **Language model** | Text tokens from STT | Higher (STT latency + inference) | Good for syntax | TurnGPT (Ekstedt & Skantze) |
| **Multimodal** | Audio + text + visual | Highest | Best | VAP multimodal variants |
| **Hybrid** | VAD trigger + acoustic classifier | Low | Good | Pipecat's VAD + Smart Turn pipeline |

### 2.2 Smart Turn (Pipecat/Daily.co)

Smart Turn is the most directly relevant model for MindReflect, as it's already integrated into Pipecat.

**Architecture evolution:**

| Version | Base model | Size | Inference (CPU) | Key improvement |
|---|---|---|---|---|
| v2 | Wav2Vec2 + linear classifier | ~400MB | ~60-100ms | First semantic VAD |
| v3 | Whisper Tiny + linear classifier | ~8M params | ~12ms (modern CPU), ~65ms (AWS) | 100x speedup over v2 |
| v3.1 | Same | Same | Same | Accuracy improvement from human datasets |
| v3.2 | Same | Same | Same | 40% better accuracy for short utterances, background noise handling |

**How it works:**

1. **Silero VAD** detects voice activity (is someone speaking right now?).
2. When VAD goes low for `stop_secs` (default: 3s), Smart Turn runs on the accumulated audio.
3. Smart Turn analyzes the **raw waveform** -- not the transcript. It uses intonation, pace, and filler word patterns.
4. Output: a single probability (0-1). Values >= 0.5 indicate "speaker has finished."
5. The model is explicitly trained to recognize fillers like "um" and "hmm" to avoid false end-of-turn on those.

**Pipecat configuration parameters:**

```python
SmartTurnParams(
    stop_secs=3.0,        # Max silence before triggering Smart Turn analysis
    pre_speech_ms=0,      # Audio to include before speech onset
    max_duration_secs=8,  # Max audio segment length for analysis
)
```

**For MindReflect, the key insight:** Smart Turn's `stop_secs` default of 3s is already much longer than typical voice AI defaults (~0.7-1.5s), but for a reflective context, we may want to increase it further or layer additional logic on top.

### 2.3 Skantze's TurnGPT and Voice Activity Projection (VAP)

Gabriel Skantze (KTH) has produced two significant models:

**TurnGPT**: A transformer-based *language model* for turn-taking prediction. It incrementally processes words and predicts turn-shift probability after each word, leveraging syntactic and pragmatic completeness cues. This is a text-based approach -- it needs STT output.

**Voice Activity Projection (VAP)**: A self-supervised model that processes raw audio from both speakers in a dyadic dialogue and predicts near-future voice activity. VAP outputs a probability distribution over projection windows -- essentially a "language model" for conversational dynamics, but operating on audio rather than text.

**VAP for backchannel prediction**: The VAP model has been fine-tuned for backchannel prediction (Inoue et al., 2024, "Yeah, Un, Oh"). The fine-tuned model predicts both timing and type of backchannels:
- `p_bc_react`: Probability of a continuer backchannel (e.g., "yeah")
- `p_bc_emo`: Probability of an assessment backchannel (e.g., "wow")

This is done by pre-training on general dialogue corpus, then fine-tuning on backchannel-specific data.

### 2.4 Krisp Turn-Taking Model

Krisp has developed a lightweight alternative:

- **Audio-only**, 6M parameters
- v3 catches 47% more true turn-shifts within the first 200ms of silence compared to v2
- Includes **Interruption Prediction v1** that distinguishes backchannels from genuine interruptions
- Multilingual support

### 2.5 Accuracy/Latency Tradeoffs

The fundamental tradeoff:

- **Lower threshold** (accept end-of-turn at lower confidence) = faster response but more interruptions
- **Higher threshold** (require high confidence) = fewer interruptions but potentially awkward silences
- **Longer silence window** = more accurate but slower

For MindReflect, the tradeoff is heavily weighted toward *fewer interruptions*. An extra 2 seconds of silence is acceptable; a single interruption of deep reflection is not.

Industry benchmarks for voice agents:
- Natural human gap: ~200ms
- "Feels natural" for voice agent: <500ms
- Noticeable but acceptable: 500-1000ms
- Users start to disengage: >1000ms

**These benchmarks are for chatbot-style voice agents.** For MindReflect, the calculus is inverted: the "user starts to disengage" threshold doesn't apply because the user is the primary speaker. The system's response latency is less critical than its restraint.

---

## Part 3: Backchanneling

### 3.1 When Humans Produce Backchannels

Backchannels are listener responses that signal attention without claiming the floor. They are triggered by specific cues from the speaker:

**Backchannel-inviting cues (from the speaker):**

- Pitch rise on a non-question (rising intonation mid-narrative)
- Brief pause at a clause boundary (not a full stop, a breath pause)
- Completion of a narrative unit ("and so that happened")
- Reduced intensity (speaker trailing off slightly)
- Tag-like constructions ("you know?", "right?")

**Timing:**

- The optimal prediction window is **275-875ms before** the backchannel would naturally occur.
- Key acoustic predictors in this window: speaking duration, intensity, and fundamental frequency (pitch).
- Backchannels typically occur at phrase boundaries, during breath pauses, or after narrative completion points.
- They do NOT typically occur mid-word or mid-clause.

**Frequency:**

- Highly variable and idiosyncratic -- personality, culture, and gender all affect rate.
- English conversation: roughly every 10-30 seconds of speaker talk, but this varies enormously.
- Japanese: significantly more frequent than English.
- Finnish/Chinese: less frequent.
- In therapeutic contexts: less frequent than casual conversation, more deliberate.

### 3.2 Backchannel Types and Functions

Six functional categories of backchannels (from conversation analysis literature):

| Function | Examples | When to use |
|---|---|---|
| **Continuer** | "mhmm", "uh-huh", "yeah" | Speaker is mid-narrative, you want them to continue |
| **Understanding** | "I see", "right", "okay" | Speaker has explained something |
| **Support/empathy** | "of course", "absolutely" | Speaker describes a difficulty |
| **Agreement** | "exactly", "right" | Speaker makes a point you validate |
| **Emotive** | "oh no", "wow", "oh" | Speaker shares something surprising or emotional |
| **Minor addition** | "and then?", "so..." | Prompting continuation at a natural break |

### 3.3 Backchannels in Therapeutic Contexts

In counseling, backchannels are called **minimal encouragers**. The therapeutic literature identifies:

**Standard repertoire:**
- "Mmhmm" / "mm" (the workhorse -- signals listening without evaluation)
- "Uh-huh" (slightly more active acknowledgment)
- "Yes" (affirmation, use carefully -- can imply judgment)
- "I see" (understanding, used after explanations)
- "Go on" / "Tell me more" (explicit invitation to continue -- more directive)
- "Right" (acknowledgment, borderline agreement)
- Silence + nod (the most non-directive encourager)

**Key principles from MI and person-centered therapy:**
- Minimal encouragers should not direct the client's narrative.
- They should communicate "I'm here, I'm listening" without communicating "I approve" or "I agree."
- "Mhmm" is preferred over "yes" because it carries less evaluative weight.
- Frequency should match the therapeutic need -- too many feels performative, too few feels absent.

### 3.4 Emotional Context and Backchannel Selection

Not all backchannels are interchangeable. Emotional context should drive selection:

| Emotional context | Appropriate backchannels | Avoid |
|---|---|---|
| **Neutral narrative** | "mhmm", "uh-huh" | Emotive responses |
| **Positive revelation** | "oh", "wow", "I see" | Silence (may feel dismissive) |
| **Difficulty/struggle** | "mm", silence, "I hear you" | "right" (dismissive), "yeah" (minimizing) |
| **Grief/pain** | Extended silence, soft "mm" | Any verbal backchannel that feels rushed |
| **Confusion/working through** | "mhmm", "uh-huh", silence | "I see" (premature understanding) |
| **Anger/frustration** | "mm", "I hear you" | "right" (agreement with anger), "yeah" |
| **Realization/insight** | Brief silence, then "mm" | Rushing to affirm |

**Critical point:** When someone shares grief or deep pain, silence is often the most appropriate response. An ill-timed "mhmm" during a tearful moment feels robotic and dismissive. The system should err toward silence in emotionally intense moments.

### 3.5 Making Backchannels Feel Natural

**What makes a backchannel feel robotic:**

1. **Metronomic timing**: Producing "mhmm" at fixed intervals (every 15s exactly) sounds mechanical.
2. **Wrong emotional register**: "Right!" when someone describes a loss.
3. **Too fast**: Backchannel before the speaker has even completed their thought.
4. **Too uniform**: Always the same "mhmm" with identical prosody.
5. **Overlapping speech**: Playing a backchannel while the speaker is actively talking (rather than at a pause/boundary).

**What makes it feel natural:**

1. **Variable timing**: Natural backchannels have irregular intervals with some clustering.
2. **Contextually appropriate type**: Matching the emotional tenor.
3. **Prosodic variation**: The same word ("mhmm") said with different intonation, length, and energy.
4. **Placement at boundaries**: At clause boundaries, breath pauses, narrative completion points.
5. **Appropriate rarity**: In a reflective context, less is more.

**Timing precision:**

- A backchannel that arrives >500ms after the inviting cue starts to feel delayed.
- A backchannel that arrives <100ms after feels like it was pre-planned (robotic).
- The sweet spot: **150-400ms** after the speaker's pause or cue.
- But in a therapeutic context, slightly longer delays (300-600ms) feel more considered and less reactive.

**Minimum repertoire for natural feel:**

For audio backchannels, you need at least **3-5 distinct recordings** of each type, with prosodic variation:
- 2-3 variations of "mhmm" (neutral, warm, acknowledging)
- 1-2 variations of "mm" (short, soft)
- 1-2 variations of "I see" (understanding, gentle)
- 1 "right" or "okay" (reserved, infrequent)
- Silence (the most common "backchannel")

Each recording should vary in pitch, duration, and energy to avoid the "same sample every time" problem.

---

## Part 4: Recommended Turn-Taking Policy for MindReflect

### 4.1 Architecture: Three-Tier Response System

```
User speaks
    |
    v
[Silero VAD] -- Is there speech?
    |
    v (silence detected)
[Smart Turn v3] -- Has the user finished?
    |
    |-- Low confidence (< 0.6): STAY SILENT (default)
    |-- Medium confidence (0.6-0.85): BACKCHANNEL OPPORTUNITY
    |-- High confidence (> 0.85) + extended silence: CONSIDER LLM RESPONSE
    |
    v
[Context Engine] -- What emotional state? How long has user been talking?
    |
    v
[Response Selector] -- Stay silent / Play backchannel / Generate LLM response
```

### 4.2 Concrete Parameters

#### Silence/Turn Detection

| Parameter | Default (chatbot) | MindReflect value | Rationale |
|---|---|---|---|
| `stop_secs` (VAD silence trigger) | 0.7-1.5s | **4.0s** | Reflective pauses are longer; 3s is still mid-thought territory |
| Smart Turn confidence threshold | 0.5 | **0.7** | Higher bar for "user is done" |
| Min silence for LLM response | ~0.5s | **6.0s** | Only respond after extended, confident silence |
| Max silence before gentle prompt | N/A | **45-60s** | After very long silence, a soft "take your time" may be appropriate |
| Adaptive silence extension (emotional content) | N/A | **+2-4s** | If transcript contains emotional keywords or sentiment, extend thresholds |

#### Turn-Taking Decision Logic

```
ON silence_detected(duration, smart_turn_confidence):

    # Tier 0: Default -- Stay silent
    IF duration < 4.0s:
        RETURN stay_silent

    # Tier 1: Smart Turn analysis
    IF smart_turn_confidence < 0.6:
        RETURN stay_silent  # Probably still thinking

    # Tier 2: Backchannel window (4-6s silence, medium confidence)
    IF duration >= 4.0s AND duration < 6.0s AND smart_turn_confidence >= 0.6:
        IF backchannel_appropriate(context):
            RETURN play_backchannel
        ELSE:
            RETURN stay_silent

    # Tier 3: LLM response window (6s+ silence, high confidence)
    IF duration >= 6.0s AND smart_turn_confidence >= 0.85:
        IF user_asked_question OR explicit_invitation:
            RETURN generate_response
        ELSE IF user_has_been_speaking > 60s:
            RETURN generate_reflection  # Reflect back what they said
        ELSE:
            RETURN stay_silent  # Still default to silence

    # Tier 4: Very long silence (45s+)
    IF duration >= 45.0s:
        RETURN gentle_prompt  # "Take your time" or similar
```

#### Adaptive Thresholds

The silence thresholds should not be static. They should adapt based on:

| Context signal | Adjustment | How to detect |
|---|---|---|
| Emotional content in recent speech | +2-4s to all thresholds | Sentiment analysis of transcript, vocal energy patterns |
| User crying or voice breaking | +10s or more, suppress backchannels | Audio energy patterns, pitch instability |
| User asking a direct question | -2s from response threshold | STT transcript ending in "?", rising terminal pitch |
| Early in session (first 2 min) | +2s to all thresholds | Timer |
| User just started a new topic | +2s | Topic shift detection in transcript |
| User has been speaking for >3 min uninterrupted | Allow reflection at next confident pause | Duration counter |

### 4.3 Backchannel Strategy

#### When to Backchannel

```
ON backchannel_opportunity(context):

    # Don't backchannel if...
    IF user_speaking_duration < 15s:
        RETURN false  # Too early, let them get going
    IF time_since_last_backchannel < 20s:
        RETURN false  # Too frequent
    IF emotional_intensity == HIGH:
        RETURN false  # Silence is better for grief/pain
    IF user_is_mid_sentence:
        RETURN false  # Never interrupt mid-thought

    # Do backchannel if...
    IF user_speaking_duration > 30s AND no_backchannel_yet:
        RETURN true  # They need to know we're here
    IF narrative_completion_detected:
        RETURN true  # Natural boundary
    IF clause_boundary AND pitch_cue_detected:
        RETURN true  # Speaker invited it

    RETURN false  # Default: don't
```

#### What to Play

```
ON select_backchannel(emotional_context, last_backchannel_type):

    # Vary the type -- don't repeat the same one
    available = ALL_TYPES - {last_backchannel_type}

    IF emotional_context == NEUTRAL:
        RETURN random_choice(["mhmm", "mm"], weights=[0.7, 0.3])
    IF emotional_context == POSITIVE:
        RETURN random_choice(["mm", "I see"], weights=[0.5, 0.5])
    IF emotional_context == DIFFICULT:
        RETURN random_choice(["mm", silence], weights=[0.4, 0.6])
    IF emotional_context == GRIEF:
        RETURN silence  # Always
    IF emotional_context == INSIGHT:
        RETURN random_choice(["mm", "I see"], weights=[0.6, 0.4])
```

#### Timing

- **Delay after silence onset**: 200-500ms (randomized, not fixed)
- **Backchannel duration**: 300-800ms (natural "mhmm" length)
- **Minimum interval between backchannels**: 20-30 seconds
- **Maximum backchannels per minute of user speech**: 2-3

#### Audio Requirements

Pre-record (or synthesize) a bank of backchannel audio:

| Type | Variations needed | Prosodic range |
|---|---|---|
| "mhmm" | 5-7 | Neutral to warm, short to long, low to mid pitch |
| "mm" | 3-4 | Soft, brief, varying pitch |
| "I see" | 2-3 | Gentle, understanding tone |
| "right" | 2 | Reserved, not enthusiastic |
| (silence) | N/A | The default "backchannel" |

Total: ~15-20 audio clips. These should sound like the same speaker/voice to maintain consistency but with enough variation to avoid repetition.

### 4.4 LLM Response Strategy

When the system does generate a full response (Tier 3), it should follow therapeutic principles:

**Prefer reflections over questions.** "It sounds like that was really difficult for you" rather than "How did that make you feel?"

**Prefer feelings over facts.** "You seem frustrated by that" rather than "So the meeting didn't go well."

**Keep responses short.** 1-2 sentences maximum. The user's space, not the AI's.

**Never interpret.** "I hear that you're feeling torn" rather than "It sounds like you're afraid of commitment."

**After responding, immediately return to listening mode.** Do not follow up. Do not ask clarifying questions unless the user has directly asked for engagement.

---

## Part 5: Implementation Notes for Pipecat Integration

### 5.1 Layering on Smart Turn

Smart Turn handles the "is the user done speaking?" question well, but MindReflect needs a layer on top:

```
Pipecat pipeline:
    AudioInput -> SileroVAD -> SmartTurnV3 -> MindReflectTurnPolicy -> ResponseRouter

MindReflectTurnPolicy:
    - Receives Smart Turn confidence scores
    - Applies adaptive thresholds (section 4.2)
    - Consults transcript context (emotional content, duration, question detection)
    - Emits one of: STAY_SILENT, BACKCHANNEL, REFLECT, PROMPT
```

### 5.2 Backchannel Delivery

Backchannels should be delivered as pre-recorded audio clips, not TTS-generated text. This avoids:
- TTS latency (even fast TTS adds 200-500ms)
- Unnatural prosody on very short utterances
- The "uncanny valley" of a TTS voice saying "mhmm"

The audio clips should be mixed at a lower volume than the user's expected speech level -- backchannels are soft, not assertive.

### 5.3 Transcript Context Window

For adaptive threshold decisions, the system needs access to:
- Last 30 seconds of transcript (for emotional content analysis)
- Total speaking duration in current "turn" (for deciding when to offer reflection)
- Time since last system utterance of any kind
- Whether the last user utterance ended with a question mark or rising pitch

This can be a lightweight context object updated by the STT pipeline.

### 5.4 Smart Turn v3 vs v2 for MindReflect

**Recommend Smart Turn v3** over v2:
- 100x faster inference (12ms vs ~100ms on CPU)
- Better accuracy on short utterances (v3.2)
- Much smaller model (8M params vs ~400MB)
- Better noise handling
- The latency savings aren't critical for MindReflect (we're waiting 4-6s anyway), but the accuracy improvements and smaller footprint are valuable.

---

## Part 6: Open Questions and Future Work

1. **Backchannel prediction from audio features alone vs. requiring transcript**: Research suggests audio-only prediction (pitch, energy, duration in the 275-875ms pre-backchannel window) is viable. For MindReflect, using both audio features (for timing) and transcript (for emotional context / type selection) is the strongest approach.

2. **Adaptive thresholds via user feedback**: Over multiple sessions, the system could learn an individual user's pause patterns. Some people think in 3-second silences; others need 10 seconds. A simple running average of the user's typical intra-turn pauses could inform threshold adjustment.

3. **Session phase awareness**: Therapeutic silences function differently at session start (settling in), middle (deep work), and end (wrapping up). The turn-taking policy could have phase-aware defaults.

4. **Interruption handling**: What happens when the system starts a response and the user resumes speaking? Pipecat supports interruption detection, but MindReflect should have a very low bar for yielding back -- if the user starts talking, the system stops immediately, no "let me finish my thought."

5. **VAP model integration**: Ekstedt and Skantze's Voice Activity Projection model could provide richer turn-taking predictions than Smart Turn alone, including backchannel timing. However, it requires processing audio from both speakers (dyadic), which adds complexity. Worth evaluating if Smart Turn + heuristics proves insufficient.

6. **Krisp's Interruption Prediction**: Krisp's model distinguishes backchannels from genuine interruptions, which could be useful for handling the case where the user produces their own backchannels (e.g., "mhmm" to themselves while thinking) that shouldn't trigger system responses.

---

## Sources

### Turn-Taking Fundamentals
- [Turn-taking in Conversational Systems and Human-Robot Interaction: A Review](https://www.sciencedirect.com/science/article/pii/S088523082030111X)
- [Timing in turn-taking and its implications for processing models of language (Levinson & Torreira, 2015)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4464110/)
- [Timing in Conversation (2023)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10077995/)
- [Turn-end Estimation in Conversational Turn-taking: The Roles of Context and Prosody](https://www.tandfonline.com/doi/full/10.1080/0163853X.2021.1986664)
- [Turn-taking cues in task-oriented dialogue (Gravano & Hirschberg)](https://www.utdt.edu/ia/integrantes/agravano/files/gravano_hirschberg_2011.pdf)
- [Universals and cultural variation in turn-taking in conversation (Stivers et al.)](https://www.pnas.org/doi/10.1073/pnas.0903616106)
- [Turn Construction Unit - Wikipedia](https://en.wikipedia.org/wiki/Turn_construction_unit)
- [A Survey of Recent Advances on Turn-taking Modeling](https://aclanthology.org/2025.iwsds-1.27.pdf)

### Computational Models
- [TurnGPT: a Transformer-based Language Model for Predicting Turn-taking (Ekstedt & Skantze)](https://www.semanticscholar.org/paper/TurnGPT:-a-Transformer-based-Language-Model-for-in-Ekstedt-Skantze/97b0689d937a622c37726a10b911a60a89f146d8)
- [Voice Activity Projection: Self-supervised Learning of Turn-taking Events](https://erikekstedt.github.io/VAP/)
- [Real-time and Continuous Turn-taking Prediction Using VAP](https://arxiv.org/abs/2401.04868)
- [Yeah, Un, Oh: Continuous and Real-time Backchannel Prediction with Fine-tuning of VAP](https://arxiv.org/abs/2410.15929)
- [GitHub: VoiceActivityProjection](https://github.com/ErikEkstedt/VoiceActivityProjection)
- [Predicting Turn-Taking and Backchannel with Acoustic and LLM Fusion (Amazon)](https://assets.amazon.science/95/b2/0cd8a6ce484497c31a7cf932ae3c/turn-taking-and-backchannel-prediction-with-acoustic-and-large-language-model-fusion.pdf)

### Smart Turn (Pipecat/Daily.co)
- [Smart Turn v2: faster inference, and 13 new languages](https://www.daily.co/blog/smart-turn-v2-faster-inference-and-13-new-languages-for-voice-ai/)
- [Announcing Smart Turn v3, with CPU inference in just 12ms](https://www.daily.co/blog/announcing-smart-turn-v3-with-cpu-inference-in-just-12ms/)
- [Smart Turn v3.1: improved accuracy](https://www.daily.co/blog/improved-accuracy-in-smart-turn-v3-1/)
- [Smart Turn v3.2: better accuracy for short utterances](https://www.daily.co/blog/smart-turn-v3-2-handling-noisy-environments-and-short-responses/)
- [Smart Turn Detection - Pipecat Docs](https://docs.pipecat.ai/deployment/pipecat-cloud/guides/smart-turn)
- [pipecat-ai/smart-turn-v3 on HuggingFace](https://huggingface.co/pipecat-ai/smart-turn-v3)
- [Smart Turn v3 API Reference](https://reference-server.pipecat.ai/en/stable/api/pipecat.audio.turn.smart_turn.local_smart_turn_v3.html)

### Krisp Turn-Taking
- [Audio-only, 6M weights Turn-Taking model for Voice AI Agents](https://krisp.ai/blog/turn-taking-for-voice-ai/)
- [Audio-Only Turn-Taking Model v2](https://krisp.ai/blog/krisp-turn-taking-v2-voice-ai-viva-sdk/)
- [A solution to Turn-Taking and Interruption Prediction in Voice AI](https://krisp.ai/blog/voice-ai-turn-taking-interruption-prediction/)

### Backchannel Prediction
- [Yeah, Right, Uh-Huh: A Deep Learning Backchannel Predictor (Ruede et al.)](https://arxiv.org/abs/1706.01340)
- [Enhancing Backchannel Prediction Using Word Embeddings (Ruede et al.)](https://www.isca-archive.org/interspeech_2017/ruede17_interspeech.html)
- [Continuous prediction of backchannel timing for human-robot interaction](https://www.isca-archive.org/interspeech_2025/paierl25_interspeech.html)
- [Backchannels: Quantity, Type and Timing Matters](https://link.springer.com/chapter/10.1007/978-3-642-23974-8_25)
- [Backchannel (linguistics) - Wikipedia](https://en.wikipedia.org/wiki/Backchannel_(linguistics))
- [Backchannel behavior is idiosyncratic](https://www.cambridge.org/core/journals/language-and-cognition/article/backchannel-behavior-is-idiosyncratic/F75D0AEEAF258399166A58E3DDCC7D7E)

### Therapeutic Silence and Counseling
- [How to Use Silence in Therapy & Counseling](https://positivepsychology.com/silence-in-therapy/)
- [Sounds of Silence in Psychotherapy: The Categorization of Clients' Pauses](https://www.researchgate.net/publication/225274037_Sounds_of_Silence_in_Psychotherapy_The_Categorization_of_Clients'_Pauses)
- [Changes in patient emotional expression after silence](https://pmc.ncbi.nlm.nih.gov/articles/PMC10348709/)
- [Silences in psychotherapy: An integrative meta-analytic review](https://psycnet.apa.org/record/2023-60002-001)
- [Therapist use of silence in therapy: a survey](https://pubmed.ncbi.nlm.nih.gov/12652641/)
- [Person-Centered Therapy (Rogerian Therapy) - StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK589708/)
- [Motivational Interviewing as a Counseling Style - NCBI](https://www.ncbi.nlm.nih.gov/books/NBK571068/)

### Voice AI Latency
- [The 300ms rule: Why latency makes or breaks voice AI (AssemblyAI)](https://www.assemblyai.com/blog/low-latency-voice-ai)
- [How intelligent turn detection solves the biggest challenge in voice agent development (AssemblyAI)](https://www.assemblyai.com/blog/turn-detection-endpointing-voice-agent)
- [End-of-Turn Detection Parameters (Deepgram)](https://developers.deepgram.com/docs/flux/configuration)
- [How to build smarter turn detection for Voice AI (Speechmatics)](https://blog.speechmatics.com/semantic-turn-detection)

### Backchannels and Emotional Context
- [A Robot That Listens: Enhancing Self-Disclosure Through Sentiment-based Backchannels](https://arxiv.org/html/2509.07873)
- [Encouragers, Paraphrasing and Summarising - Counselling Connection](https://www.counsellingconnection.com/index.php/2009/07/21/encouragers-paraphrasing-and-summarising/)
- [The Opening Micro-skills (AIPC)](https://www.aipc.net.au/articles/the-opening-micro-skills/)
