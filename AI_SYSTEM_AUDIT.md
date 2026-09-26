# Current AI Stack

Canlı telefon görüşmesi NestJS mock adapter’lardan **geçmez**. Tarayıcı doğrudan Python servislerine (Vite proxy) bağlanır. `apps/api` içindeki `SpeechToTextPort` / `LanguageModelPort` / `TextToSpeechPort` yalnızca mock; canlı çağrıda kullanılmaz.

## STT
- **Aktif:** uzak HuggingFace Inference. `STT_MODE=huggingface`.
- **Model:** `openai/whisper-large-v3-turbo` (`STT_HF_MODEL`). Dil: `russian` (`STT_HF_LANGUAGE`).
- **Endpoint:** `{STT_HF_BASE_URL}/hf-inference/models/{STT_HF_MODEL}` — varsayılan `https://router.huggingface.co`.
- **Lokal yedek (şu an kapalı):** sherpa-onnx streaming **T-one CTC RU** (`models/sherpa-onnx-streaming-t-one-russian-2025-09-08`). URL: GitHub k2-fsa release.
- **Başlatma:** `apps/stt/src/sys112_stt/__main__.py` → uvicorn, `STT_HOST`/`STT_PORT` (8090). Docker: `sys112-stt`.
- **WS:** `ws://127.0.0.1:8090/ws/stt` (prod proxy: `/ws/stt`). Health: `GET /health`.
- **Env:** `STT_MODE`, `STT_HF_MODEL`, `STT_HF_LANGUAGE`, `STT_HF_BASE_URL`, `HF_TOKEN`, `STT_MODEL_PATH`, `STT_SAMPLE_RATE`, `STT_NUM_THREADS`, `STT_DECODING_METHOD`, `STT_ONNX_PROVIDER`, `STT_ENDPOINT_RULE1/RULE2`, `STT_ENDPOINT_CONFIRM`, `STT_PARTIAL_DELAY`, `STT_HOST`, `STT_PORT`.

## LLM
- **Aktif:** uzak HuggingFace Router, OpenAI-uyumlu chat. `LLM_PROVIDER=huggingface`, `LLM_RUNTIME=openai`.
- **Model id:** `Qwen/Qwen3.5-9B` (`LLM_MODEL_NAME`). `enable_thinking: false`.
- **URL:** `{LLM_BASE_URL}/v1/chat/completions` — varsayılan `https://router.huggingface.co`.
- **`LLM_MODE=local` yanıltıcı:** provider `huggingface` iken uzak API kullanılır; lokal llama.cpp’ye düşülmez.
- **Lokal yedek:** llama.cpp `Qwen3-4B-Q4_K_M.gguf` (`LLM_MODEL_PATH`), port `LLM_LLAMA_PORT=8080`. Docker `sys112-llama` var; canlı `.env` bunu kullanmıyor.
- **Başlatma:** `apps/llm/src/sys112_llm/__main__.py`, port 8091. Docker: `sys112-llm`.
- **WS:** `/ws/llm`. REST: `/warmup`, `/score-call`, `/generate-ticket`, `/health`.
- **Parametreler:** `LLM_TEMPERATURE` (örn. 0.6), `LLM_TOP_P` (0.8), `LLM_MAX_TOKENS` (120), `LLM_CONTEXT_SIZE`, `LLM_TIMEOUT_SEC` (60). Semafor=1 (tek eşzamanlı generate).
- **Debrief (ayrı):** `OPENAI_API_KEY` + `OPENAI_SCORE_MODEL` (varsayılan `o3-mini`) — konuşma sesi değil, skor.
- **Env:** `LLM_PROVIDER`, `LLM_RUNTIME`, `LLM_MODE`, `LLM_MODEL_NAME`, `LLM_MODEL_PATH`, `LLM_BASE_URL`, `LLM_HOST`, `LLM_PORT`, `LLM_LLAMA_PORT`, `HF_TOKEN`, `LLM_TEMPERATURE`, `LLM_TOP_P`, `LLM_MAX_TOKENS`, `LLM_CONTEXT_SIZE`, `LLM_TIMEOUT_SEC`, `OPENAI_API_KEY`, `OPENAI_SCORE_MODEL`, `OPENAI_BASE_URL`.

