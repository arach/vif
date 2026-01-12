#!/usr/bin/env node
/**
 * Teach & Replay Demo System
 *
 * Phase 1 (teach): User clicks on UI targets, coordinates are saved
 * Phase 2 (replay): Replay those coordinates for the demo recording
 */

import { execSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import {
  getMousePosition,
  smoothMove,
  click,
  executeCursorScript,
  saveCursorRecording,
  toCursorTrack,
  hasMouseControl,
} from '../dist/automation.js';
import { startRecording, getWindows } from '../dist/index.js';
import { applyCursorZoomPan } from '../dist/cursor.js';

const COORDINATES_FILE = '/tmp/talkie-demo/coordinates.json';
const OUTPUT_DIR = '/tmp/talkie-demo';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getTalkieWindow() {
  const windows = getWindows();
  const main = windows.find(w => w.owner === 'Talkie' && w.name === 'Talkie');
  if (!main) {
    console.error('Talkie main window not found.');
    process.exit(1);
  }
  return main.bounds;
}

// ============================================================================
// PHASE 1: TEACH MODE
// ============================================================================

async function teachMode() {
  console.log('=== TEACH MODE ===\n');
  console.log('Click on each UI element when prompted.');
  console.log('Press Enter after each click to record position.\n');

  execSync('osascript -e \'tell application "Talkie" to activate\'');
  await sleep(500);

  const win = getTalkieWindow();
  console.log(`Window: ${win.width}x${win.height} at (${win.x}, ${win.y})\n`);

  const targets = [
    { name: 'drafts', prompt: 'Click on "Drafts" in the sidebar' },
    { name: 'textArea', prompt: 'Click in the text editor area (where you type)' },
    { name: 'micButton', prompt: 'Click on the mic/voice button' },
  ];

  const coordinates = { window: win, targets: {} };

  for (const target of targets) {
    console.log(`→ ${target.prompt}`);
    process.stdout.write('  Press Enter after clicking... ');

    // Wait for Enter key
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });

    const pos = getMousePosition();
    coordinates.targets[target.name] = {
      absolute: { x: pos.x, y: pos.y },
      relative: { x: pos.x - win.x, y: pos.y - win.y },
    };

    console.log(`  Recorded: (${pos.x}, ${pos.y}) [relative: +${pos.x - win.x}, +${pos.y - win.y}]\n`);
  }

  // Save coordinates
  execSync(`mkdir -p ${OUTPUT_DIR}`);
  writeFileSync(COORDINATES_FILE, JSON.stringify(coordinates, null, 2));
  console.log(`\nCoordinates saved to: ${COORDINATES_FILE}`);
  console.log('\nNow run with --replay to record the demo.');
}

// ============================================================================
// PHASE 2: REPLAY MODE
// ============================================================================

async function replayMode() {
  console.log('=== REPLAY MODE ===\n');

  if (!existsSync(COORDINATES_FILE)) {
    console.error('No coordinates file found. Run with --teach first.');
    process.exit(1);
  }

  const saved = JSON.parse(readFileSync(COORDINATES_FILE, 'utf-8'));

  execSync('osascript -e \'tell application "Talkie" to activate\'');
  await sleep(500);

  const win = getTalkieWindow();
  console.log(`Window: ${win.width}x${win.height} at (${win.x}, ${win.y})`);

  // Recalculate absolute positions based on current window position
  const ui = {};
  for (const [name, coords] of Object.entries(saved.targets)) {
    ui[name] = {
      x: win.x + coords.relative.x,
      y: win.y + coords.relative.y,
    };
    console.log(`  ${name}: (${ui[name].x}, ${ui[name].y})`);
  }

  const sampleText = "I think we should probably consider maybe looking into the possibility of potentially exploring options.";

  const script = {
    app: 'Talkie',
    actions: [
      { type: 'wait', duration: 0.5 },

      // 1. Click Drafts
      { type: 'move', to: ui.drafts, duration: 0.3 },
      { type: 'zoom', level: 1.8, at: ui.drafts },
      { type: 'wait', duration: 0.2 },
      { type: 'click', at: ui.drafts },
      { type: 'wait', duration: 0.8 },

      // 2. Click text area and type
      { type: 'move', to: ui.textArea, duration: 0.25 },
      { type: 'zoom', level: 1.4, at: ui.textArea },
      { type: 'click', at: ui.textArea },
      { type: 'wait', duration: 0.3 },
      { type: 'type', text: sampleText },
      { type: 'wait', duration: 1.5 },

      // 3. Trigger voice recording
      { type: 'move', to: ui.micButton, duration: 0.3 },
      { type: 'zoom', level: 2.0, at: ui.micButton },
      { type: 'wait', duration: 0.3 },
      { type: 'keypress', key: 'l', modifiers: ['option', 'command'] },
      { type: 'wait', duration: 3 },
      { type: 'keypress', key: 'l', modifiers: ['option', 'command'] },
      { type: 'wait', duration: 4 },

      // 4. Show result
      { type: 'move', to: ui.textArea, duration: 0.3 },
      { type: 'zoom', level: 1.3, at: ui.textArea },
      { type: 'wait', duration: 2 },

      // 5. Accept changes
      { type: 'keypress', key: '\r', modifiers: ['command'] },
      { type: 'zoom', level: 1.0 },
      { type: 'wait', duration: 1.5 },
    ],
  };

  const rawVideo = `${OUTPUT_DIR}/draft-raw.mp4`;
  const finalVideo = `${OUTPUT_DIR}/draft-demo.mp4`;
  const cursorFile = `${OUTPUT_DIR}/cursor.json`;

  console.log('\nStarting recording...');
  console.log('\n>>> SAY "make it shorter" WHEN RECORDING STARTS <<<\n');

  const recording = startRecording({ output: rawVideo, audio: false });
  await sleep(1000);

  try {
    const cursorRecording = await executeCursorScript(script);

    console.log('Stopping recording...');
    await recording.stop();

    saveCursorRecording(cursorRecording, cursorFile);
    console.log(`Tracked ${cursorRecording.positions.length} positions`);

    console.log('Applying zoom/pan effects...');
    const success = applyCursorZoomPan(
      rawVideo,
      finalVideo,
      toCursorTrack(cursorRecording),
      { enabled: true, zoom: 1.5 }
    );

    if (success) {
      console.log(`\nDone! Opening: ${finalVideo}`);
      execSync(`open "${finalVideo}"`);
    } else {
      console.log('Effects failed, opening raw...');
      execSync(`open "${rawVideo}"`);
    }
  } catch (error) {
    console.error('Failed:', error);
    await recording.stop();
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  if (!hasMouseControl()) {
    console.error('Mouse control not available.');
    process.exit(1);
  }

  const mode = process.argv[2];

  if (mode === '--teach') {
    process.stdin.setRawMode?.(false);
    await teachMode();
  } else if (mode === '--replay') {
    await replayMode();
  } else {
    console.log('Usage:');
    console.log('  node teach-and-replay.js --teach   # Click on targets to record positions');
    console.log('  node teach-and-replay.js --replay  # Replay demo with recorded positions');
  }

  process.exit(0);
}

main().catch(console.error);
