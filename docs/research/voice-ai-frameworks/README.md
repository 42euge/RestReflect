# Real-Time Voice AI Frameworks for Local-First Mindfulness App

## Research Date: 2026-05-09

## Context

RestReflect needs a voice pipeline with six core requirements: always-listening mode, turn-taking engine, backchanneling, background LLM processing, streaming TTS, and compute orchestration. Current stack: Electron, Whisper (MLX) STT, Kokoro TTS, Gemma 4 (Ollama) LLM, all on Apple Silicon.

## Comparison Matrix

| Feature | Pipecat | LiveKit Agents | Vocode | Retell | Ultravox | TEN |
|---|---|---|---|---|---|---|
| Fully local | **Yes** | **Yes** | Partial | No | Partial* | Yes |
| Turn detection ML | **Smart Turn v2** | **Adaptive ML** | VAD only | Cloud | N/A | Basic |
| Backchannel (passive) | **Yes** | **Yes** | No | ? | No | ? |
| Backchannel (active) | Build yourself | Build yourself | No | ? | No | No |
| Kokoro TTS | **Built-in** | Community | No | No | No | Extension |
| Ollama LLM | **Built-in** | **Built-in** | No | No | N/A | Extension |
| Whisper local | Via wrapper | **FasterWhisper** | Whisper.cpp | No | Built-in** | Extension |
| License | **BSD-2** | **Apache-2.0** | MIT | Proprietary | MIT | Apache+restrictions |
| Electron SDK | JS SDK | **JS SDK + tutorial** | None | API | None | None |
| Parallel pipeline | **ParallelPipeline** | Streaming stages | No | N/A | N/A | Extension graph |
| Active development | **Very active** | **Very active** | Dead | Active (SaaS) | Active (model) | Active |

\* Requires A100+ GPU. \*\* Replaces STT, doesn't use Whisper alongside.

## Eliminated

- **Vocode** — development has largely stopped, telephony-focused, no Electron SDK
- **Retell AI** — cloud-only proprietary SaaS, fundamentally incompatible with local-first
- **Ultravox** — a speech-native LLM model, not a framework; requires A100+ GPU
- **TEN Framework** — license has additional restrictions needing legal review, container-first design

## The Two Contenders: Pipecat vs LiveKit Agents

### Pipecat wins on:
- **ParallelPipeline** — first-class parallel branching with frame ordering guarantees. Critical for background LLM processing (notes, summaries, wiki) while user speaks.
- **Smart Turn v2** — audio-native turn detection (Wav2Vec2) that understands intonation, pace, filler words. Better for reflective/therapeutic context where pauses carry meaning.
- **Kokoro integration** — built-in, tested, documented. Zero friction.
- **Compute orchestration expressiveness** — frame-based processing with explicit ordering across parallel branches.

### LiveKit Agents wins on:
- **Electron integration** — native `livekit-client` npm package with Electron tutorial. Also has `agents-js` for Node.js agents (could eliminate Python sidecar).
- **WebRTC maturity** — battle-tested SFU. Future-proof for multi-device scenarios.
- **Simpler API** — less verbose, faster to prototype.
- **Adaptive interruption handling** — ML model distinguishing interruptions from backchannels.

### Neither provides:
- **Active backchanneling** — no framework ships "play 'mhmm' at natural pauses." This is custom either way.
- **Compute monitor / GPU scheduler** — no framework manages Apple Silicon unified memory. Custom either way.

## Recommendation: Build on Pipecat

**Rationale:**

1. **ParallelPipeline is the killer feature.** RestReflect demands background LLM processing while the user speaks. Pipecat's ParallelPipeline is purpose-built for this. LiveKit's pipeline is linear.

2. **Smart Turn v2 fits therapy/reflection.** Turn detection that understands contemplative pauses, filler words, and intonation is critical for a mindfulness app where a 5-second pause might be thinking, not turn-ending.

