import type { ExamPaper } from '@/types'

/**
 * ANCE (Republica Moldova) — Limba și literatura română, alolingvi,
 * Examen Național de Absolvire a Gimnaziului, Sesiunea de bază, 15.06.2026.
 * 120 min, total 50 puncte. Source PDFs: 09_llroal_test_sb26 / 09_llroal_barem_sb26.
 * `acceptedAnswers` ← "Răspuns corect/posibil"; `baremRule` ← "Specificări".
 * This is the real exam these students sat and need to recover points on — used as the
 * Exam Rescue Mode diagnostic paper (docs/superpowers/plans/2026-08-11-exam-rescue-mode.md).
 */
export const romanianSb26: ExamPaper = {
  id: 'ro-sb26',
  subjectId: 'romanian',
  year: 2026,
  grade: 9,
  title: 'Sesiunea de bază — Faptă mică sau… (gimnaziu, alolingvi)',
  timeLimitMin: 120,
  totalPoints: 50,
  sourceText: `Faptă mică sau …

Un bărbat a fost rugat să vopsească o barcă. Și-a adus vopsea, pensule și a început să lucreze. Barca trebuia să aibă o haină în roșu aprins. Așa i-a cerut proprietarul bărcii.

În timp ce vopsea, meșterul a observat o gaură (дыра) în carcasa bărcii și a reparat-o în liniște. Când a terminat de vopsit, a primit plata și a plecat.

A doua zi, stăpânul bărcii a venit la meșter și i-a înmânat un cec cu o sumă mult mai mare decât cea primită cu o zi înainte pentru vopsire.

Bărbatul a fost surprins:
– Dar mi-ați plătit deja pentru acest lucru, domnule!
– Dar această plată este pentru altceva, mult mai important. Este pentru că ai reparat barca.
– Of! Dar a fost un serviciu foarte mic... Nu merită să-mi plătiți o sumă atât de mare pentru ceva atât de mic, neînsemnat.
– Dragul meu, tu nu înțelegi. Uite ce s-a întâmplat. Când te-am rugat să vopsești barca, am uitat să-ți spun despre această gaură. Când barca s-a uscat, copiii mei au luat-o și au plecat la pescuit. Ei nu știau că exista o gaură. Iar eu nu eram acasă. Când m-am întors și am observat că ei au luat barca, m-am speriat. Eram disperat, pentru că mi-am amintit de gaură. Imaginează-ți bucuria mea când i-am văzut pe copii, întorcându-se de la pescuit sănătoși și voioși. Apoi am văzut că ai reparat-o! Arată atât de frumos! Acum înțelegi? Mi-ai salvat copiii, domnule! Nicio sumă de bani nu poate răsplăti micuța ta faptă mare. Îți mulțumesc din toată inima!`,
  items: [
    {
      id: 'sb26-1', order: 1, type: 'open', maxPoints: 3, skillTag: 'completare-text',
      prompt: 'Completează enunțurile, folosind textul. a) Proprietarul bărcii…; b) Meșterul…; c) Bucuria…',
      baremRule: 'Se acordă câte un punct pentru fiecare enunț completat corect. Se acceptă și alte variante adecvate.',
      acceptedAnswers: [
        '...a invitat un meșter să vopsească barca.',
        '...a renovat barca cu responsabilitate.',
        '... tatei era mare, copiii erau în siguranță.',
      ],
    },
    {
      id: 'sb26-2', order: 2, type: 'short', maxPoints: 4, skillTag: 'sinonime-antonime',
      prompt: 'Scrie, pentru cuvintele date, câte un sinonim, un antonim la forma inițială. a repara / a plăti (sinonime); mic / a se întoarce (antonime).',
      baremRule: 'Se acordă câte un punct pentru fiecare cuvânt identificat corect, la forma inițială. Nu se admit corectări.',
      acceptedAnswers: [
        'a renova', 'a vopsi', 'a face', 'a achita', 'a da bani',
        'mare', 'enorm', 'uriaș', 'a se duce', 'a merge', 'a pleca',
      ],
    },
    {
      id: 'sb26-3', order: 3, type: 'open', maxPoints: 2, skillTag: 'enunt-reflexiv',
      prompt: 'Scrie câte un enunț dezvoltat cu fiecare cuvânt: (1) a vedea; (2) a se vedea.',
      baremRule: 'Câte 1 punct pentru fiecare enunț logic, dezvoltat (subiect, predicat și minimum încă o parte de propoziție).',
    },
    {
      id: 'sb26-4', order: 4, type: 'open', maxPoints: 4, skillTag: 'intrebari-directe',
      prompt: 'Adresează-i meșterului 4 întrebări. Poți folosi cuvintele dumneavoastră sau vă/v-.',
      baremRule: 'Se acordă câte un punct pentru fiecare întrebare adecvată.',
    },
    {
      id: 'sb26-5', order: 5, type: 'open', maxPoints: 3, skillTag: 'portret-caracterizare',
      prompt: 'Realizează portretul moral al proprietarului bărcii în trei enunțuri argumentate.',
      baremRule: 'Se acordă câte un punct pentru fiecare enunț logic, argumentat.',
    },
    {
      id: 'sb26-6', order: 6, type: 'open', maxPoints: 2, skillTag: 'concluzii',
      prompt: 'Formulează două concluzii în baza textului citit.',
      baremRule: 'Se acordă câte un punct pentru fiecare concluzie adecvată.',
    },
    {
      id: 'sb26-7', order: 7, type: 'open', maxPoints: 5, skillTag: 'transformare-gramaticala',
      prompt: 'Pune cuvântul băieții la singular și rescrie enunțul, realizând modificările necesare: „Mergând spre casă, băieții, veseli și mulțumiți, au mers la o terasă și au băut ceai."',
      baremRule: 'Câte 1 punct pentru fiecare modificare realizată corect (5 modificări). Nu se permit corectări.',
      acceptedAnswers: ['Mergând spre casă, băiatul, vesel și mulțumit, a mers la o terasă și a băut ceai.'],
    },
    {
      id: 'sb26-8', order: 8, type: 'open', maxPoints: 6,
      prompt: 'Continuă dialogul cu șase replici complete. Nu folosi replici de tipul: Bună ziua! La revedere! Respectă tema.\n- Victoria, vreau să organizăm acțiuni ecologice în satul/orașul nostru. Vrei să participi și tu?',
      baremRule: 'Se evaluează dialogul ca produs. Nu se acceptă replici dintr-un singur cuvânt.',
      subCriteria: [
        { id: 'lexic', title: { ru: 'Лексика', ro: 'Lexic' }, maxPoints: 2, rule: 'Lexic variat care corespunde temei (minimum 4-5 cuvinte).', skillTag: 'dialog' },
        { id: 'replici', title: { ru: 'Реплики', ro: 'Replici' }, maxPoints: 4, rule: '4 p. pentru 6 replici; 3 p. pentru 5 replici.', skillTag: 'dialog' },
      ],
    },
    {
      id: 'sb26-9', order: 9, type: 'open', maxPoints: 5,
      prompt: 'Scrie, în numele colegilor, o felicitare adresată Crinei Mogorean din Chișinău cu ocazia obținerii medaliei de bronz la Olimpiada Internațională de Chimie. Utilizează urări deosebite. Respectă rigorile de aranjare a textului în pagină.',
      baremRule: 'Se punctează pe sub-criterii (vezi mai jos).',
      subCriteria: [
        { id: 'adresare', title: { ru: 'Обращение и концовка', ro: 'Adresare + încheiere' }, maxPoints: 1, rule: '1 p. pentru formula de adresare + cea de încheiere (dacă doar una → 0 p.).', skillTag: 'felicitare' },
        { id: 'ocazie', title: { ru: 'Повод', ro: 'Ocazia' }, maxPoints: 1, rule: '1 p. pentru indicarea ocaziei.', skillTag: 'felicitare' },
        { id: 'urare', title: { ru: 'Пожелание', ro: 'Urare' }, maxPoints: 2, rule: '2 p. pentru o urare deosebită; 1 p. pentru una simplă.', skillTag: 'felicitare' },
        { id: 'asezare', title: { ru: 'Оформление', ro: 'Așezare în pagină' }, maxPoints: 1, rule: '1 p. pentru așezarea corectă a textului în pagină.', skillTag: 'felicitare' },
      ],
    },
    {
      id: 'sb26-10', order: 10, type: 'open', maxPoints: 9,
      prompt: 'Scrie, în opt enunțuri, un eseu, pornind de la afirmația lui Nicolae Labiș: „Învățătura este o comoară pe care nimeni nu ți-o poate lua". Explică ce înseamnă pentru tine învățătura/cunoștințele; argumentează cu un exemplu din literatura română (Nicolae Dabija, „Rege între filozofi, filozof între regi") sau din viață; formulează o concluzie.',
      baremRule: 'Se punctează pe sub-criterii (vezi mai jos).',
      subCriteria: [
        { id: 'repere', title: { ru: 'Соблюдение опор', ro: 'Respectarea reperelor' }, maxPoints: 3, rule: 'Respectarea celor trei repere date.', skillTag: 'eseu-repere' },
        { id: 'coerenta', title: { ru: 'Связность', ro: 'Coerență' }, maxPoints: 2, rule: '2 p. coerență deplină; 1 p. parțială; 0 p. lipsă.', skillTag: 'eseu-coerenta' },
        { id: 'volum', title: { ru: 'Объём', ro: 'Volum' }, maxPoints: 4, rule: '4 p. pentru 8 enunțuri; 3 p. pentru 6-7 enunțuri.', skillTag: 'eseu-volum' },
      ],
    },
    {
      id: 'sb26-11', order: 11, type: 'correctness', maxPoints: 7, skillTag: 'corectitudine',
      prompt: 'Corectitudinea exprimării în întreaga lucrare.',
      baremRule: '7 p. pentru 0-3 greșeli; 6 p. pentru 4-7; 5 p. pentru 8-11; 4 p. pentru 12-15; 3 p. pentru 16-19; 2 p. pentru 20-23; 1 p. pentru 24-27. Estimare cu încredere redusă.',
    },
  ],
}
