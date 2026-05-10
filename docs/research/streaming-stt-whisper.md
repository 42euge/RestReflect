# Continuous Streaming STT with Whisper on Apple Silicon

## Research Date: 2026-05-09

## Context

MindReflect is a reflection/mindfulness app where users talk for extended periods (minutes, not seconds). We need continuous STT that transcribes in real-time as the user speaks so an LLM can process the transcript in the background (writing notes, summaries, wiki entries) while the user is still talking.

Current stack: `mlx-community/whisper-large-v3-turbo` via mlx-whisper, Silero VAD (RMS-based silence detection, threshold 0.02, min chunk 0.5s), Apple Silicon Mac, Pipecat as the voice pipeline framework.

---

## 1. Chunking Strategy for Whisper

### The fundamental constraint

Whisper has a 30-second receptive field. It processes audio in fixed windows and was designed for batch processing, not streaming. Every streaming approach is a workaround that simulates real-time behavior on top of a batch model.

### Chunk size tradeoffs

| Chunk size | Latency | Accuracy | Use case |
|---|---|---|---|
| 1-2s | Very low (~1-2s) | Poor (partial words, hallucination risk) | Speculative preview only |
| 3-5s | Low (~3-5s) | Moderate (some boundary errors) | Real-time streaming |
| 5-10s | Medium (~5-10s) | Good (most utterances complete) | **Recommended for MindReflect** |
| 10-20s | High (~10-20s) | Very good (full sentences) | Near-batch quality |
| 20-30s | Very high | Excellent (near-batch) | Batch processing |

**Recommendation for MindReflect: VAD-guided chunks of 5-10 seconds.** This gives good accuracy with latency acceptable for background LLM processing (we do not need instant word-by-word display -- we need the transcript available for note-taking tools).

### Word boundary handling

Three strategies for preventing mid-word cuts:

1. **VAD-guided segmentation (recommended):** Use VAD to find silence boundaries. Accumulate audio until a minimum duration threshold is reached, then finalize at the next silence boundary. Silence-based chunking produces ~0.4 word-boundary errors per boundary vs ~2.3 with fixed-length cuts.

2. **Overlap:** Process segments like 0-5s, 4-8s, 7-12s with 1s overlap, then deduplicate text at boundaries. Adds compute overhead but prevents drops.

3. **LocalAgreement:** Reprocess the buffer with each new chunk. Confirm words only when two consecutive passes agree on the same prefix. More compute but highest quality (see Section 2).

### Whisper hallucination on short/silent chunks

Whisper is prone to hallucination on silence or near-silence:
- Fabricated phrases appear when processing audio with no speech
- Silences at the beginning/end of chunks directly trigger hallucinations
- Short chunks under 1-2s are especially vulnerable

**Mitigations:**
1. **VAD pre-filter (essential):** Only send speech-containing audio to Whisper. Skip silence entirely.
2. **`no_speech_prob` threshold:** Reject transcriptions where Whisper's own no-speech probability exceeds 0.4-0.6 (Pipecat MLX default: 0.6).
3. **Min chunk duration:** Never send chunks shorter than 0.5-1.0s to Whisper.
4. **Hallucination silence threshold parameter:** In some implementations, this skips segments with silence longer than a threshold.

---

## 2. Streaming Whisper Implementations

### whisper-streaming (Machaček et al., UFAL)

- **How it works:** Implements LocalAgreement-2 policy. On each new audio chunk (~1s), reprocesses the entire buffer from the last sentence boundary. Compares output with previous pass. Words confirmed when two consecutive passes agree.
- **Latency:** ~3.3s on long-form speech (paper benchmark). Final emission latency = ~2x chunk size.
- **MLX backend:** Supported via `--backend mlx-whisper`. Install with `pip install mlx-whisper`.
- **Local-first:** Yes, fully local.
- **Verdict:** Solid approach but being superseded by SimulStreaming/WhisperLiveKit in 2025-2026.

### WhisperLiveKit (QuentinFuxa)

