#!/usr/bin/env npx ts-node
/**
 * Talkie Draft Mode Demo
 *
 * Demonstrates the AI-powered quick edit feature:
 * 1. Navigate to Drafts section
 * 2. Type initial text
 * 3. Use voice command to refine
 * 4. Show diff view
 * 5. Accept changes
 */

import { execSync } from 'child_process';
import {
  executeCursorScript,
  saveCursorRecording,
  toCursorTrack,
  CursorScript,
  hasMouseControl,
} from '../dist/automation.js';
import { startRecording } from '../dist/index.js';
import { applyCursorZoomPan } from '../dist/cursor.js';

// Talkie window bounds (will be updated dynamically)
const TALKIE = {
  x: 135,
  y: 87,
  width: 1405,
  height: 957,
};

// Estimated UI positions relative to window
const UI = {
  // Sidebar "Drafts" link - left side, roughly 1/3 down
  draftsLink: { x: TALKIE.x + 100, y: TALKIE.y + 300 },
  // Text editor area - center of window
  editor: { x: TALKIE.x + 700, y: TALKIE.y + 400 },
  // Voice command button - bottom of editor
  voiceButton: { x: TALKIE.x + 700, y: TALKIE.y + 700 },
};

const SAMPLE_TEXT = "I think we should probably consider maybe looking into the possibility of potentially exploring some options for improving our workflow processes in the near future.";

const demoScript: CursorScript = {
  app: 'Talkie',
  actions: [
    // Setup
    { type: 'wait', duration: 1 },

    // 1. Navigate to Drafts section
    { type: 'zoom', level: 1.0 },
    { type: 'move', to: UI.draftsLink, duration: 0.3 },
    { type: 'wait', duration: 0.3 },
    { type: 'zoom', level: 1.5, at: UI.draftsLink },
    { type: 'click', at: UI.draftsLink },
    { type: 'wait', duration: 0.5 },

    // 2. Move to editor and type text
    { type: 'move', to: UI.editor, duration: 0.3 },
    { type: 'zoom', level: 1.3, at: UI.editor },
    { type: 'click', at: UI.editor },
    { type: 'wait', duration: 0.3 },
    { type: 'type', text: SAMPLE_TEXT },
    { type: 'wait', duration: 1 },

    // 3. Trigger voice command for refinement
    { type: 'move', to: UI.voiceButton, duration: 0.2 },
    { type: 'zoom', level: 1.8, at: UI.voiceButton },
    { type: 'wait', duration: 0.3 },
    // Use hotkey to start recording
    { type: 'keypress', key: 'l', modifiers: ['option', 'command'] },
    { type: 'wait', duration: 2 }, // Time to speak "make it shorter"
    // Stop recording
    { type: 'keypress', key: 'l', modifiers: ['option', 'command'] },
    { type: 'wait', duration: 2 }, // Wait for AI processing

    // 4. Show the diff view
    { type: 'move', to: { x: TALKIE.x + 500, y: TALKIE.y + 400 }, duration: 0.3 },
    { type: 'zoom', level: 1.2 },
    { type: 'wait', duration: 1.5 },

    // 5. Accept changes with Cmd+Enter
    { type: 'keypress', key: '\r', modifiers: ['command'] },
    { type: 'wait', duration: 0.5 },
    { type: 'zoom', level: 1.0 },
    { type: 'wait', duration: 1 },
  ],
};

async function runDemo() {
  console.log('Talkie Draft Mode Demo');
  console.log('======================\n');

  if (!hasMouseControl()) {
    console.error('Mouse control not available. Run: npm run build');
    process.exit(1);
  }

  const outputDir = '/tmp/talkie-demo';
  execSync(`mkdir -p ${outputDir}`);

  const rawVideo = `${outputDir}/draft-demo-raw.mp4`;
  const finalVideo = `${outputDir}/draft-demo.mp4`;
  const cursorFile = `${outputDir}/draft-demo-cursor.json`;

  console.log('Starting screen recording...');
  const recording = startRecording({ output: rawVideo, audio: false });

  // Wait for recording to start
  await new Promise(r => setTimeout(r, 1000));

  console.log('Executing demo script...');
  console.log('  - Will navigate to Drafts');
  console.log('  - Type sample text');
  console.log('  - Trigger voice refinement');
  console.log('  - Show diff and accept\n');

  try {
    const cursorRecording = await executeCursorScript(demoScript);

    // Stop recording
    console.log('Stopping recording...');
    await recording.stop();

    // Save cursor track
    saveCursorRecording(cursorRecording, cursorFile);
    console.log(`Cursor track: ${cursorFile}`);
    console.log(`Raw video: ${rawVideo}`);

    // Apply zoom/pan effects
    console.log('\nApplying zoom/pan effects...');
    const success = applyCursorZoomPan(
      rawVideo,
      finalVideo,
      toCursorTrack(cursorRecording),
      { enabled: true, zoom: 1.5 }
    );

    if (success) {
      console.log(`\nDone! Final video: ${finalVideo}`);
      execSync(`open "${finalVideo}"`);
    } else {
      console.log('Zoom/pan failed, opening raw video...');
      execSync(`open "${rawVideo}"`);
    }

  } catch (error) {
    console.error('Demo failed:', error);
    await recording.stop();
  }
}

runDemo();
