/**
 * The built-in curriculum.
 *
 * It serves two purposes: it constrains what the model is asked to teach (an
 * open-ended "teach me anything" prompt for children is a safety problem), and
 * it powers the offline generator so the app is fully usable without a key.
 */

export interface Topic {
  slug: string;
  subject: "matematika" | "ona-tili" | "tabiat";
  /** Uzbek label shown to the child. */
  label: string;
  /** English gloss for the model prompt. */
  english: string;
  minAge: number;
  maxAge: number;
}

export const TOPICS: Topic[] = [
  {
    slug: "qoshish",
    subject: "matematika",
    label: "Qo'shish",
    english: "addition of small whole numbers",
    minAge: 5,
    maxAge: 9,
  },
  {
    slug: "ayirish",
    subject: "matematika",
    label: "Ayirish",
    english: "subtraction of small whole numbers",
    minAge: 6,
    maxAge: 10,
  },
  {
    slug: "kopaytirish",
    subject: "matematika",
    label: "Ko'paytirish",
    english: "multiplication tables up to 10",
    minAge: 7,
    maxAge: 12,
  },
  {
    slug: "kasrlar",
    subject: "matematika",
    label: "Kasrlar",
    english: "simple fractions and comparing them",
    minAge: 9,
    maxAge: 14,
  },
  {
    slug: "unli-tovushlar",
    subject: "ona-tili",
    label: "Unli tovushlar",
    english: "vowel sounds in the Uzbek alphabet",
    minAge: 5,
    maxAge: 9,
  },
  {
    slug: "sinonimlar",
    subject: "ona-tili",
    label: "Sinonimlar",
    english: "synonyms in Uzbek",
    minAge: 8,
    maxAge: 14,
  },
  {
    slug: "sayyoralar",
    subject: "tabiat",
    label: "Sayyoralar",
    english: "the planets of the Solar System",
    minAge: 7,
    maxAge: 14,
  },
  {
    slug: "suv-aylanishi",
    subject: "tabiat",
    label: "Suvning aylanishi",
    english: "the water cycle",
    minAge: 8,
    maxAge: 14,
  },
];

export function findTopic(slug: string): Topic | undefined {
  return TOPICS.find((t) => t.slug === slug);
}

/** Topics appropriate for a child of this age, widened if nothing fits. */
export function topicsForAge(age: number): Topic[] {
  const fitting = TOPICS.filter((t) => age >= t.minAge && age <= t.maxAge);
  return fitting.length > 0 ? fitting : TOPICS;
}

/**
 * Maps age to a 1-5 difficulty band.
 * Kept separate from the topic so the same topic can be taught at two levels.
 */
export function difficultyForAge(age: number, topic: Topic): number {
  const span = Math.max(1, topic.maxAge - topic.minAge);
  const position = (age - topic.minAge) / span;
  return Math.min(5, Math.max(1, Math.round(1 + position * 4)));
}
