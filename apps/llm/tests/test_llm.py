from sys112_llm.conversation import ConversationManager
from sys112_llm.think import ThinkFilter
from sys112_llm.client import sanitize_speech, strip_reasoning


def test_history_keeps_two_user_turns():
    manager = ConversationManager()
    manager.create("call-a", "victim", "Ты заявитель.")
    first = manager.accept_user("call-a", "Здравствуйте, у нас пожар.", "m1")
    assert first is not None
    manager.append_assistant("call-a", "Назовите адрес.")
    second = manager.accept_user("call-a", "Улица Малышева, 51.", "m2")
    assert second is not None
    roles = [item.role for item in second.messages]
    assert roles == ["system", "user", "assistant", "user"]
    assert second.messages[-1].content == "Улица Малышева, 51."


def test_sessions_do_not_mix():
    manager = ConversationManager()
    manager.create("one", "victim")
    manager.create("two", "operator")
    manager.accept_user("one", "Пожар.", "a")
    manager.accept_user("two", "Адрес?", "b")
    assert manager.get("one").messages[-1].content == "Пожар."
    assert manager.get("two").messages[-1].content == "Адрес?"
    manager.close("one")
    assert manager.get("one") is None
    assert manager.get("two") is not None


def test_empty_and_duplicate_are_ignored():
    manager = ConversationManager()
    manager.create("call-b")
    assert manager.accept_user("call-b", "   ", "x") is None
    assert manager.accept_user("call-b", "Пожар в квартире.", "id-1") is not None
    assert manager.accept_user("call-b", "Пожар в квартире.", "id-1") is None


def test_drop_unanswered_user_keeps_opening():
    manager = ConversationManager()
    session = manager.create("call-x", "victim", opening="Алло, помогите!")
    manager.accept_user("call-x", "Скажите адрес", "u1")
    manager.drop_unanswered_user("call-x")
    roles = [item.role for item in session.messages]
    assert roles == ["system", "assistant"]
    assert session.messages[-1].content == "Алло, помогите!"


def test_default_prompt_is_light_and_keeps_history():
    manager = ConversationManager()
    session = manager.create("call-c", "operator")
    assert "Одна-две" not in session.messages[0].content
    assert "Сначала" not in session.messages[0].content
    manager.accept_user("call-c", "Здравствуйте, у нас пожар.", "m1")
    manager.append_assistant("call-c", "Где это происходит?")
    manager.accept_user("call-c", "Улица Малышева, 51.", "m2")
    roles = [item.role for item in manager.get("call-c").messages]
    assert roles == ["system", "user", "assistant", "user"]
    manager = ConversationManager()
    manager.create("old", "operator", "Старый промпт.")
    manager.accept_user("old", "Пожар.", "m1")
    manager.close("old")
    fresh = manager.create("new", "operator", "Новый промпт.")
    assert manager.get("old") is None
    assert fresh.messages[0].content.startswith("/no_think")
    assert "Новый промпт." in fresh.messages[0].content
    assert "опытный диспетчер" in fresh.messages[0].content
    assert len(fresh.messages) == 1
    from sys112_llm.conversation import generation_messages

    victim = manager.create("victim-lock", "victim", "Ты оператор.")
    payload = generation_messages(victim)
    assert payload[0]["role"] == "system"
    assert "пострадавший" in payload[0]["content"]
    assert "Не будь оператором" in payload[0]["content"]
    assert payload[0]["content"].startswith("/no_think")


def test_generation_keeps_only_recent_turns():
    from sys112_llm.conversation import generation_messages

    manager = ConversationManager()
    manager.create("long", "operator")
    for index in range(10):
        manager.accept_user("long", f"Реплика {index}.", f"u{index}")
        manager.append_assistant("long", f"Ответ {index}.")
    payload = generation_messages(manager.get("long"))
    user_assistant = [item for item in payload if item["role"] != "system"]
    assert len(user_assistant) == 12
    assert user_assistant[0]["content"] == "Реплика 4."
    assert user_assistant[-1]["content"] == "Ответ 9."


def test_closed_session_rejects_user():
    manager = ConversationManager()
    manager.create("gone")
    manager.close("gone")
    assert manager.accept_user("gone", "Алло", "z") is None


def test_think_filter_and_strip():
    filt = ThinkFilter()
    assert filt.feed("<think>тайна</think>Назовите адрес") == "Назовите адрес"
    assert strip_reasoning("  Назовите   адрес. ") == "Назовите адрес."
    leaked = sanitize_speech("У меня случилась авария. Я в车道e, машина задействована.")
    assert "车" not in leaked
    assert "e," not in leaked
    assert "авария" in leaked
    spoken = sanitize_speech("Это STR 2, через 3 KM, ул. Ленина д. 5")
    assert "строение" in spoken
    assert "километр" in spoken
    assert "улица" in spoken
    assert "дом" in spoken
    assert "STR" not in spoken
    assert "KM" not in spoken
    station = sanitize_speech("около ст. Киевская, строение2")
    assert "станция" in station
    assert "строение 2" in station
    place = sanitize_speech("В Волгоградской обл., г. Волжский, ул. Карла Маркса")
    assert "области" in place
    assert "город" in place
    assert "улица" in place
    assert "обл." not in place
    assert "г." not in place
    session = ConversationManager().create("ru-only", "victim")
    assert "иероглиф" in session.messages[0].content


