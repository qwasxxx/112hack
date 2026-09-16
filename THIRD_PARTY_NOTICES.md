# Third-party notices

This project includes or depends on the following open-source components.

## T-one

- Project: https://github.com/voicekit-team/T-one
- License: Apache License 2.0
- Use: Russian telephony streaming CTC ASR model packaged for local inference.

## sherpa-onnx

- Project: https://github.com/k2-fsa/sherpa-onnx
- License: Apache License 2.0
- Use: Local streaming ASR runtime (`OnlineRecognizer.from_t_one_ctc`) and the packaged model `sherpa-onnx-streaming-t-one-russian-2025-09-08`.

## FastAPI / Starlette / Uvicorn

- Licenses: MIT
- Use: Local STT and LLM HTTP/WebSocket services.

## Qwen3-4B / Qwen3-4B-GGUF

- Project: https://huggingface.co/Qwen/Qwen3-4B
- GGUF: https://huggingface.co/Qwen/Qwen3-4B-GGUF
- License: Apache License 2.0
- Use: Local conversational LLM (`Qwen3-4B-Q4_K_M.gguf`).

## llama.cpp

- Project: https://github.com/ggml-org/llama.cpp
- License: MIT
- Use: Local OpenAI-compatible inference server for the GGUF model.

Apache License 2.0 texts are available from the upstream repositories. Do not remove copyright notices from third-party source or model files.
