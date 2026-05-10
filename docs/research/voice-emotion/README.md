# R6 -- Emotional State from Voice (Audio Features)

Research for MindReflect M1 (turn-taking engine) and M2 (canvas as emotional mirror).

---

## 1. Executive Summary: Recommended Approach

**Use a hybrid architecture: simple DSP features for the fast path, with an optional small neural model for richer signal.**

The system should extract three core audio features in real-time from every audio chunk (pitch/F0, energy/RMS, speech rate) and compute a running **arousal score** from them. This is the fast path -- no ML model, sub-millisecond latency, and sufficient for both the turn-taking engine and the canvas. Optionally, a tiny neural model (Wav2Small, 72K parameters, 120KB ONNX, 9ms inference) can run in parallel to provide a more nuanced arousal/valence signal, but the system should function well without it.

**Why arousal over categorical emotions:** MindReflect does not need to classify emotions (angry, sad, happy). It needs to track *activation level* (calm vs. agitated) and *trajectory* (getting more tense vs. calming down). The dimensional model (arousal x valence) is the right abstraction. And for our two consumers (turn-taking engine, canvas), arousal alone covers ~80% of the need:

- Turn-taking: high arousal = extend silence thresholds. Rising arousal = do not interrupt. Falling arousal = backchannels are OK.
- Canvas: arousal maps directly to particle speed, density, and movement patterns.

Valence (positive vs. negative) is a nice-to-have for canvas color temperature but is much harder to extract reliably from audio alone (it correlates more with linguistic content than with acoustic features).

---

## 2. Audio Features That Correlate with Emotional State

### 2.1 The Reliable Three (extract from every chunk)

| Feature | What it measures | Emotional correlation | Extraction cost |
|---------|-----------------|----------------------|-----------------|
| **Pitch (F0)** | Fundamental frequency of voice | High F0 + high variability = high arousal (anger, fear, excitement). Low F0 + flat contour = low arousal (sadness, resignation). F0 contour *decreases* over time during anger, *increases* during happiness. | ~1ms per chunk via pYIN or CREPE-tiny |
| **Energy (RMS)** | Root mean square amplitude | High energy = high arousal. Low energy = low arousal. Energy variability tracks emotional instability. Suicidal speech shows "lower energy variability and flatter energy contours." | <0.1ms (trivial computation) |
| **Speech rate** | Syllables or words per second | Fast + loud = anxiety/fear. Slow + soft = sadness/depression. Rate *increase* with pause *decrease* = mood improvement. Mean rate ~1.77 words/sec (baseline). | Derived from STT timestamps or syllable counting |

These three features are the core of what clinical speech analysis uses. A 2025 JMIR systematic review of speech emotion recognition in mental health found that prosodic features (pitch, energy, speech rate) and temporal features (pause patterns) are the most consistent predictors across studies.

### 2.2 Secondary Features (useful but not essential for v1)

| Feature | What it measures | When to add it |
|---------|-----------------|----------------|
| **Jitter** | Pitch period irregularity (cycle-to-cycle F0 variation) | Crying/voice breaking detection. High jitter = vocal instability, distress. |
| **Shimmer** | Amplitude perturbation (cycle-to-cycle amplitude variation) | Same as jitter -- combined, they detect vocal quality deterioration. |
| **Pause patterns** | Duration, frequency, location of pauses | Depression: more pauses within utterances. Anxiety: fewer pauses. Already partially captured by the SilenceDetector in `vad/silence.py`. |
| **Spectral tilt** | Ratio of low to high frequency energy | Breathy/tense voice quality. Tense voice = more high-frequency energy. |
| **HNR (Harmonics-to-Noise Ratio)** | Vocal clarity | Low HNR = rough/breathy voice = emotional distress. |
| **MFCCs** | Mel-frequency cepstral coefficients | Spectral shape. Useful if feeding a trained model. Not useful for heuristic approach. |

### 2.3 Which Features Map to Which Dimensions

**Arousal (calm <-> agitated):**
- **Strong predictors:** RMS energy, pitch mean, pitch variability, speech rate, spectral tilt
- **Direction:** All increase with arousal
- This is the dimension we can measure most reliably from audio alone

**Valence (negative <-> positive):**
- **Weak acoustic predictors:** Pitch contour shape (falling = anger, rising = happiness), tonal features
- **Better predictors:** Linguistic content (words used), not acoustic features
- Research consistently shows valence is harder to predict from audio than arousal
- "Low-level spectral and temporal features correlated with arousal; high-level contextual features correlated with valence"

**Recommendation:** Track arousal as the primary dimension from audio features. Derive a rough valence estimate from the LLM's semantic analysis of the transcript (which is already running in the background per the M1 pipeline). The canvas can combine audio-arousal with text-valence for a richer signal.

