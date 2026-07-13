/* =============================================================================
   sync.js — automatic synchronisation between computers.

   HOW IT WORKS
   ------------
   Your data is one JSON file, committed to a PRIVATE GitHub repository you own.
   Every computer reads that file, merges it with what it has locally, and writes
   the result back. There is no server, it is free forever, you own the data
   outright, and because it is git you get a complete version history — so even a
   catastrophic merge is recoverable by looking at an earlier commit.

   THE MERGE RULE, AND WHY IT IS SAFE
   ----------------------------------
   Records are matched by id. For a record both sides have, THE NEWER EDIT WINS
   (each record carries updatedAt, stamped on every write).

   Three properties make this safe rather than merely convenient:

   1. NOTHING IS EVER HARD-DELETED. A delete is a flag on the record. This is what
      makes the merge sound: if deletes removed rows, a computer that had not seen
      the delete would keep re-adding the row every time it synced, and the record
      would rise from the dead forever.

   2. THE PORTFOLIO IS APPEND-ONLY. It is merged as a pure union by id, and can
      only ever grow. A sync cannot lose a completed lesson, whatever else happens.

   3. UNSEEN RECORDS ARE KEPT, NOT DROPPED. A record present on one side and absent
      on the other is always kept. Absence never means "delete" — only the deleted
      flag does.

   THE ONE LIMITATION, STATED PLAINLY
   ----------------------------------
   The unit of conflict is the RECORD. If two computers edit the SAME lesson at the
   same time — one ticks the reading, the other ticks the problem set — the later
   write wins the whole lesson and the earlier tick is lost.

   Different lessons, different habits, different children: all merge perfectly.
   It is only the same record, edited on two machines, between two syncs. Given the
   app syncs on every change, on focus, and every few minutes, that window is small.

   Making parts merge individually is possible but it introduces a worse bug —
   deleted parts resurrecting — so record-level is the honest trade.
   ============================================================================= */

