---
name: create-bit
description: Scaffold a new Oddbits "bit" (lib-only, lib+cli, lib+cli+minimal-web, or lib+cli+full-web) that aligns with the project's privacy pledges, naming conventions, and design system. Use when the user asks to add, scaffold, or create a new bit, a new tool/utility for Oddbits, a new package under packages/{name}bits, or mentions a new desktop window in apps/web that hosts a tool.
---

# Create a new Oddbits bit

Use this skill whenever the user wants to add a new bit to the repo. A "bit" is a self-contained tool. The canonical reference is `packages/imagebits` + `apps/web/src/components/imagebits.ts`.

## Step 1 — Read the project pledges

Before scaffolding anything, open and follow:

1. `AGENTS.md` — non-negotiable project pledges (MIT, no servers, no tracking, no BYOK, etc.).
2. `.cursor/rules/bit-architecture.mdc` — bit pattern in checklist form.
3. `apps/web/UI_THEME.md` — desktop shell + design system + bit shape variants.

If the requested bit would violate a pledge (e.g. needs a server, BYOK API key, telemetry), **stop and flag it** instead of working around it.

## Step 2 — Pick the smallest fitting shape

Ask the user (or infer from context) which of these the bit should be:

| Shape | Pick when |
|---|---|
| `lib-only` | Pure code helper, no user-facing surface |
| `lib + cli` | Most useful from a terminal (calculators, encoders, beautifiers) |
| `lib + cli + minimal-web` | CLI-first bit that just needs a desktop presence linking to its npx usage |
| `lib + cli + full-web` | Drag-in / tweak / get-output interaction in the browser (the `imagebits` shape) |

Use AskQuestion if the shape isn't clear from context.

## Step 3 — Confirm the name

Naming rules:

- Package name: `@oddbits/{name}bits` (always ends in `bits`, lowercase, no hyphens).
- Custom-element tag (full-web only): `<odd-{name}bits>`.
- Desktop window id (web shapes): `window-{name}bits`.
- Repo path: `packages/{name}bits/`.

If the user proposes `colortools`, suggest `colorbits`. If they propose `Color-Bits`, suggest `colorbits`.

## Step 4 — Scaffold the package

Mirror `packages/imagebits/` for the lib + CLI shape. Required files:

```
packages/{name}bits/
├── package.json          # name: @oddbits/{name}bits; version 0.1.0; license MIT
├── tsconfig.json         # extends repo root settings
├── tsup.config.ts        # mirror imagebits' multi-entry build
├── turbo.json
├── LICENSE               # MIT, "Copyright (c) 2024-present Oddbits contributors"
├── README.md             # quick start (Node + browser if relevant) + CLI usage
├── CHANGELOG.md          # empty initial; release-please will fill
├── src/
│   ├── index.ts          # Node entry + re-exports
│   ├── browser.ts        # browser entry (only if a browser path exists)
│   ├── cli.ts            # CLI entry (only for cli shapes)
│   ├── version.ts        # `export const VERSION = '0.1.0'; // x-release-please-version`
│   └── types.ts          # bit-specific types
└── test/
    ├── node-api.test.ts  # node:test + tsx
    └── cli.test.ts       # if cli shape
