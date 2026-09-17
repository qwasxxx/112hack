# ARM-112 source map (final)

Kaynaklarda görünen АРМ-112 / ДДС öğeleri. Uydurma alan yok. Kaynakta yoksa `not evidenced` ve gerekçe yazılır.

**STATUS:** `ok` | `partial` | `missing` | `n/a`

**THEORY / TRAINING / DDS:** `guided` | `interactive` | `view` | `adapter` | `—`

Classifier source-of-truth: `Классификатор_происшествий_v_046_11_ДТУ_15_11_2024_искл_пожар_задымление.xlsx` / `Лист1`. Runtime: `apps/student-web/src/features/arm112-simulator/data/classifier-runtime.json`.

Canonical UI: `apps/student-web/src/features/arm112-simulator/` (Theory = guided, Training = interactive). DDS view-model: `features/dds-training/` → `IncidentCard` / `ServiceAssignment` / classifier adapter.

## Okunan kaynaklar

| SOURCE | Tür | Origin |
| --- | --- | --- |
| `9. Деп Обороны и ЧС.pdf` | case / teknik şartname | case pack |
| `Инструкция_по_заведению_карточки_2507ГСИ.docx` | talimat + 114 görsel | zip |
| `СКРИНШОТ КАРТОЧКИ 112ГСИ.docx` | 9 PNG, 17.09.2026 | zip |
| `СКРИНШОТ ДДСГСИ.docx` | 20 PNG + caption | zip |
| `Классификатор_происшествий_v_046_…xlsx` | Лист1, 1308 satır | zip |
| `РТУ Т16Р_Datasheet_ 2024_ГСИ.pdf` | IP-telefon | zip |

Pakette yok (şartname atıf): «Работа на АРМ-112. Памятка…», билеты и задачи.

---

## SOURCE → SCREEN → FIELD/ACTION → THEORY → TRAINING → DDS → STATUS

### Login

| SOURCE | SCREEN | FIELD/ACTION | THEORY | TRAINING | DDS | STATUS |
| --- | --- | --- | --- | --- | --- | --- |
| card-manual §1 Рис.1 | Вход 112 | URL / логин / пароль / номер АРМ / ВОЙТИ | — | — | — | missing — canlı kontur URL’si kopyalanmaz; öğrenci trainer login kullanır |
| dds image1 | Вход ДДС | логин / пароль / ВОЙТИ (номер АРМ yok) | — | — | — | missing — aynı gerekçe; DDS eğitim journal’dan başlar |
| dds image1 | Вход ДДС | Техподдержка +7 (495) 197-89-81, hd-112@mos.ru | — | — | — | missing — DDS login ekranı yok |

### Journal / incoming

| SOURCE | SCREEN | FIELD/ACTION | THEORY | TRAINING | DDS | STATUS |
| --- | --- | --- | --- | --- | --- | --- |
| card-manual Рис.2 image2 | Журнал 112 | журнал / экран / УЕР / заявители / техника / аудит / отчеты | guided | interactive | — | partial — sekmeler görünür, iç ekranlar evidenceli değil |
| card-manual image2/106 | Журнал | настроить / справка / выйти | guided | interactive | view | ok |
| card-manual §2 | Журнал | telephony доступен/недоступен/не подключен/ошибка | guided | interactive | — | partial — click toggle; 10 sn auto-available yok (backend yok) |
| card-manual image106 | Журнал | создать новую карточку | guided | interactive | — | ok — Insert |
| card-manual image106 | Журнал | Поиск / сбросить / новый поиск / расширенный | guided | interactive | view | ok |
| card-manual image57/106 | Журнал tablo | Связи ЧС Опер. АРМ Номер Дата Время Что случилось Постр. Статус Адрес Проверена | guided | interactive | — | ok — örnek satırlar screenshot |
| dds image2/3 | Журнал ДДС | колонки Тип происшествия / Статус службы | — | — | view | ok |
| dds image3–5 | Журнал ДДС | 36814845 / 36814848 / 36814844 + Описание | — | — | interactive | ok |
| card-manual §3 Рис.3 | Overlay | Входящий звонок / с номера / Принять | guided | interactive | — | ok |
| ip-phone datasheet | SIP / Avaya | hat, hold, conference | — | — | — | missing — tarayıcıda SIP yok; header Отключение/АОН var |

### Карточка 112 (canonical ARM)

