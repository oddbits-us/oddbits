# Oddbits

> A growing collection of small, useful tools (**bits**) that run entirely in
> your browser, on your terminal, or inside your own code. No servers, no
> tracking, no accounts, no API keys. MIT licensed. Use it if you find it
> useful.

[Try it in the browser →](https://github.com/oddbits-us/oddbits)
&nbsp;·&nbsp;
[Read the bit pattern →](apps/web/UI_THEME.md)
&nbsp;·&nbsp;
[Built with →](CREDITS.md)

## What is a "bit"?

A bit is a self-contained little tool. The pattern is always the same:

> Drag in (or paste in) your stuff → tweak some knobs in the workshop → get a
> useful output.

Each bit can ship at any of four sizes — pick the smallest that fits the tool:

| Shape | What you get |
|---|---|
| `lib-only` | An npm package with a clean API + tests. |
| `lib + cli` | Plus a `bin` that you can `npx @oddbits/<bit>` against. |
| `lib + cli + minimal-web` | Plus a small desktop window with description, source link, and a "use in your project" button. |
| `lib + cli + full-web` | Plus a full **workshop** dialog with the actual interactive UI ([`@oddbits/imagebits`](packages/imagebits) or [`@oddbits/gifbits`](packages/gifbits)). |

Naming convention: the npm package always ends in `bits`
(`@oddbits/imagebits`, `@oddbits/gifbits`, `@oddbits/colorbits`, `@oddbits/clipbits`, …) and the
desktop custom element follows `<odd-{name}bits>`.

## Privacy & security pledge

These are **constraints, not preferences**. They are the reason the project
exists.

- **Your files never leave your machine.** All processing happens in the
  browser, in Node, or via the CLI on your computer.
- **No tracking. No analytics. No telemetry.** First-party or third-party.
  Open the network tab and see for yourself.
- **No accounts. No API keys. No "BYOK" surfaces.** If a bit needs a model,
  it runs locally (e.g. WASM/ONNX via [transformers.js](https://github.com/huggingface/transformers.js)).
- **No server-side processing.** Oddbits as a project never spins up a
  backend that holds user content. The deployed website is a static site
  with a strict CSP (see [`render.yaml`](render.yaml)).
- **The one nuance.** If a bit uses an on-device ML model (today: ImageBits
  optional alt-text), the **model weights** are downloaded once from
  Hugging Face / jsdelivr and cached by your browser. **Inference is
  local; your images never get uploaded.** The CSP only allows fetches —
  not POSTs of your data — to those origins.

If you find anything that contradicts this pledge, that's a bug. Please
report it via [`SECURITY.md`](SECURITY.md).

## Packages

| Package | What it does | Where it runs |
|---|---|---|
| [`@oddbits/core`](packages/core) | Plugin types + tiny in-memory registry, used by code-level callers. | Node + browser |
| [`@oddbits/imagebits`](packages/imagebits) | Image resize / optimize / convert (`webp`, `avif`, `png`, `jpg`) and optional local alt-text. | Node (sharp) + browser (Canvas) + CLI |
| [`@oddbits/gifbits`](packages/gifbits) | Video crop / trim / encode plans for ffmpeg (animated WebP, GIF, AVIF, PNG sequence); wasm workshop on the site, CLI + library elsewhere. | Node + browser (workshop) + CLI |

The browser app at [`apps/web/`](apps/web) is the demo desktop that hosts
each bit's interactive UI.

## Quick starts

### As an npm package

```bash
npm install @oddbits/imagebits
```

```ts
import { processImage } from '@oddbits/imagebits';

const result = await processImage(file, {
  maxDimension: 1080,
  format: 'webp',
  quality: 0.9,
});
result.download('photo.webp'); // browser
```

The same import works in Node — bundlers see the `browser` field in
`package.json` and pick the right build automatically.

### From the command line

```bash
npx @oddbits/imagebits ./photos -r -f webp --alt-text local --zip ./photos.zip
```

See [`packages/imagebits/README.md`](packages/imagebits/README.md) for the
full CLI surface.

## Authoring a new bit

1. Read the project pledges in [`AGENTS.md`](AGENTS.md) (applies to humans
   and AI agents both).
2. Read [`apps/web/UI_THEME.md`](apps/web/UI_THEME.md) for the desktop shell
   pattern, then [`.cursor/rules/bit-architecture.mdc`](.cursor/rules/bit-architecture.mdc)
   for the checklist version.
3. Mirror [`packages/imagebits`](packages/imagebits) for the lib + CLI
   shape, and [`apps/web/src/components/imagebits.ts`](apps/web/src/components/imagebits.ts)
   for the desktop UI shape (web bits extend `BitElement`). For another full-web
   reference with a heavier workshop (ffmpeg, logs), compare
   [`apps/web/src/components/gifbits.ts`](apps/web/src/components/gifbits.ts).
4. Add your package to [`release-please-config.json`](release-please-config.json)
   with an `extra-files` entry for its `VERSION` constant if you have one.
5. Open a PR. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for commit/release
   conventions.

If you're working with an AI agent (Cursor, Claude, Copilot, GPT, …) point
it at [`AGENTS.md`](AGENTS.md) first; that's the single brief that keeps
new sessions aligned with the project pledges.

## Development

```bash
pnpm install        # install everything
pnpm build          # build all packages
pnpm dev            # run package watchers + the web app
pnpm --filter @oddbits/imagebits test    # run a package's tests
pnpm --filter @oddbits/gifbits test
```

```
oddbits/
├── apps/
│   └── web/                  # Desktop demo (Vite, vanilla TS + custom elements)
├── packages/
│   ├── core/                 # @oddbits/core — plugin registry + types
│   ├── gifbits/              # @oddbits/gifbits — ffmpeg plans + CLI + wasm workshop
│   └── imagebits/            # @oddbits/imagebits — image lib + CLI
├── .cursor/rules/            # Cursor / AI rules (shared with the repo)
├── AGENTS.md                 # AI agent brief
├── CREDITS.md                # Thank-yous and bundled-asset attributions
└── render.yaml               # Static-site config + CSP for the website
```

## Built with

Big thanks to the people whose work this stands on. Highlights:

- **[Cursor](https://cursor.com/)** — most of this code was pair-written
  with the Cursor IDE/agent.
- **[SerenityOS](https://serenityos.org/)** — the pixel-art emoji font
  that gives the desktop its personality (BSD-2-Clause).
- **[`@huggingface/transformers`](https://github.com/huggingface/transformers.js)**,
  **[sharp](https://sharp.pixelplumbing.com/)**,
  **[fflate](https://github.com/101arrowz/fflate)**,
  **[anime.js](https://animejs.com/)**.

The full list lives in [`CREDITS.md`](CREDITS.md). If we're using your work
and forgot the credit, open an issue or a PR.

## License

[MIT](LICENSE). See [`CREDITS.md`](CREDITS.md) for bundled-asset licenses.

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md)
and the project pledges in [`AGENTS.md`](AGENTS.md) before opening a PR.
