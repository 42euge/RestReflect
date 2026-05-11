# MindReflect — Agent Research Playbook

Research is for when you genuinely don't know how to proceed. Not when the work is hard.

8 research deliverables exist in `docs/research/`. Read them before building — don't re-derive what's already investigated.

## Completed research

| Topic | File | Key finding |
|-------|------|-------------|
| R9 Voice frameworks | `voice-ai-frameworks/` | Pipecat recommended |
| R3 Streaming STT | `streaming-stt-whisper.md` | WhisperLiveKit + MLX, 5-10s chunks |
| R1+R2 Turn-taking | `turn-taking-and-backchanneling.md` | Smart Turn v3, 4s silence, 2-3 cues/min |
| R7 Session wiki | `session-wiki/` | Ollama tool-use, full-rewrite summarization |
| R4 Compute monitor | `compute-monitor/` | OS handles GPU, move TTS to CoreML |
| R6 Voice emotion | `voice-emotion/` | Track activation, 3 DSP features, Wav2Small |
| R8 Therapeutic dialogue | `therapeutic-dialogue/` | AnnoMI dataset, MLX-Tune, safety interleaving |
| R10 PHQ-9 integration | `phq9-ai-integration/` | CloudKit sharing, item 9 safety, context injection |

## Open questions (not full research topics — just things to figure out)

- How to pipe backchannel WAV clips from geno-voice to Electron for playback?
- Best way to run SessionNoteProcessor from the Electron main process (spawn Python sidecar?)
- Should the turn-taking engine run in Python (geno-voice) or JavaScript (mind-render)?
- How to prevent Whisper hallucinations more reliably (VAD pre-filter vs post-filter vs both)?

## When to research vs when to build

**Build** if the answer is in the existing research docs or can be figured out by reading code.
**Research** if you need to understand an external system, find a dataset, or evaluate approaches you haven't seen.
