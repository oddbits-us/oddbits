/**
 * AI Agent interface for BYOK (Bring Your Own Key) architecture
 * All API keys are stored locally and never sent to our servers
 */

export type AIProvider = 'openai' | 'anthropic' | 'custom';

export interface AITask {
  type: string;
  input: unknown;
  options?: Record<string, unknown>;
}

export interface AIResult {
  output: unknown;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface AIAgent {
  provider: AIProvider;
  apiKey: string; // Stored in localStorage, never sent to our servers
  
  /**
   * Execute an AI task
   */
  execute(task: AITask): Promise<AIResult>;
}

/**
 * OpenAI implementation
 */
export class OpenAIAgent implements AIAgent {
  provider: AIProvider = 'openai';
  apiKey: string;
  baseURL: string = 'https://api.openai.com/v1';

  constructor(apiKey: string, baseURL?: string) {
    this.apiKey = apiKey;
    if (baseURL) this.baseURL = baseURL;
  }

  async execute(task: AITask): Promise<AIResult> {
    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: task.options?.model || 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: typeof task.input === 'string' 
                ? task.input 
                : JSON.stringify(task.input),
            },
          ],
          ...task.options,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        return {
          output: null,
          error: error.error?.message || `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        output: data.choices[0]?.message?.content || null,
        metadata: {
          model: data.model,
          usage: data.usage,
        },
      };
    } catch (error) {
      return {
        output: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Anthropic implementation
 */
export class AnthropicAgent implements AIAgent {
  provider: AIProvider = 'anthropic';
  apiKey: string;
  baseURL: string = 'https://api.anthropic.com/v1';

  constructor(apiKey: string, baseURL?: string) {
    this.apiKey = apiKey;
    if (baseURL) this.baseURL = baseURL;
  }

  async execute(task: AITask): Promise<AIResult> {
    try {
      const response = await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: task.options?.model || 'claude-3-5-sonnet-20241022',
          max_tokens: task.options?.max_tokens || 1024,
          messages: [
            {
              role: 'user',
              content: typeof task.input === 'string' 
                ? task.input 
                : JSON.stringify(task.input),
            },
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        return {
          output: null,
          error: error.error?.message || `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        output: data.content[0]?.text || null,
        metadata: {
          model: data.model,
          usage: data.usage,
        },
      };
    } catch (error) {
      return {
        output: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Local storage utilities for API keys
 */
export class AIKeyStorage {
  private static readonly STORAGE_KEY = 'oddbits:ai-keys';

  static save(provider: AIProvider, apiKey: string): void {
    if (typeof window === 'undefined') return;
    
    const keys = this.loadAll();
    keys[provider] = apiKey;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(keys));
  }

  static load(provider: AIProvider): string | null {
    if (typeof window === 'undefined') return null;
    
    const keys = this.loadAll();
    return keys[provider] || null;
  }

  static loadAll(): Partial<Record<AIProvider, string>> {
    if (typeof window === 'undefined') return {};
    
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  static remove(provider: AIProvider): void {
    if (typeof window === 'undefined') return;
    
    const keys = this.loadAll();
    delete keys[provider];
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(keys));
  }

  static clear(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