---

## 3. Simple Feature Extraction (No ML Model)

### 3.1 Core Pipeline: Per-Chunk Feature Extraction

For each audio chunk (the same 16kHz PCM chunks that feed Whisper), extract:

```python
import numpy as np
import struct

def extract_emotion_features(pcm_bytes: bytes, sample_rate: int = 16000) -> dict:
    """Extract emotional features from a PCM audio chunk.
    
    Returns features normalized to 0-1 range where possible.
    Designed to run in <2ms on any hardware.
    """
    # Convert PCM bytes to numpy array
    n_samples = len(pcm_bytes) // 2
    samples = np.array(
        struct.unpack(f"<{n_samples}h", pcm_bytes[:n_samples * 2]),
        dtype=np.float32
    ) / 32768.0
    
    # 1. Energy (RMS) -- trivial, <0.1ms
    rms = np.sqrt(np.mean(samples ** 2))
    
    # 2. Energy variability (std of windowed RMS)
    win_size = sample_rate // 10  # 100ms windows
    n_windows = len(samples) // win_size
    if n_windows > 1:
        windowed_rms = np.array([
            np.sqrt(np.mean(samples[i*win_size:(i+1)*win_size] ** 2))
            for i in range(n_windows)
        ])
        energy_var = np.std(windowed_rms)
    else:
        energy_var = 0.0
    
    # 3. Pitch (F0) via autocorrelation -- fast, ~1ms
    # Simple autocorrelation-based F0 (no external deps)
    f0, f0_confidence = _estimate_f0_autocorr(samples, sample_rate)
    
    # 4. Pitch variability (if chunk is long enough)
    f0_values = _windowed_f0(samples, sample_rate, window_ms=50)
    f0_std = np.std(f0_values[f0_values > 0]) if np.any(f0_values > 0) else 0.0
    
    # 5. Zero-crossing rate (correlates with vocal tension)
    zcr = np.mean(np.abs(np.diff(np.sign(samples)))) / 2
    
    return {
        "rms": float(rms),
        "energy_var": float(energy_var),
        "f0_hz": float(f0),
        "f0_confidence": float(f0_confidence),
        "f0_std": float(f0_std),
        "zcr": float(zcr),
    }


def _estimate_f0_autocorr(
    samples: np.ndarray, sr: int,
    fmin: float = 70.0, fmax: float = 400.0,
) -> tuple[float, float]:
    """Fast autocorrelation-based F0 estimation.
    
    Human voice range: ~70-400 Hz (male low to female high).
    Returns (f0_hz, confidence).
    """
    min_lag = int(sr / fmax)
    max_lag = int(sr / fmin)
    
    if len(samples) < max_lag * 2:
        return 0.0, 0.0
    
    # Normalized autocorrelation
    corr = np.correlate(samples, samples, mode='full')
    corr = corr[len(corr)//2:]  # positive lags only
    corr = corr / (corr[0] + 1e-10)  # normalize
    
    # Find peak in voice range
    search = corr[min_lag:max_lag]
    if len(search) == 0:
        return 0.0, 0.0
    
    peak_idx = np.argmax(search)
    confidence = float(search[peak_idx])
    lag = peak_idx + min_lag
    f0 = sr / lag if lag > 0 else 0.0
    
    return f0, confidence
```

### 3.2 Library Options for Feature Extraction

| Library | Features | Real-time viable | Notes |
|---------|----------|-----------------|-------|
| **Raw numpy/scipy** | RMS, ZCR, autocorrelation F0 | Yes, fastest | No dependencies. Good enough for arousal. |
| **librosa** | pYIN F0, MFCC, spectral features | Mostly yes | `librosa.pyin()` is accurate but ~5ms. `librosa.stream()` supports chunked processing. |
| **parselmouth (Praat)** | F0 (autocorrelation), jitter, shimmer, HNR, formants | Yes, very fast | C++ backend, exact Praat algorithms. 60ms analysis window for F0. Best for clinical-grade features. |
| **openSMILE** | 6000+ features (ComParE 2016 set) | Yes (C++ core) | Overkill for v1 but has real-time mode with PortAudio. Python wrapper available. Good for future model training. |
| **CREPE-tiny** | Neural F0 estimation | ~10ms per chunk | More accurate F0 than autocorrelation, but needs TensorFlow. SwiftF0 is a 95K-param alternative at 42x faster than CREPE. |

**Recommendation for v1:** Use raw numpy for RMS/ZCR (zero dependencies, sub-ms) and parselmouth for F0/jitter/shimmer (fast, accurate, well-established in speech research). No need for librosa or CREPE initially.

### 3.3 Computing Arousal from Features

