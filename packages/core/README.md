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

### AI Agent (BYOK)

```typescript
import { OpenAIAgent, AnthropicAgent, AIKeyStorage } from '@oddbits/core';

// Store API key locally
AIKeyStorage.save('openai', 'your-api-key');

// Use agent
const agent = new OpenAIAgent(AIKeyStorage.load('openai')!);
const result = await agent.execute({
  type: 'task',
  input: 'Your input here'
});
```

## API Reference

See the TypeScript definitions for full API documentation.

