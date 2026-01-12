#!/usr/bin/env node
/**
 * Test Talkie's hybrid demo mode
 *
 * This launches Talkie with --demo flag and records the screen.
 * DemoKit will move the synthetic cursor AND trigger real clicks.
 */

import { execSync, spawn } from 'child_process';
import { startRecording } from '../dist/index.js';

const outputDir = '/tmp/talkie-hybrid-demo';
const videoOutput = `${outputDir}/hybrid-demo.mp4`;

async function run() {
  console.log('Talkie Hybrid Demo Test');
  console.log('=======================\n');

  // Create output directory
  execSync(`mkdir -p ${outputDir}`);

  // Kill any existing Talkie instances
  console.log('Closing existing Talkie instances...');
  try {
    execSync('pkill -x Talkie', { stdio: 'pipe' });
  } catch { /* ignore if not running */ }
  await sleep(500);

  // Start screen recording
  console.log(`Starting screen recording: ${videoOutput}`);
  const recording = startRecording({ output: videoOutput, audio: false });
  await sleep(1000);

  // Launch Talkie in demo mode
  console.log('Launching Talkie with --demo flag...');
  const talkiePath = '/Users/arach/Library/Developer/Xcode/DerivedData/TalkieSuite-guavpoyqmfbntrgcygyesivttxyh/Build/Products/Debug/Talkie.app/Contents/MacOS/Talkie';

  const talkie = spawn(talkiePath, ['--demo'], {
    stdio: 'inherit',
    detached: false,
  });

  console.log('');
  console.log('DemoKit will now:');
  console.log('  1. Show synthetic cursor (visual)');
  console.log('  2. Move to UI elements');
  console.log('  3. Trigger REAL clicks via CGEvent');
  console.log('');
  console.log('Watch for real UI interactions!');
  console.log('');
  console.log('Demo will run for ~20 seconds...\n');

  // Wait for demo to complete
  await sleep(20000);

  // Stop recording
  console.log('Stopping recording...');
  await recording.stop();

  // Close Talkie
  console.log('Closing Talkie...');
  try {
    execSync('pkill -x Talkie', { stdio: 'pipe' });
  } catch { /* ignore */ }

  console.log(`\nDone! Opening: ${videoOutput}`);
  execSync(`open "${videoOutput}"`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
