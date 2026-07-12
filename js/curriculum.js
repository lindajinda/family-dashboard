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

    const done = seq.filter(l => Store.isLessonDone(l)).length;
    const remaining = seq.length - done;

    // Progress in assignments, since a day is several of them.
    const allParts = seq.reduce((n, l) => n + Store.partsOf(l).length, 0);
    const doneParts = seq.reduce((n, l) => n + Store.partsOf(l).filter(p => p.done).length, 0);

    const lastDate = seq.filter(l => l.date).map(l => l.date).sort().pop();

    root.appendChild(h(`
      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="card stat"><div class="n">${pct(doneParts, allParts)}%</div><div class="l">Complete</div>
          <div class="bar" style="margin-top:8px"><i style="width:${pct(doneParts, allParts)}%;background:${esc(subject.color)}"></i></div></div>
        <div class="card stat"><div class="n">${done}</div><div class="l">Days finished</div></div>
        <div class="card stat"><div class="n">${remaining}</div><div class="l">Days remaining</div></div>
        <div class="card stat"><div class="n">${esc(fmt(lastDate))}</div><div class="l">Estimated finish</div></div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="flex wrap">
          <button class="btn btn-primary btn-lg" id="paste">📋 Paste lesson list</button>
          <button class="btn btn-lg" id="upload">📄 Upload CSV file</button>
          <input type="file" id="file" accept=".csv,.txt" hidden>
          <button class="btn" id="redate">📆 Reschedule from a date</button>
          <span class="right small muted">${seq.length} day${seq.length === 1 ? '' : 's'} &middot; ${allParts} assignment${allParts === 1 ? '' : 's'}</span>
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
      <thead><tr><th style="width:40px">#</th><th>Day's assignment</th><th style="width:110px">Date</th>
      <th style="width:110px">Progress</th><th style="width:150px"></th></tr></thead>
      <tbody></tbody></table></div>`).firstElementChild;

    const tb = table.querySelector('tbody');
    seq.forEach(l => {
      const parts = Store.partsOf(l);
      const d = parts.filter(p => p.done).length;
      const allDone = Store.isLessonDone(l);

      const tr = h(`<tr style="${allDone ? 'opacity:.55' : ''}">
        <td class="muted">${l.seq}</td>
        <td>
          <b>${esc(l.title)}</b>
          ${l.pinned ? '<span class="chip chip-info" style="margin-left:6px">📌 Fixed</span>' : ''}
          <div class="small muted" style="margin-top:3px">
            ${parts.map(p => `<span style="${p.done ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(p.text)}</span>`).join(' &nbsp;·&nbsp; ')}
          </div>
          ${l.notes ? `<div class="small muted" style="margin-top:3px">${esc(l.notes)}</div>` : ''}
        </td>
        <td class="small">${esc(fmt(l.date))}</td>
        <td>
          <span class="chip ${allDone ? 'chip-good' : (d ? 'chip-warn' : '')}">${d}/${parts.length}</span>
        </td>
        <td style="text-align:right">
          <button class="btn btn-sm" data-edit>Edit</button>
          <button class="btn btn-sm btn-danger" data-del ${allDone ? 'disabled title="Completed work is permanent"' : ''}>Delete</button>
        </td>
      </tr>`).firstElementChild;

      tr.querySelector('[data-edit]').onclick = () => editLesson(l);
      const del = tr.querySelector('[data-del]');
      if (!allDone) del.onclick = () => { Store.remove('lessons', l.id); App.render(); };

      tb.appendChild(tr);
    });
    root.appendChild(table);
  }

  /* ------------------------------------------------------------------ dialogs */

  function pasteDialog(curriculumId, subject, prefill) {
    const start = Store.today();

    Modal.open(`Add lessons to ${subject.name}`, `
      <div class="small muted" style="margin-bottom:12px">
        <b>One line per day.</b> The first thing on the line is the day's title.
        Everything after it, separated by <b>|</b>, becomes a separate assignment your
        child ticks off on its own — a reading, a problem set, a reading from another book:
        <div style="margin:6px 0"><code>Chapter 3: Cells | Read pp. 20-34 | Problem set 3.1 | Campbell ch. 2</code></div>
        A line with no <b>|</b> is simply a one-assignment day. Commas and tabs work too,
        so you can paste straight out of Excel.
        <a href="#" id="tmpl">Download a CSV template</a>
      </div>

      <div class="field">
        <textarea id="txt" rows="10" placeholder="Chapter 1: Introduction | Read pp. 1-18 | Questions 1-10
Chapter 2: The Cell | Read pp. 19-40 | Problem set 2 | Lab video
Chapter 3: Photosynthesis">${esc(prefill || '')}</textarea>
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

      // Generated here rather than linked as a file, so it works identically whether
      // the app is opened from disk or served from GitHub Pages.
      document.querySelector('#tmpl').onclick = e => {
        e.preventDefault();
        const csv = [
          'Title,Assignment 1,Assignment 2,Assignment 3',
          'Chapter 1: Introduction,Read pp. 1-18,Questions 1-10,',
          'Chapter 2: The Cell,Read pp. 19-40,Problem set 2,Watch lab video',
          'Chapter 3: Photosynthesis,Read pp. 41-58,,',
          'Unit 1 Exam,Sit the exam,,'
        ].join('\n');

        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = 'curriculum-template.csv';
        a.click();
      };

      const update = () => {
        const { lessons } = Importer.parse(txt.value);
        if (!lessons.length) { prev.innerHTML = ''; return; }
        const totalParts = lessons.reduce((n, l) => n + l.parts.length, 0);
        const sample = lessons.slice(0, 3).map(l =>
          `<li><b>${esc(l.title)}</b>
             <ul style="margin:2px 0 0 16px">
               ${l.parts.map(p => `<li>${esc(p)}</li>`).join('')}
             </ul>
           </li>`).join('');

        prev.innerHTML = `<div class="banner" style="display:block">
            <b>${lessons.length} day${lessons.length === 1 ? '' : 's'}</b>,
            <b>${totalParts} assignment${totalParts === 1 ? '' : 's'}</b> in total,
            one day per school day.
            <ul style="margin:8px 0 0 18px">${sample}</ul>
            ${lessons.length > 3 ? `<div class="small muted" style="margin-top:4px">…and ${lessons.length - 3} more day${lessons.length - 3 === 1 ? '' : 's'}</div>` : ''}
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
    const parts = Store.partsOf(l);

    Modal.open('Edit day', `
      <div class="field"><label>Title</label><input type="text" id="t" value="${esc(l.title)}"></div>

      <div class="field">
        <label>Assignments for this day</label>
        <div class="small muted" style="margin-bottom:6px">One per line. Each is ticked off separately.</div>
        <textarea id="p" rows="5">${esc(parts.map(p => p.text).join('\n'))}</textarea>
        ${parts.some(p => p.done)
          ? '<div class="small muted" style="margin-top:6px">⚠️ Some of these are already completed. Editing the text keeps them completed; removing a line removes it entirely.</div>'
          : ''}
      </div>

      <div class="field"><label>Notes</label><textarea id="n" rows="2">${esc(l.notes || '')}</textarea></div>
      <div class="field"><label>Date</label><input type="date" id="d" value="${esc(l.date || '')}"></div>

      <div class="field">
        <label class="flex" style="font-weight:600">
          <input type="checkbox" id="f" ${l.pinned ? 'checked' : ''} style="width:auto;min-height:0">
          <span>Fixed date — never move this one</span>
        </label>
        <div class="small muted">For exams and co-op classes. Rescheduling pushes other work past it.</div>
      </div>
    `, () => {
      const lines = document.querySelector('#p').value
        .split('\n').map(s => s.trim()).filter(Boolean);

      // Preserve the done flag of any assignment whose text is unchanged. Retyping a
      // line should not silently un-complete work the child has already finished.
      const byText = {};
      parts.forEach(p => { byText[p.text] = p; });

      const next = lines.map(text => {
        const old = byText[text];
        return old
          ? { id: old.id, text, done: old.done, doneOn: old.doneOn }
          : { id: Store.uid(), text, done: false, doneOn: null };
      });

      Store.update('lessons', l.id, {
        title: document.querySelector('#t').value.trim() || l.title,
        parts: next.length ? next : parts,        // never leave a day with no assignments
        notes: document.querySelector('#n').value,
        date: document.querySelector('#d').value || null,
        pinned: document.querySelector('#f').checked
      });

      // recompute the cached roll-up
      const fresh = Store.lesson(l.id);
      Store.update('lessons', l.id, { done: Store.isLessonDone(fresh) });

      App.render();
    });
  }

  return { render };
})();