- **How it works:** Built on SimulStreaming (SOTA 2025). Uses AlignAtt policy (encoder-decoder attention to determine which source audio is being decoded at each step). Supports both LocalAgreement and AlignAtt via `--backend-policy`.
- **MLX backend:** Native support via `--backend mlx-whisper` or `voxtral-mlx`. Install with `uv sync --extra mlx-whisper`.
- **Latency:** Under 200ms with large-v3 using AlignAtt.
- **Integration:** WebSocket at `ws://localhost:8000/asr`, OpenAI-compatible REST at `/v1/audio/transcriptions`, Deepgram protocol compatible.
- **Extras:** Speaker diarization, 100+ language support.
- **Verdict:** **Best standalone streaming Whisper option.** Could be used as the STT backend behind Pipecat via WebSocket.

### faster-whisper (SYSTRAN)

- **How it works:** CTranslate2 backend, CPU/CUDA only. VAD-based segmentation with Silero VAD built in (`vad_filter=True`).
- **Apple Silicon:** No Metal/MLX support. CPU-only on Mac.
- **Verdict:** Best option for CUDA systems, not ideal for Apple Silicon.

### whisper.cpp (ggml-org)

- **How it works:** C/C++ port with Metal acceleration. Stream mode processes chunks and outputs incrementally.
- **Apple Silicon:** Metal GPU acceleration out of the box. Core ML integration for 2-3x speedup via ANE.
- **Performance:** ~10x real-time on M2 Pro with large-v3-turbo. Every Apple Silicon Mac handles real-time.
- **Verdict:** Excellent raw performance. Good option if we need to bypass Python overhead. Less ergonomic for Pipecat integration (C++ FFI needed).

### MLX Whisper (ml-explore/mlx-examples)

- **Streaming:** No native streaming API. `mlx_whisper.transcribe()` is a batch call.
- **Workaround:** Call `transcribe()` repeatedly on accumulated chunks. This is what whisper-streaming's MLX backend does.
- **Known issue:** Memory leak when using `word_timestamps=True` -- ~10MB per iteration growth. Fixed or mitigated in recent versions (issue closed).
- **Verdict:** Our current engine. Works well for batch; streaming requires a wrapper pattern.

### mlx-audio (Blaizzy)

- **Streaming:** Has `stream_transcribe()` for some models (VibeVoice-ASR, Parakeet, Voxtral). Whisper support via standard transcribe.
- **API:** OpenAI-compatible server at `/v1/audio/transcriptions`.
- **Models:** Whisper, Qwen3-ASR, Parakeet, Voxtral Realtime (4B, streaming-native).
- **Verdict:** Interesting for the Voxtral Realtime model which is natively streaming. Worth watching as an alternative to Whisper.

### lightning-whisper-mlx (mustafaaljadery)

- **Claims:** 10x faster than whisper.cpp, 4x faster than standard mlx-whisper.
- **How:** Batched decoding, distilled models, quantization.
- **Verdict:** Speed claims are notable but unverified. Worth benchmarking.

### WhisperPipe (April 2026 paper)

- **Architecture:** Hybrid VAD (Silero + energy-based filtering, 34% fewer false activations), dynamic buffering with overlapping context windows, adaptive processing.
- **Performance:** 89ms median latency, 142ms P90. 48% less GPU memory, 80.9% lower GPU usage. Within 2% WER of offline Whisper. Zero memory growth over 150 minutes.
- **Verdict:** State-of-the-art research. Not yet a reusable library, but the architecture is worth emulating.

---

## 3. Pipecat STT Integration

### What Pipecat provides

Pipecat has two local Whisper STT services:

1. **`WhisperSTTService`** — Uses faster-whisper. CPU/CUDA. Not ideal for Apple Silicon.
2. **`WhisperSTTServiceMLX`** — Uses mlx-whisper. Apple Silicon native. Metal GPU.

Both extend **`SegmentedSTTService`**, which:
1. Accumulates audio between `VADUserStartedSpeakingFrame` and `VADUserStoppedSpeakingFrame`
2. On VAD stop, processes the complete buffer as a single batch
3. Calls the abstract `run_stt()` method with the complete segment
4. Emits `TranscriptionFrame` (final) and optionally `InterimTranscriptionFrame` (partial)

### MLXWhisperSTTService details

