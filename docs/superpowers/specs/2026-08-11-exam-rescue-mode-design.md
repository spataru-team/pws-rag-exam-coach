# Exam Rescue Mode («Добрать баллы») — дизайн

**Дата:** 2026-08-11
**Предмет:** Limba română (`romanian`), Evaluarea Națională, 9 класс, школы с русским языком
**Контекст:** 6 учеников уже сдавали sesiunea de bază (sb26, 15.06.2026) и pretestarea (pr26) —
оба неудачно. Пересдача (sesiune suplimentară, индивидуальная) — **14 августа 2026**, то
есть на реализацию **3 дня** (сегодня 11.08).
**Связанные документы:** [[2026-06-10-mock-exam-barem-grading-design]] (текущий `/exam`),
память [[pilot-exam-2026]].

> **⚠️ ИСПРАВЛЕНО:** после код-ревью §B (выбор Test B по отсутствию `ExamAttempt`), §D
> (skillTag «совпадает по номеру задания» — неверно, см. доказательство), §E (округление
> внутри формулы), §F (прогноз = экзамен+дрилл впрямую), §H (3-статусный reviewStatus) —
> **устарели**. Актуальная версия всей архитектуры и авторитетный источник —
> `docs/superpowers/plans/2026-08-11-exam-rescue-mode.md`. Этот файл остаётся как источник
> первичного исследования (§A диагноз реализации, §B PDF pr26/sb25/sb26/ss25/ss26, §C
> официальная сетка баллов) — эта часть подтверждена и не менялась.

## Цель

Не курс румынского, а инструмент «добора баллов»: диагностика → надёжные/близкие/дорогие
баллы → 2–4 навыка с лучшим ROI → короткие микротренировки → повторная проверка →
прогноз → независимый Test B на перенос навыка.

## A. Диагноз текущей реализации

Что уже есть и переиспользуется как есть:

- `ExamPaper`/`ExamItem`/`BaremResult`/`ExamAttempt` (`src/types/exam.ts`) — барем-модель,
  под-критерии, режим оценки (`deterministic|llm|self`), `lowConfidence`.
- `src/learning/baremGrader.ts` + `src/services/examGraderService.ts` (`gradeItem`,
  `gradeAttempt`) — деминистично для `short`, LLM по барему для `open`/`correctness`,
  фоллбэк на `self` при пустом ответе/сбое LLM/невалидном JSON. **Уже не строковое
  совпадение**: `short` матчится списком принятых вариантов, без диакритики/пунктуации/
  регистра, несколько токенов на ответ. Открытые задания уже оцениваются LLM по
  под-критериям, не строкой — риск «верный по смыслу ответ = 0» уже снят архитектурой.
  Расширяю только производной классификацией (см. §H), само ядро не трогаю.
- `src/data/exams/romanian-pr26.ts` + `index.ts` (`examPapersForSubject`, `getExamPaper`) —
  один живой вариант (pr26), 11 заданий/50 баллов, `subCriteria` на п.8–10.
- `src/screens/Exam.tsx` (`/exam`) — таймер, анти-чит, сдача → грейдинг → результаты.
- `db.examAttempts` (Dexie v2) + `examAttemptRepo` — история попыток, без учётных записей
  (`profile.localId` — анонимный id устройства, per §7 spec экспорта).
- `src/export/` — `buildProgressExport` уже включает `examAttempts` в JSON-экспорт.

Чего нет — и что нужно для Rescue Mode:

- **Нет** порога прохождения/безопасной цели нигде в коде (grep подтвердил — `passThreshold`,
  `safetyTarget` отсутствуют полностью). raw→grade сейчас вообще не считается, UI показывает
  только `totalAwarded / totalMax`.
- **Нет** привязки заданий к навыкам/темам — `ExamItem` не связан с `Topic`/`skillArea` из
  `src/data/subjects/romanian.ts` (та система применяется только к Practice/Diagnostic, не к
  Exam).
- **Нет** второго варианта — только pr26.
- **Нет** ни одного эвристического веса «сколько стоит натренировать навык» — это нормально,
  это то, что мы вносим.

