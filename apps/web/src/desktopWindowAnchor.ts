/**
 * Draggable desktop windows: canonical anchor as % of `#desktop`, px translate during interaction.
 * See apps/web/UI_THEME.md — window sizing & resize.
 */

const ROTATE_RE = /rotate\([^)]+\)/;

export function getDesktopEl(): HTMLElement {
  const el = document.getElementById('desktop');
  if (!el) throw new Error('#desktop missing');
  return el;
}

export function extractRotation(transformStyle: string): string {
  const m = transformStyle.match(ROTATE_RE);
  return m ? m[0] : '';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Fold current visual position (including translate) into `left`/`top` as % of `#desktop`, then zero translate.
 *
 * For rotated windows, `getBoundingClientRect()` is the axis-aligned bounds — using its top-left as `%`
 * `left`/`top` is wrong because those properties anchor the pre-transform box. We preserve visual placement by:
 * measuring bbox with full transform, stripping translate (keeping rotation), measuring again, shifting
 * `offsetLeft`/`offsetTop` by the viewport delta, then converting to %.
 */
export function bakeTranslateIntoPercentAnchor(win: HTMLElement): void {
  // Hidden windows report a zero rect; baking would clobber saved % anchors with 0%/0%.
  if (getComputedStyle(win).display === 'none') return;

  const desktop = getDesktopEl();
  const d = desktop.getBoundingClientRect();
  const rotation = extractRotation(win.style.transform);
  const rFull = win.getBoundingClientRect();
  win.style.transform = rotation ? `translate3d(0,0,0) ${rotation}` : 'translate3d(0,0,0)';
  void win.offsetHeight;
  const r0 = win.getBoundingClientRect();
  const dx = rFull.left - r0.left;
  const dy = rFull.top - r0.top;
  const newLeft = win.offsetLeft + dx;
  const newTop = win.offsetTop + dy;
  win.style.left = `${round2((newLeft / d.width) * 100)}%`;
  win.style.top = `${round2((newTop / d.height) * 100)}%`;
  win.style.bottom = '';
  win.style.right = '';
  win.style.transform = rotation ? `translate3d(0,0,0) ${rotation}` : 'translate3d(0,0,0)';
}

/**
 * Set `left`/`top` as % of `#desktop` from viewport pixel coordinates (e.g. clamped layout targets).
 */
export function setDesktopAnchorFromViewportPx(leftPx: number, topPx: number, win: HTMLElement): void {
  const d = getDesktopEl().getBoundingClientRect();
  win.style.left = `${round2(((leftPx - d.left) / d.width) * 100)}%`;
  win.style.top = `${round2(((topPx - d.top) / d.height) * 100)}%`;
  win.style.bottom = '';
  win.style.right = '';
}