const Sync = (() => {
  'use strict';

  // The config is NOT part of the synced document: it holds the access token, and a
  // token must never be written into the file that gets committed to the repo.
  const CFG_KEY = 'familyDashboard.sync.v1';

  const COLLECTIONS = [
    'children', 'subjects', 'curricula', 'lessons',
    'habits', 'habitLog', 'tasks', 'holidays'
  ];

  let cfg = null;
  let state = { status: 'off', message: '', lastSync: null, sha: null };
  const listeners = [];

  /* ------------------------------------------------------------------- config */

  function config() {
    if (cfg) return cfg;
    try { cfg = JSON.parse(localStorage.getItem(CFG_KEY)); } catch { cfg = null; }
    return cfg;
  }

  function connect(owner, repo, token, path) {
    cfg = { owner, repo, token, path: path || 'family-data.json' };
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    state.sha = null;
  }

  function disconnect() {
    localStorage.removeItem(CFG_KEY);
    cfg = null;
    set('off', '');
  }

  function isOn() { return !!config(); }
  function status() { return state; }
  function onStatus(fn) { listeners.push(fn); }

  function set(status, message) {
    state.status = status;
    state.message = message || '';
    listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
  }

  /* -------------------------------------------------------------------- merge */

  const stamp = r => r.updatedAt || r.createdAt || '';

  /**
   * Merge two whole documents. Pure — no network, no storage. This is the function
   * the tests hammer, because it is the only place data can silently be destroyed.
   */
  function merge(local, remote) {
    if (!remote) return local;
    if (!local) return remote;

    const out = {
      schemaVersion: Math.max(local.schemaVersion || 1, remote.schemaVersion || 1),
      updatedAt: (local.updatedAt || '') > (remote.updatedAt || '')
        ? local.updatedAt : remote.updatedAt,

      // Settings are a single blob with no per-field timestamps, so the document
      // that was touched most recently wins them.
      settings: (local.updatedAt || '') > (remote.updatedAt || '')
        ? local.settings : remote.settings,

      portfolio: unionById(local.portfolio || [], remote.portfolio || [])
    };

    COLLECTIONS.forEach(name => {
      out[name] = mergeCollection(local[name] || [], remote[name] || []);
    });

    return out;
  }

  /**
   * Newer edit wins, per record. A record only one side has is KEPT — absence never
   * means "deleted"; only the deleted flag does.
   */
  function mergeCollection(a, b) {
    const byId = new Map();

    a.forEach(r => byId.set(r.id, r));

    b.forEach(r => {
      const mine = byId.get(r.id);
      if (!mine) { byId.set(r.id, r); return; }
      // On an exact tie, prefer the remote copy. Deterministic, so every computer
      // merging the same pair reaches the same answer and they converge.
      if (stamp(r) >= stamp(mine)) byId.set(r.id, r);
    });

    return [...byId.values()];
  }

  /** The portfolio can only grow. It is never filtered, never overwritten. */
  function unionById(a, b) {
    const byId = new Map();
    a.forEach(r => byId.set(r.id, r));
    b.forEach(r => { if (!byId.has(r.id)) byId.set(r.id, r); });
    return [...byId.values()];
  }

  /* ---------------------------------------------------------------- transport */

  function api(path, opts) {
    const c = config();
    return fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/${path}`,
      Object.assign({
        headers: {
          'Authorization': `Bearer ${c.token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }, opts));
  }

  // btoa() only handles Latin-1. Subject names, notes and children's names are all
  // free text and will contain accents and emoji, so encode to UTF-8 bytes first.
  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  function fromBase64(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async function pull() {
    const c = config();
    const res = await api(`contents/${encodeURIComponent(c.path)}`, { method: 'GET' });

    if (res.status === 404) return { doc: null, sha: null };   // first ever sync
    if (!res.ok) throw new Error(await describe(res));

    const json = await res.json();
    return { doc: JSON.parse(fromBase64(json.content)), sha: json.sha };
  }

  async function push(doc, sha) {
    const c = config();
    const body = {
      message: `Sync from ${navigator.platform || 'a computer'}`,
      content: toBase64(JSON.stringify(doc, null, 2))
    };
    if (sha) body.sha = sha;      // omitted on the very first write

    const res = await api(`contents/${encodeURIComponent(c.path)}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });

    if (res.status === 409 || res.status === 422) return null;   // someone beat us to it
    if (!res.ok) throw new Error(await describe(res));

    const json = await res.json();
    return json.content.sha;
  }

  async function describe(res) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* no body */ }

    if (res.status === 401) return 'The access token was rejected. Check it, or make a new one.';
    if (res.status === 403) return 'Access denied. The token may not have permission for this repository.';
    if (res.status === 404) return 'Repository not found. Check the owner and name, and that the token can see it.';
    return `GitHub said: ${res.status} ${detail}`;
  }

  /* --------------------------------------------------------------------- sync */

  let running = false;
  let pendingRun = false;

  // Writing the merged document back into the Store fires the Store's change event,
  // which is exactly what schedules a sync. Without this flag the app would sync,
  // apply the result, see a "change", sync again, forever — committing to GitHub
  // every few seconds until something broke.
  let applying = false;

  function isApplying() { return applying; }

  async function syncNow() {
    if (!isOn()) return;

    // Never let two syncs overlap: the second would push a document built from a
    // stale read and could undo the first.
    if (running) { pendingRun = true; return; }
    running = true;
    set('syncing', '');

    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { doc: remote, sha } = await pull();
        const merged = merge(Store.raw, remote);

        applying = true;
        try { Store.replaceAll(merged); } finally { applying = false; }

        const newSha = await push(merged, sha);

        if (newSha) {                       // success
          state.sha = newSha;
          state.lastSync = new Date().toISOString();
          set('ok', '');
          return;
        }
        // 409: another computer wrote between our read and our write. Loop round,
        // re-read, re-merge. Nothing is lost — that is the whole point of merging.
      }
      set('error', 'Could not settle with the other computer after 3 tries. Will retry shortly.');
    } catch (e) {
      set('error', e.message || String(e));
    } finally {
      running = false;
      if (pendingRun) { pendingRun = false; setTimeout(syncNow, 500); }
    }
  }

  /* ------------------------------------------------------------------ autosync */

  let debounce = null;

  function start() {
    if (!isOn()) { set('off', ''); return; }

    syncNow();

    // After any local change, wait for the user to stop clicking, then push.
    // A change caused BY a sync is not a reason to sync again — see `applying`.
    Store.onChange(() => {
      if (!isOn() || applying) return;
      clearTimeout(debounce);
      debounce = setTimeout(syncNow, 4000);
    });

    // Coming back to the tab is the moment you are most likely to be looking at
    // stale data from another computer.
    window.addEventListener('focus', () => { if (isOn()) syncNow(); });

    setInterval(() => { if (isOn()) syncNow(); }, 5 * 60 * 1000);
  }

  return {
    merge, mergeCollection, unionById, isApplying,   // exported for the tests
    config, connect, disconnect, isOn, status, onStatus, syncNow, start
  };
})();
