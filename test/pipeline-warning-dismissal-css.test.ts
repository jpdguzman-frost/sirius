/**
 * The Pipeline per-row warning — the document dismissers, and one recipe per
 * visual (CSS). The selector walkers below the banner are this file’s alone.
 *
 * Split verbatim out of `test/pipeline-warning.test.ts`, split 2026-09-05 (PLAN.md §D);
 * the shared prelude is `test/helpers/pipeline-warning.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_JS,
  APP_JS_CODE,
  PIPELINE_CSS,
  cssRule,
  decl,
  fnBody,
} from './helpers/gantt-render.ts';
import { cssCode, cssVar, jsCode, tplCode } from './helpers/pipeline-warning.ts';

describe('the document dismissers name the TRIGGER, not the wrapper', () => {
  /** The `document` click dismisser's body, from its listener to the closing `});`. */
  const clickListener = (): string => {
    const at = jsCode.indexOf("addEventListener('click'");
    expect(at, 'the click dismisser moved').toBeGreaterThan(-1);
    return jsCode.slice(at, jsCode.indexOf('\n});', at));
  };

  it('ignores clicks on the icon and inside the card', () => {
    /* The selectors moved into `OVERLAY_SHIELDS`, keyed by overlay, after two
       overlays joined OVERLAY_KEYS and were never added to the hand-written
       string here — so the list is read where it now lives. The rule is
       unchanged: every click-opened trigger, and every overlay box, is
       shielded from the dismisser that would otherwise race its own toggle. */
    const shields = decl(APP_JS, 'OVERLAY_SHIELDS');
    expect(clickListener()).toContain('OVERLAY_SHIELD');
    expect(shields).toContain('.warnpop');
    // the deleted message trigger must not linger as a dead selector
    expect(shields).not.toContain('.warnmsg');
    expect(jsCode).not.toContain('.warnwrap');
    for (const sel of ['.ubadge-wrap', '.selectmenu', '.duewrap', '.duepop', '.selwrap']) {
      expect(shields, `${sel} left the ignore list`).toContain(sel);
    }
  });

  it('shields the warning icon ONLY while its own card is open (R-warn-w)', () => {
    /* `.warnbtn` is the one trigger with no `on-click` — hover and focus open
       it — so it has no toggle for the dismisser to race. Shielded
       unconditionally it becomes a hole: with a difficulty menu or a due
       popover up, a click on the icon neither opens the card (showWarnPop
       refuses over an active edit, R-warn-r) nor dismisses what IS open. The
       shield has to be gated on `warnPop`, which is also what keeps a touch
       tap's synthesised click from closing the card the tap just opened
       (R-warn-l). */
    const body = clickListener();
    expect(body).toMatch(/app\.get\('warnPop'\)[\s\S]{0,80}\.warnbtn/);
    // the regression is `.warnbtn` back inside the unconditional shield map
    // beside the triggers that DO own a click handler
    expect(decl(APP_JS, 'OVERLAY_SHIELDS'), 'the icon must not be shielded unconditionally').not.toContain('.warnbtn');
  });

  it('admits the hover card to the self-scroll exemption — Miles amended R-warn-h (owl #43 item D)', () => {
    /* That exemption names overlays that scroll INSIDE themselves. R-warn-h
       originally kept the card out because it had no overflow at all; the
       last-resort ruling gives it overflow in exactly one state (a viewport
       its measured height cannot fit), and a scroll the card answers itself
       must not dismiss it there. On every other viewport the card still has
       no overflow, so a scroll's target is never inside it and the dismissal
       behaviour is unchanged — which is why the exemption is safe to hold
       unconditionally. */
    const at = jsCode.indexOf("addEventListener('scroll'");
    expect(at).toBeGreaterThan(-1);
    const listener = jsCode.slice(at, jsCode.indexOf('}, true)', at));
    expect(listener).toContain('OVERLAY_SELF_SCROLL');
    /* Read as MEMBERSHIP: the filter panel joined this list because its STATUS
       group is a deliberate internal scroller, and a fourth self-scrolling
       overlay joining must not fail a rule about the card. */
    const selfScroll = decl(APP_JS, 'OVERLAY_SELF_SCROLL');
    for (const sel of ['.duepop', '.selectmenu', '.warnpop']) expect(selfScroll).toContain(sel);
  });

  it('caps and scrolls the card ONLY in the last-resort state — the base recipe stays uncapped', () => {
    /* The rule Miles kept: no internal scrolling in every normal case. So the
       cap must live on `.warnpop.scroll` alone; a max-height or overflow on
       the base `.warnpop` would put a scrollbar on every viewport and quietly
       repeal the ruling it implements. */
    const scroll = cssRule('.warnpop.scroll', PIPELINE_CSS);
    expect(scroll).toContain('max-height: calc(100vh - var(--warn-vclamp))');
    expect(scroll).toContain('overflow-y: auto');
    /* THE TWIN (owl #53). The cap and placeBox's `over` verdict must agree on
       one number or the capped box measures as "fits now" and oscillates. So
       the CSS side is DERIVED from the JS side here rather than retyped: both
       vertical clamp margins, each the shared edge plus the shadow's bleed in
       that direction. If anyone changes the shadow and forgets the token, this
       is what goes red. */
    const edge = Number(/=\s*(\d+)/.exec(decl(APP_JS_CODE, 'OVERLAY_EDGE'))?.[1]);
    const bleed = new Function(`${decl(APP_JS_CODE, 'WARN_SHADOW_BLEED')} return WARN_SHADOW_BLEED;`)() as {
      x: number; top: number; bottom: number;
    };
    expect(edge).toBeGreaterThan(0);
    expect(cssVar('--warn-vclamp')).toBe(`${edge + bleed.top + edge + bleed.bottom}px`);
    /* the horizontal bleed has no CSS twin — it only ever reaches the clamp —
       but it must actually be spent there, or the card's sides clip */
    expect(fnBody('placeBox')).toContain('OVERLAY_EDGE + bleed.x');
    // a wheel at the card's own end must not chain to the page and trip the
    // scroll dismisser while the user is scrolling the card itself
    expect(scroll).toContain('overscroll-behavior: contain');
    for (const prop of ['max-height', 'overflow']) {
      expect(cssRule('.warnpop', PIPELINE_CSS), `base .warnpop carries ${prop}`).not.toContain(prop);
    }
    // placeBox is the one decider, from the measured height against the
    // viewport — `>=`, because the scroll state caps the box at exactly
    // viewport-minus-margins and a strict compare would oscillate
    expect(fnBody('placeBox')).toMatch(/over = [^;]*>= window\.innerHeight/);
    expect(fnBody('placeBox')).toMatch(/return \{[^}]*over[^}]*\}/);
  });

  it('leaves Escape alone — it is on `document`, so it already reaches the card', () => {
    /* Escape fires with focus inside the card too, and the ONE close path hands
       focus back to the icon. Read out of the keydown listener rather than out
       of the whole file: five other handlers contain the same
       `closeMenus({ restoreFocus: true })` call, so grepping the file proves
       nothing about Escape. */
    const at = jsCode.indexOf("addEventListener('keydown'");
    expect(at, 'the Escape dismisser moved').toBeGreaterThan(-1);
    const listener = jsCode.slice(at, jsCode.indexOf('\n});', at));
    expect(listener).toMatch(/e\.key === 'Escape' && anyMenuOpen\(\)/);
    expect(listener).toContain('closeMenus({ restoreFocus: true })');
  });

  it('leaves the wheel swallow duePopover-only — the card protects itself, or not at all', () => {
    /* The swallow exists so a trackpad nudge inside the DUE popover does not
       chain to the page and trip the scroll dismisser, discarding a staged
       date. The hover card needs no seat here even after the last-resort
       ruling: on a normal viewport it has no overflow, a nudge over it chains
       to the page and SHOULD dismiss it (it holds no staged edit); in the
       scroll state the wheel scrolls the card natively — the scroll target is
       the card, the exemption above holds it open, and `overscroll-behavior:
       contain` stops the chain at the card's own end. This test previously
       asserted only Escape and would have passed with the whole listener
       deleted. */
    const at = jsCode.indexOf("addEventListener('wheel'");
    expect(at, 'the wheel swallow was deleted').toBeGreaterThan(-1);
    const listener = jsCode.slice(at, jsCode.indexOf('\n}, { passive: false })', at));
    expect(listener).toContain("app.get('duePopover')");
    expect(listener).toContain("closest('.duepop')");
    expect(listener).toContain('preventDefault()');
    expect(listener, 'the hover card must not join the swallow').not.toContain('warnPop');
  });

  it('RETURNS focus rather than stealing it — the pointer opens the card (R-warn-u)', () => {
    /* The first overlay a POINTER opens is the first whose captured trigger is
       not also what the browser just focused. Without this the Escape a user
       types in the search field drags the caret onto a warning icon the pointer
       merely grazed. `restoringFocus` does not cover it — that suppresses the
       re-OPEN, not the focus move. */
    const close = fnBody('closeMenus');
    // focus is ours when it is on the trigger, inside the overlay, or nowhere
    expect(close).toMatch(/ae\s*===\s*t\b/);
    expect(close).toMatch(/ae\s*===\s*document\.body/);
    expect(close).toContain('heldFocus');
    /* …and that verdict has to gate the SAME `t.focus()` the ordering guards
       above pin, not sit in the body as an unread const. Read the `if` that
       actually wraps the call rather than the whole function. */
    const upTo = close.slice(0, close.indexOf('t.focus('));
    const guard = upTo.slice(upTo.lastIndexOf('if ('));
    expect(guard, 'the focus return is not gated on focusIsOurs').toContain('focusIsOurs');
  });
});

