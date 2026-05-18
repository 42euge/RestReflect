# R4 — Compute Monitor / Resource Orchestration for Apple Silicon

Research deliverable for [AGENT-RESEARCH.md](../../../AGENT-RESEARCH.md) topic R4 (compute-monitor).

**Supports:** M1 (compute monitor)

---

## 1. Apple Silicon Unified Memory for Concurrent ML Inference

### 1.1 Architecture fundamentals

Apple Silicon uses a **unified memory architecture (UMA)** where CPU, GPU, and Neural Engine share the same physical memory pool. There is no discrete VRAM -- the GPU reads model weights directly from system RAM without PCIe bus transfers. This eliminates the copy overhead that plagues NVIDIA setups but introduces shared contention for the same bandwidth.

Key properties:

| Property | Implication |
|----------|-------------|
| Single memory pool | All three models coexist without "uploading to GPU" -- they are already there |
| No VRAM limit | The GPU can address up to ~75% of physical RAM (`recommendedMaxWorkingSetSize`) |
| Memory bandwidth shared | CPU, GPU, and ANE compete for the same memory bandwidth (M1: 68 GB/s, M2: 100 GB/s, M3: 150 GB/s, M4: 120 GB/s) |
| No hardware preemption | Metal does not preempt running GPU kernels the way CUDA MPS can -- long-running compute kernels block others until completion |

### 1.2 Memory budget for our three-model stack

| Model | Framework | Parameters | Memory (loaded) | Notes |
|-------|-----------|------------|------------------|-------|
| Whisper large-v3-turbo | MLX | 809M | ~1.6 GB | 1.6 GB download; can drop to ~0.4 GB with INT8 quantization |
| Gemma 4 E2B (background) | Ollama (MLX backend) | ~2B effective | ~1.5 GB (Q4_K_M) | For tool use / notes / summaries |
| Gemma 4 E4B (conversation) | Ollama (MLX backend) | ~4B effective | ~3.5 GB (Q4_K_M) | Main conversation; add 1-4 GB for KV cache on longer contexts |
| Kokoro 82M | PyTorch (MPS) | 82M | ~0.3 GB | Under 1 GB at FP16; ~80 MB quantized |

**Total baseline: ~7 GB** (Whisper + E2B + Kokoro, all loaded simultaneously)

**With E4B for conversation: ~9 GB** (swap E2B for E4B during active dialogue)

| Machine | Total RAM | Available for GPU (~75%) | Fits? |
|---------|-----------|--------------------------|-------|
| 16 GB Mac | 16 GB | ~12 GB | Yes for E2B stack (~7 GB), tight with E4B (~9 GB) + OS + apps |
| 32 GB Mac | 32 GB | ~24 GB | Comfortable for all configurations |
| 64 GB Mac | 64 GB | ~48 GB | No concerns |

On a **16 GB machine**, running the full E4B stack (~9 GB models + KV cache) alongside macOS and Electron leaves roughly 3-4 GB of headroom. This works but memory pressure will reach "warn" level under heavy KV cache usage. If macOS starts swapping to disk, token generation can drop from 40 tok/s to 2 tok/s. The **32 GB configuration is recommended** for comfortable three-model operation.

### 1.3 Can MLX and Ollama run simultaneously on Metal?

**Yes, but they serialize on the GPU.** Here is how it works:

1. **Metal command queues are per-process.** Each process (MLX for Whisper, Ollama for Gemma) creates its own `MTLCommandQueue` and submits command buffers independently.

2. **The macOS GPU scheduler interleaves command buffers** from different processes using a FIFO-like scheduler at the command buffer level. It does not preempt a running kernel mid-execution.

3. **Apple GPUs have independent hardware channels** for vertex, fragment, and compute workloads. Multiple compute workloads from different processes can overlap if they fit within the GPU's execution units, but in practice, large ML kernels (matrix multiplications) saturate the GPU during their quantum.

4. **The practical result is coarse-grained time-sharing.** If Whisper is running a matrix multiply on MLX, Ollama's Gemma inference waits for that kernel to complete, then gets its turn. Individual kernel durations are typically 0.1-10ms, so the interleaving is fairly fine-grained at the command buffer level, even though there is no true preemption within a kernel.

5. **PyTorch MPS (Kokoro)** adds a third Metal command queue. Same interleaving applies.

**Bottom line:** They can run concurrently from the user's perspective. The GPU time-shares between them at command-buffer granularity. There will be throughput reduction (each model gets a fraction of GPU cycles) but not deadlock or starvation.