| SOURCE | SCREEN | FIELD/ACTION | THEORY | TRAINING | DDS | STATUS |
| --- | --- | --- | --- | --- | --- | --- |
| card-screens 2026 | create header | Отключение / записи звонков / список SMS | guided | interactive | view | partial — diyalog «записей не найдено» / «История сообщений» |
| card-screens | create | АОН + зарубежный номер + без SIM-карты | guided | interactive | view | ok |
| card-screens | create | предоставленный + АОН copy | guided | interactive | view | ok |
| card-screens | create | телефон на место + АОН copy | guided | interactive | view | ok |
| card-screens | create | Происшествие n / Созд. / Опер., АРМ | guided | interactive | view | ok |
| card-screens | create | таймер минут секунд | guided (donuk) | interactive | — | ok — eğitim eşiği 30 сек (case); canlı АРМ eşiği kaynakta yok |
| card-screens | create | Фамилия и имя заявителя | guided | interactive | view | ok |
| card-screens | create | выберите статус | guided | interactive | — | ok |
| card-screens | create | канал связи | guided | interactive | — | ok |
| card-manual | create | вызов на иностранном языке | guided | interactive | — | ok |
| card-manual | create | Данные абонента | guided | interactive | — | ok |
| card-screens | create | Адрес satırı + Страна/Субъект/НП/Объект/Округ/Район | guided | interactive | view | ok |
| card-screens | create | Улица Дом/Вл Корпус Стр Квартира Подъезд Этаж Код | guided | interactive | — | ok |
| card-screens | create | Описательный адрес / очистить адрес | guided | interactive | — | ok |
| card-manual карта | С112 - карта | Широта Долгота Радиус Слой | guided | interactive | — | partial — pencere var; canlı Яндекс SDK/anahtar yok |
| card-screens | create | ЧТО СЛУЧИЛОСЬ? / chips / значимые типы | guided | interactive | — | ok |
| card-screens | create | опросная карта + классификатор признаки | guided | interactive | adapter | ok — Лист1 runtime |
| card-screens | create | Описание со слов заявителя 0/1999 | guided | interactive | view | ok |
| card-screens | create | Пострадавшие / Нет на месте / Нет доступа | guided | interactive | view | ok |
| card-screens | create | нет контакта / срыв звонка | guided | interactive | — | ok |
| card-screens | footer | Службы + / chips / сохранить / связь / напоминание / важное / проблема / × | guided | interactive | view | ok |
| card-screens image3 | modal Добавьте службы | поиск + список | guided | interactive | — | ok |
| card-manual Рис.45 | save | Оповестить и сохранить карточку | guided (session yok) | interactive | — | ok |
| card-manual | view | просмотр / дополнение / отработки / Отработана | — | interactive | view | partial |

### Classifier / scenarios

| SOURCE | SCREEN | FIELD/ACTION | THEORY | TRAINING | DDS | STATUS |
| --- | --- | --- | --- | --- | --- | --- |
| xlsx Лист1 r1050101 | data | 112-01 пожар квартира MCHS | guided reuse | interactive | adapter 36814845 | ok |
| xlsx Лист1 r2020000 | data | 112-02 ДТП Police | guided reuse | interactive | adapter 36814848 | ok |
| xlsx Лист1 r18070000 | data | 112-03 ребенок потерялся Police | guided reuse | interactive | — | ok — DDS 36814844 ekranda ТЕСТ 1; 18070000 bağlanmaz |
| xlsx | mapping | Главная служба + servis kolonları | guided | interactive | adapter | ok |

### DDS card actions

| SOURCE | SCREEN | FIELD/ACTION | THEORY | TRAINING | DDS | STATUS |
| --- | --- | --- | --- | --- | --- | --- |
| dds image6–7 | ДДС карточка | read-only header/adres/тип/чипы | — | — | interactive | ok |
| dds caption + image9 | status | Принята / Не принято | — | — | interactive | ok |
| dds caption + image8 | form | Номер наряда / Комментарий / ✓ × | — | — | interactive | ok |
| dds image8 | form | etiketsiz `23` | — | — | interactive | partial — naryad default 23; label kaynakta yok |
| dds image14 | dropdown | Прибытие / Отказ / Работы завершены | — | — | interactive | ok |
| dds caption | карандаш | Начало реагирования / Проведение работ | — | — | interactive | ok |
| dds image11–20 | history | Добавлена → … → терминал | — | — | interactive | ok |
| case §10 | queue | complete → next card / result log | — | — | interactive | ok |

### Hotkeys

| SOURCE | SCREEN | FIELD/ACTION | THEORY | TRAINING | DDS | STATUS |
| --- | --- | --- | --- | --- | --- | --- |
| card-manual | journal | Insert = новая карточка | guided | interactive | — | ok |
| card-manual | create | Alt+… ipucu katmanı | guided (metin) | — | — | missing — eylemler butonlarda; Alt overlay yok |
| theory panel | theory | ←/→ adımlar | guided | — | — | ok |

---

## Pixel / visual

Gözlenen (hex kaynakta yazılı değil):

- ARM canvas `#c5c5c5`, 3D portal stili yok
- Kart header ~72px, kolon 42/58, turuncu footer ~52px
- Seçili chip `#1e88e5`; сохранить `#f15a24`
- Timer koyu; aşım kırmızı
- Incoming mavi bar, tek «Принять»
- Journal koyu `#2c3338`
- Token: `arm112-simulator/styles/arm112-tokens.css`

DDS ayrı workstation CSS: `dds-training.css` (katalog 3D taşınmadı).

---

## Remaining source-backed limitations

1. Canlı АРМ timer kırmızı eşiği saniye olarak yazılmamış; eğitim 30 сек (case преподаватель).
2. Яндекс.Карты canlı katman: pakette SDK/anahtar yok.
3. Avaya foto vs РТУ Т16Р datasheet — tarayıcıda SIP yok.
4. АРМ/ДДС login ekranları: trainer auth; üretim URL kopyalanmaz.
5. Alt kısayol overlay’si bağlanmadı.
6. DDS 36814844 = screenshot «ТЕСТ 1», 112-03 classifier satırı değil.
7. Памятка / билеты pakette yok.
8. Конференция/перевод tam telephony §8 — header stub.
9. Журнал gerçek sunucu araması yok.
10. Scoring algoritması uydurulmadı; result = süre, eylemler, cardData, classifier eşleşme, validation (zorunlu alanlar).

---

## Implementation boundary

| Yol | Rol |
| --- | --- |
| `features/arm112-simulator/` | Canonical ARM: journal, card, classifier, theory guided, training |
| `features/dds-training/` | DDS view + adapter → IncidentCard / ServiceAssignment / Лист1 |
| `docs/arm112-source-map.md` | Bu dosya |
| `pages/call-page.tsx` | Yalnızca disabled экзамен STT/LLM yolu |
| `packages/shared-types` | ARM emulator henüz API kontratı değil |
