# R7 — Incremental Session Notes via LLM-Wiki Pattern and Ollama Tool Use

Research deliverable for [AGENT-RESEARCH.md](../../../AGENT-RESEARCH.md) topic R7 (session-wiki).

**Supports:** M1 (background LLM tool use)

---

## 1. The LLM-Wiki Pattern

### 1.1 Core principles (Karpathy)

The [llm-wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) treats an LLM as a compiler that reads raw sources and produces a structured, interlinked wiki. Three layers:

| Layer | Role | Mutability |
|-------|------|-----------|
| **Raw sources** | System of record (papers, articles, transcripts) | Immutable once ingested |
| **Wiki** | Derived, interlinked markdown pages (entities, concepts, synthesis) | Agent-maintained, rebuildable |
| **Schema** | Instructions for the agent (CLAUDE.md, SKILL.md) | Human-maintained |

Key insight: unlike RAG (which re-discovers knowledge per query), the wiki **compiles** knowledge once during ingest and keeps it current. Cross-references, contradictions, and connections are pre-computed and compound over time.

Page types:
- **Entity pages** — one person, concept, or thing
- **Source summaries** — one page per ingested source
- **Concept pages** — themes, relationships, patterns
- **Synthesis pages** — comparisons, analyses across sources
- **Index** — content catalog with links and one-line summaries
- **Log** — append-only chronological record of changes

Maintenance via periodic "linting": detect stale claims, orphan pages, missing cross-references, contradictions. The LLM handles all bookkeeping; humans curate sources and ask questions.

### 1.2 geno-notes already implements this

geno-notes implements the Karpathy pattern with the same three layers:

| Karpathy layer | geno-notes equivalent |
|---|---|
| Raw sources | `tasks/`, `journal/`, `plans/`, `inbox.md` |
| Wiki | `wiki/` (derived, rebuildable via `geno-notes compile`) |
| Schema | `SKILL.md`, `CLAUDE.md` |

The `geno-notes-wiki-compile` skill:
1. Runs `geno-notes compile` to dump all sources + existing wiki pages
2. Identifies topics, entities, themes, and connections
3. Creates/updates wiki pages at `<scope>/wiki/<topic-slug>.md`
4. Uses `[[wikilinks]]` for cross-references
5. Updates `wiki/index.md` as a catalog
6. Logs the compile as a milestone

The `geno-notes-wiki-lint` skill performs the health check: stale pages, orphans, missing pages, gaps, contradictions, dead references.

### 1.3 Adapting for streaming input

The standard llm-wiki pattern assumes batch ingest (a document arrives, the LLM processes it all at once). RestReflect's challenge: **the source is a live speech stream arriving in 5-10s chunks**.

Adaptation strategy:

| Standard llm-wiki | RestReflect adaptation |
|---|---|
| Full document → compile once | Chunk arrives → incremental update |
| Create entity/concept pages | Build session-scoped topic pages that grow |
| Index updated after full ingest | Running index updated after each chunk |
| Lint periodically | Lint at session end (or during long silences) |
| Sources are immutable | Verbatim transcript is append-only; clean + summary are mutable |

The key difference: **during a session, the wiki is a live document**. After the session ends, it becomes a standard static wiki that can be compiled into the geno-notes project wiki.

---

## 2. Incremental Summarization Strategy

### 2.1 The refine approach (recommended)

Research converges on the **refine** method for incremental summarization:

```
For each new chunk:
  summary = LLM(previous_summary + new_chunk → updated_summary)
```

This is how Picovoice's real-time meeting summarizer works:

```python
prompt = f"""Current Summary: {self.summary}
New Speech Segment: {new_segment}
Update the summary to incorporate new information. Keep it
concise (max 200 words) and focus on themes and insights.
Updated Summary:"""
```

The LLM **rewrites** the entire summary each time, not appending. This produces a coherent summary at every point in time.

### 2.2 Why rewrite beats append

