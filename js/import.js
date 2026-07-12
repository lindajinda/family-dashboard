/* =============================================================================
   import.js — turning a pasted list or a CSV into lessons.

   ONE LINE = ONE DAY'S ASSIGNMENT in that subject.

   A day is usually more than one thing: a reading, a problem set, and a reading
   from a different book. So everything after the first field becomes a separate
   tickable PART of that day:

       Chapter 3: Cells | Read pp. 20-34 | Problem set 3.1 | Campbell ch. 2
       └── title ──────┘ └───────────── parts ──────────────────────────┘

   A line with no separators is a day with a single part:

       Chapter 1: Introduction        -> one part, "Chapter 1: Introduction"

   Separators: | or a tab (paste from Excel) or a comma. Blank lines are ignored.
   A spreadsheet header row is detected and skipped.

   There is deliberately NO duration column. Durations were guesswork, nobody
   filled them in honestly, and they made the import format harder to remember for
   no real benefit.
   ============================================================================= */

const Importer = (() => {
  'use strict';

  /**
   * Which separator does this paste actually use? Decided ONCE for the whole input,
   * not per line, because a comma is dangerous and needs evidence.
   *
   * "Cells, tissues and organs" is a lesson title, not three assignments. So commas
   * only split when the input really looks like a spreadsheet: either it has a header
   * row, or every line has the same number of commas (which prose never does).
   * Pipes and tabs are unambiguous, so they win outright.
   */
  function detectSeparator(lines) {
    if (lines.some(l => l.includes('|'))) return '|';
    if (lines.some(l => l.includes('\t'))) return '\t';

    if (hasHeader(lines, ',')) return ',';

    const counts = lines.map(l => (l.match(/,/g) || []).length);
    const everyLineHasOne = counts.every(c => c >= 1);
    const allTheSame = new Set(counts).size === 1;

    if (lines.length >= 2 && everyLineHasOne && allTheSame) return ',';

    return null;   // no separator: each line is a one-assignment day
  }

  /**
   * Is the first row a spreadsheet header rather than a real lesson?
   *
   * The trap this guards against: "Chapter 3: Cells | Read pp. 20-34 | Problem set 3.1"
   * contains the words "chapter" and "problem", and a loose check would silently eat it
   * as a header — losing the user's first lesson with no error.
   *
   * So the first cell must be a bare header word with NO digits in it. "Week 1" is
   * content; "Week" alone is a header.
   */
  const HEAD_WORD = /^(title|lesson|name|day|assignment|chapter|week|topic|unit)$/i;
  const GENERIC   = /^(assignment|part|task|notes?|reading|problem|minutes|duration)\s*\d*$/i;

  function hasHeader(lines, sep) {
    if (!lines.length || !sep) return false;

    const fields = lines[0].split(sep).map(s => s.trim()).filter(Boolean);
    if (fields.length < 2) return false;

    const first = fields[0];
    if (/\d/.test(first)) return false;          // "Week 1" is a real lesson
    if (!HEAD_WORD.test(first)) return false;

    return fields.slice(1).some(f => GENERIC.test(f));
  }

  /**
   * @returns {{lessons: Array<{title:string, parts:string[]}>, skipped:number}}
   */
  function parse(text) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);

    const sep = detectSeparator(lines);
    const skipFirst = hasHeader(lines, sep);

    const lessons = [];
    let skipped = 0;

    lines.forEach((line, i) => {
      if (i === 0 && skipFirst) return;

      const fields = (sep ? line.split(sep) : [line])
        .map(s => s.trim())
        .filter(s => s !== '');          // trailing empty CSV columns are not assignments

      if (!fields.length) { skipped++; return; }

      const title = fields[0];
      // Everything after the title is an assignment. A single-field line is a
      // one-assignment day, so a plain chapter list still just works.
      const parts = fields.length > 1 ? fields.slice(1) : [title];

      lessons.push({ title, parts });
    });

    return { lessons, skipped };
  }

  function makeParts(texts) {
    return texts.map(t => ({ id: Store.uid(), text: t, done: false, doneOn: null }));
  }

  /**
   * Write parsed lessons into a curriculum and lay them out across school days.
   *
   * 'replace' wipes the unfinished lessons first. Completed lessons are NEVER
   * removed — that history is permanent, and it is already in the portfolio.
   */
  function apply(curriculumId, lessons, startDate, mode) {
    if (mode === 'replace') {
      Store.sequence(curriculumId)
        .filter(l => !Store.isLessonDone(l))
        .forEach(l => Store.remove('lessons', l.id));
    }

    const kept = Store.sequence(curriculumId);
    let seq = kept.length ? Math.max(...kept.map(l => l.seq)) + 1 : 1;

    lessons.forEach(l => {
      Store.add('lessons', {
        curriculumId,
        seq: seq++,
        title: l.title,
        parts: makeParts(l.parts),
        notes: '',
        minutes: 0,
        date: null,
        done: false,
        hidden: false,
        pinned: false,
        priority: 'normal'
      });
    });

    layOutIncomplete(curriculumId, startDate);
    return Store.sequence(curriculumId).length;
  }

  /** One unfinished lesson per school day, in sequence. Done and pinned stay put. */
  function layOutIncomplete(curriculumId, startDate) {
    const seq = Store.sequence(curriculumId).filter(l => !l.hidden);
    let cursor = Store.isSchoolDay(startDate) ? startDate : Store.nextSchoolDay(startDate);

    seq.forEach(lesson => {
      if (Store.isLessonDone(lesson)) return;               // history is fixed
      if (lesson.pinned && lesson.date) return;             // fixed-date lessons stay
      Store.update('lessons', lesson.id, { date: cursor });
      cursor = Store.nextSchoolDay(cursor);
    });
  }

  return { parse, apply, layOutIncomplete, makeParts };
})();
