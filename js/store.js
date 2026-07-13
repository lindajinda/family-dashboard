/* =============================================================================
   store.js — the entire data layer.

   Design decisions worth knowing:

   1. ONE JSON DOCUMENT. Everything (children, subjects, lessons, habits, tasks,
      and the permanent portfolio) lives in a single object. A family's whole
      educational history is small — years of it is a few megabytes — so there is
      no reason to build a database. One document is trivial to back up, to sync,
      to inspect, and to restore.

   2. IDs ARE RANDOM STRINGS, not counters. Two computers editing offline must be
      able to create records without colliding when they next sync.

   3. NOTHING IS EVER HARD DELETED. Deletes set a flag. A hard delete cannot sync:
      the other computer cannot tell "deleted" from "not seen yet", so the record
      would come back from the dead. The portfolio requirement ("never delete
      completion history") makes this doubly important.

   4. EVERY WRITE STAMPS updatedAt. That is what lets two computers merge: for any
      record that both changed, the newer edit wins. Simple, predictable, and it
      never loses data silently — the older version stays in git history.
   ============================================================================= */

const Store = (() => {
  'use strict';

  const SCHEMA_VERSION = 1;
  const LOCAL_KEY = 'familyDashboard.v1';

  let data = null;
  const listeners = [];

  /* ---------------------------------------------------------------- helpers */

  function uid() {
    return 'x' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  /** Local calendar date as YYYY-MM-DD. Never use toISOString() for this — it
   *  converts to UTC and will hand you yesterday's date after 7pm. */
  function today() {
    return toKey(new Date());
  }

  function toKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function fromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(key, n) {
    const d = fromKey(key);
    d.setDate(d.getDate() + n);
    return toKey(d);
  }

  function dayOfWeek(key) {
    return fromKey(key).getDay(); // 0 = Sunday
  }

  /* ------------------------------------------------------------- the schema */

  function emptyData() {
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: nowIso(),
      settings: {
        mode: 'School Year',           // Summer | School Year | Vacation | Custom
        schoolYear: '2026-2027',
        accent: '#0F6CBD'
      },
      children: [],
      subjects: [],
      curricula: [],   // one child + one subject = one lesson sequence
      lessons: [],
      habits: [],
      habitLog: [],    // { habitId, date }
      tasks: [],       // one-time tasks
      portfolio: [],   // permanent, append-only record of everything completed
      holidays: []     // dates that are not school days
    };
  }

  /* --------------------------------------------------------------- accessors
     All of these hide deleted records, so no screen has to remember to filter. */

  const live = arr => arr.filter(r => !r.deleted);

  const api = {
    uid, nowIso, today, toKey, fromKey, addDays, dayOfWeek,

    get raw() { return data; },
    get settings() { return data.settings; },

    children: () => live(data.children).sort((a, b) => a.order - b.order),
    subjects: () => live(data.subjects).filter(s => !s.archived).sort((a, b) => a.order - b.order),
    allSubjects: () => live(data.subjects).sort((a, b) => a.order - b.order),
    curricula: () => live(data.curricula),
    lessons: () => live(data.lessons),
    habits: () => live(data.habits).filter(h => !h.archived).sort((a, b) => a.order - b.order),
    tasks: () => live(data.tasks),
    portfolio: () => data.portfolio,          // never filtered: it is permanent
    holidays: () => live(data.holidays),

    child: id => data.children.find(c => c.id === id),
    subject: id => data.subjects.find(s => s.id === id),
    curriculum: id => data.curricula.find(c => c.id === id),
    lesson: id => data.lessons.find(l => l.id === id),
    habit: id => data.habits.find(h => h.id === id),

    /* ------------------------------------------------------------------- parts

       A day's assignment in one subject is usually several things: a reading, a
       problem set, a reading from a different book. Each is ticked off on its own.

       A lesson is DONE only when every part is done. Anything still unticked at the
       end of the day is what rolls forward — so a half-finished day carries only the
       leftovers into tomorrow, not the work already completed. */

    partsOf(lesson) {
      return (lesson.parts || []).filter(p => !p.deleted);
    },

    isLessonDone(lesson) {
      const parts = api.partsOf(lesson);
      return parts.length > 0 && parts.every(p => p.done);
    },

    /** Parts still owed. These are what a shift carries to the next day. */
    remainingParts(lesson) {
      return api.partsOf(lesson).filter(p => !p.done);
    },

    togglePart(lessonId, partId, onDate) {
      const lesson = api.lesson(lessonId);
      if (!lesson) return;

      const part = (lesson.parts || []).find(p => p.id === partId);
      if (!part) return;

      part.done = !part.done;
      part.doneOn = part.done ? onDate : null;

      // `done` is a cached roll-up of the parts, so the scheduler and every screen
      // can keep asking a simple question.
      const wasDone = lesson.done;
      lesson.done = api.isLessonDone(lesson);
      lesson.completedOn = lesson.done ? nowIso() : null;

      // A day finished EARLY is re-dated to the day it was actually done.
      //
      // This is not cosmetic. If a student does Thursday's work on Monday and we
      // leave that lesson sitting on Thursday, Thursday still looks occupied — so
      // nothing can be pulled up into it, and the schedule cannot compact. Re-dating
      // it frees the slot and makes the calendar tell the truth about what happened.
      if (lesson.done && !wasDone && lesson.date && onDate < lesson.date && !lesson.pinned) {
        lesson.plannedDate = lesson.plannedDate || lesson.date;   // remember the original
        lesson.date = onDate;
      }

      // ...and un-ticking it puts it back where it was planned.
      //
      // Without this, an accidental tap on a future assignment would permanently drag
      // that lesson onto today: ticking re-dates it to today, and un-ticking would
      // leave it there. Undo has to actually undo.
      if (wasDone && !lesson.done && lesson.plannedDate) {
        lesson.date = lesson.plannedDate;
        delete lesson.plannedDate;
      }

      if (part.done) {
        const cur = api.curriculum(lesson.curriculumId);
        const child = cur && api.child(cur.childId);
        const subject = cur && api.subject(cur.subjectId);

        api.recordCompletion({
          kind: 'part',
          childId: child ? child.id : null,
          childName: child ? child.name : '',
          subjectId: subject ? subject.id : null,
          subjectName: subject ? subject.name : '',   // denormalised: renaming a
          title: part.text,                           // subject later must not
          lessonTitle: lesson.title,                  // corrupt this history
          category: 'Assignment',
          assignedDate: lesson.date,
          date: onDate,
          minutes: 0,
          notes: ''
        });
      }

      touch();
      return part.done;
    },

    /** Lessons for one child on one day, newest schedule state included. */
    lessonsOn(childId, date) {
      const curById = {};
      api.curricula().forEach(c => { curById[c.id] = c; });

      return api.lessons()
        .filter(l => !l.hidden && l.date === date)
        .map(l => ({ lesson: l, cur: curById[l.curriculumId] }))
        .filter(x => x.cur && x.cur.childId === childId)
        .map(x => ({
          ...x.lesson,
          subject: api.subject(x.cur.subjectId),
          curriculum: x.cur
        }))
        .filter(x => x.subject && !x.subject.archived)
        .sort((a, b) => (a.subject.order - b.subject.order));
    },

    curriculumFor(childId, subjectId) {
      return api.curricula().find(c => c.childId === childId && c.subjectId === subjectId);
    },

    /** Every lesson in one curriculum, in sequence order. */
    sequence(curriculumId) {
      return api.lessons()
        .filter(l => l.curriculumId === curriculumId)
        .sort((a, b) => a.seq - b.seq);
    },

    isSchoolDay(date) {
      const dow = dayOfWeek(date);
      if (dow === 0 || dow === 6) return false;
      return !api.holidays().some(h => h.date === date);
    },

    nextSchoolDay(date) {
      let d = addDays(date, 1);
      for (let i = 0; i < 400; i++) {
        if (api.isSchoolDay(d)) return d;
        d = addDays(d, 1);
      }
      return d;
    },

    /* --------------------------------------------- which days does a subject run?

       Some subjects do not run every weekday: Theology on Sundays only, Chinese on
       Mondays and Tuesdays. Each subject carries a 7-bit day mask (bit 0 = Sunday),
       defaulting to Mon–Fri, which is exactly the old behaviour.

       Note this REPLACES the weekday rule rather than adding to it — otherwise a
       Sunday-only subject could never be scheduled at all, because Sunday is not a
       "school day". Holidays still block everything. */

    WEEKDAYS: 0b0111110,   // Mon..Fri

    daysOfCurriculum(curriculumId) {
      const cur = api.curriculum(curriculumId);
      const subj = cur && api.subject(cur.subjectId);
      return (subj && subj.days !== undefined && subj.days !== null)
        ? subj.days
        : api.WEEKDAYS;
    },

    isDayAllowed(curriculumId, date) {
      if (api.holidays().some(h => h.date === date)) return false;
      const mask = api.daysOfCurriculum(curriculumId);
      return (mask & (1 << dayOfWeek(date))) !== 0;
    },

    /** The next day this particular subject is allowed to run. */
    nextDayFor(curriculumId, date) {
      let d = addDays(date, 1);
      for (let i = 0; i < 800; i++) {
        if (api.isDayAllowed(curriculumId, d)) return d;
        d = addDays(d, 1);
      }
      return d;   // a subject with no days ticked: give up rather than loop
    },

    /* ------------------------------------------------------------- mutations */

    add(collection, record) {
      const rec = Object.assign({
        id: uid(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        deleted: false
      }, record);
      data[collection].push(rec);
      touch();
      return rec;
    },

    update(collection, id, patch) {
      const rec = data[collection].find(r => r.id === id);
      if (!rec) return null;
      Object.assign(rec, patch, { updatedAt: nowIso() });
      touch();
      return rec;
    },

    /** Soft delete. See the header — a hard delete cannot survive a sync. */
    remove(collection, id) {
      return api.update(collection, id, { deleted: true });
    },

    /* ------------------------------------------ the permanent portfolio record
       Written once, on completion, and never edited or removed. This is the
       "lifelong educational record" and it is deliberately denormalised: it keeps
       the subject NAME, not just an id, so that renaming or deleting a subject
       years later cannot corrupt the history. */

    recordCompletion(entry) {
      data.portfolio.push(Object.assign({
        id: uid(),
        completedAt: nowIso(),
        schoolYear: data.settings.schoolYear,
        mode: data.settings.mode
      }, entry));
      touch();
    },

    /* ------------------------------------------------------------ persistence */

    load() {
      const text = localStorage.getItem(LOCAL_KEY);
      if (text) {
        try {
          data = JSON.parse(text);
          if (!data.schemaVersion) data = emptyData();
          migrate();
        } catch {
          data = emptyData();
        }
      } else {
        data = emptyData();
        Seed.apply(api);
      }
      return api;
    },

    save() {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    },

    replaceAll(next) {
      data = next;
      api.save();
      emit();
    },

    export() {
      return JSON.stringify(data, null, 2);
    },

    onChange(fn) { listeners.push(fn); },

    reset() {
      localStorage.removeItem(LOCAL_KEY);
      data = emptyData();
      Seed.apply(api);
      api.save();
      emit();
    }
  };

  /**
   * Bring an older saved file up to the current shape, in place.
   *
   * Lessons used to be a single checkbox. They are now a list of parts. Anything
   * saved before that change gets one part, named after the lesson, carrying the
   * old completed flag — so nobody loses a term of ticked-off work to an upgrade.
   */
  function migrate() {
    let changed = false;

    (data.lessons || []).forEach(l => {
      if (Array.isArray(l.parts) && l.parts.length) return;

      l.parts = [{
        id: uid(),
        text: l.title,
        done: !!l.done,
        doneOn: l.done ? (l.date || null) : null
      }];
      changed = true;
    });

    if (changed) {
      data.schemaVersion = SCHEMA_VERSION;
      api.save();
    }
  }

  function touch() {
    data.updatedAt = nowIso();
    api.save();
    emit();
  }

  function emit() {
    listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }

  return api;
})();
