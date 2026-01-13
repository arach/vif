/**
 * Test Web Backdrop
 * Shows the gradient + renders a label via stage.render
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

ws.on('open', async () => {
    console.log('Testing web backdrop...');

    // Show backdrop
    await send('stage.backdrop', { show: true });
    await sleep(500);

    // Render a label via stage.render (goes through agent to web view)
    console.log('Rendering label...');
    await send('stage.render', {
        type: 'label',
        elementId: 'test-label',
        text: 'HELLO FROM WEB VIEW!',
        x: 100,
        y: 100,
        fontSize: 32,
        background: 'rgba(255, 50, 50, 0.95)'
    });

    await sleep(3000);

    // Hide the label
    await send('stage.render', { type: 'hide', elementId: 'test-label' });
    await sleep(500);

    // Hide backdrop
    await send('stage.backdrop', { show: false });

    console.log('Done!');
    ws.close();
});

ws.on('error', (err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
