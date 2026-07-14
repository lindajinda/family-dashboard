# Sharing the dashboard with other people

There are two quite different kinds of "other person", and they are set up differently.

- **Another adult** — a co-parent, a tutor. They get the whole app and can change anything.
  Nothing new was built for this: the app already merges edits from two computers, and a
  second *person* is the same thing as a second *computer*.
- **A child** — Amaru, Keanu, Ender ticking off their own work. They get a stripped-down
  version of the app, locked to themselves. That is **Kid Mode**, below.

Everyone sees the same live data. The app itself (the website) is already public — anyone
with the link can *load* it. What is private, and what actually controls who can see and
change your family's information, is the **`family-data` repository**. Access to that repo
*is* access to the dashboard. That is the only thing you are really granting or revoking.

---

## Part 1 — Another adult

### What you do (once, about 2 minutes)

1. Go to `github.com/<your-username>/family-data` → **Settings** → **Collaborators**.
2. Click **Add people**, and enter their GitHub username or email.
3. They will get an invitation by email. They must accept it before anything below works.

If they don't have a GitHub account, they will need one (free, `github.com/signup`). This is
the only genuinely annoying part of sharing, and there is no way around it — it is what
keeps the data private.

### What they do (once, about 3 minutes)

Send them these steps verbatim:

1. Accept Linda's invitation to the `family-data` repository (check your email).
2. Go to **github.com/settings/personal-access-tokens/new**.
3. Name it `family-dashboard`.
4. Under **Resource owner**, choose **Linda's account** (not your own — the repository
   belongs to her).
5. Under **Repository access** choose **Only select repositories**, and pick `family-data`.
6. Under **Permissions → Repository permissions**, set **Contents** to **Read and write**.
   Leave everything else alone.
7. Click **Generate token** and copy it. It looks like `github_pat_…`. You only get to see
   it once.
8. Open the dashboard, go to **Settings → Sync between computers**, and enter:
   - **GitHub username**: `<Linda's username>` — hers, not yours. It is her repository.
   - **Repository name**: `family-data`
   - **Access token**: the token you just made.
9. Click **Connect and sync**. Everything appears within a few seconds.

From then on it is automatic. Their edits reach you, and yours reach them, within a minute
or two.

> A token generated against Linda's account may need her to approve it, depending on how her
> account is configured. If it sits in a pending state, look for a request under
> **Settings → Personal access tokens** on *her* account and approve it.

---

## Part 2 — Kid Mode

A child gets their own device — a tablet, an old laptop, or just their own browser profile.

1. First, **connect that device to sync** the normal way (Settings → Sync between computers).
   You type the token, not the child. See the warning below about which token to use.
2. Then, on that device, go to **Settings → This device** and pick the child's name.
3. The app immediately becomes theirs:
   - Only **Today** and **Habits**, only their own work.
   - No Curriculum, no Subjects, no Portfolio, no Settings.
   - No "Move →" button (rescheduling a curriculum is not a child's decision).
   - No adding or editing habits — they tick, they don't design.
4. To get back out, use the small **🔒 Parent** button at the bottom of the sidebar.

### The PIN

Set one in **Settings → This device**. It is asked for when leaving a child's device.

**It is a speed bump, not a lock, and it is important to be clear about that.** It stops a
nine-year-old drifting into Settings and changing the school year. It would not stop a
determined teenager who opens the browser's developer tools. No web app can keep a secret
from the person holding the device, and this one does not pretend to.

### ⚠️ Give each child's device its own token

A child's device syncs with an access token exactly like yours, which means **it can write to
your family data**. That is unavoidable — it is how their ticks reach you.

What you *can* do is make each device's token separate. Repeat the token steps once per
device, naming them `keanu-tablet`, `ender-laptop`, and so on. Then if a tablet is lost, or
you simply change your mind, you revoke that single token at
**github.com/settings/personal-access-tokens** and nothing else in the house is disturbed.

Nothing is ever deleted from your data by revoking a token. It only stops that device
syncing further.

---

## What happens if two people edit at the same time?

They merge. This is the whole point of how sync was built, and it is worth trusting:

- Different children, different subjects, different habits, different days — **all merge
  perfectly**, always. This covers essentially everything that happens in practice.
- Deleting something on one computer does not resurrect it on another.
- The portfolio can only ever grow. A sync cannot lose a completed lesson.
- Every sync is a git commit, so even a catastrophic mistake is recoverable by looking at
  an earlier version of the file on GitHub.

The one real limitation, stated plainly: if two people edit **the same record** in the same
few minutes — you tick the reading on one lesson while your husband ticks the problem set on
*that same lesson* — the later edit wins the whole record, and the earlier tick is lost. It
is a small window and a narrow case, but it is real.

---

## Removing someone

**Settings → Collaborators** on the `family-data` repo → remove them. Their token stops
working immediately, and their copy of the app stops syncing. Whatever is on their screen
stays on their screen, but it can no longer reach your data, and their changes never arrive.

If you want to be thorough, also revoke any tokens they made against your account under
**Settings → Personal access tokens**.
