# User Guide

Written for someone who does not write software. There is nothing to install and
nothing to maintain.

---

## Opening the app

Double-click **`index.html`**. It opens in your browser and works immediately.

Once it's published to GitHub Pages you'll have a web address instead, which you can
bookmark on every computer.

---

## The pages

### Home
Today at a glance. Across the top: lessons done, hours planned versus completed, anything
overdue, and tasks due this week. Below that, a card for each child.

### Today
**This is the page you'll live in.** Pick a child along the top, then work down the list.

- **The big checkbox** completes a lesson. One click. That's the whole interaction.
- **Skip** means *we are not doing this and not making it up*. Nothing else moves.
- **Move to tomorrow** means *we will do it, just later*. This one reschedules — see below.
- **Notes** records anything about how it went.

Use the ‹ and › buttons to look at other days.

### Habits
Tap the checkbox to mark a habit done. The row shows the current streak, the best streak
ever, the completion percentage, and the last three weeks as small squares.

A habit set to weekdays only is **dimmed at the weekend** and shows "not scheduled today".
Weekends do not break that habit's streak — a rest day is not a failure.

### Subjects
Everything about subjects is editable: name, icon, colour, order, and which children take
them. Nothing is fixed in the code, so any subject you can think of will work.

**Archive** hides a subject without destroying anything. Everything a child already
completed in it stays in the portfolio permanently.

### Tasks
One-off things: appointments, forms, purchases, events. Overdue items go red.

### Portfolio
The permanent record. Every lesson and habit ever completed, with the date, the subject
and how long it took. **Nothing is ever removed from here** — not by archiving a subject,
not by deleting a habit, not by anything.

### Settings
Switch between Summer, School Year, Vacation and Custom. Download a backup. Restore one.

---

## How rescheduling works

Say Latin is scheduled like this:

| Monday | Tuesday | Wednesday |
|---|---|---|
| Chapter 1 | Chapter 2 | Chapter 3 |

Monday gets away from you and Chapter 1 doesn't happen. Press **Move to tomorrow**:

| Tuesday | Wednesday | Thursday |
|---|---|---|
| Chapter 1 | Chapter 2 | Chapter 3 |

The whole Latin sequence slides one day and stays in order.

**Only Latin moves.** Maths, Biology and everything else stay exactly where they were.
That's the point — one subject falling behind should not shove the rest of the week around.

A few details that make it behave sensibly:

- A **Friday** lesson slides to **Monday**, not Saturday.
- **Holidays** are skipped.
- Lessons marked as having a **fixed date** (an exam, a co-op class) never move. Work that
  would have landed on top of one gets pushed past it.
- Anything already **completed** never moves.

If you don't open the app for a week, the unfinished work doesn't sit rotting in the past —
it's automatically pulled forward when you next open it, one subject at a time.

---

## Your data, and keeping it safe

Right now everything is stored **in this browser on this computer**.

That means two things you should know:

1. **Clearing your browser's site data would erase it.** So use **Settings → Download
   backup** now and then. It saves a small `.json` file you can keep anywhere.
2. **It doesn't yet appear on your other computer.** Automatic sync is the next thing
   being built — the app will save your data into a private GitHub repository, and every
   computer will pick it up by itself.

Until then, backup and restore does the job: download on one machine, restore on the other.
