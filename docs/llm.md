# Ответы на звонке

Диалог учебного звонка. Модель задаётся `LLM_MODEL_NAME`, адрес — `LLM_BASE_URL`.

## Flow

microphone → распознанный текст → Conversation Manager → чат по `LLM_BASE_URL` → реплика в интерфейсе звонка.

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

Exam teacher inject: WS `intervention` updates the live system extra (`УКАЗАНИЕ ПРЕПОДАВАТЕЛЯ`) and, for emotions / sudden event / new circumstance / phase change, immediately generates a short caller line. Ticket facts stay locked. Scoring still uses the original etalon.

## Roles

`conversation_role=operator` — модель играет оператора 112, студент звонит (теория).

`conversation_role=victim` — модель играет заявителя, студент оператор (тренировка и экзамен).