---

## 2. Resource Contention Analysis

### 2.1 Scenario analysis

#### Scenario A: User speaking (STT active, LLM background processing)

- **STT (Whisper):** Processing 2-5 second audio chunks, each taking ~50-200ms of GPU time on Apple Silicon (Whisper large-v3-turbo runs at 4-8x real-time on M1/M2)
- **LLM (Gemma E2B background):** Running tool calls (update notes, summarize) between STT chunks
- **Contention level: LOW.** STT processes a chunk in bursts with gaps between chunks. The LLM can use the gaps. Even with overlap, the GPU interleaves command buffers at sub-millisecond granularity.
- **Risk:** If the LLM is mid-generation when a new audio chunk arrives, Whisper's chunk processing adds ~50-100ms latency due to GPU sharing. This is acceptable -- the user will not notice 50ms on top of the natural VAD + chunk buffer delay.

#### Scenario B: LLM generating response, TTS streaming first sentence

- **LLM (Gemma E4B):** Generating tokens at 10-40 tok/s (depending on machine), each token requiring a forward pass
- **TTS (Kokoro):** Synthesizing the first complete sentence while LLM continues generating
- **Contention level: MODERATE.** Both need sustained GPU access. LLM generation is latency-sensitive (each token adds to response time). TTS synthesis for a sentence takes ~50-100ms on Apple Silicon with CoreML/ANE.
- **Mitigation:** Kokoro on CoreML/ANE can offload TTS to the Neural Engine entirely, leaving GPU free for LLM. If using PyTorch MPS, the GPU is shared, but Kokoro's 82M model uses minimal compute per synthesis pass.

#### Scenario C: All three active simultaneously

- **STT:** Transcribing current speech
- **LLM:** Processing previous chunk (generating notes or continuing a response)
- **TTS:** Playing a backchannel cue ("mhmm")
- **Contention level: MODERATE-HIGH on 16 GB, LOW-MODERATE on 32 GB.** Memory bandwidth becomes the bottleneck, not compute. All three models reading weights from the same memory bus.
- **Practical impact:** STT latency may increase by 30-50%, LLM throughput drops by 20-40%, TTS still completes fast due to small model size. The user perceives slightly slower transcription and slightly delayed LLM responses, but TTS backchannel cues play on time because Kokoro is tiny.

### 2.2 The real bottleneck: memory bandwidth, not compute

Apple Silicon ML inference is **memory-bandwidth-bound**, not compute-bound. LLM token generation reads the full model weights per token. Three models reading weights simultaneously triple the bandwidth demand:

- M2: 100 GB/s shared. Gemma E4B at Q4_K_M (~3.5 GB weights) needs ~3.5 GB/read per token. At 30 tok/s that is ~105 GB/s -- already saturating bandwidth for the LLM alone.
- Adding Whisper + Kokoro reads pushes bandwidth demand above capacity, causing all three to slow proportionally.

This is why **scheduling matters**: not to avoid crashes, but to avoid all three models degrading each other's throughput simultaneously.

---

## 3. Scheduling Strategy Recommendations

### 3.1 Recommended: Event-driven priority scheduling

The right architecture is **event-driven with priorities**, not time-slicing or round-robin. Here is why:

| Strategy | Pros | Cons | Verdict |
|----------|------|------|---------|
| Time-slicing | Fair, simple | Wastes GPU on idle models, adds latency to urgent tasks | Poor fit |
| Round-robin | Simple | Same as time-slicing | Poor fit |
| Pure priority (preemptive) | Optimal latency for high-priority | Complex, requires true preemption (Metal cannot do this) | Not feasible at kernel level |
| **Event-driven + soft priority** | Natural fit for voice pipeline, respects real-time constraints | Requires careful design | **Recommended** |

### 3.2 Priority model

```
Priority 1 (CRITICAL): STT — user-facing input latency
Priority 2 (HIGH):     TTS — user-facing output latency  
Priority 3 (NORMAL):   LLM conversation — response generation
Priority 4 (LOW):      LLM background — notes, summaries, tool use
```

### 3.3 Event-driven scheduling rules

The compute monitor should implement these rules:

1. **STT is always-on during user speech.** VAD triggers chunk processing. Nothing preempts this.

2. **TTS fires on demand.** When there is a sentence to synthesize, TTS runs immediately. For backchannel cues, pre-synthesize the cue bank at startup (see below).

3. **LLM runs in gaps.** The LLM processes during silence (STT idle) or between TTS synthesis bursts. It does not need real-time guarantees -- a 200ms delay in starting LLM inference is invisible to the user.

