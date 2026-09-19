from __future__ import annotations

import json
import logging
import os
import shutil
import stat
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

from sys112_llm.config import (
    LLM_CONTEXT_SIZE,
    LLM_LLAMA_PORT,
    LLM_MIN_MODEL_BYTES,
    LLM_MODEL_PATH,
    LLM_MODEL_URL,
    LLM_THREADS,
    LLM_THREADS_BATCH,
    LLM_TOOLS_DIR,
)

logger = logging.getLogger("sys112_llm")
GITHUB_RELEASES = "https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=15"


def model_present() -> bool:
    return LLM_MODEL_PATH.is_file() and LLM_MODEL_PATH.stat().st_size >= LLM_MIN_MODEL_BYTES


def download_model() -> Path:
    if model_present():
        logger.info("[LLM] Model already present: %s", LLM_MODEL_PATH)
        print(f"[LLM] Model already present: {LLM_MODEL_PATH}", flush=True)
        return LLM_MODEL_PATH
    LLM_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = LLM_MODEL_PATH.with_suffix(".gguf.part")
    logger.info("[LLM] Loading model... downloading %s", LLM_MODEL_URL)
    print(f"[LLM] Loading model... downloading {LLM_MODEL_URL}", flush=True)
    curl = shutil.which("curl")
    if curl:
        subprocess.check_call(
            [curl, "-L", "--retry", "3", "--fail", "-o", str(tmp), LLM_MODEL_URL],
        )
    else:
        request = urllib.request.Request(LLM_MODEL_URL, headers={"User-Agent": "sys112-trainer"})
        with urllib.request.urlopen(request, timeout=120) as response, tmp.open("wb") as handle:
            total = int(response.headers.get("Content-Length") or 0)
            copied = 0
            last_pct = -1
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
                copied += len(chunk)
                if total:
                    pct = copied * 100 // total
                    if pct >= last_pct + 10:
                        last_pct = pct
                        print(f"[LLM] Downloading model {pct}%", flush=True)
    if tmp.stat().st_size < LLM_MIN_MODEL_BYTES:
        tmp.unlink(missing_ok=True)
        raise RuntimeError("LLM model download is too small or incomplete")
    tmp.replace(LLM_MODEL_PATH)
    logger.info("[LLM] Model ready: %s", LLM_MODEL_PATH)
    print(f"[LLM] Model ready: {LLM_MODEL_PATH}", flush=True)
    return LLM_MODEL_PATH


def _find_server_binary() -> Path | None:
    names = ["llama-server.exe", "llama-server"]
    if LLM_TOOLS_DIR.is_dir():
        for path in LLM_TOOLS_DIR.rglob("*"):
            if path.is_file() and path.name.lower() in {item.lower() for item in names}:
                return path
    for name in names:
        found = shutil.which(name)
        if found:
            return Path(found)
    return None


def _pick_asset(assets: list[dict]) -> dict:
    scored: list[tuple[int, dict]] = []
    windows = sys.platform.startswith("win")
    for item in assets:
        name = item.get("name", "").lower()
        if not name.endswith(".zip"):
            continue
        score = 0
        if windows:
            if "win" in name:
                score += 4
            if "cpu" in name:
                score += 3
            if "x64" in name or "avx2" in name or "avx" in name:
                score += 1
            if "arm64" in name:
                score -= 5
            if "cuda" in name or "vulkan" in name:
                score -= 6
        else:
            if "ubuntu" in name or "linux" in name:
                score += 4
            if "server" in name:
                score += 1
            if "cuda" in name:
                score -= 3
        if score > 0:
            scored.append((score, item))
    if not scored:
        names = [item.get("name", "") for item in assets]
        raise RuntimeError(f"No llama.cpp zip in release assets: {names[:12]}")
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return scored[0][1]


