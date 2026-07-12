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

const bundle = ['seed.js', 'store.js', 'scheduler.js', 'habits.js'].map(read).join('\n;\n')
  + '\n;globalThis.__exports = { Store, Scheduler, Habits, Seed };';

vm.runInContext(bundle, sandbox, { filename: 'app-bundle.js' });

const { Store, Scheduler, Habits } = sandbox.__exports;

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
      date: d, minutes: 45, done: false, hidden: false, pinned: false, priority: 'normal', notes: ''
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

test('completed lessons never move', () => {
  const { cur } = build([MON, TUE]);
  const first = Store.sequence(cur.id)[0];
  Store.update('lessons', first.id, { done: true });
  Scheduler.shiftCurriculum(cur.id, MON);
  eq(dates(cur), [MON, WED]);   // done one stays; the other slides
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
    minutes: 45, done: false, hidden: false, pinned: false, priority: 'normal'
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

/* ==================================================================== report */

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) { failures.forEach(f => console.log('  FAILED: ' + f)); process.exit(1); }
