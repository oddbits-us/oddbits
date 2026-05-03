# Contributing

Thanks for thinking about contributing — bug reports, new bits, doc fixes, design suggestions, anything is welcome.

## Read these first

- [`AGENTS.md`](./AGENTS.md) — the project pledges that apply to every contribution (humans **and** AI agents). MIT, no servers, no tracking, no BYOK, vanilla TS only, credit your sources.
- [`apps/web/UI_THEME.md`](./apps/web/UI_THEME.md) — required reading before you touch `apps/web/**`.
- [`.cursor/rules/bit-architecture.mdc`](./.cursor/rules/bit-architecture.mdc) — the bit pattern in checklist form. Cursor auto-loads it.

If you're using an AI coding agent, point it at `AGENTS.md` before you start the session — that's the single brief that keeps the agent inside the project's guarantees.

## License

This project is released under the **MIT License** (see the [`LICENSE`](./LICENSE) file in the repository root). Bundled assets (fonts, etc.) carry their own licenses; see [`CREDITS.md`](./CREDITS.md).

## Commits and versioning

Releases use [Release Please](https://github.com/googleapis/release-please) with [Conventional Commits](https://www.conventionalcommits.org/). Use clear prefixes so versions and changelogs stay accurate:

| Prefix | Effect on semver (post–1.0) |
|--------|------------------------------|
| `fix:` | Patch |
| `feat:` | Minor |
| `feat!:`, `fix!:`, or `BREAKING CHANGE:` footer | Major |

Examples:

```
feat(imagebits): add lossless PNG flag
fix(core): correct plugin registration order
```

Scopes (`feat(core):`, `feat(imagebits):`, etc.) are optional but help map changes to packages.

### Releases

1. Push conventional commits to `main`.
2. Release Please opens or updates a **release PR** with version bumps and `CHANGELOG.md` updates (including workspace dependency sync between `@oddbits/core` and `@oddbits/imagebits`).
3. When you **merge** that PR, GitHub releases and tags are created automatically.

**Publishing to npm** is optional until you turn it on:

- GitHub → **Settings → Secrets and variables → Actions**
  - Add **`NPM_TOKEN`** (npm automation access token with publish permission).
  - Under **Variables**, add **`PUBLISH_NPM`** = `true` when you want CI to run `npm publish` after each merged release.

Until `PUBLISH_NPM` is set to `true`, releases still happen on GitHub; packages are **not** pushed to npm.

### First-time setup notes

- Optional: add `"bootstrap-sha"` to `release-please-config.json` (full Git SHA) *once* to limit how far back the **first** changelog scans your history; remove it after the first successful release PR merge ([docs](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md)).
- To publish packages from CI, add an npm automation token as **`NPM_TOKEN`** under GitHub → Settings → Secrets and variables → Actions.

Local commits are checked with [commitlint](https://commitlint.js.org/) via [Husky](https://typicode.github.io/husky/) (`commit-msg` hook). Install repo deps so hooks run: `pnpm install`.

## Maintainer controls (recommended)

For an open-source repo with controlled quality/security, configure these in GitHub settings:

1. **Branch protection (`main`)**
   - Require pull request before merge
   - Require status checks to pass (CI, CodeQL)
   - Require branches to be up to date before merge
   - Restrict force pushes/deletions

2. **Code owner review**
   - Enable "Require review from Code Owners"
   - Keep `.github/CODEOWNERS` updated with real users/teams

3. **Security**
   - Enable Dependabot alerts and secret scanning
   - Use private vulnerability reporting (`SECURITY.md`)
   - Keep website security headers and CSP policy aligned with `render.yaml`
   - Do not add user API-key collection/storage flows without explicit security policy approval

4. **Deploy/release control**
   - Keep npm publishing guarded behind `PUBLISH_NPM=true`
   - Use preview deploys for `apps/web` changes before merge

## Web security guardrails

- ImageBits and website tooling are local-only for caption generation: no BYOK/API key collection.
- Maintain strict CSP and header posture; treat any relaxation as a security change requiring review notes.
- Do not introduce key persistence in browser storage for website features.

## Code-level safety (applies everywhere, not just `apps/web/`)

- Never commit secrets, API keys, or tokens.
- Treat all user input as untrusted; never `innerHTML` untrusted strings.
- Validate file type/size before heavy processing.
- Keep third-party scripts minimal and reviewed.
- Don't add analytics, telemetry, "anonymous usage stats", or crash reporters — first-party or third-party.
- Don't add login, accounts, or any server endpoint that receives user data.
- When adding any new outbound network call (e.g. fetching a model from a CDN), call it out in the PR description, update [`render.yaml`](./render.yaml)'s CSP, and add the origin to [`SECURITY.md`](./SECURITY.md) and the relevant bit's help dialog.

## Crediting your sources

Every PR that adds a new font, asset, or meaningful runtime dependency must update [`CREDITS.md`](./CREDITS.md) in the same PR. Bundled fonts/assets ship a license file alongside the asset (`{Name}.LICENSE.txt` next to the file).