## B. Экзаменационные данные — теперь 5 подлинных вариантов

Вы прислали официальные test+barem PDF с ance.gov.md для **sb25, sb26, ss25, ss26**
(plus уже в коде pr26). Все пять — идентичная структура ANCE (11 заданий, 50 баллов,
одинаковое распределение баллов по номерам 3-4-2-4-3-2-5-6-5-9-7, одна и та же таблица
«corectitudine»). Ничего не выдумываю — расшифрованный текст уже у меня, ввожу как данные.

| id | Сессия | Дата | Текст | Уже писали? |
|----|--------|------|-------|-------------|
| `ro-pr26` (есть) | Pretestare | 26.02.2026 | Fapte, nu vorbe | да |
| `ro-sb26` (новый) | Sesiunea de bază | 15.06.2026 | Faptă mică sau… (barca) | да — **реальный экзамен** |
| `ro-sb25` (новый) | Sesiunea de bază | 12.06.2025 | Blând și talentat (Eminescu) | нет (прошлогодний поток) |
| `ro-ss25` (новый) | Sesiune suplimentară | 11.07.2025 | Prietenie | нет |
| `ro-ss26` (новый) | Sesiune suplimentară | 10.07.2026 | Generozitatea lui Creangă | не подтверждено |

**Роли (конфиг, не отдельные компоненты):**
- **Диагностика Rescue Mode = `ro-sb26`** — самый аутентичный (тот самый экзамен, который
  нужно пересдать), проходится в приложении заново для точной текущей оценки.
- **Test B (перенос)** — выбирается **программно**, не хардкодом: из пула `{ss26, ss25, sb25,
  pr26}` минус диагностика, предпочитая вариант, для которого у профиля **нет** существующего
  `ExamAttempt` (`examAttemptRepo.listBySubject`). Порядок предпочтения при равенстве —
  `ss26 > ss25 > sb25 > pr26` (ss* структурно ближе к типу пересдачи). Решает открытый вопрос
  «видели ли ss26» без необходимости знать это заранее и без риска подсунуть уже пройденный
  вариант как «независимый».
- `/exam` (текущий живой экран) **не меняется** — `examPapersForSubject('romanian')[0]`
  остаётся `pr26`. Rescue Mode обращается к бумагам по `id`, не по порядку массива.

Файлы: `src/data/exams/romanian-sb25.ts`, `romanian-sb26.ts`, `romanian-ss25.ts`,
`romanian-ss26.ts`, каждый — точная копия структуры `romanian-pr26.ts` с расшифрованным
текстом/баремом. `index.ts` регистрирует все пять в `examPapersBySubject.romanian`.

## C. Пороги и сетка оценок — конфиг, не разбросано по коду

Вы прислали официальную сетку (одинаковую для всех пяти вариантов):

| Баллы | 13–20 | 21–28 | 29–36 | 37–44 | 45–47 | 48–50 |
|-------|-------|-------|-------|-------|-------|-------|
| Nota  | 5     | 6     | 7     | 8     | 9     | 10    |

Новый файл `src/learning/rescueConfig.ts` — **единственное место** с этими числами:

```ts
export const RO_GIMNAZIU_GRADING_SCALE = [
  { nota: 5, min: 13, max: 20 }, { nota: 6, min: 21, max: 28 },
  { nota: 7, min: 29, max: 36 }, { nota: 8, min: 37, max: 44 },
  { nota: 9, min: 45, max: 47 }, { nota: 10, min: 48, max: 50 },
] as const

export const RESCUE_CONFIG = {
  passThreshold: 13,   // = нижняя граница nota 5 (официально, из сетки выше)
  safetyTarget: 18,     // педагогический выбор учителя: уверенно внутри «пятёрки», не впритык.
                         // Редактируется здесь; ничего в коде это число больше не хардкодит.
  maxRescueSkills: 4,   // «обычно 2–4 направления» — верхняя граница маршрута
  minRescueSkills: 2,
  drillsPerSkill: { min: 3, max: 6 },
  zoneThresholds: {
    safeRatio: 0.8,              // earned/max >= 0.8 → 🟢 надёжные
    expensiveCostAbove: 4,       // trainingCost выше — кандидат в 🔴
    expensiveReliabilityBelow: 0.4,
  },
  perSkill: { /* см. §E — trainingCost + transferReliability, по одному месту на навык */ },
}
```

