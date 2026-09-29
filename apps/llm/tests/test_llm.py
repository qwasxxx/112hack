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
    assert "Менять роль на оператора" in payload[0]["content"]
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
    assert len(user_assistant) == 16
    assert user_assistant[0]["content"] == "Реплика 2."
    assert user_assistant[-1]["content"] == "Ответ 9."


def test_opening_stays_when_recent_turns_are_trimmed():
    from sys112_llm.conversation import generation_messages

    manager = ConversationManager()
    manager.create("long-open", "victim", "Билет 1", "Алло, здесь пожар!")
    for index in range(12):
        manager.accept_user("long-open", f"Вопрос {index}.", f"u{index}")
        manager.append_assistant("long-open", f"Ответ {index}.")
    payload = generation_messages(manager.get("long-open"))
    spoken = [item for item in payload if item["role"] != "system"]
    assert spoken[0]["content"] == "Алло, здесь пожар!"
    assert spoken[1]["content"] == "Вопрос 4."
    assert spoken[-1]["content"] == "Ответ 11."
    assert len(spoken) == 17


def test_conversation_stop_does_not_cut_paragraphs():
    from sys112_llm.client import ANALYSIS_STOP, CONVERSATION_STOP

    assert "\n\n" not in CONVERSATION_STOP
    assert "Оператор:" in CONVERSATION_STOP
    assert "\n\n" in ANALYSIS_STOP


def test_remembered_reply_keeps_heard_text_and_correction():
    from sys112_llm.conversation import presence_cue, remembered_reply

    heard = "Мы стоим около большого дома на Тверской."
    fixed = "Мы стоим около большого дома на Волжском бульваре."
    assert remembered_reply(heard, fixed) == fixed
    assert remembered_reply(heard, heard + " Дым виден.") == heard + " Дым виден."
    session = ConversationManager().create("presence", "victim", opening="Алло, здесь пожар!")
    before = len(session.messages)
    cue = presence_cue("hear", "victim")
    assert len(session.messages) == before
    assert "слышит" in cue
    assert not any(item.role == "user" and "слышит" in item.content for item in session.messages)


def test_presence_spoken_replaces_a_missed_probe():
    from sys112_llm.conversation import presence_spoken

    retold = "Хорошо, горит мусорный контейнер, пострадавших нет."
    assert presence_spoken("hear", retold) == "Вы меня слышите?"
    assert presence_spoken("hear", "Вы меня слышите?") == "Вы меня слышите?"
    assert presence_spoken("farewell", "Хорошо, спасибо, что сообщили.") == "До свидания."
    assert presence_spoken("farewell", "До свидания.") == "До свидания."
    assert presence_spoken("wait", "Я на линии, жду.") == "Я на линии, жду."
    assert "через сколько" in presence_spoken("eta", "Скажите, примерно через сколько приедут?")
    assert presence_spoken("urgent", "") == "Алло, вы меня слышите?"
    assert "скажите" not in presence_spoken(
        "urgent",
        "Скажите, пожалуйста, вы сейчас находитесь по адресу Москва, Депо?",
    ).lower()


def test_unnamed_caller_does_not_keep_the_victim_name():
    from sys112_llm.conversation import repair_victim_reply

    extra = "\n".join(
        [
            "КТО ЗВОНИТ: в билете прямо не сказано, кто говорит",
            "ПОСТРАДАВШИЙ (это не ты): Иванова Елена Сергеевна",
            "ПОСТРАДАВШИЕ: число не указано. Не говори «ноль».",
        ]
    )
    spoken = repair_victim_reply(
        "Водитель заблокирован, меня зовут Иванова Елена Сергеевна.",
        "Кто заблокирован?",
        "victim",
        extra,
    )
    assert "зовут" not in spoken.lower()
    assert "заблокирован" in spoken.lower()
    denied = repair_victim_reply(
        "Пострадавших нет.",
        "Есть пострадавшие?",
        "victim",
        extra,
    )
    assert "нет" not in denied.lower()
    assert "не знаю" in denied.lower()
    explicit = "ПОСТРАДАВШИЕ: в билете прямо сказано, что пострадавших нет."
    kept = repair_victim_reply("Пострадавших нет.", "Есть раненые?", "victim", explicit)
    assert kept == "Пострадавших нет."
    medical = "\n".join(
        [
            "ВРЕМЯ: в билете не названо.",
            "СЕЙЧАС ВАЖНО: Потеря сознания",
            "СОСТОЯНИЕ: Потеря сознания. «Без сознания» не значит «не дышит», пока дыхание отдельно не написано.",
        ]
    )
    timed = repair_victim_reply(
        "Мне сорок лет. Это началось прямо сейчас.",
        "Когда это началось?",
        "victim",
        medical,
    )
    assert "сорок" in timed.lower()
    assert "прямо сейчас" not in timed.lower()
    breath = repair_victim_reply("Я потеряла сознание. Я дышу.", "Что случилось?", "victim", medical)
    assert "дышу" not in breath.lower()
    assert "не знаю" in breath.lower()


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
        from sys112_llm.config import LLM_MODEL_NAME, LLM_RUNTIME

        assert body["model"] == LLM_MODEL_NAME
        assert body["runtime"] == LLM_RUNTIME
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