| Approach | Pros | Cons |
|---|---|---|
| **Append-only** | Fast, no reprocessing | Grows unbounded, becomes a log not a summary, loses coherence |
| **Full rewrite** | Always coherent, can reorganize as themes emerge | Costs one LLM call per chunk |
| **Hybrid** | Best of both | More complex |

**Recommendation: full rewrite** for the running summary. The summary stays under 300 words, so the LLM call is cheap. The verbatim and clean transcripts are append-only by nature.

### 2.3 Chunk granularity

| Granularity | Pros | Cons |
|---|---|---|
| Per-sentence | Finest resolution | Too many LLM calls, high latency overhead |
| **Per-VAD-segment (5-10s)** | Natural speech boundaries, matches Whisper output | Recommended default |
| Per-topic-shift | Semantically meaningful | Requires topic detection (adds latency) |
| Batched (30s groups) | Fewer LLM calls | Delayed updates, misses nuance |

**Recommendation: per-VAD-segment** as the primary unit. This matches what Whisper already produces and aligns with natural speech pause boundaries. Topic detection is applied as a post-processing signal within the LLM tool call (the LLM decides whether the new chunk introduces a new topic).

### 2.4 Topic shift detection

Two approaches, use together:

**Fast heuristic (no LLM):**
- Track the last N key nouns/entities extracted from chunks
- If a new chunk introduces >50% new entities, flag as potential topic shift
- Can be done with spaCy NER or even keyword extraction

**LLM-based (already happening):**
- The `summarize` tool call already processes each chunk
- The LLM naturally identifies whether the new chunk continues a theme or introduces a new one
- The `wiki_update` tool is only called when the LLM detects a topic worth a wiki page
- No separate topic segmentation model needed — the LLM does it implicitly

**Recommendation:** Let the LLM handle topic detection implicitly through its tool calls. The `assess_moment` tool can also flag major topic shifts as potential moments for a brief "I noticed you shifted to talking about X" response.

### 2.5 Handling corrections and repetition

**Corrections** ("no wait, I mean..."):
- The verbatim transcript always records what was said, including corrections
- The `write_clean` tool should recognize correction markers ("actually", "no wait", "I mean", "sorry, what I meant was") and replace the previous statement in the clean version
- The LLM prompt should explicitly instruct: "When the speaker corrects themselves, update the clean transcript to reflect their intended meaning, not the original statement"

**Repetition** (user says the same thing multiple ways):
- Common in reflection/therapy — saying something different ways is how people process
- The verbatim transcript captures all versions
- The clean transcript should capture the **essence** once, but note the emphasis: "The user returned to the theme of X several times, expressing it as [Y], then [Z]"
- The summary should consolidate, not deduplicate — repetition signals importance

---

## 3. Ollama Tool Use with Gemma 4

### 3.1 API format

Ollama exposes tool use via the `/api/chat` endpoint:

**Request:**
```json
{
  "model": "gemma4:e2b",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "Process this transcript chunk: ..."}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "write_verbatim",
        "description": "...",
        "parameters": { "type": "object", "properties": {...}, "required": [...] }
      }
    }
  ],
  "stream": false
}
```

**Response (tool call):**
```json
{
  "message": {
    "role": "assistant",
    "content": "",
    "tool_calls": [
      {
        "function": {
          "name": "write_verbatim",
          "arguments": { "text": "..." }
        }
      }
    ]
  }
}
```

**Tool result:**
```json
{
  "role": "tool",
  "content": "saved",
  "tool_name": "write_verbatim"
}
```

Gemma 4 supports **multiple tool calls** in a single response — it can call `write_verbatim`, `write_clean`, `summarize`, and `wiki_update` all from processing one chunk.

### 3.2 Gemma 4 model selection

| Model | Size | Speed (Apple Silicon MLX) | Use case |
|---|---|---|---|
| `gemma4:e2b` | ~2.5 GB | ~158 tok/s on M5 Max | Fast background processing |
| `gemma4:e4b` | ~4 GB | ~100 tok/s on M4 Pro | Good balance |
| `gemma4:12b` | ~12 GB | ~50 tok/s on M4 Pro | Richer understanding |
| `gemma4:27b` | ~27 GB | ~25 tok/s on M4 Pro | Best quality, too slow for real-time |

