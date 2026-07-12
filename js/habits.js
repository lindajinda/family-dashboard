/* =============================================================================
   habits.js — completion, streaks, history.

   The one subtlety: a gap only breaks a streak on a day the habit was actually
   DUE. "Exercise" set to weekdays must not have its streak destroyed every
   Saturday. Each habit carries a 7-bit day mask (bit 0 = Sunday) so the
   calculation knows which days count.

   Today is also special: a habit due today but not yet done does not break the
   streak — the day is not over. It simply does not extend it.
   ============================================================================= */

const Habits = (() => {
  'use strict';

  const EVERY_DAY = 127;

  function isDue(habit, date) {
    const mask = habit.days === undefined ? EVERY_DAY : habit.days;
    return (mask & (1 << Store.dayOfWeek(date))) !== 0;
  }

  function isDone(habitId, date) {
    return Store.raw.habitLog.some(e => e.habitId === habitId && e.date === date && !e.deleted);
  }

  function toggle(habitId, date) {
    const log = Store.raw.habitLog;
    const existing = log.find(e => e.habitId === habitId && e.date === date);

    if (existing && !existing.deleted) {
      existing.deleted = true;
      existing.updatedAt = Store.nowIso();
      Store.save();
      return false;
    }

    if (existing) {                       // revive rather than duplicate
      existing.deleted = false;
      existing.updatedAt = Store.nowIso();
    } else {
      log.push({
        id: Store.uid(),
        habitId, date,
        createdAt: Store.nowIso(),
        updatedAt: Store.nowIso(),
        deleted: false
      });
    }

    Store.save();

    const habit = Store.habit(habitId);
    Store.recordCompletion({
      kind: 'habit',
      childId: habit.childId,
      title: habit.name,
      category: 'Daily habit',
      date
    });

    return true;
  }

  /** @returns {{current:number, longest:number, done:number, rate:number}} */
  function stats(habit, today) {
    const done = new Set(
      Store.raw.habitLog
        .filter(e => e.habitId === habit.id && !e.deleted)
        .map(e => e.date)
    );

    // ---- current streak: walk backwards until a day that was due and missed ----
    let current = 0;
    let cursor = today;

    // still due today and not done yet? the day isn't over — don't count it as a miss
    if (isDue(habit, cursor) && !done.has(cursor)) cursor = Store.addDays(cursor, -1);

    for (let i = 0; i < 3000; i++) {
      if (!isDue(habit, cursor)) { cursor = Store.addDays(cursor, -1); continue; }
      if (!done.has(cursor)) break;
      current++;
      cursor = Store.addDays(cursor, -1);
    }

    // ---- longest streak + completion rate over the habit's whole life ----
    let longest = 0, run = 0, dueCount = 0;
    const first = done.size
      ? [...done].sort()[0]
      : Store.toKey(new Date(habit.createdAt));

    for (let d = first, i = 0; d <= today && i < 3000; d = Store.addDays(d, 1), i++) {
      if (!isDue(habit, d)) continue;
      dueCount++;
      if (done.has(d)) {
        run++;
        if (run > longest) longest = run;
      } else if (d !== today) {
        run = 0;
      }
    }

    const rate = dueCount === 0 ? 0 : Math.round((done.size / dueCount) * 100);
    return { current, longest, done: done.size, rate };
  }

  function history(habit, days, today) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = Store.addDays(today, -i);
      out.push({ date: d, due: isDue(habit, d), done: isDone(habit.id, d) });
    }
    return out;
  }

  return { EVERY_DAY, isDue, isDone, toggle, stats, history };
})();
