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

  function exportCsv(rows) {
    const cols = ['date', 'childName', 'category', 'subjectName', 'title', 'minutes', 'schoolYear', 'mode'];
    const head = cols.join(',');
    const body = rows.map(r =>
      cols.map(c => {
        const v = r[c] ?? '';
        return /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
      }).join(',')
    ).join('\n');

    const blob = new Blob([head + '\n' + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `portfolio-${Store.today()}.csv`;
    a.click();
  }

  return { exportCsv };
})();


const App = (() => {
  'use strict';

  const NAV = [
    { id: 'dashboard', label: 'Home',       icon: '🏠' },
    { id: 'today',     label: 'Today',      icon: '📅' },
    { id: 'habits',    label: 'Habits',     icon: '✅' },
    { sep: true },
    { id: 'subjects',  label: 'Subjects',   icon: '📚' },
    { id: 'tasks',     label: 'Tasks',      icon: '📋' },
    { id: 'portfolio', label: 'Portfolio',  icon: '🏆' },
    { sep: true },
    { id: 'settings',  label: 'Settings',   icon: '⚙️' }
  ];

  let page = 'dashboard';

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
      <div class="nav-label">Saved locally</div>
    `;

    nav.onclick = e => {
      const b = e.target.closest('.nav-item');
      if (b) go(b.dataset.p);
    };

    main.innerHTML = '';
    (Pages[page] || Pages.dashboard)(main);

    // let any page put a "go to page" button anywhere
    main.querySelectorAll('[data-go]').forEach(b => {
      b.onclick = () => go(b.dataset.go);
    });
  }

  function boot() {
    Store.load();

    // Anything left unfinished in the past is dragged forward, one curriculum at
    // a time, so coming back after a week away does not strand work in the past.
    const moved = Scheduler.rollForwardOverdue(Store.today());
    if (moved.length) console.info(`Rolled ${moved.length} overdue lesson group(s) forward.`);

    Store.onChange(() => {});
    render();
  }

  return { go, render, boot };
})();

window.addEventListener('DOMContentLoaded', App.boot);