```python
from pipecat.services.whisper.stt import WhisperSTTServiceMLX, MLXModel, Language

stt = WhisperSTTServiceMLX(
    settings=WhisperSTTServiceMLX.Settings(
        model=MLXModel.LARGE_V3_TURBO,
        language=Language.EN,
        no_speech_prob=0.6,  # hallucination rejection threshold
        temperature=0.0,
    )
)
```

Available MLX models: `TINY`, `MEDIUM`, `LARGE_V3`, `LARGE_V3_TURBO`, `DISTIL_LARGE_V3`, `LARGE_V3_TURBO_Q4`.

### The Pipecat turn-based limitation

**Critical finding:** Pipecat's `SegmentedSTTService` is designed for conversational turn-taking. It waits for VAD to signal "user stopped speaking" before transcribing. This is wrong for MindReflect's use case where the user speaks for minutes continuously.

In our use case, the user may speak for 3-5 minutes without a long pause. The VAD would never trigger "stopped speaking," and no transcription would occur until they stop.

### Solution strategies for continuous transcription in Pipecat

**Option A: Custom FrameProcessor wrapping WhisperLiveKit**
- Run WhisperLiveKit as a local WebSocket server
- Build a Pipecat `WebsocketSTTService` subclass that streams audio to WhisperLiveKit
- WhisperLiveKit handles chunking, LocalAgreement/AlignAtt, and emits partial/final transcripts
- Pipecat receives transcription frames and routes to the ParallelPipeline

**Option B: Custom SegmentedSTTService with time-based chunking**
- Override the VAD-triggered segmentation
- Instead: emit a transcription every N seconds of speech (regardless of VAD)
- Use VAD only for silence detection (skip silent chunks)
- Simpler but less accurate at boundaries

**Option C: Hybrid -- geno-voice as Pipecat STT backend**
- Enhance geno-voice's existing WhisperEngine with streaming support
- Run geno-voice at localhost:5111 with a WebSocket endpoint for streaming STT
- Pipecat connects via WebSocket transport
- Keeps voice processing in our own codebase

**Recommendation: Option A (WhisperLiveKit)** for quality, with Option C as the long-term migration path once we understand the streaming patterns.

---

## 4. Apple Silicon Performance

### Real-time factors for whisper-large-v3-turbo

| Chip | 10s audio | RTF | Meets real-time? |
|---|---|---|---|
| M1 | ~1.4s | 0.14x | Yes (7x faster) |
| M2 | ~1.1s | 0.11x | Yes (9x faster) |
| M3 Pro | ~0.9s | 0.09x | Yes (11x faster) |
| M4 | ~0.8s | 0.08x | Yes (12x faster) |

For our 5-10s chunk strategy: a 5s chunk transcribes in ~0.5-0.7s on M1. A 10s chunk in ~1.0-1.4s. Both well within real-time requirements.

### Memory footprint

| Component | Memory | Notes |
|---|---|---|
| whisper-large-v3-turbo (fp16) | ~1.6 GB | Model weights |
| whisper-large-v3-turbo-q4 | ~0.5 GB | 4-bit quantized |
| Gemma 4 12B (q4) | ~7 GB | Via Ollama |
| Gemma 4 27B (q4) | ~16 GB | Via Ollama |
| Silero VAD | ~0.1 GB | Tiny model |
| Kokoro TTS | ~0.3 GB | Lightweight |
| **Total (12B LLM)** | **~9-10 GB** | Fits in 16 GB Mac |
| **Total (27B LLM)** | **~18-19 GB** | Needs 32 GB Mac |

### Concurrent inference: Whisper + Gemma on the same GPU

Apple Silicon's unified memory architecture enables this:
- CPU and GPU share the same physical address space -- zero-copy tensor operations
- No PCIe transfer overhead between CPU RAM and GPU VRAM
- MLX supports lazy evaluation, fusing operations and reducing memory allocation overhead
- Both models can be loaded simultaneously; Metal GPU time-slices between them

**Practical behavior:** When both models are active simultaneously, they compete for GPU compute time (not memory bandwidth). MLX does not yet have a built-in scheduler for multi-model inference. In practice:
- Whisper inference (0.5-1.4s for a 5-10s chunk) blocks during that brief window
- Gemma inference can run during the pauses between Whisper calls
- For MindReflect, this works well: transcribe a chunk -> send text to Gemma -> transcribe next chunk

