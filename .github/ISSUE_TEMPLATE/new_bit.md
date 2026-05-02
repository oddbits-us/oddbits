---
name: New Bit Proposal
about: Propose a new tool/bit for the Oddbits ecosystem
title: '[NEW BIT] '
labels: new-bit
assignees: ''
---

## Bit Name
What would this bit be called? (should end in "bits", e.g., "colorbits", "fontbits")

## Description
A clear description of what this bit would do.

## Features
List the main features/capabilities this bit would provide:
- Feature 1
- Feature 2
- Feature 3

## Use Cases
Describe specific use cases or scenarios where this bit would be useful.

## Technical Considerations
Any technical notes, dependencies, or implementation considerations?

## Architecture surfaces
Bits follow the four-surface pattern documented in [`apps/web/UI_THEME.md`](../../apps/web/UI_THEME.md) (canonical example: `imagebits`).
Tick which surfaces this bit will need:

- [ ] Desktop icon + matching desktop window (always required)
- [ ] Workshop dialog (modal `.window`, fixed/portaled, for the actual work)
- [ ] Inline help popover (`.popover` + `.help-trigger`)
- [ ] Alert/confirm modal (`.alert-modal-*`) — required if the workshop holds unsaved work
- [ ] Combo button (`.combo-button-group`) for split actions

If you're inventing new visual styling instead of reusing the design system, call it out and explain why.

## Examples
If applicable, provide examples of how this bit would be used:

```typescript
// Example usage
```

## Additional Context
Add any other context, mockups, or references about the new bit here.

