# Changelog

## [Unreleased]

Next up, in order:
- Automatic sync (data committed to a private GitHub repo, so every computer agrees)
- Weekly planner with drag-and-drop
- Charts and the statistics dashboard
- PDF and Excel reports; the lifetime portfolio PDF
- Global search

## [0.1.0] - 2026-07-12

First working version. Runs by opening `index.html` — no install, no build step.

### Added
- **Home dashboard** — today's work at a glance, per child and for the whole family:
  completion, hours planned vs completed, overdue count, upcoming deadlines.
- **Daily schedule** — one click to complete. Skip and Move-to-Tomorrow are deliberately
  different actions: Skip means "not doing it, not making it up" and shifts nothing.
- **Automatic rescheduling** — the rule from the spec. Only the affected curriculum
  slides, by one *school* day, preserving chapter order, skipping weekends and holidays,
  and refusing to move lessons pinned to a fixed date.
- **Catch-up sweep** on startup so a week away doesn't strand work in the past.
- **Habits** — unlimited, per child, with per-day-of-week scheduling. A weekend does not
  break the streak of a weekday-only habit.
- **Subjects** — fully dynamic. Add, rename, recolour, reorder, archive, assign to any
  child. No subject is hard-coded anywhere in the app.
- **One-time tasks** with due dates, priority and overdue highlighting.
- **Educational portfolio** — permanent, append-only record of everything completed.
  Stores subject names, not just IDs, so renaming a subject later cannot corrupt history.
- **Backup / restore** to a plain JSON file. CSV export of the portfolio.
- 18 tests (`node tests/run.js`), no dependencies.

### Notes
- Data currently lives in this browser's local storage. GitHub sync is next; the
  Download Backup button covers you until then.
