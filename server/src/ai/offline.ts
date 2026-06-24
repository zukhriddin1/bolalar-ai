import type { Topic } from "./curriculum.js";
import type { GeneratedLesson, GeneratedQuestion } from "./schemas.js";

/**
 * Deterministic lesson generator used when no LLM key is configured.
 *
 * For arithmetic topics the questions are *computed*, not sampled from a list,
 * so difficulty genuinely scales and the answers are correct by construction.
 * For language and science topics it draws from a curated bank — inventing
 * facts for children is exactly the failure mode this project should avoid.
 */
export class OfflineLessonGenerator {
  readonly name = "offline-generator";

  async generate(topic: Topic, difficulty: number, seed: number): Promise<GeneratedLesson> {
    const rng = mulberry32(seed);

    switch (topic.slug) {
      case "qoshish":
        return arithmetic(topic, difficulty, rng, "+");
      case "ayirish":
        return arithmetic(topic, difficulty, rng, "-");
      case "kopaytirish":
        return arithmetic(topic, difficulty, rng, "×");
      default:
        return fromBank(topic, difficulty, rng);
    }
  }
}

type Rng = () => number;

function arithmetic(
  topic: Topic,
  difficulty: number,
  rng: Rng,
  op: "+" | "-" | "×",
): GeneratedLesson {
  const max = op === "×" ? Math.min(10, difficulty + 3) : difficulty * 10;
  const questions: GeneratedQuestion[] = [];

  while (questions.length < 4) {
    let a = 1 + Math.floor(rng() * max);
    const b = 1 + Math.floor(rng() * max);
    if (op === "-" && b > a) a = a + b; // keep the result non-negative

    const answer = op === "+" ? a + b : op === "-" ? a - b : a * b;
    const prompt = `${a} ${op} ${b} = ?`;
    if (questions.some((q) => q.prompt === prompt)) continue;

    questions.push({
      prompt,
      choices: shuffle(withDistractors(answer, rng), rng).map(String),
      answerIndex: 0, // fixed immediately below
      explanation: `${a} ${op} ${b} = ${answer}.`,
    });

    const last = questions[questions.length - 1]!;
    last.answerIndex = last.choices.indexOf(String(answer));
  }

  const EXPLANATIONS = {
    "+": "Qo'shish — bu ikkita sonni birlashtirish. Katta sondan boshla va ikkinchi sonni " +
      "qadam-baqadam ustiga qo'sh.",
    "-": "Ayirish — bu sondan bir qismini olib tashlash. Katta sondan boshla va kichik sonni " +
      "qadam-baqadam orqaga sana.",
    "×": "Ko'paytirish — bu bir xil sonni bir necha marta qo'shish. 3 × 4 degani — 4 ni uch " +
      "marta qo'shamiz: 4 + 4 + 4 = 12.",
  } as const;

  return {
    title: `${topic.label} — ${difficulty}-daraja`,
    explanation:
      `${EXPLANATIONS[op]} Barmoqlaringni yoki chizmani ishlatishing mumkin — bu uyat emas, ` +
      `bu o'rganishning bir qismi.`,
    example: `Masalan: ${Math.min(4, max)} ${op} 2 = ${
      op === "+" ? Math.min(4, max) + 2 : op === "-" ? Math.min(4, max) - 2 : Math.min(4, max) * 2
    }.`,
    questions,
  };
}

/** Plausible wrong answers: off-by-one and off-by-ten beat random numbers. */
function withDistractors(answer: number, rng: Rng): number[] {
  const candidates = new Set<number>([answer]);
  const offsets = [1, -1, 2, -2, 10, -10];

  while (candidates.size < 4) {
    const offset = offsets[Math.floor(rng() * offsets.length)]!;
    const candidate = answer + offset;
    if (candidate >= 0) candidates.add(candidate);
    else candidates.add(answer + Math.abs(offset));
  }

  return [...candidates];
}

interface BankEntry {
  title: string;
  explanation: string;
  example: string;
  questions: GeneratedQuestion[];
}

