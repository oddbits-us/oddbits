# Oddbits web UI — theme & layout conventions

This doc is the source of truth for **apps/web**: how the faux-desktop shell, windows, and tool UIs stay visually consistent when you add new “bits.”

## Project pledges (read first)

Bits inherit non-negotiable constraints from the project: MIT, no uploads, no product analytics or trackers we ship, no API keys, vanilla TS only, credit your sources. Full version in `AGENTS.md` at the repo root and the `## Project pledges` section of `.cursor/rules/bit-architecture.mdc`. If your change would violate any of them, stop and flag it.

## Bit shape variants — pick the smallest that fits

Not every bit needs the full desktop workshop. Pick the shape that matches the tool:

| Shape | Surfaces | Use when |
|---|---|---|
| `lib-only` | `packages/{name}bits/` library + tests | Pure code helper, never user-facing |
| `lib + cli` | adds `bin` entry + `cli.ts` + CLI tests | Tool that's most useful from a terminal (calculators, encoders, beautifiers) |
| `lib + cli + minimal-web` | adds desktop icon + a minimal info window (description, version, `Source` + `Use in your project` buttons; **no** `<odd-…>` element, **no** workshop) | CLI-first bit that just needs a desktop presence linking to its npx usage |
| `lib + cli + full-web` | full four-surface pattern (canonical: `imagebits`) | Bit that benefits from drag-in / tweak / get-output interaction in the browser |

The rest of this doc covers the **`full-web`** shape end-to-end. For the `minimal-web` shape, only the *Desktop icon → window wiring* and *Window markup* sections below apply — skip the workshop, help dialog, alert modal, and `BitElement` machinery.

## Aesthetic

- **Retrowave desktop**: synthwave gradient sky, scanlines, perspective grid, chunky **pixel borders** (`--radius: 0`), **no rounded corners** on chrome.
- **Old-school window chrome**: navy title bar (`--color-window-title`), light gray 3D buttons (`.window-btn`), Arial/Tahoma for UI chrome; **Press Start 2P** only for large hero titles inside `.window-content`.
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
- **Viewport-relative anchors**: draggable shells under `#desktop` keep **`left` / `top` as percentages of the desktop** (see `src/desktopWindowAnchor.ts`). While dragging, spreading on load, or resizing from W/N edges, layout uses **pixel `translate`** plus optional **`rotate`** from inline styles; when drag completes, after spread animation, on viewport **resize**, or after transform-resize, that offset is **baked** back into `%` anchors so reflowing the browser preserves relative positions.
- **Saved layout** (`localStorage`, key `oddbits-desktop-layout-v1`; see `src/desktopLayoutStorage.ts`): positions, sizes, visibility (`display`), z-index, and rotation are restored after refresh; **`lastLeft` / `lastTop`** keep the last place a window was before it was closed so reopening from a desktop icon restores that spot. On restore or open, **`clampWindowTranslate`** may nudge so titlebars stay on-screen. `beforeunload` flushes a final save.
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
5. **Help dialog**: draggable/resizable `.window` dialog — keep copy **high-level**; full flags and examples belong on **GitHub** (see **Help dialog — content & length** below).

Keep this structure visually consistent across bits so users can instantly orient themselves.

## Help dialog — content & length (How To / `BitElement`)

The **How To** window is for **orientation**, not a replacement for the package README.