def download_llama_server() -> Path:
    existing = _find_server_binary()
    if existing:
        return existing
    LLM_TOOLS_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("[LLM] Downloading llama.cpp server")
    print("[LLM] Downloading llama.cpp server", flush=True)
    request = urllib.request.Request(GITHUB_RELEASES, headers={"User-Agent": "sys112-trainer"})
    with urllib.request.urlopen(request, timeout=60) as response:
        releases = json.loads(response.read().decode("utf-8"))
    if isinstance(releases, dict):
        releases = [releases]
    asset = None
    last_error = "no releases"
    for release in releases:
        try:
            asset = _pick_asset(release.get("assets") or [])
            break
        except RuntimeError as exc:
            last_error = str(exc)
    if asset is None:
        raise RuntimeError(f"No llama.cpp zip in recent releases: {last_error}")
    archive = LLM_TOOLS_DIR / asset["name"]
    urllib.request.urlretrieve(asset["browser_download_url"], archive)
    with zipfile.ZipFile(archive) as zipped:
        zipped.extractall(LLM_TOOLS_DIR)
    found = _find_server_binary()
    if not found:
        raise RuntimeError("llama-server binary missing after extract")
    found.chmod(found.stat().st_mode | stat.S_IEXEC)
    print(f"[LLM] llama-server: {found}", flush=True)
    return found


def build_llama_command(binary: Path) -> list[str]:
    command = [
        str(binary),
        "-m",
        str(LLM_MODEL_PATH),
        "--host",
        "127.0.0.1",
        "--port",
        str(LLM_LLAMA_PORT),
        "-c",
        str(LLM_CONTEXT_SIZE),
        "--jinja",
        "--chat-template-kwargs",
        '{"enable_thinking": false}',
        "--reasoning",
        "off",
        "-t",
        str(LLM_THREADS),
        "--threads-batch",
        str(LLM_THREADS_BATCH),
        "-b",
        "1024",
        "-ub",
        "512",
        "--flash-attn",
        "on",
        "--cache-type-k",
        "q8_0",
        "--cache-type-v",
        "q8_0",
        "--parallel",
        "1",
        "-ngl",
        "0",
    ]
    return command


def wait_ready(url: str, timeout: float = 120.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except Exception:
            time.sleep(1.0)
    return False


def start_llama_process() -> subprocess.Popen[bytes]:
    if not model_present():
        download_model()
    binary = download_llama_server()
    command = build_llama_command(binary)
    process = _spawn(command)
    ready = wait_ready(f"http://127.0.0.1:{LLM_LLAMA_PORT}/v1/models", timeout=180)
    if not ready:
        process.terminate()
        stripped = [item for item in command if item != "--chat-template-kwargs" and item != '{"enable_thinking": false}']
        if stripped != command:
            logger.info("[LLM] Retrying llama.cpp without chat-template-kwargs")
            process = _spawn(stripped)
            ready = wait_ready(f"http://127.0.0.1:{LLM_LLAMA_PORT}/v1/models", timeout=180)
            command = stripped
    if not ready:
        process.terminate()
        compact = []
        skip_next = False
        drop = {"--cache-type-k", "--cache-type-v", "--parallel", "--flash-attn"}
        for item in command:
            if skip_next:
                skip_next = False
                continue
            if item in drop:
                skip_next = True
                continue
            compact.append(item)
        if compact != command:
            logger.info("[LLM] Retrying llama.cpp without quantized KV cache")
            process = _spawn(compact)
            ready = wait_ready(f"http://127.0.0.1:{LLM_LLAMA_PORT}/v1/models", timeout=180)
    if not ready:
        process.terminate()
        raise RuntimeError("llama.cpp server failed to become ready")
    logger.info("[LLM] Model ready")
    return process


def _spawn(command: list[str]) -> subprocess.Popen[bytes]:
    logger.info("[LLM] Starting llama.cpp: %s", " ".join(command))
    creation = 0
    if os.name == "nt":
        creation = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    env = os.environ.copy()
    env["LLAMA_CHAT_TEMPLATE_KWARGS"] = '{"enable_thinking": false}'
    return subprocess.Popen(
        command,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=creation,
        env=env,
    )
