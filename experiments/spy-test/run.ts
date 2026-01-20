/**
 * Quick Stagehand Spy Test
 *
 * Run with: npx tsx run.ts
 */

import { Stagehand, LLMClient } from '@browserbasehq/stagehand';

// Custom LLM client that captures prompts
class SpyLLMClient extends LLMClient {
  private capturedPrompts: CapturedPrompt[];

  constructor(prompts: CapturedPrompt[]) {
    super('gpt-4o' as any);  // Need to pass a model name to parent
    this.capturedPrompts = prompts;
    this.type = 'openai';
    this.hasVision = true;
    this.clientOptions = {};
  }

  async createChatCompletion<T = any>(options: any): Promise<T> {
    console.log('\n>>> createChatCompletion called!');
    console.log('Options keys:', Object.keys(options || {}));

    // Handle the options wrapper structure
    const actualOptions = options?.options || options;
    const messages = actualOptions?.messages || [];

    // Capture the prompt
    const captured: CapturedPrompt = {
      timestamp: new Date().toISOString(),
      task: this.inferTask(actualOptions),
      rawKeys: Object.keys(actualOptions || {}),
      fullPayload: actualOptions as Record<string, unknown>,
    };

    // Extract messages
    const system = messages.find((m: any) => m.role === 'system');
    const user = messages.find((m: any) => m.role === 'user');
    if (system) captured.systemPrompt = this.extractContent(system.content);
    if (user) captured.userPrompt = this.extractContent(user.content);

    this.capturedPrompts.push(captured);

    // Log it
    console.log('\n' + '='.repeat(70));
    console.log(`CAPTURED PROMPT #${this.capturedPrompts.length} [${captured.task}]`);
    console.log('='.repeat(70));
    console.log(`Keys: ${captured.rawKeys.join(', ')}`);
    if (captured.systemPrompt) {
      console.log(`\nSystem Prompt (${captured.systemPrompt.length} chars):`);
      console.log('-'.repeat(50));
      console.log(captured.systemPrompt.slice(0, 2000));
      if (captured.systemPrompt.length > 2000) console.log('...[truncated]');
    }
    if (captured.userPrompt) {
      console.log(`\nUser Prompt (${captured.userPrompt.length} chars):`);
      console.log('-'.repeat(50));
      console.log(captured.userPrompt.slice(0, 2000));
      if (captured.userPrompt.length > 2000) console.log('...[truncated]');
    }
    console.log('='.repeat(70) + '\n');

    // Return mock response
    const response = {
      id: 'spy-' + Date.now(),
      object: 'chat.completion',
      model: 'spy-model',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify(this.mockResponse(captured.task)),
        },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    };
    return response as T;
  }

  private inferTask(options: Record<string, unknown>): string {
    const str = JSON.stringify(options).toLowerCase();
    if (str.includes('observe') || str.includes('find element')) return 'observe';
    if (str.includes('act') || str.includes('perform') || str.includes('click')) return 'act';
    if (str.includes('extract') || str.includes('schema')) return 'extract';
    return 'unknown';
  }

  private extractContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map(c => {
        if (typeof c === 'string') return c;
        if (c.type === 'text') return c.text;
        if (c.type === 'image_url') return '[IMAGE]';
        return JSON.stringify(c);
      }).join('\n');
    }
    return JSON.stringify(content);
  }

  private mockResponse(task: string): unknown {
    switch (task) {
      case 'observe':
        return {
          elements: [{ index: 0, description: 'Mock element' }]
        };
      case 'act':
        return { success: true, elementIndex: 0 };
      default:
        return { success: true };
    }
  }
}

interface CapturedPrompt {
  timestamp: string;
  task: string;
  instruction?: string;
  systemPrompt?: string;
  userPrompt?: string;
  elementCount?: number;
  rawKeys: string[];
  fullPayload?: Record<string, unknown>;
}

const prompts: CapturedPrompt[] = [];

async function main() {
  console.log('Starting Stagehand Spy...\n');

  // Create our spy LLM client
  const spyClient = new SpyLLMClient(prompts);

  const stagehand = new Stagehand({
    env: 'LOCAL',
    headless: false,  // Show browser so we can see what's happening
    enableCaching: false,
    verbose: 1,
    // KEY: Use our spy client instead of OpenAI
    llmClient: spyClient,
  });

  try {
    await stagehand.init();
    console.log('Browser initialized\n');

    // Get the page via context
    const page = stagehand.context.pages()[0];
    console.log('Page object:', page ? 'found' : 'not found');

    // Navigate to Hacker News
    console.log('>>> Navigating to Hacker News...');
    await page.goto('https://news.ycombinator.com');
    await sleep(2000);

    // Test observe()
    console.log('>>> Calling observe()...');
    try {
      const result = await stagehand.observe();
      console.log('observe() returned:', JSON.stringify(result).slice(0, 200));
    } catch (e: any) {
      console.log('observe() error:', e.message);
    }

    // Test observe() with instruction
    console.log('>>> Calling observe() with instruction...');
    try {
      const result = await stagehand.observe({ instruction: 'find the top story link' });
      console.log('observe(instruction) returned:', JSON.stringify(result).slice(0, 200));
    } catch (e: any) {
      console.log('observe(instruction) error:', e.message);
    }

    // Test act()
    console.log('>>> Calling act()...');
    try {
      await stagehand.act('click the first story link');
    } catch (e: any) {
      console.log('act() error:', e.message);
    }

    await sleep(2000);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    console.log('\n\n=== SUMMARY ===');
    console.log(`Total prompts captured: ${prompts.length}`);
    console.log('Tasks:', prompts.map(p => p.task).join(', '));

    // Save to file
    const fs = await import('fs');
    fs.writeFileSync('captured-prompts.json', JSON.stringify(prompts, null, 2));
    console.log('Saved to captured-prompts.json');

    await stagehand.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
