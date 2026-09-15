FROM python:3.11-slim-bookworm

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

COPY apps/stt/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY apps/stt /app/apps/stt
ENV PYTHONPATH=/app/apps/stt/src
ENV STT_MODEL_PATH=/models/sherpa-onnx-streaming-t-one-russian-2025-09-08
ENV STT_MODE=local

EXPOSE 8090
CMD ["sh", "-c", "python /app/apps/stt/scripts/download_model.py && python -m uvicorn sys112_stt.app:app --host 0.0.0.0 --port 8090"]
