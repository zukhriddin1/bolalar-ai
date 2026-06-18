import { describe, expect, it } from "vitest";

import { INITIAL_STATE, gradeFromAnswer, isDue, review } from "../src/domain/sm2.js";

const NOW = new Date("2026-03-01T09:00:00.000Z");

describe("gradeFromAnswer", () => {
  it("scores a fast, unaided correct answer top marks", () => {
    expect(gradeFromAnswer({ correct: true, secondsTaken: 4 })).toBe(5);
  });

  it("penalises hints and slowness but keeps a correct answer passing", () => {
    expect(gradeFromAnswer({ correct: true, hintUsed: true })).toBe(4);
    expect(gradeFromAnswer({ correct: true, secondsTaken: 30 })).toBe(4);
    expect(gradeFromAnswer({ correct: true, secondsTaken: 60, hintUsed: true })).toBe(3);
  });

  it("never drops a correct answer below the passing grade", () => {
    expect(gradeFromAnswer({ correct: true, secondsTaken: 3599, hintUsed: true })).toBe(3);
  });

  it("distinguishes a wrong guess from a wrong answer after a hint", () => {
    expect(gradeFromAnswer({ correct: false })).toBe(0);
    expect(gradeFromAnswer({ correct: false, hintUsed: true })).toBe(1);
  });
});

describe("review", () => {
  it("schedules the first two successes at 1 and 6 days", () => {
    const first = review(INITIAL_STATE, 5, NOW);
    expect(first.repetitions).toBe(1);
    expect(first.intervalDays).toBe(1);

    const second = review(first, 5, NOW);
    expect(second.repetitions).toBe(2);
    expect(second.intervalDays).toBe(6);
  });

  it("grows the interval by the ease factor from the third success", () => {
    let state = review(INITIAL_STATE, 5, NOW);
    state = review(state, 5, NOW);
    const third = review(state, 5, NOW);

    expect(third.intervalDays).toBe(Math.round(6 * third.easeFactor));
    expect(third.intervalDays).toBeGreaterThan(6);
  });

  it("resets the schedule and re-queues within the session on a lapse", () => {
    let state = review(INITIAL_STATE, 5, NOW);
    state = review(state, 5, NOW);
    const lapse = review(state, 1, NOW);

    expect(lapse.repetitions).toBe(0);
    expect(lapse.intervalDays).toBe(0);
    expect(lapse.dueAt.getTime() - NOW.getTime()).toBe(10 * 60 * 1000);
  });

  it("lowers the ease factor after a poor answer and raises it after a perfect one", () => {
    expect(review(INITIAL_STATE, 0, NOW).easeFactor).toBeLessThan(INITIAL_STATE.easeFactor);
    expect(review(INITIAL_STATE, 5, NOW).easeFactor).toBeGreaterThan(INITIAL_STATE.easeFactor);
  });

  it("never lets the ease factor fall below 1.3", () => {
    let state = INITIAL_STATE;
    for (let i = 0; i < 20; i++) state = review(state, 0, NOW);
    expect(state.easeFactor).toBeCloseTo(1.3, 5);
  });

  it("rejects an out-of-range quality", () => {
    expect(() => review(INITIAL_STATE, 6 as never, NOW)).toThrow(RangeError);
    expect(() => review(INITIAL_STATE, -1 as never, NOW)).toThrow(RangeError);
    expect(() => review(INITIAL_STATE, 2.5 as never, NOW)).toThrow(RangeError);
  });

  it("produces a dueAt that matches the interval", () => {
    const outcome = review({ repetitions: 2, intervalDays: 6, easeFactor: 2.5 }, 4, NOW);
    const days = (outcome.dueAt.getTime() - NOW.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(outcome.intervalDays, 5);
  });
});

describe("isDue", () => {
  it("compares against the supplied clock", () => {
    expect(isDue("2026-02-28T00:00:00.000Z", NOW)).toBe(true);
    expect(isDue("2026-03-02T00:00:00.000Z", NOW)).toBe(false);
  });
});
