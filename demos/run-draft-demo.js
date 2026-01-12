#!/usr/bin/env node
/**
 * Talkie Draft Mode Demo Runner
 */

import { execSync } from 'child_process';
import {
  executeCursorScript,
  saveCursorRecording,
  toCursorTrack,
  hasMouseControl,
} from '../dist/automation.js';
import { startRecording, getWindows } from '../dist/index.js';
import { applyCursorZoomPan } from '../dist/cursor.js';

// Get current Talkie window position (main window, not helpers)
function getTalkieWindow() {
  const windows = getWindows();
  const mainWindow = windows.find(w => w.owner === 'Talkie' && w.name === 'Talkie');
  if (!mainWindow) {
    console.error('Talkie main window not found. Please open Talkie first.');
    process.exit(1);
  }
  return mainWindow.bounds;
}

async function runDemo() {
  console.log('Talkie Draft Mode Demo');
  console.log('======================\n');

  if (!hasMouseControl()) {
    console.error('Mouse control not available.');
    process.exit(1);
  }

  const talkie = getTalkieWindow();
  console.log(`Talkie window: ${talkie.width}x${talkie.height} at (${talkie.x}, ${talkie.y})\n`);

  // UI positions as percentages of window (more reliable across sizes)
  // Sidebar is roughly 14% of width, items stacked vertically
  const pct = (xPct, yPct) => ({
    x: Math.round(talkie.x + talkie.width * xPct),
    y: Math.round(talkie.y + talkie.height * yPct),
  });

  const ui = {
    // Calibrated positions
    drafts: { x: talkie.x + 48, y: talkie.y + 115 },
    editor: { x: talkie.x + 700, y: talkie.y + 300 },
    textArea: { x: talkie.x + 700, y: talkie.y + 250 },
    micButton: { x: talkie.x + talkie.width - 45, y: talkie.y + talkie.height - 70 },
  };

  console.log('UI targets:');
  console.log(`  Drafts: (${ui.drafts.x}, ${ui.drafts.y})`);
  console.log(`  Editor: (${ui.editor.x}, ${ui.editor.y})`);
  console.log(`  Mic: (${ui.micButton.x}, ${ui.micButton.y})`);
  console.log('');

  const sampleText = "I think we should probably consider maybe looking into the possibility of potentially exploring options.";

  const script = {
    app: 'Talkie',
    actions: [
      { type: 'wait', duration: 0.5 },

      // 1. Navigate to Drafts
      { type: 'move', to: ui.drafts, duration: 0.25 },
      { type: 'zoom', level: 1.8, at: ui.drafts },
      { type: 'wait', duration: 0.3 },
      { type: 'click', at: ui.drafts },
      { type: 'wait', duration: 0.8 },

      // 2. Click in editor text area
      { type: 'move', to: ui.textArea, duration: 0.2 },
      { type: 'zoom', level: 1.4, at: ui.textArea },
      { type: 'click', at: ui.textArea },
      { type: 'wait', duration: 0.3 },

      // 3. Type wordy sample text
      { type: 'type', text: sampleText },
      { type: 'wait', duration: 1.5 },

      // 4. Move to mic button and trigger voice recording
      { type: 'move', to: ui.micButton, duration: 0.25 },
      { type: 'zoom', level: 2.0, at: ui.micButton },
      { type: 'wait', duration: 0.3 },

      // Start recording with global hotkey
      { type: 'keypress', key: 'l', modifiers: ['option', 'command'] },
      { type: 'wait', duration: 3 }, // Time to speak: "make it shorter"

      // Stop recording
      { type: 'keypress', key: 'l', modifiers: ['option', 'command'] },
      { type: 'wait', duration: 4 }, // Wait for AI to process

      // 5. Pan to show the diff view
      { type: 'move', to: ui.editor, duration: 0.3 },
      { type: 'zoom', level: 1.3, at: ui.editor },
      { type: 'wait', duration: 2 },

      // 6. Accept the changes with Cmd+Enter
      { type: 'keypress', key: '\r', modifiers: ['command'] },
      { type: 'wait', duration: 0.5 },

      // Zoom out to show final result
      { type: 'zoom', level: 1.0 },
      { type: 'wait', duration: 1.5 },
    ],
  };

  const outputDir = '/tmp/talkie-demo';
  execSync(`mkdir -p ${outputDir}`);

  const rawVideo = `${outputDir}/draft-demo-raw.mp4`;
  const finalVideo = `${outputDir}/draft-demo.mp4`;
  const cursorFile = `${outputDir}/cursor.json`;

  console.log('Starting screen recording...');
  const recording = startRecording({ output: rawVideo, audio: false });
  await new Promise(r => setTimeout(r, 1000));

  console.log('Running demo script...');
  console.log('');
  console.log('>>> WHEN YOU SEE THE MIC ACTIVATE, SAY: "make it shorter"');
  console.log('');

  try {
    const cursorRecording = await executeCursorScript(script);

    console.log('\nStopping recording...');
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
    console.error('Demo failed:', error);
    await recording.stop();
  }
}

runDemo();