- **Length**: Use **ImageBits** (`apps/web/src/components/imagebits.ts`, help markup) as a **rough upper bound** — short intro, a few **`h3`** sections, and **small** `<pre><code>` blocks (handful of lines each). If it reads like a tutorial chapter, trim prose and add a **GitHub** link to `packages/{name}bits/README.md`.
- **Shape**: Prefer an optional **`h2`** title plus stacked **`.docs-section`** blocks (same Readme-style rhythm as `#window-docs` and **GifBits** help). **ImageBits** uses a slightly flatter **`h3` + `pre`** layout without `.docs-section`; either pattern is fine — pick one and stay consistent within the bit.
- **What to include**: What the tool does locally (wasm / CLI), **In your code** (minimal import + one API call) and **From the CLI** (one `recipe`-style and one `convert`-style line when applicable), **Privacy** in one short block, then **Full docs on GitHub**.
- **What to defer**: Exhaustive option lists, long shell transcripts, encoder caveats — summarize in one line if needed, detail on GitHub.
- **Typography / markup**: Follow the **Bit help dialog** row in **Content patterns** below (`h3`, `p`, `ul`, `pre`). Long lines in `<pre>` wrap via help-dialog **`pre`** rules in `styles.css`.
- **Default size**: Override **`getHelpMinSize()`** in the web component so the dialog fits without excessive empty chrome; **~360×220–360×320** is typical depending on section count.

## Content patterns inside `.window-content`

| Pattern | Classes | Use |
| --- | --- | --- |
| Hero | `.anime-header` | Main Oddbits intro; animated on load in `main.ts` |
| Sections with stagger | `.anime-section` on container, `.anime-item` on children | IntersectionObserver + anime.js stagger |
| Tool list row | `.tools-list` → `.tool-item` + `.tool-icon` + `.tool-info` | Flat rows; `--window-inner-rule` between items |
| Code / install docs | `.docs-section` | Stacked sections separated by rules; `<pre><code>` with light border only |
| Wide tool embed | `.tools-grid` | Grid wrapper for web components; optional rule above when following `.tools-list` |
| Bit help dialog | `.bit-help-dialog` + `.window` + `.window-content` (see `BitElement`) | Prefer the **Readme pattern**: optional **`h2`** title + stacked **`.docs-section`** blocks (rules + spacing like `#window-docs`). That avoids flat paragraphs fighting `.bit-help-dialog .window-content p { margin: 0 }`. Same **`h3`** / **`p`** / **`ul`** / **`pre`** treatment as `.docs-section` in `styles.css`; inline **`a`** = accent → pink hover. Example: `apps/web/src/components/gifbits.ts` help shell. |

Typography inside windows is **compact**: **`h2`** ≈1.2rem, section **`h3`** / tool titles ≈1.05rem, body/secondary text ≈0.85–0.95rem, hero **`h1`** (Press Start 2P) ≈1.75rem. **`h1`** is for the main Oddbits hero only. The Oddbits hero tagline uses **`.window--hero .window-content > p`** (bold, slightly larger) — that rule is scoped to the hero window only; do not rely on a bare `.window-content > p` selector for generic window copy.

## Links & buttons

- **Links**: `.tool-link` (cyan → pink hover, uppercase, for tool-list CTAs) or **inline prose links** in window body copy with `color: var(--color-accent)`, no underline, `color: var(--color-primary)` on hover (same idea as `.about-content .about-credits a`). Bit **help dialogs** (`.bit-help-dialog .window-content`) apply this automatically to `<a>` that are not `.win-link-btn` / `.win-link-btn-inline`.
- **Primary actions** inside custom panels: match `.window-btn` / workshop buttons — light gray face, 2px highlight/shadow borders, pressed state inverts bevel (see `.imagebits-workshop-portal button`).
- **Secondary buttons**: add `.btn-secondary` to any `button` or `.win-link-btn` for a darker grey face — use it for less-emphasized actions (Source links, destructive confirm buttons, dropdown-revealed alternates).

## Design system controls (reuse, don't duplicate)

The "DESIGN SYSTEM" section at the top of `src/styles.css` defines every universal control. **New bits must reuse these classes** rather than re-styling buttons, inputs, sliders, or popovers.

