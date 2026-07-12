/* =============================================================================
   seed.js — first-run content.

   IMPORTANT: none of this is hard-coded curriculum. Every subject, habit and
   lesson below is an ordinary editable record — you can rename, recolour,
   reorder, archive or delete any of it from the Subjects page, and add anything
   that isn't here. It exists only so the app is not an empty grey screen on the
   first launch.
   ============================================================================= */

const Seed = (() => {
  'use strict';

  const SUBJECTS = [
    { name: 'Biology',           icon: '🧬', color: '#107C41' },
    { name: 'Calculus',          icon: '📐', color: '#0F6CBD' },
    { name: 'Competition Math',  icon: '🏆', color: '#B146C2' },
    { name: 'Chemistry',         icon: '⚗️', color: '#CA5010' },
    { name: 'Theology',          icon: '✝️', color: '#8764B8' },
    { name: 'Programming',       icon: '💻', color: '#005A9E' },
    { name: 'Writing',           icon: '✍️', color: '#C239B3' },
    { name: 'History',           icon: '🏛️', color: '#986F0B' },
    { name: 'Spanish',           icon: '🇪🇸', color: '#D13438' },
    { name: 'Chinese',           icon: '🇨🇳', color: '#C50F1F' },
    { name: 'Art',               icon: '🎨', color: '#E3008C' },
    { name: 'Music',             icon: '🎵', color: '#8E562E' },
    { name: 'Research',          icon: '🔬', color: '#00838F' },
    { name: 'USACO',             icon: '⚡', color: '#4F6BED' }
  ];

  const HABITS = [
    { name: 'Morning skin care', icon: '🧴', color: '#00B7C3', days: 127 },
    { name: 'Evening skin care', icon: '🌙', color: '#8764B8', days: 127 },
    { name: 'Exercise',          icon: '🏃', color: '#D13438', days: 0b0111110 },
    { name: 'Etiquette',         icon: '🤝', color: '#986F0B', days: 0b0111110 },
    { name: 'Elocution',         icon: '🗣️', color: '#0F6CBD', days: 0b0111110 }
  ];

  // A few lessons per subject so the schedule has something in it.
  const CHAPTERS = 12;

  function apply(Store) {
    const children = ['Amaru', 'Keanu', 'Ender'].map((name, i) =>
      Store.add('children', {
        name,
        color: ['#0F6CBD', '#107C41', '#C239B3'][i],
        order: i
      })
    );

    const subjects = SUBJECTS.map((s, i) =>
      Store.add('subjects', {
        name: s.name,
        icon: s.icon,
        color: s.color,
        order: i,
        archived: false
      })
    );

    // Give each child the first five subjects to start with. Assign the rest from
    // the Subjects page whenever you like.
    const starter = subjects.slice(0, 5);

    children.forEach(child => {
      starter.forEach(subject => {
        const cur = Store.add('curricula', {
          childId: child.id,
          subjectId: subject.id,
          schoolYear: Store.settings.schoolYear,
          resources: ''
        });

        let date = Store.today();
        if (!Store.isSchoolDay(date)) date = Store.nextSchoolDay(date);

        for (let n = 1; n <= CHAPTERS; n++) {
          // A day's assignment is usually several things. The sample data shows that
          // shape so the multi-part behaviour is obvious on first launch.
          const parts = [
            `Read Chapter ${n}`,
            `Problem set ${n}`,
            ...(n % 3 === 0 ? [`Supplementary reading ${n}`] : [])
          ];

          Store.add('lessons', {
            curriculumId: cur.id,
            seq: n,
            title: `Chapter ${n}`,
            parts: parts.map(t => ({ id: Store.uid(), text: t, done: false, doneOn: null })),
            notes: '',
            date,
            minutes: 0,
            done: false,
            hidden: false,
            pinned: false,
            priority: 'normal'
          });
          date = Store.nextSchoolDay(date);
        }
      });

      HABITS.forEach((h, i) =>
        Store.add('habits', {
          childId: child.id,
          name: h.name,
          icon: h.icon,
          color: h.color,
          days: h.days,
          order: i,
          archived: false
        })
      );
    });

    Store.add('tasks', {
      childId: children[0].id,
      title: 'Buy graphing calculator',
      description: 'TI-84 for Calculus',
      due: Store.addDays(Store.today(), 5),
      priority: 'normal',
      done: false,
      notes: ''
    });

    Store.save();
  }

  return { apply, SUBJECTS, HABITS };
})();
