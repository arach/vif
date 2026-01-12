/**
 * Test viewport mask functionality
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
  console.log('Connected to vif server');
  await sleep(500);

  // Test 1: Set viewport by coordinates and show mask
  console.log('\n--- Test 1: Viewport by coordinates ---');
  send({ id: 1, action: 'viewport.set', x: 200, y: 150, width: 1280, height: 720 });
  await sleep(300);

  send({ id: 2, action: 'viewport.show' });
  await sleep(2000);

  // Test 2: Move cursor within viewport
  console.log('\n--- Test 2: Cursor within viewport ---');
  send({ id: 3, action: 'cursor.show' });
  await sleep(300);

  send({ id: 4, action: 'cursor.moveTo', x: 840, y: 510, duration: 0.5 });
  await sleep(700);

  send({ id: 5, action: 'cursor.click' });
  await sleep(300);

  // Test 3: Set viewport to app window (Talkie or Finder as fallback)
  console.log('\n--- Test 3: Viewport by app name ---');
  send({ id: 6, action: 'viewport.set', app: 'Talkie' });
  await sleep(2000);

  // Test 4: Hide viewport
  console.log('\n--- Test 4: Hide viewport ---');
  send({ id: 7, action: 'viewport.hide' });
  await sleep(500);

  send({ id: 8, action: 'cursor.hide' });
  await sleep(300);

  console.log('\nViewport test complete');
  ws.close();
});

ws.on('message', (data) => {
  console.log('←', JSON.parse(data.toString()));
});

ws.on('error', (err) => {
  console.error('Error:', err.message);
});

ws.on('close', () => {
  console.log('Disconnected');
  process.exit(0);
});
