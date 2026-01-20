#!/usr/bin/env npx ts-node
/**
 * Stagehand Prompt Harvester
 *
 * Runs Stagehand against multiple sites, captures all prompts,
 * and consolidates patterns for analysis.
 *
 * Usage:
 *   npx ts-node scripts/harvest-prompts.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// ─── Test Scenarios ───────────────────────────────────────────────────────

interface TestScenario {
  name: string;
  url: string;
  actions: Array<{
    type: 'observe' | 'act' | 'extract';
    instruction?: string;
    schema?: Record<string, unknown>;
  }>;
}

const scenarios: TestScenario[] = [
  {
    name: 'hacker-news',
    url: 'https://news.ycombinator.com',
    actions: [
      { type: 'observe' },
      { type: 'observe', instruction: 'find the top story' },
      { type: 'act', instruction: 'click the first story link' },
      { type: 'extract', schema: { title: 'string', points: 'number' } },
    ],
  },
  {
    name: 'google',
    url: 'https://google.com',
    actions: [
      { type: 'observe' },
      { type: 'observe', instruction: 'find the search box' },
      { type: 'act', instruction: 'click the search input' },
      { type: 'act', instruction: 'type hello world' },
    ],
  },
  {
    name: 'github',
    url: 'https://github.com',
    actions: [
      { type: 'observe' },
      { type: 'observe', instruction: 'find the sign in button' },
      { type: 'act', instruction: 'click Sign in' },
    ],
  },
  {
    name: 'wikipedia',
    url: 'https://en.wikipedia.org',
    actions: [
      { type: 'observe' },
      { type: 'act', instruction: 'click the search box' },
      { type: 'act', instruction: 'type artificial intelligence' },
      { type: 'extract', schema: { mainHeading: 'string', firstParagraph: 'string' } },
    ],
  },
];

// ─── Captured Prompt Type ─────────────────────────────────────────────────

interface CapturedPrompt {
  timestamp: string;
  scenario: string;
  actionIndex: number;
  task: string;
  instruction?: string;
  systemPrompt?: string;
  userPrompt?: string;
  elementCount?: number;
  hasScreenshot?: boolean;
  rawPayload: Record<string, unknown>;
}

// ─── Prompt Analysis ──────────────────────────────────────────────────────

interface PromptPattern {
  task: string;
  systemPromptTemplate?: string;
  userPromptTemplate?: string;
  commonPhrases: string[];
  avgElementCount: number;
  usesScreenshot: boolean;
  examples: string[];
}

function analyzePrompts(prompts: CapturedPrompt[]): {
  patterns: Record<string, PromptPattern>;
  summary: string;
} {
  const byTask: Record<string, CapturedPrompt[]> = {};

  for (const p of prompts) {
    if (!byTask[p.task]) byTask[p.task] = [];
    byTask[p.task].push(p);
  }

  const patterns: Record<string, PromptPattern> = {};

  for (const [task, taskPrompts] of Object.entries(byTask)) {
    // Find common phrases in system prompts
    const systemPrompts = taskPrompts
      .map(p => p.systemPrompt)
      .filter(Boolean) as string[];

    const userPrompts = taskPrompts
      .map(p => p.userPrompt)
      .filter(Boolean) as string[];

    // Extract common phrases (simple approach)
    const commonPhrases = findCommonPhrases([...systemPrompts, ...userPrompts]);

    patterns[task] = {
      task,
      systemPromptTemplate: findTemplate(systemPrompts),
      userPromptTemplate: findTemplate(userPrompts),
      commonPhrases,
      avgElementCount: average(taskPrompts.map(p => p.elementCount || 0)),
      usesScreenshot: taskPrompts.some(p => p.hasScreenshot),
      examples: taskPrompts.slice(0, 3).map(p => p.instruction || p.userPrompt || '').filter(Boolean),
    };
  }

  // Generate summary
  const summary = generateSummary(prompts, patterns);

  return { patterns, summary };
}

function findCommonPhrases(texts: string[]): string[] {
  if (texts.length === 0) return [];

  // Simple approach: find phrases that appear in multiple texts
  const phraseCount: Record<string, number> = {};

  for (const text of texts) {
    // Extract phrases (3-5 word chunks)
    const words = text.toLowerCase().split(/\s+/);
    for (let len = 3; len <= 5; len++) {
      for (let i = 0; i <= words.length - len; i++) {
        const phrase = words.slice(i, i + len).join(' ');
        phraseCount[phrase] = (phraseCount[phrase] || 0) + 1;
      }
    }
  }

  // Return phrases that appear in at least 2 texts
  return Object.entries(phraseCount)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase]) => phrase);
}

function findTemplate(texts: string[]): string | undefined {
  if (texts.length === 0) return undefined;

  // Return the shortest text as a potential template
  // (In practice, we'd do more sophisticated template extraction)
  const sorted = [...texts].sort((a, b) => a.length - b.length);
  return sorted[0].slice(0, 500) + (sorted[0].length > 500 ? '...' : '');
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function generateSummary(prompts: CapturedPrompt[], patterns: Record<string, PromptPattern>): string {
  const lines: string[] = [
    '# Stagehand Prompt Analysis',
    '',
    `**Total prompts captured:** ${prompts.length}`,
    `**Unique tasks:** ${Object.keys(patterns).join(', ')}`,
    '',
    '## Task Breakdown',
    '',
  ];

  for (const [task, pattern] of Object.entries(patterns)) {
    lines.push(`### ${task.toUpperCase()}`);
    lines.push('');
    lines.push(`- **Count:** ${prompts.filter(p => p.task === task).length}`);
    lines.push(`- **Avg elements:** ${pattern.avgElementCount.toFixed(1)}`);
    lines.push(`- **Uses screenshot:** ${pattern.usesScreenshot ? 'Yes' : 'No'}`);
    lines.push('');

    if (pattern.commonPhrases.length > 0) {
      lines.push('**Common phrases:**');
      for (const phrase of pattern.commonPhrases.slice(0, 5)) {
        lines.push(`- "${phrase}"`);
      }
      lines.push('');
    }

    if (pattern.systemPromptTemplate) {
      lines.push('**System prompt preview:**');
      lines.push('```');
      lines.push(pattern.systemPromptTemplate.slice(0, 300));
      lines.push('```');
      lines.push('');
    }

    if (pattern.examples.length > 0) {
      lines.push('**Example instructions:**');
      for (const ex of pattern.examples) {
        lines.push(`- "${ex}"`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Main Runner ──────────────────────────────────────────────────────────

async function main() {
  console.log('Stagehand Prompt Harvester');
  console.log('==========================\n');

  // Check if Stagehand is available
  let Stagehand: unknown;
  try {
    const module = await import('@browserbasehq/stagehand');
    Stagehand = module.Stagehand;
  } catch {
    console.error('Stagehand not installed. Run: pnpm add @browserbasehq/stagehand');
    console.log('\nGenerating mock analysis instead...\n');

    // Generate a mock analysis to show the format
    generateMockAnalysis();
    return;
  }

  const outputDir = join(process.cwd(), 'prompt-harvest');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const allPrompts: CapturedPrompt[] = [];

  for (const scenario of scenarios) {
    console.log(`\n--- ${scenario.name} ---`);
    console.log(`URL: ${scenario.url}`);

    const scenarioPrompts = await runScenario(Stagehand, scenario);
    allPrompts.push(...scenarioPrompts);

    // Save individual scenario results
    const scenarioFile = join(outputDir, `${scenario.name}.json`);
    writeFileSync(scenarioFile, JSON.stringify(scenarioPrompts, null, 2));
    console.log(`Saved ${scenarioPrompts.length} prompts to ${scenarioFile}`);
  }

  // Analyze all prompts
  console.log('\n\n=== ANALYSIS ===\n');
  const { patterns, summary } = analyzePrompts(allPrompts);

  // Save consolidated results
  writeFileSync(
    join(outputDir, 'all-prompts.json'),
    JSON.stringify(allPrompts, null, 2)
  );

  writeFileSync(
    join(outputDir, 'patterns.json'),
    JSON.stringify(patterns, null, 2)
  );

  writeFileSync(
    join(outputDir, 'summary.md'),
    summary
  );

  console.log(summary);
  console.log(`\nResults saved to ${outputDir}/`);
}

async function runScenario(
  Stagehand: unknown,
  scenario: TestScenario
): Promise<CapturedPrompt[]> {
  const prompts: CapturedPrompt[] = [];

  const StagehandClass = Stagehand as new (opts: Record<string, unknown>) => {
    init: () => Promise<void>;
    page: {
      goto: (url: string) => Promise<void>;
      observe: (opts?: { instruction?: string }) => Promise<unknown>;
      act: (instruction: string) => Promise<unknown>;
      extract: (opts: { schema: Record<string, unknown> }) => Promise<unknown>;
    };
    close: () => Promise<void>;
  };

  const stagehand = new StagehandClass({
    env: 'LOCAL',
    headless: true,
    enableCaching: false,
    verbose: 0,
    useAPI: false,
    modelProvider: {
      type: 'custom',
      inference: async (params: Record<string, unknown>) => {
        // Capture the prompt
        const captured: CapturedPrompt = {
          timestamp: new Date().toISOString(),
          scenario: scenario.name,
          actionIndex: prompts.length,
          task: inferTask(params),
          rawPayload: params,
        };

        // Extract fields
        if (params.instruction) captured.instruction = params.instruction as string;
        if (params.systemPrompt) captured.systemPrompt = params.systemPrompt as string;
        if (params.prompt) captured.userPrompt = params.prompt as string;

        const messages = params.messages as Array<{ role: string; content: string }> | undefined;
        if (messages) {
          const user = messages.find(m => m.role === 'user');
          const system = messages.find(m => m.role === 'system');
          if (user) captured.userPrompt = user.content;
          if (system) captured.systemPrompt = system.content;
        }

        captured.elementCount = (params.elements as unknown[] | undefined)?.length;
        captured.hasScreenshot = !!params.screenshot || !!params.image;

        prompts.push(captured);
        console.log(`  Captured: ${captured.task} prompt`);

        // Return mock response
        return mockResponse(captured.task);
      },
    },
  });

  try {
    await stagehand.init();
    await stagehand.page.goto(scenario.url);

    for (const action of scenario.actions) {
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
      } catch {
        // Expected - mock responses may not satisfy Stagehand
      }

      // Small delay between actions
      await new Promise(r => setTimeout(r, 500));
    }

    await stagehand.close();
  } catch (error) {
    console.error(`  Error in scenario: ${error}`);
  }

  return prompts;
}

function inferTask(params: Record<string, unknown>): string {
  const str = JSON.stringify(params).toLowerCase();
  if (str.includes('observe') || str.includes('find element')) return 'observe';
  if (str.includes('act') || str.includes('click') || str.includes('type')) return 'act';
  if (str.includes('extract') || str.includes('schema')) return 'extract';
  return 'unknown';
}

function mockResponse(task: string): Record<string, unknown> {
  switch (task) {
    case 'observe': return { elements: [] };
    case 'act': return { action: { elementIndex: 0, actionType: 'click' } };
    case 'extract': return { data: {} };
    default: return {};
  }
}

function generateMockAnalysis() {
  const mockSummary = `# Stagehand Prompt Analysis (Mock)

**Note:** Stagehand not installed. Install with: pnpm add @browserbasehq/stagehand

## Expected Output Format

When run with Stagehand installed, this script will:

1. Visit multiple test sites (HN, Google, GitHub, Wikipedia)
2. Trigger observe/act/extract actions
3. Capture all LLM prompts Stagehand generates
4. Analyze patterns across prompts
5. Generate consolidated insights

## What We're Looking For

- **System prompt templates**: How they frame the task
- **Element representation**: How they describe DOM elements
- **Action vocabulary**: What actions they support
- **Screenshot usage**: When they include visual context
- **Response format**: What JSON structure they expect

Run this script after installing Stagehand to see actual prompts.
`;

  const outputDir = join(process.cwd(), 'prompt-harvest');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(join(outputDir, 'summary.md'), mockSummary);
  console.log(mockSummary);
  console.log(`\nMock summary saved to ${outputDir}/summary.md`);
}

main().catch(console.error);
