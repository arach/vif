/**
 * Stagehand Adapter for Vif
 *
 * Wraps Stagehand to use vif's inference (Claude via MCP) instead of
 * paying for Stagehand's API calls.
 *
 * Two modes:
 * 1. Standalone: Uses Stagehand with custom model provider
 * 2. Hybrid: Uses Stagehand for observe(), vif for inference + action
 *
 * Usage:
 *   import { createStagehandAdapter } from './stagehand-adapter';
 *
 *   const vif = await createStagehandAdapter();
 *   await vif.navigate("https://example.com");
 *
 *   // Stagehand-compatible API
 *   const elements = await vif.observe();
 *   await vif.act("click the login button");
 *
 *   // But inference happens locally, not via Stagehand API
 */

import { Vif, VifOptions, ObserveResult, ScreenshotOptions } from './browser.js';

// Stagehand types (minimal subset we need)
interface StagehandOptions {
  env?: 'LOCAL' | 'BROWSERBASE';
  headless?: boolean;
  enableCaching?: boolean;
  verbose?: 0 | 1 | 2;
  debugDom?: boolean;
  // Custom model config - this is how we intercept
  modelProvider?: ModelProvider;
  useAPI?: boolean;
}

interface ModelProvider {
  type: 'anthropic' | 'openai' | 'custom';
  modelName?: string;
  // Custom inference function - we provide this
  inference?: InferenceFunction;
}

type InferenceFunction = (params: InferenceParams) => Promise<InferenceResult>;

interface InferenceParams {
  task: 'observe' | 'act' | 'extract';
  instruction?: string;
  elements?: ElementInfo[];
  schema?: Record<string, unknown>;
  screenshot?: string;
}

interface InferenceResult {
  // For observe: list of interesting elements
  elements?: Array<{ index: number; description: string }>;
  // For act: which element to interact with and how
  action?: {
    elementIndex: number;
    actionType: 'click' | 'type' | 'hover' | 'scroll';
    text?: string;
  };
  // For extract: structured data
  data?: Record<string, unknown>;
}

interface ElementInfo {
  index: number;
  tag: string;
  role: string;
  label: string;
  text: string;
  bounds: { x: number; y: number; width: number; height: number };
}

// ─── Adapter Class ────────────────────────────────────────────────────────

/**
 * StagehandAdapter wraps Stagehand-style API but uses local inference
 *
 * Instead of Stagehand's paid API, we:
 * 1. Use our CDP implementation for browser control
 * 2. Use local heuristics for simple actions
 * 3. Surface data for Claude Code to make decisions
 */
export class StagehandAdapter extends Vif {
  private stagehandInstance: unknown = null;
  private useStagehandPlaywright = false;

  constructor(options: VifOptions & { useStagehandPlaywright?: boolean } = {}) {
    super(options);
    this.useStagehandPlaywright = options.useStagehandPlaywright ?? false;
  }

  /**
   * Create with Stagehand's Playwright under the hood
   *
   * This gives us Stagehand's DOM extraction but we intercept inference.
   */
  static async withStagehand(options: StagehandOptions = {}): Promise<StagehandAdapter> {
    // Dynamic import to avoid requiring stagehand as dependency
    let Stagehand: unknown;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = await (Function('return import("@browserbasehq/stagehand")')() as Promise<{ Stagehand: unknown }>);
      Stagehand = module.Stagehand;
    } catch {
      throw new Error(
        'Stagehand not installed. Run: pnpm add @browserbasehq/stagehand\n' +
        'Or use StagehandAdapter without Stagehand for pure-vif mode.'
      );
    }

    const adapter = new StagehandAdapter({ useStagehandPlaywright: true });

    // Create Stagehand with our custom inference interceptor
    const StagehandClass = Stagehand as new (opts: Record<string, unknown>) => unknown;
    adapter.stagehandInstance = new StagehandClass({
      env: 'LOCAL',
      headless: options.headless ?? false,
      enableCaching: false,
      verbose: options.verbose ?? 0,
      // KEY: Disable their API, use our own
      useAPI: false,
      modelProvider: {
        type: 'custom',
        inference: adapter.localInference.bind(adapter),
      },
      ...options,
    });