A simple heuristic arousal score can be computed from the three core features:

```python
def compute_arousal(features: dict, baseline: dict) -> float:
    """Compute arousal score from audio features.
    
    Returns 0.0 (very calm) to 1.0 (very agitated).
    Uses speaker-relative normalization against a running baseline.
    """
    # Normalize each feature relative to the speaker's baseline
    rms_z = _z_score(features["rms"], baseline["rms_mean"], baseline["rms_std"])
    f0_z = _z_score(features["f0_hz"], baseline["f0_mean"], baseline["f0_std"])
    f0var_z = _z_score(features["f0_std"], baseline["f0var_mean"], baseline["f0var_std"])
    zcr_z = _z_score(features["zcr"], baseline["zcr_mean"], baseline["zcr_std"])
    
    # Weighted combination (energy and pitch are strongest arousal predictors)
    raw_arousal = (
        0.30 * rms_z +      # energy level
        0.25 * f0_z +       # pitch height
        0.25 * f0var_z +    # pitch variability
        0.10 * zcr_z +      # vocal tension
        0.10 * features.get("energy_var", 0) * 10  # energy instability
    )
    
    # Sigmoid to map to 0-1 range
    arousal = 1.0 / (1.0 + np.exp(-raw_arousal))
    
    return float(arousal)


def _z_score(value: float, mean: float, std: float) -> float:
    if std < 1e-6:
        return 0.0
    return (value - mean) / std
```

**Critical: speaker-relative normalization.** Absolute pitch/energy values are useless across speakers. A deep-voiced male at 100Hz and a female at 220Hz can both be calm. The system must build a per-session baseline from the first ~30 seconds of speech, then measure deviations from that baseline. This is what makes "trajectory" possible -- we are tracking *changes from the speaker's normal*, not absolute values.

---

## 4. On-Device Neural Models

### 4.1 Model Landscape

| Model | Parameters | Size | Output | Inference | License | Notes |
|-------|-----------|------|--------|-----------|---------|-------|
| **Wav2Small** | 72K | 120KB ONNX | Arousal/Dominance/Valence (0-1) | **9ms** on CPU | Research (audEERING) | Distilled from wav2vec2. Tiny. Perfect for on-device. |
| **audeering w2v2-emotion** | ~200M | ~800MB | Arousal/Dominance/Valence (0-1) | ~100-200ms on CPU | CC-BY-NC-SA-4.0 | The teacher model. Too large for real-time parallel processing. |
| **SpeechBrain wav2vec2-IEMOCAP** | ~95M | ~360MB | Categorical (angry/happy/sad/neutral) | ~80-150ms | Apache 2.0 | Categorical only. Not what we need. |
| **emotion2vec** | Varies | Varies | Categorical | Unknown | Research | Less established, sparse documentation. |
| **Wav2Vec2-XLSR emotion** | ~300M | ~1.2GB | Categorical | ~200ms | Research | Too large, categorical. |

### 4.2 Wav2Small: The Standout Option

Wav2Small is the clear winner for on-device deployment:

- **72K parameters** -- trivially small. For comparison, Whisper Large v3 has 1.55B parameters.
- **120KB ONNX** -- the entire model fits in L1 cache.
- **9ms inference** on a Xeon CPU. On Apple Silicon it would be even faster.
- **9MB peak RAM** -- negligible alongside Whisper and Gemma 4.
- **Dimensional output** -- arousal/dominance/valence in 0-1 range. Exactly what we need.
- **CCC scores:** Arousal 0.66 on MSP-Podcast test-1 (decent), 0.56 on IEMOCAP out-of-distribution.

Architecture: VGG7 feature extractor with 13 channels processing LogMel spectrograms, a novel "vectorisation of tokens into the convolution-channels dimension" that reshapes time-frames into channels, a learnable pooling layer, and a regression head outputting three continuous values.

It processes LogMel spectrograms, which can be computed from the same 16kHz PCM that feeds Whisper. The ONNX format means it runs via `onnxruntime` -- no PyTorch needed at inference time.

**Key caveat:** The license is research-only (audEERING). For a personal/non-commercial app this is fine. For distribution, check terms.

### 4.3 The audeering Teacher Model (backup option)

If Wav2Small's accuracy proves insufficient, the teacher model (`wav2vec2-large-robust-12-ft-emotion-msp-dim`) is available:

```python
import audonnx
import numpy as np

model = audonnx.load("path/to/model")  # ONNX format
signal = audio_chunk.astype(np.float32)  # 16kHz mono
result = model(signal, 16000)
# result['logits'] = [arousal, dominance, valence], each 0-1
```

