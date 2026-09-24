from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from sys112_stt.audio import pcm_s16le_to_float32
from sys112_stt.config import (
    HF_STT_MODES,
    HF_TOKEN,
    STT_DECODING_METHOD,
    STT_ENDPOINT_CONFIRM,
    STT_ENDPOINT_RULE1,
    STT_ENDPOINT_RULE2,
    STT_MODE,
    STT_MODEL_DIR,
    STT_NUM_THREADS,
    STT_ONNX_PROVIDER,
    STT_PARTIAL_DELAY,
    STT_SAMPLE_RATE,
)
from sys112_stt.transcript_postprocessor import normalize_transcript, stable_prefix

MOCK_PHRASES = [
    "Здравствуйте, у меня пожар.",
    "Пожар происходит в квартире.",
    "Пятый этаж, квартира сорок три.",
]


class RecognizerLike(Protocol):
    def create_stream(self) -> Any: ...
    def is_ready(self, stream: Any) -> bool: ...
    def decode_stream(self, stream: Any) -> None: ...
    def get_result(self, stream: Any) -> str: ...
    def is_endpoint(self, stream: Any) -> bool: ...
    def reset(self, stream: Any) -> None: ...
    def timestamps(self, stream: Any) -> list[float]: ...


def model_files_present(model_dir: Path) -> bool:
    return (model_dir / "model.onnx").is_file() and (model_dir / "tokens.txt").is_file()


def load_recognizer() -> tuple[RecognizerLike | None, str]:
    if STT_MODE in HF_STT_MODES:
        return None, "ready" if HF_TOKEN else "not_ready"
    if STT_MODE == "mock":
        return None, "mock"
    if not model_files_present(STT_MODEL_DIR):
        return None, "not_ready"
    import sherpa_onnx

    recognizer = sherpa_onnx.OnlineRecognizer.from_t_one_ctc(
        tokens=str(STT_MODEL_DIR / "tokens.txt"),
        model=str(STT_MODEL_DIR / "model.onnx"),
        num_threads=STT_NUM_THREADS,
        sample_rate=STT_SAMPLE_RATE,
        feature_dim=80,
        decoding_method=STT_DECODING_METHOD,
        provider=STT_ONNX_PROVIDER,
        enable_endpoint_detection=True,
        rule1_min_trailing_silence=STT_ENDPOINT_RULE1,
        rule2_min_trailing_silence=STT_ENDPOINT_RULE2,
        rule3_min_utterance_length=20.0,
        debug=False,
    )
    return recognizer, "ready"


