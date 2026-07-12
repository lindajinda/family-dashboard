/* =============================================================================
   import.js — turning a pasted list or a CSV file into lessons.

   The parent should be able to paste whatever they already have — a chapter list
   from a textbook's contents page, a syllabus, a column copied out of Excel — and
   have it just work. So the parser is deliberately forgiving:

     Chapter 1: Cells                      -> title only
     Chapter 1: Cells | 45                 -> title + minutes
     Chapter 1: Cells | 45 | Read pp.1-20  -> title + minutes + notes
     Chapter 1: Cells, 45, Read pp.1-20    -> commas work too (CSV paste)

   Blank lines are ignored. A header row (title, minutes, ...) is detected and
   skipped, so pasting straight out of a spreadsheet works.

   Numbering that people naturally leave in ("1. Cells", "1) Cells") is KEPT in the
   title — stripping it would be presumptuous, and "Chapter 1" is a title people
   want to see.
   ============================================================================= */

const Importer = (() => {
  'use strict';

  const DEFAULT_MINUTES = 45;

  /** Split a line on | or tab or comma — whichever it actually uses. */
  function splitLine(line) {
    if (line.includes('|')) return line.split('|');
    if (line.includes('\t')) return line.split('\t');

    // Only treat commas as separators if the LAST field looks like a number or the
    // line has 2-3 fields. Otherwise "Cells, tissues and organs" would be mangled
    // into three lessons' worth of columns.
    const parts = line.split(',');
    if (parts.length >= 2 && /^\s*\d+\s*$/.test(parts[1])) return parts;

    return [line];
  }

  function looksLikeHeader(line) {
    const t = line.toLowerCase();
    return /^\s*(title|lesson|name|chapter)\b/.test(t) &&
           /(minute|duration|length|notes|time)/.test(t);
  }

  /**
   * @param {string} text
   * @returns {{lessons: Array<{title:string,minutes:number,notes:string}>, skipped:number}}
   */
  function parse(text) {
    const lessons = [];
    let skipped = 0;

    String(text || '').split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (!line) return;
      if (i === 0 && looksLikeHeader(line)) return;

      const parts = splitLine(line).map(s => s.trim());
      const title = parts[0];
      if (!title) { skipped++; return; }

      let minutes = DEFAULT_MINUTES;
      if (parts[1] !== undefined && parts[1] !== '') {
        const n = parseInt(parts[1], 10);
        if (!Number.isNaN(n) && n > 0 && n < 1000) minutes = n;
      }

      const notes = parts.slice(2).join(' ').trim();

      lessons.push({ title, minutes, notes });
    });

    return { lessons, skipped };
  }

  /**
   * Write parsed lessons into a curriculum and lay them out across school days.
   *
   * @param curriculumId
   * @param lessons     from parse()
   * @param startDate   first school day to place them on
   * @param mode        'replace' wipes the existing (incomplete) lessons first,
   *                    'append' adds them after whatever is already there.
   *
   * Completed lessons are NEVER removed, even on 'replace' — that history is
   * permanent, and it is also already recorded in the portfolio.
   */
  function apply(curriculumId, lessons, startDate, mode) {
    const existing = Store.sequence(curriculumId);

    if (mode === 'replace') {
      existing.filter(l => !l.done).forEach(l => Store.remove('lessons', l.id));
    }

    const kept = Store.sequence(curriculumId);
    let seq = kept.length ? Math.max(...kept.map(l => l.seq)) + 1 : 1;

    lessons.forEach(l => {
      Store.add('lessons', {
        curriculumId,
        seq: seq++,
        title: l.title,
        notes: l.notes || '',
        minutes: l.minutes || DEFAULT_MINUTES,
        date: null,
        done: false,
        hidden: false,
        pinned: false,
        priority: 'normal'
      });
    });

    // Lay out everything that is not done, from the start date, one per school day.
    // Completed lessons keep the dates they were actually done on.
    layOutIncomplete(curriculumId, startDate);

    return Store.sequence(curriculumId).length;
  }

  function layOutIncomplete(curriculumId, startDate) {
    const seq = Store.sequence(curriculumId).filter(l => !l.hidden);
    let cursor = Store.isSchoolDay(startDate) ? startDate : Store.nextSchoolDay(startDate);

    seq.forEach(lesson => {
      if (lesson.done) return;                              // history is fixed
      if (lesson.pinned && lesson.date) return;             // fixed-date lessons stay
      Store.update('lessons', lesson.id, { date: cursor });
      cursor = Store.nextSchoolDay(cursor);
    });
  }

  return { parse, apply, layOutIncomplete, DEFAULT_MINUTES };
})();
