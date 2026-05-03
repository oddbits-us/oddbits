/**
 * Persist draggable `.window` positions (open/closed, z-order, rotation) in localStorage (per-browser).
 * Window width/height are intentionally not persisted — CSS defaults apply on load; session resize is in-memory only.
 */
import { extractRotation } from './desktopWindowAnchor';

export const DESKTOP_LAYOUT_STORAGE_KEY = 'oddbits-desktop-layout-v1';

export type SavedWindowState = {
  hidden: boolean;
  left: string;
  top: string;
  /** Kept when inline styles are empty (e.g. closed window) so reopen restores placement. */
  lastLeft?: string;
  lastTop?: string;
  /** Rotation only; translate is always baked into left/top on save. */
  transformRotate: string;
  zIndex: string;
};

export type SavedDesktopLayout = {
  /** v2: width/height are no longer persisted (CSS defaults + session resize only). */
  v: 1 | 2;
  windows: Record<string, SavedWindowState>;
};

export function loadDesktopLayout(): SavedDesktopLayout | null {
  try {
    const raw = localStorage.getItem(DESKTOP_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedDesktopLayout;
    if ((parsed?.v !== 1 && parsed?.v !== 2) || !parsed.windows || typeof parsed.windows !== 'object')
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDesktopLayout(layout: SavedDesktopLayout): void {
  try {
    localStorage.setItem(DESKTOP_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* quota / private mode */
  }
}

/** Removes persisted desktop layout (window positions). Safe no-op if unavailable. */
export function clearDesktopLayout(): void {
  try {
    localStorage.removeItem(DESKTOP_LAYOUT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function captureDesktopLayout(): SavedDesktopLayout {
  const previous = loadDesktopLayout();
  const prevW = previous?.windows ?? {};
  const windows: Record<string, SavedWindowState> = {};
  document.querySelectorAll('.window.draggable').forEach((node) => {
    const el = node as HTMLElement;
    if (!el.id) return;
    const p = prevW[el.id];
    const left = el.style.left || '';
    const top = el.style.top || '';
    /** DOM can briefly hold 0%/0% after a bad hidden-window bake; do not replace stored last-known with that. */
    const degenerateAnchors = left === '0%' && top === '0%';
    windows[el.id] = {
      hidden: el.style.display === 'none',
      left,
      top,
      lastLeft: degenerateAnchors
        ? p?.lastLeft || p?.left || ''
        : left || p?.lastLeft || p?.left || '',
      lastTop: degenerateAnchors
        ? p?.lastTop || p?.top || ''
        : top || p?.lastTop || p?.top || '',
      transformRotate: extractRotation(el.style.transform),
      zIndex: el.style.zIndex || '',
    };
  });
  return { v: 2, windows };
}

/** Saved layout can have left/top "0%"/"0%" after a bad bake on a hidden window; prefer last known then. */
function preferLastKnownAnchors(st: SavedWindowState): boolean {
  const l = st.left || '';
  const t = st.top || '';
  if (l !== '0%' || t !== '0%') return false;
  const ll = st.lastLeft || '';
  const lt = st.lastTop || '';
  return Boolean((ll && ll !== '0%') || (lt && lt !== '0%'));
}

function anchorLeft(st: SavedWindowState): string {
  if (preferLastKnownAnchors(st)) return st.lastLeft || st.left || '';
  return st.left || st.lastLeft || '';
}

function anchorTop(st: SavedWindowState): string {
  if (preferLastKnownAnchors(st)) return st.lastTop || st.top || '';
  return st.top || st.lastTop || '';
}

export function applyWindowState(el: HTMLElement, st: SavedWindowState): void {
  el.style.display = st.hidden ? 'none' : 'flex';
  const L = anchorLeft(st);
  const T = anchorTop(st);
  if (L) el.style.left = L;
  if (T) el.style.top = T;
  el.style.bottom = '';
  el.style.right = '';
  const rot = st.transformRotate;
  el.style.transform = rot ? `translate3d(0,0,0) ${rot}` : 'translate3d(0,0,0)';
  if (st.zIndex) el.style.zIndex = st.zIndex;
}

/** Re-apply last known geometry before showing a window (icon click). Does not set z-index (caller raises). */
export function applyLastKnownAnchorsOnly(el: HTMLElement, st: SavedWindowState): void {
  const L = anchorLeft(st);
  const T = anchorTop(st);
  if (L) el.style.left = L;
  if (T) el.style.top = T;
  el.style.bottom = '';
  el.style.right = '';
  const rot = st.transformRotate;
  el.style.transform = rot ? `translate3d(0,0,0) ${rot}` : 'translate3d(0,0,0)';
}

export function savedStateHasAnchors(st: SavedWindowState): boolean {
  return Boolean(anchorLeft(st) && anchorTop(st));
}