4. **Preemption is cooperative, not hardware.** Since Metal cannot preempt kernels:
   - TTS preemption: Stop feeding new text to Kokoro when user starts speaking. Audio already synthesized continues playing (it is in the audio buffer). This is effectively instant.
   - LLM preemption: Set a cancellation flag checked between token generations. Ollama supports request cancellation via the API. Response time: <50ms (one token generation cycle).
   - STT preemption: Never preempted.

5. **Pre-synthesize backchannel cues.** Generate "mhmm", "I see", "go on", etc. at startup and cache the audio. Playing a cached cue requires zero GPU -- it is just PCM playback. This eliminates TTS/STT contention for the most common TTS use case.

### 3.4 Practical scheduling with Pipecat

Pipecat's architecture already supports this pattern:

- **ParallelPipeline** runs branches concurrently using asyncio tasks. Each branch (STT, LLM, TTS) processes frames independently.
- **Frame-based architecture** means each stage processes frames as they arrive -- this is inherently event-driven.
- **SyncParallelPipeline** synchronizes output ordering when needed (e.g., ensuring TTS output sentences match LLM generation order).
- **Producer/Consumer processors** enable cross-branch communication (e.g., STT branch signals LLM branch that the user stopped speaking).

What Pipecat does NOT do:
- It has **no built-in GPU resource management.** It does not know or care that STT, LLM, and TTS share a GPU.
- It has **no priority system** for frame processing.
- Resource contention is handled implicitly by the OS GPU scheduler (Metal).

This means: **Pipecat handles the pipeline orchestration, but we need a lightweight compute monitor on top** to implement the priority and preemption rules.

---

## 4. Compute Monitor Architecture

### 4.1 Recommended design: thin coordinator, not a scheduler

Do not build a full GPU scheduler. The OS handles GPU time-sharing adequately. Instead, build a **thin coordinator** that:

1. **Tracks pipeline state** (who is active: STT, TTS, LLM)
2. **Gates LLM requests** (hold LLM work while STT is processing a burst)
3. **Manages preemption signals** (cancel LLM generation when user starts speaking)
4. **Monitors resource pressure** (memory pressure, GPU utilization)
5. **Reports metrics** (for debugging and tuning)

### 4.2 Implementation sketch

```python
import asyncio
from enum import Enum, auto
from dataclasses import dataclass, field

class Priority(Enum):
    CRITICAL = auto()  # STT
    HIGH = auto()      # TTS
    NORMAL = auto()    # LLM conversation
    LOW = auto()       # LLM background

class PipelineState(Enum):
    IDLE = auto()
    USER_SPEAKING = auto()       # STT active
    GENERATING = auto()          # LLM active
    SYNTHESIZING = auto()        # TTS active
    LISTENING_AND_THINKING = auto()  # STT + LLM background

@dataclass
class ComputeMonitor:
    state: PipelineState = PipelineState.IDLE
    _llm_gate: asyncio.Event = field(default_factory=asyncio.Event)
    _cancel_llm: asyncio.Event = field(default_factory=asyncio.Event)
    
    def __post_init__(self):
        self._llm_gate.set()  # LLM allowed by default
    
    async def on_vad_start(self):
        """User started speaking -- prioritize STT."""
        self.state = PipelineState.USER_SPEAKING
        self._cancel_llm.set()      # Signal LLM to stop generating
        # TTS: stop feeding new text (audio buffer plays out naturally)
    
    async def on_vad_stop(self):
        """User stopped speaking -- LLM can proceed."""
        self.state = PipelineState.LISTENING_AND_THINKING
        self._cancel_llm.clear()
        self._llm_gate.set()
    
    async def gate_llm(self):
        """Called before LLM inference. Blocks if STT needs priority."""
        await self._llm_gate.wait()
    
    def should_cancel_llm(self) -> bool:
        """Checked between LLM token generations."""
        return self._cancel_llm.is_set()
```

### 4.3 Integration with Pipecat

The compute monitor integrates as a Pipecat processor that sits at the pipeline junction:

```
Audio In → VAD → [ComputeMonitor] → STT → Context Aggregator
                       ↓
                  LLM (gated) → TTS → Audio Out
                       ↓
                  LLM Background (low priority)
```

The `ComputeMonitor` processor:
- Listens for `VADStartFrame` and `VADStopFrame` to track user speech state
- Gates `LLMRequestFrame` forwarding based on priority
- Emits `CancelFrame` to the LLM branch when preemption is needed
- Passes through all other frames unchanged