| Class / selector | Use |
| --- | --- |
| `button`, `.btn-3d` | Default 3D Win95 button face (height/padding included) |
| `.btn-secondary` | Darker grey button variant for low-emphasis / destructive |
| `.window-btn` | 24×24 chrome buttons (titlebar `?`, `_`, `X`) |
| `.win-link-btn` | `<a>` styled to match `.btn-3d` (works inline with `.win-link-btn-inline`) |
| `input`, `select`, `textarea` | Inset green-on-black terminal field |
| `input[type="range"]` | Beveled retro slider (inset rail + bar thumb) |
| `.popover-anchor` + `.help-trigger` + `.popover` | Yellow Win95-style help popover (`?` toggle) |
| `.combo-button-group` + `.combo-main-btn` + `.combo-caret-btn` + `.combo-dropdown` + `.combo-item` | Split button with mode dropdown |
| `.alert-modal-backdrop` + `.alert-modal` + `.alert-modal-icon/title/message/actions` | Centered confirm/alert dialog (no titlebar) |

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

## Alert & confirm modals

For destructive confirms, errors, and notices, use the `.alert-modal-*` design system **instead of** `.window` chrome. Alert modals are intentionally distinct: no titlebar, centered, fixed `min(360px, 100vw - 32px)` width, thick black border + hard drop-shadow, **not draggable, resizable, or closable via X**.

```html
<div class="alert-modal-backdrop" hidden>
  <div class="alert-modal" role="alertdialog" aria-modal="true">
    <div class="alert-modal-icon">⚠️</div>
    <div class="alert-modal-title">Title text</div>
    <div class="alert-modal-message">Body copy explaining the consequence.</div>
    <div class="alert-modal-actions">
      <button>No! Cancel!</button>
      <button class="btn-secondary">Yes, I'm aware.</button>
    </div>
  </div>
</div>
```

- **Portal the backdrop to `document.body`** in `connectedCallback` so `position: fixed` is viewport-relative (otherwise it gets trapped inside ancestor `transform`/stacking contexts and centers on a sub-region instead of the screen).
- Backdrop mousedown on the empty area and Escape both dismiss the alert.
- Use `.btn-secondary` on the destructive/accept button so it reads as the consequential (lower-emphasis) action.

## Inline help — popovers

For any inline “?” help affordance:

```html
<div class="popover-anchor">
  <label>Field name</label>
  <button type="button" class="help-trigger" aria-expanded="false">?</button>
  <div class="popover" role="tooltip" hidden>Old-school help text…</div>
</div>
```

Toggle the popover by flipping `hidden` + `aria-expanded`. Close on outside mousedown and Escape.

## Combo buttons (split button + dropdown)

When an action has a default and a few alternates, use the combo button instead of a separate select:

```html
<div class="combo-button-group">
  <button class="combo-main-btn">Default action</button>
  <button class="combo-caret-btn" aria-label="More options">▼</button>
  <ul class="combo-dropdown" hidden>
    <li class="combo-item" data-mode="default">Default mode</li>
    <li class="combo-item" data-mode="custom">Alternate mode…</li>
  </ul>
</div>
```

The caret toggles the dropdown; selecting an item swaps modes via component state and updates the main button label. Dropdown closes on outside mousedown and Escape.

## Dirty-state close confirm

If a workshop dialog can hold unsaved work (loaded files, in-flight processing, generated output), guard the close X **and** Escape with an `.alert-modal` confirm:

1. Add an `isWorkshopDirty(): boolean` helper. Treat “any input loaded”, “processing in flight”, or “output exists” as dirty.
2. Replace direct `closeWorkshop()` calls on the X button and Escape handler with `requestCloseWorkshop()`:
   - If dirty → open the alert modal.
   - Else → close immediately.
3. The accept button sets cancellation flags **before** calling `closeWorkshop()`. Long-running loops check those flags between iterations and break early so background work stops promptly.
4. `closeWorkshop()` resets per-session state but does **not** uncache external resources (loaded ML models, etc.) so reopening doesn’t re-download.

`apps/web/src/components/imagebits.ts` (`isWorkshopDirty`, `requestCloseWorkshop`, `acceptConfirmClose`, `closeWorkshop`) is the canonical implementation.

