FROM python:3.11-slim-bookworm

WORKDIR /app
COPY apps/tts/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY apps/tts /app/apps/tts
ENV PYTHONPATH=/app/apps/tts/src
ENV TTS_HOST=0.0.0.0
ENV TTS_PORT=8092
ENV TTS_LANGUAGE=ru
ENV TTS_THREADS=4

EXPOSE 8092
CMD ["sh", "-c", "python /app/apps/tts/scripts/download_silero.py; python -m uvicorn sys112_tts.app:app --host 0.0.0.0 --port 8092"]
