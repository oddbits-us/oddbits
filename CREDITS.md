# Credits and Acknowledgments

Oddbits stands on the shoulders of a lot of people who shared their work
freely. Big thanks to all of them.

## Tools

- **[Cursor](https://cursor.com/)** — the IDE/AI agent that helped scaffold,
  refactor, and document a sizeable chunk of this project. Most of the code
  in this repo was pair-written with Cursor.

## Bundled assets (`apps/web/public/fonts/`)

- **SerenityOS pixel-art emoji** — `SerenityOS-Emoji.ttf`
  - From the [SerenityOS](https://serenityos.org/) project.
  - License: [BSD 2-Clause](apps/web/public/fonts/SerenityOS-Emoji.LICENSE.txt)
    — Copyright (c) 2022, SerenityOS.
  - TTF build courtesy of [`linusg/serenityos-emoji-font`](https://github.com/linusg/serenityos-emoji-font).
  - Used as the emoji font across desktop icons, window titles, and
    decorative glyphs in `apps/web/`.

- **Press Start 2P** — `PressStart2P-Regular.ttf`
  - Designed by [Cody "CodeMan38" Boisclair](https://zone38.net/)
    (`cody@zone38.net`).
  - Source: [Google Fonts — Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P).
  - License: [SIL Open Font License v1.1](apps/web/public/fonts/PressStart2P.LICENSE.txt).
  - "Press Start 2P" is a Reserved Font Name under the OFL — we ship the
    font unmodified and refer to it by its original name.
  - Used for the large hero title inside the main Oddbits desktop window.

## Runtime dependencies (key ones)

These ship with the published packages or the deployed website:

- **[`@huggingface/transformers`](https://github.com/huggingface/transformers.js)**
  (Apache-2.0) — runs the local image-captioning model in the browser /
  Node for ImageBits' optional alt-text generation. No data leaves the
  user's machine; only the model weights are fetched once from the public
  Hugging Face / jsdelivr CDNs.
- **[`sharp`](https://sharp.pixelplumbing.com/)** (Apache-2.0) — the
  image pipeline behind the Node build of `@oddbits/imagebits`.
- **[`fflate`](https://github.com/101arrowz/fflate)** (MIT) — fast pure-JS
  zip support, used by both the CLI and the web component for bulk export.
- **[`anime.js` v3](https://animejs.com/)** (MIT) — the entrance and spread
  animations on the desktop shell.
- **[`@ffmpeg/ffmpeg`](https://github.com/ffmpegwasm/ffmpeg.wasm)** (MIT) +
  **[`@ffmpeg/util`](https://github.com/ffmpegwasm/ffmpeg.wasm)** (MIT) +
  **[`@ffmpeg/core`](https://github.com/ffmpegwasm/ffmpeg.wasm)**
  (GPL-2.0-or-later) — WebAssembly build of ffmpeg for GifBits in the
  browser. The wasm binary is vendored from `node_modules` into
  `apps/web/public/vendor/ffmpeg/` at build time (same-origin; no CDN fetch).
  Per the GPL, the core engine is free software; the MIT Oddbits app links to
  it as a separate component.

## Build / dev dependencies

These don't ship to users but make the project go:

- **[`turbo`](https://turbo.build/)** (MIT) — monorepo task runner.
- **[`tsup`](https://tsup.egoist.dev/)** (MIT) — package bundler for the
  publishable libraries.
- **[`vite`](https://vitejs.dev/)** (MIT) — dev server / bundler for
  `apps/web`.
- **[`tsx`](https://github.com/privatenumber/tsx)** (MIT) — TypeScript
  test runner integration for `node:test`.
- **[`husky`](https://typicode.github.io/husky/)** (MIT) +
  **[`commitlint`](https://commitlint.js.org/)** (MIT) — commit hook +
  Conventional Commits enforcement.
- **[`release-please`](https://github.com/googleapis/release-please)**
  (Apache-2.0) — automated release PRs and changelogs.
- **[Render](https://render.com/)** — static-site hosting for the
  deployed website.

## Inspiration

- **[SerenityOS](https://serenityos.org/)** — for proving that a
  desktop OS can be built in public, with personality, and stay fun.
- **The retrowave/synthwave web aesthetic** — every "old web" homepage,
  every Geocities tribute, every CRT-glow Codepen.
- **Win9x-era window chrome** — for being a UI that knew exactly what
  it was.

## Want to be listed?

If you've contributed code, found a bug, suggested a bit, or designed
something we're using and we missed your credit, open a PR or an issue —
we'll fix it.
