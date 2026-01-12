#!/usr/bin/env node
/**
 * Talkie UI Calibration
 *
 * Moves cursor to target positions and pauses for visual verification.
 * Adjust coordinates based on what you see.
 */

import { execSync } from 'child_process';
import { moveMouse, smoothMove, getMousePosition } from '../dist/automation.js';
import { getWindows } from '../dist/index.js';

function getTalkieWindow() {
  const windows = getWindows();
  const main = windows.find(w => w.owner === 'Talkie' && w.name === 'Talkie');
  if (!main) {
    console.error('Talkie not found');
    process.exit(1);
  }
  return main.bounds;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function calibrate() {
  console.log('Talkie UI Calibration');
  console.log('=====================\n');

  // Activate Talkie
  execSync('osascript -e \'tell application "Talkie" to activate\'');
  await sleep(500);

  const win = getTalkieWindow();
  console.log(`Window: ${win.width}x${win.height} at (${win.x}, ${win.y})\n`);

  // Targets to calibrate (adjust these based on visual feedback)
  const targets = {
    // Based on screenshot analysis of 1405x957 window
    // Sidebar item "Drafts" - 4th item down, center of sidebar
    drafts: { x: win.x + 48, y: win.y + 115, label: 'Drafts sidebar item' },

    // Text editor area (when in Drafts view)
    editor: { x: win.x + 700, y: win.y + 300, label: 'Editor text area' },

    // Mic button (bottom right blue circle)
    mic: { x: win.x + win.width - 45, y: win.y + win.height - 70, label: 'Mic button' },
  };

  console.log('Moving cursor to each target. Watch and verify.\n');
  console.log('Press Ctrl+C to stop at any time.\n');

  for (const [name, target] of Object.entries(targets)) {
    console.log(`→ ${name}: ${target.label}`);
    console.log(`  Target: (${target.x}, ${target.y})`);

    await smoothMove({ x: target.x, y: target.y }, 0.3);

    const actual = getMousePosition();
    console.log(`  Actual: (${actual.x}, ${actual.y})`);
    console.log('  [Pausing 3s - verify cursor is on target]\n');

    await sleep(3000);
  }

  console.log('Calibration complete.');
  console.log('\nAdjust the coordinates in the targets object if needed.');
  console.log('Then update run-draft-demo.js with correct values.');
}

calibrate().catch(console.error);
