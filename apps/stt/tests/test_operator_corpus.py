from sys112_stt.engine_hf import clean_transcript
from sys112_stt.operator_corpus import OPERATOR_STT_CORPUS, OPERATOR_STT_MIXED, OPERATOR_STT_REJECTED
from sys112_stt.transcript_postprocessor import gate_russian_operator_text


def test_operator_corpus_is_accepted_unchanged():
    for phrase in OPERATOR_STT_CORPUS:
        assert gate_russian_operator_text(phrase) == phrase
        assert clean_transcript(phrase) == phrase


def test_operator_english_is_rejected():
    for phrase in OPERATOR_STT_REJECTED:
        assert gate_russian_operator_text(phrase) == ""
        assert clean_transcript(phrase) == ""


def test_operator_mixed_is_cleaned():
    for heard, expected in OPERATOR_STT_MIXED:
        assert gate_russian_operator_text(heard) == expected
        assert clean_transcript(heard) == expected