**Recommendation: `gemma4:e4b`** — already used by RestReflect for the main conversation. Using the same model for background processing means it is already loaded in memory (Ollama keep-alive), so no cold-start penalty. If background processing proves too slow on the same model instance, fall back to `gemma4:e2b` for the note-taking branch.

### 3.3 Latency analysis

For a 5-10s speech chunk (~20-50 words of transcript):

| Operation | Input tokens | Output tokens | Estimated time (e4b, M4 Pro) |
|---|---|---|---|
| Tool dispatch (all 5 tools) | ~500 (system + chunk + context) | ~300 (across all tool outputs) | ~3s |
| Summary rewrite | ~400 (previous summary + chunk) | ~200 (new summary) | ~2s |
| Wiki update (if triggered) | ~600 (chunk + existing page) | ~200 | ~2s |

**Total per chunk: ~3-5s** — well within the 5-10s window between chunks. The LLM is processing the previous chunk while the user continues speaking. No pipeline blocking.

### 3.4 Prompt design

```
You are a session note-taker for a private reflection session. The user is speaking continuously and you are processing their speech in chunks. Your job is NOT to respond to the user — it is to maintain structured session notes by calling the provided tools.

For each transcript chunk, you MUST call these tools:
1. write_verbatim — record exactly what was said
2. write_clean — write a cleaned, structured version (fix grammar, remove filler words, organize into coherent sentences)
3. summarize — update the running summary with any new themes, insights, or emotional shifts

You MAY call these tools when appropriate:
4. wiki_update — when a distinct topic, person, decision, or recurring theme emerges that deserves its own wiki page
5. assess_moment — evaluate whether the system should speak now

Guidelines:
- The clean transcript should read like well-written notes, not a verbatim transcript
- The summary should be 100-300 words, organized by theme, updated to reflect the latest chunk
- Wiki pages should be created for: distinct topics the user dwells on, people mentioned repeatedly, decisions being weighed, emotions being processed
- Corrections ("no wait, I mean...") should update the clean transcript to reflect intended meaning
- Repetition signals importance — note it in the summary, don't suppress it
- assess_moment should almost always return "stay_silent" — this is the user's space
```

---

## 4. Tool Schemas

### 4.1 write_verbatim

```json
{
  "type": "function",
  "function": {
    "name": "write_verbatim",
    "description": "Append the raw transcript chunk exactly as spoken to the verbatim log. Include filler words, false starts, and corrections. This is the unedited record.",
    "parameters": {
      "type": "object",
      "properties": {
        "text": {
          "type": "string",
          "description": "The raw transcript text as spoken, including all filler words and false starts"
        },
        "chunk_index": {
          "type": "number",
          "description": "Sequential chunk number within this session"
        }
      },
      "required": ["text", "chunk_index"]
    }
  }
}
```

### 4.2 write_clean

```json
{
  "type": "function",
  "function": {
    "name": "write_clean",
    "description": "Append a cleaned, structured version of the transcript chunk. Fix grammar, remove filler words, resolve corrections, organize into coherent sentences. This is the readable version.",
    "parameters": {
      "type": "object",
      "properties": {
        "text": {
          "type": "string",
          "description": "Cleaned, structured version of what the user said. Complete sentences, no filler words."
        },
        "correction": {
          "type": "boolean",
          "description": "True if this chunk contains a correction to something previously said"
        },
        "replaces_chunk": {
          "type": "number",
          "description": "If correction is true, the chunk_index of the statement being corrected"
        }
      },
      "required": ["text"]
    }
  }
}
```

### 4.3 summarize