const BANK: Record<string, BankEntry> = {
  kasrlar: {
    title: "Kasrlar bilan tanishuv",
    explanation:
      "Kasr — bu butunning bo'lagi. 1/2 degani butunni ikkiga bo'lib, bitta bo'lagini olish. " +
      "Pastdagi son (maxraj) nechta teng bo'lakka bo'lganimizni, yuqoridagi son (surat) esa " +
      "nechtasini olganimizni ko'rsatadi.",
    example: "Pitsani 4 ga bo'lsang, 1 bo'lagi 1/4 bo'ladi. 2 bo'lagi esa 2/4 yoki 1/2.",
    questions: [
      {
        prompt: "Qaysi kasr kattaroq: 1/2 yoki 1/4?",
        choices: ["1/2", "1/4", "Teng", "Aniqlab bo'lmaydi"],
        answerIndex: 0,
        explanation: "Bo'laklar soni ko'paysa, har bir bo'lak kichrayadi. 1/2 > 1/4.",
      },
      {
        prompt: "2/4 kasri qaysi kasrga teng?",
        choices: ["1/2", "1/4", "3/4", "2/3"],
        answerIndex: 0,
        explanation: "Surat va maxrajni 2 ga bo'lsak: 2/4 = 1/2.",
      },
      {
        prompt: "Butunni 8 ta teng bo'lakka bo'ldik. Bitta bo'lak qanday yoziladi?",
        choices: ["1/8", "8/1", "1/4", "8/8"],
        answerIndex: 0,
        explanation: "8 ta bo'lakdan bittasi — 1/8.",
      },
    ],
  },
  "unli-tovushlar": {
    title: "Unli tovushlar",
    explanation:
      "O'zbek alifbosida 6 ta unli tovush bor: a, e, i, o, u, o'. Unli tovushlarni aytganda " +
      "havo og'zimizdan to'siqsiz chiqadi. Undosh tovushlarda esa til, tish yoki lab to'siq qiladi.",
    example: "«ona» so'zida 2 ta unli bor: o va a.",
    questions: [
      {
        prompt: "O'zbek tilida nechta unli tovush bor?",
        choices: ["6", "5", "8", "10"],
        answerIndex: 0,
        explanation: "a, e, i, o, u, o' — jami 6 ta.",
      },
      {
        prompt: "Qaysi harf unli tovush emas?",
        choices: ["k", "a", "u", "i"],
        answerIndex: 0,
        explanation: "«k» — undosh tovush, uni aytganda til to'siq qiladi.",
      },
      {
        prompt: "«bola» so'zida nechta unli tovush bor?",
        choices: ["2", "1", "3", "4"],
        answerIndex: 0,
        explanation: "b-O-l-A: o va a — 2 ta unli.",
      },
    ],
  },
  sinonimlar: {
    title: "Sinonimlar",
    explanation:
      "Sinonimlar — ma'nosi bir-biriga yaqin so'zlar. Ular nutqni chiroyli qiladi va " +
      "bir so'zni takrorlashdan saqlaydi.",
    example: "«chiroyli» va «go'zal» — sinonimlar. Ikkalasi ham bir xil ma'noni beradi.",
    questions: [
      {
        prompt: "«Katta» so'zining sinonimi qaysi?",
        choices: ["Ulkan", "Kichik", "Qisqa", "Tor"],
        answerIndex: 0,
        explanation: "«Ulkan» ham «katta» ma'nosini beradi.",
      },
      {
        prompt: "«Tez» so'ziga sinonim toping.",
        choices: ["Chaqqon", "Sekin", "Og'ir", "Uzoq"],
        answerIndex: 0,
        explanation: "«Chaqqon» — tez harakat qiluvchi degani.",
      },
      {
        prompt: "Qaysi juftlik sinonim EMAS?",
        choices: ["Issiq — sovuq", "Xursand — shod", "Aqlli — zukko", "Kuchli — bardam"],
        answerIndex: 0,
        explanation: "«Issiq» va «sovuq» — antonimlar, ya'ni qarama-qarshi so'zlar.",
      },
    ],
  },
  sayyoralar: {
    title: "Quyosh sistemasidagi sayyoralar",
    explanation:
      "Quyosh sistemasida 8 ta sayyora bor: Merkuriy, Venera, Yer, Mars, Yupiter, Saturn, " +
      "Uran va Neptun. Ular Quyosh atrofida aylanadi. Quyoshga eng yaqini — Merkuriy.",
    example: "Yer — Quyoshdan uchinchi sayyora va bizga ma'lum yagona hayot bor sayyora.",
    questions: [
      {
        prompt: "Quyosh sistemasida nechta sayyora bor?",
        choices: ["8", "9", "7", "12"],
        answerIndex: 0,
        explanation: "2006-yildan beri Pluton mitti sayyora hisoblanadi, shuning uchun 8 ta.",
      },
      {
        prompt: "Eng katta sayyora qaysi?",
        choices: ["Yupiter", "Saturn", "Yer", "Mars"],
        answerIndex: 0,
        explanation: "Yupiter — eng katta sayyora, u Yerdan ancha yirik.",
      },
      {
        prompt: "Yer Quyoshdan nechanchi sayyora?",
        choices: ["Uchinchi", "Birinchi", "Ikkinchi", "To'rtinchi"],
        answerIndex: 0,
        explanation: "Merkuriy, Venera, keyin Yer — uchinchi.",
      },
    ],
  },
  "suv-aylanishi": {
    title: "Suvning tabiatdagi aylanishi",
    explanation:
      "Quyosh suvni qizdiradi, suv bug'ga aylanib yuqoriga ko'tariladi (bug'lanish). " +
      "Yuqorida sovib, bulut hosil qiladi (kondensatsiya). Keyin yomg'ir yoki qor bo'lib " +
      "yerga tushadi. Bu aylanish to'xtovsiz takrorlanadi.",
    example: "Choynakdagi suv qaynaganda chiqadigan bug' — bu bug'lanishning kichik namunasi.",
    questions: [
      {
        prompt: "Suv bug'ga aylanish jarayoni qanday ataladi?",
        choices: ["Bug'lanish", "Muzlash", "Erish", "Yog'ish"],
        answerIndex: 0,
        explanation: "Suyuq suvning gazga aylanishi — bug'lanish.",
      },
      {
        prompt: "Bulut nimadan hosil bo'ladi?",
        choices: ["Sovigan suv bug'idan", "Changdan", "Havodan", "Shamoldan"],
        answerIndex: 0,
        explanation: "Yuqorida sovigan bug' mayda tomchilarga aylanadi — bu bulut.",
      },
      {
        prompt: "Suvni bug'lantirishga nima energiya beradi?",
        choices: ["Quyosh", "Oy", "Shamol", "Yulduzlar"],
        answerIndex: 0,
        explanation: "Quyosh issiqligi suvni qizdiradi va bug'lantiradi.",
      },
    ],
  },
};

