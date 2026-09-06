/**
 * The Pipeline per-row warning — WIRING and structure: which directive sits
 * on which node, the one close path, the one close timer, and the pointer
 * path that cannot close what it did not open.
 *
 * Split verbatim out of `test/pipeline-warning.test.ts`, split 2026-09-05 (PLAN.md §D);
 * the shared prelude is `test/helpers/pipeline-warning.ts`.
 */

import { describe, expect, it } from 'vitest';
import { APP_JS, APP_JS_CODE, decl, fnBody, handlerBody } from './helpers/gantt-render.ts';
import { jsCode, tag, tplCode } from './helpers/pipeline-warning.ts';

/**
 * WIRING, not behaviour. Ractive directives never reach `toHTML()`, so which
 * handler sits on which node can only be read out of the template source — and
 * reading it proves the wiring exists, nothing more. That hover, the bridge,
 * the delay and focus-out actually WORK is the live pass's to say.
 */
describe('the hover-card wiring, read out of the shipped template', () => {
  const btnTag = () => tag(tplCode, '<button class="warnbtn"');

  it('opens on pointer-enter AND on focus, from the same handler', () => {
    const t = btnTag();
    expect(t).toContain(`on-mouseenter="['warnPopIn', row.cardId]"`);
    expect(t).toContain(`on-focus="['warnPopIn', row.cardId]"`);
    expect(t).toContain(`on-mouseleave="['warnPopOut']"`);
  });

  it('holds itself open while the pointer is INSIDE the card, through the same handler', () => {
    // the card re-arms with the SAME opener and the same cardId: an opener that
    // is not idempotent would shut the card the moment the pointer reached it
    const card = tag(tplCode, '<div class="warnpop');
    expect(card).toContain(`on-mouseenter="['warnPopIn', row.cardId]"`);
    expect(card).toContain(`on-mouseleave="['warnPopOut']"`);
  });

  it('listens for focusout on the HOST — the one node containing both the icon and the card', () => {
    expect(tag(tplCode, '<div class="warnhost"')).toContain(`on-focusout="['warnPopFocusOut']"`);
    // …and not on the identity group, which every row renders: a complete card
    // must not attach a listener it can never fire
    expect(tag(tplCode, '<div class="mcid"')).not.toContain('on-');
  });

  it('gives the trigger NO click and NO keydown of its own', () => {
    const t = btnTag();
    expect(t).not.toContain('on-click');
    // pipeRowKey lives on the <tr> and guards on target !== node; a keydown
    // directive here would be the batch-6 immunisation patch all over again
    expect(t).not.toContain('on-keydown');
  });

  it('leaves pipeRowKey’s target guard standing, with a new focusable control in the row', () => {
    expect(handlerBody('pipeRowKey')).toContain('ctx.event.target !== ctx.node');
  });
});

/**
 * R-warn-f generalised. Focus return was added once, in the shared close path —
 * but only the DISMISS routes went through it. Five handlers that close an
 * overlay by COMMITTING a choice still nulled their own state key, so a
 * keyboard user who pressed Enter on a menu option was dropped at `<body>` and
 * restarted the next Tab from the top of the document: the exact regression the
 * Escape path was written to fix, surviving on the path people actually use.
 * The direct writes also left `overlayTrigger` pinning a node the re-render had
 * already detached.
 */
