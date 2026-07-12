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
    let allLessons = [], allDone = 0, mins = 0, doneMins = 0, overdue = 0;
    children.forEach(c => {
      const ls = Store.lessonsOn(c.id, today);
      allLessons = allLessons.concat(ls);
      ls.forEach(l => {
        mins += l.minutes || 0;
        if (l.done) { allDone++; doneMins += l.minutes || 0; }
      });
    });

    Store.curricula().forEach(cur => {
      overdue += Store.sequence(cur.id).filter(l => !l.done && l.date && l.date < today).length;
    });

    const tasksDue = Store.tasks().filter(t => !t.done && t.due && t.due <= Store.addDays(today, 7));

    root.appendChild(h(`
      <div class="grid grid-4" style="margin-bottom:18px">
        <div class="card stat">
          <div class="n">${allDone}/${allLessons.length}</div>
          <div class="l">Lessons done today</div>
          <div class="bar mt" style="margin-top:8px"><i style="width:${pct(allDone, allLessons.length)}%"></i></div>
        </div>
        <div class="card stat">
          <div class="n">${Math.round(doneMins / 60 * 10) / 10}<span style="font-size:16px;color:var(--text-2)"> / ${Math.round(mins / 60 * 10) / 10} h</span></div>
          <div class="l">Hours completed / planned</div>
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

  function today(root) {
    const children = Store.children();
    if (!todayChild || !Store.child(todayChild)) todayChild = children[0]?.id;
    if (!todayDate) todayDate = Store.today();

    const child = Store.child(todayChild);
    const date = todayDate;
    const lessons = Store.lessonsOn(todayChild, date);
    const done = lessons.filter(l => l.done).length;

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
        <button class="btn btn-icon" id="prevDay" title="Previous day">‹</button>
        <button class="btn" id="goToday">Today</button>
        <button class="btn btn-icon" id="nextDay" title="Next day">›</button>
        <div class="right" style="min-width:220px">
          <div class="small muted">${done} of ${lessons.length} complete</div>
          <div class="bar" style="margin-top:6px"><i style="width:${pct(done, lessons.length)}%"></i></div>
        </div>
      </div>
      <div id="banner"></div>
      <div id="rows"></div>
    `));

    root.querySelector('#childPick').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      todayChild = b.dataset.c; App.render();
    };
    root.querySelector('#prevDay').onclick = () => { todayDate = Store.addDays(date, -1); App.render(); };
    root.querySelector('#nextDay').onclick = () => { todayDate = Store.addDays(date, 1); App.render(); };
    root.querySelector('#goToday').onclick = () => { todayDate = Store.today(); App.render(); };

    const rows = root.querySelector('#rows');

    if (!lessons.length) {
      rows.appendChild(h(`
        <div class="card empty">
          <div class="big">🎉</div>
          <div>Nothing scheduled for ${esc(child ? child.name : '')} on this day.</div>
        </div>`));
      return;
    }

    lessons.forEach(l => {
      const s = l.subject;
      const cls = l.done ? 'is-done' : (l.skipped ? 'is-skipped' : '');

      const row = h(`
        <div class="row ${cls}">
          <div class="stripe" style="background:${esc(s.color)}"></div>
          <button class="check ${l.done ? 'on' : ''}" title="Complete">✓</button>
          <div class="row-main">
            <div class="row-meta">
              <span class="row-subject" style="color:${esc(s.color)}">${esc(s.icon)} ${esc(s.name)}</span>
              <span class="chip">${l.minutes} min</span>
              ${l.priority === 'high' ? '<span class="chip chip-high">High</span>' : ''}
              ${l.pinned ? '<span class="chip chip-info">📌 Fixed date</span>' : ''}
              ${l.skipped ? '<span class="chip chip-warn">Skipped</span>' : ''}
            </div>
            <div class="row-title">${esc(l.title)}</div>
            ${l.notes ? `<div class="small muted">${esc(l.notes)}</div>` : ''}
          </div>
          <div class="row-actions">
            <button class="btn btn-sm" data-act="skip"  ${l.done ? 'disabled' : ''}>Skip</button>
            <button class="btn btn-sm" data-act="move"  ${l.done ? 'disabled' : ''}>Move to tomorrow</button>
            <button class="btn btn-sm" data-act="note">Notes</button>
          </div>
        </div>
      `).firstElementChild;

      row.querySelector('.check').onclick = () => complete(l);
      row.querySelector('[data-act="skip"]').onclick = () => skip(l);
      row.querySelector('[data-act="move"]').onclick = () => move(l);
      row.querySelector('[data-act="note"]').onclick = () => noteDialog(l);

      rows.appendChild(row);
    });

    function banner(msg) {
      const b = root.querySelector('#banner');
      b.innerHTML = '';
      b.appendChild(h(`<div class="banner">ℹ️ <span>${esc(msg)}</span></div>`));
    }

    function complete(l) {
      const next = !l.done;
      Store.update('lessons', l.id, { done: next, skipped: false, completedOn: next ? Store.nowIso() : null });

      if (next) {
        // permanent portfolio entry — this is the record that is never deleted
        Store.recordCompletion({
          kind: 'lesson',
          childId: child.id,
          childName: child.name,
          subjectId: l.subject.id,
          subjectName: l.subject.name,     // denormalised on purpose: renaming a
          title: l.title,                  // subject later must not corrupt history
          category: 'Lesson',
          assignedDate: l.date,
          date,
          minutes: l.minutes || 0,
          notes: l.notes || ''
        });
      }
      App.render();
    }

    /** Skip = we are NOT doing this and NOT making it up. Nothing shifts. */
    function skip(l) {
      Store.update('lessons', l.id, { skipped: true, done: false });
      App.render();
      setTimeout(() => banner(`${l.subject.name}: skipped. The rest of ${l.subject.name} did not move.`), 0);
    }

    /** Move to tomorrow = the rule. This subject slides; the others do not. */
    function move(l) {
      const r = Scheduler.shiftCurriculum(l.curriculumId, date);
      App.render();
      if (r) {
        setTimeout(() => banner(
          `${l.subject.name} moved to ${fmtShort(r.to)}. ` +
          `${r.moved} ${l.subject.name} lesson${r.moved === 1 ? '' : 's'} shifted to keep the sequence. ` +
          `Other subjects unchanged.`), 0);
      }
    }

    function noteDialog(l) {
      Modal.open('Notes — ' + l.title, `
        <div class="field">
          <label>Notes</label>
          <textarea id="n" rows="5">${esc(l.notes || '')}</textarea>
        </div>`, () => {
        Store.update('lessons', l.id, { notes: document.querySelector('#n').value });
        App.render();
      });
    }
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
      <div class="field"><label>Icon</label><input type="text" id="i" value="${esc(hb ? hb.icon : '✅')}" maxlength="2"></div>
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
          <td style="width:60px">
            <button class="btn btn-sm btn-icon" data-up ${idx === 0 ? 'disabled' : ''}>↑</button>
          </td>
          <td>
            <span style="font-size:18px">${esc(s.icon || '')}</span>
            <b style="color:${esc(s.color)};margin-left:6px">${esc(s.name)}</b>
            ${s.archived ? '<span class="chip chip-warn" style="margin-left:8px">Archived</span>' : ''}
          </td>
          <td>${assigned.length ? assigned.map(c => `<span class="chip" style="margin-right:4px">${esc(c.name)}</span>`).join('') : '<span class="muted small">Nobody</span>'}</td>
          <td>${lessonCount}</td>
          <td style="text-align:right"><button class="btn btn-sm" data-edit>Edit</button></td>
        </tr>
      `).firstElementChild;

      tr.querySelector('[data-edit]').onclick = () => editSubject(s);
      const up = tr.querySelector('[data-up]');
      if (up) up.onclick = () => {
        const prev = subs[idx - 1];
        Store.update('subjects', s.id, { order: prev.order });
        Store.update('subjects', prev.id, { order: s.order });
        App.render();
      };
      tb.appendChild(tr);
    });
  }

  function editSubject(s) {
    const children = Store.children();
    Modal.open(s ? 'Edit subject' : 'New subject', `
      <div class="field"><label>Name</label><input type="text" id="n" value="${esc(s ? s.name : '')}" placeholder="e.g. Organic Chemistry"></div>
      <div class="field"><label>Icon</label><input type="text" id="i" value="${esc(s ? s.icon : '📘')}" maxlength="2"></div>
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
