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
