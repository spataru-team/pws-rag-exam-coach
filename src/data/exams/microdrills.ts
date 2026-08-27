import type { DrillItem, RescueSkillTag } from '@/types'

/**
 * Hand-authored practice items for Exam Rescue Mode microdrills — NOT exam content,
 * ordinary training material (see docs/superpowers/plans/2026-08-11-exam-rescue-mode.md §G).
 * Reuses the ExamItem barem shape so gradeItem() grades these exactly like exam items.
 */
export const microdrillsBySkill: Partial<Record<RescueSkillTag, DrillItem[]>> = {
  felicitare: [
    {
      id: 'drill-felicitare-1', order: 1, skillTag: 'felicitare', type: 'open', maxPoints: 5,
      prompt: 'Scrie, în numele clasei, o felicitare adresată prietenei tale Ana cu ocazia zilei de naștere. Utilizează o urare deosebită. Respectă rigorile de aranjare a textului în pagină.',
      baremRule: 'Se punctează pe sub-criterii (vezi mai jos).',
      subCriteria: [
        { id: 'adresare', title: { ru: 'Обращение и концовка', ro: 'Adresare + încheiere' }, maxPoints: 1, rule: '1 p. pentru formula de adresare + cea de încheiere.', skillTag: 'felicitare' },
        { id: 'ocazie', title: { ru: 'Повод', ro: 'Ocazia' }, maxPoints: 1, rule: '1 p. pentru indicarea ocaziei.', skillTag: 'felicitare' },
        { id: 'urare', title: { ru: 'Пожелание', ro: 'Urare' }, maxPoints: 2, rule: '2 p. pentru o urare deosebită; 1 p. pentru una simplă.', skillTag: 'felicitare' },
        { id: 'asezare', title: { ru: 'Оформление', ro: 'Așezare în pagină' }, maxPoints: 1, rule: '1 p. pentru așezarea corectă a textului în pagină.', skillTag: 'felicitare' },
      ],
    },
    {
      id: 'drill-felicitare-2', order: 2, skillTag: 'felicitare', type: 'open', maxPoints: 5,
      prompt: 'Scrie, în numele familiei, o felicitare adresată bunicii tale cu ocazia sărbătorii de 8 Martie. Utilizează o urare deosebită. Respectă rigorile de aranjare a textului în pagină.',
      baremRule: 'Se punctează pe sub-criterii (vezi mai jos).',
      subCriteria: [
        { id: 'adresare', title: { ru: 'Обращение и концовка', ro: 'Adresare + încheiere' }, maxPoints: 1, rule: '1 p.', skillTag: 'felicitare' },
        { id: 'ocazie', title: { ru: 'Повод', ro: 'Ocazia' }, maxPoints: 1, rule: '1 p.', skillTag: 'felicitare' },
        { id: 'urare', title: { ru: 'Пожелание', ro: 'Urare' }, maxPoints: 2, rule: '2 p. deosebită / 1 p. simplă.', skillTag: 'felicitare' },
        { id: 'asezare', title: { ru: 'Оформление', ro: 'Așezare în pagină' }, maxPoints: 1, rule: '1 p.', skillTag: 'felicitare' },
      ],
    },
    {
      id: 'drill-felicitare-3', order: 3, skillTag: 'felicitare', type: 'open', maxPoints: 5,
      prompt: 'Scrie, în numele colegilor, o felicitare adresată profesoarei de limba română cu ocazia Zilei Limbii Române (31 august). Utilizează o urare deosebită. Respectă rigorile de aranjare a textului în pagină.',
      baremRule: 'Se punctează pe sub-criterii (vezi mai jos).',
      subCriteria: [
        { id: 'adresare', title: { ru: 'Обращение и концовка', ro: 'Adresare + încheiere' }, maxPoints: 1, rule: '1 p.', skillTag: 'felicitare' },
        { id: 'ocazie', title: { ru: 'Повод', ro: 'Ocazia' }, maxPoints: 1, rule: '1 p.', skillTag: 'felicitare' },
        { id: 'urare', title: { ru: 'Пожелание', ro: 'Urare' }, maxPoints: 2, rule: '2 p. deosebită / 1 p. simplă.', skillTag: 'felicitare' },
        { id: 'asezare', title: { ru: 'Оформление', ro: 'Așezare în pagină' }, maxPoints: 1, rule: '1 p.', skillTag: 'felicitare' },
      ],
    },
  ],
  'transformare-gramaticala': [
    {
      id: 'drill-transformare-1', order: 1, skillTag: 'transformare-gramaticala', type: 'open', maxPoints: 5,
      prompt: 'Pune cuvântul copiii la singular și rescrie enunțul, realizând modificările necesare: „Copiii veseli au alergat repede spre casă și au povestit totul părinților."',
      baremRule: 'Câte 1 punct pentru fiecare modificare realizată corect (5 modificări). Nu se admit corectări în cuvintele modificate.',
      acceptedAnswers: ['Copilul vesel a alergat repede spre casă și a povestit totul părinților.'],
    },
    {
      id: 'drill-transformare-2', order: 2, skillTag: 'transformare-gramaticala', type: 'open', maxPoints: 5,
      prompt: 'Pune cuvântul fetele la singular și rescrie enunțul: „Fetele harnice au terminat tema și au ieșit la joacă în curte."',
      baremRule: 'Câte 1 punct pentru fiecare modificare realizată corect (5 modificări).',
      acceptedAnswers: ['Fata harnică a terminat tema și a ieșit la joacă în curte.'],
    },
    {
      id: 'drill-transformare-3', order: 3, skillTag: 'transformare-gramaticala', type: 'open', maxPoints: 5,
      prompt: 'Pune cuvântul elevii la singular și rescrie enunțul: „Elevii atenți au ascultat explicația și au notat ideile principale."',
      baremRule: 'Câte 1 punct pentru fiecare modificare realizată corect (5 modificări).',
      acceptedAnswers: ['Elevul atent a ascultat explicația și a notat ideile principale.'],
    },
    {
      id: 'drill-transformare-4', order: 4, skillTag: 'transformare-gramaticala', type: 'open', maxPoints: 5,
      prompt: 'Pune cuvântul prietenii la singular și rescrie enunțul: „Prietenii mei buni m-au ajutat mereu și m-au susținut la nevoie."',
      baremRule: 'Câte 1 punct pentru fiecare modificare realizată corect (5 modificări).',
      acceptedAnswers: ['Prietenul meu bun m-a ajutat mereu și m-a susținut la nevoie.'],
    },
  ],
  dialog: [
    {
      id: 'drill-dialog-1', order: 1, skillTag: 'dialog', type: 'open', maxPoints: 6,
      prompt: 'Continuă dialogul cu șase replici complete. Nu folosi replici de tipul: Bună ziua! La revedere! Respectă tema.\n- Andrei, ce plănuiești să faci în vacanța de vară?',
      baremRule: 'Se evaluează dialogul ca produs. Nu se acceptă replici dintr-un singur cuvânt.',
      subCriteria: [
        { id: 'lexic', title: { ru: 'Лексика', ro: 'Lexic' }, maxPoints: 2, rule: 'Lexic variat, minimum 4-5 cuvinte, corespunde temei.', skillTag: 'dialog' },
        { id: 'replici', title: { ru: 'Реплики', ro: 'Replici' }, maxPoints: 4, rule: '4 p. pentru 6 replici; 3 p. pentru 5 replici.', skillTag: 'dialog' },
      ],
    },
    {
      id: 'drill-dialog-2', order: 2, skillTag: 'dialog', type: 'open', maxPoints: 6,
      prompt: 'Continuă dialogul cu șase replici complete. Nu folosi replici de tipul: Bună ziua! La revedere! Respectă tema.\n- Maria, ai citit vreo carte interesantă în ultima vreme? Care?',
      baremRule: 'Se evaluează dialogul ca produs. Nu se acceptă replici dintr-un singur cuvânt.',
      subCriteria: [
        { id: 'lexic', title: { ru: 'Лексика', ro: 'Lexic' }, maxPoints: 2, rule: 'Lexic variat, corespunde temei.', skillTag: 'dialog' },
        { id: 'replici', title: { ru: 'Реплики', ro: 'Replici' }, maxPoints: 4, rule: '4 p. pentru 6 replici; 3 p. pentru 5 replici.', skillTag: 'dialog' },
      ],
    },
    {
      id: 'drill-dialog-3', order: 3, skillTag: 'dialog', type: 'open', maxPoints: 6,
      prompt: 'Continuă dialogul cu șase replici complete. Nu folosi replici de tipul: Bună ziua! La revedere! Respectă tema.\n- Nicu, crezi că este important să faci sport? De ce?',
      baremRule: 'Se evaluează dialogul ca produs. Nu se acceptă replici dintr-un singur cuvânt.',
      subCriteria: [
        { id: 'lexic', title: { ru: 'Лексика', ro: 'Lexic' }, maxPoints: 2, rule: 'Lexic variat, corespunde temei.', skillTag: 'dialog' },
        { id: 'replici', title: { ru: 'Реплики', ro: 'Replici' }, maxPoints: 4, rule: '4 p. pentru 6 replici; 3 p. pentru 5 replici.', skillTag: 'dialog' },
      ],
    },
  ],
  'intrebari-directe': [
    {
      id: 'drill-intrebari-1', order: 1, skillTag: 'intrebari-directe', type: 'open', maxPoints: 4,
      prompt: 'Mihai este un elev pasionat de fotbal, care se antrenează zilnic în echipa școlii. Adresează-i lui Mihai patru întrebări directe, folosind: tu/tău/ție.',
      baremRule: 'Se acordă câte un punct pentru fiecare întrebare directă adecvată.',
    },
    {
      id: 'drill-intrebari-2', order: 2, skillTag: 'intrebari-directe', type: 'open', maxPoints: 4,
      prompt: 'Doamna Popescu este bibliotecara școlii de 20 de ani și organizează cluburi de lectură pentru elevi. Adresează-i doamnei Popescu patru întrebări directe, folosind: dumneavoastră/vă.',
      baremRule: 'Se acordă câte un punct pentru fiecare întrebare directă adecvată.',
    },
    {
      id: 'drill-intrebari-3', order: 3, skillTag: 'intrebari-directe', type: 'open', maxPoints: 4,
      prompt: 'Ana a câștigat locul întâi la un concurs național de robotică. Adresează-i Anei patru întrebări directe, folosind: tu/tău/ție.',
      baremRule: 'Se acordă câte un punct pentru fiecare întrebare directă adecvată.',
    },
  ],
  'eseu-repere': [
    {
      id: 'drill-eseu-repere-1', order: 1, skillTag: 'eseu-repere', type: 'open', maxPoints: 2,
      prompt: 'Scrie un text de exact 4 enunțuri la tema „Prietenia adevărată". Respectă reperele: a) explică ce înseamnă pentru tine prietenia; b) dă un exemplu concret.',
      baremRule: '1 p. pentru fiecare reper respectat (2 repere).',
      subCriteria: [{ id: 'repere', title: { ru: 'Опоры', ro: 'Repere' }, maxPoints: 2, rule: '1 p. per reper respectat.', skillTag: 'eseu-repere' }],
    },
    {
      id: 'drill-eseu-repere-2', order: 2, skillTag: 'eseu-repere', type: 'open', maxPoints: 2,
      prompt: 'Scrie un text de exact 4 enunțuri la tema „Munca și succesul". Respectă reperele: a) explică ce înseamnă pentru tine munca; b) dă un exemplu concret.',
      baremRule: '1 p. pentru fiecare reper respectat (2 repere).',
      subCriteria: [{ id: 'repere', title: { ru: 'Опоры', ro: 'Repere' }, maxPoints: 2, rule: '1 p. per reper respectat.', skillTag: 'eseu-repere' }],
    },
    {
      id: 'drill-eseu-repere-3', order: 3, skillTag: 'eseu-repere', type: 'open', maxPoints: 2,
      prompt: 'Scrie un text de exact 4 enunțuri la tema „Natura și omul". Respectă reperele: a) explică ce înseamnă pentru tine natura; b) dă un exemplu concret.',
      baremRule: '1 p. pentru fiecare reper respectat (2 repere).',
      subCriteria: [{ id: 'repere', title: { ru: 'Опоры', ro: 'Repere' }, maxPoints: 2, rule: '1 p. per reper respectat.', skillTag: 'eseu-repere' }],
    },
  ],
  'eseu-volum': [
    {
      id: 'drill-eseu-volum-1', order: 1, skillTag: 'eseu-volum', type: 'open', maxPoints: 2,
      prompt: 'Scrie exact 4 enunțuri despre cartea ta preferată.',
      baremRule: '2 p. pentru exact 4 enunțuri; 1 p. pentru 3 enunțuri; 0 p. pentru mai puțin.',
      subCriteria: [{ id: 'volum', title: { ru: 'Объём', ro: 'Volum' }, maxPoints: 2, rule: '2 p. pentru 4 enunțuri; 1 p. pentru 3.', skillTag: 'eseu-volum' }],
    },
    {
      id: 'drill-eseu-volum-2', order: 2, skillTag: 'eseu-volum', type: 'open', maxPoints: 2,
      prompt: 'Scrie exact 4 enunțuri despre orașul/satul tău natal.',
      baremRule: '2 p. pentru exact 4 enunțuri; 1 p. pentru 3 enunțuri; 0 p. pentru mai puțin.',
      subCriteria: [{ id: 'volum', title: { ru: 'Объём', ro: 'Volum' }, maxPoints: 2, rule: '2 p. pentru 4 enunțuri; 1 p. pentru 3.', skillTag: 'eseu-volum' }],
    },
    {
      id: 'drill-eseu-volum-3', order: 3, skillTag: 'eseu-volum', type: 'open', maxPoints: 2,
      prompt: 'Scrie exact 4 enunțuri despre un hobby pe care îl practici.',
      baremRule: '2 p. pentru exact 4 enunțuri; 1 p. pentru 3 enunțuri; 0 p. pentru mai puțin.',
      subCriteria: [{ id: 'volum', title: { ru: 'Объём', ro: 'Volum' }, maxPoints: 2, rule: '2 p. pentru 4 enunțuri; 1 p. pentru 3.', skillTag: 'eseu-volum' }],
    },
  ],
}

export function microdrillsForSkill(tag: RescueSkillTag): DrillItem[] {
  return microdrillsBySkill[tag] ?? []
}
