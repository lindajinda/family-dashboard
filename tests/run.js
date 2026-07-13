/* =============================================================================
   tests/run.js — plain Node, no test framework, no dependencies.

   Run with:  node tests/run.js

   These cover the logic that is easy to get quietly wrong and expensive to get
   wrong: the rescheduling rule and habit streaks. If these pass, the app's brain
   works — the rest is buttons.
   ============================================================================= */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---- minimal browser shims so the app's files can be loaded as-is ---------- */
const memory = {};
const sandbox = {
  localStorage: {
    getItem: k => (k in memory ? memory[k] : null),
    setItem: (k, v) => { memory[k] = String(v); },
    removeItem: k => { delete memory[k]; }
  },
  console,
  Date, Math, JSON, Set, Map, Object, Array, String, Number, Boolean, Error
};
vm.createContext(sandbox);

// The app's files declare their modules with `const`. In a VM context each
// runInContext call gets its own top-level scope, so a `const` in one script is
// invisible to the next — and never lands on the sandbox global. Concatenating
// them into ONE script reproduces exactly what the browser does with a series of
// plain <script> tags, and a trailing line hands the modules back to us.
const read = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');

const bundle = ['seed.js', 'store.js', 'scheduler.js', 'habits.js', 'import.js']
  .map(read).join('\n;\n')
  + '\n;globalThis.__exports = { Store, Scheduler, Habits, Seed, Importer };';

vm.runInContext(bundle, sandbox, { filename: 'app-bundle.js' });

const { Store, Scheduler, Habits, Importer } = sandbox.__exports;

/* ---------------------------------------------------------------- test harness */
let pass = 0, fail = 0;
const failures = [];

