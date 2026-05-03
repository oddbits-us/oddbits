# @oddbits/core

Core types and a tiny in-memory plugin registry for the [Oddbits](https://github.com/oddbits-us/oddbits) ecosystem. Used by code-level callers (Node scripts, third-party hosts) that want to plug Oddbits "bits" into their own pipelines.

> **Note:** the Oddbits desktop demo (`apps/web`) does **not** use this registry — it imports each bit's web component statically. `@oddbits/core` is for code-level integration, not desktop UI discovery.

## Install

```bash
npm install @oddbits/core
```

## Usage

```ts
import { registerBit, getBit, listBits } from '@oddbits/core';
import type { BitPlugin, BitInput, BitOutput } from '@oddbits/core';

const myPlugin: BitPlugin = {
  name: 'mybit',
  version: '0.1.0',
  description: 'My custom bit',
  async process(input: BitInput, options?: unknown): Promise<BitOutput> {
    // process input → produce output
    return { data: result, metadata: {} };
  },
};

registerBit(myPlugin);
const plugin = getBit('mybit');
const allPlugins = listBits();
```

## Types

```ts
interface BitPlugin {
  name: string;
  version: string;
  description: string;
  process(input: BitInput, options?: unknown): Promise<BitOutput>;
  hooks?: {
    beforeProcess?: (input: BitInput) => Promise<BitInput>;
    afterProcess?: (output: BitOutput) => Promise<BitOutput>;
  };
}

interface BitInput {
  type: 'file' | 'url' | 'base64' | 'buffer';
  data: File | string | ArrayBuffer;
  metadata?: Record<string, unknown>;
}

interface BitOutput {
  data: Blob | ArrayBuffer | string;
  metadata: Record<string, unknown>;
  logs?: string[];
}
```

## Authoring a bit

For the full pattern (lib + CLI + optional desktop UI), see:

- The repo-wide guide: [`apps/web/UI_THEME.md`](https://github.com/oddbits-us/oddbits/blob/main/apps/web/UI_THEME.md)
- The bit architecture rule: [`.cursor/rules/bit-architecture.mdc`](https://github.com/oddbits-us/oddbits/blob/main/.cursor/rules/bit-architecture.mdc)
- The canonical reference: [`@oddbits/imagebits`](https://github.com/oddbits-us/oddbits/tree/main/packages/imagebits)

## Security posture

`@oddbits/core` is plugin-system code only — no I/O, no network, no telemetry. Bits built on top of it inherit the project's privacy pledge: no server-side processing, no analytics or tracker scripts we ship, no API key collection, no data leaving the user's machine. See the project's [`SECURITY.md`](https://github.com/oddbits-us/oddbits/blob/main/SECURITY.md) and [`AGENTS.md`](https://github.com/oddbits-us/oddbits/blob/main/AGENTS.md).

## License

[MIT](LICENSE).