def test_apply_teacher_intervention_keeps_ticket_facts():
    from sys112_llm.conversation import (
        ConversationManager,
        apply_teacher_intervention,
        session_scenario_extra,
    )

    manager = ConversationManager()
    session = manager.create("cue-1", "victim", "Вызывает мама. Мальчик упал с велосипеда.")
    detail = apply_teacher_intervention(session, "set_emotional_state", "паника")
    extra = session_scenario_extra(session)
    assert "паника" in detail
    assert "УКАЗАНИЕ ПРЕПОДАВАТЕЛЯ [set_emotional_state]" in extra
    assert "Вызывает мама" in extra
    from sys112_llm.conversation import TEACHER_NUDGE_TEXT, repair_victim_reply

    ticket = "ЧТО СЛУЧИЛОСЬ: Горит контейнер. Пострадавших нет."
    session2 = manager.create("cue-2", "victim", ticket)
    apply_teacher_intervention(session2, "add_circumstance", "Появился пострадавший, лежит без сознания")
    forced = repair_victim_reply(
        "Пострадавших нет, горит контейнер.",
        TEACHER_NUDGE_TEXT,
        "victim",
        session_scenario_extra(session2),
    )
    assert "пострадавший" in forced.lower()
    kept = repair_victim_reply(
        "Тут человек лежит без сознания.",
        "что случилось?",
        "victim",
        session_scenario_extra(session2),
    )
    assert "сознан" in kept.lower()
    assert "контейнер" not in kept.lower()


def test_repair_topic_shift_lighting_not_apartment_fire():
    from sys112_llm.conversation import repair_victim_reply

    extra = (
        "ЧТО СЛУЧИЛОСЬ: Горит уличное освещение на МКАД — фонари светят. Это не пожар и не квартира.\n"
        "ЗАПРЕЩЕНО: Это НЕ пожар и НЕ квартира."
    )
    reply = repair_victim_reply("Пожар в квартире, на пятом этаже.", "что случилось?", "victim", extra)
    assert "освещен" in reply.lower()
    assert "квартир" not in reply.lower()


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
            ws.send_json({"type": "intervention", "command": "set_emotional_state", "note": "паника"})
            ack = ws.receive_json()
            assert ack["type"] == "intervention_ack"
            assert ack["accepted"] is True
            ws.send_json({"type": "stop"})
            closed = None
            for _ in range(8):
                event = ws.receive_json()
                if event["type"] == "session_closed":
                    closed = event
                    break
            assert closed and closed["type"] == "session_closed"


def test_not_ready_and_missing_model():
    from fastapi.testclient import TestClient
    from sys112_llm import app as appmod

    previous = appmod.llm_status
    appmod.llm_status = "not_ready"
    try:
        with TestClient(appmod.app) as client:
            body = client.get("/api/llm/health").json()
            assert body["status"] in ("ready", "not_ready", "loading")
            assert body["local"] is False
            with client.websocket_connect("/ws/llm") as ws:
                appmod.llm_status = "not_ready"
                ws.send_json({"type": "start", "call_id": "down", "conversation_role": "operator"})
                event = ws.receive_json()
                assert event["type"] in ("error", "ready")
                if event["type"] == "error":
                    assert event.get("code") in ("llm_not_ready", "llm_loading")
    finally:
        appmod.llm_status = previous


