import type { ExamPaper } from '@/types'

/**
 * ANCE (Republica Moldova) — Limba și literatura română, alolingvi,
 * pretestare, ciclul gimnazial, 26.02.2026. 120 min, total 50 puncte.
 * Source PDFs: 09_llroal_test_pr26 / 09_llroal_barem_pr26.
 * `acceptedAnswers` ← "Răspuns corect/posibil"; `baremRule` ← "Specificări".
 */
export const romanianPr26: ExamPaper = {
  id: 'ro-pr26',
  subjectId: 'romanian',
  year: 2026,
  grade: 9,
  title: 'Pretestare — Fapte, nu vorbe (gimnaziu, alolingvi)',
  timeLimitMin: 120,
  totalPoints: 50,
  sourceText: `Fapte, nu vorbe

Părinții au un rol foarte important în educarea copiilor. Ei sunt primii care îi învață ce este bine și ce este rău, cum să se comporte frumos și să-i respecte pe ceilalți. Unii părinți cred că dragostea înseamnă să-și laude mereu copiii, chiar și atunci când aceștia greșesc. Aceasta se numește dragoste oarbă, pentru că nu vede adevărul și nu-l ajută pe copil să devină mai bun. Alți părinți își arată dragostea prin fapte, prin exemplul personal și prin sfaturile pe care le oferă. Un copil bun nu are nevoie de laude, ci de îndrumare și sprijin.

Se zice că, într-un sat, s-au întâlnit la o fântână trei femei. Două dintre ele, Ana și Maria, nu încetau să-și laude băieții. Victoria, cea de-a treia, însă, nu spunea nimic, cu toate că avea și ea un fiu de care nu putea să se plângă. Au luat cele trei femei câte o căldare cu apă și au plecat înapoi, spre casă. Pe drum, s-au întâlnit cu cei trei copii, care se jucau într-o livadă.
– Ia uite-l pe-al meu, a zis Ana. E atât de puternic!
– Dar al meu, a spus Maria, e talentat în toate!
Și de această dată, Victoria a tăcut. Însă copilul ei, văzându-și mama, s-a grăbit să vină și să-i ia căldarea. Cei doi băieți au rămas să se joace mai departe. Acum s-a văzut adevărul. Din modestie, cea de-a treia femeie nu s-a lăudat cu feciorul său, dar, în locul ei, vorbeau faptele fiului. Celelalte femei au rămas rușinate și au înțeles că laudele goale nu înlocuiesc buna creștere. De atunci, ele au început să-și învețe copiii să fie atenți, respectuoși și harnici, nu doar lăudați. În sat, lumea a discutat mult despre acel exemplu de modestie și bun-simț.

În viață, nu vorbele arată cât valorează persoana, ci faptele și comportamentul. Omul adevărat se cunoaște după ceea ce face, nu după ceea ce spune.`,
  items: [
    {
      id: 'pr26-1',
      order: 1,
      type: 'open',
      maxPoints: 3,
      skillTag: 'completare-text',
      prompt:
        'Completează enunțurile, folosind textul: a) Rolul…; b) Femeile…; c) Faptele…',
      baremRule:
        'Câte 1 punct pentru fiecare enunț completat corect (3 enunțuri). Se acceptă și alte variante adecvate.',
      acceptedAnswers: [
        'Rolul părinților în educația copiilor este foarte mare.',
        'Femeile și-au educat copiii diferit.',
        'Faptele în viață sunt mai importante decât vorbele.',
      ],
    },
    {
      id: 'pr26-2',
      order: 2,
      type: 'short',
      maxPoints: 4,
      skillTag: 'sinonime-antonime',
      prompt:
        'Scrie, la forma inițială, câte un sinonim pentru: harnic, a stima; și câte un antonim pentru: adevărat, puternic.',
      baremRule:
        'Câte 1 punct pentru fiecare cuvânt identificat corect, la forma inițială. Nu se admit corectări.',
      // Flat pool of accepted synonyms/antonyms (harnic, a stima | adevărat, puternic).
      // Deterministic grading matches tokens against this pool, capped at maxPoints;
      // it does not enforce per-word slots — acceptable for the pilot.
      acceptedAnswers: [
        'muncitor', 'sârguincios', 'conștiincios', 'diligent', 'activ',
        'a aprecia', 'a respecta', 'a prețui', 'a onora',
        'fals', 'eronat', 'falsificat', 'închipuit', 'născocit', 'neadevărat',
        'slab', 'moale', 'molatic',
      ],
    },
    {
      id: 'pr26-3',
      order: 3,
      type: 'open',
      maxPoints: 2,
      skillTag: 'enunt-reflexiv',
      prompt: 'Scrie câte un enunț dezvoltat cu fiecare cuvânt: a juca (1); a se juca (2).',
      baremRule:
        'Câte 1 punct pentru fiecare enunț dezvoltat (subiect + predicat + minimum încă o parte de propoziție).',
    },
    {
      id: 'pr26-4',
      order: 4,
      type: 'open',
      maxPoints: 4,
      skillTag: 'intrebari-directe',
      prompt:
        'Adresează-le băieților (personaje din text) patru întrebări directe. Folosește: voi, voastră, vostru, voștri, voastre, dumneavoastră sau vă/v-.',
      baremRule:
        'Câte 1 punct pentru fiecare întrebare directă adecvată, adresată băieților.',
    },
    {
      id: 'pr26-5',
      order: 5,
      type: 'open',
      maxPoints: 3,
      skillTag: 'portret-caracterizare',
      prompt: 'Realizează portretul moral al Victoriei în trei enunțuri argumentate.',
      baremRule:
        'Câte 1 punct pentru fiecare enunț logic, argumentat, despre Victoria.',
    },
    {
      id: 'pr26-6',
      order: 6,
      type: 'open',
      maxPoints: 2,
      skillTag: 'concluzii',
      prompt: 'Formulează două concluzii în baza textului citit.',
      baremRule: 'Câte 1 punct pentru fiecare concluzie adecvată și logică.',
    },
    {
      id: 'pr26-7',
      order: 7,
      type: 'open',
      maxPoints: 5,
      skillTag: 'transformare-gramaticala',
      prompt:
        'Pune cuvântul „femeile" la singular și rescrie enunțul, realizând modificările necesare: „Femeile acestea modeste și-au educat corect copiii și i-au învățat ce înseamnă o faptă bună."',
      baremRule:
        'Câte 1 punct pentru fiecare modificare realizată corect (5 modificări). Nu se admit corectări în cuvintele modificate.',
      acceptedAnswers: [
        'Femeia aceasta modestă și-a educat corect copiii și i-a învățat ce înseamnă o faptă bună.',
      ],
    },
    {
      id: 'pr26-8',
      order: 8,
      type: 'open',
      maxPoints: 6,
      prompt:
        'Continuă dialogul cu șase replici complete (fără „Bună ziua!/La revedere!"), respectând tema: „– Mihai, cum te pregătești pentru examenele de absolvire?"',
      baremRule:
        'Se evaluează dialogul ca produs. Nu se acceptă replici dintr-un singur cuvânt.',
      subCriteria: [
        { id: 'lexic', title: { ru: 'Лексика', ro: 'Lexic' }, maxPoints: 2, rule: 'Lexic variat care corespunde temei.', skillTag: 'dialog' },
        { id: 'replici', title: { ru: 'Реплики', ro: 'Replici' }, maxPoints: 4, rule: '4 p. pentru 6 replici; 3 p. pentru 5 replici.', skillTag: 'dialog' },
      ],
    },
    {
      id: 'pr26-9',
      order: 9,
      type: 'open',
      maxPoints: 5,
      prompt:
        'Scrie, în numele admiratorilor, o felicitare adresată lui Alexandrin Guțu cu ocazia obținerii medaliei de aur la Campionatul Mondial de lupte U23, 2025. Utilizează urări deosebite și respectă aranjarea textului în pagină.',
      baremRule: 'Se punctează pe sub-criterii (vezi mai jos).',
      subCriteria: [
        { id: 'adresare', title: { ru: 'Обращение и концовка', ro: 'Adresare + încheiere' }, maxPoints: 1, rule: '1 p. pentru formula de adresare + cea de încheiere (dacă doar una → 0 p.).', skillTag: 'felicitare' },
        { id: 'ocazie', title: { ru: 'Повод', ro: 'Ocazia' }, maxPoints: 1, rule: '1 p. pentru indicarea ocaziei.', skillTag: 'felicitare' },
        { id: 'urare', title: { ru: 'Пожелание', ro: 'Urare' }, maxPoints: 2, rule: '2 p. pentru o urare deosebită; 1 p. pentru una simplă.', skillTag: 'felicitare' },
        { id: 'asezare', title: { ru: 'Оформление', ro: 'Așezare în pagină' }, maxPoints: 1, rule: '1 p. pentru așezarea corectă a textului în pagină.', skillTag: 'felicitare' },
      ],
    },
    {
      id: 'pr26-10',
      order: 10,
      type: 'open',
      maxPoints: 9,
      prompt:
        'Scrie, în opt enunțuri, un eseu la tema: „Patria e locul unde ne sunt rădăcinile". Explică ce înseamnă pentru tine patria; argumentează cu un exemplu din literatura română (D. Matcovschi, N. Dabija ș.a.); formulează o concluzie.',
      baremRule: 'Se punctează pe sub-criterii (vezi mai jos).',
      subCriteria: [
        { id: 'repere', title: { ru: 'Соблюдение опор', ro: 'Respectarea reperelor' }, maxPoints: 3, rule: 'Respectarea celor trei repere date.', skillTag: 'eseu-repere' },
        { id: 'coerenta', title: { ru: 'Связность', ro: 'Coerență' }, maxPoints: 2, rule: '2 p. coerență deplină; 1 p. parțială; 0 p. lipsă.', skillTag: 'eseu-coerenta' },
        { id: 'volum', title: { ru: 'Объём', ro: 'Volum' }, maxPoints: 4, rule: '4 p. pentru 8 enunțuri; 3 p. pentru 6–7 enunțuri.', skillTag: 'eseu-volum' },
      ],
    },
    {
      id: 'pr26-11',
      order: 11,
      type: 'correctness',
      maxPoints: 7,
      skillTag: 'corectitudine',
      prompt: 'Corectitudinea exprimării în întreaga lucrare.',
      baremRule:
        '7 p. pentru 0–3 greșeli; 6 p. pentru 4–7; 5 p. pentru 8–11; 4 p. pentru 12–15; 3 p. pentru 16–19; 2 p. pentru 20–23; 1 p. pentru 24–27. Estimare cu încredere redusă.',
    },
  ],
}