    return adapter;
  }

  /**
   * Local inference function that intercepts Stagehand's LLM calls
   *
   * Instead of calling their API, we:
   * - For observe: Return all interactive elements (let Claude decide)
   * - For act: Use fuzzy matching (or surface to Claude)
   * - For extract: Use CSS selectors
   */
  private async localInference(params: InferenceParams): Promise<InferenceResult> {
    switch (params.task) {
      case 'observe': {
        // Return all elements - Claude Code will pick what's relevant
        const elements = params.elements || [];
        return {
          elements: elements.map((el, i) => ({
            index: i,
            description: `${el.role}: ${el.label || el.text || el.tag}`,
          })),
        };
      }

      case 'act': {
        // Try to match instruction to element
        const instruction = params.instruction?.toLowerCase() || '';
        const elements = params.elements || [];

        // Simple heuristic matching
        const match = this.matchInstructionToElement(instruction, elements);

        if (match) {
          return {
            action: {
              elementIndex: match.index,
              actionType: this.inferActionType(instruction),
              text: this.extractTextFromInstruction(instruction),
            },
          };
        }

        // No match - return first clickable as fallback
        // In practice, Claude Code would handle this
        throw new Error(`Could not match instruction: ${params.instruction}`);
      }

      case 'extract': {
        // For extract, we'd need the schema
        // Return empty - let caller use CSS selectors instead
        return { data: {} };
      }

      default:
        return {};
    }
  }

  /**
   * Match an instruction like "click the submit button" to an element
   */
  private matchInstructionToElement(
    instruction: string,
    elements: ElementInfo[]
  ): ElementInfo | null {
    // Extract target from instruction
    let target = instruction;
    const prefixes = ['click ', 'click on ', 'click the ', 'tap ', 'press '];
    for (const prefix of prefixes) {
      if (instruction.startsWith(prefix)) {
        target = instruction.slice(prefix.length);
        break;
      }
    }

    target = target.trim();
    const targetWords = target.split(/\s+/);

    let bestMatch: ElementInfo | null = null;
    let bestScore = 0;

    for (const el of elements) {
      const searchText = `${el.label} ${el.text} ${el.role}`.toLowerCase();

      // Exact match
      if (searchText.includes(target)) {
        return el;
      }

      // Word overlap
      let matches = 0;
      for (const word of targetWords) {
        if (word.length > 2 && searchText.includes(word)) {
          matches++;
        }
      }

      const score = matches / targetWords.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = el;
      }
    }

    return bestScore > 0.3 ? bestMatch : null;
  }

  /**
   * Infer action type from instruction
   */
  private inferActionType(instruction: string): 'click' | 'type' | 'hover' | 'scroll' {
    const lower = instruction.toLowerCase();

    if (lower.includes('type') || lower.includes('enter') || lower.includes('fill')) {
      return 'type';
    }
    if (lower.includes('hover') || lower.includes('mouse over')) {
      return 'hover';
    }
    if (lower.includes('scroll')) {
      return 'scroll';
    }

    return 'click';
  }

  /**
   * Extract text to type from instruction like "type hello world"
   */
  private extractTextFromInstruction(instruction: string): string | undefined {
    const match = instruction.match(/type\s+["']?([^"']+)["']?/i);
    return match?.[1];
  }

  // ─── Stagehand-Compatible API ───────────────────────────────────────────

  /**
   * Stagehand-style observe with optional instruction
   *
   * Returns elements formatted similarly to Stagehand's observe() output.
   * The instruction parameter is for API compatibility but filtering
   * happens at the Claude Code layer, not here.
   */
  async observeWithInstruction(instruction?: string): Promise<ObserveResult> {
    // Use parent's observe implementation
    const result = await super.observe();

    // If there's an instruction, we could filter elements
    // But since we're not calling an LLM, we return all and let Claude decide
    if (instruction) {
      // Could add relevance scoring here
      // For now, just return all elements
    }

    return result;
  }

  /**
   * Stagehand-style act with result object
   *
   * Wraps parent act() to return Stagehand-compatible response format.
   */
  async actWithResult(instruction: string): Promise<{ success: boolean; message: string }> {
    try {
      const bounds = await super.act(instruction);
      return {
        success: true,
        message: `Clicked at (${Math.round(bounds.centerX)}, ${Math.round(bounds.centerY)})`,
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message,
      };
    }
  }

  /**
   * Stagehand-style extract with type casting
   *
   * Note: Stagehand uses a schema + LLM. We use CSS selectors instead.
   * For AI-powered extraction, use observe() + Claude interpretation.
   */
  async extractTyped<T extends Record<string, unknown>>(
    selectors: Record<string, string>
  ): Promise<T> {
    const result = await super.extract(selectors);
    return result as T;
  }
}

// ─── Factory Functions ────────────────────────────────────────────────────

/**
 * Create a Stagehand-compatible adapter using pure vif (no Stagehand dependency)
 */
export async function createStagehandAdapter(
  options: VifOptions & { url?: string } = {}
): Promise<StagehandAdapter> {
  const adapter = new StagehandAdapter(options);
  await adapter.launch(options.url);
  return adapter;
}

/**
 * Create adapter that uses Stagehand's Playwright but intercepts inference
 *
 * Requires: pnpm add @browserbasehq/stagehand
 */
export async function createWithStagehand(
  options: StagehandOptions & { url?: string } = {}
): Promise<StagehandAdapter> {
  const adapter = await StagehandAdapter.withStagehand(options);

  if (options.url) {
    await adapter.navigate(options.url);
  }

  return adapter;
}

// ─── Types Export ─────────────────────────────────────────────────────────

export type {
  StagehandOptions,
  ModelProvider,
  InferenceFunction,
  InferenceParams,
  InferenceResult,
  ElementInfo,
};