describe('every overlay closes through ONE path — commit as well as dismiss', () => {
  /* The roll-call is the OVERLAYS the rule is proved against, not a copy of
     the shipped list — the Requests select bar's one menu became the sort and
     filter panels (owl #77 §1), so both stand where it stood. */
  const OVERLAYS = ['urgencyMenu', 'diffMenu', 'duePopover', 'reqSortMenu', 'reqFilterMenu', 'warnPop'];

  it('names the overlays once and derives the three lists from that name', () => {
    expect(APP_JS).toContain('const OVERLAY_KEYS = ');
    /* read out of the DECLARATION, not out of the bundle: every one of these
       words also appears in its own handler, its template guard and its shield
       entry, so a key dropped from the list still matched a whole-bundle
       search — and dropping one is exactly the defect the next test's rule
       exists for (block 5 proof 17). */
    const named = decl(APP_JS_CODE, 'OVERLAY_KEYS');
    for (const key of OVERLAYS) expect(named, `${key} is not in OVERLAY_KEYS`).toContain(`'${key}'`);
    // the object literal that used to be written out in both closeMenus and
    // openOverlay, and had to be edited in step
    expect(APP_JS).toContain('const NO_OVERLAYS = ');
    expect(APP_JS).not.toContain('urgencyMenu: null, diffMenu: null');
  });

  it('leaves NO handler nulling an overlay key on its own', () => {
    for (const key of OVERLAYS) {
      expect(APP_JS, `${key} is closed outside closeMenus()`).not.toContain(`app.set('${key}', null)`);
    }
  });

  it('returns focus to the trigger when a choice is committed, not only on Escape', () => {
    for (const handler of [
      // `pickReqSort` is the Requests handler that COMMITS a choice and closes
      // its panel — the seat `pickReqFilter` held before the select bar went
      // (a filter tick keeps its panel open, so it commits nothing to close)
      'async chooseUrgency(', 'async chooseDifficulty(', 'async dueApply(', 'async dueClear(', 'pickReqSort(',
    ]) {
      const at = APP_JS.indexOf(handler);
      expect(at, handler).toBeGreaterThan(-1);
      const body = APP_JS.slice(at, at + 600);
      expect(body, handler).toContain('closeMenus({ restoreFocus: true })');
    }
  });

  it('restores focus WITHOUT scrolling — the dismisser itself runs on scroll', () => {
    // a trackpad nudge dismisses the overlay; focusing the trigger the normal
    // way would scroll it back into view and undo the gesture that closed it
    expect(APP_JS).toContain('t.focus({ preventScroll: true })');
  });

  it('EXTENDS the machinery rather than forking it — one opener, one placer', () => {
    // the hover card is the fifth overlay the list already names; a second
    // positioner or a second close path is the regression this guards
    expect([...jsCode.matchAll(/function placeBox\(/g)]).toHaveLength(1);
    expect([...jsCode.matchAll(/function placeMeasured\(/g)]).toHaveLength(1);
    expect([...jsCode.matchAll(/function closeMenus\(/g)]).toHaveLength(1);
    expect([...jsCode.matchAll(/function openOverlay\(/g)]).toHaveLength(1);
    expect([...jsCode.matchAll(/function openMeasured\(/g)]).toHaveLength(1);
    // the hover card opens through the SHARED opener. `openMeasured` is
    // `openOverlay` plus the re-place every measured overlay needs, so going
    // through it is what "extends rather than forks" means here.
    expect(fnBody('showWarnPop')).toContain('openMeasured(');
    expect(fnBody('openMeasured')).toContain('openOverlay(');
  });

  it('PLACES THE CARD A SECOND TIME against the box that actually rendered', () => {
    /* The brief is verbatim on this — "Height is data-derived … so measure the
       rendered box and re-place; never assume a fixed height" — and nothing
       asserted it: deleting both lines from `showWarnPop` left the whole suite
       green. WARN_POP_H is the three-problem worst case against the far
       shorter box a one-problem card measures, so without the re-place
       `placeBox` flips up over roughly the bottom half of any viewport and
       then parks the box well above where
       the card renders. The bridge is 4px tall at the card's own edge, so it
       lands nowhere near the icon and `Open Card` is unreachable by pointer —
       the one thing the annotation insists on.

       It is load-bearing twice: the second placement is also what settles the
       final `up`, and `up` is the only carrier of the flip that drives both the
       squared corner and the side the bridge sits on (R-warn-p). */
    /* The open-then-re-place pair now lives in `openMeasured`, which is where
       all four measured overlays get it — so the rule is asserted there, on the
       one body that owns it, and the card is asserted to go through it. */
    const opener = fnBody('openMeasured');
    expect(opener, 'openMeasured never re-places against the measured box').toContain('placeMeasured(');
    // …and it retries on the next frame when the box is not mounted yet —
    // placeMeasured returns false for exactly that case and says so
    expect(opener).toContain('requestAnimationFrame(');
    expect(opener.indexOf('openOverlay(')).toBeLessThan(opener.indexOf('placeMeasured('));
    const body = fnBody('showWarnPop');
    expect(body).toContain('openMeasured(');
    // it measures the CARD, not some other overlay's box
    expect(body).toContain("sel: '.warnpop'");
  });

  it('anchors the card to the BUTTON, not to whatever the pointer entered', () => {
    /* `ctx.node` is the element the directive sits on; `ctx.event.target` is
       the 14px `<svg>` inside it. Placing against the target would shift the
       card by the button's own pad and hand `openOverlay` the wrong element to
       capture as `overlayTrigger` — which is what the focus return, the timer
       stand-down (R-warn-v) and the flip all read back. */
    expect(handlerBody('warnPopIn')).toContain('ctx.node');
    expect(handlerBody('warnPopIn')).not.toContain('ctx.event.target');
  });
});

/**
 * The close DELAY is a timer, and timers outlive the state they were scheduled
 * against. None of the structure below can be demonstrated by a synthetic
 * event — what it CAN do is assert the shape that makes the leak impossible:
 * one handle, one scheduler, and a cancel on both doors.
 */
describe('the close timer cannot leak across rows (structure, not behaviour)', () => {
  it('keeps exactly ONE timer handle, at module scope, never keyed per row', () => {
    expect([...jsCode.matchAll(/\blet\s+warnCloseTimer\b/g)]).toHaveLength(1);
    // a per-card map is the shape that WOULD leak: row A's entry survives row
    // B opening, and both fire
    expect(jsCode).not.toMatch(/warnCloseTimer\s*\[/);
  });

  it('schedules the close in exactly one place, and clears it in exactly one place', () => {
    expect([...jsCode.matchAll(/warnCloseTimer\s*=\s*setTimeout\(/g)]).toHaveLength(1);
    const clears = [...jsCode.matchAll(/clearTimeout\(\s*warnCloseTimer\s*\)/g)];
    expect(clears).toHaveLength(1);
    expect(fnBody('warnPopCancelClose')).toContain('clearTimeout(warnCloseTimer)');
  });

  it('names the delay instead of spelling a number at the call site', () => {
    expect(jsCode).toMatch(/const WARN_CLOSE_MS = \d+/);
    /* R-warn-j: 150ms is a default flagged to Miles as tunable, so it has to be
       tunable in ONE place. That place is now `scheduleHoverClose`, the single
       scheduler both hover-dismissed overlays leave through — the delay moved
       one level in when the filter chip's panel joined, and the rule is
       unchanged: no caller spells a number. */
    expect(fnBody('scheduleHoverClose')).toContain('WARN_CLOSE_MS');
    expect(handlerBody('warnPopOut')).not.toMatch(/setTimeout\(/);
    expect(handlerBody('warnPopOut')).not.toMatch(/,\s*\d+\s*\)/);
  });

  it('cancels a pending close at BOTH doors — every open and every close', () => {
    for (const door of ['openOverlay', 'closeMenus']) {
      const body = fnBody(door);
      expect(body, `${door} lets a pending close outlive it`).toContain('warnPopCancelClose()');
      /* …and it is the FIRST statement, so a timer can never outlive the state
         it was scheduled against. Stated as "first" rather than "before the
         first `app.set(`": if a future door writes its state through a helper
         there is no `app.set(` to order against, `indexOf` returns -1, and an
         ordering assertion against -1 fails for a reason that has nothing to do
         with the rule. */
      const first = body.replace(/^\{\s*/, '').split(/;|\n/)[0]!.trim();
      expect(first, `${door} does something before cancelling a pending close`)
        .toBe('warnPopCancelClose()');
    }
  });
});

describe('opening the hover card is idempotent, and never destroys an edit', () => {
  it('replaces the click opener with the three hover/focus handlers', () => {
    expect(jsCode).not.toContain('openWarnPop');
    for (const h of ['warnPopIn', 'warnPopOut', 'warnPopFocusOut']) {
      expect(handlerBody(h).length, h).toBeGreaterThan(0);
    }
  });

  it('guards the TOGGLE, because pointer-enter and focus can both fire on one icon', () => {
    // openOverlay toggles by contract — the other four overlays depend on that
    // — so re-entering an already-open icon would shut it. Guarded in the
    // opener, not by changing the toggle.
    /* the idempotence and refuse-over-an-edit rules moved into
       `openHoverOverlay`, the ONE hover-open policy both pointer-opened
       overlays now go through — same rules, one copy. */
    expect(fnBody('showWarnPop')).toContain("openHoverOverlay('warnPop', cardId)");
    expect(fnBody('openHoverOverlay')).toMatch(/app\.get\(key\) === id/);
  });

  it('refuses to open over an ACTIVE edit, from the ONE overlay list (R-warn-r)', () => {
    /* The rule now lives in `openHoverOverlay`, the ONE policy both
       pointer-opened overlays go through — the card reaches it by going
       through that door rather than by keeping its own copy. */
    const body = fnBody('openHoverOverlay');
    expect(fnBody('showWarnPop')).toContain('openHoverOverlay(');
    // a passive mouse path across the table is not consent to discard a staged
    // due date that only Apply writes (W2)
    expect(body).toContain('OVERLAY_KEYS');
    // …and it must derive that from the list, not restate it: a second hardcoded
    // roll-call is the thing OVERLAY_KEYS exists to prevent
    expect(body).not.toMatch(/'(urgencyMenu|diffMenu|duePopover|reqSortMenu|reqFilterMenu)'/);
  });

  it('nulls the captured trigger BEFORE closing on focus-out, or focus is trapped', () => {
    const body = handlerBody('warnPopFocusOut');
    // closeMenus' heldFocus branch would otherwise yank focus back to the icon
    // the instant the user Tabs out of `Open Card`
    expect(body).toContain('overlayTrigger = null');
    expect(body.indexOf('overlayTrigger = null')).toBeLessThan(body.indexOf('closeMenus('));
    // a null relatedTarget (window blur) is NOT a dismissal — the document
    // click dismisser owns that case
    expect(body).toContain('relatedTarget');
  });

  it('sends the flip decision out of placeBox rather than recomputing it', () => {
    // the markup needs the fact, because the bridge must sit on the gap side
    expect(fnBody('placeBox')).toMatch(/return \{[^}]*\bup\b[^}]*\}/);
  });
});

/**
 * T166 (integration). Both halves of this block are seams the three builders
 * could not see from their own file, and neither is provable by a synthetic
 * event — what IS provable is that the guard exists and runs before the timer
 * is armed.
 *
 * 1. R-warn-r held one way only. `showWarnPop` refuses to OPEN over another
 *    overlay, but the mouseleave that followed was unconditional — so a pointer
 *    that merely crossed a warning icon while a due popover was up armed a
 *    close that discarded a staged date only Apply writes (W2).
 * 2. Ractive delegates an each-block's events with a CAPTURE listener on the
 *    <tbody> and then simulates bubbling by walking from `ev.target` upward
 *    (`delegateHandler`, ractive.mjs). That is what makes `mouseenter` /
 *    `mouseleave` / `focus` arrive at all — none of the three bubbles — but it
 *    also re-dispatches a CHILD's mouseleave to the ancestor's handler, which
 *    native mouseleave never does. Moving off the 14px glyph onto the button's
 *    own padding, or between two lines inside the card, would otherwise arm a
 *    close while the pointer never left anything.
 */
describe('the pointer path cannot close what it did not open', () => {
  const body = () => handlerBody('warnPopOut');

  it('arms no close when no hover card is open — R-warn-r, from the leave side', () => {
    /* The ownership check moved into `leaveHoverOverlay`, the shared
       hover-LEAVE policy — which now also owns the cancel, and that cancel must
       come AFTER it: the close timer is shared, so cancelling before knowing
       whether the overlay leaving is ours cancels somebody else's pending close
       and never reschedules it, stranding their overlay open. */
    expect(body()).toContain("leaveHoverOverlay('warnPop')");
    const policy = fnBody('leaveHoverOverlay');
    expect(policy).toMatch(/if \(!app\.get\(key\)\) return false;/);
    expect(policy.indexOf('app.get(key)')).toBeLessThan(policy.indexOf('warnPopCancelClose()'));
    expect(body().indexOf("leaveHoverOverlay('warnPop')")).toBeLessThan(body().indexOf('scheduleHoverClose('));
  });

  it('arms no close when the pointer never left the node the directive sits on', () => {
    // relatedTarget is where the pointer actually went — the same shape the
    // focus-out guard uses, for the same reason
    expect(body()).toContain('relatedTarget');
    expect(body()).toContain('ctx.node.contains(to)');
    expect(body().indexOf('relatedTarget')).toBeLessThan(body().indexOf('scheduleHoverClose('));
  });

  it('does not re-open the card on the shared close path’s own focus return', () => {
    /* The icon opens on FOCUS, and closeMenus({ restoreFocus: true }) focuses
       the icon — so Escape would close the card and the restore would re-open
       it in the same tick. One flag, set by the one close path, read by the one
       opener; `focus()` dispatches synchronously, so it is never held longer
       than that call. (WAI-ARIA's tooltip pattern: Escape dismisses and the
       trigger keeps focus until focus leaves and returns.) */
    expect([...jsCode.matchAll(/\blet\s+restoringFocus\b/g)]).toHaveLength(1);
    expect(fnBody('showWarnPop')).toContain('if (restoringFocus) return;');
    const close = fnBody('closeMenus');
    expect(close).toContain('restoringFocus = true');
    expect(close).toContain('restoringFocus = false');
    expect(close.indexOf('restoringFocus = true')).toBeLessThan(close.indexOf('t.focus('));
    expect(close.indexOf('t.focus(')).toBeLessThan(close.indexOf('restoringFocus = false'));
  });

  it('stands down only for the host of the card that is OPEN, not for any host (R-warn-v)', () => {
    /* `.warnhost` renders on every one of the 247 warned rows, so
       `activeElement.closest('.warnhost')` alone answers "is focus in A host",
       not "is focus in MY host". Tab to row A's icon (its card opens on focus),
       then hover row B's icon and move the pointer away: the callback found
       focus inside A's host, returned, and card B was stranded open with no
       pointer on it and no focus in it — dismissible only by Escape, an outside
       click or a scroll, and NOT by clicking it, which the ignore list eats.
       `overlayTrigger` is the open card's own icon, so containment against it
       is the scoping the comment always claimed. */
    const b = body();
    expect(b).toContain("closest('.warnhost')");
    expect(b, 'the stand-down is not scoped to the open card')
      .toMatch(/overlayTrigger[\s\S]{0,40}\)\s*return;|contains\(overlayTrigger\)/);
    // the unscoped spelling is the regression: a bare closest() feeding return
    expect(b).not.toMatch(/if \(ae && ae\.closest && ae\.closest\('\.warnhost'\)\) return;/);
  });

  it('dismisses on focus-out only when the card is inside THIS host (R-warn-v)', () => {
    /* Same rule from the focus side. `!app.get('warnPop')` is a GLOBAL read: a
       Tab off row A's icon dismissed a card the POINTER had opened on row B and
       nulled a trigger this host never captured. The card is rendered inside
       its own host exactly when it is ours, so ask the host. */
    const b = handlerBody('warnPopFocusOut');
    expect(b).toContain("ctx.node.querySelector('.warnpop')");
    expect(b, 'a global state read cannot tell whose card is open')
      .not.toMatch(/!app\.get\('warnPop'\)/);
    // the ownership question still comes before anything is closed
    expect(b.indexOf('querySelector')).toBeLessThan(b.indexOf('closeMenus('));
  });
});
