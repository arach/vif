#!/usr/bin/env node
/**
 * Audio-guided Teach Mode
 * Uses system speech to tell you what to click.
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

function say(text) {
  execSync(`say -v Samantha "${text}"`, { stdio: 'pipe' });
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
  console.log('=== AUDIO-GUIDED TEACH MODE ===\n');

  execSync('osascript -e \'tell application "Talkie" to activate\'');
  await sleep(300);

  const win = getTalkieWindow();
  console.log(`Window: ${win.width}x${win.height} at (${win.x}, ${win.y})\n`);

  say("Starting teach mode. Click each target when I say now.");
  await sleep(500);

  const targets = [
    { name: 'drafts', speech: 'Click on Drafts in the sidebar' },
    { name: 'textArea', speech: 'Click in the text editor area' },
    { name: 'micButton', speech: 'Click on the mic button' },
  ];

  const coordinates = { window: win, targets: {} };

  for (const target of targets) {
    console.log(`→ ${target.speech}`);
    say(target.speech);
    await sleep(500);

    say("3");
    await sleep(1000);
    say("2");
    await sleep(1000);
    say("1");
    await sleep(1000);
    say("now");
    await sleep(300);

    const pos = getMousePosition();
    coordinates.targets[target.name] = {
      absolute: { x: pos.x, y: pos.y },
      relative: { x: pos.x - win.x, y: pos.y - win.y },
    };

    console.log(`  ✓ Captured: (${pos.x}, ${pos.y}) [+${pos.x - win.x}, +${pos.y - win.y}]\n`);
    say("Got it");
    await sleep(500);
  }

  execSync(`mkdir -p ${OUTPUT_DIR}`);
  writeFileSync(COORDINATES_FILE, JSON.stringify(coordinates, null, 2));

  console.log(`Saved to: ${COORDINATES_FILE}`);
  say("All done. Coordinates saved.");
}

teach().catch(console.error);