## Bit web component blueprint

Every bit extends **`BitElement`** (`apps/web/src/bits/BitElement.ts`), which provides the generic surface infrastructure — workshop dialog open/close/drag/resize/portal, help dialog, alert/confirm modal, escape priority chain, raise-z on click, document-mousedown chain, dirty-close guard, and cleanup. Subclasses only implement bit-specific bits.

```ts
import { BitElement } from '../bits/BitElement';

export class NameBitsElement extends BitElement {
  // bit-specific refs / state…

  protected renderShell(): string {
    return `
      <div class="namebits-shell bit-shell"> …intro UI… </div>
      <div class="window … bit-workshop" hidden>
        <div class="window-titlebar bit-drag-handle">
          <span>Title</span>
          <div class="window-controls">
            <button class="window-btn bit-workshop-close">X</button>
          </div>
        </div>
        <div class="window-content"> …workshop UI… </div>
      </div>
      <div class="window … bit-help-dialog" hidden> …help… </div>
      <div class="alert-modal-backdrop bit-confirm-backdrop" hidden>
        <div class="alert-modal">
          …icon, title, message…
          <div class="alert-modal-actions">
            <button class="bit-confirm-cancel">No! Cancel!</button>
            <button class="btn-secondary bit-confirm-accept">Yes, I'm aware.</button>
          </div>
        </div>
      </div>
    `;
  }

  protected initializeBitElements(): void { /* query bit-specific refs */ }
  protected attachBitListeners(): void { /* wire bit-specific events */ }
  protected isWorkshopDirty(): boolean { /* return true if there's unsaved work */ }
  protected resetWorkshopState(): void { /* clear bit state when workshop closes */ }

  // Optional overrides:
  protected getHostWindowSelector() { return '#window-namebits'; }
  protected getVersion() { return VERSION; } // imported from `@oddbits/{name}bits`
  protected onAcceptConfirmClose() { /* set abort flags before workshop closes */ }
  protected handleEscapePopover() { /* return true to claim Escape for a bit popover */ return false; }
  protected onDocumentMouseDownBit(e: MouseEvent) { /* dismiss bit popovers on outside click */ }
  protected onDisconnect() { /* revoke object URLs */ }
}

customElements.define('odd-namebits', NameBitsElement);
```

Then `import './components/namebits';` in `src/main.ts`.

### Required generic class names in `renderShell()`

`BitElement` discovers elements by these classes — they're additive to your bit-specific class names:

| Class | Required for | Notes |
| --- | --- | --- |
| `.bit-shell` | always | Root container the workshop returns to on close |
| `.bit-workshop` | always | Workshop dialog (combine with `.window`) |
| `.bit-workshop-close` | always | Workshop X button |
| `.bit-drag-handle` | always | Workshop titlebar (drag region) |
| `.bit-help-dialog` | optional | Help dialog (combine with `.window`) |
| `.bit-help-close` | optional | Help dialog X button |
| `.bit-confirm-backdrop` | optional | Alert/confirm modal backdrop |
| `.bit-confirm-cancel` / `.bit-confirm-accept` | optional | Confirm dialog buttons |
| `.bit-help-launch` (in `index.html`) | optional | Buttons inside the host desktop window that open the help dialog |
| `[data-bit-version]` (in `index.html`) | optional | Empty `<span>` inside the host titlebar; `BitElement` writes `getVersion()` into it. Markup: `…NameBits_v<span data-bit-version>0.0.0</span>.exe` |

### Behaviors `BitElement` gives you for free

