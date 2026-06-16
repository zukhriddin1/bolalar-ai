/**
 * Ordered schema migrations. Append only — never edit a migration that has
 * already shipped, add a new one instead.
 */
export const MIGRATIONS: string[] = [
  // 1: users, lessons, questions, review cards, attempts
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    age           INTEGER NOT NULL CHECK (age BETWEEN 5 AND 16),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE lessons (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic        TEXT    NOT NULL,
    subject      TEXT    NOT NULL,
    difficulty   INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
    title        TEXT    NOT NULL,
    explanation  TEXT    NOT NULL,
    example      TEXT    NOT NULL,
    generated_by TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_lessons_user ON lessons(user_id, created_at DESC);

  CREATE TABLE questions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id     INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    prompt        TEXT    NOT NULL,
    choices_json  TEXT    NOT NULL,
    answer_index  INTEGER NOT NULL,
    explanation   TEXT    NOT NULL,
    UNIQUE (lesson_id, position)
  );

  CREATE TABLE cards (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id    INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    repetitions    INTEGER NOT NULL DEFAULT 0,
    interval_days  INTEGER NOT NULL DEFAULT 0,
    ease_factor    REAL    NOT NULL DEFAULT 2.5,
    due_at         TEXT    NOT NULL,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, question_id)
  );
  CREATE INDEX idx_cards_due ON cards(user_id, due_at);

  CREATE TABLE attempts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id    INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    chosen_index   INTEGER NOT NULL,
    correct        INTEGER NOT NULL CHECK (correct IN (0, 1)),
    seconds_taken  REAL,
    hint_used      INTEGER NOT NULL DEFAULT 0 CHECK (hint_used IN (0, 1)),
    quality        INTEGER NOT NULL,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_attempts_user ON attempts(user_id, created_at DESC);
  `,
];
