import type { Flashcard } from "./types";

export type Rating = "again" | "hard" | "good" | "easy";

const QUALITY: Record<Rating, number> = { again: 0, hard: 3, good: 4, easy: 5 };

const DAY = 24 * 60 * 60 * 1000;

export function newCardSM2(now = Date.now()): Flashcard["sm2"] {
  return { easiness: 2.5, interval: 0, repetitions: 0, dueAt: now };
}

export function rate(card: Flashcard, rating: Rating, now = Date.now()): Flashcard {
  const q = QUALITY[rating];
  let { easiness, interval, repetitions } = card.sm2;

  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easiness);
    repetitions += 1;
  }

  easiness = Math.max(1.3, easiness + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  return {
    ...card,
    sm2: {
      easiness,
      interval,
      repetitions,
      dueAt: now + interval * DAY,
      lastReviewedAt: now,
    },
  };
}

export function dueCards(cards: Flashcard[], now = Date.now()) {
  return cards
    .filter((c) => c.sm2.dueAt <= now)
    .sort((a, b) => a.sm2.dueAt - b.sm2.dueAt);
}

export function queuePreview(cards: Flashcard[], after: number, limit = 2, now = Date.now()) {
  return cards
    .filter((c) => c.sm2.dueAt > after && c.sm2.dueAt <= now + 3 * DAY)
    .sort((a, b) => a.sm2.dueAt - b.sm2.dueAt)
    .slice(0, limit);
}
