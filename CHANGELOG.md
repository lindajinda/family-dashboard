# Changelog

## [0.3.0] - 2026-07-13

### Changed
- **A heavier, more legible typeface, and a switch for it.** The app now uses Verdana at a
  semibold weight by default — drawn for screens, with a tall x-height and wide open letters.
  **Settings → Text** switches typeface (Easier to read / Standard) and weight (Bold / Normal),
  so this is dial-able rather than a decision made once on someone's behalf.
- Only fonts already on the machine are used — never a downloaded one. A web font would stop
  the app looking right the moment it is opened offline or straight from the file, and it is
  one more thing that can rot.
- Bold does not flatten the page: body weight and "stands out from the body" weight move
  together (`--fw` / `--fw-strong`), so headings and subject names stay a step above the text
  around them at every setting.
- **Bigger type everywhere, same tight spacing.** The base font went from 12px to 14px and
  every size in the app moved up with it — nothing is below 12px now. Padding, margins and
  gaps were deliberately left exactly as they were, so pages did not get taller: you still
  see the same day at a glance, just without squinting.
- Assignments on the Today page are now the largest, plainest thing on screen — 16px text, a
  24px tick box, and the whole row is the tap target. The day's schoolwork and "Work ahead"
  had each hand-rolled this same row with their own copy of the styling, which is how they
  had drifted apart; they are now one shared `.part` control.
- Fixed a long-standing drift: `.small` was 13px against a 12px base — *larger* than the body
  text it was meant to shrink. It is now genuinely small.

### Added
- **Kid Mode.** Settings → This device hands a computer or tablet to one child. It then
  shows only Today and Habits, for them alone: no Curriculum, no Settings, no rescheduling,
  no adding habits. They tick their work and it syncs back like any other computer. A
  **🔒 Parent** button in the sidebar leaves again, behind an optional PIN.
- The device's identity is stored **on the device**, never in the synced file — the tablet is
  Keanu's on every computer, and putting that in the shared document would only mean three
  machines fighting over one field.
- **[docs/SHARING.md](docs/SHARING.md)** — how to give another adult full access (invite them
  to the `family-data` repo; they make their own token), how to set up a child's device, and
  how to take access away again.
- 9 more tests (85 total), all about failing *open*: a corrupt or stale device setting must
  never strand a device in a mode it cannot leave.

### Note
Sharing with another adult needed no new code at all. The sync engine already merges edits
from two computers, and a second person turns out to be exactly the same problem.

The PIN is a speed bump, not a lock. It keeps a nine-year-old out of Settings; it would not
stop a determined teenager with the developer tools open, and it does not pretend to.

## [0.2.0] - 2026-07-12

### Added
- **Curriculum page.** Pick a child and a subject, then load the real lesson list:
  paste it, or upload a CSV/text file. Lessons are scheduled across school days
  automatically, weekends and holidays skipped. Shows progress, remaining lessons and
  an estimated finish date per subject.
- Forgiving import parser: plain lines, `Title | minutes | notes`, tab-separated paste
  from Excel, or comma-separated. Spreadsheet header rows are detected and skipped, and
  a comma inside a title ("Cells, tissues and organs") is not mistaken for a column.
- Per-lesson editing: title, notes, date, duration, and a **fixed date** flag for exams
  and co-op classes that must never be moved by rescheduling.
- "Reschedule from a date" — re-lays the whole unfinished sequence from any start date.
- Append or replace on import. **Replace never removes completed lessons** — that history
  is permanent.
- 11 more tests (29 total).

## [0.3.0] - 2026-07-12

### Added
- **Automatic sync between computers.** Your data is committed as JSON to a *private*
  GitHub repository you own. Every computer reads it, merges its own changes, and writes
  back — on every change, when the tab regains focus, and every five minutes. Free, no
  server, and because it is git you get a full version history.
- Set-up walkthrough in Settings, and a live sync status in the sidebar.
- 11 merge tests covering the ways a sync can silently destroy data.
- Multi-part assignments, work-ahead, habit daily plans, per-subject days of the week,
  icon pickers, subject reordering, and a much denser UI (see git log).

## [Unreleased]

Next up, in order:
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
