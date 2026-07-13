/* =============================================================================
   pages.js — every screen's rendering. Plain DOM, no framework.
   ============================================================================= */

const Pages = (() => {
  'use strict';

  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 100));

  const fmtDay = key => Store.fromKey(key).toLocaleDateString(undefined,
    { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtShort = key => Store.fromKey(key).toLocaleDateString(undefined,
    { weekday: 'short', day: 'numeric', month: 'short' });

  /* ============================================================== DASHBOARD */

  function dashboard(root) {
    const today = Store.today();
    const children = Store.children();

    root.appendChild(h(`
      <div class="page-head">
        <div>
          <h1>Family Dashboard</h1>
          <div class="sub">${esc(fmtDay(today))} &middot; ${esc(Store.settings.mode)} &middot; ${esc(Store.settings.schoolYear)}</div>
        </div>
        <button class="btn btn-primary btn-lg" data-go="today">Start today's work &rarr;</button>
      </div>
    `));

    // ---- family totals ----
    // Counted in PARTS, not lessons: a day is a reading plus a problem set plus a
    // second reading, and "3 of 4 assignments done" is the honest number.
    let allLessons = [], allDone = 0, parts = 0, partsDone = 0, overdue = 0;

    children.forEach(c => {
      const ls = Store.lessonsOn(c.id, today);
      allLessons = allLessons.concat(ls);
      ls.forEach(l => {
        const p = Store.partsOf(l);
        parts += p.length;
        partsDone += p.filter(x => x.done).length;
        if (Store.isLessonDone(l)) allDone++;
      });
    });

    Store.curricula().forEach(cur => {
      overdue += Store.sequence(cur.id)
        .filter(l => !Store.isLessonDone(l) && l.date && l.date < today).length;
    });

    const tasksDue = Store.tasks().filter(t => !t.done && t.due && t.due <= Store.addDays(today, 7));

    root.appendChild(h(`
      <div class="grid grid-4" style="margin-bottom:18px">
        <div class="card stat">
          <div class="n">${partsDone}/${parts}</div>
          <div class="l">Assignments done today</div>
          <div class="bar mt" style="margin-top:8px"><i style="width:${pct(partsDone, parts)}%"></i></div>
        </div>
        <div class="card stat">
          <div class="n">${allDone}/${allLessons.length}</div>
          <div class="l">Subjects fully finished</div>
        </div>
        <div class="card stat">
          <div class="n" style="color:${overdue ? 'var(--red)' : 'var(--green)'}">${overdue}</div>
          <div class="l">Overdue lessons</div>
        </div>
        <div class="card stat">
          <div class="n">${tasksDue.length}</div>
          <div class="l">Tasks due this week</div>
        </div>
      </div>
    `));

    // ---- one card per child ----
    const grid = h(`<div class="grid grid-3"></div>`).firstElementChild;

    children.forEach(child => {
      const lessons = Store.lessonsOn(child.id, today);
      const done = lessons.filter(l => l.done).length;

      const habits = Store.habits().filter(x => x.childId === child.id);
      const due = habits.filter(x => Habits.isDue(x, today));
      const hdone = due.filter(x => Habits.isDone(x.id, today)).length;
      const best = habits.reduce((m, x) => Math.max(m, Habits.stats(x, today).current), 0);

      const card = h(`
        <div class="card">
          <div class="flex" style="margin-bottom:14px">
            <span style="width:12px;height:12px;border-radius:50%;background:${esc(child.color)}"></span>
            <h2 style="margin:0;color:${esc(child.color)}">${esc(child.name)}</h2>
            ${done === lessons.length && lessons.length ? '<span class="chip chip-good right">All done</span>' : ''}
          </div>

          <div class="small muted">Lessons &middot; ${done} of ${lessons.length}</div>
          <div class="bar" style="margin:6px 0 14px"><i style="width:${pct(done, lessons.length)}%;background:${esc(child.color)}"></i></div>

          <div class="small muted">Habits &middot; ${hdone} of ${due.length}</div>
          <div class="bar" style="margin:6px 0 14px"><i style="width:${pct(hdone, due.length)}%;background:${esc(child.color)}"></i></div>

          <div class="flex small muted">
            <span>🔥 Best streak: <b>${best}</b> day${best === 1 ? '' : 's'}</span>
            <button class="btn btn-sm right" data-go="today" data-child="${esc(child.id)}">Open</button>
          </div>
        </div>
      `);
      grid.appendChild(card);
    });

    root.appendChild(grid);

    // ---- upcoming ----
    if (tasksDue.length) {
      const list = h(`<div class="card" style="margin-top:18px"><h2>Upcoming deadlines</h2></div>`).firstElementChild;
      tasksDue.sort((a, b) => a.due.localeCompare(b.due)).forEach(t => {
        const child = Store.child(t.childId);
        const late = t.due < today;
        list.appendChild(h(`
          <div class="flex" style="padding:8px 0;border-top:1px solid var(--border)">
            <span>${esc(t.title)}</span>
            <span class="chip" style="margin-left:8px">${esc(child ? child.name : 'Family')}</span>
            <span class="right chip ${late ? 'chip-high' : 'chip-warn'}">${esc(fmtShort(t.due))}</span>
          </div>
        `));
      });
      root.appendChild(list);
    }
  }

  /* ========================================================== TODAY SCHEDULE */

  let todayChild = null;
  let todayDate = null;
  let workAhead = false;

  function today(root) {
    const children = Store.children();
    if (!todayChild || !Store.child(todayChild)) todayChild = children[0]?.id;
    if (!todayDate) todayDate = Store.today();

    const child = Store.child(todayChild);
    const date = todayDate;
    const lessons = Store.lessonsOn(todayChild, date);

    // Progress is counted in PARTS, not lessons. A day with one lesson of four parts
    // and three of them done is 75% through, and it should say so.
    let parts = 0, partsDone = 0;
    lessons.forEach(l => {
      const p = Store.partsOf(l);
      parts += p.length;
      partsDone += p.filter(x => x.done).length;
    });

    root.appendChild(h(`
      <div class="page-head">
        <div>
          <h1>Daily Schedule</h1>
          <div class="sub">${esc(fmtDay(date))}${date === Store.today() ? '' : ' &middot; not today'}</div>
        </div>
        <div class="segment" id="childPick">
          ${children.map(c => `<button data-c="${esc(c.id)}" class="${c.id === todayChild ? 'on' : ''}">${esc(c.name)}</button>`).join('')}
        </div>
      </div>

      <div class="flex wrap" style="margin-bottom:18px">
        <button class="btn btn-icon" id="prevDay" title="Previous day">&lsaquo;</button>
        <button class="btn" id="goToday">Today</button>
        <button class="btn btn-icon" id="nextDay" title="Next day">&rsaquo;</button>
        <div class="right" style="min-width:240px">
          <div class="small muted">${partsDone} of ${parts} assignment${parts === 1 ? '' : 's'} done</div>
          <div class="bar" style="margin-top:6px"><i style="width:${pct(partsDone, parts)}%"></i></div>
        </div>
      </div>
      <div id="banner"></div>
      <div id="habitBlock"></div>
      <div id="rows"></div>
      <div id="taskBlock"></div>
      <div id="ahead"></div>
    `));

    root.querySelector('#childPick').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      todayChild = b.dataset.c; App.render();
    };
    root.querySelector('#prevDay').onclick = () => { todayDate = Store.addDays(date, -1); App.render(); };
    root.querySelector('#nextDay').onclick = () => { todayDate = Store.addDays(date, 1); App.render(); };
    root.querySelector('#goToday').onclick = () => { todayDate = Store.today(); App.render(); };

    // Habits first. They are the quick wins that start the day, they take seconds,
    // and burying them under an hour of academic work is how they stop happening.
    renderHabitsFor(root.querySelector('#habitBlock'), todayChild, date);

    const rows = root.querySelector('#rows');
    rows.appendChild(h(`<h2 style="margin:22px 0 12px">Schoolwork</h2>`));

    if (!lessons.length) {
      rows.appendChild(h(`
        <div class="card empty">
          <div class="big">&#127881;</div>
          <div>No lessons scheduled for ${esc(child ? child.name : '')} on this day.</div>
        </div>`));
    } else {
      lessons.forEach(l => rows.appendChild(lessonCard(l, date)));
    }

    renderTasksFor(root.querySelector('#taskBlock'), todayChild, date);
    renderWorkAhead(root.querySelector('#ahead'), todayChild, date);
  }

  /* ------------------------------------------------------------ one-time tasks

     Appointments, forms, purchases. Shown on Today so nothing lives only on a page
     nobody visits.

     What is shown: anything overdue, anything due today, and anything due in the
     next week. Not the whole task list — a task due in March is not today's problem,
     and a Today page that cries wolf gets ignored. */

  function renderTasksFor(mount, childId, date) {
    const horizon = Store.addDays(date, 7);

    const mine = Store.tasks()
      .filter(t => !t.done)
      .filter(t => t.childId === childId || !t.childId)   // theirs, plus family tasks
      .filter(t => t.due && t.due <= horizon)
      .sort((a, b) => a.due.localeCompare(b.due));

    if (!mine.length) return;

    const overdue = mine.filter(t => t.due < date).length;

    const card = h(`
      <div class="card" style="margin-top:22px">
        <div class="flex" style="margin-bottom:12px">
          <h2 style="margin:0">Tasks &amp; deadlines</h2>
          ${overdue ? `<span class="chip chip-high">${overdue} overdue</span>` : ''}
          <span class="chip">${mine.length} in the next week</span>
          <button class="btn btn-sm right" data-go="tasks">All tasks &rarr;</button>
        </div>
        <div id="tl" style="display:flex;flex-direction:column;gap:8px"></div>
      </div>
    `).firstElementChild;

    const list = card.querySelector('#tl');

    mine.forEach(t => {
      const late = t.due < date;
      const isToday = t.due === date;
      const family = !t.childId;

      const row = h(`
        <label class="flex" style="
            gap:12px; cursor:pointer; padding:10px 12px; border-radius:8px;
            border:1px solid ${late ? '#F5C6C2' : 'var(--border)'};
            background:${late ? 'rgba(196,43,28,.05)' : 'var(--surface)'};">
          <span class="check" style="width:26px;height:26px;flex:0 0 26px;font-size:15px">&#10003;</span>
          <span style="flex:1;min-width:0">
            <span style="display:block;font-weight:500">${esc(t.title)}</span>
            ${t.description ? `<span class="small muted">${esc(t.description)}</span>` : ''}
          </span>
          ${family ? '<span class="chip">Family</span>' : ''}
          ${t.priority === 'high' ? '<span class="chip chip-high">High</span>' : ''}
          <span class="chip ${late ? 'chip-high' : (isToday ? 'chip-warn' : '')}">
            ${late ? 'Overdue &middot; ' : (isToday ? 'Today' : '')}${isToday ? '' : esc(fmtShort(t.due))}
          </span>
        </label>
      `).firstElementChild;

      row.onclick = e => {
        e.preventDefault();
        Store.update('tasks', t.id, { done: true });

        const c = Store.child(t.childId);
        Store.recordCompletion({
          kind: 'task',
          childId: t.childId,
          childName: c ? c.name : 'Family',
          title: t.title,
          category: 'One-time task',
          date: Store.today(),
          minutes: 0
        });

        App.render();
      };

      list.appendChild(row);
    });

    mount.appendChild(card);
  }

  function banner(msg) {
    const b = document.querySelector('#banner');
    if (!b) return;
    b.innerHTML = '';
    b.appendChild(h(`<div class="banner">&#8505;&#65039; <span>${esc(msg)}</span></div>`));
  }

  /* ---------------------------------------------------------------- one lesson

     A day's assignment in one subject, with a checkbox per part: a reading, a
     problem set, a reading from another book. Each ticks off on its own. */

  function lessonCard(l, date) {
    const s = l.subject;
    const parts = Store.partsOf(l);
    const doneCount = parts.filter(p => p.done).length;
    const allDone = doneCount === parts.length && parts.length > 0;
    const started = doneCount > 0 && !allDone;

    const card = h(`
      <div class="row ${allDone ? 'is-done' : ''}" style="align-items:stretch">
        <div class="stripe" style="background:${esc(s.color)}"></div>
        <div class="row-main">
          <div class="row-meta">
            <span class="row-subject" style="color:${esc(s.color)}">${esc(s.icon)} ${esc(s.name)}</span>
            <span class="row-title" style="font-weight:500">${esc(l.title)}</span>
            <span class="chip ${allDone ? 'chip-good' : (started ? 'chip-warn' : '')}">${doneCount}/${parts.length}</span>
            ${l.priority === 'high' ? '<span class="chip chip-high">High</span>' : ''}
            ${l.pinned ? '<span class="chip chip-info">&#128204; Fixed date</span>' : ''}
          </div>

          <div class="parts" style="margin-top:10px;display:flex;flex-direction:column;gap:8px"></div>

          ${l.notes ? `<div class="small muted" style="margin-top:8px">${esc(l.notes)}</div>` : ''}
        </div>

        <div class="row-actions" style="align-items:flex-start">
          <button class="btn btn-sm" data-act="move" ${allDone ? 'disabled' : ''}>Move to tomorrow</button>
          <button class="btn btn-sm" data-act="note">Notes</button>
        </div>
      </div>
    `).firstElementChild;

    const wrap = card.querySelector('.parts');

    parts.forEach(p => {
      const line = h(`
        <label class="flex" style="
            gap:12px; cursor:pointer; padding:8px 12px; border-radius:8px;
            border:1px solid var(--border);
            background:${p.done ? 'var(--surface-2)' : 'var(--surface)'};">
          <span class="check ${p.done ? 'on' : ''}" style="width:26px;height:26px;flex:0 0 26px;font-size:15px">&#10003;</span>
          <span style="${p.done ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(p.text)}</span>
        </label>
      `).firstElementChild;

      line.onclick = e => {
        e.preventDefault();
        Store.togglePart(l.id, p.id, date);

        // Finishing work early pulls the rest of THIS subject up to fill the gap.
        // Only this subject — the others are none of its business.
        const moves = Scheduler.afterCompletion(l.curriculumId, Store.today());
        App.render();

        if (moves.length) {
          setTimeout(() => banner(
            `You're ahead in ${l.subject.name}. ${moves.length} lesson${moves.length === 1 ? '' : 's'} ` +
            `moved earlier. Other subjects unchanged.`), 0);
        }
      };
      wrap.appendChild(line);
    });

    card.querySelector('[data-act="move"]').onclick = () => {
      const remaining = Store.remainingParts(l).length;
      const r = Scheduler.shiftCurriculum(l.curriculumId, date);
      App.render();
      if (r) {
        setTimeout(() => banner(
          `${l.subject.name}: ${remaining} unfinished assignment${remaining === 1 ? '' : 's'} moved to ${fmtShort(r.to)}. ` +
          `${r.moved} ${l.subject.name} lesson${r.moved === 1 ? '' : 's'} shifted to keep the sequence. ` +
          `Anything already ticked stays done. Other subjects unchanged.`), 0);
      }
    };

    card.querySelector('[data-act="note"]').onclick = () => {
      Modal.open('Notes — ' + l.title, `
        <div class="field"><label>Notes</label><textarea id="n" rows="5">${esc(l.notes || '')}</textarea></div>`,
        () => {
          Store.update('lessons', l.id, { notes: document.querySelector('#n').value });
          App.render();
        });
    };

    return card;
  }

  /* --------------------------------------------------------------- work ahead

     A student who is ahead should be able to keep going. This lists the next
     school days' assignments so they can be ticked off from the same screen,
     without hunting through the calendar. */

  function renderWorkAhead(mount, childId, date) {
    const upcoming = [];
    let d = date;

    for (let i = 0; i < 10 && upcoming.length < 12; i++) {
      d = Store.nextSchoolDay(d);
      Store.lessonsOn(childId, d).forEach(l => {
        if (!Store.isLessonDone(l)) upcoming.push({ lesson: l, date: d });
      });
    }

    if (!upcoming.length) return;

    const card = h(`
      <div class="card" style="margin-top:22px">
        <div class="flex">
          <h2 style="margin:0">Work ahead</h2>
          <span class="chip">${upcoming.length} coming up</span>
          <button class="btn btn-sm right" id="toggle">${workAhead ? 'Hide' : 'Show'}</button>
        </div>
        <div class="small muted" style="margin-top:4px">
          Feeling ahead? Tick off future assignments from here. Nothing reschedules &mdash;
          finishing early just means less to do later.
        </div>
        <div id="list" style="margin-top:14px;${workAhead ? '' : 'display:none'}"></div>
      </div>
    `).firstElementChild;

    card.querySelector('#toggle').onclick = () => { workAhead = !workAhead; App.render(); };

    const list = card.querySelector('#list');

    upcoming.forEach(({ lesson, date: d2 }) => {
      const s = lesson.subject;
      const parts = Store.remainingParts(lesson);

      const block = h(`
        <div style="padding:10px 0;border-top:1px solid var(--border)">
          <div class="flex wrap" style="margin-bottom:6px">
            <span style="width:10px;height:10px;border-radius:3px;background:${esc(s.color)}"></span>
            <b style="color:${esc(s.color)}">${esc(s.name)}</b>
            <span class="muted small">${esc(lesson.title)}</span>
            <span class="chip right">${esc(fmtShort(d2))}</span>
          </div>
          <div class="parts" style="display:flex;flex-direction:column;gap:6px"></div>
        </div>
      `).firstElementChild;

      const wrap = block.querySelector('.parts');
      parts.forEach(p => {
        const line = h(`
          <label class="flex" style="gap:10px;cursor:pointer;padding:6px 10px;border-radius:8px;border:1px solid var(--border)">
            <span class="check" style="width:22px;height:22px;flex:0 0 22px;font-size:13px">&#10003;</span>
            <span class="small">${esc(p.text)}</span>
          </label>`).firstElementChild;

        line.onclick = e => {
          e.preventDefault();
          // Completed on the day it was ACTUALLY done, not the day it was planned for.
          // The portfolio should say when the child did the work.
          Store.togglePart(lesson.id, p.id, Store.today());

          // Working ahead closes the gap: the rest of this subject moves up.
          const moves = Scheduler.afterCompletion(lesson.curriculumId, Store.today());
          App.render();

          if (moves.length) {
            setTimeout(() => banner(
              `Nice — you're ahead in ${s.name}. ${moves.length} lesson${moves.length === 1 ? '' : 's'} ` +
              `moved earlier. Other subjects unchanged.`), 0);
          }
        };
        wrap.appendChild(line);
      });

      list.appendChild(block);
    });

    mount.appendChild(card);
  }

  /* --------------------------------------------- habits, inline on the Today page

     Every habit for the child, always shown. Not filtered, not dimmed: the parent
     asked for the whole list on this page, and a greyed-out row reads as broken
     rather than as "resting". Habits that are not scheduled for this weekday are
     simply labelled as such and can still be ticked. */

  function renderHabitsFor(mount, childId, date) {
    const list = Store.habits().filter(x => x.childId === childId);
    if (!list.length) return;

    const done = list.filter(x => Habits.isDone(x.id, date)).length;

    // Compact by design. Habits are a strip you sweep through in seconds, not a
    // section you study — so they get one tight row, and the streak sits inline
    // rather than on a second line doubling the height of every button.
    const card = h(`
      <div class="card" style="padding:12px 14px">
        <div class="flex" style="margin-bottom:8px">
          <h2 style="margin:0;font-size:15px">Daily habits</h2>
          <span class="chip ${done === list.length ? 'chip-good' : ''}">${done}/${list.length}</span>
          <button class="btn btn-sm right" data-go="habits" style="min-height:28px;padding:2px 10px">Streaks &rarr;</button>
        </div>
        <div class="flex wrap" id="hb" style="gap:6px"></div>
      </div>
    `).firstElementChild;

    const wrap = card.querySelector('#hb');

    list.forEach(hb => {
      const on = Habits.isDone(hb.id, date);
      const st = Habits.stats(hb, date);

      const btn = h(`
        <button class="btn" style="
            min-height:36px; padding:5px 12px; gap:8px; font-size:13px; border-radius:18px;
            border-color:${on ? esc(hb.color) : 'var(--border-2)'};
            background:${on ? esc(hb.color) : 'var(--surface)'};
            color:${on ? '#fff' : 'var(--text)'};">
          <span style="
              width:16px;height:16px;flex:0 0 16px;border-radius:5px;display:grid;place-items:center;
              font-size:11px;font-weight:700;pointer-events:none;
              border:2px solid ${on ? '#fff' : 'var(--border-2)'};
              background:${on ? '#fff' : 'transparent'};
              color:${on ? esc(hb.color) : 'transparent'};">&#10003;</span>
          <span>${esc(hb.icon || '')} ${esc(hb.name)}</span>
          ${st.current > 0
            ? `<span style="font-size:11px;opacity:.85;font-weight:600">&#128293;${st.current}</span>`
            : ''}
        </button>
      `).firstElementChild;

      btn.onclick = () => { Habits.toggle(hb.id, date); App.render(); };
      wrap.appendChild(btn);
    });

    mount.appendChild(card);
  }

  /* ================================================================= HABITS */

  let habitChild = null;

  function habits(root) {
    const children = Store.children();
    if (!habitChild || !Store.child(habitChild)) habitChild = children[0]?.id;

    const date = Store.today();
    const list = Store.habits().filter(x => x.childId === habitChild);

    root.appendChild(h(`
      <div class="page-head">
        <div>
          <h1>Daily Habits</h1>
          <div class="sub">${esc(fmtDay(date))}</div>
        </div>
        <div class="flex">
          <div class="segment" id="pick">
            ${children.map(c => `<button data-c="${esc(c.id)}" class="${c.id === habitChild ? 'on' : ''}">${esc(c.name)}</button>`).join('')}
          </div>
          <button class="btn btn-primary" id="addHabit">+ New habit</button>
        </div>
      </div>
      <div id="rows"></div>
    `));

    root.querySelector('#pick').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      habitChild = b.dataset.c; App.render();
    };
    root.querySelector('#addHabit').onclick = () => editHabit(null, habitChild);

    const rows = root.querySelector('#rows');

    if (!list.length) {
      rows.appendChild(h(`<div class="card empty"><div class="big">🌱</div><div>No habits yet. Add one to start a streak.</div></div>`));
      return;
    }

    list.forEach(hb => {
      const st = Habits.stats(hb, date);
      const due = Habits.isDue(hb, date);
      const on = Habits.isDone(hb.id, date);
      const hist = Habits.history(hb, 21, date);

      const row = h(`
        <div class="row" style="${due ? '' : 'opacity:.55'}">
          <div class="stripe" style="background:${esc(hb.color)}"></div>
          <button class="check ${on ? 'on' : ''}">✓</button>
          <div class="row-main">
            <div class="row-meta">
              <span class="row-subject">${esc(hb.icon || '')} ${esc(hb.name)}</span>
              ${st.current > 0 ? `<span class="chip chip-good">🔥 ${st.current} day streak</span>` : '<span class="chip">No streak yet</span>'}
              <span class="chip">Best ${st.longest}</span>
              <span class="chip">${st.rate}%</span>
              ${due ? '' : '<span class="chip chip-warn">Not scheduled today</span>'}
            </div>
            <div class="dots" style="margin-top:6px">
              ${hist.map(d => `<i class="${d.done ? 'done' : (d.due ? 'miss' : '')}" title="${d.date}"></i>`).join('')}
            </div>
          </div>
          <div class="row-actions">
            <button class="btn btn-sm" data-act="edit">Edit</button>
          </div>
        </div>
      `).firstElementChild;

      row.querySelector('.check').onclick = () => { Habits.toggle(hb.id, date); App.render(); };
      row.querySelector('[data-act="edit"]').onclick = () => editHabit(hb, habitChild);
      rows.appendChild(row);
    });
  }

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function editHabit(hb, childId) {
    const mask = hb ? hb.days : 0b0111110;
    Modal.open(hb ? 'Edit habit' : 'New habit', `
      <div class="field"><label>Name</label><input type="text" id="n" value="${esc(hb ? hb.name : '')}" placeholder="e.g. Morning skin care"></div>
      ${iconPickerHtml(hb ? hb.icon : '✅')}
      <div class="field"><label>Colour</label><input type="color" id="c" value="${esc(hb ? hb.color : '#0F6CBD')}" style="height:44px"></div>
      <div class="field">
        <label>Days</label>
        <div class="flex wrap">
          ${DAYS.map((d, i) => `<label class="chip" style="cursor:pointer;padding:8px 12px">
            <input type="checkbox" class="dw" data-d="${i}" ${(mask >> i) & 1 ? 'checked' : ''} style="width:auto;min-height:0"> ${d}</label>`).join('')}
        </div>
      </div>
      ${hb ? '<button class="btn btn-danger btn-sm" id="del">Archive this habit</button>' : ''}
    `, () => {
      let m = 0;
      document.querySelectorAll('.dw').forEach(cb => { if (cb.checked) m |= (1 << Number(cb.dataset.d)); });
      const rec = {
        name: document.querySelector('#n').value.trim() || 'Untitled',
        icon: document.querySelector('#i').value,
        color: document.querySelector('#c').value,
        days: m || Habits.EVERY_DAY
      };
      if (hb) Store.update('habits', hb.id, rec);
      else Store.add('habits', Object.assign({ childId, order: Store.habits().length, archived: false }, rec));
      App.render();
    }, () => {
      bindIconPicker();

      const d = document.querySelector('#del');
      if (d) d.onclick = () => {
        Store.update('habits', hb.id, { archived: true });
        Modal.close(); App.render();
      };
    });
  }

  /* =============================================================== SUBJECTS */

  function subjects(root) {
    const subs = Store.allSubjects();
    const children = Store.children();

    root.appendChild(h(`
      <div class="page-head">
        <div>
          <h1>Subjects</h1>
          <div class="sub">Nothing here is fixed. Add, rename, recolour, reorder, archive — no code changes ever needed.</div>
        </div>
        <button class="btn btn-primary" id="add">+ New subject</button>
      </div>
      <div class="card"><table>
        <thead><tr><th></th><th>Subject</th><th>Assigned to</th><th>Lessons</th><th></th></tr></thead>
        <tbody id="tb"></tbody>
      </table></div>
    `));

    root.querySelector('#add').onclick = () => editSubject(null);

    const tb = root.querySelector('#tb');
    subs.forEach((s, idx) => {
      const assigned = children.filter(c => Store.curriculumFor(c.id, s.id));
      const lessonCount = Store.curricula()
        .filter(c => c.subjectId === s.id)
        .reduce((n, c) => n + Store.sequence(c.id).length, 0);

      const tr = h(`
        <tr style="${s.archived ? 'opacity:.5' : ''}">
          <td style="width:86px;white-space:nowrap">
            <button class="btn btn-sm btn-icon" data-up   ${idx === 0 ? 'disabled' : ''} title="Move up">&uarr;</button>
            <button class="btn btn-sm btn-icon" data-down ${idx === subs.length - 1 ? 'disabled' : ''} title="Move down">&darr;</button>
          </td>
          <td>
            <span style="font-size:20px">${esc(s.icon || '')}</span>
            <b style="color:${esc(s.color)};margin-left:6px">${esc(s.name)}</b>
            ${s.archived ? '<span class="chip chip-warn" style="margin-left:8px">Archived</span>' : ''}
          </td>
          <td>${assigned.length ? assigned.map(c => `<span class="chip" style="margin-right:4px">${esc(c.name)}</span>`).join('') : '<span class="muted small">Nobody</span>'}</td>
          <td>${lessonCount}</td>
          <td style="text-align:right"><button class="btn btn-sm" data-edit>Edit</button></td>
        </tr>
      `).firstElementChild;

      tr.querySelector('[data-edit]').onclick = () => editSubject(s);
      tr.querySelector('[data-up]').onclick = () => reorder(subs, idx, -1);
      tr.querySelector('[data-down]').onclick = () => reorder(subs, idx, +1);

      tb.appendChild(tr);
    });
  }

  /**
   * Move one subject up or down.
   *
   * Renumbers the WHOLE list 0..n-1 rather than swapping two order values. Swapping
   * looks fine until two subjects end up sharing an order number (which they do, the
   * moment one is added while another is archived) — then the arrows start doing
   * nothing, or worse, silently reordering something else.
   */
  function reorder(list, idx, delta) {
    const next = idx + delta;
    if (next < 0 || next >= list.length) return;

    const arr = list.slice();
    const [moved] = arr.splice(idx, 1);
    arr.splice(next, 0, moved);

    arr.forEach((s, i) => Store.update('subjects', s.id, { order: i }));
    App.render();
  }

  /* A palette rather than a text box. Typing an emoji on a desktop keyboard is a
     genuine nuisance, and the free-text field is still there for anything not listed. */
  const ICONS = [
    '📘','📗','📕','📙','📐','📏','🧮','➗','∑','🔢',
    '🧬','🔬','⚗️','🧪','🦠','🌱','🌍','🔭','⚛️','🧲',
    '💻','⌨️','🖥️','⚡','🤖','🔌','🧠','🎯','🏆','🥇',
    '✍️','📝','📖','📚','🗞️','🎭','🎨','🖌️','🎵','🎹',
    '🏛️','🗺️','⏳','🕰️','⚔️','👑','🗽','🧭','📜','🏺',
    '✝️','🕊️','🙏','⛪','📿','🕯️','🌟','💡','🔍','🧩',
    '🇪🇸','🇨🇳','🇫🇷','🇩🇪','🇮🇹','🗣️','💬','🔤','🈁','🌐',
    '⚽','🏃','🏋️','🧘','🥋','🎽','🍎','🧴','🤝','⏰'
  ];

  function iconPickerHtml(current) {
    return `
      <div class="field">
        <label>Icon</label>
        <div id="iconGrid" style="
            display:grid; grid-template-columns:repeat(10, 1fr); gap:4px;
            max-height:180px; overflow-y:auto; padding:8px;
            border:1px solid var(--border-2); border-radius:8px; background:var(--surface-2)">
          ${ICONS.map(ic => `
            <button type="button" class="icon-opt" data-ic="${ic}" style="
              font-size:20px; line-height:1; padding:6px 0; cursor:pointer;
              border-radius:6px; border:2px solid ${ic === current ? 'var(--accent)' : 'transparent'};
              background:${ic === current ? 'var(--accent-soft)' : 'transparent'};">${ic}</button>`).join('')}
        </div>
        <div class="flex" style="margin-top:8px">
          <span class="small muted">Selected:</span>
          <span id="iconPreview" style="font-size:22px">${esc(current || '📘')}</span>
          <input type="text" id="i" value="${esc(current || '📘')}" maxlength="4"
                 style="max-width:90px;text-align:center" title="Or type/paste any character">
        </div>
      </div>`;
  }

  /** Wires the grid to the hidden text field. Call inside a Modal's afterRender. */
  function bindIconPicker() {
    const grid = document.querySelector('#iconGrid');
    const input = document.querySelector('#i');
    const preview = document.querySelector('#iconPreview');
    if (!grid || !input) return;

    grid.onclick = e => {
      const b = e.target.closest('.icon-opt');
      if (!b) return;

      input.value = b.dataset.ic;
      preview.textContent = b.dataset.ic;

      grid.querySelectorAll('.icon-opt').forEach(x => {
        const on = x === b;
        x.style.borderColor = on ? 'var(--accent)' : 'transparent';
        x.style.background = on ? 'var(--accent-soft)' : 'transparent';
      });
    };

    input.oninput = () => { preview.textContent = input.value; };
  }

  function editSubject(s) {
    const children = Store.children();
    Modal.open(s ? 'Edit subject' : 'New subject', `
      <div class="field"><label>Name</label><input type="text" id="n" value="${esc(s ? s.name : '')}" placeholder="e.g. Organic Chemistry"></div>
      ${iconPickerHtml(s ? s.icon : '📘')}
      <div class="field"><label>Colour</label><input type="color" id="c" value="${esc(s ? s.color : '#0F6CBD')}" style="height:44px"></div>
      <div class="field">
        <label>Assign to</label>
        <div class="flex wrap">
          ${children.map(c => `<label class="chip" style="cursor:pointer;padding:8px 12px">
            <input type="checkbox" class="ch" data-c="${esc(c.id)}"
              ${s && Store.curriculumFor(c.id, s.id) ? 'checked' : ''} style="width:auto;min-height:0"> ${esc(c.name)}</label>`).join('')}
        </div>
      </div>
      ${s ? `<button class="btn btn-danger btn-sm" id="arch">${s.archived ? 'Un-archive' : 'Archive this subject'}</button>` : ''}
    `, () => {
      const rec = {
        name: document.querySelector('#n').value.trim() || 'Untitled',
        icon: document.querySelector('#i').value,
        color: document.querySelector('#c').value
      };

      const subject = s
        ? Store.update('subjects', s.id, rec)
        : Store.add('subjects', Object.assign({ order: Store.allSubjects().length, archived: false }, rec));

      // Assigning a subject to a child = creating a curriculum for them. Un-assigning
      // soft-deletes it, so the completed history in the portfolio survives.
      document.querySelectorAll('.ch').forEach(cb => {
        const childId = cb.dataset.c;
        const existing = Store.curriculumFor(childId, subject.id);
        if (cb.checked && !existing) {
          Store.add('curricula', {
            childId, subjectId: subject.id,
            schoolYear: Store.settings.schoolYear, resources: ''
          });
        } else if (!cb.checked && existing) {
          Store.remove('curricula', existing.id);
        }
      });

      App.render();
    }, () => {
      bindIconPicker();

      const a = document.querySelector('#arch');
      if (a) a.onclick = () => {
        Store.update('subjects', s.id, { archived: !s.archived });
        Modal.close(); App.render();
      };
    });
  }

  /* ================================================================== TASKS */

  function tasks(root) {
    const list = Store.tasks().sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const today = Store.today();

    root.appendChild(h(`
      <div class="page-head">
        <div><h1>One-Time Tasks</h1><div class="sub">Appointments, forms, purchases, events</div></div>
        <button class="btn btn-primary" id="add">+ New task</button>
      </div>
      <div id="rows"></div>
    `));

    root.querySelector('#add').onclick = () => editTask(null);
    const rows = root.querySelector('#rows');

    if (!list.length) {
      rows.appendChild(h(`<div class="card empty"><div class="big">📋</div><div>No tasks yet.</div></div>`));
      return;
    }

    list.forEach(t => {
      const child = Store.child(t.childId);
      const late = !t.done && t.due && t.due < today;

      const row = h(`
        <div class="row ${t.done ? 'is-done' : ''}">
          <div class="stripe" style="background:${esc(child ? child.color : '#8A8A8A')}"></div>
          <button class="check ${t.done ? 'on' : ''}">✓</button>
          <div class="row-main">
            <div class="row-meta">
              <span class="row-subject">${esc(t.title)}</span>
              ${child ? `<span class="chip">${esc(child.name)}</span>` : '<span class="chip">Family</span>'}
              ${t.priority === 'high' ? '<span class="chip chip-high">High</span>' : ''}
              ${t.due ? `<span class="chip ${late ? 'chip-high' : 'chip-warn'}">${esc(fmtShort(t.due))}${late ? ' · overdue' : ''}</span>` : ''}
            </div>
            ${t.description ? `<div class="small muted">${esc(t.description)}</div>` : ''}
          </div>
          <div class="row-actions"><button class="btn btn-sm" data-e>Edit</button></div>
        </div>
      `).firstElementChild;

      row.querySelector('.check').onclick = () => {
        const next = !t.done;
        Store.update('tasks', t.id, { done: next });
        if (next) {
          Store.recordCompletion({
            kind: 'task', childId: t.childId,
            childName: child ? child.name : 'Family',
            title: t.title, category: 'One-time task', date: today, minutes: 0
          });
        }
        App.render();
      };
      row.querySelector('[data-e]').onclick = () => editTask(t);
      rows.appendChild(row);
    });
  }

  function editTask(t) {
    const children = Store.children();
    Modal.open(t ? 'Edit task' : 'New task', `
      <div class="field"><label>Title</label><input type="text" id="t" value="${esc(t ? t.title : '')}" placeholder="e.g. Science fair registration"></div>
      <div class="field"><label>Description</label><textarea id="d" rows="2">${esc(t ? t.description : '')}</textarea></div>
      <div class="field"><label>Child</label>
        <select id="c">
          <option value="">Family (nobody in particular)</option>
          ${children.map(c => `<option value="${esc(c.id)}" ${t && t.childId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Due date</label><input type="date" id="u" value="${esc(t ? t.due : '')}"></div>
      <div class="field"><label>Priority</label>
        <select id="p">
          <option value="normal" ${t && t.priority === 'normal' ? 'selected' : ''}>Normal</option>
          <option value="high" ${t && t.priority === 'high' ? 'selected' : ''}>High</option>
        </select>
      </div>
      ${t ? '<button class="btn btn-danger btn-sm" id="del">Delete task</button>' : ''}
    `, () => {
      const rec = {
        title: document.querySelector('#t').value.trim() || 'Untitled',
        description: document.querySelector('#d').value,
        childId: document.querySelector('#c').value || null,
        due: document.querySelector('#u').value || null,
        priority: document.querySelector('#p').value
      };
      if (t) Store.update('tasks', t.id, rec);
      else Store.add('tasks', Object.assign({ done: false, notes: '' }, rec));
      App.render();
    }, () => {
      const d = document.querySelector('#del');
      if (d) d.onclick = () => { Store.remove('tasks', t.id); Modal.close(); App.render(); };
    });
  }

  /* ============================================================== PORTFOLIO */

  function portfolio(root) {
    const all = Store.portfolio();
    const children = Store.children();

    root.appendChild(h(`
      <div class="page-head">
        <div>
          <h1>Educational Portfolio</h1>
          <div class="sub">Permanent record of everything completed. Nothing here is ever deleted.</div>
        </div>
        <button class="btn" id="csv">Export CSV</button>
      </div>
    `));

    root.querySelector('#csv').onclick = () => Reports.exportCsv(all);

    if (!all.length) {
      root.appendChild(h(`<div class="card empty"><div class="big">📚</div>
        <div>Nothing recorded yet. Complete a lesson or a habit and it will be preserved here forever.</div></div>`));
      return;
    }

    const grid = h(`<div class="grid grid-3" style="margin-bottom:18px"></div>`).firstElementChild;
    children.forEach(c => {
      const mine = all.filter(e => e.childId === c.id);
      const lessons = mine.filter(e => e.kind === 'lesson');
      const hours = Math.round(mine.reduce((n, e) => n + (e.minutes || 0), 0) / 60 * 10) / 10;

      grid.appendChild(h(`
        <div class="card">
          <div class="flex" style="margin-bottom:10px">
            <span style="width:12px;height:12px;border-radius:50%;background:${esc(c.color)}"></span>
            <h2 style="margin:0;color:${esc(c.color)}">${esc(c.name)}</h2>
          </div>
          <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
            <div class="stat"><div class="n">${lessons.length}</div><div class="l">Lessons completed</div></div>
            <div class="stat"><div class="n">${hours}</div><div class="l">Hours studied</div></div>
          </div>
        </div>`));
    });
    root.appendChild(grid);

    const table = h(`<div class="card"><h2>Complete history</h2><table>
      <thead><tr><th>Date</th><th>Child</th><th>Category</th><th>Subject</th><th>Item</th><th>Min</th></tr></thead>
      <tbody></tbody></table></div>`).firstElementChild;

    const tb = table.querySelector('tbody');
    [...all].reverse().slice(0, 300).forEach(e => {
      tb.appendChild(h(`<tr>
        <td>${esc(e.date || '')}</td>
        <td>${esc(e.childName || '')}</td>
        <td><span class="chip">${esc(e.category || e.kind)}</span></td>
        <td>${esc(e.subjectName || '—')}</td>
        <td>${esc(e.title || '')}</td>
        <td>${e.minutes || 0}</td>
      </tr>`));
    });
    root.appendChild(table);
  }

  /* =============================================================== SETTINGS */

  function settings(root) {
    root.appendChild(h(`
      <div class="page-head"><div><h1>Settings</h1><div class="sub">Mode, backup, and sync</div></div></div>

      <div class="card">
        <h2>School mode</h2>
        <div class="segment" id="mode">
          ${['Summer', 'School Year', 'Vacation', 'Custom'].map(m =>
            `<button data-m="${m}" class="${Store.settings.mode === m ? 'on' : ''}">${m}</button>`).join('')}
        </div>
        <div class="field mt"><label>School year</label>
          <input type="text" id="yr" value="${esc(Store.settings.schoolYear)}" style="max-width:220px">
        </div>
      </div>

      <div class="card">
        <h2>Backup</h2>
        <div class="sub" style="margin-bottom:12px">Your data lives in this browser. Download a copy any time — it is a plain JSON file.</div>
        <div class="flex wrap">
          <button class="btn" id="dl">Download backup</button>
          <button class="btn" id="up">Restore from backup</button>
          <input type="file" id="file" accept="application/json" hidden>
        </div>
      </div>

      <div class="card">
        <h2>Danger zone</h2>
        <div class="sub" style="margin-bottom:12px">Wipes everything and restores the starter content.</div>
        <button class="btn btn-danger" id="reset">Reset all data</button>
      </div>
    `));

    root.querySelector('#mode').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      Store.settings.mode = b.dataset.m; Store.save(); App.render();
    };
    root.querySelector('#yr').onchange = e => {
      Store.settings.schoolYear = e.target.value; Store.save();
    };
    root.querySelector('#dl').onclick = () => {
      const blob = new Blob([Store.export()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `family-dashboard-${Store.today()}.json`;
      a.click();
    };
    root.querySelector('#up').onclick = () => root.querySelector('#file').click();
    root.querySelector('#file').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          Store.replaceAll(JSON.parse(r.result));
          App.render();
          alert('Restored.');
        } catch { alert('That file could not be read.'); }
      };
      r.readAsText(f);
    };
    root.querySelector('#reset').onclick = () => {
      if (confirm('Erase everything and start again?')) { Store.reset(); App.render(); }
    };
  }

  return { dashboard, today, habits, subjects, tasks, portfolio, settings };
})();