## TTS
- **Aktif:** uzak **Fish Audio S2**. `TTS_BACKEND=fish`. SDK: `fishaudio.AsyncFishAudio`.
- **Model:** `s2.1-pro` (`FISH_MODEL`). Format `pcm`, sr `44100`, latency `balanced`.
- **Ses:** Fish `reference_id` (kadın/erkek victim). Silero speaker adları (`xenia`/`aidar`) rol/cinsiyet çözümü için kalır; Fish’e clone id gider.
- **Lokal yedekler (kapalı):** Silero `v4_ru` / `v5_5_ru`; Qwen3-TTS `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`.
- **Başlatma:** `apps/tts/src/sys112_tts/__main__.py`, port 8092. Docker: `sys112-tts`.
- **HTTP:** `POST /api/v1/tts/synthesize` (chunked octet-stream, `X-TTS-Stream: 1`).
- **Env:** `TTS_BACKEND`, `TTS_HOST`, `TTS_PORT`, `TTS_LANGUAGE`, `FISH_API_KEY`, `FISH_MODEL`, `FISH_LATENCY`, `FISH_FORMAT`, `FISH_SAMPLE_RATE`, `FISH_REFERENCE_ID`, `FISH_VICTIM_FEMALE_REFERENCE_ID`, `FISH_VICTIM_MALE_REFERENCE_ID`, `FISH_OPERATOR_REFERENCE_ID`, `FISH_REFERENCE_AUDIO/TEXT`, `TTS_OPERATOR_SPEAKER`, `TTS_VICTIM_SPEAKER`.

## Nest mock (kullanılmıyor)
`AI_PROVIDER` / `STT_PROVIDER` / `TTS_PROVIDER` / `EMBEDDINGS_PROVIDER` = `mock`. Canlı ses yolu bunları çağırmaz.

# Call Pipeline

Orkestrasyon: `apps/student-web/src/pages/call-page.tsx` — `startCall`, `flushUtterance`, `scheduleFlush`, `speakAi`, `holdMicForTts`, `beginUserTurn`.

```
mic getUserMedia (8 kHz, echoCancel, noiseSuppression)
  -> ScriptProcessor 4096, downsample PCM s16le 8 kHz 100 ms frame
  -> WS /ws/stt  {start} + binary PCM
  -> energy VAD (HF) veya sherpa endpoint (lokal)
  -> STT event: partial | final
  -> UI 1.0 s flush sonrası user_final
  -> WS /ws/llm  generation_messages()
  -> assistant_partial (UI) / assistant_final
  -> POST /api/v1/tts/synthesize  tam metin
  -> framed WAV/PCM -> AudioContext BufferSource
```

Fonksiyon haritası:
1. `createSttStream.start` — `getUserMedia` + `AudioContext` + `ScriptProcessorNode(4096)`.
2. `downsampleToPcm16k8` — 8 kHz s16le; `FRAME_SAMPLES=800` (~100 ms) `socket.send`.
3. `HuggingFaceSttSession.feed` / `_next_job` / `_execute` / `transcribe_wav` — RMS VAD, utterance WAV, HF POST.
4. `applySttEvent` — UI transcript; `partial` canlı satır, `final` parça biriktirir.
5. `scheduleFlush` (1000 ms) → `flushUtterance` → `createLlmStream.sendUserFinal`.
6. `llm_socket` `user_final` → `ConversationManager.accept_user` → `_reply_until_idle` → `_generate`.
7. `LlamaClient.stream_chat` SSE; `ThinkFilter` + `sanitize_speech`; WS `assistant_partial` ancak ≥48 char ve cümle sonu.
8. `assistant_final` → `repair_victim_reply` → `speakAi` → `enqueueTtsAudio` → `FishTTSClient.stream_text`.
9. `playStream` length-prefixed frame; `decodeAudioData` + `playBuffer` (`nextStart` zinciri).

| Adım | Streaming? | Not |
|---|---|---|
| Capture | evet, frame | `createSttStream` |
| STT HF | yarı | utterance WAV; partial ~0.9 s, aralık 0.75 s; Whisper stream değil |
| STT lokal | evet | sherpa `OnlineRecognizer` + `is_endpoint` |
| LLM | evet, token | UI cümle eşiği; TTS bu stream’i kullanmaz |
| TTS | evet, audio chunk | Fish PCM; metin cümle-cümle değil |
| Playback | chunk schedule | `playStream` / `playBuffer` |

**EOS (kullanıcı bitti):** HF `_SILENCE_SEC=0.34`, `_MIN_SPEECH_SEC=0.28`, `_MAX_UTTERANCE_SEC=18`, preroll 0.45 s. Frontend **+1000 ms**. Lokal: `STT_ENDPOINT_RULE1=1.2`, `RULE2=0.7`, `CONFIRM=0.12`. Kickoff: opening yoksa `llm.kickoff()` (`KICKOFF_TEXT="Оператор снял трубку."`).

