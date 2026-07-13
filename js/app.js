/* =============================================================================
   app.js — navigation, modal, CSV export, boot.
   ============================================================================= */

const Modal = (() => {
  'use strict';
  let bg = null;

  function open(title, bodyHtml, onSave, afterRender) {
    close();
    bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal">
        <h2>${title}</h2>
        <div id="mbody">${bodyHtml}</div>
        <div class="modal-actions">
          <button class="btn" id="mcancel">Cancel</button>
          <button class="btn btn-primary" id="msave">Save</button>
        </div>
      </div>`;
    document.body.appendChild(bg);

    bg.querySelector('#mcancel').onclick = close;
    bg.querySelector('#msave').onclick = () => { onSave && onSave(); close(); };
    bg.onclick = e => { if (e.target === bg) close(); };
    document.addEventListener('keydown', esc);

    if (afterRender) afterRender();
    const first = bg.querySelector('input, textarea, select');
    if (first) first.focus();
  }

  function esc(e) { if (e.key === 'Escape') close(); }

  function close() {
    if (bg) { bg.remove(); bg = null; }
    document.removeEventListener('keydown', esc);
  }

  return { open, close };
})();


const Reports = (() => {
  'use strict';

  const COLS = [
    ['date',        'Date'],
    ['childName',   'Child'],
    ['category',    'Type'],
    ['subjectName', 'Subject'],
    ['lessonTitle', 'Day'],
    ['title',       'Assignment'],
    ['assignedDate','Planned for'],
    ['schoolYear',  'School year'],
    ['mode',        'Mode']
  ];

  const cell = v => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  function exportCsv(rows) {
    const head = COLS.map(c => c[1]).join(',');
    const body = [...rows]
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))   // oldest first reads better
      .map(r => COLS.map(c => cell(r[c[0]])).join(','))
      .join('\n');

    // The BOM matters: without it Excel opens UTF-8 CSVs as Latin-1 and mangles every
    // accented name and emoji in the file.
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `portfolio-${Store.today()}.csv`;
    a.click();
  }

  return { exportCsv };
})();


const App = (() => {
  'use strict';

  // Today first, and it is where you land. It is the page you actually work from
  // every day; the Overview is a summary you glance at, not a place you start.
  const NAV = [
    { id: 'today',     label: 'Today',      icon: '📅' },
    { id: 'habits',    label: 'Habits',     icon: '✅' },
    { id: 'dashboard', label: 'Overview',   icon: '🏠' },
    { sep: true },
    { id: 'curriculum',label: 'Curriculum', icon: '📖' },
    { id: 'subjects',  label: 'Subjects',   icon: '📚' },
    { id: 'tasks',     label: 'Tasks',      icon: '📋' },
    { id: 'portfolio', label: 'Portfolio',  icon: '🏆' },
    { sep: true },
    { id: 'settings',  label: 'Settings',   icon: '⚙️' }
  ];

  let page = 'today';

  function go(id, opts) {
    page = id;
    if (opts && opts.child) Pages.__setChild && Pages.__setChild(opts.child);
    render();
  }

  function render() {
    const nav = document.querySelector('#nav');
    const main = document.querySelector('#main');

    nav.innerHTML = `
      <div class="brand"><span class="logo">🎓</span> Family Dashboard</div>
      ${NAV.map(n => n.sep
        ? '<div class="nav-sep"></div>'
        : `<button class="nav-item ${n.id === page ? 'active' : ''}" data-p="${n.id}">
             <span class="ico">${n.icon}</span> ${n.label}
           </button>`).join('')}
      <div style="flex:1"></div>
      <button class="nav-item" data-p="settings" id="syncPill" style="font-size:11px;color:var(--text-2)">
        <span class="ico" id="syncDot">•</span> <span id="syncText">Saved locally</span>
      </button>
    `;

    paintSync();

    nav.onclick = e => {
      const b = e.target.closest('.nav-item');
      if (b) go(b.dataset.p);
    };

    main.innerHTML = '';
    const view = page === 'curriculum' ? CurriculumPage.render : (Pages[page] || Pages.today);
    view(main);

    // let any page put a "go to page" button anywhere
    main.querySelectorAll('[data-go]').forEach(b => {
      b.onclick = () => go(b.dataset.go);
    });
  }

  /** The sidebar tells you, at a glance, whether your work is safe. */
  function paintSync() {
    const dot = document.querySelector('#syncDot');
    const txt = document.querySelector('#syncText');
    if (!dot || !txt) return;

    const st = Sync.status();
    const look = {
      off:     ['•', 'Saved locally',  'var(--text-3)'],
      syncing: ['↻', 'Syncing…',       'var(--accent)'],
      ok:      ['✓', 'Synced',         'var(--green)'],
      error:   ['!', 'Sync problem',   'var(--red)']
    }[st.status] || ['•', 'Saved locally', 'var(--text-3)'];

    dot.textContent = look[0];
    txt.textContent = look[1];
    dot.style.color = look[2];
  }

  function boot() {
    Store.load();

    // Anything left unfinished in the past is dragged forward, one curriculum at
    // a time, so coming back after a week away does not strand work in the past.
    const moved = Scheduler.rollForwardOverdue(Store.today());
    if (moved.length) console.info(`Rolled ${moved.length} overdue lesson group(s) forward.`);

    render();

    // Sync runs itself from here: once now, after every change, whenever the tab
    // regains focus, and every few minutes.
    Sync.onStatus(paintSync);
    Sync.start();
  }

  return { go, render, boot };
})();

window.addEventListener('DOMContentLoaded', App.boot);
