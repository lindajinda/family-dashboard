/* =============================================================================
   device.js — who is sitting at THIS computer.

   WHY THIS EXISTS
   ---------------
   sync.js already lets two COMPUTERS edit the same data and merge cleanly. A second
   PERSON turns out to be the very same problem: give them write access to the data
   repository, let them enter their own token, and their edits merge exactly as a
   second laptop's would. No new code was needed for that at all.

   What that does NOT solve is the child at the tablet. A child needs to tick their
   own habits and lessons — without wandering into Curriculum or Settings, without
   being shown their brothers' work, and without meeting the sync token.

   So each device carries an identity. It is deliberately kept OUT of the synced
   document, because it is a fact about the machine, not about the family: the
   tablet is Keanu's on every sync, and saying so in the shared file would only
   mean three computers fighting over one field.

     parent — the whole app. The default. Nothing changes.
     kid    — Today and Habits only, pinned to one child, everything else gone.

   THE PIN IS A SPEED BUMP, NOT A LOCK — SAID PLAINLY
   --------------------------------------------------
   It stops a nine-year-old drifting into Settings and changing the school year. It
   would not stop a determined teenager who opens the developer tools, and it is not
   pretending to: a browser app cannot keep a secret from the person holding the
   device.

   Which means the real question is never "is the PIN strong enough" but "should this
   device be able to write to the family data at all". If the answer is no, the fix is
   not a longer PIN — it is not putting a token on that device.
   ============================================================================= */

const Device = (() => {
  'use strict';

  // Sits alongside the sync token in localStorage, and for the same reason: both are
  // properties of this one machine, and neither belongs in the file we commit.
  const KEY = 'familyDashboard.device.v1';

  let cache = null;

  function get() {
    if (cache) return cache;
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch { d = null; }

    // Anything we do not recognise means parent. A corrupt or half-written value must
    // fail OPEN — a device stuck in a kid mode it cannot leave is a device that needs
    // its browser storage cleared by hand, and Linda should never have to do that.
    cache = (d && d.mode === 'kid' && d.childId)
      ? { mode: 'kid', childId: d.childId }
      : { mode: 'parent', childId: null };

    return cache;
  }

  function setKid(childId) {
    if (!childId) return;
    cache = { mode: 'kid', childId };
    localStorage.setItem(KEY, JSON.stringify(cache));
  }

  function setParent() {
    cache = { mode: 'parent', childId: null };
    localStorage.removeItem(KEY);
  }

  function isKid() { return get().mode === 'kid'; }

  /**
   * The child this device belongs to, or null for a parent device.
   *
   * If that child no longer exists — archived on another computer, say — the device
   * quietly returns to parent mode rather than showing a blank screen with no way
   * out. Failing open again, for the same reason.
   */
  function childId() {
    const d = get();
    if (d.mode !== 'kid') return null;
    if (!Store.child(d.childId)) { setParent(); return null; }
    return d.childId;
  }

  function child() {
    const id = childId();
    return id ? Store.child(id) : null;
  }

  /* --------------------------------------------------------------------- the PIN

     Kept in the SYNCED settings, not on the device: Linda sets it once and every kid
     device in the house honours it. It is not a secret and is not treated as one —
     see the header. It rides along in the private repo like everything else. */

  function hasPin() {
    return !!(Store.settings && Store.settings.parentPin);
  }

  /** An empty PIN clears it, which is the honest way to turn the gate off. */
  function setPin(pin) {
    Store.settings.parentPin = String(pin || '').trim() || null;
    Store.save();
  }

  function checkPin(pin) {
    const real = Store.settings && Store.settings.parentPin;
    if (!real) return true;                       // no PIN set: the gate is simply open
    return String(pin || '').trim() === String(real);
  }

  /** Drops the cache so the next call re-reads localStorage. Exists for the tests,
   *  which need to prove that a corrupt stored value fails open to parent. */
  function __reload() { cache = null; }

  return { get, setKid, setParent, isKid, childId, child, hasPin, setPin, checkPin, __reload };
})();
