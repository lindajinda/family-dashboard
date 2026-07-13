/* =============================================================================
   habits.js — completion, streaks, history, and daily plans.

   TWO KINDS OF HABIT
   ------------------
   1. Simple: the same thing every day. "Etiquette." Tick it, done.

   2. Planned: a progression. Exercise, elocution and a skin regimen all have
      DIFFERENT content each day, and the difficulty ramps. So a habit can carry a
      PLAN: an ordered list of days, each with its own tickable assignments —
      exactly like an academic curriculum, and loaded the same way.

   WHY PLANS ADVANCE BY CONSUMPTION, NOT BY DATE
   ---------------------------------------------
   Academic lessons are pinned to dates and slide when missed. A habit plan is not.
   The entry shown today is simply the next one not yet done.

   Miss Tuesday's workout and you do NOT skip Day 12 and land on Day 13 — you resume
   at Day 12. A strength progression that silently drops a session, or a skin regimen
   that jumps a stage, is worse than useless: the whole point is that each day builds
   on the last. Consumption order guarantees no step is ever skipped.

   The streak is a separate question, and it stays date-based: it measures whether
   you turned up, not how far through the plan you are.

   THE STREAK SUBTLETY
   -------------------
   A gap only breaks a streak on a day the habit was actually DUE. "Exercise" set to
   weekdays must not have its streak destroyed every Saturday. A habit due today but
   not yet done also does not break it — the day is not over.
   ============================================================================= */

const Habits = (() => {
  'use strict';

  const EVERY_DAY = 127;

  /* ------------------------------------------------------------------- basics */

  function isDue(habit, date) {
    const mask = habit.days === undefined ? EVERY_DAY : habit.days;
    return (mask & (1 << Store.dayOfWeek(date))) !== 0;
  }

  function isDone(habitId, date) {
    return Store.raw.habitLog.some(e => e.habitId === habitId && e.date === date && !e.deleted);
  }

  /** The single source of truth for "did this habit happen on this day". */
  function setDone(habitId, date, value) {
    const log = Store.raw.habitLog;
    const existing = log.find(e => e.habitId === habitId && e.date === date);

    if (!value) {
      if (existing) {
        existing.deleted = true;
        existing.updatedAt = Store.nowIso();
      }
      Store.save();
      return false;
    }

    if (existing) {
      // Revive rather than insert: a soft-deleted row still owns this (habit, date),
      // and a duplicate would make the streak count the same day twice.
      if (existing.deleted) {
        existing.deleted = false;
        existing.updatedAt = Store.nowIso();
      } else {
        return true;                        // already done; nothing to record
      }
    } else {
      log.push({
        id: Store.uid(), habitId, date,
        createdAt: Store.nowIso(), updatedAt: Store.nowIso(), deleted: false
      });
    }

    const habit = Store.habit(habitId);
    Store.recordCompletion({
      kind: 'habit',
      childId: habit.childId,
      childName: (Store.child(habit.childId) || {}).name || '',
      title: habit.name,
      category: 'Daily habit',
      date
    });

    Store.save();
    return true;
  }

  /** For a simple habit with no plan: one tap, done or not done. */
  function toggle(habitId, date) {
    return setDone(habitId, date, !isDone(habitId, date));
  }

  /* -------------------------------------------------------------------- plans */

  function plan(habit) {
    return (habit.plan || [])
      .filter(e => !e.deleted)
      .sort((a, b) => a.seq - b.seq);
  }

  function hasPlan(habit) {
    return plan(habit).length > 0;
  }

  /**
   * What this habit is asking for today: the first entry not yet done.
   * Null when the plan is finished.
   */
  function currentEntry(habit) {
    return plan(habit).find(e => !e.done) || null;
  }

  /**
   * The entry that a given DATE is showing.
   *
   * Looking back at a past day should show what was actually done that day, not
   * today's next-up entry — otherwise yesterday's page silently rewrites history.
   */
  function entryFor(habit, date) {
    const doneThatDay = plan(habit).find(e => e.done && e.doneOn === date);
    return doneThatDay || currentEntry(habit);
  }

  function progress(habit) {
    const p = plan(habit);
    const done = p.filter(e => e.done).length;
    return { done, total: p.length, current: done + 1 };
  }

  /**
   * Tick one assignment inside a habit's daily plan.
   * When every assignment in the entry is done, the habit counts as done for that day.
   */
  function togglePlanPart(habitId, entryId, partId, date) {
    const habit = Store.habit(habitId);
    if (!habit) return false;

    const entry = plan(habit).find(e => e.id === entryId);
    if (!entry) return false;

    const part = (entry.parts || []).find(p => p.id === partId);
    if (!part) return false;

    part.done = !part.done;
    part.doneOn = part.done ? date : null;

    const wasDone = !!entry.done;
    const allDone = entry.parts.length > 0 && entry.parts.every(p => p.done);

    entry.done = allDone;
    entry.doneOn = allDone ? date : null;

    Store.update('habits', habitId, { plan: habit.plan });

    // The habit's day-level completion (and therefore its streak) follows the entry.
    if (allDone && !wasDone) setDone(habitId, date, true);
    if (!allDone && wasDone) setDone(habitId, date, false);

    return part.done;
  }

  /**
   * Load a plan from a parsed list (same format as an academic curriculum).
   * 'replace' drops the unfinished entries; completed days are NEVER removed, because
   * that is a record of work the child actually did.
   */
  function setPlan(habitId, parsed, mode) {
    const habit = Store.habit(habitId);
    const existing = plan(habit);

    const kept = mode === 'replace' ? existing.filter(e => e.done) : existing;
    let seq = kept.length ? Math.max(...kept.map(e => e.seq)) + 1 : 1;

    const added = parsed.map(l => ({
      id: Store.uid(),
      seq: seq++,
      title: l.title,
      parts: l.parts.map(t => ({ id: Store.uid(), text: t, done: false, doneOn: null })),
      done: false,
      doneOn: null,
      deleted: false
    }));

    Store.update('habits', habitId, { plan: kept.concat(added) });
    return added.length;
  }

  /* ------------------------------------------------------------------ streaks */

  function stats(habit, today) {
    const done = new Set(
      Store.raw.habitLog
        .filter(e => e.habitId === habit.id && !e.deleted)
        .map(e => e.date)
    );

    let current = 0;
    let cursor = today;

    // Still due today and not done? The day isn't over — neither extend nor break.
    if (isDue(habit, cursor) && !done.has(cursor)) cursor = Store.addDays(cursor, -1);

    for (let i = 0; i < 3000; i++) {
      if (!isDue(habit, cursor)) { cursor = Store.addDays(cursor, -1); continue; }
      if (!done.has(cursor)) break;
      current++;
      cursor = Store.addDays(cursor, -1);
    }

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

  return {
    EVERY_DAY, isDue, isDone, toggle, stats, history,
    plan, hasPlan, currentEntry, entryFor, progress, togglePlanPart, setPlan
  };
})();
