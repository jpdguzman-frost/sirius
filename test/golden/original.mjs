/**
 * ORACLE — functions extracted VERBATIM from the validated prototype bundle
 * (docs/frost-sirius-v1.html, prettier-formatted, identifiers as minified).
 * DO NOT EDIT. The lib/ port is proven by parity against this module
 * (AC-10 discipline under the approved STATE.md deviation).
 *
 * Mapping: fn=CONFIDENCE_LEVELS Tc=LEGACY_CYCLE Xe=EMPIRICAL zu=WEIGHTS
 * Ke=HARD_MIX Uc=weightOf jh=weekLoad rp=laneOf Xh=designCell Kh=HOLIDAYS
 * Qh=iso V=parseDate np=isHoliday on=workday sp=toFriday Zh=weekNum
 * qu=sortSprints Yh=sprintFor Wu=sprintLengthDays Jh=sprintIssues
 * eg=reflowSprints dp=toMonday rn=workdaysBetween fl/lg=forecast
 * Eg=suggestPlan
 */

/* eslint-disable */
  var fn = [
      { key: "Average", idx: 0, label: "Average" },
      { key: "0.7", idx: 1, label: "70th pct" },
      { key: "0.85", idx: 2, label: "85th pct" },
      { key: "0.95", idx: 3, label: "95th pct" },
    ],
    Tc = { coef: 1.28, constant: 2.96 },
    Xe = {
      source: "ARES \xB7 board hLL7WW2V \xB7 Jan\u2013Jul 2026",
      design: {
        Easy: {
          design: { Average: 0.97, 0.7: 0.94, 0.85: 2.67, 0.95: 4.2, n: 1126 },
          ops: { Average: 2.4, 0.7: 1.03, 0.85: 2.94, 0.95: 3.75, n: 311 },
          assets: {
            Average: 12.06,
            0.7: 13.88,
            0.85: 19.24,
            0.95: 23.31,
            n: 353,
          },
        },
        Medium: {
          design: { Average: 1.13, 0.7: 1.2, 0.85: 2.21, 0.95: 4.02, n: 1508 },
          ops: { Average: 0.73, 0.7: 0.56, 0.85: 0.98, 0.95: 1.05, n: 385 },
        },
        Hard: {
          design: { Average: 1.79, 0.7: 2.09, 0.85: 3.24, 0.95: 5.85, n: 228 },
          ops: { Average: 2.05, 0.7: 1.02, 0.85: 2.94, 0.95: 4.91, n: 121 },
        },
      },
      review: {
        Average: 5.21,
        0.7: 4.8,
        0.85: 9.87,
        0.95: 19.64,
        median: 2.68,
        n: 1184,
      },
      throughput: {
        Easy: { p25: 29, p50: 50, p70: 75 },
        Medium: { p25: 42, p50: 51, p70: 69 },
        Hard: { p25: 7, p50: 9, p70: 11 },
      },
    },
    zu = { Easy: 1, Medium: 2, Hard: 4, "": 2 },
    Ke = { ideal: 0.083, ceiling: 0.129, observedMax: 0.204 },
    Uc = (e) => zu[e.difficulty] ?? zu[""],
    Oc = "ARES \xB7 deliveryForecast.referenceWeeks";
  function jh(e) {
    let t = e.reduce((r, s) => r + Uc(s), 0),
      a = e.filter((r) => r.difficulty === "Hard").length,
      l = e.length ? a / e.length : 0,
      o = e
        .filter((r) => r.difficulty === "Hard")
        .reduce((r, s) => r + Uc(s), 0);
    return {
      points: t,
      hard: a,
      count: e.length,
      share: l,
      hardPointShare: t ? o / t : 0,
      over: l > Ke.ceiling,
      warn: l > Ke.ideal && l <= Ke.ceiling,
    };
  }
  var rp = (e) => {
      let t =
        `${e.currentList || ""} ${(e.labels || []).join(" ")}`.toLowerCase();
      return /asset|illustrat|render|icon/.test(t)
        ? "assets"
        : /ops|process|board management/.test(t)
          ? "ops"
          : "design";
    },
    Xh = (e) => {
      let t = Xe.design[e.difficulty] || Xe.design.Medium,
        a = rp(e);
      return t[a] || t.design || Object.values(t)[0];
    },
    Kh = [
      "2026-01-01",
      "2026-04-02",
      "2026-04-03",
      "2026-05-01",
      "2026-06-12",
      "2026-08-31",
      "2026-11-30",
      "2026-12-25",
      "2026-12-30",
    ],
    Qh = (e) => e.toISOString().slice(0, 10),
    V = (e) => new Date(e + "T00:00:00"),
    np = (e) => Kh.includes(Qh(e));
  function on(e, t) {
    let a = new Date(e),
      l = Math.round(t || 0);
    for (; l > 0;) {
      a.setDate(a.getDate() + 1);
      let o = a.getDay();
      o !== 0 && o !== 6 && !np(a) && l--;
    }
    return a;
  }
  function sp(e) {
    let t = new Date(e),
      a = t.getDay() === 0 ? 7 : t.getDay();
    return (t.setDate(t.getDate() + (a < 5 ? 5 - a : 8 - a)), t);
  }
  function Zh(e) {
    let t = new Date(e.getFullYear(), 0, 1);
    return Math.floor(((e - t) / 864e5 + t.getDay()) / 7) + 1;
  }
  var nn = "2026-08-03",
    zc = [
      { id: "s46", name: "Sprint 46", start: "2026-08-03", end: "2026-08-14" },
      { id: "s47", name: "Sprint 47", start: "2026-08-17", end: "2026-08-28" },
      { id: "s48", name: "Sprint 48", start: "2026-08-31", end: "2026-09-18" },
      { id: "s49", name: "Sprint 49", start: "2026-09-21", end: "2026-10-02" },
    ],
    qu = (e, t) => (e.start < t.start ? -1 : e.start > t.start ? 1 : 0);
  function Yh(e, t) {
    return !e || e === "Unscheduled"
      ? null
      : t.find((a) => e >= a.start && e <= a.end) || null;
  }
  var Wu = (e) => Math.round((V(e.end) - V(e.start)) / 864e5) + 1,
    up = (e) => Math.max(1, Math.round(Wu(e) / 7));
  function Jh(e) {
    let t = [...e].sort(qu),
      a = [];
    return (
      t.forEach((l, o) => {
        l.end < l.start &&
          a.push({
            id: l.id,
            kind: "inverted",
            text: `${l.name} ends before it starts`,
          });
        let r = t[o + 1];
        if (r)
          if (r.start <= l.end)
            a.push({
              id: r.id,
              kind: "overlap",
              text: `${r.name} overlaps ${l.name}`,
            });
          else {
            let s = Math.round((V(r.start) - V(l.end)) / 864e5) - 1;
            s > 2 &&
              a.push({
                id: r.id,
                kind: "gap",
                text: `${s} days uncovered between ${l.name} and ${r.name}`,
              });
          }
      }),
      a
    );
  }
  function eg(e, t) {
    let a = [...e];
    if (!a.length) return a;
    let l = t || e.map((r) => r.start).sort()[0],
      o = V(l);
    return a.map((r) => {
      let s = Wu(r),
        u = new Date(o),
        d = new Date(o);
      for (
        d.setDate(d.getDate() + s - 1),
          o = new Date(d),
          o.setDate(o.getDate() + 3);
        o.getDay() !== 1;
      )
        o.setDate(o.getDate() + 1);
      return {
        ...r,
        start: u.toISOString().slice(0, 10),
        end: d.toISOString().slice(0, 10),
      };
    });
  }
  var dp = (e) => {
    let t = new Date(e),
      a = t.getDay() === 0 ? 7 : t.getDay();
    return (t.setDate(t.getDate() - (a - 1)), t.setHours(0, 0, 0, 0), t);
  };
  function rn(e, t) {
    if (!e || !t || t <= e) return 0;
    let a = 0,
      l = new Date(e);
    for (; l < t;) {
      l.setDate(l.getDate() + 1);
      let o = l.getDay();
      o !== 0 && o !== 6 && !np(l) && a++;
    }
    return a;
  }
  function fl(e) {
    return lg(e);
  }
  function lg(e) {
    let t = (fn.find((L) => L.key === e.confidence) || fn[1]).key,
      a = Xh(e),
      l = a[t] ?? a["0.7"],
      o = Xe.review[t] ?? Xe.review["0.7"],
      r = 0.5,
      s = 0.5,
      u = e.slaSketch ?? o,
      d = e.slaRender ?? o,
      c = u + d,
      h = V(e.startDate),
      g = on(h, r + l),
      p = on(g, u),
      y = on(sp(p), s + l),
      v = on(p, s + l + d);
    return {
      cards: 1,
      startWeek: Zh(h),
      sketchLead: r,
      sketchDesign: l,
      sketchReview: o,
      renderLead: s,
      renderDesign: l,
      renderReview: o,
      sketchCycle: r + l + o,
      renderCycle: s + l + o,
      designDays: l * 2,
      forecastedReviewTime: c,
      baselineReview: o * 2,
      sketchDelivery: g,
      sketchApproved: p,
      renderDelivery: y,
      renderApproved: v,
      totalCycleTime: r + l + u + s + l + d,
      lane: rp(e),
      sampleSize: a.n,
    };
  }
  function Eg(e, t, { capacity: a = 120, refWeeks: l = null } = {}) {
    let o = Math.max(1, Math.round(a)),
      r = e.filter((C) => C.pinned && C.week !== "Unscheduled"),
      s = e.filter((C) => !C.pinned),
      u = {};
    t.forEach((C) => {
      u[C.key] = { Easy: 0, Medium: 0, Hard: 0, pts: 0 };
    });
    let d = (C, A) => {
      ((u[C][A] += 1), (u[C].pts += zu[A] ?? 2));
    };
    r.forEach((C) => {
      u[C.week] && d(C.week, C.difficulty || "Medium");
    });
    let c = (C) => {
        let A = C.deadline ? V(C.deadline).getTime() : 1 / 0;
        return [C.urgency === "Urgent" ? 0 : 1, A];
      },
      h = (C, A) => {
        let D = c(C),
          U = c(A);
        return D[0] - U[0] || D[1] - U[1];
      },
      g = s.filter((C) => C.difficulty === "Hard").sort(h),
      p = s.filter((C) => C.difficulty !== "Hard").sort(h),
      y = Math.max(1, Math.min(o, Math.ceil(s.length / Math.max(1, t.length)))),
      v = s.length
        ? s.filter((C) => C.difficulty === "Hard").length / s.length
        : 0,
      L = v > Ke.ceiling,
      T = L
        ? Math.max(1, Math.ceil(g.length / Math.max(1, t.length)))
        : Math.max(1, Math.round(y * Ke.ceiling)),
      m = {},
      i = {},
      f = (C) => u[C].Easy + u[C].Medium + u[C].Hard,
      x = o;
    (g.forEach((C) => {
      let A = t
        .filter((D) => u[D.key].Hard < T)
        .filter((D) => f(D.key) < o)
        .filter((D) => f(D.key) < Math.max(1, y * 2))
        .filter((D) => !(C.blocker && D === t[0]))
        .sort(
          (D, U) => u[D.key].Hard - u[U.key].Hard || f(D.key) - f(U.key),
        )[0];
      if (!A) {
        let D = [...t]
          .filter((U) => f(U.key) < o)
          .sort((U, B) => f(U.key) - f(B.key))[0];
        if (!D) {
          i[C.id] = "no week has capacity in the visible horizon";
          return;
        }
        (d(D.key, "Hard"),
          (m[C.id] = D.key),
          (i[C.id] = "placed beyond the hard-item ceiling"));
        return;
      }
      (d(A.key, "Hard"),
        (m[C.id] = A.key),
        C.blocker && (i[C.id] = `deferred \u2014 ${C.blocker}`));
    }),
      p.forEach((C) => {
        let A = C.difficulty || "Medium",
          D = null;
        for (let U of [0, 1]) {
          if (D) break;
          for (let B of t) {
            let G = u[B.key],
              Ce = G.Easy + G.Medium + G.Hard;
            if ((U === 0 && Ce >= y) || Ce >= x || (C.blocker && B === t[0]))
              continue;
            let E = { ...C, startDate: B.key, week: B.key },
              le = fl(E),
              Ie = C.deadline && V(C.deadline) < le.renderDelivery;
            if (!(Ie && B !== t[t.length - 1])) {
              ((D = B.key),
                Ie && (i[C.id] = "cannot meet deadline from any week in view"));
              break;
            }
          }
        }
        if (!D) {
          i[C.id] = i[C.id] || "no capacity in the visible horizon";
          return;
        }
        (d(D, A),
          (m[C.id] = D),
          C.blocker && !i[C.id] && (i[C.id] = `deferred \u2014 ${C.blocker}`));
      }));
    let k = t
      .filter((C) => {
        let A = u[C.key],
          D = A.Easy + A.Medium + A.Hard;
        return D > 0 && A.Hard / D > Ke.ceiling;
      })
      .map((C) => C.key);
    return {
      plan: m,
      notes: i,
      used: u,
      cardCap: o,
      hardQuota: T,
      strain: k,
      backlogHardShare: v,
      unavoidable: L,
    };
  }
  function ka(e) {
    let t = (e || "").toLowerCase();
    return /\b(done|approved|complete|completed|delivered|closed|shipped)\b/.test(
      t,
    )
      ? "done"
      : /\b(backlog|pending|queued|not started|on hold|paused|blocked|waiting|hold)\b/.test(
            t,
          )
        ? "pending"
        : "ongoing";
  }
export {
  ka,
  fn, Tc, Xe, zu, Ke, Uc, Oc,
  jh, rp, Xh, Kh, Qh, V, np,
  on, sp, Zh, qu, Yh, Wu, up, Jh, eg, dp, rn,
  fl, lg, Eg,
};
