/**
 * Stagehand Prompt Spy
 *
 * Intercepts and logs all prompts Stagehand sends to its LLM.
 * Useful for understanding their prompt engineering and learning
 * from their approach without reverse-engineering their code.
 *
 * Usage:
 *   const spy = await createStagehandSpy();
 *   await spy.page.act("click the login button");
 *
 *   // See what prompts were captured
 *   spy.getPrompts().forEach(p => console.log(p));
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────

export interface CapturedPrompt {
  timestamp: string;
  task: 'observe' | 'act' | 'extract' | 'unknown';
  instruction?: string;
  systemPrompt?: string;
  userPrompt?: string;
  context?: {
    url?: string;
    elementCount?: number;
    screenshot?: boolean;
    schema?: Record<string, unknown>;
  };
  rawPayload: Record<string, unknown>;
}

export type ResponseMode =
  | 'mock'        // Return minimal mock responses (spy only)
  | 'heuristic'   // Use local fuzzy matching
  | 'claude'      // Route to Claude API
  | 'passthrough' // Forward to Stagehand's API (requires their key)
  | 'callback';   // Use custom callback

export interface SpyOptions {
  /** Log prompts to console in real-time */
  logToConsole?: boolean;
  /** Save prompts to file */
  logToFile?: string;
  /** How to generate responses */
  responseMode?: ResponseMode;
  /** Custom response generator (when responseMode is 'callback') */
  responseCallback?: (prompt: CapturedPrompt) => Promise<Record<string, unknown>>;
  /** Custom handler for each prompt (for logging/analysis) */
  onPrompt?: (prompt: CapturedPrompt) => void;
  /** Anthropic API key for Claude mode */
  anthropicApiKey?: string;
}

// ─── Prompt Spy Class ─────────────────────────────────────────────────────

export class StagehandSpy {
  private stagehand: unknown = null;
  private prompts: CapturedPrompt[] = [];
  private options: SpyOptions;

  constructor(options: SpyOptions = {}) {
    this.options = {
      logToConsole: true,
      responseMode: 'mock',
      ...options,
    };
  }

  /**
   * Initialize with Stagehand
   */
  async init(stagehandOptions: Record<string, unknown> = {}): Promise<void> {
    let Stagehand: unknown;
    try {
      const module = await (Function('return import("@browserbasehq/stagehand")')() as Promise<{ Stagehand: unknown }>);
      Stagehand = module.Stagehand;
    } catch {
      throw new Error(
        'Stagehand not installed. Run: pnpm add @browserbasehq/stagehand'
      );
    }

    const StagehandClass = Stagehand as new (opts: Record<string, unknown>) => unknown;

    // Create Stagehand with our spy as the model provider
    this.stagehand = new StagehandClass({
      env: 'LOCAL',
      headless: false,
      enableCaching: false,
      verbose: 1, // Get more info
      // Intercept all LLM calls
      useAPI: false,
      modelProvider: this.createSpyProvider(),
      ...stagehandOptions,
    });
  }

  /**
   * Create a model provider that captures all prompts
   */
  private createSpyProvider(): Record<string, unknown> {
    return {
      type: 'custom',
      // This is the inference function Stagehand calls
      inference: async (params: Record<string, unknown>) => {
        const captured = this.capturePrompt(params);
        this.prompts.push(captured);

        // Log if enabled
        if (this.options.logToConsole) {
          this.logPrompt(captured);
        }

        // Save to file if enabled
        if (this.options.logToFile) {
          this.savePrompt(captured);
        }

        // Custom handler
        if (this.options.onPrompt) {
          this.options.onPrompt(captured);
        }

        // Generate response based on configured mode
        return this.generateResponse(captured);
      },
    };
  }