## D. Навыки — отдельная от барема таксономия

`ExamItem`/`ExamSubCriterion` получают необязательное поле `skillTag?: string` (не ломает
существующие типы/данные — опционально). Один и тот же набор тегов для всех 5 вариантов
(номера заданий и их суть совпадают между сессиями):

`completare-text`, `sinonime-antonime`, `enunt-reflexiv`, `intrebari-directe`,
`portret-caracterizare`, `concluzii`, `singular-plural`, `dialog`, `felicitare`,
`eseu-repere`, `eseu-coerenta`, `eseu-volum`, `corectitudine`.

Заметьте: эссе (п.10) разбито на 3 тега по под-критериям — `repere`/`volum` легко
натренировать («держись трёх опор», «пиши ровно 8 предложений»), `coerenta` — нет. Это и
есть требуемое разделение «шаблонизируется» vs «дорого».

Файл `src/data/exams/skills.ts` — только заголовки (ru/ro) для UI, без весов (веса — в
`rescueConfig.ts`, см. ниже, чтобы учитель редактировал одно место, а не два).

## E. Оптимизатор — явная формула, не ML

Для каждого `skillTag`, по результатам диагностики (`ro-sb26`):

```
lostPoints          = maxPoints - earnedPoints                       (по этому навыку)
partialCreditFactor = 0.4 + 0.6 * (earnedPoints / maxPoints)          // 0.4..1.0
estimatedRecoverablePoints = round(lostPoints * partialCreditFactor * transferReliability)
priority             = estimatedRecoverablePoints / trainingCost
```

`trainingCost` и `transferReliability` — **per-skillTag константы в `RESCUE_CONFIG.perSkill`**,
задаются учителем, с комментарием почему:

```ts
perSkill: {
  felicitare:      { trainingCost: 1, transferReliability: 0.85 }, // жёсткий шаблон, 4 критерия
  dialog:          { trainingCost: 2, transferReliability: 0.8 },  // тема меняется, форма — нет
  'singular-plural':{ trainingCost: 1, transferReliability: 0.85 },// чисто механический навык
  'sinonime-antonime': { trainingCost: 1, transferReliability: 0.7 },
  'intrebari-directe': { trainingCost: 2, transferReliability: 0.7 },
  'enunt-reflexiv':{ trainingCost: 2, transferReliability: 0.65 },
  concluzii:       { trainingCost: 2, transferReliability: 0.6 },
  'eseu-repere':   { trainingCost: 2, transferReliability: 0.6 },
  'eseu-volum':    { trainingCost: 1, transferReliability: 0.75 }, // «пиши 8 предложений»
  'portret-caracterizare': { trainingCost: 3, transferReliability: 0.5 },
  'eseu-coerenta': { trainingCost: 4, transferReliability: 0.4 },  // требует владения языком
  corectitudine:   { trainingCost: 5, transferReliability: 0.3 },  // разлито по всей работе
  'completare-text': { trainingCost: 2, transferReliability: 0.65 },
}
```

**Проверка на примере из ТЗ:** эссе (9 баллов, ученик почти не умеет, допустим 0/9 по
`eseu-coerenta`) vs задание на 5 баллов, не хватает одного элемента (4/5 felicitare):
- eseu-coerenta: lost=2 (доля coerenta в 9), factor=0.4, reliability=0.4 →
  recoverable≈0.32, cost=4 → priority=0.08
- felicitare: lost=1, factor=0.4+0.6·0.8=0.88, reliability=0.85 → recoverable≈0.75, cost=1 →
  priority=0.75

felicitare побеждает с большим отрывом — не потому что «легче», а потому что: уже почти
получается **и** дёшево тренируется **и** формула переносится на новый вариант. Это и есть
требуемое «не maxPoints − currentPoints».

**Зоны:**
- 🟢 **Надёжные**: `earned/max >= safeRatio (0.8)` по навыку — не трогаем в тренировке,
  показываем как актив.