```json
{
  "type": "function",
  "function": {
    "name": "summarize",
    "description": "Rewrite the running session summary to incorporate the latest chunk. The summary should be 100-300 words, organized by theme. Include emotional texture, key decisions, unresolved questions, and patterns of repetition.",
    "parameters": {
      "type": "object",
      "properties": {
        "summary": {
          "type": "string",
          "description": "The complete updated summary (replaces previous summary entirely)"
        },
        "themes": {
          "type": "array",
          "items": { "type": "string" },
          "description": "List of active themes in the session, ordered by prominence"
        },
        "emotional_tone": {
          "type": "string",
          "description": "Current emotional texture: e.g. 'reflective and slightly anxious', 'calming down after frustration'"
        },
        "topic_shifted": {
          "type": "boolean",
          "description": "True if this chunk introduced a meaningfully new topic"
        }
      },
      "required": ["summary", "themes", "emotional_tone"]
    }
  }
}
```

### 4.4 wiki_update

```json
{
  "type": "function",
  "function": {
    "name": "wiki_update",
    "description": "Create or update a wiki page for a distinct topic, person, decision, or recurring theme. Only call this when a topic has enough substance for its own page. Use [[wikilinks]] to connect to related pages.",
    "parameters": {
      "type": "object",
      "properties": {
        "page_slug": {
          "type": "string",
          "description": "Kebab-case slug for the wiki page, e.g. 'career-change', 'relationship-with-mom'"
        },
        "title": {
          "type": "string",
          "description": "Human-readable page title"
        },
        "content": {
          "type": "string",
          "description": "Full markdown content for the page (replaces existing content). Use [[wikilinks]] for cross-references."
        },
        "tags": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Tags for categorization: e.g. 'emotion', 'relationship', 'decision', 'work', 'health'"
        },
        "action": {
          "type": "string",
          "enum": ["create", "update"],
          "description": "Whether this is a new page or an update to an existing one"
        }
      },
      "required": ["page_slug", "title", "content", "tags", "action"]
    }
  }
}
```

### 4.5 assess_moment

```json
{
  "type": "function",
  "function": {
    "name": "assess_moment",
    "description": "Evaluate whether the system should speak right now. Default is 'stay_silent' — the user is reflecting and should not be interrupted. Only recommend speaking when there is a clear invitation or a genuinely helpful moment.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": ["stay_silent", "play_cue", "speak_brief", "speak_full"],
          "description": "stay_silent: default. play_cue: play an active listening cue ('mhmm'). speak_brief: say 1-2 sentences. speak_full: give a substantive response."
        },
        "reason": {
          "type": "string",
          "description": "Why this action was chosen. Required even for stay_silent."
        },
        "suggested_response": {
          "type": "string",
          "description": "If action is speak_brief or speak_full, the suggested text to speak"
        },
        "suggested_cue": {
          "type": "string",
          "description": "If action is play_cue, which cue: 'mhmm', 'I see', 'go on', 'right', 'yeah'"
        },
        "emotional_intensity": {
          "type": "number",
          "description": "0.0 to 1.0 — how emotionally intense this moment is. Used by canvas visualization."
        }
      },
      "required": ["action", "reason", "emotional_intensity"]
    }
  }
}
```

---

## 5. Session Notes Schema

### 5.1 Directory structure (per session)

```
sessions/
└── 2026-05-10T14-30-00/
    ├── meta.yaml              # session metadata
    ├── verbatim.md            # raw transcript, append-only
    ├── clean.md               # cleaned transcript, append-only (with corrections)
    ├── summary.md             # running summary, rewritten with each chunk
    ├── wiki/
    │   ├── index.md           # catalog of session wiki pages
    │   ├── career-change.md   # topic pages (created as they emerge)
    │   └── relationship-with-mom.md
    └── moments.jsonl          # assess_moment outputs (for turn-taking engine)
```

### 5.2 meta.yaml

```yaml
session_id: "2026-05-10T14-30-00"
started: "2026-05-10T14:30:00-07:00"
ended: null  # filled at session end
duration_minutes: null
chunk_count: 0
model: "gemma4:e4b"
themes: []  # updated from summarize tool
emotional_arc: []  # list of {timestamp, tone} from summarize tool
wiki_pages_created: 0
wiki_pages_updated: 0
```

