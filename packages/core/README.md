# @oddbits/core

Core plugin system and utilities for the oddbits ecosystem.

## Installation

```bash
npm install @oddbits/core
```

## Usage

### Plugin Registration

```typescript
import { registerBit, getBit, listBits } from '@oddbits/core';
import type { BitPlugin } from '@oddbits/core';

const myPlugin: BitPlugin = {
  name: 'myplugin',
  version: '0.1.0',
  description: 'My custom plugin',
  async process(input, options) {
    // Process input
    return { data: result, metadata: {} };
  }
};

registerBit(myPlugin);
const plugin = getBit('myplugin');
const allPlugins = listBits();
```

### Security posture

`@oddbits/core` focuses on plugin registration/runtime utilities.
User-facing web tooling in this repository is local-only and does not request or store user API keys.

## API Reference

See the TypeScript definitions for full API documentation.