- 🔴 **Дорогие**: `trainingCost > 4` ИЛИ `transferReliability < 0.4` — не первый выбор в
  условиях 3 дней (`corectitudine`, `eseu-coerenta` — в реальности это и есть кандидаты).
- 🟡 **Рядом**: всё остальное с `lostPoints > 0` — источник маршрута.

**Маршрут:** сортируем 🟡 по `priority` убыв., жадно добавляем в маршрут пока
`min(2, len)..max(4)` навыков ИЛИ пока `currentScore + sum(estimatedRecoverablePoints
взятых)` не достигнет `safetyTarget` — что раньше. Останавливаемся на `safetyTarget`, не
позже (тест #5 из ТЗ).

## F. Прогноз — формулировки, не гарантии

`forecast = currentScore + Σ(actual gain per drilled skill, capped at that skill's lostPoints
and at paperMaxPoints)`. Пересчитывается после каждой микросерии по факту (не по
`estimatedRecoverablePoints` — то была лишь оценка для выбора, реальный прирост меряем
контрольными упражнениями). Тексты интерфейса — только «прогноз», «потенциальный балл»,
«безопасная зона»; нигде не «гарантированная оценка».

## G. Микротренировки

Новый файл `src/data/exams/microdrills.ts`: 3–6 коротких заданий на каждый `skillTag`,
обычные учебные упражнения (не выдаю за экзаменационные, не ворую содержание будущего
варианта) — например для `felicitare`: 4 мини-фелиситэри с разными поводами, проверяются
по тем же 4 под-критериям, что и в барме (`adresare/ocazie/urare/asezare`). Тип `DrillItem`
— облегчённый `ExamItem` (без `order`, с обязательным `skillTag`). Грейдинг переиспользует
`gradeItem`/`gradeShortDeterministic`/LLM-барем-промпт как есть — нового грейдера не пишем.
После серии — `rescueEngine.forecast` пересчитывается, показываем «Было → Стало».

## H. Автопроверка — минимальное расширение, не переписывание

Ядро (`baremGrader.ts`, `examGraderService.ts`) не трогаю — оно уже: (1) детерминировано
только для `short` с списком принятых вариантов (не единственная строка), (2) LLM по
под-критериям барема для `open`, с `advice` и валидацией диапазонов, (3) `self`-фоллбэк на
любой сбой. Добавляю **чистую производную функцию** `src/learning/reviewStatus.ts`:

```ts
function reviewStatus(r: BaremResult): 'correct' | 'likely_correct' | 'needs_review' {
  if (r.mode === 'self' || r.lowConfidence) return 'needs_review'
  if (r.awarded === r.max) return 'correct'
  if (r.awarded > 0) return 'likely_correct'
  return 'needs_review'
}
```
Используется в Rescue Mode (диагностика/зоны) и как необязательная метка рядом с
`t('exam.mode...')` в `Exam.tsx` (одна строка добавляется, ничего не удаляется — нулевой
риск для существующего экрана).

## I. Хранение и профиль

Переиспользую `profile.localId` (существующая анонимная идентификация) и `examAttemptRepo`
(диагностика и Test B — обычные `ExamAttempt`, ничего нового не нужно для них). Новая Dexie
таблица (v3 миграция) **только** для состояния рескью-сессии:

```ts
interface RescueSession {
  id: string; subjectId: SubjectId
  diagnosticAttemptId: string; diagnosticPaperId: string
  route: { skillTag: string; estimatedRecoverablePoints: number }[]
  drillResults: { skillTag: string; results: BaremResult[]; achievedGain: number }[]
  transferAttemptId?: string; transferPaperId?: string
  forecastHistory: { at: string; score: number }[]
  startedAt: string; updatedAt: string
}
```
`resetAllData()` расширяется на `rescueSessions.clear()`. Существующие таблицы не меняю.

## J. UI (`/rescue`, новый экран + пункт навигации)

Экраны: intro (сводка баллов/зон) → route-preview (2–4 навыка с `+N`) →
drill-loop (по навыку, 3–6 заданий, немедленный фидбек) → progress («Было → Стало» после
каждого навыка) → final (обновлённый прогноз, кнопка «Пройти Test B»). Копирайт — позитивный,
без «провал»/красного экрана, только «прогноз»/«потенциальные баллы»/«безопасная зона»,
как в примере из ТЗ. Виджеты переиспользую (`StatCard`, `DeltaBadge`, `ScoreBar`).

## K. Аналитика для преподавателя — двумя фазами

**Фаза 1 (в этом же цикле):** `rescueSummary` добавляется в существующий JSON-экспорт
(`buildProgressExport`/`ExportScreen`) — тот же путь, которым уже выгружаются `examAttempts`,
просто ещё одно поле. Учитель уже собирает 6 файлов вручную — ничего нового не изобретаю.

**Фаза 2 (после того как основной цикл работает):** компактный экран, который принимает
несколько экспортированных JSON (drag-and-drop локально, без сервера) и рисует таблицу
Ученик/первичный балл/надёжные/прирост/навыки/прогноз/Test B — если время останется до 14.08.

## Что не трогаем

`/exam` (маршрут, дефолтный paper, анти-чит), `baremGrader.ts`/`examGraderService.ts`
(ядро грейдинга), существующие Dexie-таблицы v1/v2, `Practice`/`Diagnostic`/mastery-система
(она про другой контент, не про экзамен), i18n-ключи вне `rescue.*`/`exam.reviewStatus`.

## Предположения (проверить/поправить при необходимости)

1. Ученики не видели `ss25`/`sb25`; про `ss26` неизвестно — решается программно (§B), не
   критично, если предположение неверно.
2. `safetyTarget = 18` — мой выбор по умолчанию (совпадает с вашим примером в ТЗ); правится
   в одну строку `rescueConfig.ts`.
3. У 6 учеников общий подход к устройствам такой же, как в июньском пилоте (свой девайс,
   `profile.localId`) — если кто-то на новом устройстве, диагностика просто начнётся с нуля,
   это не ломает механизм.
4. Микротренировки — мой авторский контент (не из будущего варианта пересдачи).

## Риски

- **3 дня на всё.** Приоритет: A (диагностика→оптимизатор→маршрут→дрилл→прогноз→Test B) в
  первую очередь; K-фаза-2 (учительский агрегатор) — только если останется время.
- **LLM-грейдинг дрилов** зависит от того же провайдера, что и `/exam` — уже provider-neutral
  с self-фоллбэком, дополнительного риска не добавляет.
- **Формула оптимизатора эвристическая** — явно документирована как таковая, отделена от
  официального барема (баремом остаются только сами `ExamItem`/`BaremResult`).

## Тесты (10 пунктов ТЗ → конкретные файлы)

1. raw score — уже покрыто `examGraderService.test.ts`/`baremGrader.test.ts`, не дублирую.
2. `passThreshold`/`safetyTarget` — `rescueConfig.test.ts` (значения из сетки, не расходятся).
3. классификация 🟢/🟡/🔴 — `rescueEngine.test.ts`.
4. приоритет при равных потерянных баллах (felicitare vs eseu-coerenta пример из §E) —
   `rescueEngine.test.ts`.
5. маршрут останавливается на `safetyTarget` — `rescueEngine.test.ts`.
6. прогноз не превышает `maxPoints` — `rescueEngine.test.ts`.
7. ученик уже выше `safetyTarget` — маршрут пуст/только 🟢 — `rescueEngine.test.ts`.
8. ученик сильно ниже `passThreshold` — маршрут не «обманывает» (см. §F, честный прогноз) —
   `rescueEngine.test.ts`.
9. регрессия pr26/`/exam` — существующие тесты остаются зелёными без изменений
   (`romanian-pr26.test.ts`, `examGraderService.test.ts`, `Exam.tsx` не меняет поведение).
10. несколько вариантов — `examPapersForSubject('romanian')` возвращает 5,
    `getExamPaper('ro-ss26')` и т.д. работают — `data/exams/*.test.ts` по образцу
    `romanian-pr26.test.ts` (11 items, id уникальны, сумма = 50).
