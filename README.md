# Family Dashboard

Curriculum, habits, assignments and a lifelong educational portfolio for
**Amaru, Keanu and Ender**.

A desktop web app. No installation, no build step, no server, no cost.

---

## Try it

Double-click `index.html`. That's it — it runs in your browser.

Once it's on GitHub Pages it will also live at a URL you can open on any of your
computers.

## Run the tests

```
node tests/run.js
```

18 tests covering the logic that matters: rescheduling, streaks, and the portfolio.

---

## How it's built, and why

**No framework, no build step, no npm.** Plain HTML, CSS and JavaScript loaded with
`<script>` tags. This is a deliberate choice: a build pipeline is the thing that rots.
In five years, `npm install` on an old project usually fails. This will still just open.

**Your data is a single JSON document.** Children, subjects, lessons, habits, tasks and
the entire portfolio. A family's whole educational history is a few megabytes even after
many years, so there is no reason for a database. One document is trivial to back up,
inspect and restore — there's a **Download backup** button in Settings.

**Nothing is ever hard-deleted.** Deleting sets a flag. Two reasons: a hard delete can't
sync (the other computer can't tell "deleted" from "not seen yet", so the record comes
back from the dead), and the portfolio requirement says completion history must be
permanent. Archiving a subject years from now cannot erase what a child already did.

**The portfolio stores names, not just IDs.** A completed lesson records the subject
*name* at the time. So renaming or deleting "Chemistry" in 2029 cannot corrupt the record
of the chemistry a child finished in 2026.

---

## The rescheduling rule

This is the heart of the app, straight from the spec:

> Monday — Chapter 1, Tuesday — Chapter 2, Wednesday — Chapter 3.
> If Monday is not completed: Tuesday becomes Chapter 1, Wednesday becomes Chapter 2,
> Thursday becomes Chapter 3. **Only that curriculum shifts.**

Four things there are easy to get wrong, and all four are enforced by tests:

1. **Only that curriculum moves.** Latin running late does not move Maths.
2. **"One day" means one *school* day.** A Friday lesson slides to Monday, not Saturday.
   Holidays are skipped too.
3. **Sequence is preserved.** Chapters stay in order. The dates move, never the order.
4. **Pinned lessons don't move.** Mark an exam or a co-op class as fixed, and work that
   would land on top of it is pushed past it instead.

Completed work never moves. Neither does anything in the past.

There is also a catch-up sweep on startup: anything left unfinished on a day that has
already gone is dragged forward, one curriculum at a time — so coming back after a week
away doesn't strand work in the past.

---

## Structure

```
index.html          the whole app shell
css/app.css         the entire design system (Windows 11 / Fluent inspired)
js/store.js         data layer: records, soft deletes, persistence
js/scheduler.js     the rescheduling rule
js/habits.js        completion, streaks, history
js/seed.js          first-run content (all of it editable, none hard-coded)
js/pages.js         every screen
js/app.js           navigation, modal, CSV export
tests/run.js        18 tests, no dependencies
docs/               user guide and technical notes
```

## Status

Working now: **Home dashboard · Daily schedule · Habits · Subjects · Tasks · Portfolio ·
Settings**, with backup and restore.

Still to come: automatic GitHub sync, the weekly drag-and-drop planner, charts, and
PDF/Excel reports. See `CHANGELOG.md`.

## Licence

MIT — see `LICENSE`.
