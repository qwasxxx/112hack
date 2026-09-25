FROM python:3.11-slim-bookworm

WORKDIR /app
COPY apps/llm/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY apps/llm /app/apps/llm
ENV PYTHONPATH=/app/apps/llm/src
ENV LLM_PROVIDER=huggingface
ENV LLM_BASE_URL=https://router.huggingface.co

EXPOSE 8091
CMD ["python", "-m", "uvicorn", "sys112_llm.app:app", "--host", "0.0.0.0", "--port", "8091"]