### 5.3 verbatim.md

```markdown
# Session Transcript (Verbatim)

Session: 2026-05-10T14:30:00

---

### Chunk 1 — 14:30:15

I've been thinking a lot about, um, whether I should actually leave my job. Like, it's not that it's bad, it's just... I don't know, I feel like I'm not growing anymore.

### Chunk 2 — 14:30:28

And my mom keeps saying I should stay because it's stable, you know? But she doesn't really understand what it's like to feel stuck. It's not about the money.

### Chunk 3 — 14:30:41

Actually no, that's not fair. She does understand, she just... she worries. That's different.
```

### 5.4 clean.md

```markdown
# Session Notes (Clean)

Session: 2026-05-10T14:30:00

---

I've been thinking about whether I should leave my job. It's not a bad job, but I feel like I'm no longer growing there.

My mom advises staying because of the stability, but she doesn't fully understand the feeling of being stuck. It's not about the money for me.

*[Correction]* Actually, she does understand — she worries, which is different from not understanding.
```

### 5.5 summary.md (after 3 chunks)

```markdown
# Running Summary

**Themes:** career stagnation, family relationship (mother), autonomy vs. security

**Summary:**
The user is weighing a career change. They feel stagnant in their current role — not unhappy, but no longer growing. Their mother advises staying for stability, which initially felt dismissive but on reflection comes from a place of worry rather than misunderstanding. There's a tension between the user's desire for growth/autonomy and the security their current position provides. The self-correction about their mother suggests the user is actively working through a more nuanced understanding of the relationship.

**Emotional tone:** Reflective, slightly frustrated, then softening toward empathy.

**Unresolved:** What growth would look like. Whether leaving is about the job specifically or a broader life pattern.
```

### 5.6 moments.jsonl

```json
{"timestamp": "2026-05-10T14:30:15", "chunk": 1, "action": "stay_silent", "reason": "User is opening up, establishing the topic. No intervention needed.", "emotional_intensity": 0.3}
{"timestamp": "2026-05-10T14:30:28", "chunk": 2, "action": "stay_silent", "reason": "User is exploring the family dynamic. Still processing.", "emotional_intensity": 0.4}
{"timestamp": "2026-05-10T14:30:41", "chunk": 3, "action": "play_cue", "reason": "User just self-corrected with empathy — a meaningful moment of insight. A gentle acknowledgment feels appropriate.", "suggested_cue": "mhmm", "emotional_intensity": 0.5}
```

---

## 6. Integration with geno-notes

### 6.1 Session notes as journal entries

After a session ends, the session notes should be promoted into geno-notes:

```
Session ends
  → write summary.md as a geno-notes journal entry:
    geno-notes note "Session 2026-05-10: <one-line summary>" --kind milestone
  → for each session wiki page, check if it maps to a project wiki page:
    - New topic → create project wiki page
    - Existing topic → update (merge) project wiki page
  → run geno-notes compile to synthesize session into the project wiki
```

The session directory itself is **not** stored inside geno-notes — it lives in the app's data directory (`~/Library/Application Support/mind-render/sessions/`). The geno-notes integration is a one-way export at session end.

### 6.2 Mapping to geno-notes structures

| Session artifact | geno-notes equivalent | How |
|---|---|---|
| summary.md | Journal entry | `geno-notes note "<summary>" --kind milestone` |
| wiki pages | Wiki pages | Merge into `<scope>/wiki/<slug>.md` |
| themes list | Tags on journal entry | Included in note metadata |
| moments.jsonl | Not mapped | Internal to the app |
| verbatim.md | Not mapped | Raw data, stays in session dir |
| clean.md | Not mapped | Could be a journal entry if desired |

### 6.3 The wiki-compile flow

After several sessions, the geno-notes project wiki accumulates topic pages from individual sessions. Running `geno-notes compile` will:

1. Read all journal entries (including session summaries)
2. Read all existing wiki pages (including session-derived ones)
3. Synthesize cross-session themes, track evolution over time
4. Create synthesis pages: "Career Change — Evolution Over 3 Sessions"
5. Update the wiki index

