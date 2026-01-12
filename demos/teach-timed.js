#!/usr/bin/env node
/**
 * Timed Teach Mode
 *
 * Gives you 5 seconds to click each target, then captures position.
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { getMousePosition } from '../dist/automation.js';
import { getWindows } from '../dist/index.js';

const OUTPUT_DIR = '/tmp/talkie-demo';
const COORDINATES_FILE = `${OUTPUT_DIR}/coordinates.json`;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getTalkieWindow() {
  const windows = getWindows();
  const main = windows.find(w => w.owner === 'Talkie' && w.name === 'Talkie');
  if (!main) {
    console.error('Talkie not found');
    process.exit(1);
  }
  return main.bounds;
}

async function teach() {
  console.log('=== TIMED TEACH MODE ===\n');

  execSync('osascript -e \'tell application "Talkie" to activate\'');
  await sleep(500);

  const win = getTalkieWindow();
  console.log(`Window: ${win.width}x${win.height} at (${win.x}, ${win.y})\n`);

  const targets = [
    { name: 'drafts', prompt: 'Click on "Drafts" in sidebar' },
    { name: 'textArea', prompt: 'Click in text editor area' },
    { name: 'micButton', prompt: 'Click on mic/voice button' },
  ];

  const coordinates = { window: win, targets: {} };

  for (const target of targets) {
    console.log(`→ ${target.prompt}`);

    for (let i = 5; i > 0; i--) {
      process.stdout.write(`  Capturing in ${i}...\r`);
      await sleep(1000);
    }

    const pos = getMousePosition();
    coordinates.targets[target.name] = {
      absolute: { x: pos.x, y: pos.y },
      relative: { x: pos.x - win.x, y: pos.y - win.y },
    };

    console.log(`  ✓ Captured: (${pos.x}, ${pos.y}) [+${pos.x - win.x}, +${pos.y - win.y}]`);
    console.log('');
  }

  execSync(`mkdir -p ${OUTPUT_DIR}`);
  writeFileSync(COORDINATES_FILE, JSON.stringify(coordinates, null, 2));

  console.log(`Saved to: ${COORDINATES_FILE}`);
  console.log('\nNow run: node demos/teach-and-replay.js --replay');
}

teach().catch(console.error);