```

The `version.ts` file is required for any shape — `BitElement.getVersion()` and the CLI's `--version` both read from it.

Add the new package to `release-please-config.json`:

```json
"packages/{name}bits": {
  "component": "{name}bits",
  "release-type": "node",
  "changelog-path": "CHANGELOG.md",
  "bump-minor-pre-major": true,
  "bump-patch-for-minor-pre-major": true,
  "extra-files": [
    { "type": "generic", "path": "src/version.ts" }
  ]
}
```

And to `.release-please-manifest.json`:

```json
"packages/{name}bits": "0.1.0"
```

Add it to `.github/dependabot.yml` (one entry per package directory).

## Step 5 — Add the desktop UI (web shapes only)

For **`minimal-web`**:

1. Add a `.desktop-icon` block in `apps/web/index.html` inside `.desktop-icons`, with `data-target="window-{name}bits"`.
2. Add a `<div id="window-{name}bits" class="window draggable …">` containing:
   - Title bar with `<span data-bit-version>0.0.0</span>` placeholder.
   - Short description.
   - `.bit-actions` row with `Source` link + `Use in your project` link (no help button needed if the README is the manual).
3. **Do not** create an `apps/web/src/components/{name}bits.ts`. Skip `BitElement`. The minimal window is plain HTML.
4. Wire the version into the title-bar manually in `main.ts`, mirroring how `[data-oddbits-version]` is handled. Keep it tiny.

For **`full-web`**:

1. Steps 1–2 as above, plus `<odd-{name}bits></odd-{name}bits>` in the desktop window content and a `?` help button.
2. Create `apps/web/src/components/{name}bits.ts` extending `BitElement`. Mirror `apps/web/src/components/imagebits.ts`. Required overrides: `renderShell()`, `initializeBitElements()`, `attachBitListeners()`, `isWorkshopDirty()`, `resetWorkshopState()`. Override `getHostWindowSelector()` to return `'#window-{name}bits'` and `getVersion()` to return the imported `VERSION` constant.
3. Required CSS classes inside `renderShell()`: `.bit-shell`, `.bit-workshop`, `.bit-workshop-close`, `.bit-drag-handle`, optionally `.bit-help-dialog`/`.bit-help-close`/`.bit-confirm-backdrop`/`.bit-confirm-cancel`/`.bit-confirm-accept`.
4. Add `import './components/{name}bits';` to `apps/web/src/main.ts`.
5. **Reuse the design system**, never duplicate. Buttons/inputs/sliders/popovers/combos/alert modals all have classes already in the top of `apps/web/src/styles.css`. If you find yourself re-styling padding/background/border on a button or input, stop — the class already exists.

## Step 6 — Credit your sources

If the bit bundles any new font, asset, or runtime dependency, add it to `CREDITS.md` in the **same PR**. Ship a license file alongside any bundled font/asset under its own folder (e.g. `apps/web/public/fonts/{Name}.LICENSE.txt`).

If it pulls in a new outbound network call (e.g. fetches a model from a CDN), update the CSP in `render.yaml` and document the addition in `SECURITY.md` and the bit's help dialog.

## Step 7 — Write the tests

At minimum:

- **Library**: a `test/node-api.test.ts` that exercises the public API on a fixture or in-memory input.
- **CLI**: a `test/cli.test.ts` that runs the built `dist/cli.js` against fixtures and asserts on outputs.

Tests use `node:test` + `tsx`, run via `pnpm --filter @oddbits/{name}bits test`.

## Step 8 — Final checklist

Copy this checklist and tick it before you hand the change over:

```
- [ ] Picked the smallest fitting shape
- [ ] Package name `@oddbits/{name}bits` (ends in `bits`)
- [ ] `src/version.ts` with `// x-release-please-version` marker
- [ ] LICENSE = MIT, Copyright "2024-present Oddbits contributors"
- [ ] `release-please-config.json` + `.release-please-manifest.json` updated
- [ ] `.github/dependabot.yml` updated
- [ ] (web) desktop icon + window wired in `index.html`
- [ ] (full-web) extends `BitElement`, registered in `main.ts`
- [ ] Reused design-system classes; no duplicate styling
- [ ] No telemetry, no analytics, no API keys, no server calls
- [ ] New deps / fonts / assets added to `CREDITS.md` in this PR
- [ ] Any new outbound network call documented + CSP updated
- [ ] Tests for the lib and (if applicable) the CLI
- [ ] README explains npm install + npx + (if web) browser usage
```

## Anti-patterns

- Don't introduce a UI framework (React/Vue/Svelte) — vanilla TS + custom elements only.
- Don't reinvent `.btn-3d`, `.window-btn`, `.alert-modal-*`, `.popover`, `.combo-*` styles — reuse them.
- Don't add an API-key field, BYOK flow, or any persistent secret in `localStorage`/`sessionStorage`.
- Don't add analytics or "anonymous usage stats".
- Don't widen the CSP `connect-src` without flagging it explicitly in the PR.
- Don't bundle a font or third-party asset without adding the credit + license file in the same PR.

## When to stop and ask

Stop and ask the user if:

- The requested bit conceptually requires a backend (it shouldn't ship in this repo).
- The bit needs a model that isn't available in a small WASM/ONNX form.
- A bundled font or asset doesn't have a permissive license you can verify.
- The CSP needs to be widened to support a new origin.