This is exactly the Karpathy pattern operating on session-derived raw sources.

### 6.4 Privacy considerations

- Session data stays in `~/Library/Application Support/mind-render/sessions/` (local)
- geno-notes project scope is at `./geno/geno-notes/` which is gitignored
- geno-notes global scope is at `~/.geno/geno-notes/` (local)
- No session data should ever enter global scope without explicit user action
- Wiki pages derived from sessions should be stored in the **project** scope of RestReflect, not global

---

## 7. Pipecat Integration

### 7.1 Architecture

The note-taking pipeline runs as a **ParallelPipeline branch** alongside the main conversation pipeline:

```
                    ┌───────────────────────────────────────────┐
                    │              Main Pipeline                 │
                    │  STT → ContextAgg → LLM → TTS → Output   │
                    │       (conversation with user)             │
┌──────────┐       ├───────────────────────────────────────────┤
│  Whisper  │──┬──▶│                                           │
│   STT     │  │   └───────────────────────────────────────────┘
└──────────┘  │
              │    ┌───────────────────────────────────────────┐
              └──▶ │          Notes Pipeline (Parallel)         │
                   │  TranscriptionFilter → SessionNoteProcessor │
                   │       (background, no audio output)        │
                   └───────────────────────────────────────────┘
```

Both branches receive the same `TranscriptionFrame` from STT. The main pipeline processes it as conversation input. The notes pipeline processes it as note-taking input.

### 7.2 SessionNoteProcessor (custom Pipecat processor)

```python
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.frames.frames import TranscriptionFrame, TextFrame
import aiohttp
import json

class SessionNoteProcessor(FrameProcessor):
    """Processes transcript chunks via Ollama tool use to maintain
    session notes. Runs in a ParallelPipeline branch — does not
    block the main conversation pipeline."""

    def __init__(
        self,
        session_dir: str,
        ollama_url: str = "http://localhost:11434",
        model: str = "gemma4:e4b",
        **kwargs
    ):
        super().__init__(**kwargs)
        self.session_dir = session_dir
        self.ollama_url = ollama_url
        self.model = model
        self.chunk_index = 0
        self.running_summary = ""
        self.active_themes = []
        self.wiki_pages = {}  # slug -> content
        self.tools = self._build_tool_schemas()

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame) and frame.finalized:
            # Process in background — don't block frame flow
            self.chunk_index += 1
            asyncio.create_task(
                self._process_chunk(frame.text, self.chunk_index)
            )

        # Always pass frames through (we're a parallel observer)
        await self.push_frame(frame, direction)

    async def _process_chunk(self, text: str, chunk_idx: int):
        """Call Ollama with tool use to process a transcript chunk."""
        messages = [
            {"role": "system", "content": self._system_prompt()},
            {"role": "user", "content": self._chunk_prompt(text, chunk_idx)},
        ]

        async with aiohttp.ClientSession() as session:
            payload = {
                "model": self.model,
                "messages": messages,
                "tools": self.tools,
                "stream": False,
            }
            async with session.post(
                f"{self.ollama_url}/api/chat", json=payload
            ) as resp:
                result = await resp.json()

        msg = result.get("message", {})
        tool_calls = msg.get("tool_calls", [])

        for tc in tool_calls:
            fn = tc["function"]["name"]
            args = tc["function"]["arguments"]
            await self._execute_tool(fn, args, chunk_idx)

    async def _execute_tool(self, name: str, args: dict, chunk_idx: int):
        """Execute a tool call by writing to the session directory."""
        if name == "write_verbatim":
            await self._append_verbatim(args["text"], chunk_idx)
        elif name == "write_clean":
            await self._append_clean(args["text"], args.get("correction", False))
        elif name == "summarize":
            self.running_summary = args["summary"]
            self.active_themes = args.get("themes", [])
            await self._write_summary(args)
        elif name == "wiki_update":
            await self._write_wiki_page(args)
        elif name == "assess_moment":
            await self._log_moment(args, chunk_idx)
            # If action != stay_silent, push a signal frame
            if args.get("action") != "stay_silent":
                await self._signal_turn_taking(args)

    def _chunk_prompt(self, text: str, chunk_idx: int) -> str:
        context = f"Chunk {chunk_idx}. "
        if self.running_summary:
            context += f"Running summary so far:\n{self.running_summary}\n\n"
        if self.active_themes:
            context += f"Active themes: {', '.join(self.active_themes)}\n\n"
        context += f"New transcript chunk:\n{text}"
        return context

    # ... file I/O methods for each tool ...
```