At ~200M parameters it is too large to run on every chunk in real-time alongside Whisper + Gemma 4. But it could run on selected chunks (e.g., every 5th chunk, or only when the heuristic arousal detector flags a significant change).

### 4.4 CoreML / Neural Engine Conversion

Both models could potentially run on Apple's Neural Engine via CoreML conversion:

- CoreML supports ONNX import via `coremltools`
- The Neural Engine handles fixed-shape tensor workloads efficiently
- Constraint: ANE does not support dynamic shapes or data-dependent control flow
- For a fixed-length audio chunk (e.g., always 2 seconds = 32,000 samples at 16kHz), this is viable
- Kokoro TTS already has a CoreML conversion pipeline (`kokoro-coreml` on GitHub)

For Wav2Small at 72K parameters, the CoreML conversion would be straightforward and the model would likely run in <1ms on the ANE. This is a future optimization, not needed for v1.

---

## 5. Dimensional Emotion Model

### 5.1 Russell's Circumplex Model

Russell's (1980) circumplex model maps all emotions onto two orthogonal dimensions:

```
                    High Arousal
                        |
            Tense    Excited
            Nervous  Elated
                 \    /
  Negative ------+---------- Positive   (Valence)
  Valence    /    \    Valence
          Sad    Calm
          Bored  Relaxed
                        |
                    Low Arousal
```

- **Arousal** (vertical): physiological activation level. Measured reliably from audio.
- **Valence** (horizontal): pleasantness. Measured more from words/context than from audio.
- A third dimension, **dominance** (feeling in control vs. overwhelmed), is sometimes added but less useful for our purpose.

### 5.2 Why Arousal Is Sufficient for v1

For MindReflect's two consumers:

**Turn-taking engine:**
- Rising arousal = user is becoming more activated (could be distress, excitement, or anger). In a therapeutic reflection context, rising arousal almost always means increasing distress. Action: extend silence thresholds, do not interrupt.
- Falling arousal = user is calming down, processing, winding down. Action: backchannels are safe, gentle prompts OK.
- Sudden arousal spike = emotional peak (crying, outburst). Action: suppress all responses, hold space.
- The turn-taking engine already has `emotional_content_recent` and `user_crying` flags -- arousal provides the continuous signal underlying these binary flags.

**Canvas visualization (M2):**
- Arousal maps naturally to particle dynamics: speed, density, turbulence, spread.
- Valence can be layered later via color temperature (warm = positive, cool = negative) using semantic analysis from the LLM.

### 5.3 When to Add Valence

Valence becomes useful for M2 canvas when we want the visualization to distinguish between:
- High arousal + positive valence (excitement, breakthrough) = warm expanding scatter
- High arousal + negative valence (distress, anger) = tight cold spirals

For v1, the canvas can use arousal-only with a neutral color palette. Valence can be derived from the LLM's semantic analysis of transcript content in a later iteration.

---

## 6. Trajectory Tracking

### 6.1 The Problem

Raw per-chunk emotion scores are noisy. A 2-second audio chunk might show high arousal because the user coughed, or low arousal because they paused to think. We need to smooth these into a trajectory that reflects genuine emotional shifts.

### 6.2 Recommended Approach: Dual-Rate EMA

Use two exponential moving averages (EMAs) running in parallel:

```python
class EmotionalTrajectory:
    """Tracks emotional state trajectory using dual-rate EMA.
    
    Fast EMA (alpha=0.3): responds to sudden changes in ~3-5 chunks.
    Used for detecting emotional peaks (crying, outburst).
    
    Slow EMA (alpha=0.05): smooth trend over ~20-40 chunks.
    Used for overall trajectory (getting more/less tense over minutes).
    """
    
    def __init__(
        self,
        fast_alpha: float = 0.3,
        slow_alpha: float = 0.05,
        peak_threshold: float = 0.3,  # std devs above slow EMA
    ):
        self.fast_alpha = fast_alpha
        self.slow_alpha = slow_alpha
        self.peak_threshold = peak_threshold
        
        self.fast_ema: float | None = None
        self.slow_ema: float | None = None
        self.history: list[float] = []
        self._baseline_samples: list[float] = []
        self._baseline_std: float = 0.1
    
    def update(self, arousal: float) -> dict:
        """Update trajectory with new arousal reading.
        
        Returns:
            current: current smoothed arousal (fast EMA)
            trend: overall trend (slow EMA)  
            trajectory: "rising" | "falling" | "stable"
            peak: True if sudden intensity spike detected
            delta: rate of change (positive = getting more aroused)
        """
        self.history.append(arousal)
        
        # Build baseline from first N samples
        if len(self.history) <= 10:
            self._baseline_samples.append(arousal)
            if len(self._baseline_samples) >= 5:
                self._baseline_std = max(
                    np.std(self._baseline_samples), 0.05
                )
        
        # Initialize EMAs
        if self.fast_ema is None:
            self.fast_ema = arousal
            self.slow_ema = arousal
            return {
                "current": arousal,
                "trend": arousal,
                "trajectory": "stable",
                "peak": False,
                "delta": 0.0,
            }
        
        # Update EMAs
        prev_fast = self.fast_ema
        self.fast_ema = self.fast_alpha * arousal + (1 - self.fast_alpha) * self.fast_ema
        self.slow_ema = self.slow_alpha * arousal + (1 - self.slow_alpha) * self.slow_ema
        
        # Compute delta (rate of change)
        delta = self.fast_ema - prev_fast
        
        # Detect trajectory direction
        diff = self.fast_ema - self.slow_ema
        if abs(diff) < 0.05:
            trajectory = "stable"
        elif diff > 0:
            trajectory = "rising"
        else:
            trajectory = "falling"
        
        # Detect peaks (sudden spike above the slow trend)
        peak = (self.fast_ema - self.slow_ema) > (
            self.peak_threshold * self._baseline_std
        )
        
        return {
            "current": self.fast_ema,
            "trend": self.slow_ema,
            "trajectory": trajectory,
            "peak": peak,
            "delta": delta,
        }
```