### 4.4 What we do NOT need to build

- **GPU kernel scheduler**: macOS Metal handles this. We cannot improve on it from userspace.
- **Memory manager**: Ollama manages model loading/unloading via `OLLAMA_KEEP_ALIVE` and `OLLAMA_MAX_LOADED_MODELS`. MLX handles its own memory. PyTorch MPS handles Kokoro's memory.
- **Thread pool / actor system**: Pipecat's asyncio event loop is sufficient. Adding Ray, Celery, or an actor framework would be overengineering.
- **Continuous batching**: We have one user. Batching is for multi-user serving.

---

## 5. Monitoring GPU Utilization from Python

### 5.1 Available tools

| Tool | Method | Sudo required | Python API | Metrics |
|------|--------|---------------|------------|---------|
| `powermetrics` | macOS built-in | Yes | No (parse stdout) | GPU frequency, active/idle residency, power |
| `asitop` | Wraps powermetrics | Yes | No (TUI only) | GPU/CPU/ANE utilization, power, frequency |
| `macmon` | Private macOS API | No | No (Rust TUI, JSON export) | GPU/CPU/ANE utilization, power, temp |
| `macgputils` | Wraps powermetrics | Yes | **Yes** (`pip install macgputils`) | GPU power, frequency, active/idle residency |
| `metalgpu` | Metal API via Python | No | **Yes** | Metal device properties, buffer allocation |
| `apple-gpu` | IOKit / private APIs | No | **Yes** (`pip install apple-gpu`) | GPU utilization percentage |

### 5.2 Recommended approach for the compute monitor

Use **`macgputils`** for periodic sampling (every 1-5 seconds) and **memory pressure** via `os.sysconf` or `psutil`:

```python
# GPU utilization (requires sudo or elevated privileges)
import macgputils
stats = macgputils.get_gpu_stats(samples=1)
gpu_active = stats['HW Active Residency']  # percentage
gpu_power = stats['GPU Power']              # milliwatts

# Memory pressure (no sudo needed)
import subprocess
result = subprocess.run(
    ['sysctl', 'kern.memorystatus_vm_pressure_level'],
    capture_output=True, text=True
)
# Returns 1 (normal), 2 (warn), 4 (critical)

# Per-process GPU time (limited on Apple Silicon)
# powermetrics --show-process-gpu gives "GPU ms/s" but values
# are unreliable on Apple Silicon. Use total GPU residency instead.
```

For **non-sudo** monitoring, use the `macmon` JSON output mode or parse `/usr/bin/vm_stat` for memory pressure indicators.

### 5.3 What to monitor and when to act

| Metric | Source | Threshold | Action |
|--------|--------|-----------|--------|
| Memory pressure | `sysctl kern.memorystatus_vm_pressure_level` | Level 2 (warn) | Unload LLM background model |
| Memory pressure | same | Level 4 (critical) | Pause all LLM inference, alert user |
| GPU active residency | macgputils | > 95% sustained | Defer low-priority LLM work |
| GPU power | macgputils | Near TDP | Informational only (thermal throttling handled by OS) |
| Ollama model status | `GET /api/ps` | Model not loaded | Pre-load before needed |

---

## 6. Ollama Configuration for Multi-Model Setup

### 6.1 Recommended settings

```bash
# Keep models loaded permanently (no cold-start latency)
export OLLAMA_KEEP_ALIVE="-1"

# Allow two models loaded simultaneously (E2B + E4B, or just E4B)
export OLLAMA_MAX_LOADED_MODELS=2

# Single-user, single-request (no batching overhead)
export OLLAMA_NUM_PARALLEL=1
```

### 6.2 Ollama MLX backend (preview, March 2026)

As of Ollama 0.19, the MLX backend is available in preview for Apple Silicon. This means Ollama now uses the same Metal compute path as MLX Whisper, which has two implications:

1. **Better performance**: 57% faster prefill, 93% faster decode vs. the llama.cpp Metal backend on M5 Max benchmarks.
2. **Shared framework**: Both Whisper (MLX) and Gemma (Ollama/MLX) use the same MLX runtime. They still run in separate processes with separate command queues, but the underlying kernel dispatch patterns are similar, which means the GPU scheduler handles their interleaving more predictably.

### 6.3 Model loading strategy

