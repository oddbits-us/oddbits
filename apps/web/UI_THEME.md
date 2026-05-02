# Oddbits web UI — theme & layout conventions

This doc is the source of truth for **apps/web**: how the faux-desktop shell, windows, and tool UIs stay visually consistent when you add new “bits.”

## Aesthetic

- **Retrowave desktop**: synthwave gradient sky, scanlines, perspective grid, chunky **pixel borders** (`--radius: 0`), **no rounded corners** on chrome.
- **Old-school window chrome**: navy title bar (`--color-window-title`), light gray 3D buttons (`.window-btn`), Arial/Tahoma for UI chrome; **SuperPixel** only for large hero titles inside `.window-content`.
- **Emoji**: prefer **SerenityOS-Emoji** for icons and decorative glyphs so they match the pixel OS vibe (`font-family` on `.desktop-icon-img`, `.tool-icon`, etc.).

## CSS tokens (`src/styles.css` → `:root`)

| Token | Role |
| --- | --- |
| `--color-bg`, `--color-bg-secondary` | Page / alternate surfaces |
| `--color-surface` | Cards, tool rows, docs blocks |
| `--color-border` | Universal 4px-style frames (`#000`) |
| `--color-text`, `--color-text-secondary` | Body / muted text |
| `--color-primary`, `--color-primary-hover` | Hot pink accents (hero H1, hovers) |
| `--color-accent` | Cyan links & focus rings |
| `--color-success` | Code green / positive states |
| `--color-error` | Errors |
| `--color-window-bg`, `--color-window-title`, `--color-window-title-text` | Window body / titlebar |
| `--spacing-xs` … `--spacing-xl` | Vertical rhythm |
| `--shadow`, `--shadow-glow`, `--shadow-press` | Chunky drop shadows for panels |

New panels should **reuse these variables** instead of hard-coding hex colors, unless you need a deliberate one-off (then document it in a CSS comment).

## Z-index & stacking

Rough layering (low → high):

1. Background layers (negative / low z).
2. `.desktop-icons` — `z-index: 5` (icons stay above background, below focused windows).
3. `.window` defaults — `z-index: 10`; inline styles on each window set initial stacking (5–25 in `index.html`).
4. **`main.ts`** raises any clicked `.window` by bumping a shared counter (starts at **100**).
5. **Modal-style dialogs** that must sit above everything: use **`z-index: 400`** (see ImageBits workshop in `imagebits.ts` and `.window.imagebits-dialog-window…` in CSS).

When adding a full-screen or fixed dialog, pick a z-index **above** the draggable desktop windows (≥400 is reserved for app-modals).

## Desktop icon → window wiring

1. **HTML** (`index.html`, inside `.desktop-icons`):

   ```html
   <div class="desktop-icon" data-target="window-yourbit">
     <div class="desktop-icon-img">…</div>   <!-- emoji or image -->
     <div class="desktop-icon-label">Label</div>
   </div>
   ```

2. **Window id** must match: `id="window-yourbit"`.

3. **No extra JS**: `main.ts` binds every `.desktop-icon` click to `getElementById(data-target)` and sets `display: flex` + raises z-index.

4. If the window starts **hidden**, set `style="display: none;"` on the `.window` node (optional pattern for “closed until opened” tools).

## Window markup (standard tool window)

Every top-level window follows this shape:

```html
<div id="window-…" class="window draggable [pop-cyan|pop-yellow|pop-magenta]" style="…position/size/z-index…">
  <div class="window-titlebar">
    <span>Title.exe</span>
    <div class="window-controls">
      <button class="window-btn">_</button>
      <button class="window-btn">X</button>
    </div>
  </div>
  <div class="window-content [anime-header|anime-section]">
    …
  </div>
</div>
```

- **`draggable`**: enables drag from `.window-titlebar` and clamp-to-viewport logic in `main.ts`.
- **`pop-cyan` | `pop-yellow` | `pop-magenta`**: subtle tinted window backgrounds (optional).
- **Initial placement**: use `top`/`left`/`right`/`bottom` + optional `transform: rotate(…deg)` for personality; dragging uses `translate3d` and **preserves** `rotate()` in the inline transform.
- **Close**: last `.window-btn` hides the window (`display: none`). Re-open via desktop icon (sets `display: flex`).

## Content patterns inside `.window-content`

| Pattern | Classes | Use |
| --- | --- | --- |
| Hero | `.anime-header` | Main Oddbits intro; animated on load in `main.ts` |
| Sections with stagger | `.anime-section` on container, `.anime-item` on children | IntersectionObserver + anime.js stagger |
| Tool list row | `.tools-list` → `.tool-item` + `.tool-icon` + `.tool-info` | Featured tools |
| Code / install docs | `.docs-section` | Bordered blocks with `<pre><code>` |
| Wide tool embed | `.tools-grid` | Grid wrapper for web components |

Section headings: **`h2`** uses Arial/Tahoma per global `.window-content` / `section h2` rules. **`h1`** inside `.window-content` uses **SuperPixel** — reserve for primary hero only.

## Links & buttons

- **Links**: `.tool-link` (cyan → pink hover) or inline anchors with `color: var(--color-accent)` for consistency.
- **Primary actions** inside custom panels: match `.window-btn` / workshop buttons — light gray face, 2px highlight/shadow borders, pressed state inverts bevel (see `.imagebits-workshop-portal button`).

## Modals / floating dialogs (inside a web component)

ImageBits is the reference implementation:

- Build markup with the **same** `.window` + `.window-titlebar` + `.window-content` structure.
- Add a distinguishing class chain (e.g. `.imagebits-dialog-window.imagebits-workshop`) and style **`position: fixed`**, width/max-height, **`z-index: 400`**.
- Prefer **`role="dialog"`** and wire Escape + focus behavior in the component TS.
- Avoid dimming overlays unless you add a deliberate full-screen scrim (not used currently).

Shell inside another window: the compact **`odd-imagebits`** host uses the same **4px border + `--shadow`** as `.window` so it reads as embedded chrome (`styles.css` block `/* ImageBits — compact shell */`).

## New bit checklist

1. Add CSS variables / existing classes before inventing new ones.
2. Add desktop icon + matching `id="window-…"`.
3. Use `.window.draggable` + titlebar + `.window-content`.
4. Pick optional `.pop-*` and initial `z-index` so windows don’t all stack identically.
5. For scroll-in content, use `.anime-section` + `.anime-item`.
6. For nested heavy UI, consider a web component that reuses `.window` dialog classes and `z-index ≥ 400` if it must cover other windows.
7. Register the component in `src/main.ts` with `import './components/…'`.

## Files

| File | Responsibility |
| --- | --- |
| `index.html` | Background layers, desktop, icons, window instances |
| `src/styles.css` | Tokens, windows, desktop, tool/docs patterns, per-component overrides |
| `src/main.ts` | Parallax, anime entrance, drag/stacking, desktop icon → window |
| `src/components/*.ts` | Feature UI; mirror window chrome for dialogs |
