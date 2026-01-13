/**
 * Talkie Demo 1: Navigating the Interface
 *
 * Demonstrates: viewport on real Talkie window, cursor navigation, clicking sidebar items
 * Records in draft mode for quick iteration
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

async function runDemo() {
    console.log('🎬 Talkie Demo 1: Navigating the Interface\n');

    const { execSync } = await import('child_process');

    // Activate Talkie first
    execSync(`osascript -e 'tell application "Talkie" to activate'`);
    await sleep(300);

    // Set up clean stage: show backdrop, center Talkie
    console.log('🎭 Setting up clean stage...');
    await send('stage.backdrop', { show: true });  // Solid black behind everything
    await sleep(300);
    await send('stage.center', { app: 'Talkie', width: 1200, height: 800 });
    await sleep(300);

    // Get window bounds after centering
    const boundsStr = execSync(`osascript -e '
        tell application "System Events"
            tell process "Talkie"
                set w to front window
                set p to position of w
                set s to size of w
                set x to item 1 of p as integer
                set y to item 2 of p as integer
                set w2 to item 1 of s as integer
                set h to item 2 of s as integer
                return (x as text) & " " & (y as text) & " " & (w2 as text) & " " & (h as text)
            end tell
        end tell
    '`).toString().trim();
    const bounds = boundsStr.split(' ').map(Number);

    const [winX, winY, winW, winH] = bounds;
    console.log(`📐 Talkie window: ${winX},${winY} ${winW}x${winH}`);

    // Viewport with small padding
    const viewport = {
        x: winX - 10,
        y: winY - 10,
        width: winW + 20,
        height: winH + 20
    };

    // Sidebar is roughly the left 200px
    const sidebarX = winX + 100;
    const contentX = winX + winW / 2 + 100;

    // 1. Set up the stage
    console.log('📐 Setting viewport on Talkie...');
    await send('viewport.set', viewport);
    await send('viewport.show');
    await sleep(500);

    // 2. Start recording (draft mode)
    console.log('🔴 Starting draft recording...');
    await send('record.start', { mode: 'draft' });
    await sleep(300);

    // 3. Show cursor
    console.log('🖱️  Showing cursor...');
    await send('cursor.show');
    await sleep(500);

    // 4. Start at Home (first sidebar item, roughly y = 150 from top of window)
    console.log('   Clicking Home...');
    await send('cursor.moveTo', { x: sidebarX, y: winY + 120, duration: 0.4 });
    await sleep(200);
    await send('cursor.click');
    await sleep(600);

    // 5. Move to Drafts (second item)
    console.log('   Clicking Drafts...');
    await send('cursor.moveTo', { x: sidebarX, y: winY + 160, duration: 0.3 });
    await sleep(200);
    await send('cursor.click');
    await sleep(600);

    // 6. Move to All Memos
    console.log('   Clicking All Memos...');
    await send('cursor.moveTo', { x: sidebarX, y: winY + 200, duration: 0.3 });
    await sleep(200);
    await send('cursor.click');
    await sleep(600);

    // 7. Move to Workflows
    console.log('   Clicking Workflows...');
    await send('cursor.moveTo', { x: sidebarX, y: winY + 320, duration: 0.4 });
    await sleep(200);
    await send('cursor.click');
    await sleep(600);

    // 8. Move to content area to show something
    console.log('   Exploring content area...');
    await send('cursor.moveTo', { x: contentX, y: winY + 300, duration: 0.5 });
    await sleep(400);

    // 9. Click in content
    await send('cursor.click');
    await sleep(500);

    // 10. Go back to Drafts for next demo
    console.log('   Back to Drafts...');
    await send('cursor.moveTo', { x: sidebarX, y: winY + 160, duration: 0.4 });
    await sleep(200);
    await send('cursor.click');
    await sleep(400);

    // 11. Wrap up
    console.log('🎬 Wrapping up...');
    await send('cursor.hide');
    await sleep(300);

    console.log('⏹️  Stopping recording...');
    await send('record.stop');
    await sleep(200);

    await send('viewport.hide');

    // Hide backdrop
    console.log('🔄 Hiding backdrop...');
    await send('stage.backdrop', { show: false });
    await sleep(200);

    console.log('\n✅ Demo complete!');
    console.log('📹 Video saved to: ~/.vif/draft.mp4');

    ws.close();
}

ws.on('open', () => {
    runDemo().catch(err => {
        console.error('Demo error:', err);
        ws.close();
        process.exit(1);
    });
});

ws.on('error', (err) => {
    console.error('Connection error:', err.message);
    process.exit(1);
});