function fromBank(topic: Topic, difficulty: number, rng: Rng): GeneratedLesson {
  const entry = BANK[topic.slug];

  if (!entry) {
    return {
      title: topic.label,
      explanation: `${topic.label} mavzusi bo'yicha dars hozircha tayyorlanmoqda.`,
      example: "Tez orada qo'shamiz.",
      questions: [
        {
          prompt: `${topic.label} mavzusi qaysi fanga tegishli?`,
          choices: [topic.subject, "sport", "musiqa", "rasm"],
          answerIndex: 0,
          explanation: `Bu mavzu ${topic.subject} faniga tegishli.`,
        },
        {
          prompt: "Yangi mavzuni o'rganishda birinchi qadam nima?",
          choices: ["Diqqat bilan o'qish", "Tezda tashlab qo'yish", "Boshqa o'ynash", "Uxlash"],
          answerIndex: 0,
          explanation: "Avval diqqat bilan o'qib, keyin mashq qilamiz.",
        },
      ],
    };
  }

  // Shuffle the choices so a child cannot learn "the answer is always first",
  // and keep answerIndex pointing at the same string after the shuffle.
  const questions = entry.questions.map((question) => {
    const correct = question.choices[question.answerIndex]!;
    const choices = shuffle([...question.choices], rng);
    return { ...question, choices, answerIndex: choices.indexOf(correct) };
  });

  const count = Math.min(questions.length, Math.max(2, difficulty));
  return { ...entry, questions: questions.slice(0, count) };
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Small, fast, seedable PRNG so generated lessons are reproducible in tests. */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