/**
 * Every rule in `src` whose selector's FINAL compound targets one of `tokens`
 * — rules that style THAT element, not a descendant of it.
 * `.ptable .mccell .chevbtn svg` ends at `svg`, so the chevron's own
 * `transform: rotate(90deg)` is correctly none of this block's business.
 */
function cssRules(src: string): Array<[string, string]> {
  return [...src.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => [m[1]!.trim(), m[2]!] as [string, string]);
}

/** The last compound of a selector — the element the rule actually styles. */
const subject = (sel: string): string => sel.trim().split(/[\s>+~]+/).filter(Boolean).pop() ?? '';

const compoundHits = (compound: string, tokens: string[]): boolean =>
  tokens.some((t) => (t.startsWith('.')
    ? new RegExp(`\\${t}(?![\\w-])`).test(compound)
    : new RegExp(`(^|[^\\w.#-])${t}(?![\\w-])`).test(compound)));

function rulesTargeting(tokens: string[], src: string): Array<[string, string]> {
  return cssRules(src).filter(([sel]) => sel.split(',').some((s) => compoundHits(subject(s), tokens)));
}

/** True when a declaration block sets `prop` (and not merely a longhand of it). */
const declares = (decls: string, prop: string): boolean =>
  new RegExp(`(^|[;{\\s])${prop}\\s*:`).test(decls);

