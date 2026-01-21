#!/usr/bin/env npx tsx
/**
 * Scenario Test Runner
 *
 * Runs scenarios in sequence, each building on the previous.
 * Stops on first failure.
 *
 * Usage: npx tsx scripts/run-scenarios.ts [scenario-number]
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCENARIOS_DIR = join(__dirname, '../demos/scenarios');
const VIF_DIR = join(homedir(), '.vif');

interface ScenarioResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  outputFile?: string;
}

function getScenarios(): string[] {
  return readdirSync(SCENARIOS_DIR)
    .filter(f => f.endsWith('.yaml'))
    .sort();
}

function cleanupScreencapture(): void {
  try {
    execSync('pkill -9 screencapture', { stdio: 'ignore' });
  } catch {
    // No processes to kill
  }
}

function getExpectedOutput(scenarioFile: string): string | null {
  // Parse the output field from the scenario if present
  const content = readFileSync(join(SCENARIOS_DIR, scenarioFile), 'utf-8');
  const match = content.match(/output:\s*(\S+)/);
  if (match) {
    return join(VIF_DIR, `${match[1]}.mp4`);
  }
  return null;
}

async function runScenario(scenarioFile: string): Promise<ScenarioResult> {
  const scenarioPath = join(SCENARIOS_DIR, scenarioFile);
  const scenarioName = scenarioFile.replace('.yaml', '');
  const expectedOutput = getExpectedOutput(scenarioFile);

  // Clean up expected output if it exists
  if (expectedOutput && existsSync(expectedOutput)) {
    unlinkSync(expectedOutput);
  }

  // Clean up any stale screencapture processes
  cleanupScreencapture();

  const startTime = Date.now();

  return new Promise((resolve) => {
    const proc = spawn('node', ['dist/cli.js', 'play', scenarioPath], {
      stdio: 'pipe',
      cwd: join(__dirname, '..'),
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      cleanupScreencapture();
      resolve({
        name: scenarioName,
        passed: false,
        duration: Date.now() - startTime,
        error: 'Timeout (60s)',
      });
    }, 60000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      // Check for stale screencapture
      try {
        const pgrep = execSync('pgrep screencapture', { encoding: 'utf-8' });
        if (pgrep.trim()) {
          cleanupScreencapture();
          resolve({
            name: scenarioName,
            passed: false,
            duration,
            error: 'Stale screencapture process detected',
          });
          return;
        }
      } catch {
        // No processes - good
      }

      // Check for expected output file
      if (expectedOutput) {
        if (!existsSync(expectedOutput)) {
          resolve({
            name: scenarioName,
            passed: false,
            duration,
            error: `Expected output file not created: ${expectedOutput}`,
          });
          return;
        }

        const stats = statSync(expectedOutput);
        if (stats.size < 1000) {
          resolve({
            name: scenarioName,
            passed: false,
            duration,
            error: `Output file too small (${stats.size} bytes)`,
            outputFile: expectedOutput,
          });
          return;
        }
      }

      if (code !== 0) {
        resolve({
          name: scenarioName,
          passed: false,
          duration,
          error: `Exit code ${code}: ${stderr || stdout}`,
        });
        return;
      }

      resolve({
        name: scenarioName,
        passed: true,
        duration,
        outputFile: expectedOutput || undefined,
      });
    });
  });
}

async function main() {
  const specificScenario = process.argv[2];
  let scenarios = getScenarios();

  if (specificScenario) {
    const num = parseInt(specificScenario, 10);
    scenarios = scenarios.filter(s => s.startsWith(`0${num}-`) || s.startsWith(`${num}-`));
    if (scenarios.length === 0) {
      console.error(`No scenario found matching: ${specificScenario}`);
      process.exit(1);
    }
  }

  console.log('╔════════════════════════════════════════╗');
  console.log('║       VIF Scenario Test Runner         ║');
  console.log('╚════════════════════════════════════════╝');
  console.log();
  console.log(`Found ${scenarios.length} scenario(s) to run`);
  console.log();

  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    console.log(`▶ Running: ${scenario}`);

    const result = await runScenario(scenario);
    results.push(result);

    if (result.passed) {
      console.log(`  ✓ PASSED (${result.duration}ms)`);
      if (result.outputFile) {
        console.log(`    Output: ${result.outputFile}`);
      }
    } else {
      console.log(`  ✗ FAILED (${result.duration}ms)`);
      console.log(`    Error: ${result.error}`);
      console.log();
      console.log('Stopping - fix this scenario before continuing.');
      break;
    }
    console.log();
  }

  // Summary
  console.log('════════════════════════════════════════');
  console.log('Summary:');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${results.length}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
