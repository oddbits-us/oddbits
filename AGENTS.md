# AGENTS.md — guidance for AI coding agents working on Oddbits

If you are an AI agent (Cursor, Claude, Copilot, GPT, etc.) helping with this
repo, **read this file first**. It captures the project's non-negotiable
constraints and points you at the deeper docs so you stay in alignment without
having to re-discover the rules every session.

## Project pledges (non-negotiable)

These are constraints, not preferences. Any change that violates them needs an
explicit human OK and a written rationale in the PR.

1. **Free and open source.** MIT licensed. No paid tiers, no ads, no rate
   limits. If you use it and find it useful, great.
2. **No server-side processing.** Every bit runs in the user's browser, in
   Node, or on the user's machine via the CLI. Oddbits as a project never
   spins up a backend that holds user content.
3. **No tracking. No telemetry. No analytics** — no tracker scripts,
   analytics SDKs, session replay, or product telemetry **we ship**. Not
   first-party, not third-party in that sense. Don't add PostHog, GA,
   Plausible-as-product-analytics, Segment, etc. (Routine CDN/host access logs
   are infrastructure, not Oddbits telemetry; see `SECURITY.md`.)
4. **No data collection.** User files, prompts, and inputs never leave the
   user's machine. Think drag-in → workshop → useful output, never upload.
5. **No BYOK / API key surfaces** in any tool that ships in this repo. If a
   bit needs a model, it runs locally (e.g. WASM/ONNX via transformers.js).
6. **Minimal dependencies.** Vanilla TypeScript. No React/Vue/Svelte for
   library packages or for the desktop shell. Pull in a dep only when the
   alternative is reinventing something non-trivial.
7. **Credit our sources.** Every bundled font, font fallback, asset, or
   meaningful dependency gets named in `CREDITS.md`. When you add a new one,
   add the credit in the same PR.

## Sustainability for maintainers (guidance)

The project should **not impose a financial burden on maintainers**. Prefer free
tiers, community tooling, and volunteer time. Optional personal spend (e.g. a
domain, your own AI tokens) is fine. Avoid introducing recurring paid services,
paid-only workflows, or patterns that rack up ongoing cost **unless a human
maintainer explicitly agrees** and the rationale is documented (e.g. in the PR).
Keep it simple, voluntary, and free—at launch and as the project grows.

## Independence (guidance)

The project **does not** solicit sponsors or position itself for sale or
acquisition. Do not add sponsor surfaces (e.g. `.github/FUNDING.yml`, donation
links in the shipped app), fundraising copy, or “exit” framing **unless a
maintainer explicitly directs it**.

## What is a "bit"?

A **bit** is a self-contained tool. The canonical reference is
`packages/imagebits` + `apps/web/src/components/imagebits.ts`.

A bit can ship at any of four sizes — pick the smallest that fits the tool:

| Shape | Surfaces |
|---|---|
| `lib-only` | `packages/{name}bits/` with API + tests |
| `lib + cli` | adds a `bin` entry, `cli.ts`, and CLI tests |
| `lib + cli + minimal-web` | adds a desktop icon and an info-only window (description + Source link + Use-in-your-project) |
| `lib + cli + full-web` | full four-surface desktop pattern (icon, window, workshop, alerts/help) |

The full four-surface pattern is documented in `apps/web/UI_THEME.md` and
`.cursor/rules/bit-architecture.mdc`. Read both before adding desktop UI.

Naming convention: package names always end in `bits` and live under the
`@oddbits/` npm scope. Examples: `@oddbits/imagebits`, `@oddbits/gifbits`,
`@oddbits/colorbits`, `@oddbits/clipbits`. Custom-element tags follow `<odd-{name}bits>`.

## Where to look first

Read these in order whenever you start a new task in this repo:

1. **`README.md`** — project overview and the privacy pledge.
2. **`AGENTS.md`** — this file.
3. **`CONTRIBUTING.md`** — commit format, releases, security rails.
4. **`SECURITY.md`** — what counts as a security-sensitive change.
5. **`apps/web/UI_THEME.md`** — desktop shell, design system, bit shape
   variants. Required reading before you touch `apps/web/**`.
6. **`.cursor/rules/bit-architecture.mdc`** — the bit pattern in checklist
   form. Auto-loaded by Cursor for `apps/web/**` and `packages/**` edits.
7. **`packages/imagebits/`** + **`apps/web/src/components/imagebits.ts`** —
   the canonical reference for most bits; **`gifbits`** is a second full-web
   example when the workshop is ffmpeg-heavy. Mirror their shape for new bits.

## Doing things the right way

- **Reuse the design system.** The "DESIGN SYSTEM" section at the top of
  `apps/web/src/styles.css` defines every universal control. If you find
  yourself adding `padding`, `background`, or `border` to a button/input/
  slider/dialog, stop — there's already a class for it.
- **Extend `BitElement`** (`apps/web/src/bits/BitElement.ts`) for any new
  desktop-UI bit. It absorbs all the workshop / help / alert / drag /
  resize / portal / escape / dirty-close machinery.
- **Use Conventional Commits** (`feat:`, `fix:`, `feat!:`). Release Please
  reads them to bump versions and write changelogs. Scope to a package when
  it's package-specific: `feat(imagebits): …`.
- **Keep `VERSION` exports in sync with `package.json`** via the
  `extra-files` entry in `release-please-config.json`. Mark the constant
  with the `// x-release-please-version` marker.
- **Write tests for library code.** `packages/imagebits/test/` is the
  pattern (Node `node:test` + `tsx`). Web-app code is exercised by hand.
- **Don't introduce new outbound network calls** without flagging it in the
  PR. The render.yaml CSP is intentionally tight; widening `connect-src`
  needs explicit security review.

## Doing things the wrong way (don't)

- Don't add analytics, telemetry, "anonymous usage stats", or crash reporters.
- Don't add login, accounts, or any server endpoint that receives user data.
- Don't add an API-key field, BYOK flow, or persistent secret storage.
- Don't pull in a UI framework for the bits or the desktop shell.
- Don't reinvent design-system controls; reuse the existing classes.
- Don't loosen the CSP in `render.yaml` without explicit human approval.
- Don't bundle a font, image, or third-party asset without crediting it in
  `CREDITS.md` and shipping its license file.
- Don't add sponsor buttons, funding manifests, or fundraising UX unless a
  maintainer explicitly asked for it.

## When unsure, ask

If a request would violate any pledge above, or would saddle maintainers with
new recurring cost without clear agreement, surface the conflict to the
human before proceeding. Better to pause for 30 seconds than ship a tool
that betrays the project's guarantee to its users.
