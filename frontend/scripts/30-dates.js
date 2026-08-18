/* Invariant 11: the today-marker, the shortcuts and the Started/Done tooltips
   are MANILA days whatever the browser's timezone (en-CA gives YYYY-MM-DD). */
const MANILA_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
const MANILA_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
const manilaToday = () => MANILA_DAY.format(new Date());
/* tooltip for the read-only Started/Done cells: the exact source instant, in
   the timezone the whole app computes in. The Manila DAY arrives from the
   payload (the cell beside it already renders that string) — only the
   clock time is derived here. */
function fmtInstant(day, ts) {
  if (!day || !ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : `${fmtLongIso(day)}, ${MANILA_TIME.format(d)} PHT`;
}

/* calendar arithmetic on 'YYYY-MM-DD' — local midnight, so only the calendar
   fields move and the string round-trips unchanged */
function isoAddDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoOf(d);
}
function isoNextMonday(iso) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); // strictly after `iso`
  return isoOf(d);
}
const monthOf = (iso) => iso.slice(0, 7);
function monthShiftYm(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  return monthOf(isoOf(new Date(y, m - 1 + delta, 1)));
}

/* The ONLY three sprint fields a save persists, projected in one place. The
   open-baseline, the PUT body and `sprintDirty`'s comparison are three views of
   one contract; when each spelled it out separately, adding a fourth persisted
   field silently stopped `sprintDirty` from seeing edits to it and left Save
   dead on a real change. */
const sprintPayload = (s) => ({ name: s.name, start: s.start, end: s.end });

function mondayIso(base) {
  const d = new Date(base + 'T00:00:00');
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (day - 1));
  return isoOf(d);
}

/* the dimmer half of a block header's meta line — one pluralisation rule for
   all three block kinds, so a sprint can never read '1 items' */
const itemCount = (n) => `· ${n} item${n === 1 ? '' : 's'}`;

/* The Friday of the week `base` falls in — the sprints modal's END snap target
   (R-f-2). START snaps to the same week's Monday, so a sprint always covers
   whole working weeks and the derived LENGTH counts what it claims to count.
   Snapping happens on PICK, never as a rejection. */
function fridayIso(base) {
  const d = new Date(mondayIso(base) + 'T00:00:00');
  d.setDate(d.getDate() + 4);
  return isoOf(d);
}

/* Working days STRICTLY between two ISO dates — R-f-8. The sprints modal's gap
   warning counts the days the studio could actually have worked, so Saturdays,
   Sundays and the ACTIVE holiday calendar all drop out; a "gap" that is only a
   weekend, or a weekend plus a public holiday, is not a gap and draws nothing.
   `lib/planner.ts`'s own gap rule counts RAW calendar days over a >2 threshold
   and is frozen (invariant 5) — and the server filters gap issues out anyway,
   so this is the first place the rule is expressed for a reader. The holiday
   set is not a second calendar: it is `getHolidays()` itself, ARES-canonical,
   shipped on the deliverables payload, so only the weekend skip is local. */
function workingDaysBetween(startIso, endIso, holidays) {
  if (!startIso || !endIso || endIso <= startIso) return 0;
  const holiday = holidays instanceof Set ? holidays : new Set(holidays || []);
  const d = new Date(startIso + 'T00:00:00');
  let open = 0;
  for (let step = 0; step < 3700; step += 1) { // ~10 years, a hard stop on a junk date
    d.setDate(d.getDate() + 1);
    const iso = isoOf(d);
    if (iso >= endIso) break;
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6 && !holiday.has(iso)) open += 1;
  }
  return open;
}

/* how many Mondays a sprint covers — the '2 wk' in a sprint header. Counted,
   not divided: Aug 3–Aug 14 is 2 weeks even though it spans 12 days, and a
   sprint that starts mid-week owns only the Mondays inside it. */
function mondaysBetween(startIso, endIso) {
  if (!startIso || !endIso || endIso < startIso) return 0;
  let m = mondayIso(startIso);
  if (m < startIso) m = mondayShift(m, 1);
  let n = 0;
  while (m <= endIso) {
    n += 1;
    m = mondayShift(m, 1);
  }
  return n;
}

