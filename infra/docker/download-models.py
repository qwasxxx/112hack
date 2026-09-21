from __future__ import annotations

import os
import shutil
import subprocess
import tarfile
import urllib.request
from pathlib import Path

STT_DIR = Path(
    os.environ.get(
        "STT_MODEL_PATH",
        "/models/sherpa-onnx-streaming-t-one-russian-2025-09-08",
    )
)
STT_URL = os.environ.get(
    "STT_MODEL_URL",
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-t-one-russian-2025-09-08.tar.bz2",
)
LLM_PATH = Path(os.environ.get("LLM_MODEL_PATH", "/models/llm/Qwen3-4B-Q4_K_M.gguf"))
LLM_URL = os.environ.get(
    "LLM_MODEL_URL",
    "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf",
)
MIN_LLM = int(os.environ.get("LLM_MIN_MODEL_BYTES", "2000000000"))


def fetch(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"downloading {url}", flush=True)
    curl = shutil.which("curl")
    if curl:
        subprocess.check_call(
            [
                curl,
                "-L",
                "--retry",
                "5",
                "--retry-all-errors",
                "-C",
                "-",
                "--fail",
                "-A",
                "sys112-trainer",
                "-o",
                str(tmp),
                url,
            ]
        )
    else:
        request = urllib.request.Request(url, headers={"User-Agent": "sys112-trainer"})
        with urllib.request.urlopen(request, timeout=300) as response, tmp.open("wb") as handle:
            total = int(response.headers.get("Content-Length") or 0)
            copied = 0
            last = -1
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
                copied += len(chunk)
                if total:
                    pct = copied * 100 // total
                    if pct >= last + 5:
                        last = pct
                        print(f"  {dest.name} {pct}%", flush=True)
    tmp.replace(dest)
    print(f"saved {dest} ({dest.stat().st_size} bytes)", flush=True)


def ensure_stt() -> None:
    if (STT_DIR / "model.onnx").is_file() and (STT_DIR / "tokens.txt").is_file():
        print(f"stt already present: {STT_DIR}", flush=True)
        return
    archive = STT_DIR.parent / "sherpa-onnx-streaming-t-one-russian-2025-09-08.tar.bz2"
    if not archive.is_file():
        fetch(STT_URL, archive)
    print(f"extracting {archive}", flush=True)
    with tarfile.open(archive, "r:bz2") as tar:
        tar.extractall(STT_DIR.parent)
    if not (STT_DIR / "model.onnx").is_file():
        raise FileNotFoundError(f"STT model missing after extract: {STT_DIR}")
    print(f"stt ready: {STT_DIR}", flush=True)


def ensure_llm() -> None:
    if LLM_PATH.is_file() and LLM_PATH.stat().st_size >= MIN_LLM:
        print(f"llm already present: {LLM_PATH}", flush=True)
        return
    fetch(LLM_URL, LLM_PATH)
    if LLM_PATH.stat().st_size < MIN_LLM:
        LLM_PATH.unlink(missing_ok=True)
        raise RuntimeError("LLM download is too small")
    print(f"llm ready: {LLM_PATH}", flush=True)


if __name__ == "__main__":
    ensure_stt()
    ensure_llm()
    print("models ready", flush=True)