### 6.3 Why EMA Over Kalman Filter

A Kalman filter would be more sophisticated but adds complexity without clear benefit here:

- **EMA is stateless** (two floats) vs. Kalman (state vector + covariance matrix).
- **EMA is interpretable** -- "recent readings weighted more" is easy to reason about and tune.
- **Kalman shines when you have a process model** (physics, dynamics). For emotion, we do not have a reliable process model -- emotions do not follow Newton's laws.
- The dual-rate EMA gives us both responsiveness (fast EMA catches peaks in 2-3 readings) and stability (slow EMA smooths over 30+ readings).

If the dual EMA proves insufficient, a Kalman filter can be added later. The interface (`update(arousal) -> trajectory dict`) stays the same.

### 6.4 Time Scales

| Time scale | What changes | How to capture |
|-----------|-------------|----------------|
| **1-3 seconds** | Momentary vocal changes (cough, laugh, sigh) | Raw per-chunk features. Fast EMA filters these. |
| **10-30 seconds** | Emotional micro-shifts (voice starting to tremble, pace quickening) | Fast EMA tracks this well. This is the turn-taking time scale. |
| **1-5 minutes** | Emotional arc (opening up, building to a peak, calming down) | Slow EMA. This is the canvas time scale. |
| **Full session** | Session trajectory (arrival state vs. departure state) | Store slow EMA history. Useful for session summary. |

### 6.5 Detecting Specific States

Beyond continuous arousal, certain discrete states need detection for the turn-taking engine:

**Crying / voice breaking:**
- High jitter (>2% of F0 period) + high shimmer (>0.5 dB) + F0 instability (sudden drops/jumps)
- Energy pattern: intermittent high energy (sobs) with low energy (silence/gasping)
- Can be detected with a simple heuristic on the raw features without ML

**Extended silence after emotional peak:**
- Arousal peak (fast EMA) followed by silence (from VAD)
- This is the most important moment to hold space -- do not play a backchannel

**Gradual calming:**
- Slow EMA trending downward over 2+ minutes
- Speech rate decreasing, pauses getting longer
- Good time for a gentle reflection if the user has been speaking for a while

---

## 7. Integration with Pipecat Pipeline

### 7.1 Where Emotion Detection Fits

Emotion detection runs as a **parallel branch** from the audio input, separate from the STT path. It does not block or delay transcription.

```
                    ┌─────────────────────────────┐
                    │       Audio Input            │
                    │   (16kHz PCM chunks)         │
                    └──────┬──────────┬────────────┘
                           │          │
                  ┌────────▼──┐  ┌────▼──────────────┐
                  │   STT     │  │ Emotion Detector   │
                  │  Whisper  │  │ (feature extraction │
                  │  (MLX)    │  │  + trajectory)      │
                  └────┬──────┘  └────────┬───────────┘
                       │                  │
                       ▼                  ▼
              TranscriptionFrame    EmotionalStateFrame
                       │                  │
                       └────────┬─────────┘
                                │
                    ┌───────────▼──────────┐
                    │  Turn-Taking Engine   │
                    │  (combines signals)   │
                    └───────────┬──────────┘
                                │
                    ┌───────────▼──────────┐
                    │  Canvas / LLM / TTS  │
                    └─────────────────────┘
```

### 7.2 Pipecat Integration

In Pipecat's frame model, emotion detection is a custom `FrameProcessor` that receives `InputAudioRawFrame`s and emits a custom `EmotionalStateFrame`:

```python
from pipecat.frames.frames import Frame, InputAudioRawFrame
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection

class EmotionalStateFrame(Frame):
    """Custom frame carrying emotional state data."""
    def __init__(self, state: dict):
        super().__init__()
        self.arousal = state["current"]
        self.trend = state["trend"]
        self.trajectory = state["trajectory"]  
        self.peak = state["peak"]
        self.delta = state["delta"]
        self.raw_features = state.get("features", {})


class EmotionDetectorProcessor(FrameProcessor):
    """Extracts emotional features from audio and emits state frames.
    
    Runs in parallel with STT -- does not block transcription.
    Processes every Nth audio frame to manage compute.
    """
    
    def __init__(self, process_every_n: int = 5):
        super().__init__()
        self.trajectory = EmotionalTrajectory()
        self.baseline = SpeakerBaseline()
        self._frame_count = 0
        self._process_every_n = process_every_n
    
    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        
        if isinstance(frame, InputAudioRawFrame):
            self._frame_count += 1
            
            if self._frame_count % self._process_every_n == 0:
                features = extract_emotion_features(
                    frame.audio, frame.sample_rate
                )
                self.baseline.update(features)
                arousal = compute_arousal(features, self.baseline.stats)
                state = self.trajectory.update(arousal)
                state["features"] = features
                
                await self.push_frame(EmotionalStateFrame(state))
        
        # Always pass the original frame through
        await self.push_frame(frame, direction)
```

### 7.3 Integration with geno-voice (Current Architecture)

Since geno-voice currently uses a custom pipeline (not Pipecat), the emotion detector integrates as a module called from the same place that feeds audio to the STT engine:

```python
# In the audio processing loop (wherever pcm chunks are handled):
from emotion.detector import EmotionDetector

detector = EmotionDetector()

def on_audio_chunk(pcm_bytes: bytes):
    # Feed to STT (existing)
    stt_result = stt_engine.transcribe(make_wav(pcm_bytes))
    
    # Feed to emotion detector (new, parallel)
    emotion_state = detector.process_chunk(pcm_bytes)
    
    # Feed both to turn-taking engine
    turn_engine.update_state(
        emotional_content=emotion_state["trajectory"] == "rising",
        user_crying=emotion_state["peak"],
    )
```

The `EmotionDetector` wraps feature extraction + baseline + trajectory into a single stateful object:

```python
class EmotionDetector:
    def __init__(self):
        self.trajectory = EmotionalTrajectory()
        self.baseline = SpeakerBaseline()
    
    def process_chunk(self, pcm_bytes: bytes) -> dict:
        features = extract_emotion_features(pcm_bytes)
        self.baseline.update(features)
        arousal = compute_arousal(features, self.baseline.stats)
        state = self.trajectory.update(arousal)
        state["features"] = features
        return state
    
    def reset(self):
        """Reset for new session."""
        self.trajectory = EmotionalTrajectory()
        self.baseline = SpeakerBaseline()
```

### 7.4 Connecting to the Turn-Taking Engine

The existing `TurnTakingEngine` in `session/turn_taking.py` already has `emotional_content_recent` and `user_crying` boolean flags. The emotion detector provides the continuous signal that drives these:

```python
# Map continuous arousal to the turn-taking engine's existing interface
def emotion_to_turn_taking(state: dict, engine: TurnTakingEngine):
    engine.update_state(
        emotional_content=(
            state["trajectory"] == "rising" or 
            state["current"] > 0.7
        ),
        user_crying=state["peak"] and state["current"] > 0.85,
    )
```

Future enhancement: modify `TurnTakingEngine` to accept the continuous arousal score directly, enabling proportional silence threshold extension rather than binary flags.

### 7.5 Feeding the Canvas (M2)

The canvas needs a continuous signal, not binary flags. The `EmotionalStateFrame` (or equivalent dict from `EmotionDetector`) maps to canvas parameters:

```python
def emotion_to_canvas(state: dict) -> dict:
    """Map emotional state to canvas visualization parameters.
    
    Returns parameters for the particle engine.
    """
    arousal = state["current"]
    trend = state["trend"]
    trajectory = state["trajectory"]
    peak = state["peak"]
    
    return {
        # Particle speed: calm = slow drift, agitated = fast movement
        "speed": lerp(0.1, 2.0, arousal),
        
        # Particle count: more particles at higher arousal
        "density": lerp(20, 200, arousal),
        
        # Movement pattern
        "turbulence": lerp(0.0, 1.0, arousal),  # 0=smooth, 1=chaotic
        
        # Spread: calm = clustered constellations, tense = tight spirals,
        #         release (falling after peak) = expanding scatter
        "spread": (
            lerp(0.8, 0.2, arousal) if trajectory != "falling"
            else lerp(0.5, 1.5, 1.0 - arousal)  # expanding on release
        ),
        
        # Opacity: more transparent during calm, more vivid during peaks
        "opacity": lerp(0.3, 1.0, arousal),
        
        # Transition duration: longer transitions for smooth feel
        "transition_ms": 2000 if not peak else 500,
        
        # Color temperature (placeholder -- will use valence from LLM later)
        # For now, neutral palette that shifts subtly with arousal
        "hue_shift": lerp(-10, 10, arousal),  # cool to warm
    }


def lerp(a: float, b: float, t: float) -> float:
    """Linear interpolation between a and b by t (clamped 0-1)."""
    t = max(0.0, min(1.0, t))
    return a + (b - a) * t
```

---

## 8. Speaker Baseline Tracking

The baseline tracker accumulates statistics from the first ~30 seconds of speech to normalize features relative to the individual speaker:

```python
class SpeakerBaseline:
    """Builds and maintains speaker-specific feature baselines.
    
    First 30 seconds: accumulate raw features.
    After that: slowly adapt (very slow EMA) to track gradual shifts
    while preserving the initial calibration.
    """
    
    def __init__(self, calibration_chunks: int = 15, adapt_alpha: float = 0.01):
        self.calibration_chunks = calibration_chunks
        self.adapt_alpha = adapt_alpha
        self._samples: list[dict] = []
        self._calibrated = False
        self.stats = {
            "rms_mean": 0.05, "rms_std": 0.02,
            "f0_mean": 150.0, "f0_std": 30.0,
            "f0var_mean": 10.0, "f0var_std": 5.0,
            "zcr_mean": 0.1, "zcr_std": 0.05,
        }
    
    def update(self, features: dict):
        if not self._calibrated:
            self._samples.append(features)
            if len(self._samples) >= self.calibration_chunks:
                self._compute_baseline()
                self._calibrated = True
        else:
            # Very slow adaptation
            for key in ["rms", "f0_hz", "f0_std", "zcr"]:
                stat_key = key.replace("f0_hz", "f0").replace("f0_std", "f0var")
                mean_key = f"{stat_key}_mean"
                if mean_key in self.stats and key in features:
                    self.stats[mean_key] = (
                        self.adapt_alpha * features[key] +
                        (1 - self.adapt_alpha) * self.stats[mean_key]
                    )
    
    def _compute_baseline(self):
        import numpy as np
        rms_vals = [s["rms"] for s in self._samples if s["rms"] > 0.005]
        f0_vals = [s["f0_hz"] for s in self._samples if s["f0_hz"] > 50]
        f0var_vals = [s["f0_std"] for s in self._samples]
        zcr_vals = [s["zcr"] for s in self._samples]
        
        if rms_vals:
            self.stats["rms_mean"] = float(np.mean(rms_vals))
            self.stats["rms_std"] = max(float(np.std(rms_vals)), 0.005)
        if f0_vals:
            self.stats["f0_mean"] = float(np.mean(f0_vals))
            self.stats["f0_std"] = max(float(np.std(f0_vals)), 5.0)
        if f0var_vals:
            self.stats["f0var_mean"] = float(np.mean(f0var_vals))
            self.stats["f0var_std"] = max(float(np.std(f0var_vals)), 1.0)
        if zcr_vals:
            self.stats["zcr_mean"] = float(np.mean(zcr_vals))
            self.stats["zcr_std"] = max(float(np.std(zcr_vals)), 0.01)
```

---

## 9. Privacy Considerations

### What we analyze

- Acoustic features only (pitch, energy, speech rate) -- no semantic content from audio
- STT transcription is separate and already accepted by the user
- Emotion features are ephemeral -- computed per-chunk, smoothed into trajectory, never stored as raw audio features

### User-facing framing

The system should communicate this as "ambient awareness" rather than "emotion detection":

> "MindReflect notices the pace and texture of your voice to adjust its responses. It does not classify your emotions or store voice analysis data. All processing happens on your device."

This is truthful (we track arousal trajectory, not discrete emotions), respects the privacy-first principle, and frames the capability as serving the user rather than monitoring them.

### What NOT to do

- Never display emotion labels to the user ("you seem angry")
- Never store per-chunk emotion features
- Never send emotion data anywhere
- Never use emotion data to make clinical inferences
- The emotion signal is a soft input to the turn-taking engine and canvas -- it augments, never determines, system behavior

---

## 10. Implementation Plan

### Phase 1: Heuristic arousal (M1 dependency, no ML)

