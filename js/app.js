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

  // What a child gets. Everything they need to do their day, and nothing else: no
  // Curriculum to rearrange, no Portfolio to edit, no Settings holding the token.
  const KID_NAV = [
    { id: 'today',  label: 'Today',  icon: '📅' },
    { id: 'habits', label: 'Habits', icon: '✅' }
  ];

  let page = 'today';

  function go(id, opts) {
    page = id;
    if (opts && opts.child) Pages.__setChild && Pages.__setChild(opts.child);
    render();
  }

  /**
   * The two typeface knobs from Settings → Text, pushed onto <body> where the CSS can
   * act on them. The defaults are the readable ones — Verdana, bold — because that is
   * the point of the setting; "Standard" and "Normal" are the ones you opt back into.
   */
  function applyText() {
    const s = Store.settings || {};
    document.body.classList.toggle('font-verdana', (s.font || 'verdana') === 'verdana');
    document.body.classList.toggle('text-bold', s.bold !== false);
  }

  function render() {
    const nav = document.querySelector('#nav');
    const main = document.querySelector('#main');

    applyText();

    const kid = Device.child();          // null on a parent device — the normal case
    const items = kid ? KID_NAV : NAV;

    // A kid device must not be able to reach a hidden page by any route: not by a
    // stale `page` left over from before it was locked, and not by a [data-go] button
    // buried in a card. Everything funnels through here, so this one line holds.
    if (kid && !items.some(n => n.id === page)) page = 'today';

    nav.innerHTML = `
      <div class="brand"><span class="logo">🎓</span> <span id="brandName">Family Dashboard</span></div>
      ${items.map(n => n.sep
        ? '<div class="nav-sep"></div>'
        : `<button class="nav-item ${n.id === page ? 'active' : ''}" data-p="${n.id}">
             <span class="ico">${n.icon}</span> ${n.label}
           </button>`).join('')}
      <div style="flex:1"></div>
      <button class="nav-item" ${kid ? '' : 'data-p="settings"'} id="syncPill" style="font-size:13px;color:var(--text-2)">
        <span class="ico" id="syncDot">•</span> <span id="syncText">Saved locally</span>
      </button>
      ${kid ? `<button class="nav-item" id="unlock" style="font-size:13px;color:var(--text-3)">
                 <span class="ico">🔒</span> Parent
               </button>` : ''}
    `;

    // textContent, not the template: a child's name is free text and this is the one
    // place in the nav where family-authored data meets HTML.
    if (kid) nav.querySelector('#brandName').textContent = kid.name;

    paintSync();

    nav.onclick = e => {
      const b = e.target.closest('.nav-item');
      if (b && b.dataset.p) go(b.dataset.p);   // the unlock button has no page: skip it
    };

    const unlock = nav.querySelector('#unlock');
    if (unlock) unlock.onclick = () => {
      if (Device.hasPin()) {
        const pin = prompt('Parent PIN');
        if (pin === null) return;                                        // cancelled
        if (!Device.checkPin(pin)) { alert('That PIN is not right.'); return; }
      }
      Device.setParent();
      go('today');
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