def test_repair_victim_does_not_play_blind_on_dispatch():
    from sys112_llm.conversation import repair_victim_reply

    ack = repair_victim_reply(
        "не слышу, не вижу.",
        "хорошо я вас услышал направляю на вас в службы",
        "victim",
    )
    assert "не слышу" not in ack.lower()
    assert "не вижу" not in ack.lower()
    varied = repair_victim_reply(
        "У нас на кухне уже горит, скорее.",
        "что случилось?",
        "victim",
        "ЧТО СЛУЧИЛОСЬ: Пожар на кухне.",
    )
    assert varied == "У нас на кухне уже горит, скорее."
    leaked = repair_victim_reply(
        "Я не могу выполнить этот запрос. Я — языковая модель, у меня нет физического тела.",
        "что случилось?",
        "victim",
        "ЧТО СЛУЧИЛОСЬ: Горит контейнер у дома.",
    )
    assert "языков" not in leaked.lower()
    assert "запрос" not in leaked.lower()
    assert "контейнер" in leaked.lower()
    hello = repair_victim_reply(
        "Алло, да, я слышу. Я Сидоров Иван Сергеевич, звоню с телефона 9161263471. Здесь загорелся контейнер. Пострадавших нет.",
        "Алло.",
        "victim",
        "ЧТО СЛУЧИЛОСЬ: Горит мусорный контейнер.",
    )
    assert hello == "Алло, да, слышу."
    assert "Сидоров" not in hello
    lecture = repair_victim_reply(
        "Извините, я не могу продолжать этот разговор в таком тоне. Я здесь, чтобы помочь вам конструктивно.",
        "алло",
        "victim",
    )
    assert "конструктив" not in lecture.lower()
    assert "таком тоне" not in lecture.lower()
    explained = repair_victim_reply(
        "Прощание — это не прощание с кем-то, а завершение разговора или действия. Вы можете сказать «пока».",
        "алло",
        "victim",
    )
    assert "завершение разговора" not in explained.lower()
    assert "вы можете сказать" not in explained.lower()
    trapped = repair_victim_reply("Я не могу двигаться, нога зажата.", "что с вами?", "victim")
    assert trapped.startswith("Я не могу двигаться")
    assert repair_victim_reply("Не знаю.", "Какой этаж?", "victim") == "Не знаю."
    assert repair_victim_reply("Горит контейнер у дома.", "Что случилось?", "victim") == "Горит контейнер у дома."
    # В билете времени нет: обрывок «получика» не становится выдуманным «Только что».
    assert repair_victim_reply("Около получика.", "как давно произошло", "victim") == "Не знаю."
    assert (
        repair_victim_reply(
            "Меня зовут Света.",
            "Как вас зовут?",
            "victim",
            "КТО ЗВОНИТ: мама. Имени заявителя нет — не выдумывай",
        )
        == "Я мама."
    )
    assert (
        repair_victim_reply(
            "Да, я мама, у меня нет имени, которое я могу назвать.",
            "в смысле, мама?",
            "victim",
            "КТО ЗВОНИТ: мама. Имени заявителя нет — не выдумывай",
        )
        == "Я мама."
    )
    assert (
        repair_victim_reply(
            "Я Смирнов Илья.",
            "Как я могу к вам обращаться?",
            "victim",
            "ФАКТЫ БИЛЕТА ЦЕЛИКОМ: Ребенок 11 лет, Смирнов Илья упал с велосипеда, вызывает мама\n"
            "КТО ЗВОНИТ: мама. Имени заявителя нет. Ты женщина.",
        )
        == "Я мама."
    )
    assert (
        repair_victim_reply(
            "У меня нет имени, которое я могу назвать.",
            "как вас зовут?",
            "victim",
            "КТО ЗВОНИТ: Иванов Иван Иванович",
        )
        == "Я Иванов Иван Иванович."
    )
    assert (
        repair_victim_reply(
            "Я мама.",
            "Кто вы?",
            "victim",
            "КТО ЗВОНИТ: Сидоров Иван Сергеевич\nНе говори, что ты мама и что имени нет.",
        )
        == "Я Сидоров Иван Сергеевич."
    )
    assert (
        repair_victim_reply(
            "Я мама.",
            "Вы кто?",
            "victim",
            "КТО ЗВОНИТ: Сидоров Иван Сергеевич",
        )
        == "Я Сидоров Иван Сергеевич."
    )
    extra_addr = (
        "АДРЕС (назови, только если спросили): Волгоградская область, город Волжский, "
        "улица Карла Маркса около Волжского Молсыркомбината"
    )
    spoken = repair_victim_reply(
        "Находится в Волжском, Волгоградская область.",
        "скажите точный адрес",
        "victim",
        extra_addr,
    )
    assert "Волжск" in spoken
    assert spoken != "Не знаю."
    assert (
        repair_victim_reply("Не знаю.", "скажите точный адрес", "victim", extra_addr)
        != "Не знаю."
    )
    assert "Волжск" in repair_victim_reply("Не знаю.", "скажите точный адрес", "victim", extra_addr)
    moscow = repair_victim_reply("Москва, Тверская улица дом пять.", "какой адрес?", "victim", extra_addr)
    assert "Волжск" in moscow
    assert "Тверск" not in moscow
    assert repair_victim_reply("Волжский какой-то.", "какой адрес?", "victim") == "Не знаю."


