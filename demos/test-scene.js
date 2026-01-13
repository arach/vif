/**
 * Standard Test Scene
 *
 * A simple 3-second test for dogfooding vif features.
 * Run this whenever you need to verify the system works.
 *
 * Tests: backdrop, viewport, label, cursor, recording
 */
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:7850');

let id = 0;
const send = (action, params = {}) => {
    return new Promise((resolve) => {
        const msgId = ++id;
        const handler = (data) => {
            const msg = JSON.parse(data);
            if (msg.id === msgId) {
                ws.off('message', handler);
                resolve(msg);
            }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id: msgId, action, ...params }));
    });
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
    // Fixed viewport in center of screen
    const viewport = { x: 400, y: 200, width: 800, height: 500 };

    // Setup
    await send('stage.backdrop', { show: true });
    await send('label.show', { text: 'Test Scene - Label Visible Here', position: 'top' });
    await sleep(1000);  // Let user see the label
    await send('viewport.set', viewport);
    await send('viewport.show');
    await sleep(300);

    // Record 3 seconds
    await send('record.start', { mode: 'draft' });
    await send('cursor.show');

    // Simple cursor movement across viewport
    await send('cursor.moveTo', { x: 500, y: 350, duration: 0.3 });
    await sleep(400);
    await send('cursor.moveTo', { x: 900, y: 350, duration: 0.5 });
    await sleep(400);
    await send('cursor.click');
    await sleep(300);
    await send('cursor.moveTo', { x: 700, y: 500, duration: 0.4 });
    await sleep(400);
    await send('cursor.click');
    await sleep(300);

    // Cleanup
    await send('cursor.hide');
    const result = await send('record.stop');
    await send('label.hide');
    await send('viewport.hide');
    await send('stage.backdrop', { show: false });

    console.log(`✓ Test complete: ${result.path} (${result.sizeMB?.toFixed(1)}MB)`);
    ws.close();
}

ws.on('open', () => run().catch(e => { console.error(e); ws.close(); process.exit(1); }));
ws.on('error', (e) => { console.error('Server not running:', e.message); process.exit(1); });