def test_health_and_websocket_mock():
    from fastapi.testclient import TestClient
    from sys112_llm.app import app

    with TestClient(app) as client:
        body = client.get("/api/llm/health").json()
        assert body["model"] == "Qwen3-4B"
        assert body["runtime"] == "llama_cpp"
        assert body["status"] in ("ready", "not_ready", "loading")
        with client.websocket_connect("/ws/llm") as ws:
            ws.send_json(
                {
                    "type": "start",
                    "call_id": "test-call",
                    "conversation_role": "victim",
                    "system_prompt": "Ты заявитель.",
                }
            )
            ready = ws.receive_json()
            assert ready["type"] in ("ready", "error")
            if ready["type"] == "error":
                return
            ws.send_json({"type": "user_final", "id": "t1", "text": "Здравствуйте, у нас пожар."})
            partial = ws.receive_json()
            assert partial["type"] in ("assistant_partial", "assistant_final", "error")
            if partial["type"] == "error":
                return
            if partial["type"] == "assistant_partial":
                final = ws.receive_json()
                assert final["type"] == "assistant_final"
                assert final["text"]
            ws.send_json({"type": "user_final", "id": "t2", "text": "Улица Малышева, 51."})
            ws.receive_json()
            second = ws.receive_json()
            assert second["type"] in ("assistant_final", "assistant_partial", "error")
            ws.send_json({"type": "stop"})
            closed = ws.receive_json()
            assert closed["type"] == "session_closed"


def test_transcript_skips_kickoff_and_analysis_is_separate():
    from sys112_llm.conversation import (
        ANALYSIS_PROMPT,
        KICKOFF_ID,
        KICKOFF_TEXT,
        ConversationManager,
        analysis_messages,
        format_transcript,
    )

    manager = ConversationManager()
    session = manager.create("call-d", "victim")
    manager.accept_user("call-d", KICKOFF_TEXT, KICKOFF_ID)
    manager.append_assistant("call-d", "Помогите, у нас пожар.")
    manager.accept_user("call-d", "Назовите адрес.", "m2")
    text = format_transcript(session)
    assert KICKOFF_TEXT not in text
    assert "Заявитель: Помогите, у нас пожар." in text
    assert "Оператор: Назовите адрес." in text
    messages = analysis_messages(session)
    assert messages[0]["content"] == ANALYSIS_PROMPT
    assert "Помогите, у нас пожар." in messages[1]["content"]
    assert KICKOFF_TEXT not in messages[1]["content"]


def test_kickoff_analyze_and_intervention_mock():
    from fastapi.testclient import TestClient
    from sys112_llm.app import app

    with TestClient(app) as client:
        with client.websocket_connect("/ws/llm") as ws:
            ws.send_json({"type": "start", "call_id": "kick", "conversation_role": "victim"})
            ready = ws.receive_json()
            assert ready["type"] in ("ready", "error")
            if ready["type"] == "error":
                return
            ws.send_json({"type": "kickoff"})
            first = ws.receive_json()
            assert first["type"] in ("assistant_partial", "assistant_final", "error")
            if first["type"] == "error":
                return
            if first["type"] == "assistant_partial":
                assert ws.receive_json()["type"] == "assistant_final"
            ws.send_json({"type": "analyze", "id": "last", "text": "Где это происходит?"})
            analysis = ws.receive_json()
            assert analysis["type"] in ("analysis_partial", "analysis_final", "error")
            if analysis["type"] == "analysis_partial":
                final = ws.receive_json()
                assert final["type"] == "analysis_final"
                assert final["text"]
            ws.send_json({"type": "intervention", "command": "set_emotional_state"})
            ack = ws.receive_json()
            assert ack["type"] == "intervention_ack"
            assert ack["accepted"] is False
            assert ack["code"] == "not_implemented"
            ws.send_json({"type": "stop"})
            assert ws.receive_json()["type"] == "session_closed"


def test_not_ready_and_missing_model():
    from fastapi.testclient import TestClient
    from sys112_llm import app as appmod

    previous = appmod.llm_status
    appmod.llm_status = "not_ready"
    try:
        with TestClient(appmod.app) as client:
            body = client.get("/api/llm/health").json()
            assert body["status"] in ("ready", "not_ready", "loading")
            assert "model_present" in body
            with client.websocket_connect("/ws/llm") as ws:
                appmod.llm_status = "not_ready"
                ws.send_json({"type": "start", "call_id": "down", "conversation_role": "operator"})
                event = ws.receive_json()
                assert event["type"] in ("error", "ready")
                if event["type"] == "error":
                    assert event.get("code") in ("llm_not_ready", "llm_loading")
    finally:
        appmod.llm_status = previous