**Risk:** If both are running simultaneously, throughput degrades. The Pipecat ParallelPipeline helps here by sequencing: STT runs first, then sends frames to the background LLM branch.

---

## 5. Incremental / Speculative Transcription

### How it works in practice

Real-time transcription systems show two types of results:

1. **Partial (interim):** Text that may change as more audio arrives. Displayed in gray/italic. Updated every 0.5-1s.
2. **Final (confirmed):** Text that is locked in. Displayed normally. Not revised.

### Implementation approaches

**LocalAgreement (whisper-streaming):** Words are "confirmed" when two consecutive transcription passes agree. Unconfirmed words are displayed as partials. Latency to confirmation = ~2x chunk size.

**AlignAtt (SimulStreaming/WhisperLiveKit):** Uses encoder-decoder attention alignment to determine what audio has been "consumed" by each decoded token. More aggressive -- can confirm earlier. Under 200ms latency.

**Simple sliding window:** Process overlapping windows (0-5s, 3-8s, 6-11s). Tokens in the overlap that match are confirmed. Simple to implement, higher compute cost.

### How meeting tools handle it

- **Otter.ai:** ~1-2s latency, WebSocket-based. Shows partial results that refine. Focuses on post-meeting summarization.
- **AssemblyAI Universal-Streaming:** ~300ms latency. Partial and final results via WebSocket. Production-grade.
- **Common pattern:** Audio -> WebSocket -> server buffers -> inference -> delta events back to client. Each response contains newly available text.

### Recommendation for MindReflect

For our use case (background LLM processing, not real-time UI display), we do not need speculative display. The LLM only needs confirmed text. Use LocalAgreement-2 or AlignAtt to get confirmed-only text with 2-5s latency.

If we add a live transcript display in the UI later, show partials in a different style and update them as they become confirmed.

---

## 6. VAD-Guided Chunking

### Current implementation (geno-voice SilenceDetector)

Our current VAD uses RMS amplitude thresholding:
- `threshold`: 0.02 (below this = silence)
- `silence_duration`: 0.8s (pause this long = end of utterance)
- `min_chunk_duration`: 0.5s
- `max_chunk_duration`: 25s

This is simple but effective for detecting utterance boundaries.

### Improvements for continuous streaming

The current VAD is utterance-level: it waits for the user to stop speaking (0.8s silence) before emitting a chunk. For continuous streaming, we need two modes:

1. **Utterance-level (current):** User pauses -> emit chunk -> transcribe. Good for conversational turns.
2. **Time-bounded continuous:** Even if user hasn't paused, emit a chunk every N seconds. Use VAD only to find a nearby silence boundary.

**Proposed algorithm:**

```
min_chunk = 3s
max_chunk = 10s
overlap = 0.5s

while recording:
    accumulate audio in buffer
    
    if buffer_duration >= max_chunk:
        # Must emit now -- find nearest silence boundary in last 2s
        boundary = find_silence_boundary(buffer[-2s:])
        emit(buffer[:boundary])
        keep(buffer[boundary - overlap:])  # overlap for context
    
    elif buffer_duration >= min_chunk AND vad_detects_silence():
        # Natural pause -- emit at boundary
        emit(buffer)
        clear(buffer)
    
    # else: keep accumulating
```

### Upgrading to Silero VAD (neural)

Our current RMS-based detector is fragile -- it cannot distinguish speech from background noise. Silero VAD is a neural model that:
- Runs in ~1ms per 30ms frame on CPU
- Distinguishes speech from noise, music, typing
- Returns probability of speech (0.0-1.0) per frame

Silero VAD is already a dependency in geno-voice (via PyTorch). Upgrading from RMS to Silero for speech detection while keeping the chunking logic would improve robustness.

---

## 7. Recommended Architecture

### Phase 1: Quick win -- WhisperLiveKit behind Pipecat

```
Microphone -> Pipecat InputTransport
                  |
            Raw Audio Frames
                  |
        +---------+---------+
        |                   |
  WhisperLiveKit      Pipecat Pipeline
  (WebSocket STT)          |
  localhost:8000      ParallelPipeline
        |              /         \
  Transcription    Main          Background
  Frames          (conversation)  (notes, wiki)
        |              |              |
        +--------> Gemma 4      Tool Runner
                       |
                  Kokoro TTS
                       |
                  OutputTransport -> Speaker
```