def test_repair_keeps_natural_scenario_replies():
    """Входы — проверяемые реплики, не записанный вывод модели."""
    import re

    from sys112_llm.conversation import breaks_character, leaves_role, repair_victim_reply

    fire = (
        "ЧТО СЛУЧИЛОСЬ: Возгорание мусорного контейнера, пострадавших нет\n"
        "АДРЕС (назови, только если спросили): Москва, Депо, около станции Москва-Пассажирская Киевская\n"
        "КТО ЗВОНИТ: Сидоров Иван Сергеевич\n"
        "ТЕЛЕФОН (назови, только если спросили): 9161263471"
    )
    beam = (
        "ЧТО СЛУЧИЛОСЬ: На машину упало бревно с грузовика. В машине Ваз красный, водитель заблокирован\n"
        "АДРЕС (назови, только если спросили): Съезд с МКАД внутрь на Симферопольское шоссе, обочина\n"
        "КТО ЗВОНИТ: Иванова Елена Сергеевна\n"
        "ТЕЛЕФОН (назови, только если спросили): 9168963254"
    )
    medical = (
        "ЧТО СЛУЧИЛОСЬ: Плохо женщине на автомобильной парковке. Потеря сознания\n"
        "АДРЕС (назови, только если спросили): Московская область, Балашиха, Мирской проезд, дом 16"
    )
    police = "ЧТО СЛУЧИЛОСЬ: Дерутся 3 человека, без пострадавших, без оружия, очевидец"
    gas = "ЧТО СЛУЧИЛОСЬ: В частном доме запах газа от трубы на вводе в дом, слышит шум в трубе"
    traffic = "ЧТО СЛУЧИЛОСЬ: ДТП, пежо и фольксваген, без пострадавших"
    lighting = (
        "ЧТО СЛУЧИЛОСЬ: На МКАД горит уличное освещение от Ленинградского шоссе до Волоколамского. "
        "Это не пожар и не квартира.\n"
        "КТО ЗВОНИТ: Зотова Алина Петровна"
    )

    narrative = (
        "Мусорный контейнер у депо загорелся, это рядом с киевским вокзалом. "
        "Дым уже сильный, пламя идет по контейнеру, люди отошли в сторону. "
        "Пострадавших нет, сами тушить не стали, приезжайте скорее пожалуйста."
    )
    assert narrative.count(".") >= 3
    assert len(narrative) > 180
    assert leaves_role(narrative) is False
    assert repair_victim_reply(narrative, "Что случилось?", "victim", fire) == narrative

    trapped = "Человек зажат, помогите скорее."
    assert repair_victim_reply(trapped, "Что случилось?", "victim", beam) == trapped

    both = (
        "Человека в красной машине прижало бревном. "
        "Мы на обочине, съезд на Симферопольское шоссе."
    )
    kept_both = repair_victim_reply(both, "Что случилось и где это?", "victim", beam)
    assert kept_both == both
    assert "бревн" in kept_both.lower()
    assert "Симферополь" in kept_both

    fainted = "Ей дурно, она отключилась у стоянки."
    assert repair_victim_reply(fainted, "Что случилось?", "victim", medical) == fainted
    assert repair_victim_reply(
        "Там трое машут руками за домом, оружия я не вижу.",
        "Что случилось?",
        "victim",
        police,
    ).startswith("Там трое")
    assert repair_victim_reply(
        "Воняет газом у ввода в дом, труба шумит.",
        "Что случилось?",
        "victim",
        gas,
    ).startswith("Воняет")
    assert repair_victim_reply(
        "Пежо стукнулся с фольксвагеном, люди целы.",
        "Что случилось?",
        "victim",
        traffic,
    ).startswith("Пежо")

    named = "Меня зовут Сидорову Ивану Сергеевичу."
    assert repair_victim_reply(named, "Как вас зовут?", "victim", fire) == named
    spoken_phone = "Номер девятьсот шестнадцать, сто двадцать шесть, тридцать четыре, семьдесят один."
    assert repair_victim_reply(spoken_phone, "Какой телефон?", "victim", fire) == spoken_phone
    spaced_phone = "Мой номер девять один шесть, 916 126 34 71."
    assert repair_victim_reply(spaced_phone, "Какой телефон?", "victim", fire) == spaced_phone

    mama = "Я мама ребёнка, мальчик упал с велосипеда."
    assert (
        repair_victim_reply(
            mama,
            "Кто вы?",
            "victim",
            "КТО ЗВОНИТ: мама. Имени заявителя нет",
        )
        == mama
    )

    wrong_name = repair_victim_reply(
        "Меня зовут Петров, контейнер горит.",
        "Как вас зовут?",
        "victim",
        fire,
    )
    assert "Петров" not in wrong_name
    assert "Сидоров" in wrong_name
    assert "контейнер" in wrong_name.lower()

    wrong_phone = repair_victim_reply(
        "Контейнер горит, звоните на 900 111 22 33.",
        "Что случилось?",
        "victim",
        fire,
    )
    assert "900" not in wrong_phone
    assert "9161263471" in wrong_phone
    assert "контейнер" in wrong_phone.lower()

    moscow = repair_victim_reply(
        "Бревно упало на машину. Мы в Москве, на Тверской улице.",
        "Что случилось и какой адрес?",
        "victim",
        beam,
    )
    assert "бревн" in moscow.lower()
    assert "Тверск" not in moscow
    assert "Симферополь" in moscow

    assert repair_victim_reply("Не знаю.", "На каком этаже?", "victim", fire) == "Не знаю."
    assert repair_victim_reply("Не знаю.", "Сколько пострадавших?", "victim", fire) == "Не знаю."
    assert repair_victim_reply("Не помню.", "Как давно это произошло?", "victim", fire) == "Не помню."
    theft = "ЧТО СЛУЧИЛОСЬ: Угон машины, видели в последний раз вчера вечером, тойота синяя"
    seen = "Вчера вечером видели, как уехала."
    assert repair_victim_reply(seen, "Как давно это было?", "victim", theft) == seen
    assert repair_victim_reply("Полчаса назад.", "Как давно это произошло?", "victim", fire) == "Не знаю."
    timed = repair_victim_reply(
        "Мусорный контейнер горит. Это было полчаса назад.",
        "Как давно это произошло?",
        "victim",
        fire,
    )
    assert timed == "Мусорный контейнер горит."
    assert "Только что" not in timed
    assert repair_victim_reply(
        "Не знаю.",
        "Что случилось и где вы находитесь?",
        "victim",
        fire,
    ) == "Не знаю."

    no_fire = "Нет, пожара нет. Фонари на МКАД горят."
    assert repair_victim_reply(no_fire, "Это пожар?", "victim", lighting) == no_fire
    denied = repair_victim_reply(
        "Квартиры нет, горит контейнер на улице.",
        "Что случилось?",
        "victim",
        fire,
    )
    assert denied == "Квартиры нет, горит контейнер на улице."

    service = (
        "Адрес и суть принял. Назовите, есть ли пострадавшие. "
        "Уточните этаж и подъезд, если люди остаются внутри дома. "
        "Если вызов не наш, сразу скажите, заявку передадим профильной службе дальше."
    )
    assert len(service) > 180
    assert service.count(".") >= 3
    assert leaves_role(service) is False
    assert breaks_character(service) is False
    assert repair_victim_reply(service, "Пожар на крыше частного дома.", "service", fire) == service
    assert repair_victim_reply(service, "Пожар на крыше частного дома.", "operator", fire) == service

    lecture = "Извините, я не могу продолжать этот разговор в таком тоне."
    assert leaves_role(lecture) is True
    leaked = "Я языковая модель и не могу выполнить этот запрос."
    assert breaks_character(leaked) is True
    hidden = repair_victim_reply(leaked, "Что случилось?", "victim", fire)
    assert "языков" not in hidden.lower()
    assert "запрос" not in hidden.lower()

    def emitted_partials(full: str, operator: str, extra: str) -> list[str]:
        sent: list[str] = []
        last = ""
        for end in range(1, len(full) + 1):
            spoken = full[:end].strip()
            if not spoken or spoken == last or breaks_character(spoken) or leaves_role(spoken):
                continue
            if not re.search(r"[.!?…]$", spoken) and len(spoken) < 36:
                continue
            if repair_victim_reply(spoken, operator, "victim", extra) != spoken:
                continue
            sent.append(spoken)
            last = spoken
        return sent

    partials = emitted_partials(narrative, "Что случилось?", fire)
    assert partials
    assert all(narrative.startswith(part) for part in partials)
    assert repair_victim_reply(narrative, "Что случилось?", "victim", fire) == narrative

    wrong_city = "Москва, Тверская улица дом пять."
    volga = (
        "АДРЕС (назови, только если спросили): Волгоградская область, город Волжский, "
        "улица Карла Маркса около Волжского Молсыркомбината"
    )
    spoken_wrong = emitted_partials(wrong_city, "какой адрес?", volga)
    repaired_city = repair_victim_reply(wrong_city, "какой адрес?", "victim", volga)
    assert "Тверск" not in repaired_city
    assert "Волжск" in repaired_city
    assert all("Тверск" not in part for part in spoken_wrong)
    assert all(repaired_city.startswith(part) for part in spoken_wrong)