  /**
   * Parse and capture a prompt from Stagehand
   */
  private capturePrompt(params: Record<string, unknown>): CapturedPrompt {
    const timestamp = new Date().toISOString();

    // Try to determine the task type
    let task: CapturedPrompt['task'] = 'unknown';
    const paramsStr = JSON.stringify(params).toLowerCase();

    if (paramsStr.includes('observe') || paramsStr.includes('find element')) {
      task = 'observe';
    } else if (paramsStr.includes('act') || paramsStr.includes('click') || paramsStr.includes('type')) {
      task = 'act';
    } else if (paramsStr.includes('extract') || paramsStr.includes('schema')) {
      task = 'extract';
    }

    // Extract common fields
    const captured: CapturedPrompt = {
      timestamp,
      task,
      rawPayload: params,
    };

    // Try to extract specific fields based on common patterns
    if (params.instruction || params.action) {
      captured.instruction = (params.instruction || params.action) as string;
    }

    if (params.systemPrompt || params.system) {
      captured.systemPrompt = (params.systemPrompt || params.system) as string;
    }

    if (params.userPrompt || params.prompt || params.messages) {
      const messages = params.messages as Array<{ role: string; content: string }> | undefined;
      if (messages) {
        const userMsg = messages.find(m => m.role === 'user');
        if (userMsg) {
          captured.userPrompt = userMsg.content;
        }
        const systemMsg = messages.find(m => m.role === 'system');
        if (systemMsg) {
          captured.systemPrompt = systemMsg.content;
        }
      } else {
        captured.userPrompt = (params.userPrompt || params.prompt) as string;
      }
    }

    // Context info
    captured.context = {
      url: params.url as string | undefined,
      elementCount: (params.elements as unknown[] | undefined)?.length,
      screenshot: !!params.screenshot || !!params.image,
      schema: params.schema as Record<string, unknown> | undefined,
    };

    return captured;
  }

  /**
   * Log a captured prompt to console
   */
  private logPrompt(prompt: CapturedPrompt): void {
    console.log('\n' + '='.repeat(60));
    console.log(`STAGEHAND PROMPT CAPTURED [${prompt.task.toUpperCase()}]`);
    console.log('='.repeat(60));
    console.log(`Time: ${prompt.timestamp}`);

    if (prompt.instruction) {
      console.log(`\nInstruction: "${prompt.instruction}"`);
    }

    if (prompt.systemPrompt) {
      console.log(`\nSystem Prompt (${prompt.systemPrompt.length} chars):`);
      console.log('-'.repeat(40));
      // Truncate for readability
      const truncated = prompt.systemPrompt.length > 500
        ? prompt.systemPrompt.slice(0, 500) + '...[truncated]'
        : prompt.systemPrompt;
      console.log(truncated);
    }

    if (prompt.userPrompt) {
      console.log(`\nUser Prompt (${prompt.userPrompt.length} chars):`);
      console.log('-'.repeat(40));
      const truncated = prompt.userPrompt.length > 1000
        ? prompt.userPrompt.slice(0, 1000) + '...[truncated]'
        : prompt.userPrompt;
      console.log(truncated);
    }

    if (prompt.context) {
      console.log(`\nContext:`);
      console.log(`  URL: ${prompt.context.url || 'N/A'}`);
      console.log(`  Elements: ${prompt.context.elementCount ?? 'N/A'}`);
      console.log(`  Screenshot: ${prompt.context.screenshot}`);
    }

    console.log('='.repeat(60) + '\n');
  }

  /**
   * Save prompt to file
   */
  private savePrompt(prompt: CapturedPrompt): void {
    const dir = this.options.logToFile!;

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const filename = `prompt-${prompt.task}-${Date.now()}.json`;
    const filepath = join(dir, filename);

    writeFileSync(filepath, JSON.stringify(prompt, null, 2));
  }

  /**
   * Generate a response based on the configured mode
   */
  private async generateResponse(prompt: CapturedPrompt): Promise<Record<string, unknown>> {
    switch (this.options.responseMode) {
      case 'heuristic':
        return this.generateHeuristicResponse(prompt);

      case 'claude':
        return this.generateClaudeResponse(prompt);

      case 'callback':
        if (this.options.responseCallback) {
          return this.options.responseCallback(prompt);
        }
        return this.generateMockResponse(prompt);

      case 'passthrough':
        // Would need to forward to Stagehand's actual API
        // For now, fall through to mock
        console.warn('Passthrough mode not yet implemented, using mock');
        return this.generateMockResponse(prompt);

      case 'mock':
      default:
        return this.generateMockResponse(prompt);
    }
  }

  /**
   * Generate a mock response (minimal, just to keep things moving)
   */
  private generateMockResponse(prompt: CapturedPrompt): Record<string, unknown> {
    switch (prompt.task) {
      case 'observe':
        return { elements: [] };

      case 'act':
        return {
          action: {
            elementIndex: 0,
            actionType: 'click',
          },
        };

      case 'extract':
        return { data: {} };

      default:
        return {};
    }
  }

