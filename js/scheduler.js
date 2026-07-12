/* =============================================================================
   scheduler.js — automatic lesson rescheduling.

   The rule, from the spec:

       Monday    Chapter 1
       Tuesday   Chapter 2
       Wednesday Chapter 3

       If Monday is not completed:

       Tuesday   Chapter 1
       Wednesday Chapter 2
       Thursday  Chapter 3

       Only that curriculum shifts. Other subjects remain unchanged.

   Four things are easy to get wrong here, so they are all handled explicitly:

   1. ONLY ONE CURRICULUM MOVES. Latin running late does not move Maths. This
      function therefore takes a single curriculum and can only ever touch it.

   2. "ONE DAY" MEANS ONE SCHOOL DAY. A Friday lesson slides to Monday, not to
      Saturday. Holidays are skipped too.

   3. SEQUENCE IS PRESERVED. Chapters stay in order 1, 2, 3 — we move the dates,
      never the order.

   4. COMPLETED WORK NEVER MOVES, and neither does anything before the trigger
      date. History is fixed.

   Lessons can also be PINNED (pinned: true) — an exam, a co-op class, a booked
   lab. Those never move, and work that would land on top of one is pushed past it.
   ============================================================================= */

const Scheduler = (() => {
  'use strict';

  /**
   * Slide an unfinished curriculum forward one school day.
   * @returns {{moved: number, from: string, to: string, title: string}|null}
   */
  function shiftCurriculum(curriculumId, fromDate) {
    const seq = Store.sequence(curriculumId)
      .filter(l => !l.done && !l.hidden && l.date && l.date >= fromDate);

    if (seq.length === 0) return null;

    const pinnedDates = new Set(seq.filter(l => l.pinned).map(l => l.date));
    const movers = seq.filter(l => !l.pinned);

    // Walk the tail BACKWARDS. Moving the last lesson first means an earlier one
    // can never briefly collide with a later one that has not moved yet.
    const moves = [];
    for (let i = movers.length - 1; i >= 0; i--) {
      const lesson = movers[i];
      const from = lesson.date;

      let to = Store.nextSchoolDay(from);
      while (pinnedDates.has(to)) to = Store.nextSchoolDay(to);

      Store.update('lessons', lesson.id, { date: to });
      moves.push({ id: lesson.id, title: lesson.title, from, to });
    }

    moves.reverse();
    const first = moves.find(m => m.from === fromDate) || moves[0];

    return {
      moved: moves.length,
      from: first.from,
      to: first.to,
      title: first.title
    };
  }

  /**
   * Lay a curriculum's lessons out from a start date, one per school day.
   * Used when a subject is first created or lessons are added in bulk.
   */
  function layOut(curriculumId, startDate) {
    const seq = Store.sequence(curriculumId);
    let cursor = Store.isSchoolDay(startDate) ? startDate : Store.nextSchoolDay(startDate);

    seq.forEach(lesson => {
      if (lesson.pinned && lesson.date) return;   // pinned lessons keep their date
      Store.update('lessons', lesson.id, { date: cursor });
      cursor = Store.nextSchoolDay(cursor);
    });
  }

  /**
   * Catch-up sweep. Any lesson still incomplete on a day that has already passed
   * is dragged forward, curriculum by curriculum, so opening the app after a
   * week away does not show a wall of "overdue" work stranded in the past.
   *
   * Each curriculum is shifted independently — which is exactly rule 1.
   */
  function rollForwardOverdue(uptoDate) {
    const results = [];

    Store.curricula().forEach(cur => {
      let guard = 0;
      for (;;) {
        const stale = Store.sequence(cur.id)
          .filter(l => !l.done && !l.hidden && l.date && l.date < uptoDate);

        if (stale.length === 0 || guard++ > 400) break;

        const oldest = stale.reduce((a, b) => (a.date < b.date ? a : b));
        const r = shiftCurriculum(cur.id, oldest.date);
        if (!r) break;
        results.push(r);
      }
    });

    return results;
  }

  return { shiftCurriculum, layOut, rollForwardOverdue };
})();