### 7.3 Pipeline assembly

```python
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.parallel_pipeline import ParallelPipeline

# Main conversation pipeline
main_branch = [
    context_aggregator.user(),
    llm,            # Ollama LLM for conversation
    tts,            # Kokoro TTS
    transport.output(),
    context_aggregator.assistant(),
]

# Background note-taking pipeline
notes_branch = [
    SessionNoteProcessor(
        session_dir="/path/to/session/2026-05-10T14-30-00",
        model="gemma4:e4b",
    ),
]

pipeline = Pipeline([
    transport.input(),
    stt,                              # Whisper STT
    ParallelPipeline([
        main_branch,
        notes_branch,
    ]),
])
```

### 7.4 Frame types used

| Frame | Direction | Purpose |
|---|---|---|
| `TranscriptionFrame` | Downstream | STT output → consumed by notes processor |
| `FunctionCallInProgressFrame` | (internal to main LLM) | Main conversation tool calls |
| Custom `SessionNoteFrame` | Downstream from notes branch | Carry processed notes to downstream consumers |
| Custom `TurnTakingSignalFrame` | Downstream from notes branch | `assess_moment` results → turn-taking engine |

### 7.5 Avoiding pipeline blocking

Critical design decisions:
1. **`asyncio.create_task()`** for Ollama calls — the notes processor never awaits the LLM response inline. Frame flow continues immediately.
2. **No audio output** from the notes branch — it only writes files and emits signal frames.
3. **Separate Ollama request** from the main conversation LLM — Ollama handles concurrent requests to the same model. If GPU contention becomes an issue, the notes pipeline can use a smaller model (`gemma4:e2b`).
4. **`TranscriptionFrame.finalized`** check — only processes finalized transcriptions, not partial/interim results.

---

## 8. Incremental Update Flow (Complete)

Here is the complete flow for processing a single transcript chunk:

```
1. User speaks for 5-10 seconds
2. Whisper produces a TranscriptionFrame (finalized=True)
3. Frame flows to both pipeline branches simultaneously

Main branch:
   → ContextAggregator adds to conversation context
   → Main LLM generates conversational response (if turn-taking engine allows)
   → TTS synthesizes response audio
   → Audio plays

Notes branch:
   → SessionNoteProcessor receives TranscriptionFrame
   → Fires async task (non-blocking):
     a. Build prompt: system prompt + running summary + new chunk
     b. POST to Ollama /api/chat with all 5 tool schemas
     c. Gemma 4 returns tool_calls (typically 3-5 calls):
        - write_verbatim: append to verbatim.md
        - write_clean: append to clean.md
        - summarize: rewrite summary.md, update themes
        - wiki_update: create/update wiki page (if topic warrants it)
        - assess_moment: log to moments.jsonl, emit signal if not stay_silent
     d. Execute each tool call (file I/O)
     e. Update in-memory state (running_summary, active_themes, wiki_pages)

4. User continues speaking → next chunk arrives → repeat
```

---

## 9. Post-Session Integration

When the session ends (user closes app, hits stop, or timer expires):

```
1. Write final meta.yaml (duration, chunk_count, themes, wiki stats)
2. Run a final "session wrap-up" LLM call:
   - Produce a session-closing summary (more detailed than running summary)
   - Identify key takeaways, unresolved questions, emotional arc
3. Export to geno-notes (if project scope exists):
   - geno-notes note "Session <date>: <one-line summary>" --kind milestone
   - For each wiki page, merge into project wiki
4. Optionally trigger geno-notes compile for full wiki synthesis
```