  /**
   * Generate response using local heuristics (fuzzy matching)
   */
  private generateHeuristicResponse(prompt: CapturedPrompt): Record<string, unknown> {
    const elements = prompt.rawPayload.elements as Array<{
      index: number;
      tag: string;
      text: string;
      role: string;
      ariaLabel?: string;
    }> | undefined;

    switch (prompt.task) {
      case 'observe':
        // Return all interactive elements
        if (elements) {
          return {
            elements: elements.map((el, i) => ({
              index: i,
              description: el.ariaLabel || el.text || `${el.tag} element`,
            })),
          };
        }
        return { elements: [] };

      case 'act':
        // Fuzzy match instruction to element
        if (elements && prompt.instruction) {
          const match = this.fuzzyMatchElement(prompt.instruction, elements);
          if (match !== null) {
            return {
              action: {
                elementIndex: match,
                actionType: this.inferActionType(prompt.instruction),
              },
            };
          }
        }
        // Fallback to first element
        return {
          action: {
            elementIndex: 0,
            actionType: 'click',
          },
        };

      case 'extract':
        return { data: {} };

      default:
        return {};
    }
  }

  /**
   * Generate response by calling Claude API
   */
  private async generateClaudeResponse(prompt: CapturedPrompt): Promise<Record<string, unknown>> {
    const apiKey = this.options.anthropicApiKey || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.warn('No Anthropic API key, falling back to heuristic');
      return this.generateHeuristicResponse(prompt);
    }

