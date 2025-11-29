import type { BitPlugin, BitRegistry } from './types';

/**
 * Simple in-memory plugin registry
 */
class PluginRegistry implements BitRegistry {
  private plugins: Map<string, BitPlugin> = new Map();

  register(plugin: BitPlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin "${plugin.name}" is already registered. Overwriting.`);
    }
    this.plugins.set(plugin.name, plugin);
  }

  get(name: string): BitPlugin | undefined {
    return this.plugins.get(name);
  }

  list(): BitPlugin[] {
    return Array.from(this.plugins.values());
  }

  unregister(name: string): void {
    this.plugins.delete(name);
  }
}

// Singleton instance
const registry = new PluginRegistry();

/**
 * Register a new bit plugin
 */
export function registerBit(plugin: BitPlugin): void {
  registry.register(plugin);
}

/**
 * Get a bit plugin by name
 */
export function getBit(name: string): BitPlugin | undefined {
  return registry.get(name);
}

/**
 * List all registered bit plugins
 */
export function listBits(): BitPlugin[] {
  return registry.list();
}

/**
 * Unregister a bit plugin
 */
export function unregisterBit(name: string): void {
  registry.unregister(name);
}

