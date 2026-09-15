import json

from fastapi.testclient import TestClient
from sys112_stt.app import app


def test_websocket_start_and_stop():
    with TestClient(app) as client:
        with client.websocket_connect("/ws/stt") as ws:
            ws.send_text(
                json.dumps(
                    {"type": "start", "sample_rate": 8000, "channels": 1, "encoding": "pcm_s16le"}
                )
            )
            first = ws.receive_json()
            assert first["type"] in ("ready", "error")
            if first["type"] == "error":
                ws.send_text(json.dumps({"type": "stop"}))
                last = ws.receive_json()
                assert last["type"] == "session_complete"
                return
            ws.send_bytes(b"\x00\x00" * 1600)
            ws.send_text(json.dumps({"type": "stop"}))
            last = None
            for _ in range(12):
                last = ws.receive_json()
                if last["type"] == "session_complete":
                    break
            assert last is not None
            assert last["type"] == "session_complete"


def test_websocket_disconnect_reconnect():
    with TestClient(app) as client:
        with client.websocket_connect("/ws/stt") as first:
            first.send_text(
                json.dumps({"type": "start", "sample_rate": 8000, "channels": 1, "encoding": "pcm_s16le"})
            )
            first.receive_json()
        with client.websocket_connect("/ws/stt") as second:
            second.send_text(
                json.dumps({"type": "start", "sample_rate": 8000, "channels": 1, "encoding": "pcm_s16le"})
            )
            message = second.receive_json()
            assert message["type"] in ("ready", "error")
            second.send_text(json.dumps({"type": "stop"}))
            complete = second.receive_json()
            assert complete["type"] == "session_complete"