- **Host window styling inheritance** — auto-copies the host desktop window's `.pop-*` tint and `.window-title-icon` onto the workshop + help dialog so related dialogs visually belong to the bit. Just drop a `.pop-cyan|yellow|magenta` and a `<span class="window-title-icon">🖼️</span>` on `<div id="window-{name}bits" class="window …">` and `BitElement` propagates them on connect.
- **Live version in titlebar** — override `getVersion()` to return your package's `VERSION` export and `BitElement` writes it into any `[data-bit-version]` span inside the host titlebar. The `VERSION` const lives in `packages/{name}bits/src/index.ts` and is kept in sync with `package.json` by release-please via the `extra-files` entry in `release-please-config.json`. After a release the published version flows through to the desktop window titlebar with no manual edit.
- Workshop / help / alert modal portaled to `document.body` (so `position: fixed` escapes ancestor stacking contexts).
- Workshop drag from `.bit-drag-handle` + viewport clamp + edge-handle resize via `attachFixedWindowResize`.
- Help dialog drag + resize + viewport clamp.
- Shared static `dialogZ` counter — newly clicked dialogs raise above siblings (works across all bits on the page).
- Escape priority chain: alert → bit popover (`handleEscapePopover()`) → help → workshop close.
- Document mousedown forwarded to `onDocumentMouseDownBit()` for dismissing your own popovers/dropdowns.
- Help launcher attachment from `.bit-help-launch` inside the host window selected by `getHostWindowSelector()`.
- Dirty-close confirm: X + Escape route through `requestCloseWorkshop()` → `.bit-confirm-backdrop` → on accept calls `onAcceptConfirmClose()` (your abort flags) then `closeWorkshop()` → `resetWorkshopState()` (your bit cleanup).
- `disconnectedCallback` removes portaled elements + all generic listeners; you just implement `onDisconnect()` for object-URL revocation.

## New bit checklist

1. **Lib package**: scaffold `packages/{name}bits/` (mirror `packages/imagebits/`) for the headless logic + tests. Export a `VERSION` constant from `src/index.ts` with the `// x-release-please-version` marker (initial value matching `package.json`), and add an `extra-files` entry for `src/index.ts` to the package's section of `release-please-config.json` so future releases stay in sync.
2. **Web component**: create `apps/web/src/components/{name}bits.ts` extending `BitElement`; override `getVersion()` to return the imported `VERSION`. Register as `<odd-{name}bits>` in `src/main.ts` (`import './components/{name}bits';`).
3. **Desktop icon**: add `<div class="desktop-icon" data-target="window-{name}bits">` to `index.html`.
4. **Desktop window**: add `<div id="window-{name}bits" class="window draggable …">` whose `id` matches the `data-target`. Include intro copy, the `<odd-{name}bits>` element, and a `.bit-actions` row with `Source` (`.win-link-btn.btn-secondary`) + `How To` buttons. Use `<span data-bit-version>0.0.0</span>` inside the titlebar as the version slot (`BitElement` fills it).
5. **Workshop dialog** (if the bit needs one): own `.window` markup with `position: fixed` + `z-index: 400`, portaled to `document.body` on open.
6. **Reuse design system classes** for every button, input, slider, popover, combo, and alert — see the table above. Do **not** invent new variants.
7. **Alert modals**: use `.alert-modal-*` markup for any confirm/notice; portal the backdrop to `document.body`.
8. **Dirty-close guard**: if the workshop holds unsaved work, route X + Escape through `requestCloseWorkshop()` and confirm via `.alert-modal`.
9. **Cleanup**: revoke object URLs in `onDisconnect()` (BitElement removes portaled elements automatically).
10. **Token-first CSS**: reuse `:root` variables instead of hard-coding hex colors. Pick optional `.pop-*` and initial `z-index` so windows don’t all stack identically.

## Files

| File | Responsibility |
| --- | --- |
| `index.html` | Background layers, desktop, icons, window instances |
| `src/styles.css` | Tokens, windows, desktop, tool/docs patterns, per-component overrides |
| `src/main.ts` | Parallax, anime entrance, drag/stacking, desktop icon → window |
| `src/bits/BitElement.ts` | Base class for every bit (workshop/help/alert + drag/resize/portal/escape/dirty-close) |
| `src/components/*.ts` | Feature UI; mirror window chrome for dialogs |
