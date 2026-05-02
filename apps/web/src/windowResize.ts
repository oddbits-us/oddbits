/**
 * Invisible edge/corner hit targets for resizing `.window` frames without changing border visuals.
 */

const HANDLE_WRAP_CLASS = 'window-resize-handles';
const MIN_W_DEFAULT = 260;
const MIN_H_DEFAULT = 120;

function ensureHandles(win: HTMLElement): HTMLElement {
  let wrap = win.querySelector<HTMLElement>(`.${HANDLE_WRAP_CLASS}`);
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = HANDLE_WRAP_CLASS;
    wrap.setAttribute('aria-hidden', 'true');
    const dirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
    for (const dir of dirs) {
      const h = document.createElement('div');
      h.className = 'window-resize-handle';
      h.dataset.dir = dir;
      wrap.appendChild(h);
    }
    win.appendChild(wrap);
  }
  return wrap;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

export type TransformResizeCtx = {
  getOffset: () => { x: number; y: number };
  applyTransform: (x: number, y: number) => void;
  /** After dimensions / translate change */
  afterResize?: () => void;
  minWidth?: number;
  minHeight?: number;
};

/**
 * Desktop windows: position uses transform translate + optional rotate from inline styles.
 */
export function attachTransformWindowResize(win: HTMLElement, ctx: TransformResizeCtx): void {
  if (win.querySelector(`.${HANDLE_WRAP_CLASS}`)) return;
  ensureHandles(win);

  const minW = ctx.minWidth ?? MIN_W_DEFAULT;
  const minH = ctx.minHeight ?? MIN_H_DEFAULT;

  const normalizeAnchoredPosition = () => {
    if (!win.style.bottom && !win.style.right) return;
    const r = win.getBoundingClientRect();
    win.style.top = `${r.top}px`;
    win.style.left = `${r.left}px`;
    win.style.bottom = '';
    win.style.right = '';
    win.style.width = `${r.width}px`;
    if (!win.style.height) {
      win.style.height = `${r.height}px`;
    }
  };

  let active: {
    dir: string;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startTx: number;
    startTy: number;
  } | null = null;

  const onMove = (e: MouseEvent) => {
    if (!active) return;
    e.preventDefault();
    const dx = e.clientX - active.startX;
    const dy = e.clientY - active.startY;
    const dir = active.dir;

    let w = active.startW;
    let h = active.startH;
    let tx = active.startTx;
    let ty = active.startTy;

    const maxW = window.innerWidth - 16;
    const maxH = window.innerHeight - 16;

    const applyWest = () => {
      const nw = clamp(active!.startW - dx, minW, maxW);
      tx = active!.startTx + (active!.startW - nw);
      w = nw;
    };
    const applyEast = () => {
      w = clamp(active!.startW + dx, minW, maxW);
    };
    const applyNorth = () => {
      const nh = clamp(active!.startH - dy, minH, maxH);
      ty = active!.startTy + (active!.startH - nh);
      h = nh;
    };
    const applySouth = () => {
      h = clamp(active!.startH + dy, minH, maxH);
    };

    if (dir === 'w') applyWest();
    else if (dir === 'e') applyEast();
    else if (dir === 'n') applyNorth();
    else if (dir === 's') applySouth();
    else if (dir === 'nw') {
      applyWest();
      applyNorth();
    } else if (dir === 'ne') {
      applyEast();
      applyNorth();
    } else if (dir === 'sw') {
      applyWest();
      applySouth();
    } else if (dir === 'se') {
      applyEast();
      applySouth();
    }

    const involvesH = dir.includes('e') || dir.includes('w');
    const involvesV = dir.includes('n') || dir.includes('s');

    if (involvesH) {
      win.style.width = `${Math.round(w)}px`;
      win.style.maxWidth = 'none';
    }
    if (involvesV) {
      win.style.height = `${Math.round(h)}px`;
    }

    ctx.applyTransform(tx, ty);
    ctx.afterResize?.();
  };

  const onUp = () => {
    active = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  win.addEventListener('mousedown', (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const handle = t.closest('.window-resize-handle') as HTMLElement | null;
    if (!handle || !win.contains(handle)) return;
    e.preventDefault();
    e.stopPropagation();

    normalizeAnchoredPosition();

    const dir = handle.dataset.dir;
    if (!dir) return;

    const rect = win.getBoundingClientRect();
    const off = ctx.getOffset();

    active = {
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height,
      startTx: off.x,
      startTy: off.y,
    };

    document.body.style.cursor = getComputedStyle(handle).cursor || 'default';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

export type FixedResizeCtx = {
  /** Keep dialog inside viewport after resize */
  clamp?: () => void;
  minWidth?: number;
  minHeight?: number;
};

/**
 * Fixed-position windows (e.g. dialog): `left` / `top` in px.
 */
export function attachFixedWindowResize(win: HTMLElement, ctx: FixedResizeCtx): void {
  if (win.querySelector(`.${HANDLE_WRAP_CLASS}`)) return;
  ensureHandles(win);

  const minW = ctx.minWidth ?? MIN_W_DEFAULT;
  const minH = ctx.minHeight ?? MIN_H_DEFAULT;

  let active: {
    dir: string;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startLeft: number;
    startTop: number;
  } | null = null;

  const onMove = (e: MouseEvent) => {
    if (!active) return;
    e.preventDefault();
    const dx = e.clientX - active.startX;
    const dy = e.clientY - active.startY;

    let w = active.startW;
    let h = active.startH;
    let left = active.startLeft;
    let top = active.startTop;

    const maxW = window.innerWidth - 16;
    const maxH = window.innerHeight - 16;

    const dir = active.dir;

    if (dir.includes('e')) w = clamp(active.startW + dx, minW, maxW);
    if (dir.includes('w')) {
      const nw = clamp(active.startW - dx, minW, maxW);
      left = active.startLeft + (active.startW - nw);
      w = nw;
    }
    if (dir.includes('s')) h = clamp(active.startH + dy, minH, maxH);
    if (dir.includes('n')) {
      const nh = clamp(active.startH - dy, minH, maxH);
      top = active.startTop + (active.startH - nh);
      h = nh;
    }

    win.style.width = `${Math.round(w)}px`;
    win.style.height = `${Math.round(h)}px`;
    win.style.left = `${Math.round(left)}px`;
    win.style.top = `${Math.round(top)}px`;
    win.style.maxWidth = 'none';
    ctx.clamp?.();
  };

  const onUp = () => {
    active = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  win.addEventListener('mousedown', (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const handle = t.closest('.window-resize-handle') as HTMLElement | null;
    if (!handle || !win.contains(handle)) return;
    e.preventDefault();
    e.stopPropagation();

    const dir = handle.dataset.dir;
    if (!dir) return;

    const rect = win.getBoundingClientRect();

    active = {
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height,
      startLeft: rect.left,
      startTop: rect.top,
    };

    document.body.style.cursor = getComputedStyle(handle).cursor || 'default';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
