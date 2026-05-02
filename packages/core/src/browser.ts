/**
 * Browser-specific exports
 * This file can be imported in browser contexts
 */

export * from './types';
export * from './registry';

// Re-export for convenience in browser
import { registerBit, getBit, listBits, unregisterBit } from './registry';

export {
  registerBit,
  getBit,
  listBits,
  unregisterBit,
};