**Mic hold:** TTS/partial sırasında `setCaptureEnabled(false)`. `waitTtsQueue` veya 12 s sonra mic açılır; `pendingUserRef` varsa ikinci `user_final`.

**History:** `CallSession.messages` RAM’de (`ConversationManager`). `close` → `data/llm-sessions/{call_id}.json`. Tur context: locked system + `Контекст сценария` + son 12 mesaj; son user `/no_think`. Opening assistant olarak eklenir. Öğretmen cue: `intervene` → system extra.

**Timeout/buffer:** STT WS 8 s; LLM WS 20 s; STT stop 2.5 s; TTS 12 s; `LLM_TIMEOUT_SEC=60`; HF STT httpx 20 s; Fish `chunk_length=100`. `takeSpeechChunks` **çağrılmıyor**.

# Latency

Ölçülen gecikme (kodda var):
- LLM: `[LLM] User transcript received`, `Generating response`, `Response complete`. llama.cpp `timings.prompt_ms` / `predicted_ms` — HF Router’da genelde yok.
- TTS: `[TTS] Time-To-Audio %.1fms` (`engine_fish` first chunk + `app.py` HTTP first frame). Header `X-TTS-TTA-MS`.
- STT: `stt failed status=` / exception; TTA / first-partial yok.
- Frontend: yok (`performance.now` yok).

Henüz yok, eklenebilir (implement etme):
- capture: `onaudioprocess` ilk PCM
- VAD: `in_speech` true → `final` emit (`engine_hf._execute`)
- STT: `transcribe_wav` round-trip
- UI: `scheduleFlush` 1000 ms
- LLM TTFT: ilk `assistant_partial`
- TTS: `speakAi` fetch → first playable chunk (HTTP TTA + decode)
- playback: `decodeAudioData` + `nextStart` kuyruk

Kaba sıra (operatör susunca → arayan sesi):
VAD 0.3 s + Whisper RTT (1–3 s+) + flush 1.0 s + Qwen TTFT (1–4 s+) + 48-char gate + **tam final bekleyiş** + Fish TTA (0.5–2 s+) + decode.

**En büyük 3 bottleneck (tahmin):**
1. **STT (Whisper utterance + VAD + 1 s flush).** Stream ASR değil. Sessizlik 340 ms, ilk partial 900 ms, UI 1000 ms, üstüne uzak HF.
2. **LLM first audible.** Uzak `Qwen/Qwen3.5-9B`, uzun system+ticket, `Semaphore(1)`. Partial UI 48 char bekler; **TTS `assistant_final` olmadan başlamaz.**
3. **TTS first-audio.** Fish uzak, `FISH_LATENCY=balanced`, tam cümle(ler) sentezi; her PCM çerçevesi `decodeAudioData`.

# Prompt / Caller Logic

Kilit roller: `apps/llm/src/sys112_llm/conversation.py`
- `VICTIM_SYSTEM_PROMPT` / `OPERATOR_SYSTEM_PROMPT` / `SERVICE_SYSTEM_PROMPT`
- Ticket injection: `buildLessonSystemPrompt` → `apps/student-web/src/data/ags-tickets.ts`
- DDS: `apps/student-web/src/features/dds-training/callback-prompt.ts`
- Öğretmen: `apply_teacher_intervention` + `progress/teacher-cues.ts`

**State machine yok** (canlı yolda). `packages/shared-types/src/scenario/` (states/transitions/RAG) tanımlı ama AGS çağrısında kullanılmıyor. “Aşama” yalnızca history + opening cümlesi.

**Arayan davranışı:**
- Çağrı başında **soru beklemeden** `callerOpening` + TTS. `openingFrom` telefon/FIO keser; 1–2 clause: «Алло, {özet}, помогите!».
- Prompt kuralı: adres/telefon/isim yalnızca sorulursa; yoksa «не знаю»; uydurma yasak; operatör onaylarsa «хорошо»/«жду».
- Gerçekte opening yangın/kavga/DTP özünü **önceden verir** — “sadece sorulan” kuralı ilk turda kırılır.
- Fact kaynağı: `situation`/`address` → `situationWhat`, `extractCallerHint`, `extractPhone`, `extractInjuredName`, `promptForbidden`.
- LLM extra örnek alanlar: `ЧТО СЛУЧИЛОСЬ`, `ФАКТЫ БИЛЕТА ЦЕЛИКОМ`, `АДРЕС`, `КТО ЗВОНИТ`, `ПОСТРАДАВШИЙ`, `ТЕЛЕФОН`, `СЛУЖБЫ ПО БИЛЕТУ`, `ЗАПРЕЩЕНО`.
- Çelişki: `repair_victim_reply`, `repair_caller_name`, `repair_topic_shift`, `fact_for_question`, `breaks_character`, `leaves_role`. Regex yama; grounding/RAG yok.
- Faz yok. `shared-types` `scenarioStateNodeSchema` / `turnPolicySchema` canlı AGS yolunda bağlı değil.
- Öğretmen: `set_emotional_state`, `add_circumstance`, `inject_event`, `reveal_fact`, `conceal_fact`, `adjust_difficulty`, `force_state`, `end_call`.