function test(name, fn) {
  try { fn(); pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  catch (e) { fail++; failures.push(name); console.log('  \x1b[31m✗ ' + name + '\x1b[0m\n      ' + e.message); }
}
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg || 'not equal'}\n      expected: ${B}\n      actual:   ${A}`);
}
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }

/* ------------------------------------------------------------------ fixtures */

/** A fresh store with one child and two subjects, lessons on given dates. */
function build(lessonDates, subjectName = 'Latin') {
  for (const k in memory) delete memory[k];
  Store.load();
  Store.replaceAll({
    schemaVersion: 1, updatedAt: '', settings: { mode: 'School Year', schoolYear: '2026-2027' },
    children: [], subjects: [], curricula: [], lessons: [], habits: [], habitLog: [],
    tasks: [], portfolio: [], holidays: []
  });

  const child = Store.add('children', { name: 'Amaru', color: '#000', order: 0 });
  const subj = Store.add('subjects', { name: subjectName, icon: '', color: '#111', order: 0, archived: false });
  const cur = Store.add('curricula', { childId: child.id, subjectId: subj.id, schoolYear: '2026-2027' });

  lessonDates.forEach((d, i) => {
    Store.add('lessons', {
      curriculumId: cur.id, seq: i + 1, title: `Chapter ${i + 1}`,
      parts: Importer.makeParts([`Read ${i + 1}`, `Problems ${i + 1}`]),
      date: d, minutes: 0, done: false, hidden: false, pinned: false, priority: 'normal', notes: ''
    });
  });

  return { child, subj, cur };
}

const dates = c => Store.sequence(c.id).map(l => l.date);

/* Mon 2026-09-14 .. Fri 2026-09-18, weekend, Mon 2026-09-21 */
const MON = '2026-09-14', TUE = '2026-09-15', WED = '2026-09-16',
      THU = '2026-09-17', FRI = '2026-09-18', NEXT_MON = '2026-09-21';

/* ============================================================== RESCHEDULING */

console.log('\nAutomatic rescheduling');

test('the spec example: Mon not done -> everything slides one school day', () => {
  const { cur } = build([MON, TUE, WED]);
  Scheduler.shiftCurriculum(cur.id, MON);
  // Chapter 1 -> Tue, Chapter 2 -> Wed, Chapter 3 -> Thu
  eq(dates(cur), [TUE, WED, THU]);
});

test('sequence order is preserved (chapters never reorder)', () => {
  const { cur } = build([MON, TUE, WED]);
  Scheduler.shiftCurriculum(cur.id, MON);
  eq(Store.sequence(cur.id).map(l => l.title), ['Chapter 1', 'Chapter 2', 'Chapter 3']);
});

test('a Friday lesson lands on Monday, not Saturday', () => {
  const { cur } = build([FRI]);
  Scheduler.shiftCurriculum(cur.id, FRI);
  eq(dates(cur), [NEXT_MON]);
});

test('holidays are skipped', () => {
  const { cur } = build([MON]);
  Store.add('holidays', { date: TUE, label: 'Teacher training' });
  Scheduler.shiftCurriculum(cur.id, MON);
  eq(dates(cur), [WED]);
});

test('a fully completed day never moves', () => {
  const { cur } = build([MON, TUE]);
  const first = Store.sequence(cur.id)[0];
  Store.partsOf(first).forEach(p => Store.togglePart(first.id, p.id, MON));
  ok(Store.isLessonDone(Store.lesson(first.id)), 'all parts ticked');

  Scheduler.shiftCurriculum(cur.id, MON);
  eq(dates(cur), [MON, WED]);   // the finished day stays; the other slides
});

test('lessons before the trigger date are untouched', () => {
  const { cur } = build(['2026-09-11', MON]);   // Fri last week, then Mon
  Scheduler.shiftCurriculum(cur.id, MON);
  eq(dates(cur), ['2026-09-11', TUE]);
});

test('a pinned lesson (exam) does not move, and work is pushed past it', () => {
  const { cur } = build([MON, TUE]);
  const exam = Store.sequence(cur.id)[1];
  Store.update('lessons', exam.id, { pinned: true, title: 'EXAM' });

  Scheduler.shiftCurriculum(cur.id, MON);

  const seq = Store.sequence(cur.id);
  eq(seq[1].date, TUE, 'the exam stayed put');
  eq(seq[0].date, WED, 'chapter 1 was pushed past the exam');
});

test('ONLY that curriculum shifts — other subjects do not move', () => {
  // The single most important rule in the whole spec.
  const { child } = build([MON, TUE, WED], 'Latin');
  const latinCur = Store.curricula()[0];

  const maths = Store.add('subjects', { name: 'Maths', icon: '', color: '#222', order: 1, archived: false });
  const mathsCur = Store.add('curricula', { childId: child.id, subjectId: maths.id, schoolYear: '2026-2027' });
  [MON, TUE, WED].forEach((d, i) => Store.add('lessons', {
    curriculumId: mathsCur.id, seq: i + 1, title: `Maths ${i + 1}`, date: d,
    parts: Importer.makeParts([`Maths work ${i + 1}`]),
    minutes: 0, done: false, hidden: false, pinned: false, priority: 'normal'
  }));

  Scheduler.shiftCurriculum(latinCur.id, MON);

  eq(dates(latinCur), [TUE, WED, THU], 'Latin slid');
  eq(dates(mathsCur), [MON, TUE, WED], 'Maths did NOT move');
});

test('rollForwardOverdue drags stranded past work into the future', () => {
  const { cur } = build(['2026-09-07', '2026-09-08']);   // last week, never done
  const moved = Scheduler.rollForwardOverdue(MON);
  ok(moved.length > 0, 'something moved');
  Store.sequence(cur.id).forEach(l => ok(l.date >= MON, `lesson ${l.title} is no longer stranded in the past`));
});

/* =================================================================== STREAKS */

console.log('\nHabit streaks');

const WEEKDAYS = 0b0111110;   // Mon..Fri
const EVERY = 127;

function habitFixture(days) {
  build([MON]);
  const child = Store.children()[0];
  return Store.add('habits', {
    childId: child.id, name: 'Exercise', icon: '', color: '#000',
    days, order: 0, archived: false
  });
}

test('consecutive days build a streak', () => {
  const hb = habitFixture(EVERY);
  [MON, TUE, WED].forEach(d => Habits.toggle(hb.id, d));
  eq(Habits.stats(hb, WED).current, 3);
});

test('a missed day breaks the streak', () => {
  const hb = habitFixture(EVERY);
  [MON, WED, THU].forEach(d => Habits.toggle(hb.id, d));   // Tue missed
  eq(Habits.stats(hb, THU).current, 2);
});

test('THE weekend case: Sat/Sun do not break a weekday-only habit', () => {
  const hb = habitFixture(WEEKDAYS);
  [MON, TUE, WED, THU, FRI, NEXT_MON].forEach(d => Habits.toggle(hb.id, d));
  eq(Habits.stats(hb, NEXT_MON).current, 6);   // not reset to 1 by the weekend
});

test('a habit still due today does not break the streak', () => {
  const hb = habitFixture(EVERY);
  [MON, TUE].forEach(d => Habits.toggle(hb.id, d));
  eq(Habits.stats(hb, WED).current, 2);        // Wed not done yet; day is not over
});

test('toggling off then on again works (children mis-tap)', () => {
  const hb = habitFixture(EVERY);
  Habits.toggle(hb.id, MON);
  Habits.toggle(hb.id, MON);
  Habits.toggle(hb.id, MON);
  ok(Habits.isDone(hb.id, MON), 'habit is done after three taps');
  eq(Habits.stats(hb, MON).current, 1);
});

test('completion rate counts only days the habit was actually due', () => {
  const hb = habitFixture(WEEKDAYS);
  [MON, TUE, WED, THU].forEach(d => Habits.toggle(hb.id, d));   // missed Friday
  eq(Habits.stats(hb, FRI).rate, 80);
});

/* ================================================================= PORTFOLIO */

console.log('\nPortfolio');

test('completing a habit writes a permanent portfolio record', () => {
  const hb = habitFixture(EVERY);
  Habits.toggle(hb.id, MON);
  eq(Store.portfolio().length, 1);
  eq(Store.portfolio()[0].category, 'Daily habit');
});

test('soft-deleted records disappear from lists but portfolio history survives', () => {
  const hb = habitFixture(EVERY);
  Habits.toggle(hb.id, MON);
  Store.remove('habits', hb.id);

  eq(Store.habits().length, 0, 'habit is gone from the list');
  eq(Store.portfolio().length, 1, 'but the completed record is still in the portfolio');
});

/* ===================================================================== dates */

console.log('\nDate handling');

test('today() uses the LOCAL date, not UTC (a classic evening bug)', () => {
  // toISOString() would report tomorrow's date after 7pm in a negative-offset zone
  const d = new Date(2026, 8, 14, 23, 30);   // 14 Sep, 11:30pm local
  eq(Store.toKey(d), '2026-09-14');
});

/* =========================================================== CURRICULUM IMPORT */

console.log('\nCurriculum import');

test('a plain chapter list becomes one-assignment days, in order', () => {
  const { lessons } = Importer.parse('Chapter 1: Cells\nChapter 2: Genetics\nChapter 3: Evolution');
  eq(lessons.length, 3);
  eq(lessons.map(l => l.title), ['Chapter 1: Cells', 'Chapter 2: Genetics', 'Chapter 3: Evolution']);
  eq(lessons[0].parts, ['Chapter 1: Cells'], 'a line with no separators is a one-assignment day');
});

test('pipes split a day into separately tickable assignments', () => {
  const { lessons } = Importer.parse('Chapter 3: Cells | Read pp. 20-34 | Problem set 3.1 | Campbell ch. 2');
  eq(lessons[0].title, 'Chapter 3: Cells');
  eq(lessons[0].parts, ['Read pp. 20-34', 'Problem set 3.1', 'Campbell ch. 2']);
});

test('blank lines are ignored', () => {
  const { lessons } = Importer.parse('One\n\n\nTwo\n   \nThree');
  eq(lessons.length, 3);
});

test('a spreadsheet header row is skipped', () => {
  const { lessons } = Importer.parse('Title, Assignment 1, Assignment 2\nChapter 1, Read pp.1-9, Questions');
  eq(lessons.length, 1);
  eq(lessons[0].title, 'Chapter 1');
  eq(lessons[0].parts, ['Read pp.1-9', 'Questions']);
});

test('tab-separated paste from Excel becomes assignments', () => {
  const { lessons } = Importer.parse('Chapter 1\tRead pp. 1-18\tProblem set 1');
  eq(lessons[0].title, 'Chapter 1');
  eq(lessons[0].parts, ['Read pp. 1-18', 'Problem set 1']);
});

test('a comma INSIDE a title does not get split into assignments', () => {
  // "Cells, tissues and organs" is a lesson title, not three assignments. A comma
  // only splits when the input really looks like a spreadsheet.
  const { lessons } = Importer.parse('Cells, tissues and organs');
  eq(lessons.length, 1);
  eq(lessons[0].title, 'Cells, tissues and organs');
  eq(lessons[0].parts, ['Cells, tissues and organs']);
});

test('a first lesson that mentions "chapter" and "problem" is NOT eaten as a header', () => {
  // The bug this catches: a loose header check saw the words "Chapter" and "Problem"
  // and silently discarded the user's first real lesson, with no error shown.
  const { lessons } = Importer.parse(
    'Chapter 3: Cells | Read pp. 20-34 | Problem set 3.1\nChapter 4: DNA | Read pp. 35-50');
  eq(lessons.length, 2, 'both lessons survived');
  eq(lessons[0].title, 'Chapter 3: Cells');
});

test('empty trailing CSV columns do not become blank checkboxes', () => {
  // A real CSV pads short rows with empty cells. Those must not become empty
  // assignments that can never be ticked off -- the day would then never complete.
  const csv = [
    'Title,Assignment 1,Assignment 2,Assignment 3',
    'Chapter 1,Read pp. 1-18,Questions 1-10,Lab video',
    'Chapter 3: Photosynthesis,Read pp. 41-58,,'
  ].join('\n');

  const { lessons } = Importer.parse(csv);
  eq(lessons.length, 2, 'the header was skipped');
  eq(lessons[1].parts, ['Read pp. 41-58'], 'the two empty cells were dropped');
});

test('imported lessons land on consecutive SCHOOL days', () => {
  const { cur } = build([]);
  const { lessons } = Importer.parse('A\nB\nC\nD\nE');
  Importer.apply(cur.id, lessons, THU, 'append');       // starting Thu 17 Sep

  eq(Store.sequence(cur.id).map(l => l.date),
     [THU, FRI, NEXT_MON, '2026-09-22', '2026-09-23'], 'the weekend was skipped');
});

test('replace wipes unfinished lessons but NEVER completed ones', () => {
  const { cur } = build([MON, TUE]);
  const first = Store.sequence(cur.id)[0];
  Store.update('lessons', first.id, { title: 'ALREADY DONE' });
  Store.partsOf(first).forEach(p => Store.togglePart(first.id, p.id, MON));

  const { lessons } = Importer.parse('New A\nNew B');
  Importer.apply(cur.id, lessons, WED, 'replace');

  const titles = Store.sequence(cur.id).map(l => l.title);
  ok(titles.includes('ALREADY DONE'), 'completed work survived the replace');
  ok(titles.includes('New A') && titles.includes('New B'), 'the new lessons are there');
  ok(!titles.includes('Chapter 2'), 'the unfinished old lesson was replaced');
});

test('append adds after the existing lessons and keeps the numbering going', () => {
  const { cur } = build([MON, TUE]);
  const { lessons } = Importer.parse('Third\nFourth');
  Importer.apply(cur.id, lessons, MON, 'append');

  const seq = Store.sequence(cur.id);
  eq(seq.length, 4);
  eq(seq.map(l => l.seq), [1, 2, 3, 4]);
  eq(seq[3].title, 'Fourth');
});

test('a pinned lesson keeps its fixed date when the rest is laid out', () => {
  const { cur } = build([MON, TUE, WED]);
  const exam = Store.sequence(cur.id)[2];
  Store.update('lessons', exam.id, { pinned: true, date: FRI, title: 'EXAM' });

  Importer.layOutIncomplete(cur.id, MON);

  eq(Store.sequence(cur.id)[2].date, FRI, 'the exam stayed on its fixed date');
});

/* ====================================================== MULTI-PART ASSIGNMENTS */

console.log('\nMulti-part assignments');

test('a day is done only when EVERY assignment is ticked', () => {
  const { cur } = build([MON]);
  const l = Store.sequence(cur.id)[0];
  const parts = Store.partsOf(l);

  Store.togglePart(l.id, parts[0].id, MON);
  ok(!Store.isLessonDone(Store.lesson(l.id)), 'one of two ticked: not done');

  Store.togglePart(l.id, parts[1].id, MON);
  ok(Store.isLessonDone(Store.lesson(l.id)), 'both ticked: done');
});

test('a half-finished day carries ONLY the leftovers forward', () => {
  // The whole point of parts. Read the chapter but not the problem set, and only
  // the problem set should be owed tomorrow -- the reading must stay done.
  const { cur } = build([MON, TUE]);
  const l = Store.sequence(cur.id)[0];
  const parts = Store.partsOf(l);

  Store.togglePart(l.id, parts[0].id, MON);        // reading done, problems not
  Scheduler.shiftCurriculum(cur.id, MON);

  const moved = Store.lesson(l.id);
  eq(moved.date, TUE, 'the unfinished day slid to Tuesday');

  const after = Store.partsOf(moved);
  ok(after[0].done, 'the reading is STILL done');
  ok(!after[1].done, 'the problem set is still owed');
  eq(Store.remainingParts(moved).length, 1, 'exactly one thing carried forward');
});

test('an untouched part is what makes the day shift at all', () => {
  const { cur } = build([MON]);
  const l = Store.sequence(cur.id)[0];
  Store.partsOf(l).forEach(p => Store.togglePart(l.id, p.id, MON));

  const before = Store.lesson(l.id).date;
  Scheduler.rollForwardOverdue(TUE);              // pretend it is now Tuesday
  eq(Store.lesson(l.id).date, before, 'a fully finished day is not dragged forward');
});

test('un-ticking a part re-opens the day', () => {
  const { cur } = build([MON]);
  const l = Store.sequence(cur.id)[0];
  const parts = Store.partsOf(l);

  parts.forEach(p => Store.togglePart(l.id, p.id, MON));
  ok(Store.isLessonDone(Store.lesson(l.id)));

  Store.togglePart(l.id, parts[0].id, MON);       // mis-tap, undo it
  ok(!Store.isLessonDone(Store.lesson(l.id)), 'the day is open again');
});

test('working ahead: a day finished early is re-dated to when it was ACTUALLY done', () => {
  const { cur } = build([MON, TUE, WED]);
  const future = Store.sequence(cur.id)[2];       // planned for Wednesday

  Store.partsOf(future).forEach(p => Store.togglePart(future.id, p.id, MON));  // done Monday

  const l = Store.lesson(future.id);
  ok(Store.isLessonDone(l), 'the day is complete');
  eq(l.date, MON, 'it now sits on the day it was really done');
  eq(l.plannedDate, WED, 'and remembers when it had been planned for');
});

test('un-ticking a mis-tapped future assignment puts the lesson back on its planned day', () => {
  // The accident this guards: tapping a future assignment re-dates that lesson to
  // today. If un-ticking left it there, one stray tap would permanently drag future
  // work onto today, and no amount of un-ticking would put it back.
  const { cur } = build([MON, TUE, WED]);
  const future = Store.sequence(cur.id)[2];        // planned for Wednesday
  const parts = Store.partsOf(future);

  parts.forEach(p => Store.togglePart(future.id, p.id, MON));   // finished early
  eq(Store.lesson(future.id).date, MON, 'moved to the day it was done');

  Store.togglePart(future.id, parts[0].id, MON);                // oops, un-tick one

  const l = Store.lesson(future.id);
  ok(!Store.isLessonDone(l), 'the day is open again');
  eq(l.date, WED, 'and it went back to Wednesday, where it was planned');
  ok(!l.plannedDate, 'the remembered date was cleared');
});

test('a partly-done future lesson keeps its ticked parts visible so they can be undone', () => {
  const { cur } = build([MON, TUE, WED]);
  const future = Store.sequence(cur.id)[2];
  const parts = Store.partsOf(future);

  Store.togglePart(future.id, parts[0].id, MON);   // tick just one of two

  const after = Store.partsOf(Store.lesson(future.id));
  eq(after.length, 2, 'BOTH parts are still on the lesson');
  ok(after[0].done, 'the ticked one is still there, marked done');
  ok(!after[1].done);

  Store.togglePart(future.id, parts[0].id, MON);   // undo it
  ok(!Store.partsOf(Store.lesson(future.id))[0].done, 'un-ticked cleanly');
});

test('working ahead PULLS THE REST OF THE SUBJECT UP', () => {
  // Finish Monday and Tuesday's work on Monday. Wednesday's work should move up to
  // Tuesday -- the student is a day ahead, and the schedule should say so.
  const { cur } = build([MON, TUE, WED]);
  const [d1, d2, d3] = Store.sequence(cur.id);

  Store.partsOf(d1).forEach(p => Store.togglePart(d1.id, p.id, MON));
  Store.partsOf(d2).forEach(p => Store.togglePart(d2.id, p.id, MON));   // done early

  Scheduler.afterCompletion(cur.id, MON);

  eq(Store.lesson(d3.id).date, TUE, 'Wednesday\'s lesson moved up to Tuesday');
});

test('finishing only TODAY\'s work does not yank tomorrow onto today', () => {
  // The obvious way to get this wrong. Completing Monday must not drag Tuesday's
  // lesson into Monday -- the child would never stop being handed work.
  const { cur } = build([MON, TUE, WED]);
  const [d1, d2] = Store.sequence(cur.id);

  Store.partsOf(d1).forEach(p => Store.togglePart(d1.id, p.id, MON));
  Scheduler.afterCompletion(cur.id, MON);

  eq(Store.lesson(d2.id).date, TUE, 'tomorrow stays tomorrow');
});

test('pulling forward never postpones anything', () => {
  const { cur } = build([MON, TUE, WED]);
  const before = dates(cur);

  Scheduler.pullForward(cur.id, MON);             // nothing is done; nothing to compact

  eq(dates(cur), before, 'an already-tight schedule is left alone');
});

test('pulling forward skips a pinned exam and never moves it', () => {
  const { cur } = build([MON, TUE, WED, THU]);
  const [d1, d2, d3, d4] = Store.sequence(cur.id);

  Store.update('lessons', d3.id, { pinned: true, title: 'EXAM' });   // exam fixed to Wed
  Store.partsOf(d1).forEach(p => Store.togglePart(d1.id, p.id, MON));
  Store.partsOf(d2).forEach(p => Store.togglePart(d2.id, p.id, MON)); // both done Monday

  Scheduler.afterCompletion(cur.id, MON);

  eq(Store.lesson(d3.id).date, WED, 'the exam did not move');
  eq(Store.lesson(d4.id).date, TUE, 'the lesson after it was pulled up past the exam');
});

test('working ahead in one subject does not touch another', () => {
  const { child } = build([MON, TUE, WED], 'Latin');
  const latin = Store.curricula()[0];

  const maths = Store.add('subjects', { name: 'Maths', icon: '', color: '#222', order: 1, archived: false });
  const mathsCur = Store.add('curricula', { childId: child.id, subjectId: maths.id, schoolYear: '2026-2027' });
  [MON, TUE, WED].forEach((d, i) => Store.add('lessons', {
    curriculumId: mathsCur.id, seq: i + 1, title: `Maths ${i + 1}`, date: d,
    parts: Importer.makeParts([`Maths work ${i + 1}`]),
    minutes: 0, done: false, hidden: false, pinned: false, priority: 'normal'
  }));

  const [l1, l2] = Store.sequence(latin.id);
  Store.partsOf(l1).forEach(p => Store.togglePart(l1.id, p.id, MON));
  Store.partsOf(l2).forEach(p => Store.togglePart(l2.id, p.id, MON));
  Scheduler.afterCompletion(latin.id, MON);

  eq(dates(mathsCur), [MON, TUE, WED], 'Maths did not budge');
});

test('a part completed early is recorded on the day it was ACTUALLY done', () => {
  const { cur } = build([MON, TUE, WED]);
  const future = Store.sequence(cur.id)[2];       // planned for Wednesday
  const part = Store.partsOf(future)[0];

  Store.togglePart(future.id, part.id, MON);      // but done on Monday

  const rec = Store.portfolio().find(e => e.title === part.text);
  eq(rec.date, MON, 'the portfolio says when the child did the work');
  eq(rec.assignedDate, WED, 'and separately, when it was planned for');
});

test('every ticked assignment lands in the permanent portfolio', () => {
  const { cur } = build([MON]);
  const l = Store.sequence(cur.id)[0];
  Store.partsOf(l).forEach(p => Store.togglePart(l.id, p.id, MON));

  const recs = Store.portfolio().filter(e => e.category === 'Assignment');
  eq(recs.length, 2, 'one record per assignment, not one per day');
  eq(recs[0].subjectName, 'Latin', 'the subject NAME is stored, not just an id');
});

test('old single-checkbox lessons are migrated to a one-part day, keeping their tick', () => {
  // Anyone who used the app before parts existed must not lose a term of work.
  for (const k in memory) delete memory[k];
  Store.load();
  Store.replaceAll({
    schemaVersion: 1, updatedAt: '', settings: { mode: 'School Year', schoolYear: '2026-2027' },
    children: [], subjects: [], curricula: [],
    lessons: [{
      id: 'old1', curriculumId: 'c1', seq: 1, title: 'Chapter 1',
      date: MON, done: true, hidden: false, pinned: false,
      createdAt: '', updatedAt: '', deleted: false
      // note: NO parts array at all
    }],
    habits: [], habitLog: [], tasks: [], portfolio: [], holidays: []
  });

  Store.load();                                    // triggers migrate()

  const l = Store.lesson('old1');
  eq(Store.partsOf(l).length, 1, 'it gained exactly one part');
  eq(Store.partsOf(l)[0].text, 'Chapter 1', 'named after the lesson');
  ok(Store.partsOf(l)[0].done, 'and it is still completed');
  ok(Store.isLessonDone(l), 'so the day still reads as done');
});

/* ============================================================== HABIT PLANS */

console.log('\nHabit daily plans (progressions)');

function plannedHabit(days) {
  const hb = habitFixture(days === undefined ? EVERY : days);
  const { lessons } = Importer.parse(
    'Day 1: Foundation | 10 push-ups | 20 min walk\n' +
    'Day 2: Build | 12 push-ups | 25 min walk\n' +
    'Day 3: Push | 15 push-ups | 30 min walk');
  Habits.setPlan(hb.id, lessons, 'append');
  return Store.habit(hb.id);
}

test('a habit plan loads from the same paste format as a curriculum', () => {
  const hb = plannedHabit();
  eq(Habits.plan(hb).length, 3);
  eq(Habits.plan(hb)[0].title, 'Day 1: Foundation');
  eq(Habits.plan(hb)[0].parts.map(p => p.text), ['10 push-ups', '20 min walk']);
});

test('today shows the first entry not yet done', () => {
  const hb = plannedHabit();
  eq(Habits.currentEntry(hb).title, 'Day 1: Foundation');
});

test('the habit only counts as done when EVERY assignment in the day is ticked', () => {
  const hb = plannedHabit();
  const e = Habits.currentEntry(hb);

  Habits.togglePlanPart(hb.id, e.id, e.parts[0].id, MON);
  ok(!Habits.isDone(hb.id, MON), 'half a workout is not a workout');

  Habits.togglePlanPart(hb.id, e.id, e.parts[1].id, MON);
  ok(Habits.isDone(hb.id, MON), 'now the day counts, and the streak sees it');
});

test('the plan ADVANCES only when a day is finished', () => {
  const hb = plannedHabit();
  const e1 = Habits.currentEntry(hb);
  e1.parts.forEach(p => Habits.togglePlanPart(hb.id, e1.id, p.id, MON));

  eq(Habits.currentEntry(Store.habit(hb.id)).title, 'Day 2: Build', 'day 2 is next');
});

test('MISSING A DAY DOES NOT SKIP A STEP OF THE PROGRESSION', () => {
  // The whole reason plans advance by consumption rather than by date. Skip Tuesday
  // and you resume at Day 2 -- you do NOT jump to Day 3. A strength or skincare
  // progression that silently drops a stage is worse than useless.
  const hb = plannedHabit();
  const e1 = Habits.currentEntry(hb);
  e1.parts.forEach(p => Habits.togglePlanPart(hb.id, e1.id, p.id, MON));

  // Tuesday: nothing happens at all. Wednesday: what is next?
  eq(Habits.currentEntry(Store.habit(hb.id)).title, 'Day 2: Build',
     'Wednesday still offers Day 2, not Day 3');
});

test('un-ticking an assignment re-opens the day and un-does the streak', () => {
  const hb = plannedHabit();
  const e = Habits.currentEntry(hb);
  e.parts.forEach(p => Habits.togglePlanPart(hb.id, e.id, p.id, MON));
  ok(Habits.isDone(hb.id, MON));

  Habits.togglePlanPart(hb.id, e.id, e.parts[0].id, MON);   // mis-tap, undo

  ok(!Habits.isDone(hb.id, MON), 'the day no longer counts');
  eq(Habits.currentEntry(Store.habit(hb.id)).title, 'Day 1: Foundation', 'back to day 1');
});

test('looking at a past day shows what was done THAT day, not today\'s next entry', () => {
  const hb = plannedHabit();
  const e1 = Habits.currentEntry(hb);
  e1.parts.forEach(p => Habits.togglePlanPart(hb.id, e1.id, p.id, MON));

  const fresh = Store.habit(hb.id);
  eq(Habits.entryFor(fresh, MON).title, 'Day 1: Foundation', 'Monday still shows Monday');
  eq(Habits.entryFor(fresh, TUE).title, 'Day 2: Build', 'Tuesday shows what is next');
});

test('extending a plan keeps completed days; replacing keeps them too', () => {
  const hb = plannedHabit();
  const e1 = Habits.currentEntry(hb);
  e1.parts.forEach(p => Habits.togglePlanPart(hb.id, e1.id, p.id, MON));

  const { lessons } = Importer.parse('Day 9: New | something');
  Habits.setPlan(hb.id, lessons, 'replace');

  const p = Habits.plan(Store.habit(hb.id));
  ok(p.some(e => e.title === 'Day 1: Foundation' && e.done), 'the completed day survived');
  ok(p.some(e => e.title === 'Day 9: New'), 'the new day is there');
  ok(!p.some(e => e.title === 'Day 3: Push'), 'the unfinished days were replaced');
});

test('a habit with no plan still works as a simple one-tap habit', () => {
  const hb = habitFixture(EVERY);
  ok(!Habits.hasPlan(hb), 'no plan');
  Habits.toggle(hb.id, MON);
  ok(Habits.isDone(hb.id, MON));
});

/* ====================================================== SUBJECT DAYS OF WEEK */

console.log('\nSubjects that only run on certain days');

const SUN_ONLY = 0b0000001;   // bit 0 = Sunday
const MON_TUE  = 0b0000110;

function subjectOnDays(mask) {
  const b = build([]);
  Store.update('subjects', b.subj.id, { days: mask });
  return b;
}

test('a Sunday-only subject schedules on SUNDAYS, not weekdays', () => {
  // The trap: Sunday is not a "school day", so a naive implementation would never be
  // able to schedule this subject at all and the lessons would silently vanish.
  const { cur } = subjectOnDays(SUN_ONLY);
  const { lessons } = Importer.parse('Week 1\nWeek 2\nWeek 3');
  Importer.apply(cur.id, lessons, MON, 'append');            // starting from a Monday

  const ds = Store.sequence(cur.id).map(l => l.date);
  ds.forEach(d => eq(Store.dayOfWeek(d), 0, `${d} is a Sunday`));
  eq(ds, ['2026-09-20', '2026-09-27', '2026-10-04'], 'one per week');
});

test('a Mon+Tue subject uses only Mondays and Tuesdays', () => {
  const { cur } = subjectOnDays(MON_TUE);
  const { lessons } = Importer.parse('L1\nL2\nL3\nL4');
  Importer.apply(cur.id, lessons, MON, 'append');

  eq(Store.sequence(cur.id).map(l => l.date),
     [MON, TUE, '2026-09-21', '2026-09-22'], 'Mon, Tue, next Mon, next Tue');
});

test('shifting a Mon+Tue subject skips to the next ALLOWED day, not just the next weekday', () => {
  const { cur } = subjectOnDays(MON_TUE);
  const { lessons } = Importer.parse('L1\nL2');
  Importer.apply(cur.id, lessons, MON, 'append');            // Mon, Tue

  Scheduler.shiftCurriculum(cur.id, TUE);                    // Tuesday not finished

  eq(Store.lesson(Store.sequence(cur.id)[1].id).date, '2026-09-21',
     'it went to next Monday, not Wednesday');
});

test('working ahead in a Sunday-only subject pulls up to the next SUNDAY', () => {
  const { cur } = subjectOnDays(SUN_ONLY);
  const { lessons } = Importer.parse('W1\nW2\nW3');
  Importer.apply(cur.id, lessons, MON, 'append');            // 20th, 27th, 4th

  const [w1, w2] = Store.sequence(cur.id);
  Store.partsOf(w1).forEach(p => Store.togglePart(w1.id, p.id, '2026-09-20'));
  Store.partsOf(w2).forEach(p => Store.togglePart(w2.id, p.id, '2026-09-20'));  // both early

  Scheduler.afterCompletion(cur.id, '2026-09-20');

  eq(Store.lesson(Store.sequence(cur.id)[2].id).date, '2026-09-27',
     'week 3 pulled up to the next Sunday');
});

test('a subject with the default days behaves exactly as before', () => {
  const { cur } = build([]);                                 // no days set at all
  const { lessons } = Importer.parse('A\nB\nC\nD\nE\nF');
  Importer.apply(cur.id, lessons, THU, 'append');

  eq(Store.sequence(cur.id).map(l => l.date),
     [THU, FRI, NEXT_MON, '2026-09-22', '2026-09-23', '2026-09-24'],
     'Mon-Fri, weekend skipped — unchanged');
});

test('holidays still block a Sunday-only subject', () => {
  const { cur } = subjectOnDays(SUN_ONLY);
  Store.add('holidays', { date: '2026-09-20', label: 'Away' });

  const { lessons } = Importer.parse('W1');
  Importer.apply(cur.id, lessons, MON, 'append');

  eq(Store.sequence(cur.id)[0].date, '2026-09-27', 'it skipped the blocked Sunday');
});

/* ==================================================================== report */

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) { failures.forEach(f => console.log('  FAILED: ' + f)); process.exit(1); }
