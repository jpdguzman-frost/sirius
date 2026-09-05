/**
 * The Pipeline per-row warning — the banner it replaced, and the checklist
 * owed to the live pass (the 24 `it.todo`).
 *
 * Split verbatim out of `test/pipeline-warning.test.ts`, split 2026-09-05 (PLAN.md §D);
 * the shared prelude is `test/helpers/pipeline-warning.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  PIPELINE_CSS,
  TEMPLATE,
  leakedMustacheText,
} from './helpers/gantt-render.ts';

describe('the banner it replaces is gone, and the aggregate survived it', () => {
  it('leaves no .ipanel markup or styling behind', () => {
    for (const dead of ['ipanel', 'irow', 'ideets', 'ireason', 'iwhy', 'iopen']) {
      expect(TEMPLATE, `${dead} still in the template`).not.toContain(dead);
    }
    for (const dead of ['visibleCorrections', 'toggleCorrections', 'showAllCorrections']) {
      expect(TEMPLATE, `${dead} still in the template`).not.toContain(dead);
      expect(APP_JS, `${dead} still in the client`).not.toContain(dead);
    }
    expect(PIPELINE_CSS).not.toContain('.ipanel');
  });

  it('keeps OPEN WORK counting corrections, and corrections landing from the payload', () => {
    expect(APP_JS).toContain("open: this.get('corrections').length");
    expect(APP_JS).toContain('corrections: pipeline.corrections');
  });

  it('leaks no Ractive comment text into the rendered document', () => {
    /* The MC# cell gained a long comment this batch, in ELEMENT-CONTENT
       position — where `{{! … }}` ends at the first `}}` and spills its tail
       into the page as literal text. `Ractive.parse` accepts that happily, so
       `node frontend/build.js` cannot catch it; only looking at what parsed can. */
    expect(leakedMustacheText()).toEqual([]);
  });
});

/**
 * ─── OWED TO THE LIVE PASS ──────────────────────────────────────────────────
 *
 * Everything above is structure and wiring. NONE of it is evidence that the
 * hover card works, and no test in this repo can be: there is no DOM, no
 * pointer, no focus ring and no clock. A synthetic `mouseenter` dispatched at a
 * detached fragment would go green while the bridge was 40px off and the card
 * unreachable — which is precisely the failure mode this batch exists to avoid.
 *
 * These stay `todo` on purpose. They are not unwritten tests; they are the
 * checklist the orchestrator walks in the browser after deploy, exactly as
 * batch 8 did for the drag. Do not "implement" them with fake events.
 */
describe('what only the live pass can prove (browser, after deploy)', () => {
  it.todo('hovering the icon opens the card, anchored under it with a ~4px gap');
  it.todo('the pointer crosses the gap into the card without it closing — the ::before bridge');
  it.todo('the card stays open while the pointer is inside it, and closes ~150ms after leaving');
  it.todo('moving from row A\'s icon straight to row B\'s leaves B open — A\'s timer never fires late');
  it.todo('Tab reaches the icon, focus alone opens the card, and Tab again reaches Open Card');
  it.todo('Tabbing PAST Open Card closes the card and does not yank focus back to the icon');
  it.todo('Escape with focus inside the card closes it and returns focus to the icon');
  it.todo('near the viewport bottom the card flips up, and the squared corner AND the bridge flip with it');
  it.todo('a horizontal scroll of the table dismisses the card (on a normal viewport it has no scroll of its own)');
  it.todo('owl #43 B: the closing line renders between the field list and Open Card, and wraps inside the card');
  it.todo('owl #43 D: on a viewport shorter than the card (~350px), the card caps, scrolls itself, and scrolling it does not dismiss it');
  it.todo('owl #46: the icon\'s hit target measures at least 24×24 in the browser, and the row height is unchanged');
  it.todo('hovering an icon while a due-date edit is staged leaves that edit intact — entering AND leaving it');
  it.todo('moving off the 14px glyph onto the button’s own padding does not close the card');
  it.todo('moving between two lines inside the card, across its padding, does not close it');
  it.todo('Escape does not immediately re-open the card via the focus returned to the icon');
  it.todo('a warned row shows the 3px amber accent and NO amber wash — including one that is also blocked');
  /* R-warn-p's geometry — measure, do not assume. The bridge is absolutely
     positioned inside a BORDERED fixed box, so its containing block is that
     box's PADDING box: the padding is INSIDE it, giving ~233px of span (235
     less the two 1px borders) and a start 1px inside the gap. The T166 report's
     "~201px inset ~17px each side" confused the padding box with the CONTENT
     box and is corrected in the frame notes — the icon sits well inside the
     span, so the direct downward path IS bridged. Limit that survives: `up` is
     decided before the on-screen clamp, so on a viewport too short for the
     flipped card the clamp can slide it back over its own icon. */
  it.todo('the bridge really does cover the pointer path from the icon into the card');
  /* Fixed after the verify pass — each is a sequence a green suite could not
     see, and none is provable without a pointer, a caret and a real focus ring. */
  it.todo('R-warn-u: Escape typed in the Pipeline search field leaves the caret in the search field, even with the pointer resting on a warning icon');
  it.todo('R-warn-v: Tab to row A’s icon, hover row B’s, move away — B closes and is not stranded open');
  it.todo('R-warn-v: Tab past row A’s icon while a card the pointer opened on row B is up — B survives');
  it.todo('R-warn-w: with a difficulty menu open, clicking a warning icon dismisses that menu');
  it.todo('R-warn-w: on touch, a tap on the icon still opens the card and does not close it again');
  /* Design questions the live pass should LOOK at rather than prove, raised by
     the verify pass and owed to Miles rather than to the code. The occlusion
     question (the open card covering the icons of the rows beneath it) was
     RULED acceptable by Miles in owl #46 item 4 — intentional, not a bug, so
     it left this list. */
  it.todo('the MC# label still fits beside the icon in a 150px column, highlight included, without wrapping after the hyphen');
});