# Tickets & Scenario Data

**Toplam: 96** (32 bilet × 3 durum `n=1..3`). Kaynak: `apps/student-web/src/data/ags-tickets.json`.

Format: JSON dizi. Ham şema:
```
{ ticket: number, n: number, situation: string, address: string }
```
Runtime `TrainingScenario` (`scenarios.ts`): `id`, `code`, `title`, `summary`, `services[]`, `durationMin`, `difficulty` (`базовый|стандарт|сложный`), `theory[]`, `checklist[]`, `callerOpening`, `ttsVoice?`, `cardFields`, `ticketNo`, `situationNo`, `address`, `situation`, `classifierNumber`.

`ttsVoice`: speaker `xenia|kseniya|baya|eugene|aidar`, pitch, speed, emotion `panic|scared`, gender. `pickCallerVoice` FIO/hint’ten cinsiyet.

Kategori JSON’da yok. `inferServices(situation)`: `fire` | `ambulance` | `police` | `gas`. Sokak aydınlatması → `[]` sonra default `police`. `n` kabaca: 1 yangın/olay, 2 tıp/DTP, 3 polis/gaz/özel — kesin değil. Zorluk `assessDifficulty`. Overlay: `localStorage` `sys112.tickets.v1`.

Skor gerçeği: `ticketFactsFrom` — address, what, callerFio, phone, injuredCount, floor/street parse. LLM’e bu struct gitmez; prompt string gider.

**AI’ya giden:** `buildLessonSystemPrompt`. `theory` yalnız `section=theory`. Checklist / cardFields / classifierNumber çağrı LLM’ine gitmez (kart/skor).

**96’sı kullanılabilir:** `AGS_SCENARIOS = AGS_TICKETS.map(ticketToScenario)`; `buildCatalog()` overlay+custom. DEMO kesimi yok.

Örnekler:
| Kategori | id | Özet |
|---|---|---|
| Yangın | ags-01-1 | Çöp konteyneri, b/p, FIO+tel |
| Kavga+yaralı | ags-01-2 | 10–15 kişi, 5 yaralı |
| Tıbbi çocuk | ags-01-3 | Bisiklet, ödem, anne arıyor |
| DTP | ags-25-2 | Peugeot+VW, B/P B/R, MKAD |
| Gaz | ags-30-3 | Girişte gaz kokusu/gürültü |

Diğer: `infra/database` seed (katalog senkron), `ticket-gen.py` (LLM ile yeni bilet). ARM classifier JSON ayrı, çağrı LLM’ine gitmez.

# Current AI Training Method

**Fine-tuning / LoRA / model training yok.** `download_model.py` ağırlık indirir, eğitmez.

Kullanılan:
1. System prompt engineering (`conversation.py`)
2. Scenario/ticket injection (`ags-tickets.ts`)
3. Post-hoc regex repair (`repair_victim_reply`)
4. Öğretmen müdahalesi (system extra + nudge)
5. Opening cümlesi (few-shot değil, sabit ilk replik)

**Yok:** RAG (Nest `RetrievalPort`/`EmbeddingsPort` mock), few-shot diyalog örnekleri, LoRA.

“Training” UI = öğrenci egzersizi, model eğitimi değil.

# Voice / TTS

Voice id (değiştirme): `.env` `FISH_VICTIM_FEMALE_REFERENCE_ID`, `FISH_VICTIM_MALE_REFERENCE_ID`; opsiyonel `FISH_OPERATOR_REFERENCE_ID`, `FISH_REFERENCE_ID`. Zero-shot yedek: `FISH_REFERENCE_AUDIO` + `FISH_REFERENCE_TEXT`. Çözüm: `FishTTSClient.voice_for` — kadın victim default female id, `gender=male` → male id, operator → operator id.

Rol map: `voices.py` `resolve_role` / `resolve_profile`. Senaryo `ttsVoice` (`pickCallerVoice`) speaker+emotion taşır; Fish clone id speaker adını override eder. `call-page.callerVoice()` training’de `scenario.ttsVoice`, DDS’de `aidar`+`dispatch`.