    try {
      // Build a prompt for Claude based on what Stagehand was asking
      const claudePrompt = this.buildClaudePrompt(prompt);

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: claudePrompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.statusText}`);
      }

      const result = await response.json() as {
        content: Array<{ type: string; text: string }>;
      };

      const text = result.content[0]?.text || '';

      // Parse Claude's response into the format Stagehand expects
      return this.parseClaudeResponse(prompt.task, text);
    } catch (error) {
      console.error('Claude API call failed:', error);
      return this.generateHeuristicResponse(prompt);
    }
  }

  /**
   * Build a prompt for Claude based on what Stagehand was asking
   */
  private buildClaudePrompt(prompt: CapturedPrompt): string {
    const elements = prompt.rawPayload.elements as Array<{
      index: number;
      tag: string;
      text: string;
      role: string;
    }> | undefined;

    switch (prompt.task) {
      case 'observe':
        return `You are analyzing a web page. Here are the interactive elements found:

${elements?.map((el, i) => `[${i}] <${el.tag}> "${el.text || ''}" (${el.role})`).join('\n') || 'No elements found'}

${prompt.instruction ? `The user wants to: ${prompt.instruction}` : 'List the most relevant interactive elements.'}

Return a JSON array of relevant element indices and descriptions:
[{"index": 0, "description": "Login button"}]`;

      case 'act':
        return `You are controlling a web browser. The user wants to: "${prompt.instruction}"

Available elements:
${elements?.map((el, i) => `[${i}] <${el.tag}> "${el.text || ''}" (${el.role})`).join('\n') || 'No elements'}

Which element should be interacted with and how? Return JSON:
{"elementIndex": 0, "actionType": "click"}

Action types: click, type, hover, scroll`;

      case 'extract':
        return `Extract data from this page. Schema: ${JSON.stringify(prompt.rawPayload.schema)}

Return the extracted data as JSON matching the schema.`;

      default:
        return prompt.userPrompt || 'Analyze the current page state.';
    }
  }

  /**
   * Parse Claude's response into Stagehand's expected format
   */
  private parseClaudeResponse(task: CapturedPrompt['task'], text: string): Record<string, unknown> {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        switch (task) {
          case 'observe':
            return { elements: Array.isArray(parsed) ? parsed : [] };

          case 'act':
            return { action: parsed };

          case 'extract':
            return { data: parsed };
        }
      }
    } catch {
      // JSON parsing failed
    }

    // Fallback
    return this.generateMockResponse({ task } as CapturedPrompt);
  }

  /**
   * Fuzzy match an instruction to an element
   */
  private fuzzyMatchElement(
    instruction: string,
    elements: Array<{ text: string; tag: string; role: string; ariaLabel?: string }>
  ): number | null {
    const lower = instruction.toLowerCase();

    // Extract target words from instruction
    let target = lower;
    const prefixes = ['click ', 'click on ', 'click the ', 'tap ', 'press ', 'find '];
    for (const prefix of prefixes) {
      if (lower.startsWith(prefix)) {
        target = lower.slice(prefix.length);
        break;
      }
    }

    const targetWords = target.split(/\s+/).filter(w => w.length > 2);

    let bestIndex = -1;
    let bestScore = 0;

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const searchText = `${el.text || ''} ${el.ariaLabel || ''} ${el.role || ''}`.toLowerCase();

      // Exact match
      if (searchText.includes(target)) {
        return i;
      }

      // Word overlap
      let matches = 0;
      for (const word of targetWords) {
        if (searchText.includes(word)) {
          matches++;
        }
      }

      const score = matches / targetWords.length;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return bestScore > 0.3 ? bestIndex : null;
  }

  /**
   * Infer action type from instruction
   */
  private inferActionType(instruction: string): string {
    const lower = instruction.toLowerCase();

    if (lower.includes('type') || lower.includes('enter') || lower.includes('fill')) {
      return 'type';
    }
    if (lower.includes('hover')) {
      return 'hover';
    }
    if (lower.includes('scroll')) {
      return 'scroll';
    }

    return 'click';
  }

  /**
   * Get the underlying Stagehand instance
   */
  getStagehand(): unknown {
    return this.stagehand;
  }

  /**
   * Get all captured prompts
   */
  getPrompts(): CapturedPrompt[] {
    return [...this.prompts];
  }

  /**
   * Get prompts by task type
   */
  getPromptsByTask(task: CapturedPrompt['task']): CapturedPrompt[] {
    return this.prompts.filter(p => p.task === task);
  }

  /**
   * Clear captured prompts
   */
  clearPrompts(): void {
    this.prompts = [];
  }

  /**
   * Export all prompts to a file
   */
  exportPrompts(filepath: string): void {
    writeFileSync(filepath, JSON.stringify(this.prompts, null, 2));
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    total: number;
    byTask: Record<string, number>;
    avgPromptLength: number;
  } {
    const byTask: Record<string, number> = {};
    let totalLength = 0;

    for (const p of this.prompts) {
      byTask[p.task] = (byTask[p.task] || 0) + 1;
      totalLength += (p.userPrompt?.length || 0) + (p.systemPrompt?.length || 0);
    }

    return {
      total: this.prompts.length,
      byTask,
      avgPromptLength: this.prompts.length > 0 ? Math.round(totalLength / this.prompts.length) : 0,
    };
  }
}

// ─── Factory Function ─────────────────────────────────────────────────────

/**
 * Create and initialize a Stagehand spy
 */
export async function createStagehandSpy(
  options: SpyOptions & { stagehand?: Record<string, unknown> } = {}
): Promise<StagehandSpy> {
  const { stagehand: stagehandOptions, ...spyOptions } = options;

  const spy = new StagehandSpy(spyOptions);
  await spy.init(stagehandOptions);

  return spy;
}

// ─── Standalone Runner ────────────────────────────────────────────────────

/**
 * Run the spy standalone to capture prompts from a Stagehand session
 */
export async function runPromptCapture(options: {
  url: string;
  actions: Array<{ type: 'observe' | 'act' | 'extract'; instruction?: string; schema?: Record<string, unknown> }>;
  outputDir?: string;
}): Promise<CapturedPrompt[]> {
  const spy = await createStagehandSpy({
    logToConsole: true,
    logToFile: options.outputDir,
  });

  const stagehand = spy.getStagehand() as {
    init: () => Promise<void>;
    page: {
      goto: (url: string) => Promise<void>;
      observe: (opts?: { instruction?: string }) => Promise<unknown>;
      act: (instruction: string) => Promise<unknown>;
      extract: (opts: { schema: Record<string, unknown> }) => Promise<unknown>;
    };
    close: () => Promise<void>;
  };

  try {
    await stagehand.init();
    await stagehand.page.goto(options.url);

    for (const action of options.actions) {
      try {
        switch (action.type) {
          case 'observe':
            await stagehand.page.observe({ instruction: action.instruction });
            break;
          case 'act':
            if (action.instruction) {
              await stagehand.page.act(action.instruction);
            }
            break;
          case 'extract':
            if (action.schema) {
              await stagehand.page.extract({ schema: action.schema });
            }
            break;
        }
      } catch (error) {
        // Expected - our mock responses may not satisfy Stagehand
        console.log(`Action ${action.type} completed (or errored as expected)`);
      }
    }

    await stagehand.close();
  } catch (error) {
    console.error('Spy session error:', error);
  }

  return spy.getPrompts();
}