1. Create `geno-voice/emotion/features.py` -- extract RMS, F0 (autocorrelation), ZCR from PCM chunks
2. Create `geno-voice/emotion/baseline.py` -- `SpeakerBaseline` class
3. Create `geno-voice/emotion/trajectory.py` -- `EmotionalTrajectory` class (dual EMA)
4. Create `geno-voice/emotion/detector.py` -- `EmotionDetector` facade
5. Integrate into audio processing loop, feed results to `TurnTakingEngine`
6. Add crying/voice-breaking detection (jitter + shimmer heuristic, requires parselmouth)

**Dependencies:** numpy (already installed). Optional: parselmouth for jitter/shimmer.
**Estimated effort:** 1-2 sessions.
**Validation:** Record test audio with known emotional content, verify trajectory tracks visible emotional shifts.

### Phase 2: Wav2Small integration (optional, enhances accuracy)

1. Download Wav2Small ONNX model (120KB)
2. Create `geno-voice/emotion/wav2small.py` -- ONNX inference wrapper
3. Run Wav2Small in parallel with heuristic features
4. Blend: `final_arousal = 0.6 * heuristic + 0.4 * wav2small` (or use wav2small as a calibration check)
5. Benchmark latency on Apple Silicon

**Dependencies:** onnxruntime
**Estimated effort:** 1 session.

### Phase 3: Canvas mapping (M2)

1. Define the emotion-to-canvas parameter mapping (section 7.5 above)
2. Emit render blocks from the LLM or directly from the emotion detector
3. Implement smooth transitions (2-second lerp between emotional states)
4. Test with real speech and iterate on visual feel

**Dependencies:** mind-render particle engine (already exists).
**Estimated effort:** 2-3 sessions (mostly aesthetic iteration).

### Phase 4: Valence from LLM (M2 enhancement)

1. Add a "emotional valence" field to the LLM's background processing output
2. Combine audio-arousal with text-valence for richer canvas signal
3. Map valence to color temperature in the canvas

**Dependencies:** LLM background processing pipeline (M1).

---

## 11. Sources

### Models and Tools

- [audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim](https://huggingface.co/audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim) -- 200M param dimensional emotion model, ONNX available
- [audeering/w2v2-how-to](https://github.com/audeering/w2v2-how-to) -- inference tutorial for the above
- [dkounadis/wav2small](https://github.com/dkounadis/wav2small) -- 72K param distilled model, 120KB ONNX
- [Wav2Small paper (arXiv:2408.13920)](https://arxiv.org/abs/2408.13920) -- distillation approach, benchmarks
- [SpeechBrain emotion-recognition-wav2vec2-IEMOCAP](https://huggingface.co/speechbrain/emotion-recognition-wav2vec2-IEMOCAP) -- categorical SER model
- [openSMILE](https://github.com/audeering/opensmile) -- comprehensive audio feature extraction (C++ with Python wrapper)
- [openSMILE Python](https://github.com/audeering/opensmile-python) -- Python API for openSMILE
- [Parselmouth](https://github.com/YannickJadoul/Parselmouth) -- Praat algorithms in Python
- [CREPE](https://github.com/marl/crepe) -- neural pitch estimation (tiny to full models)
- [librosa](https://librosa.org/doc/main/) -- audio analysis (pYIN F0, spectral features, streaming)
- [Pipecat parallel pipeline](https://docs.pipecat.ai/guides/learn/pipeline) -- frame-based audio processing

### Research

- [Speech Emotion Recognition in Mental Health: Systematic Review (JMIR 2025)](https://mental.jmir.org/2025/1/e74260) -- features, accuracy, clinical applications
- [Russell's Circumplex Model of Affect (1980)](https://pdodds.w3.uvm.edu/research/papers/others/1980/russell1980a.pdf) -- arousal x valence framework
- [How Anxiety State Influences Speech Parameters (PMC 2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11939969/) -- anxiety and speaking patterns
- [Speech Features as Predictors of Depression Severity (PMC 2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10835582/) -- depression and voice
- [Vocal indicators of mood change in depression (Springer)](https://link.springer.com/article/10.1007/BF02253071) -- speech rate and mood
- [Emotion Recognition from Speech Using Wav2vec 2.0 (arXiv:2104.03502)](https://arxiv.org/abs/2104.03502) -- transfer learning for SER
- [Feature selection for emotion recognition in speech (PMC 2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12453713/) -- filter vs wrapper feature selection
- [Wav2Small: Distilling wav2Vec2 to 72K parameters (audEERING)](https://www.audeering.com/publications/distilling-wav2vec2-to-72k-paramters/) -- knowledge distillation
- [SwiftF0: Fast and Accurate Monophonic Pitch Detection (arXiv:2508.18440)](https://arxiv.org/html/2508.18440v1) -- 95K params, 42x faster than CREPE
