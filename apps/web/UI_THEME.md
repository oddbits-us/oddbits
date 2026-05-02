# Oddbits web UI — theme & layout conventions

This doc is the source of truth for **apps/web**: how the faux-desktop shell, windows, and tool UIs stay visually consistent when you add new “bits.”

## Aesthetic

- **Retrowave desktop**: synthwave gradient sky, scanlines, perspective grid, chunky **pixel borders** (`--radius: 0`), **no rounded corners** on chrome.
- **Old-school window chrome**: navy title bar (`--color-window-title`), light gray 3D buttons (`.window-btn`), Arial/Tahoma for UI chrome; **SuperPixel** only for large hero titles inside `.window-content`.
- **Inside windows**: do **not** repeat the thick black frame + `--shadow` on inner panels. Use **spacing**, **`--window-inner-rule`** (4px black dividers), and light hovers. Only top-level `.window` nodes (and separate modal `.window` dialogs, e.g. ImageBits workshop) get the full OS window treatment.
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
| `--shadow`, `--shadow-glow`, `--shadow-press` | Chunky drop shadows — **use on `.window` chrome only**, not inner content |
| `--window-inner-rule` | `4px solid` inner horizontal rules inside `.window-content` |
| `--window-default-max-width` | Default **max-width** for draggable desktop windows (`420px`; `.window-size-default`) |
| `--window-dialog-max-width` | Default width cap for **modal** dialogs such as ImageBits workshop (`840px`) |
| `--window-hero-max-width` | Hero intro window (`380px`; combine with `.window--hero`) |

New panels should **reuse these variables** instead of hard-coding hex colors, unless you need a deliberate one-off (then document it in a CSS comment).

## Z-index & stacking

Rough layering (low → high):

1. Background layers (negative / low z).
2. `.desktop-icons` — `z-index: 5` (icons stay above background, below focused windows).
3. `.window` defaults — `z-index: 10`; inline styles on each window set initial stacking (5–25 in `index.html`).
4. **`main.ts`** raises any clicked `.window` by bumping a shared counter (starts at **100**).
5. **Modal-style dialogs** that must sit above everything: use **`z-index: 400`** (see ImageBits workshop in `imagebits.ts` and `.window.imagebits-dialog-window…` in CSS).

When adding a full-screen or fixed dialog, pick a z-index **above** the draggable desktop windows (≥400 is reserved for app-modals).

## Window sizing & resize

- **Desktop windows**: use `.window-size-default` for the initial max width; **`.window--hero`** on the main Oddbits intro narrows further and adds padding inside `.window-content`.
- **Resize**: invisible edge/corner hit targets (`src/windowResize.ts`) — **`attachTransformWindowResize`** for translate-based desktop windows (`main.ts`), **`attachFixedWindowResize`** for fixed dialogs (`imagebits.ts` workshop). Title bar stays above handles (`z-index`) so dragging still works.
- After resizing in px, windows can grow beyond the initial max-width.

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
    <span class="window-title-text"><span class="window-title-icon">🧩</span>Title.exe</span>
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
- **Title icon**: include a small `SerenityOS-Emoji` icon in `.window-title-text` that matches the desktop icon for quick recognition.
- **`pop-cyan` | `pop-yellow` | `pop-magenta`**: subtle tinted window backgrounds (optional).
- **Initial placement**: use `top`/`left`/`right`/`bottom` + optional `transform: rotate(…deg)` for personality; dragging uses `translate3d` and **preserves** `rotate()` in the inline transform.
- **Close**: last `.window-btn` hides the window (`display: none`). Re-open via desktop icon (sets `display: flex`).

## Bit window blueprint (default pattern)

Use ImageBits as the baseline pattern for all new bits unless a bit has a strong reason to differ.

1. **Header/titlebar**: app-like filename title + matching emoji icon + standard controls.
2. **Intro block**: short 1-2 sentence description of what the bit does.
3. **Browser section**: heading like "Use it in your browser" and the live interactive component.
4. **Action row**: compact Windows-style buttons (1-2 word labels), usually:
   - `Source` (GitHub docs/source)
   - `How To` (opens bit-specific help dialog)
5. **Help dialog**: draggable/resizable `.window` dialog with concise usage examples and tips.

Keep this structure visually consistent across bits so users can instantly orient themselves.

## Content patterns inside `.window-content`

| Pattern | Classes | Use |
| --- | --- | --- |
| Hero | `.anime-header` | Main Oddbits intro; animated on load in `main.ts` |
| Sections with stagger | `.anime-section` on container, `.anime-item` on children | IntersectionObserver + anime.js stagger |
| Tool list row | `.tools-list` → `.tool-item` + `.tool-icon` + `.tool-info` | Flat rows; `--window-inner-rule` between items |
| Code / install docs | `.docs-section` | Stacked sections separated by rules; `<pre><code>` with light border only |
| Wide tool embed | `.tools-grid` | Grid wrapper for web components; optional rule above when following `.tools-list` |

Typography inside windows is **compact**: **`h2`** ≈1.2rem, section **`h3`** / tool titles ≈1.05rem, body/secondary text ≈0.85–0.95rem, hero **`h1`** (SuperPixel) ≈2.25rem. **`h1`** is for the main Oddbits hero only.

## Links & buttons

- **Links**: `.tool-link` (cyan → pink hover) or inline anchors with `color: var(--color-accent)` for consistency.
- **Primary actions** inside custom panels: match `.window-btn` / workshop buttons — light gray face, 2px highlight/shadow borders, pressed state inverts bevel (see `.imagebits-workshop-portal button`).

## Security-sensitive UI conventions

- Website tools in this repo should avoid API-key collection UX unless explicitly approved by security policy.
- If a future credential field is unavoidable, default to masked input and never persist secrets in browser storage.
- For local-only tools (like ImageBits alt text), include short copy clarifying that no keys are accepted.

## Modals / floating dialogs (inside a web component)

ImageBits is the reference implementation:

- Build markup with the **same** `.window` + `.window-titlebar` + `.window-content` structure.
- Add a distinguishing class chain (e.g. `.imagebits-dialog-window.imagebits-workshop`) and style **`position: fixed`**, width/max-height, **`z-index: 400`**.
- Prefer **`role="dialog"`** and wire Escape + focus behavior in the component TS.
- Avoid dimming overlays unless you add a deliberate full-screen scrim (not used currently).

Shell inside another window: **`odd-imagebits`** is borderless/transparent so it does not stack a second “window” inside the parent `.window`. The **workshop** sub-dialog is its own `.window` (fixed, high z-index) and keeps full chrome.

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
