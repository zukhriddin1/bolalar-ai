/**
 * SM-2 spaced repetition.
 *
 * Adapted from the SuperMemo-2 algorithm. A card carries three pieces of state:
 * `repetitions` (consecutive correct answers), `intervalDays` (when to show it
 * next) and `easeFactor` (how quickly the interval grows for this card).
 *
 * The child-facing UI never shows a 0-5 quality scale, so `gradeFromAnswer`
 * derives one from what we actually observe: whether the answer was correct,
 * how long it took, and whether a hint was used.
 */

export interface ReviewState {
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
}

export interface ReviewOutcome extends ReviewState {
  dueAt: Date;
}

export const MIN_EASE = 1.3;
export const INITIAL_STATE: ReviewState = { repetitions: 0, intervalDays: 0, easeFactor: 2.5 };

/** SM-2 answer quality: 0 = total blackout … 5 = perfect recall. */
export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

export interface AnswerSignals {
  correct: boolean;
  /** Seconds spent on the question. */
  secondsTaken?: number;
  hintUsed?: boolean;
}

export function gradeFromAnswer({ correct, secondsTaken, hintUsed }: AnswerSignals): Quality {
  if (!correct) return hintUsed ? 1 : 0;

  let quality = 5;
  if (hintUsed) quality -= 1;
  // Slow but correct still counts as recall, just a shakier one.
  if (secondsTaken !== undefined && secondsTaken > 20) quality -= 1;
  if (secondsTaken !== undefined && secondsTaken > 45) quality -= 1;

  return Math.max(3, quality) as Quality;
}

/**
 * Applies one review to a card.
 *
 * Quality < 3 resets the schedule: the card is shown again in the same session
 * rather than being pushed days away, which is the behaviour that actually
 * fixes a misconception.
 */
export function review(state: ReviewState, quality: Quality, now = new Date()): ReviewOutcome {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new RangeError(`quality must be an integer 0-5, received ${quality}`);
  }

  const easeFactor = Math.max(
    MIN_EASE,
    state.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  if (quality < 3) {
    return {
      repetitions: 0,
      intervalDays: 0,
      easeFactor,
      // 10 minutes: still inside the same study session.
      dueAt: addMinutes(now, 10),
    };
  }

  const repetitions = state.repetitions + 1;
  const intervalDays =
    repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(state.intervalDays * easeFactor);

  return { repetitions, intervalDays, easeFactor, dueAt: addDays(now, intervalDays) };
}

export function isDue(dueAt: Date | string, now = new Date()): boolean {
  return new Date(dueAt).getTime() <= now.getTime();
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
