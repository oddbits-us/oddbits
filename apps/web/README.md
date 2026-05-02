# `@oddbits/web` Contributor Guide

This app is the website home for Oddbits tools. Contributions are welcome, but all changes should be safe, testable, and reviewable.

## Local development

```bash
pnpm install
cd apps/web
pnpm dev
```

## What to include in web PRs

- Clear summary of behavior change
- Screenshots/GIFs for visual changes
- Testing notes (desktop + mobile)
- Any impact on package versions or API usage

## Safety requirements

- Never commit secrets, API keys, or tokens
- Treat all user input as untrusted
- Avoid `innerHTML` with untrusted data
- Validate file type/size before heavy processing
- Keep third-party scripts minimal and reviewed
- ImageBits alt text is local-only in this app; do not add API-key entry/storage flows
- Keep CSP/header assumptions in sync with `render.yaml` when adding dependencies or new network calls

## Release behavior

- Website deploys should come from reviewed PRs to `main`
- Package releases are managed separately via Release Please
- The website should pin/upgrade package versions intentionally
