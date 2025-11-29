# Oddbits

A collection of useful tools for web/app developers and designers. Each tool is a standalone "bit" that can be used in multiple ways: as an npm package, on a web page, or integrated into platforms like Webflow or Framer.

## Philosophy

- **Framework-light**: Vanilla TypeScript that compiles to clean JavaScript
- **Small & Fast**: Minimal dependencies, optimized for performance
- **Flexible**: Works in browsers, Node.js, and can be bundled into any app
- **Easy to Understand**: Simple plugin architecture, no magic
- **Extensible**: Anyone can create and share their own bits

## Installation

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run web app in development
cd apps/web
pnpm dev
```

## Packages

### @oddbits/core

Core plugin system and utilities. Provides the foundation for all bits.

```typescript
import { registerBit, getBit, listBits } from '@oddbits/core';
import type { BitPlugin } from '@oddbits/core';
```

### @oddbits/imagebits

Image processing tools: resize, optimize, and convert formats (webp, avif, png, jpg).

```typescript
import { imageBits } from '@oddbits/imagebits';
import type { ImageBitsOptions } from '@oddbits/imagebits';

const output = await imageBits.process(
  { type: 'file', data: file },
  {
    resize: { width: 800, height: 600, fit: 'contain' },
    convert: { format: 'webp', quality: 0.9 }
  }
);
```

## Usage Examples

### As an npm Package

```bash
npm install @oddbits/imagebits
```

```typescript
import { imageBits } from '@oddbits/imagebits';

const file = document.querySelector('input[type="file"]').files[0];
const result = await imageBits.process(
  { type: 'file', data: file },
  { resize: { width: 800 }, convert: { format: 'webp' } }
);

// Download the processed image
const url = URL.createObjectURL(result.data);
const a = document.createElement('a');
a.href = url;
a.download = 'processed.webp';
a.click();
```

### On a Web Page (Web Component)

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module" src="https://cdn.jsdelivr.net/npm/@oddbits/imagebits/browser.mjs"></script>
</head>
<body>
  <odd-imagebits></odd-imagebits>
</body>
</html>
```

### In Node.js

```typescript
import { imageBits } from '@oddbits/imagebits';
import fs from 'fs';

const buffer = fs.readFileSync('input.jpg');
const result = await imageBits.process(
  { type: 'buffer', data: buffer },
  { resize: { width: 800 }, convert: { format: 'webp' } }
);

fs.writeFileSync('output.webp', Buffer.from(await result.data.arrayBuffer()));
```

## Creating Your Own Bit

1. Create a new package in `packages/your-bit-name/`

2. Implement the `BitPlugin` interface:

```typescript
import type { BitPlugin, BitInput, BitOutput } from '@oddbits/core';

export const myBit: BitPlugin = {
  name: 'mybit',
  version: '0.1.0',
  description: 'Description of what my bit does',
  
  async process(input: BitInput, options?: unknown): Promise<BitOutput> {
    // Your processing logic here
    return {
      data: processedData,
      metadata: { /* metadata */ },
      logs: ['Processing complete']
    };
  }
};
```

3. Register it (optional, for auto-discovery):

```typescript
import { registerBit } from '@oddbits/core';
registerBit(myBit);
```

4. Build and publish:

```bash
cd packages/your-bit-name
pnpm build
npm publish
```

## AI Integration (BYOK - Bring Your Own Key)

Oddbits supports AI features through an agent-based architecture. Users provide their own API keys, which are stored locally and never sent to our servers.

```typescript
import { OpenAIAgent, AIKeyStorage } from '@oddbits/core';

// Save API key (stored in localStorage)
AIKeyStorage.save('openai', 'your-api-key-here');

// Use the agent
const agent = new OpenAIAgent(AIKeyStorage.load('openai')!);
const result = await agent.execute({
  type: 'generate-alt-text',
  input: 'Describe this image: [image data]'
});
```

## Architecture

### Plugin System

Each bit implements a simple interface:

```typescript
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
```

### Input/Output

```typescript
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

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development mode (watch)
pnpm dev

# Run web app
cd apps/web
pnpm dev
```

## Project Structure

```
oddbits/
├── packages/
│   ├── core/              # Core plugin system
│   └── imagebits/         # Image processing tool
├── apps/
│   └── web/               # Web interface demo
├── turbo.json             # Turborepo config
├── pnpm-workspace.yaml    # pnpm workspace config
└── package.json           # Root package.json
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

### Ways to Contribute

- Report bugs
- Suggest new bits or features
- Submit pull requests
- Improve documentation
- Share feedback and ideas

