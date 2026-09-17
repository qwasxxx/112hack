/**
 * Inventory of source files actually read for the ARM-112 simulator.
 * Filenames are preserved from the provided archive / case pack.
 */

export const ARM112_SOURCE_FILES = {
  caseSpec: {
    id: 'case-spec',
    file: '9. Деп Обороны и ЧС.pdf',
    kind: 'pdf',
    origin: 'case pack (not inside adsız klasör.zip)',
    pages: 20,
    title: 'Учебное программное обеспечение для подготовки оператора ДДС города Москвы с использованием искусственного интеллекта',
  },
  cardManual: {
    id: 'card-manual',
    file: 'Инструкция_по_заведению_карточки_2507ГСИ.docx',
    kind: 'docx',
    origin: 'adsız klasör.zip',
    title: 'МОДУЛЬ «ПРИЕМ И ОБРАБОТКА ВЫЗОВОВ 112» / Инструкция пользователя / Заведение карточки происшествия',
  },
  cardScreens: {
    id: 'card-screens',
    file: 'СКРИНШОТ КАРТОЧКИ 112ГСИ.docx',
    kind: 'docx+png',
    origin: 'adsız klasör.zip',
    images: 9,
    capturedAt: '17.09.2026',
  },
  ddsScreens: {
    id: 'dds-screens',
    file: 'СКРИНШОТ ДДСГСИ.docx',
    kind: 'docx+png',
    origin: 'adsız klasör.zip',
    images: 20,
    capturedAt: '17.09.2026',
  },
  classifier: {
    id: 'classifier',
    file: 'Классификатор_происшествий_v_046_11_ДТУ_15_11_2024_искл_пожар_задымление.xlsx',
    kind: 'xlsx',
    origin: 'adsız klasör.zip',
    sheet: 'Лист1',
    version: 'v_046_11_ДТУ_15_11_2024',
  },
  ipPhone: {
    id: 'ip-phone',
    file: 'РТУ Т16Р_Datasheet_ 2024_ГСИ.pdf',
    kind: 'pdf',
    origin: 'adsız klasör.zip',
    pages: 2,
    title: 'РТУ Т16Р корпоративный IP телефон',
  },
} as const;

export const ARM112_SOURCES_NOT_IN_PACK = [
  {
    claimedBy: 'case-spec §11 Источники данных',
    missing: 'Документация «Работа на АРМ-112. Памятка для дежурно-диспетчерских служб»',
  },
  {
    claimedBy: 'case-spec §11 Источники данных',
    missing: 'Билеты и задачи',
  },
] as const;
