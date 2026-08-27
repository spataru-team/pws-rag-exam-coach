import type { ExamPaper } from '@/types'

/**
 * ANCE (Republica Moldova) — Matematică, profil real, Bacalaureat,
 * Sesiunea de bază, 2026. Source PDFs: 12_mat_test_r_ru_sb26 / 12_mat_barem_r_ru_sb26
 * (https://ance.gov.md/sites/default/files/, fetched via scripts/fetch-exam-papers.ts).
 * A 6-item subset of the real 12-item paper (items 1, 2, 6, 7, 8, 9) — chosen to keep
 * the mock short while covering algebra (no figures) and geometry (with figures),
 * since this paper exists primarily to exercise VisualAsset end-to-end (see
 * src/types/asset.ts, src/components/FigureView.tsx): items 6-8 each reference a
 * geometric drawing cropped from the source PDF by scripts/extract-figures.ts —
 * see public/assets/exams/math-sb26/figures.json for extraction provenance.
 *
 * Every item mirrors the real barem's own split (see `baremRule`): "method"
 * sub-criteria the LLM grades against a prose rule, plus one "final answer"
 * sub-criterion (`gradeMode: 'deterministic'`) checked outright against
 * `acceptedAnswers` via `src/learning/expressionMatch.ts` — a notation-aware
 * numeric comparator, so `acceptedAnswers` needs only ONE canonical form per
 * item ("9√2π" alone is enough; "9π√2"/"9*sqrt(2)*pi"/a trailing "см²" unit
 * all evaluate to the same value and match it). `gradeItem`
 * (src/services/examGraderService.ts) grades the two kinds of criteria
 * separately and merges them, reporting `mode: 'hybrid'`.
 */
