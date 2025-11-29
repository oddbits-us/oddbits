/**
 * Browser-specific exports
 * This file can be imported in browser contexts
 */

export * from './types';
export * from './registry';
export * from './ai-agent';

// Re-export for convenience in browser
import { registerBit, getBit, listBits, unregisterBit } from './registry';
import { AIKeyStorage, OpenAIAgent, AnthropicAgent } from './ai-agent';

export {
  registerBit,
  getBit,
  listBits,
  unregisterBit,
  AIKeyStorage,
  OpenAIAgent,
  AnthropicAgent,
};