describe('one recipe per visual (CSS)', () => {
  it('lets NOTHING on the card’s ancestor chain create a containing block', () => {
    /* `.warnpop` is `position: fixed` precisely so it escapes the `.pscroll`
       clip and the MC# cell's overflow. `transform`, `filter`, `contain`,
       `will-change`, `perspective` and `backdrop-filter` each make the element
       carrying them the containing block for a FIXED descendant — so any one of
       them anywhere from `.pscroll` down to `.warnhost` re-anchors every hover
       card back inside the cell the fixed positioning exists to escape.
       Stated in prose in three places before this test and enforced nowhere:
       `transform: translateY(-0.05em)` on `.ptable .mcid` went green.
       And it is not hypothetical — the live pass owes a look at `.mcid`'s
       ~1px optical shift inside `.mccell`, and a nudge is exactly the reflex
       fix. Same shape as the retired run-geometry suite's `.grun` property
       bans (its arithmetic lives on in the sprint-schedule-*.test.ts suites). */
    expect(PIPELINE_CSS, 'the flat rule walker cannot see inside an at-rule')
      .not.toMatch(/@(media|supports|container)/);
    const chain = ['.pscroll', '.ptable', 'table', 'tbody', 'tr', '.prow', 'td', '.col-mc', '.mccell', '.mcid', '.warnhost'];
    const banned = ['transform', 'filter', 'contain', 'will-change', 'perspective', 'backdrop-filter'];
    const rules = rulesTargeting(chain, PIPELINE_CSS);
    expect(rules.length, 'the walker matched nothing — its selectors moved').toBeGreaterThan(4);
    for (const [sel, decls] of rules) {
      for (const prop of banned) {
        expect(decls, `\`${sel}\` declares ${prop}, which re-anchors the fixed hover card`)
          .not.toMatch(new RegExp(`(^|[;\\s])${prop}\\s*:`));
      }
    }
  });

  it('positions the card in exactly one place — the shared fixed-box recipe', () => {
    /* `.warnpop`'s own rule already refuses `position:`; that reads ONE rule, so
       a second `.warnhost .warnpop { position: relative }` anywhere in the
       sheet went green — and it would drop the card back inside the .pscroll
       clip. The bridge is excluded because it IS absolute, by design. */
    const positioners = rulesTargeting(['.warnpop'], PIPELINE_CSS)
      .filter(([sel, decls]) => !sel.includes('::before') && declares(decls, 'position'));
    expect(positioners.map(([sel]) => sel), 'the card is positioned in more than one place')
      .toHaveLength(1);
    /* Asserted as MEMBERSHIP, not as a fixed roster: the rule being defended is
       "one positioning recipe, and the card is in it". Pinning the exact set
       makes a fourth overlay JOINING the recipe — the correct move — fail here,
       which is the count-pin trap test/CLAUDE.md rule 1 names. */
    const members = positioners[0]![0].split(',').map((x) => x.trim());
    expect(members).toContain('.warnpop');
    expect(members).toContain('.selectmenu');
    expect(positioners[0]![1]).toContain('position: fixed');
  });

  it('joins the shared fixed-box popover base rather than forking it', () => {
    /* Read as a SET, not as a spelling: `.duepop, .selectmenu, .warnpop {` is
       the identical rule and must not fail here. */
    const base = /\n([^{}\n]*\.warnpop[^{}\n]*)\{\s*\n\s*position: fixed/.exec(PIPELINE_CSS)?.[1];
    expect(base, 'the shared fixed-box base rule moved').toBeTruthy();
    expect(base!.split(',').map((x) => x.trim())).toContain('.warnpop');
    // the fork is the annotation's slate-100 stroke and the asymmetric radius
    const own = cssRule('.warnpop', PIPELINE_CSS);
    expect(own).toContain('width: 235px');
    expect(own).toContain('border-color: var(--slate-100)');
    expect(own).not.toContain('position:');
    /* owl #53 REVISES this: the card now forks the shadow too, and does it
       deliberately. The base rule still carries --shadow-xs for the other two
       overlays — that is what makes this a fork and not a redefinition. */
    expect(own).toContain('box-shadow: var(--shadow-card)');
    // the base rule is found by the same membership match as above, so a new
    // member joining it cannot break this assertion about the SHADOW
    expect(PIPELINE_CSS.slice(PIPELINE_CSS.indexOf(base!), PIPELINE_CSS.indexOf('}', PIPELINE_CSS.indexOf(base!))))
      .toContain('box-shadow: var(--shadow-xs)');
    /* the heavier value is the annotation's own (node 537:69135 / Figma
       `Shadow/sm`), and it must NOT drift toward the light chrome it exists to
       outweigh — Miles ruled that explicitly in owl #53 */
    expect(cssVar('--shadow-card')).toBe('0 4px 12px rgba(0, 0, 0, 0.15)');
    expect(cssVar('--shadow-card')).not.toBe(cssVar('--shadow-xs'));
  });

  it('squares the corner the card grows out of — top-left anchored, bottom-left flipped', () => {
    const radius = (sel: string) => /border-radius:([^;]*);/.exec(cssRule(sel, PIPELINE_CSS))![1]!.trim();

    // anchored BELOW the icon: the top-left is the corner touching it
    const down = radius('.warnpop');
    expect(down.startsWith('0 ')).toBe(true);
    expect([...down.matchAll(/var\(--radius-md\)/g)]).toHaveLength(3);

    // R-warn-i: flipped ABOVE, the square mirrors to the bottom-left so it
    // still reads as growing out of the icon. Default taken, flagged to Miles.
    const up = radius('.warnpop.flip');
    expect(up.endsWith(' 0')).toBe(true);
    expect([...up.matchAll(/var\(--radius-md\)/g)]).toHaveLength(3);
  });

  it('bridges the 4px gap with a transparent pseudo-element that flips with the card', () => {
    /* R-warn-p. The card sits off the icon by the gap; without a bridge the
       pointer crosses dead space and the close timer fires before it can reach
       `Open Card`. It paints nothing, and it cannot exist while the card is
       closed because the card is not rendered then. */
    const before = cssRule('.warnpop::before, .chipmenu::before', PIPELINE_CSS);
    expect(before).toMatch(/content: ''/);
    expect(before).toContain('position: absolute');
    expect(before).not.toContain('background');
    expect(before).toMatch(/top:/);

    const flipped = cssRule('.warnpop.flip::before', PIPELINE_CSS);
    expect(flipped).toContain('bottom:');
    expect(flipped).toContain('top: auto');
  });

  it('dresses the trigger as an amber icon button with a hit area bigger than its glyph', () => {
    const rule = cssRule('.warnbtn', PIPELINE_CSS);
    expect(rule).toContain('cursor: pointer');
    expect(rule).toContain('color: var(--amber-600)');
    // the annotation asks for a hit area larger than the 14px glyph, and the
    // padding is part of that — a token, never a bare px
    expect(rule).toMatch(/padding: var\(--space-\d+\)/);
    /* Miles's ruling (owl #46): the box grows to the documented target-size
       threshold — the spacing token whose name IS that threshold, so the
       number lives in the token sheet and nowhere here. Minimum sizes, not
       fixed ones: the box may grow with its content but never shrink under
       the threshold. */
    expect(rule).toContain('min-width: var(--space-24)');
    expect(rule).toContain('min-height: var(--space-24)');
    // it is an icon now: the underline went with the message line
    expect(rule).not.toContain('text-decoration');
    expect(cssRule('.i14', PIPELINE_CSS)).toContain('width: 14px');
    expect(cssRule('.i14', PIPELINE_CSS)).toContain('height: 14px');
  });

  it('groups the MC# label and its icon as ONE unit, gapped with a token', () => {
    const rule = cssRule('.ptable .mcid', PIPELINE_CSS);
    expect(rule).toContain('display: flex');
    // R-warn-n: `content › icon-offset` carries no px value in the frame, so
    // the gap is a token and the deviation is recorded, not invented
    expect(rule).toMatch(/gap: var\(--space-\d+\)/);
  });

  it('serves the icon from the table\'s one shared focus ring', () => {
    /* Read as a SET: which selector comes first in the list is a CSS no-op, and
       pinning the order would fail a correct reorder. What matters is that the
       icon's ring is a member of the ONE shared rule and that no second rule
       restates it. */
    const at = PIPELINE_CSS.indexOf('.datefield:focus-visible');
    const list = PIPELINE_CSS.slice(at, PIPELINE_CSS.indexOf('{', at)).split(',').map((s) => s.trim());
    expect(list).toContain('.warnbtn:focus-visible');
    expect(list).toContain('.datefield:focus-visible');
    // one ring, not two: a second rule for the same state is the fork
    expect([...cssCode.matchAll(/\.warnbtn:focus-visible/g)]).toHaveLength(1);
  });

  it('leaves Open Card UNDERLESS in blue-700 and titles the popover amber-700/600', () => {
    /* JP, 2026-08-20, comparing the built card with the frame side by side:
       the frame's render carries no underline, so the annotation's "UNDERLINED"
       loses. Batch 10 had resolved the same conflict the other way — asserted
       negatively here so putting the declaration back is a deliberate act with
       a red test behind it, not a silent drift. */
    expect(cssRule('.wpopen', PIPELINE_CSS)).toContain('text-decoration: none');
    expect(cssRule('.wpopen', PIPELINE_CSS)).not.toMatch(/text-decoration: underline/);
    expect(cssRule('.wpopen', PIPELINE_CSS)).toContain('var(--blue-700)');
    expect(cssRule('.wptitle', PIPELINE_CSS)).toContain('var(--amber-700)');
    expect(cssRule('.wptitle', PIPELINE_CSS)).toContain('font-weight: 600');
  });

  it('declares the R-warn-a left accent exactly once', () => {
    /* Read the comment-free copy: R-warn-a's block is prose and may legitimately
       quote the declaration it explains — counting quotations would fail a
       correct sheet. Every other rule in this describe already reads `cssCode`. */
    expect([...cssCode.matchAll(/inset 3px 0 0/g)]).toHaveLength(1);
    expect(cssCode).toContain('var(--amber-300)');
  });

  it('paints NO background on a warned row — asserted by shape, so it cannot creep back', () => {
    /* Miles's amber-wall ruling (#41): with 247 of 249 live rows warned, the
       wash was the page's ground colour. Deleting it is also what makes
       R-warn-g structural — `.ptable tr.blocked td` is now uncontested, so a
       blocked+warned row keeps its red fill without an override to defend it.

       Anchored on the PROPERTY inside a rule that targets a warned row or one
       of its cells, not on a selector spelling. `/\.prow\.warn[^{]*\{[^}]*
       background/` was both too narrow and too wide: `.ptable tr.warn > td`
       and `.ptable tr.warn.prow > td` restored the wall with a green suite,
       while a hover chip on the ICON (`… .warn .warnbtn:hover { background }`)
       and a paint-nothing `background-clip` on the accent were rejected. */
    let seen = 0;
    for (const [sel, decls] of cssRules(PIPELINE_CSS)) {
      for (const one of sel.split(',')) {
        // the selector must reach a WARNED row anywhere along its chain…
        if (!/\.warn(?![\w-])/.test(one)) continue;
        // …and style the row or one of its cells: a descendant of a warned row
        // (the icon, its hover chip) may still legitimately paint itself
        if (!compoundHits(subject(one), ['tr', 'td', '.prow', '.warn'])) continue;
        seen++;
        for (const prop of ['background', 'background-color', 'background-image']) {
          expect(declares(decls, prop), `\`${one.trim()}\` repaints a warned row — the amber wall is Miles's ruling`)
            .toBe(false);
        }
      }
    }
    // the accent rule itself is one of them; if the walker sees nothing, it broke
    expect(seen, 'no warned-row rule matched — the walker’s selectors moved').toBeGreaterThan(0);
    expect(cssCode).not.toMatch(/\.warnwrap|\.warnmsg|\.warnlabel|\.i10\b/);
    expect(tplCode, '.i10 lingers in the template').not.toMatch(/\bi10\b/);
  });

  it('keeps the row height CONTENT-derived — the frame numbers are outcomes, not targets', () => {
    /* R-warn-a, restated for batch 10: deleting the message line is what
       returns the row to ~95px. Asserting the number would pin an outcome and
       block the next correct change — so state the RULE (no rule in this sheet
       sets a row height) instead of banning two integers file-wide, which
       rejected an unrelated column that happened to measure 95px. */
    for (const [sel, decls] of rulesTargeting(['tr', 'td', '.prow', '.ptask'], PIPELINE_CSS)) {
      for (const prop of ['height', 'min-height', 'max-height']) {
        expect(decls, `\`${sel}\` sets a row height — R-warn-a keeps it content-derived`)
          .not.toMatch(new RegExp(`(^|[;\\s])${prop}\\s*:`));
      }
    }
    expect(cssRule('.ptable .col-name', PIPELINE_CSS)).not.toContain('280px');
  });

  it('spends no raw hex and no raw px on the new rules — tokens only', () => {
    // the ONE exception the constitution allows is an icon glyph box, which is
    // exactly the shape .i13/.i15/.i16/.i18 already have
    for (const sel of ['.warnbtn', '.warnhost', '.ptable .mcid', '.warnpop.flip', '.warnpop.scroll', '.wpwhy, .wpfix', '.warnpop::before, .chipmenu::before', '.warnpop.flip::before']) {
      const rule = cssRule(sel, PIPELINE_CSS).replace(/\/\*[\s\S]*?\*\//g, ' ');
      expect(rule, `${sel} carries a raw hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(rule, `${sel} carries a raw px`).not.toMatch(/\d+px/);
    }
  });
});