**Setup:**
1. Run WhisperLiveKit: `whisperlivekit-server --backend mlx-whisper --model mlx-community/whisper-large-v3-turbo --language en`
2. Build a Pipecat `WebsocketSTTService` that connects to `ws://localhost:8000/asr`
3. Audio flows: mic -> Pipecat -> WhisperLiveKit -> transcription frames back to Pipecat

### Phase 2: Native integration

Replace WhisperLiveKit with a custom `ContinuousMLXWhisperSTTService` that:
- Extends Pipecat's `STTService` (not `SegmentedSTTService`)
- Uses time-bounded + VAD-guided chunking (from Section 6)
- Calls `mlx_whisper.transcribe()` on each chunk
- Implements LocalAgreement-2 for confirmation
- Emits `InterimTranscriptionFrame` and `TranscriptionFrame`

### Phase 3: Explore alternatives to Whisper

- **Voxtral Realtime (4B):** Mistral's streaming-native speech model via mlx-audio. Natively handles continuous audio without chunking.
- **Parakeet v3:** NVIDIA's streaming ASR, available in mlx-audio.
- **Qwen3-ASR:** Multilingual with forced alignment.

---

## 8. Performance Budget

For a 5-second chunk on M1 (worst case Apple Silicon):

| Stage | Time | Notes |
|---|---|---|
| Audio capture | 5.0s | Wall clock (concurrent) |
| VAD processing | <1ms | Silero VAD, per 30ms frame |
| Whisper inference | ~0.7s | large-v3-turbo on M1 |
| LocalAgreement comparison | <1ms | String prefix matching |
| Total latency | ~0.7s | From end-of-chunk to text |
| **End-to-end latency** | **~5.7s** | From speech to confirmed text |

For background LLM processing, 5.7s latency is acceptable. The LLM receives a stream of confirmed text every 5-10 seconds and can process it incrementally.

On M3/M4, end-to-end latency drops to ~5.4-5.5s (Whisper inference is faster).

---

## 9. Key Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| MLX Whisper memory leak with word_timestamps | Memory grows unbounded over long sessions | Disable word_timestamps (we don't need them). Monitor memory. Periodically restart Whisper process. |
| Whisper hallucination on silence/noise | Garbage text sent to LLM | VAD pre-filter (never transcribe silence). `no_speech_prob` threshold. Min chunk duration. |
| GPU contention between Whisper and Gemma | Both slow down | Sequential scheduling via ParallelPipeline. Whisper bursts are short (~0.7s). |
| Chunk boundary word drops | Missing words at chunk edges | VAD-guided boundaries + 0.5s overlap. LocalAgreement-2 for confirmation. |
| Pipecat SegmentedSTTService assumes turns | No transcription during long speech | Custom STT service or WhisperLiveKit backend (bypasses turn assumption). |

---

## 10. Action Items

1. **Spike: WhisperLiveKit integration.** Install WhisperLiveKit with MLX backend. Run locally. Measure latency and accuracy on 3-5 minute continuous speech.

2. **Benchmark: MLX Whisper chunk sizes.** Test 3s, 5s, 7s, 10s chunks with our model on our hardware. Measure RTF and WER.

3. **Build: Pipecat WebSocket STT adapter.** Create a `WebsocketSTTService` subclass that connects to WhisperLiveKit (or geno-voice streaming endpoint).

4. **Upgrade: VAD from RMS to Silero neural.** Replace `SilenceDetector.rms_amplitude()` with Silero VAD probability scoring.

5. **Design: Continuous chunking algorithm.** Implement the time-bounded + VAD-guided chunking from Section 6 in geno-voice.

6. **Evaluate: Voxtral Realtime via mlx-audio.** Test the 4B streaming-native model as a potential Whisper replacement.

---

## Sources

