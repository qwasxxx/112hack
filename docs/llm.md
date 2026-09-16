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

## Roles

`conversation_role=operator` — Qwen is the 112 operator, the student is the caller.

`conversation_role=victim` — Qwen is the caller, the student is the operator.

One model instance serves both. The system prompt comes from the lesson config.

## Files

- Model: `models/llm/Qwen3-4B-Q4_K_M.gguf`
- llama.cpp: `tools/llama.cpp/`
