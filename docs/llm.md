# Local LLM (Qwen3-4B)

Conversational engine for the 112 training call. Does not replace T-one.

## Flow

microphone → T-one final transcript → Conversation Manager → llama.cpp `/v1/chat/completions` → streaming assistant line in the existing call UI.

Partial T-one text is shown in the UI and is **not** sent to Qwen.

## Run (Windows)

```powershell
.\scripts\start-llm.ps1
```

Keep STT running separately: `.\scripts\start-stt.ps1`.

Health: `GET http://127.0.0.1:8091/api/llm/health`

WebSocket: `ws://127.0.0.1:8091/ws/llm` (Vite proxies `/ws/llm`).

## Lesson sections

Each scenario has three sections. Roles come from the section, not from a per-lesson system prompt.

| Section | Student | AI | After the call |
| --- | --- | --- | --- |
| Theory | caller | operator | hang up |
| Training | operator | caller (speaks first) | local LLM debriefs the transcript |
| Exam | operator | caller | same as training; teacher intervention later |

Training/exam kickoff: after `start`, the client sends `kickoff`. The manager inserts a silent user turn `Оператор снял трубку.` so the model speaks first as the caller.

Hangup in training/exam: `analyze` (optional last operator line, no extra AI reply) → stream `analysis_partial` / `analysis_final` → `stop`.

Exam teacher inject: WS `intervention` currently returns `intervention_ack` with `code=not_implemented`.

## Roles

`conversation_role=operator` — Qwen is the 112 operator, the student is the caller (theory).

`conversation_role=victim` — Qwen is the caller, the student is the operator (training/exam).

One model instance serves both. Prompts stay generic; no per-lesson fine-tune.

## Files

- Model: `models/llm/Qwen3-4B-Q4_K_M.gguf`
- llama.cpp: `tools/llama.cpp/`
