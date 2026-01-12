/**
 * Test recording functionality
 *
 * Tests draft mode recording which:
 * - Records the viewport region
 * - Saves to ~/.vif/draft.mp4 (overwrites previous)
 * - Uses fast encoding for quick iteration
 */

import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:7850');

function send(msg) {
  console.log('→', JSON.stringify(msg));
  ws.send(JSON.stringify(msg));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

ws.on('open', async () => {
  console.log('Connected to vif server\n');
  await sleep(500);

  // Step 1: Set viewport for recording region
  console.log('--- Step 1: Set viewport (1280x720 centered) ---');
  send({ id: 1, action: 'viewport.set', x: 320, y: 180, width: 1280, height: 720 });
  await sleep(300);

  send({ id: 2, action: 'viewport.show' });
  await sleep(500);

  // Step 2: Start draft recording
  console.log('\n--- Step 2: Start draft recording ---');
  send({ id: 3, action: 'record.start', mode: 'draft' });
  await sleep(500);

  // Step 3: Perform some demo actions
  console.log('\n--- Step 3: Demo actions ---');
  send({ id: 4, action: 'cursor.show' });
  await sleep(300);

  // Move around the viewport
  send({ id: 5, action: 'cursor.moveTo', x: 500, y: 400, duration: 0.5 });
  await sleep(700);

  send({ id: 6, action: 'cursor.click' });
  await sleep(300);

  send({ id: 7, action: 'cursor.moveTo', x: 1200, y: 400, duration: 0.5 });
  await sleep(700);

  send({ id: 8, action: 'cursor.moveTo', x: 1200, y: 700, duration: 0.3 });
  await sleep(500);

  send({ id: 9, action: 'cursor.moveTo', x: 500, y: 700, duration: 0.3 });
  await sleep(500);

  send({ id: 10, action: 'cursor.moveTo', x: 850, y: 550, duration: 0.4 });
  await sleep(600);

  send({ id: 11, action: 'cursor.click' });
  await sleep(300);

  // Step 4: Stop recording
  console.log('\n--- Step 4: Stop recording ---');
  send({ id: 12, action: 'record.stop' });
  await sleep(500);

  // Step 5: Clean up
  console.log('\n--- Step 5: Clean up ---');
  send({ id: 13, action: 'cursor.hide' });
  await sleep(200);

  send({ id: 14, action: 'viewport.hide' });
  await sleep(300);

  console.log('\nRecording test complete!');
  console.log('Check ~/.vif/draft.mp4 for the recording\n');

  ws.close();
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('←', msg);

  // Highlight important responses
  if (msg.path && msg.sizeMB !== undefined) {
    console.log(`\n  📹 Recording saved: ${msg.path}`);
    console.log(`  📦 File size: ${msg.sizeMB.toFixed(2)} MB\n`);
  }
});

ws.on('error', (err) => {
  console.error('Error:', err.message);
});

ws.on('close', () => {
  console.log('Disconnected');
  process.exit(0);
});