3. **Stack already matches.** geno-voice uses Whisper, Kokoro, and Silero VAD — all have built-in Pipecat support. Integration path: wrap existing components as FrameProcessors.

4. **BSD-2 license** — maximally permissive, MIT-compatible.

5. **Electron gap is bridgeable.** `@pipecat-ai/client-js` with SmallWebRTC or WebSocket transport works in Electron. Python Pipecat server runs as a sidecar (like Ollama already does).

## What to build yourself (regardless of framework)

| Component | Description | Difficulty |
|---|---|---|
| Active backchannel generator | Detect 1-2s pauses where Smart Turn says "incomplete", play pre-recorded cues. Low trigger rate (every 15-30s). | Medium |
| Compute monitor | Monitor Apple Silicon unified memory/GPU. Defer LLM when STT is running. Batch tool calls during silence. | Medium-Hard |
| Reflection-aware turn policy | Override default endpointing: extend silence threshold to 5-8s in reflection mode. Use Smart Turn confidence scores + custom rules. | Easy-Medium |
| Background tool dispatcher | ParallelPipeline branch receiving transcription frames, calling tools (journal, summary, wiki) asynchronously. | Medium |
| Whisper MLX FrameProcessor | Thin wrapper around mlx-whisper to emit TranscriptionFrames. Or use geno-voice behind WebSocket with Pipecat's WebSocket STT base class. | Easy |

## Architecture sketch

```
                          Electron (mind-render)
                               |
                     WebSocket / SmallWebRTC
                               |
                    Pipecat Server (Python sidecar)
                               |
              +----------------+----------------+
              |                |                |
         InputAudio      ParallelPipeline    OutputAudio
              |           /         \            |
         Silero VAD      /           \      Kokoro TTS
              |         /             \          ^
         Smart Turn v2 /               \         |
              |       /                 \        |
         Whisper MLX /              Background   |
              |     /               Tool Runner  |
         Gemma 4 (Ollama)          (notes, wiki, |
              |                     summaries)   |
              +----------------------------------+
                        Conversation Pipeline
```

## Migration path

1. Wrap geno-voice STT/TTS/VAD as Pipecat FrameProcessors. Basic voice loop via WebSocket.
2. Add Smart Turn v2. Implement reflection-aware turn policy.
3. Build ParallelPipeline branch for background LLM tool use.
4. Build active backchanneling as custom FrameProcessor.
5. Build compute monitor for GPU scheduling.

## Sources

- [Pipecat GitHub](https://github.com/pipecat-ai/pipecat) — BSD-2, 8.5k+ stars
- [Pipecat Pipeline & Frame Processing](https://docs.pipecat.ai/guides/learn/pipeline)
- [Smart Turn v2 (Daily.co blog)](https://www.daily.co/blog/smart-turn-v2-faster-inference-and-13-new-languages-for-voice-ai/)
- [Smart Turn v2 Model (HuggingFace)](https://huggingface.co/pipecat-ai/smart-turn-v2)
- [Pipecat Kokoro TTS](https://docs.pipecat.ai/api-reference/server/services/tts/kokoro)
- [Pipecat JS Client SDK](https://docs.pipecat.ai/client/js/introduction)
- [On-Premise Voice AI with Pipecat](https://webrtc.ventures/2025/03/on-premise-voice-ai-creating-local-agents-with-llama-ollama-and-pipecat/)
- [LiveKit Agents GitHub](https://github.com/livekit/agents) — Apache-2.0, 6k+ stars
- [LiveKit Adaptive Interruption](https://docs.livekit.io/agents/logic/turns/adaptive-interruption-handling/)
- [LiveKit Electron Tutorial](https://livekit-tutorials.openvidu.io/tutorials/application-client/electron/)
- [Backchannel as Conversational Strategy (Rime Labs)](https://www.rime.ai/blog/back-channeling-as-a-conversational-strategy/)