def test_parse_ticket_json_strips_think():
    from sys112_llm.ticket_gen import parse_ticket_json

    raw = (
        '<think>план</think>{"situation":"Горит контейнер, пострадавших нет, 916-126-34-71",'
        '"address":"Москва, ул. Грина, дом 11","opening":"Горит мусор","services":["fire"],'
        '"phone":"9161263471"}'
    )
    parsed = parse_ticket_json(raw, ["ambulance"])
    assert parsed["services"] == ["fire"]
    assert "контейнер" in parsed["situation"]
    assert parsed["phone"] == "9161263471"


def test_generate_ticket_mock_endpoint(monkeypatch):
    from fastapi.testclient import TestClient
    import sys112_llm.app as appmod

    monkeypatch.setattr(appmod, "LLM_MODE", "mock")
    monkeypatch.setattr(appmod, "llm_status", "mock")
    with TestClient(appmod.app) as client:
        body = client.post("/api/llm/generate-ticket", json={"services": ["fire"], "note": "без пострадавших"}).json()
        assert body["ok"] is True, body
        assert body["source"] == "mock"
        assert body["address"]
        assert "fire" in body["services"]
        assert body["situation"]


def test_generate_ticket_keeps_filled_draft(monkeypatch):
    from fastapi.testclient import TestClient
    import sys112_llm.app as appmod
    from sys112_llm.ticket_gen import build_messages, mock_ticket

    monkeypatch.setattr(appmod, "LLM_MODE", "mock")
    monkeypatch.setattr(appmod, "llm_status", "mock")
    draft = {
        "title": "ДТП на МКАД, звонит свидетель",
        "address": "Москва, МКАД, 47 километр, внешняя сторона",
    }
    with TestClient(appmod.app) as client:
        body = client.post(
            "/api/llm/generate-ticket",
            json={"services": ["police"], **draft},
        ).json()
    assert body["ok"] is True, body
    assert body["address"] == draft["address"]
    assert "ДТП на МКАД" in body["situation"]
    ticket = mock_ticket(["police"], "", draft)
    assert ticket["address"] == draft["address"]
    prompt = build_messages(["police"], "", draft)[1]["content"]
    assert "Название билета" in prompt
    assert "ДТП на МКАД" in prompt


