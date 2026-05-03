# Security Policy

## Project pledge

Oddbits is built on a simple promise to its users:

- **No tracking, no analytics, no telemetry** — first-party or third-party,
  in the sense of **no tracker scripts, analytics SDKs, session replay, or
  product telemetry we ship** in this repo.
- **No accounts. No API keys. No persistent secret storage.**
- **No server-side processing of user data.** Bits run in the browser, in
  Node, or via the CLI on the user's machine. User files never leave the
  user's machine.
- **No data collection.** Period.

The one nuance: if a bit uses an on-device ML model (today: ImageBits'
optional alt-text), the model weights are downloaded once from public CDNs
(currently Hugging Face + jsdelivr) and cached by the browser. **Inference
runs locally; user images are never uploaded.** The CSP in `render.yaml`
allow-lists those origins for fetches only.

**Another nuance (infrastructure):** Loading any website—including this
one—involves **routine technical metadata** on the internet (for example DNS,
TLS, hosting, or CDN **access logs** for operations and abuse prevention).
That is **not** the same as embedding analytics or advertising trackers in the
app, and it is **not** something Oddbits adds in application code. To skip
optional third-party requests (for example badge images), use the CLI or npm
packages without loading the demo site.

Any change that contradicts this pledge is a security-sensitive change and
must be flagged in the PR. See [`AGENTS.md`](AGENTS.md) for the same rules
in a form AI coding agents can read directly.

## Supported versions

Security updates are currently provided for the latest published versions of:

- `@oddbits/core`
- `@oddbits/imagebits`
- `@oddbits/gifbits`

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Instead, report vulnerabilities privately using one of the options below:

1. GitHub Security Advisories (preferred):
   - Open the repository's **Security** tab
   - Click **Report a vulnerability**
2. If advisories are unavailable, open a private maintainer contact path and update this file with that address.

When reporting, include:

- Affected package and version
- Reproduction steps / proof of concept
- Impact assessment
- Suggested mitigation (if known)

## Response targets

- Initial acknowledgment: within **72 hours**
- Status update: within **7 days**
- Fix and disclosure timing: based on severity and complexity

We follow coordinated disclosure and will credit reporters (unless anonymity is requested).

## Web security controls

- The hosted website is configured with strict security headers and CSP via `render.yaml`.
- ImageBits caption generation on the website is local-only and does not accept or persist user API keys.
- GifBits video encoding on the website runs in **ffmpeg.wasm** in the browser — user media is not uploaded for processing.
- If a proposed change introduces credential capture, external model endpoints, or CSP relaxation, treat it as a security-sensitive change and document rationale in the PR.
- Validate deployed header posture with both:
  - `https://securityheaders.com/?q=<site-url>&followRedirects=on`
  - `https://observatory.mozilla.org/analyze/<hostname>`
