import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:7850');

let id = 0;
const send = (action, params = {}) => {
    const msg = { id: ++id, action, ...params };
    console.log('→', action);
    ws.send(JSON.stringify(msg));
};

ws.on('open', async () => {
    console.log('Connected - showing overlays with control panel');
    console.log('The control panel should appear in the top-right corner.');
    console.log('Click the X button or press ESC to dismiss.\n');

    // Set up viewport and show overlays
    send('viewport.set', { x: 320, y: 180, width: 1280, height: 720 });

    await new Promise(r => setTimeout(r, 200));
    send('viewport.show');

    await new Promise(r => setTimeout(r, 200));
    send('cursor.show');

    console.log('\nOverlays visible. You can now:');
    console.log('  1. Click the X button in the control panel');
    console.log('  2. Press ESC to dismiss');
    console.log('\nThis test will auto-close in 15 seconds...');

    setTimeout(() => {
        console.log('\nAuto-closing...');
        send('cursor.hide');
        setTimeout(() => {
            send('viewport.hide');
            setTimeout(() => {
                ws.close();
                process.exit(0);
            }, 200);
        }, 200);
    }, 15000);
});

ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.error) {
        console.log('← Error:', msg.error);
    } else if (msg.ok !== undefined) {
        console.log('← OK (id:', msg.id + ')');
    } else if (msg.event) {
        console.log('← Event:', msg.event);
    }
});

ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    process.exit(1);
});