def test_generate_ticket_fight_in_forest_stays_on_topic(monkeypatch):
    from fastapi.testclient import TestClient
    import sys112_llm.app as appmod
    from sys112_llm.ticket_gen import synthesize_from_draft, ticket_matches_draft

    monkeypatch.setattr(appmod, "LLM_MODE", "mock")
    monkeypatch.setattr(appmod, "llm_status", "mock")
    with TestClient(appmod.app) as client:
        body = client.post(
            "/api/llm/generate-ticket",
            json={"services": ["police"], "title": "Драка в лесу"},
        ).json()
    assert body["ok"] is True, body
    blob = f"{body['situation']} {body['opening']}".lower()
    assert "драка" in blob or "дерут" in blob
    assert "лес" in blob
    assert "водитель" not in blob
    assert "варшавск" not in blob
    assert body["services"] == ["police"]
    garbage = {
        "situation": "Водитель потерял связь с водителем, автомобиль на дороге",
        "address": "Москва, пр. Варшавский, д. 12",
        "opening": "Потерял связь",
        "services": ["police"],
        "caller": "водитель",
        "phone": "9161234567",
        "source": "local",
    }
    assert not ticket_matches_draft(garbage, {"title": "Драка в лесу"})
    fixed = synthesize_from_draft(["police"], "", {"title": "Драка в лесу"})
    assert "драка" in fixed["situation"].lower()
    assert "лес" in f"{fixed['situation']} {fixed['address']} {fixed['opening']}".lower()