- [whisper-streaming (UFAL)](https://github.com/ufal/whisper_streaming) -- LocalAgreement algorithm, MLX backend
- [WhisperLiveKit](https://github.com/QuentinFuxa/WhisperLiveKit) -- SimulStreaming/AlignAtt, MLX support
- [SimulStreaming (UFAL)](https://github.com/ufal/SimulStreaming) -- AlignAtt policy, SOTA 2025
- [Pipecat Whisper STT docs](https://docs.pipecat.ai/server/services/stt/whisper) -- MLXWhisperSTTService
- [Pipecat MLX Whisper PR #1383](https://github.com/pipecat-ai/pipecat/pull/1383) -- Implementation details
- [Pipecat SegmentedSTTService PR #1409](https://github.com/pipecat-ai/pipecat/pull/1409) -- VAD-triggered segmentation
- [Pipecat STT architecture (DeepWiki)](https://deepwiki.com/pipecat-ai/pipecat/4.4-speech-to-text-services) -- Three base classes
- [mlx-audio](https://github.com/Blaizzy/mlx-audio) -- Streaming STT models including Voxtral Realtime
- [lightning-whisper-mlx](https://github.com/mustafaaljadery/lightning-whisper-mlx) -- Fast MLX Whisper with batched decoding
- [WhisperPipe paper (arXiv:2604.25611)](https://arxiv.org/abs/2604.25611) -- 89ms latency, hybrid VAD, dynamic buffering
- [Turning Whisper into Real-Time Transcription (Machaček et al.)](https://arxiv.org/html/2307.14743) -- Original LocalAgreement paper
- [WhisperX](https://github.com/m-bain/whisperX) -- VAD pre-segmentation, word-level timestamps
- [MLX Whisper memory leak issue #1254](https://github.com/ml-explore/mlx-examples/issues/1254) -- word_timestamps memory growth
- [Whisper hallucination discussion](https://github.com/openai/whisper/discussions/679) -- Mitigation strategies
- [Calm-Whisper (arXiv)](https://arxiv.org/html/2505.12969v1) -- 80% hallucination reduction via head fine-tuning
- [Real-Time Streaming with Whisper guide](https://www.saytowords.com/blogs/Real-Time-Streaming-with-Whisper/) -- Chunk size recommendations
- [Whisper Audio Chunking](https://www.saytowords.com/en/blogs/Whisper-Audio-Chunking/) -- Batch chunking strategies
- [Apple Silicon Whisper benchmarks](https://www.voicci.com/blog/apple-silicon-whisper-performance.html) -- M1-M4 performance
- [MLX Whisper real-time gist (Simon Willison)](https://gist.github.com/simonw/57f9c15bbd9d484f762058f83412aefb) -- Simple real-time example
- [Local Audio Transcription with MLX Whisper](https://www.hylkerozema.nl/2026/02/24/local-audio-transcription-with-mlx-whisper-and-claude-on-apple-silicon/) -- Practical MLX setup
- [MLX vs NVIDIA for local inference](https://www.markus-schall.de/en/2025/11/apple-mlx-vs-nvidia-how-local-ki-inference-works-on-the-mac/) -- Unified memory advantages
- [WWDC25: LLMs with MLX on Apple Silicon](https://developer.apple.com/videos/play/wwdc2025/298/) -- Apple's official MLX guidance
- [Native LLM Inference at Scale on Apple Silicon](https://arxiv.org/html/2601.19139v2) -- vllm-mlx concurrent model serving
- [On-Premise Voice AI with Pipecat](https://webrtc.ventures/2025/03/on-premise-voice-ai-creating-local-agents-with-llama-ollama-and-pipecat/) -- Local Pipecat deployment
- [Pipecat GitHub](https://github.com/pipecat-ai/pipecat) -- Framework source
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) -- C++ port with Metal acceleration
- [whisper.cpp on Apple Silicon (Fazm)](https://fazm.ai/blog/whisper-cpp-apple-silicon-voice-recognition-local) -- Metal performance
- [whisper.cpp on M4 Mac mini](https://itblog.today/blog/building/whisper-metal.html) -- Turbo benchmarks
- [Streaming Whisper MLX vs faster-whisper (Medium)](https://medium.com/@GenerationAI/streaming-with-whisper-in-mlx-vs-faster-whisper-vs-insanely-fast-whisper-37cebcfc4d27) -- Comparative benchmarks
- [AssemblyAI real-time guide](https://www.assemblyai.com/blog/real-time-speech-to-text) -- Production streaming architecture