---

## 10. Open Questions and Future Work

1. **GPU contention**: Ollama can serve concurrent requests, but Whisper (MLX) and Ollama (MLX) may compete for Metal GPU time. Benchmarking needed on target hardware (M4 Pro).

2. **Context window management**: As sessions grow long (30+ minutes, 100+ chunks), the running summary + chunk prompt may approach context limits. May need to implement a "context compaction" step — summarizing the summary periodically.

3. **Multi-session wiki coherence**: When multiple sessions produce wiki pages on the same topic, the merge strategy needs to be smart — later sessions should evolve (not overwrite) earlier insights. The geno-notes wiki-compile handles this, but may need session-aware merge logic.

4. **Emotional arc visualization**: The `assess_moment.emotional_intensity` values create a time series that could drive the canvas visualization. This bridges R7 (session notes) with R11 (emotional canvas).

5. **Offline-first considerations**: All processing is local, but what happens if Ollama is temporarily unavailable? The notes pipeline should queue chunks and process them when Ollama returns.

6. **Session opt-in**: Users should explicitly opt into session note-taking. The default should be no persistent notes (privacy-first principle from VISION.md).

---

## Sources

- [Karpathy llm-wiki Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [LLM Wiki v2 — extending Karpathy's pattern](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2)
- [Karpathy LLM Knowledge Base — VentureBeat](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an)
- [Gemma 4 Tool Calling Explained — Analytics Vidhya](https://www.analyticsvidhya.com/blog/2026/04/gemma-4-tool-calling/)
- [Gemma 4 on Ollama](https://ollama.com/library/gemma4)
- [Gemma 4 Ollama Tool Calling Support — Integration Guide](https://www.gemma4.wiki/ollama/gemma-4-ollama-tool-calling-support)
- [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Ollama MLX on Apple Silicon](https://ollama.com/blog/mlx)
- [Gemma 4 Performance: Linux vs Mac Benchmarks](https://www.lotharschulz.info/2026/04/04/gemma-4-performance-showdown-linux-vs-mac-benchmarks/)
- [Apple Silicon LLM Benchmarks — LLMCheck](https://llmcheck.net/benchmarks)
- [Pipecat Documentation — Pipeline & Frame Processing](https://docs.pipecat.ai/guides/learn/pipeline)
- [Pipecat — Ollama Integration](https://docs.pipecat.ai/server/services/llm/ollama)
- [Pipecat — Function Calling Guide](https://docs.pipecat.ai/pipecat/learn/function-calling)
- [Pipecat — ParallelPipeline API Reference](https://reference-server.pipecat.ai/en/stable/api/pipecat.pipeline.parallel_pipeline.html)
- [Pipecat — Frame Types Reference](https://reference-server.pipecat.ai/en/stable/api/pipecat.frames.frames.html)
- [Build a Real-Time Meeting Summarization Tool — Picovoice](https://picovoice.ai/blog/build-real-time-meeting-summarization-tool/)
- [Incremental Summarization for Customer Support — arXiv](https://arxiv.org/html/2510.06677)
- [Iteratively Summarize Long Documents with an LLM — MetroStar](https://blog.metrostar.com/iteratively-summarize-long-documents-llm)
- [Long Document Summarization — Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/long-document-summarization-with-workflows-and-gemini-models)
- [Topic Segmentation for Dialogue Stream — APSIPA 2019](http://www.apsipa.org/proceedings/2019/pdfs/7.pdf)
- [Advancing Topic Segmentation of Broadcasted Speech](https://arxiv.org/html/2409.06222)
- [Meetily — Open Source AI Meeting Assistant](https://github.com/Zackriya-Solutions/meeting-minutes)
- [On-Premise Voice AI with Ollama and Pipecat — WebRTC.ventures](https://webrtc.ventures/2025/03/on-premise-voice-ai-creating-local-agents-with-llama-ollama-and-pipecat/)