def test_generate_ticket_title_overrides_default_police(monkeypatch):
    from fastapi.testclient import TestClient
    import sys112_llm.app as appmod
    from sys112_llm.ticket_gen import align_ticket_to_title, infer_services_from_text, resolve_services

    monkeypatch.setattr(appmod, "LLM_MODE", "mock")
    monkeypatch.setattr(appmod, "llm_status", "mock")
    assert infer_services_from_text("Пожар в лесу") == ["fire"]
    assert resolve_services(["police"], {"title": "Пожар в лесу"}, "") == ["fire"]
    with TestClient(appmod.app) as client:
        body = client.post(
            "/api/llm/generate-ticket",
            json={"services": ["police"], "title": "Пожар в лесу"},
        ).json()
    assert body["ok"] is True, body
    assert body["services"] == ["fire"]
    assert "пожар" in body["situation"].lower()
    assert "дтп" not in body["situation"].lower()
    assert "инспектор" not in body["situation"].lower()
    repaired = align_ticket_to_title(
        {
            "situation": "Полицейский инспектор выявил на дороге автомобиль",
            "address": "Москва, ул. Смольная, дом 15",
            "opening": "Нарушение скорости",
            "services": ["police"],
            "caller": "инспектор",
            "phone": "9161234567",
            "source": "local",
        },
        {"title": "Пожар в лесу"},
        ["fire"],
        "",
    )
    assert repaired["services"] == ["fire"]
    assert "пожар" in repaired["situation"].lower()


def test_generate_ticket_fell_from_window_not_fire(monkeypatch):
    from fastapi.testclient import TestClient
    import sys112_llm.app as appmod
    from sys112_llm.ticket_gen import infer_services_from_text, synthesize_from_draft, ticket_matches_draft

    monkeypatch.setattr(appmod, "LLM_MODE", "mock")
    monkeypatch.setattr(appmod, "llm_status", "mock")
    assert infer_services_from_text("Мужчина выпал из окна") == ["ambulance"]
    with TestClient(appmod.app) as client:
        body = client.post(
            "/api/llm/generate-ticket",
            json={"services": ["fire"], "title": "Мужчина выпал из окна"},
        ).json()
    assert body["ok"] is True, body
    blob = f"{body['situation']} {body['opening']}".lower()
    assert "выпал" in blob or "окн" in blob
    assert "горен" not in blob
    assert "дым" not in blob
    assert "тушить" not in blob
    assert body["services"] == ["ambulance"]
    garbage = {
        "situation": "Мужчина выпал из окна. открытое горение и густой дым, тушить нечем.",
        "address": "Москва, ул. Грина, дом 11",
        "opening": "Мужчина выпал из окна",
        "services": ["fire"],
        "caller": "Сидорова",
        "phone": "9168975623",
        "source": "local",
    }
    assert not ticket_matches_draft(garbage, {"title": "Мужчина выпал из окна"})
    fixed = synthesize_from_draft(["fire"], "", {"title": "Мужчина выпал из окна"})
    assert fixed["services"] == ["ambulance"]
    assert "горен" not in fixed["situation"].lower()
    assert "дым" not in fixed["situation"].lower()
    assert "выпал" in fixed["situation"].lower() or "окн" in fixed["situation"].lower()