- **Startup**: Pre-load Gemma E2B (background model, 1.5 GB) and Kokoro (0.3 GB). Pre-load Whisper (1.6 GB).
- **On conversation start**: Load Gemma E4B (3.5 GB). On 16 GB machines, unload E2B first.
- **On conversation end**: Optionally unload E4B, reload E2B for background processing.
- **Ollama model swap**: Check `/api/ps` to see what is loaded. Use `/api/generate` with the target model to trigger auto-loading.

---

## 7. Kokoro TTS Optimization for Apple Silicon

### 7.1 Framework options

| Framework | Latency | GPU usage | Complexity |
|-----------|---------|-----------|------------|
| PyTorch MPS | Moderate | Shared Metal GPU | Simple but MPS fallback issues (aten::angle not supported) |
| CoreML / ANE | **Best** (22x real-time on M1) | **Neural Engine** (frees GPU) | Requires model conversion |
| MLX (mlx-audio) | Good | Shared Metal GPU | Emerging, native Apple Silicon |

### 7.2 Recommendation: CoreML for Kokoro

The strongest option is converting Kokoro to CoreML and running it on the **Apple Neural Engine (ANE)**. This completely eliminates GPU contention between TTS and STT/LLM:

- The [kokoro-coreml](https://github.com/mattmireles/kokoro-coreml) project provides a PyTorch-to-CoreML conversion pipeline
- ANE inference achieves 22x real-time on M1 (30 seconds of speech in 1.2 seconds)
- The ANE is a separate compute unit -- it does not share the GPU execution pipeline
- The ANE does share memory bandwidth, but Kokoro's 82M model reads <0.1 GB per synthesis pass, which is negligible

If CoreML conversion is not feasible, **mlx-audio** with the Kokoro model is the second-best option, keeping everything in the MLX ecosystem.

### 7.3 Pre-synthesize backchannel cue bank

At startup, synthesize the full cue bank and cache as PCM audio:

```python
BACKCHANNEL_CUES = [
    "mhmm", "right", "I see", "go on", "okay",
    "yeah", "sure", "uh huh", "interesting",
]

# Pre-synthesize at startup (takes ~2-5 seconds total)
cue_cache = {}
for cue in BACKCHANNEL_CUES:
    cue_cache[cue] = kokoro.synthesize(cue)

# Playing a cue = zero GPU, just audio buffer write
def play_backchannel(cue: str):
    audio_output.write(cue_cache[cue])
```

This eliminates TTS GPU contention for the most frequent TTS use case (backchannel cues during user speech).

---

## 8. Existing Approaches and Prior Art

### 8.1 eauchs/speech-to-speech-pipeline

The closest existing project to RestReflect's architecture. It runs Whisper + Ollama + Kokoro locally on Apple Silicon with:
- asyncio + queues for pipeline coordination
- VAD-guided chunking for STT
- SSE streaming from Ollama for LLM
- MLX Audio with Kokoro for TTS
- Barge-in (interruption) support

It does NOT have a compute monitor -- it relies on asyncio task scheduling and the OS GPU scheduler. The pipeline processes stages sequentially (STT output feeds LLM, LLM output feeds TTS) rather than running them in true parallel contention.

### 8.2 Pipecat local examples

Pipecat's examples show local pipelines using LocalAudioTransport + Whisper + Ollama + TTS, but resource management is not addressed. The framework's asyncio event loop handles concurrency, and GPU contention is left to the OS.

### 8.3 NVIDIA NVIGI (In-Game Inferencing SDK)

NVIDIA's approach to the same problem (multiple AI models sharing one GPU in real-time):
- Uses CUDA MPS (Multi-Process Service) for true GPU sharing with preemption
- Implements priority-based scheduling with real-time kernels preempting best-effort ones
- Has a coordinator that co-schedules or batches compatible kernels

This is the gold standard for GPU-aware scheduling, but it is CUDA-only. The key insight we can borrow: **cooperative preemption between token generations is sufficient** when hardware preemption is not available.

### 8.4 Agent.xpu (heterogeneous SoC scheduling)

Recent research (2026) on scheduling LLM workloads across heterogeneous SoC components (CPU, GPU, NPU) -- directly relevant to Apple Silicon's CPU + GPU + ANE:
- Maps different model phases to different hardware units
- Uses the NPU (ANE equivalent) for small models to free the GPU for large ones
- Confirms our approach: run Kokoro on ANE, reserve GPU for Whisper + Gemma

---

## 9. Summary: What to Build vs. What the OS Handles

### The OS / frameworks handle:

- **GPU time-sharing between processes**: Metal command buffer interleaving works fine
- **Memory management**: Unified memory means all models "just fit" if total < ~75% RAM
- **Model loading/unloading**: Ollama handles this via keep_alive and max_loaded_models
- **Thread scheduling**: asyncio + Pipecat handle pipeline concurrency

### We need to build:

1. **ComputeMonitor** (~200 lines): A thin Pipecat processor that tracks pipeline state (user speaking / generating / synthesizing / idle) and gates LLM requests based on priority. Uses asyncio Events for cooperative preemption.

2. **Backchannel cue cache** (~50 lines): Pre-synthesize common cues at startup to eliminate TTS/STT GPU contention for the most common case.

3. **Resource pressure monitor** (~100 lines): Periodic check of memory pressure level and GPU residency. On pressure, unload background models. On critical, pause LLM and alert.

4. **Kokoro CoreML conversion** (one-time): Convert Kokoro to CoreML to offload TTS to the ANE entirely. This is the single highest-impact optimization for eliminating GPU contention.

### Configuration checklist:

- [ ] Set `OLLAMA_KEEP_ALIVE="-1"` to avoid cold starts
- [ ] Set `OLLAMA_MAX_LOADED_MODELS=2` for E2B + E4B coexistence
- [ ] Set `OLLAMA_NUM_PARALLEL=1` (single user)
- [ ] Pre-load all models at application startup
- [ ] Pre-synthesize backchannel cue bank at startup
- [ ] Monitor memory pressure via `sysctl kern.memorystatus_vm_pressure_level`
- [ ] Consider 32 GB RAM minimum recommendation for comfortable operation

---

## Sources

- [Ollama MLX Backend Announcement](https://ollama.com/blog/mlx) -- Ollama 0.19 MLX integration
- [MLX: The Next Inference Engine for Apple Silicon](https://yage.ai/share/mlx-apple-silicon-en-20260331.html) -- MLX architecture deep dive
- [Ollama Keep-Alive Configuration](https://markaicode.com/ollama-keep-alive-memory-management/) -- Memory management
- [Run Multiple Ollama Models on Mac](https://modelpiper.com/blog/ollama-multi-model-mac/) -- Multi-model memory analysis
- [Apple Silicon Limitations with Local LLM](https://stencel.io/posts/apple-silicon-limitations-with-usage-on-local-llm%20.html) -- Memory pressure and swap behavior
- [Gemma 4 VRAM Requirements](https://gemma4guide.com/guides/gemma4-vram-requirements) -- E2B/E4B memory requirements
- [Gemma 4 Hardware Requirements](https://www.knightli.com/en/2026/05/01/gemma-4-local-vram-quantization-table/) -- Quantization table
- [Kokoro CoreML Conversion](https://github.com/mattmireles/kokoro-coreml) -- PyTorch to CoreML pipeline
- [Building a Local Voice AI Stack](https://dev.to/xadenai/building-a-local-voice-ai-stack-whisper-ollama-kokoro-tts-on-apple-silicon-eo0) -- Whisper + Ollama + Kokoro on Apple Silicon
- [eauchs/speech-to-speech-pipeline](https://github.com/eauchs/speech-to-speech-pipeline) -- Local STT-LLM-TTS pipeline for Apple Silicon
- [Pipecat ParallelPipeline](https://docs.pipecat.ai/server/pipeline/parallel-pipeline) -- Concurrent branch processing
- [Optimize Metal Performance for Apple Silicon](https://developer.apple.com/videos/play/wwdc2020/10632/) -- GPU workload overlap
- [Metal Compute on MacBook Pro](https://developer.apple.com/videos/play/tech-talks/10580/) -- Concurrent dispatch
- [asitop](https://github.com/tlkh/asitop) -- Apple Silicon performance monitoring
- [macmon](https://github.com/vladkens/macmon) -- No-sudo Mac system monitor
- [macgputils](https://pypi.org/project/macgputils/) -- Python GPU stats API
- [NVIDIA NVIGI GPU Scheduling for AI](https://docs.nvidia.com/nvigi-sdk/1.3.0/docs/nvigi_core/docs/GpuSchedulingForAI.html) -- Priority-based GPU scheduling reference
- [Whisper large-v3-turbo Model](https://huggingface.co/mlx-community/whisper-large-v3-turbo) -- MLX Whisper model
- [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) -- Model details
- [2026 Mac Inference Framework Selection](https://macgpu.com/en/blog/2026-mac-inference-framework-vllm-mlx-ollama-llamacpp-benchmark.html) -- Framework comparison benchmarks
