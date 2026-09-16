from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from sys112_llm.runtime import download_llama_server, download_model, model_present

if __name__ == "__main__":
    download_model()
    try:
        path = download_llama_server()
        print(f"llama-server: {path}")
    except Exception as exc:
        print(f"llama-server download skipped: {exc}")
    print("model present" if model_present() else "model missing")