@dataclass
class SttSession:
    recognizer: RecognizerLike | None
    stream: Any | None
    sample_rate: int = STT_SAMPLE_RATE
    audio_seconds: float = 0.0
    last_partial: str = ""
    finals: list[dict[str, Any]] = field(default_factory=list)
    mock: bool = False
    mock_index: int = 0
    pending_endpoint: bool = False
    held_seconds: float = 0.0
    skip_until: float = 0.0
    full_hypothesis: str = ""

    def accept_pcm(self, chunk: bytes) -> list[dict[str, Any]]:
        samples = pcm_s16le_to_float32(chunk)
        if not samples:
            return []
        duration = len(samples) / self.sample_rate
        self.audio_seconds += duration
        if self.mock:
            return self._mock_decode()
        if self.recognizer is None or self.stream is None:
            return []
        self.stream.accept_waveform(self.sample_rate, samples)
        return self._decode(chunk_duration=duration)

    def finish(self) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        if self.mock:
            events.extend(self._mock_decode(force_final=True))
        elif self.recognizer is not None and self.stream is not None:
            tail = [0.0] * int(self.sample_rate * 0.6)
            self.stream.accept_waveform(self.sample_rate, tail)
            if hasattr(self.stream, "input_finished"):
                self.stream.input_finished()
            events.extend(self._decode(force_final=True))
        text = normalize_transcript(" ".join(item["text"] for item in self.finals))
        events.append({"type": "session_complete", "text": text, "phrases": self.finals})
        return events

    def _mock_decode(self, force_final: bool = False) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        due = int(self.audio_seconds // 1.5)
        while self.mock_index < due and self.mock_index < len(MOCK_PHRASES):
            phrase = MOCK_PHRASES[self.mock_index]
            start = round(self.mock_index * 1.5, 2)
            end = round(start + 1.4, 2)
            self.finals.append({"text": phrase, "start": start, "end": end})
            events.append({"type": "final", "text": phrase, "start": start, "end": end})
            self.last_partial = ""
            self.mock_index += 1
        if not force_final and self.mock_index < len(MOCK_PHRASES) and self.audio_seconds > self.mock_index * 1.5:
            partial = MOCK_PHRASES[self.mock_index][: max(4, int((self.audio_seconds % 1.5) * 12))]
            if partial != self.last_partial:
                self.last_partial = partial
                events.append({"type": "partial", "text": partial})
        if force_final and self.last_partial:
            phrase = self.last_partial
            self.finals.append({"text": phrase, "start": round(max(0.0, self.audio_seconds - 1), 2), "end": round(self.audio_seconds, 2)})
            events.append({"type": "final", "text": phrase, "start": round(max(0.0, self.audio_seconds - 1), 2), "end": round(self.audio_seconds, 2)})
            self.last_partial = ""
        return events

    def _decode(self, force_final: bool = False, chunk_duration: float = 0.0) -> list[dict[str, Any]]:
        assert self.recognizer is not None
        assert self.stream is not None
        events: list[dict[str, Any]] = []
        while self.recognizer.is_ready(self.stream):
            self.recognizer.decode_stream(self.stream)
        text = normalize_transcript(self.recognizer.get_result(self.stream) or "")
        self.full_hypothesis = text
        stamps: list[float] = []
        try:
            stamps = list(self.recognizer.timestamps(self.stream) or [])
        except Exception:
            stamps = []
        visible = text if force_final else stable_prefix(text, stamps, self.audio_seconds, STT_PARTIAL_DELAY)
        if visible and _is_shorter_partial(self.last_partial, visible):
            visible = self.last_partial
        if visible and visible != self.last_partial:
            self.last_partial = visible
            events.append({"type": "partial", "text": visible})

        if force_final:
            events.extend(self._commit_final(text))
            return events

        endpoint = self.recognizer.is_endpoint(self.stream)
        if endpoint:
            if not self.pending_endpoint:
                self.pending_endpoint = True
                self.held_seconds = 0.0
            self.held_seconds += chunk_duration
            if self.held_seconds >= STT_ENDPOINT_CONFIRM:
                events.extend(self._commit_final(text))
        else:
            self.pending_endpoint = False
            self.held_seconds = 0.0
        return events

    def _commit_final(self, text: str) -> list[dict[str, Any]]:
        assert self.recognizer is not None
        assert self.stream is not None
        final_text = normalize_transcript(text or self.full_hypothesis or self.last_partial)
        self.pending_endpoint = False
        self.held_seconds = 0.0
        self.last_partial = ""
        self.full_hypothesis = ""
        if not final_text:
            self.recognizer.reset(self.stream)
            return []
        if self.finals:
            previous = self.finals[-1]["text"]
            if final_text == previous or (len(final_text) <= 8 and final_text in previous):
                self.recognizer.reset(self.stream)
                return []
        stamps: list[float] = []
        try:
            stamps = list(self.recognizer.timestamps(self.stream) or [])
        except Exception:
            stamps = []
        start = float(stamps[0]) if stamps else max(0.0, self.audio_seconds - 3.0)
        end = float(stamps[-1]) if stamps else self.audio_seconds
        phrase = {"text": final_text, "start": round(start, 2), "end": round(end, 2)}
        self.finals.append(phrase)
        self.recognizer.reset(self.stream)
        return [{"type": "final", **phrase}]


def _is_shorter_partial(previous: str, visible: str) -> bool:
    if not previous or not visible or previous == visible:
        return False
    prev = previous.strip()
    nxt = visible.strip()
    return prev.startswith(nxt) or (nxt in prev and len(nxt) + 4 <= len(prev))


def create_session(recognizer: RecognizerLike | None, status: str) -> SttSession:
    if STT_MODE in HF_STT_MODES:
        from sys112_stt.engine_hf import HuggingFaceSttSession

        return HuggingFaceSttSession()  # type: ignore[return-value]
    mock = recognizer is None or status != "ready"
    if recognizer is None:
        return SttSession(recognizer=None, stream=None, mock=mock)
    stream = recognizer.create_stream()
    pad = [0.0] * int(STT_SAMPLE_RATE * 0.3)
    stream.accept_waveform(STT_SAMPLE_RATE, pad)
    return SttSession(recognizer=recognizer, stream=stream, mock=False)