Prosodi: `apply_fish_prosody` — panic `[panicked]`, scared `[nervous]`, yangın/gaz kelimesinde `[breathing heavily]`, operator `[serious] [professional broadcast tone]`. Speed: Fish `Prosody` yalnız dispatch 1.02–1.15. Pitch PCM’e uygulanmaz.

Frontend JSON: `emotion`, `pitch`, `speed`, `gender`, `speaker` (`fetchTtsResponse`). **EQ/reverb/telephone filter yok.** `playBuffer`: `source.connect(ctx.destination)` + opsiyonel `recordMix`.

**Mevcut konuşmacı sesini değiştirmeyin.** Ambiyans ayrı source.

# Background Ambience Integration Point

`mixer.py` konuşmayı WAV’e **pişirir** (`telephone_effect` + loop). Fish `ambient_type`’ı **yutar** (`del ambient_type`). Kullanıcı isteğiyle uyumsuz.

**En temiz nokta:** `apps/student-web/src/lib/tts-player.ts` + `call-page.tsx` `startCall` / teardown.

- Ayrı `AudioBufferSourceNode` + `GainNode` (loop), TTS source’undan bağımsız.
- `startCall` sonrası loop; `stopTtsAudio` / unmount’ta durdur.
- Tip: `scenario.services` + situation (fire → yangın/kalabalık; DTP → trafik/kaza; gas → endüstriyel; diğer → phone_static). Mevcut `AMBIENT_TYPES`: `traffic_siren`, `car_crash`, `crowd_panic`, `phone_static` — yangın loop’u yok, yeni clip gerekir.
- TTS buffer’ına mix etme; `engine_fish.synthesize_stream`’e dokunma.

# Important File Map

| Ne | Dosya |
|---|---|
| STT app/VAD | `apps/stt/src/sys112_stt/{app,engine,engine_hf,config}.py` |
| LLM WS/prompt | `apps/llm/src/sys112_llm/{app,conversation,client,config}.py` |
| TTS/Fish | `apps/tts/src/sys112_tts/{app,engine,engine_fish,fish_client,voices,mixer,config}.py` |
| Call UI | `apps/student-web/src/pages/call-page.tsx` |
| Client IO | `apps/student-web/src/lib/{stt-stream,llm-stream,tts-player,capture-audio}.ts` |
| Ticket | `apps/student-web/src/data/{ags-tickets.json,ags-tickets.ts,scenarios.ts,ticket-catalog.ts}` |
| Facts/skor | `apps/student-web/src/progress/ticket-facts.ts` |
| Proxy | `apps/student-web/vite.config.ts` (`/ws/stt`, `/ws/llm`, `/api/v1/tts` → 8090/8091/8092) |
| Compose | `infra/docker/docker-compose.yml` |
| Env adları | `.env.example` (değer yazma) |
| Nest stub | `apps/api/src/training/call-orchestrator.ts`, `apps/api/src/infrastructure/ai/` |
| Ports (ölü) | `apps/api/src/ports/index.ts` |
| Scenario şema (ölü) | `packages/shared-types/src/scenario/` |
| DDS prompt | `apps/student-web/src/features/dds-training/callback-prompt.ts` |
| Start | `scripts/start-{stt,llm,tts}.ps1`, `apps/{stt,llm,tts}/src/sys112_*/__main__.py` |

# Main Problems

1. `LLM_MODE=local` ama konuşma HF uzak; llama.cpp gölge servis.
2. Çift yığın: Nest mock pipeline vs gerçek Python WS.
3. Arayan opening ile bilgi döküyor; “yalnızca sorulursa” kuralı ilk turda kırılıyor.
4. Canlı yolda scenario state machine yok.
5. LLM stream var, TTS cümle-cümle bağlı değil → ekstra gecikme.
6. STT stream değil (HF) + 1 s UI flush.
7. Ambiyans mixer ses dosyasına gömer; Fish yok sayar.
8. Repair katmanı kırık Rusça/rol sızıntısını kısmen yakalar; tutarlı persona garantisi yok.
9. System prompt çok uzun → TTFT.

# Recommended Next Step

1. Timing log (callId korelasyonu): STT final, flush, LLM TTFT, TTS TTA, first playback. Ses/prompt değiştirme.
2. Gecikme: `assistant_partial` → zaten var `takeSpeechChunks` ile cümle TTS; `scheduleFlush` 1000 ms’i kısalt. `FISH_*_REFERENCE_ID` dokunma.
3. Davranış: `openingFrom` olay dökmesin («Алло, помогите»). Prompt “sorulmadan fact yok” ile hizala.
4. Ambiyans: yalnızca `tts-player` ayrı loop GainNode; `mixer.mix` / Fish body’ye gömme.