export const mathSb26: ExamPaper = {
  id: 'math-sb26',
  subjectId: 'math',
  year: 2026,
  grade: 12,
  profile: 'real', // source: 12_mat_test_r_ru_sb26.pdf ("r" = profil real)
  title: 'Sesiunea de bază — Matematică, profil real (extras)',
  timeLimitMin: 90,
  totalPoints: 36,
  items: [
    {
      id: 'math-sb26-1',
      order: 1,
      type: 'open',
      maxPoints: 5,
      prompt: 'Вычислите значение выражения 0,2 + ³√(34/125) − 2.',
      baremRule:
        '5 баллов по этапам: перевод 0,2 в дробь 1/5 (1 б.); вычисление кубического корня ³√(34/125) (2 б.); получение окончательного значения, равного −1 (2 б.).',
      acceptedAnswers: ['-1'],
      subCriteria: [
        { id: 'frac', title: { ru: 'Перевод в дробь' }, maxPoints: 1, rule: 'Верно переводит 0,2 в дробь 1/5.' },
        { id: 'cuberoot', title: { ru: 'Кубический корень' }, maxPoints: 2, rule: 'Верно вычисляет кубический корень ³√(34/125).' },
        { id: 'final', title: { ru: 'Итоговое значение' }, maxPoints: 2, rule: 'Получает окончательное значение выражения.', gradeMode: 'deterministic' },
      ],
    },
    {
      id: 'math-sb26-2',
      order: 2,
      type: 'open',
      maxPoints: 5,
      prompt: 'Решите на множестве ℝ неравенство 64 · 0,25^t < 1.',
      baremRule:
        '5 баллов по этапам: приведение неравенства к одинаковому основанию степени (1/4) (2 б.); решение неравенства для показателя степени (2 б.); запись ответа S = (3; +∞) (1 б.).',
      acceptedAnswers: ['t>3', 'S=(3;+∞)'],
      subCriteria: [
        { id: 'samebase', title: { ru: 'Общее основание степени' }, maxPoints: 2, rule: 'Приводит неравенство к одинаковому основанию степени (1/4).' },
        { id: 'solve', title: { ru: 'Решение неравенства' }, maxPoints: 2, rule: 'Верно решает неравенство для показателя степени.' },
        { id: 'final', title: { ru: 'Ответ' }, maxPoints: 1, rule: 'Записывает ответ в виде множества/интервала.', gradeMode: 'deterministic' },
      ],
    },
    {
      id: 'math-sb26-6',
      order: 3,
      type: 'open',
      maxPoints: 5,
      prompt:
        'Осевое сечение прямого кругового конуса есть прямоугольный треугольник. Определите площадь боковой поверхности конуса, если его высота имеет длину 3 см.',
      baremRule:
        '5 баллов по этапам: нахождение длины радиуса основания конуса (2 б.); нахождение длины образующей конуса (2 б.); вычисление площади боковой поверхности (1 б.).',
      acceptedAnswers: ['9√2π'],
      subCriteria: [
        { id: 'radius', title: { ru: 'Радиус основания' }, maxPoints: 2, rule: 'Верно находит длину радиуса основания конуса.' },
        { id: 'slant', title: { ru: 'Образующая' }, maxPoints: 2, rule: 'Верно находит длину образующей конуса.' },
        { id: 'final', title: { ru: 'Площадь поверхности' }, maxPoints: 1, rule: 'Вычисляет площадь боковой поверхности конуса.', gradeMode: 'deterministic' },
      ],
      assets: [
        {
          id: 'math-sb26-p3-2',
          kind: 'figure',
          src: '/assets/exams/math-sb26/math-sb26-p3-2.png',
          width: 650,
          height: 373,
          alt: {
            ru: 'Прямой круговой конус с показанной высотой (пунктиром) и осевым сечением.',
            ro: 'Con circular drept cu înălțimea (punctat) și secțiunea axială marcate.',
            en: 'A right circular cone with its height (dashed) and axial cross-section marked.',
          },
        },
      ],
    },
    {
      id: 'math-sb26-7',
      order: 4,
      type: 'open',
      maxPoints: 8,
      prompt:
        'В равнобедренной трапеции диагональ перпендикулярна боковой стороне и имеет длину 100 см. Определите периметр трапеции, если ее высота имеет длину 60 см.',
      baremRule:
        '8 баллов по этапам: проекция диагонали на большее основание (2 б.); проекция боковой стороны на большее основание (2 б.); длина боковой стороны (2 б.); длины оснований трапеции (1 б.); вычисление периметра (1 б.).',
      acceptedAnswers: ['310'],
      subCriteria: [
        { id: 'proj1', title: { ru: 'Проекция диагонали' }, maxPoints: 2, rule: 'Находит проекцию диагонали на большее основание.' },
        { id: 'proj2', title: { ru: 'Проекция боковой стороны' }, maxPoints: 2, rule: 'Находит проекцию боковой стороны на большее основание.' },
        { id: 'side', title: { ru: 'Боковая сторона' }, maxPoints: 2, rule: 'Находит длину боковой стороны.' },
        { id: 'bases', title: { ru: 'Основания трапеции' }, maxPoints: 1, rule: 'Находит длины оснований трапеции.' },
        { id: 'final', title: { ru: 'Периметр' }, maxPoints: 1, rule: 'Вычисляет периметр трапеции.', gradeMode: 'deterministic' },
      ],
      assets: [
        {
          id: 'math-sb26-p3-1',
          kind: 'figure',
          src: '/assets/exams/math-sb26/math-sb26-p3-1.png',
          width: 650,
          height: 336,
          alt: {
            ru: 'Равнобедренная трапеция с проведённой диагональю.',
            ro: 'Trapez isoscel cu diagonala trasată.',
            en: 'An isosceles trapezoid with one diagonal drawn in.',
          },
        },
      ],
    },
    {
      id: 'math-sb26-8',
      order: 5,
      type: 'open',
      maxPoints: 8,
      prompt:
        'Площадь боковой поверхности правильной четырехугольной пирамиды равна 200 см², а двугранные углы при основании пирамиды равны 60°. Определите объем пирамиды.',
      baremRule:
        '8 баллов по этапам: построение двугранного угла при основании (1 б.); выражение стороны основания через x — длину проекции апофемы (1 б.); выражение апофемы через x (1 б.); получение уравнения 8x² = 200 (1 б.); нахождение x (1 б.); нахождение высоты пирамиды (1 б.); вычисление объёма (2 б.).',
      acceptedAnswers: ['500√3/3'],
      subCriteria: [
        { id: 'angle', title: { ru: 'Двугранный угол' }, maxPoints: 1, rule: 'Строит двугранный угол при основании пирамиды.' },
        { id: 'sideExpr', title: { ru: 'Сторона основания' }, maxPoints: 1, rule: 'Выражает сторону основания через x — длину проекции апофемы.' },
        { id: 'apothemExpr', title: { ru: 'Апофема' }, maxPoints: 1, rule: 'Выражает апофему через x.' },
        { id: 'equation', title: { ru: 'Уравнение' }, maxPoints: 1, rule: 'Получает уравнение 8x² = 200.' },
        { id: 'xValue', title: { ru: 'Значение x' }, maxPoints: 1, rule: 'Находит значение x.' },
        { id: 'height', title: { ru: 'Высота пирамиды' }, maxPoints: 1, rule: 'Находит высоту пирамиды.' },
        { id: 'final', title: { ru: 'Объём' }, maxPoints: 2, rule: 'Вычисляет объём пирамиды.', gradeMode: 'deterministic' },
      ],
      assets: [
        {
          id: 'math-sb26-p4-2',
          kind: 'figure',
          src: '/assets/exams/math-sb26/math-sb26-p4-2.png',
          width: 644,
          height: 477,
          alt: {
            ru: 'Правильная четырехугольная пирамида с показанной апофемой и высотой (пунктиром).',
            ro: 'Piramidă patrulateră regulată cu apotema și înălțimea (punctat) marcate.',
            en: 'A regular quadrilateral pyramid with its apothem and height (dashed) marked.',
          },
        },
      ],
    },
    {
      id: 'math-sb26-9',
      order: 6,
      type: 'open',
      maxPoints: 5,
      prompt: 'Числа 30, k, −2 являются последовательными членами арифметической прогрессии. Найдите значение k.',
      baremRule:
        '5 баллов по этапам: запись k = (30 + (−2))/2 или получение значения разности прогрессии (3 б.); вычисление значения k = 14 (2 б.).',
      acceptedAnswers: ['14'],
      subCriteria: [
        { id: 'setup', title: { ru: 'Формула/разность прогрессии' }, maxPoints: 3, rule: 'Записывает формулу k = (30 + (−2))/2 или находит разность прогрессии.' },
        { id: 'final', title: { ru: 'Значение k' }, maxPoints: 2, rule: 'Вычисляет значение k.', gradeMode: 'deterministic' },
      ],
    },
  ],
}