def test_generate_ticket_repairs_offtopic_with_model():
    import asyncio
    from sys112_llm.ticket_gen import generate_ticket

    class FakeClient:
        def __init__(self) -> None:
            self.n = 0

        async def complete_chat(self, messages, **_kwargs):
            self.n += 1
            if self.n == 1:
                return (
                    '{"situation":"открытое горение и густой дым, тушить нечем",'
                    '"address":"Москва, ул. Грина, дом 11","opening":"Горит всё",'
                    '"services":["fire"],"caller":"Иванов","phone":"9161112233"}'
                )
            return (
                '{"situation":"Мужчина выпал из окна, лежит во дворе, дышит. '
                'Звонит Петрова Анна, 916-320-11-22. Служб нет.",'
                '"address":"Москва, ул. Народного Ополчения, дом 22",'
                '"opening":"Мужчина выпал из окна, нужна скорая",'
                '"services":["ambulance"],"caller":"Петрова Анна","phone":"9163201122"}'
            )

    fake = FakeClient()
    out = asyncio.run(
        generate_ticket(
            fake,  # type: ignore[arg-type]
            services=["fire"],
            note="",
            mock=False,
            ready=True,
            draft={"title": "Мужчина выпал из окна"},
        )
    )
    assert fake.n == 2
    blob = f"{out['situation']} {out['opening']}".lower()
    assert "выпал" in blob
    assert "горен" not in blob
    assert "тушить" not in blob
    assert out["services"] == ["ambulance"]
    assert out["source"] == "local"


def test_locked_prompts_allow_natural_caller_speech():
    from sys112_llm.conversation import (
        SERVICE_SYSTEM_PROMPT,
        VICTIM_SYSTEM_PROMPT,
        build_system_prompt,
    )

    victim = VICTIM_SYSTEM_PROMPT
    assert "1–2" not in victim
    assert "Только что" not in victim
    assert "Я + фамил" not in victim
    assert "КТО ЗВОНИТ" in victim
    assert "Вы меня слышите?" in victim
    assert "обратный звонок" in victim
    service = SERVICE_SYSTEM_PROMPT
    assert "наряд выезжает" not in service.lower()
    assert "спроси" in service.lower()
    extra = "\n".join(
        [
            "Билет 1, ситуация 1",
            "ЧТО СЛУЧИЛОСЬ: Горит мусорный контейнер, пострадавших нет.",
            "АДРЕС (назови, только если спросили): Волжский бульвар",
            "КТО ЗВОНИТ: Сидоров Иван Петрович",
            "ТЕЛЕФОН (назови, только если спросили): 9161263471",
            "Уже сказано вслух: «Алло, горит мусорный контейнер!».",
        ]
    )
    combined = build_system_prompt("victim", extra)
    assert combined.startswith(victim.strip()[:40])
    assert "Контекст сценария:" in combined
    assert "Сидоров Иван Петрович" in combined
    assert "Алло, горит мусорный контейнер!" in combined
    assert "Билет 3, ситуация 3" not in combined


def test_service_asks_address_then_names_one_crew():
    from sys112_llm.conversation import repair_chief_reply, repair_service_reply

    extra = "АДРЕС В КАРТОЧКЕ: деревня Барыкино\nНОМЕР НАРЯДА: 23. Это единственный номер."
    assert repair_service_reply("Заявку принял. Наряд 23.", "направьте наряд", extra) == "Куда направлять наряд? Назовите адрес."
    assert repair_service_reply("Заявку принял.", "пожар в Барыкино", extra) == "Направить наряд?"
    assert repair_service_reply("Выезжаем.", "направьте наряд в Барыкино", extra) == "Заявку принял. Наряд 23."
    assert repair_service_reply("Заявку принял. Наряд 23.", "направьте наряд в Барыкино", extra) == "Заявку принял. Наряд 23."
    assert repair_chief_reply("Принял.", "пожар в Барыкино, дом 11", extra) == "Какой номер наряда?"
    assert repair_chief_reply("Хорошо.", "наряд 23, пожар в Барыкино", extra) == "Принял."
    assert repair_chief_reply("Принял.", "Оператор снял трубку.", extra) == "Докладывайте."


def test_teacher_nudge_not_in_transcript():
    from sys112_llm.conversation import (
        ConversationManager,
        TEACHER_NUDGE_TEXT,
        format_transcript,
        should_speak_intervention,
    )

    manager = ConversationManager()
    session = manager.create("cue-2", "victim", "Вызывает мама.")
    manager.accept_user("cue-2", TEACHER_NUDGE_TEXT, "nudge-1")
    text = format_transcript(session)
    assert TEACHER_NUDGE_TEXT not in text
    assert should_speak_intervention("inject_event")
    assert should_speak_intervention("force_state")
    assert not should_speak_intervention("end_call")

