/* =============================================================================
   curriculum.js — the Curriculum page.

   Pick a child and a subject, see the whole lesson sequence, and load a real
   curriculum into it by pasting a list or dropping in a CSV.
   ============================================================================= */

const CurriculumPage = (() => {
  'use strict';

  const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 100));
  const fmt = k => (k ? Store.fromKey(k).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '—');

  let childId = null;
  let subjectId = null;

  function render(root) {
    const children = Store.children();
    const subjects = Store.subjects();

    if (!childId || !Store.child(childId)) childId = children[0]?.id;

    // subjects this child actually takes
    const mine = subjects.filter(s => Store.curriculumFor(childId, s.id));
    if (!subjectId || !mine.some(s => s.id === subjectId)) subjectId = mine[0]?.id;

    root.appendChild(h(`
      <div class="page-head">
        <div>
          <h1>Curriculum</h1>
          <div class="sub">Load your real lesson list for each subject. Paste it or upload a file.</div>
        </div>
        <div class="segment" id="pickChild">
          ${children.map(c => `<button data-c="${esc(c.id)}" class="${c.id === childId ? 'on' : ''}">${esc(c.name)}</button>`).join('')}
        </div>
      </div>
    `));

    root.querySelector('#pickChild').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      childId = b.dataset.c; subjectId = null; App.render();
    };

    if (!mine.length) {
      root.appendChild(h(`
        <div class="card empty">
          <div class="big">📚</div>
          <div>${esc(Store.child(childId)?.name || 'This child')} isn't assigned any subjects yet.</div>
          <button class="btn btn-primary mt" data-go="subjects">Go to Subjects</button>
        </div>`));
      return;
    }

    // subject picker
    const picker = h(`<div class="card" style="margin-bottom:16px"><div class="flex wrap" id="subs"></div></div>`).firstElementChild;
    const subs = picker.querySelector('#subs');
    mine.forEach(s => {
      const on = s.id === subjectId;
      const b = h(`<button class="btn ${on ? 'btn-primary' : ''}" data-s="${esc(s.id)}"
                     style="${on ? `background:${esc(s.color)};border-color:${esc(s.color)}` : ''}">
                     ${esc(s.icon || '')} ${esc(s.name)}</button>`).firstElementChild;
      b.onclick = () => { subjectId = s.id; App.render(); };
      subs.appendChild(b);
    });
    root.appendChild(picker);

    const subject = Store.subject(subjectId);
    const cur = Store.curriculumFor(childId, subjectId);
    const seq = Store.sequence(cur.id);
    const done = seq.filter(l => l.done).length;
    const remaining = seq.length - done;
    const hours = Math.round(seq.reduce((n, l) => n + (l.minutes || 0), 0) / 60 * 10) / 10;
    const lastDate = seq.filter(l => l.date).map(l => l.date).sort().pop();

    root.appendChild(h(`
      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="card stat"><div class="n">${pct(done, seq.length)}%</div><div class="l">Complete</div>
          <div class="bar" style="margin-top:8px"><i style="width:${pct(done, seq.length)}%;background:${esc(subject.color)}"></i></div></div>
        <div class="card stat"><div class="n">${done}</div><div class="l">Lessons done</div></div>
        <div class="card stat"><div class="n">${remaining}</div><div class="l">Remaining</div></div>
        <div class="card stat"><div class="n">${esc(fmt(lastDate))}</div><div class="l">Estimated finish</div></div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="flex wrap">
          <button class="btn btn-primary btn-lg" id="paste">📋 Paste lesson list</button>
          <button class="btn btn-lg" id="upload">📄 Upload CSV file</button>
          <input type="file" id="file" accept=".csv,.txt" hidden>
          <button class="btn" id="redate">📆 Reschedule from a date</button>
          <span class="right small muted">${seq.length} lesson${seq.length === 1 ? '' : 's'} &middot; ${hours} h total</span>
        </div>
      </div>
    `));

    root.querySelector('#paste').onclick = () => pasteDialog(cur.id, subject);
    root.querySelector('#upload').onclick = () => root.querySelector('#file').click();
    root.querySelector('#file').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => pasteDialog(cur.id, subject, String(r.result));
      r.readAsText(f);
    };
    root.querySelector('#redate').onclick = () => redateDialog(cur.id);

    // ---- the lesson list ----
    if (!seq.length) {
      root.appendChild(h(`
        <div class="card empty">
          <div class="big">📥</div>
          <div>No lessons in ${esc(subject.name)} yet.</div>
          <div class="small muted" style="margin-top:6px">Paste your chapter list and it will be scheduled across school days automatically.</div>
        </div>`));
      return;
    }

    const table = h(`<div class="card"><table>
      <thead><tr><th style="width:40px">#</th><th>Lesson</th><th style="width:110px">Date</th>
      <th style="width:70px">Min</th><th style="width:90px">Status</th><th style="width:150px"></th></tr></thead>
      <tbody></tbody></table></div>`).firstElementChild;

    const tb = table.querySelector('tbody');
    seq.forEach(l => {
      const tr = h(`<tr style="${l.done ? 'opacity:.55' : ''}">
        <td class="muted">${l.seq}</td>
        <td>
          <b>${esc(l.title)}</b>
          ${l.pinned ? '<span class="chip chip-info" style="margin-left:6px">📌 Fixed</span>' : ''}
          ${l.notes ? `<div class="small muted">${esc(l.notes)}</div>` : ''}
        </td>
        <td class="small">${esc(fmt(l.date))}</td>
        <td class="small">${l.minutes}</td>
        <td>${l.done ? '<span class="chip chip-good">Done</span>' : '<span class="chip">Planned</span>'}</td>
        <td style="text-align:right">
          <button class="btn btn-sm" data-edit>Edit</button>
          <button class="btn btn-sm btn-danger" data-del ${l.done ? 'disabled title="Completed work is permanent"' : ''}>Delete</button>
        </td>
      </tr>`).firstElementChild;

      tr.querySelector('[data-edit]').onclick = () => editLesson(l);
      const del = tr.querySelector('[data-del]');
      if (!l.done) del.onclick = () => { Store.remove('lessons', l.id); App.render(); };

      tb.appendChild(tr);
    });
    root.appendChild(table);
  }

  /* ------------------------------------------------------------------ dialogs */

  function pasteDialog(curriculumId, subject, prefill) {
    const start = Store.today();

    Modal.open(`Add lessons to ${subject.name}`, `
      <div class="small muted" style="margin-bottom:12px">
        One lesson per line. Paste straight from a book's contents page, a syllabus or a spreadsheet column.<br>
        Optionally add minutes and notes after a <b>|</b> &nbsp;—&nbsp; e.g.
        <code>Chapter 3: Cells | 45 | Read pp. 20-34</code>
      </div>

      <div class="field">
        <textarea id="txt" rows="10" placeholder="Chapter 1: Introduction
Chapter 2: The Cell | 45
Chapter 3: Photosynthesis | 60 | Watch the lab video first">${esc(prefill || '')}</textarea>
      </div>

      <div class="field">
        <label>Start scheduling from</label>
        <input type="date" id="start" value="${esc(start)}">
      </div>

      <div class="field">
        <label>If this subject already has lessons</label>
        <select id="mode">
          <option value="append">Add these after the existing ones</option>
          <option value="replace">Replace the unfinished ones with these</option>
        </select>
        <div class="small muted" style="margin-top:6px">Completed lessons are never removed either way.</div>
      </div>

      <div id="preview" class="small muted"></div>
    `, () => {
      const text = document.querySelector('#txt').value;
      const startDate = document.querySelector('#start').value || start;
      const mode = document.querySelector('#mode').value;

      const { lessons } = Importer.parse(text);
      if (!lessons.length) { alert('No lessons found. Put one lesson on each line.'); return; }

      Importer.apply(curriculumId, lessons, startDate, mode);
      App.render();
    }, () => {
      const txt = document.querySelector('#txt');
      const prev = document.querySelector('#preview');

      const update = () => {
        const { lessons } = Importer.parse(txt.value);
        if (!lessons.length) { prev.innerHTML = ''; return; }
        const sample = lessons.slice(0, 3)
          .map(l => `<li><b>${esc(l.title)}</b> &middot; ${l.minutes} min${l.notes ? ' &middot; ' + esc(l.notes) : ''}</li>`)
          .join('');
        prev.innerHTML = `<div class="banner" style="display:block">
            <b>${lessons.length} lesson${lessons.length === 1 ? '' : 's'}</b> will be added, one per school day.
            <ul style="margin:8px 0 0 18px">${sample}</ul>
            ${lessons.length > 3 ? `<div class="small muted" style="margin-top:4px">…and ${lessons.length - 3} more</div>` : ''}
          </div>`;
      };

      txt.oninput = update;
      update();
    });
  }

  function redateDialog(curriculumId) {
    Modal.open('Reschedule this subject', `
      <div class="small muted" style="margin-bottom:12px">
        Lays every unfinished lesson out again from the date you choose, one per school day,
        keeping them in order. Weekends and holidays are skipped. Completed lessons and
        fixed-date lessons are left alone.
      </div>
      <div class="field"><label>Start from</label><input type="date" id="d" value="${esc(Store.today())}"></div>
    `, () => {
      Importer.layOutIncomplete(curriculumId, document.querySelector('#d').value || Store.today());
      App.render();
    });
  }

  function editLesson(l) {
    Modal.open('Edit lesson', `
      <div class="field"><label>Title</label><input type="text" id="t" value="${esc(l.title)}"></div>
      <div class="field"><label>Notes</label><textarea id="n" rows="3">${esc(l.notes || '')}</textarea></div>
      <div class="field"><label>Date</label><input type="date" id="d" value="${esc(l.date || '')}"></div>
      <div class="field"><label>Minutes</label><input type="number" id="m" value="${l.minutes}" min="5" max="480"></div>
      <div class="field">
        <label class="flex" style="font-weight:600">
          <input type="checkbox" id="p" ${l.pinned ? 'checked' : ''} style="width:auto;min-height:0">
          <span>Fixed date — never move this one</span>
        </label>
        <div class="small muted">For exams, co-op classes, anything booked. Rescheduling pushes other work past it.</div>
      </div>
    `, () => {
      Store.update('lessons', l.id, {
        title: document.querySelector('#t').value.trim() || l.title,
        notes: document.querySelector('#n').value,
        date: document.querySelector('#d').value || null,
        minutes: Number(document.querySelector('#m').value) || l.minutes,
        pinned: document.querySelector('#p').checked
      });
      App.render();
    });
  }

  return { render };
})();
