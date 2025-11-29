/**
 * Core types for the oddbits plugin system
 */

export interface BitInput {
  type: 'file' | 'url' | 'base64' | 'buffer';
  data: File | string | ArrayBuffer;
  metadata?: Record<string, unknown>;
}

export interface BitOutput {
  data: Blob | ArrayBuffer | string;
  metadata: Record<string, unknown>;
  logs?: string[];
}

export interface BitPlugin {
  name: string;
  version: string;
  description: string;
  
  /**
   * Main processing function
   */
  process(input: BitInput, options?: unknown): Promise<BitOutput>;
  
  /**
   * Optional hooks for extensibility
   */
  hooks?: {
    beforeProcess?: (input: BitInput) => Promise<BitInput>;
    afterProcess?: (output: BitOutput) => Promise<BitOutput>;
  };
}

export interface BitRegistry {
  register(plugin: BitPlugin): void;
  get(name: string): BitPlugin | undefined;
  list(): BitPlugin[];
  unregister(name: string): void;
}

