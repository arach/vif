/**
 * Talkie Demo 2: Using Drafts with AI Revision
 *
 * Demonstrates: Drafts editor, typing animation, keyboard shortcuts for AI features
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
    console.log('🎬 Talkie Demo 2: Using Drafts with AI Revision\n');

    // Get Talkie window bounds dynamically
    const { execSync } = await import('child_process');

    // Activate Talkie first
    execSync(`osascript -e 'tell application "Talkie" to activate'`);
    await sleep(500);

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

    // UI regions
    const sidebarX = winX + 100;
    const editorX = winX + 400;  // Drafts editor area
    const editorY = winY + 300;  // Text input area

    // 1. Set up the stage
    console.log('📐 Setting viewport on Talkie...');
    await send('viewport.set', viewport);
    await send('viewport.show');
    await sleep(500);

    // 2. Start recording (draft mode)
    console.log('🔴 Starting draft recording...');
    await send('record.start', { mode: 'draft' });
    await sleep(300);

    // 3. Show cursor and navigate to Drafts
    console.log('🖱️  Showing cursor...');
    await send('cursor.show');
    await sleep(400);

    console.log('   Clicking Drafts in sidebar...');
    await send('cursor.moveTo', { x: sidebarX, y: winY + 160, duration: 0.4 });
    await sleep(200);
    await send('cursor.click');
    await sleep(600);

    // 4. Move to the editor area and click to focus
    console.log('   Clicking in editor...');
    await send('cursor.moveTo', { x: editorX, y: editorY, duration: 0.4 });
    await sleep(200);
    await send('cursor.click');
    await sleep(400);

    // 5. Show typing animation
    console.log('⌨️  Typing in Drafts...');
    await send('typer.type', {
        text: 'Meeting notes from today:\n- Reviewed Q4 roadmap\n- Discussed vif integration\n- Action items pending',
        style: 'terminal',
        speed: 40
    });
    await sleep(3500);

    // 6. Hide typer after typing finishes
    await send('typer.hide');
    await sleep(300);

    // 7. Show keyboard shortcut for Select All
    console.log('   Showing Cmd+A shortcut...');
    await send('keys.show', { keys: ['cmd', 'a'] });
    await sleep(800);
    await send('keys.press', { keys: ['cmd', 'a'] });
    await sleep(400);
    await send('keys.hide');
    await sleep(300);

    // 8. Move to AI revision button area (top toolbar)
    console.log('   Moving to AI toolbar...');
    await send('cursor.moveTo', { x: winX + winW - 150, y: winY + 100, duration: 0.4 });
    await sleep(300);

    // 9. Click AI action
    console.log('   Clicking AI action...');
    await send('cursor.click');
    await sleep(800);

    // 10. Show voice command hint
    console.log('   Showing voice command hint...');
    await send('typer.type', {
        text: '"Make this more professional"',
        style: 'chat',
        speed: 60
    });
    await sleep(2000);
    await send('typer.hide');
    await sleep(500);

    // 11. Move to content to show result
    console.log('   Viewing result...');
    await send('cursor.moveTo', { x: editorX, y: editorY + 100, duration: 0.4 });
    await sleep(600);

    // 12. Wrap up
    console.log('🎬 Wrapping up...');
    await send('cursor.hide');
    await sleep(300);

    console.log('⏹️  Stopping recording...');
    await send('record.stop');
    await sleep(200);

    await send('viewport.hide');

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
