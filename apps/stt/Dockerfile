FROM python:3.11-slim-bookworm

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

COPY apps/stt/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY apps/stt /app/apps/stt
ENV PYTHONPATH=/app/apps/stt/src
ENV STT_MODE=huggingface

EXPOSE 8090
CMD ["python", "-m", "uvicorn", "sys112_stt.app:app", "--host", "0.0.0.0", "--port", "8090"]
