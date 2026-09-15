from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import tarfile
import urllib.request

from sys112_stt.config import MODEL_URL, STT_MODEL_DIR
from sys112_stt.engine import model_files_present

ARCHIVE_NAME = "sherpa-onnx-streaming-t-one-russian-2025-09-08.tar.bz2"


def download_model() -> Path:
    target = STT_MODEL_DIR
    if model_files_present(target):
        print(f"model already present: {target}")
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    archive = target.parent / ARCHIVE_NAME
    print(f"downloading {MODEL_URL}")
    urllib.request.urlretrieve(MODEL_URL, archive)
    print(f"extracting {archive}")
    with tarfile.open(archive, "r:bz2") as tar:
        tar.extractall(target.parent)
    if not model_files_present(target):
        raise FileNotFoundError(f"model files missing after extract: {target}")
    print(f"model ready: {target}")
    return target


if __name__ == "__main__":
    download_model()
