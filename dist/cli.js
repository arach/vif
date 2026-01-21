#!/usr/bin/env node
/**
 * Vif CLI - Vivid screen capture for macOS
 */
import { execSync } from 'child_process';
import { screenshot, screenshotApp, screenshotFullscreen, startRecording, convertVideo, optimizeForWeb, videoToGif, activateApp, listWindows, hasFFmpeg, analyzeAudio, mixAudio, createTake, listTakes, revertTake, pruneTakes, renderStoryboardFile, renderSlide, closeBrowser, templates, renderStoryboardFileEnhanced } from './index.js';
import { printMusicRecommendations } from './music.js';
import { printVoiceOptions, generateNarration, getSystemVoices } from './voice.js';
import { printCacheInfo, clearCache } from './cache.js';
import { startCursorTracking, saveCursorTrack, applyCursorZoomPan } from './cursor.js';
import { executeDemo, saveDemoRecording, hasCursorControl, toCursorTrack } from './automation.js';
import { startServer } from './server.js';
import { runScene, SceneParser } from './dsl/index.js';
import { Recorder, recordDuration } from './recorder/index.js';
import { spawn } from 'child_process';
import WebSocket from 'ws';
/**
 * Check server/agent status
 */
async function checkServerStatus() {
    const port = 7850;
    return new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        let agentReady = false;
        const cleanup = () => {
            ws.removeAllListeners();
            ws.close();
        };
        const timeout = setTimeout(() => {
            cleanup();
            resolve({ connected: false, agentReady: false });
        }, 3000);
        ws.on('open', () => {
            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.event === 'ready') {
                        agentReady = msg.agent === true;
                        clearTimeout(timeout);
                        cleanup();
                        resolve({ connected: true, agentReady });
                    }
                }
                catch { }
            });
        });
        ws.on('error', () => {
            clearTimeout(timeout);
            cleanup();
            resolve({ connected: false, agentReady: false });
        });
    });
}
/**
 * Start the vif server in background
 */
async function startServerBackground(verbose = false) {
    const log = verbose ? console.log.bind(console) : () => { };
    // Check if already running
    const status = await checkServerStatus();
    if (status.connected && status.agentReady) {
        log('[vif] Server already running with agent');
        return;
    }
    if (status.connected) {
        log('[vif] Server running, waiting for agent...');
    }
    else {
        log('[vif] Starting server...');
        // Start server as detached background process
        const serverProcess = spawn('node', ['dist/cli.js', 'serve'], {
            cwd: process.cwd(),
            detached: true,
            stdio: 'ignore',
        });
        serverProcess.unref();
    }
    // Wait for server + agent to be ready
    const timeout = 15000;
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        await new Promise(r => setTimeout(r, 500));
        const status = await checkServerStatus();
        if (status.connected && status.agentReady) {
            log('[vif] Server ready with agent');
            return;
        }
        if (status.connected) {
            log('[vif] Waiting for agent...');
        }
    }
    // Check final status
    const finalStatus = await checkServerStatus();
    if (finalStatus.connected) {
        console.warn('[vif] Warning: Agent not ready, some features may not work');
        return;
    }
    throw new Error('Timeout waiting for server to start');
}
/**
 * Stop the vif server and agent
 */
async function stopServer(verbose = false) {
    const log = verbose ? console.log.bind(console) : () => { };
    log('[vif] Stopping server and agent...');
    // Kill any running server processes
    try {
        execSync('pkill -f "node.*dist/cli.*serve" 2>/dev/null || true', { stdio: 'ignore' });
    }
    catch { }
    // Kill the agent
    try {
        execSync('pkill -f "vif-agent" 2>/dev/null || true', { stdio: 'ignore' });
        execSync('pkill -f "Vif Agent" 2>/dev/null || true', { stdio: 'ignore' });
    }
    catch { }
    // Clean up socket
    try {
        execSync('rm -f /tmp/vif-agent.sock', { stdio: 'ignore' });
    }
    catch { }
    // Give processes time to die
    await new Promise(r => setTimeout(r, 500));
    log('[vif] Stopped');
}
const args = process.argv.slice(2);
const command = args[0];
function printHelp() {
    console.log(`
Vif - Vivid screen capture for macOS

Usage: vif <command> [options]

Capture Commands:
  windows                      List all visible windows
  shot <output.png>            Take a fullscreen screenshot
  shot --app <name> <output>   Screenshot an app window
  record <output.mp4>          Start video recording (Ctrl+C to stop)
  record --duration <s> <out>  Record for specific duration
  record-demo <output.mp4>     Record with cursor tracking for demos
  auto-demo <output.mp4>       Record + auto-apply zoom/pan effects
  scripted-demo <out.mp4>      Run scripted cursor automation demo

Processing Commands:
  convert <input> <output>     Convert/process video
  gif <input> <output.gif>     Convert video to GIF
  optimize <input> <output>    Optimize video for web
  mix <video> <audio> <out>    Add audio track to video

Scene Commands (Declarative DSL):
  play <scene.yaml>            Run scene (auto-starts/stops server)
  play --keep <scene.yaml>     Run scene, keep server running after
  play --validate <scene.yaml> Validate without running
  play --watch <scene.yaml>    Watch mode (re-run on changes)

Storyboard Commands:
  render <storyboard.yaml>     Render a storyboard to video
  analyze <audio>              Analyze audio file (duration, beats)

Slide Commands:
  slide <template> <output>    Render a slide template to PNG
  slide list                   List available templates

Audio Commands:
  music                        Show royalty-free music sources
  music browse                 Open music sites in browser
  music generate <output>      Generate ambient placeholder music
  voice                        Show available voice options
  voice list                   List system voices
  narrate <text> <output>      Generate narration audio

Cache Commands:
  cache                        Show cache info
  cache clear                  Clear the asset cache

Server Commands:
  up                           Start server + agent (if not running)
  down                         Stop server + agent
  status                       Show server/agent status
  serve                        Start server in foreground (manual mode)

Take Management:
  take new <asset> [note]      Create a new take/version
  take list <asset>            List all takes for an asset
  take revert <asset> <ver>    Revert to a specific take
  take prune <asset> --keep N  Keep only last N takes

Options:
  --app <name>       Target app by name
  --window <id>      Target window by ID
  --duration <sec>   Recording/clip duration
  --width <px>       Target width
  --fps <n>          Frame rate
  --bpm <n>          Beats per minute (for audio sync)
  --volume <0-1>     Audio volume
  --fade-in <sec>    Audio fade in
  --fade-out <sec>   Audio fade out
  --verbose, -v      Verbose output
  --keep <n>         Number of takes to keep

Examples:
  vif shot --app Safari safari.png
  vif record --duration 10 demo.mp4
  vif mix demo.mp4 music.mp3 final.mp4 --volume 0.7 --fade-out 2
  vif render storyboard.yaml --bpm 120 --verbose
  vif take new demo.mp4 "shortened intro"
  vif analyze music.mp3 --bpm 128
`);
}
function parseArgs(args) {
    const result = {};
    const positionals = [];
    let i = 0;
    while (i < args.length) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const nextArg = args[i + 1];
            if (nextArg && !nextArg.startsWith('--') && !nextArg.startsWith('-')) {
                result[key] = nextArg;
                i += 2;
            }
            else {
                result[key] = true;
                i += 1;
            }
        }
        else if (arg === '-v') {
            result['verbose'] = true;
            i += 1;
        }
        else {
            positionals.push(arg);
            i += 1;
        }
    }
    // Assign positionals
    if (positionals[0])
        result._positional = positionals[0];
    if (positionals[1])
        result._positional2 = positionals[1];
    if (positionals[2])
        result._positional3 = positionals[2];
    if (positionals[3])
        result._positional4 = positionals[3];
    return result;
}
/**
 * Parse region string "x,y,width,height" into region object
 */
function parseRegion(regionStr) {
    const parts = regionStr.split(',').map(s => parseInt(s.trim(), 10));
    if (parts.length !== 4 || parts.some(isNaN)) {
        console.error('Invalid region format. Use: x,y,width,height');
        return undefined;
    }
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}
async function main() {
    if (!command || command === 'help' || command === '--help' || command === '-h') {
        printHelp();
        process.exit(0);
    }
    const opts = parseArgs(args.slice(1));
    switch (command) {
        case 'windows':
        case 'list': {
            listWindows();
            break;
        }
        case 'shot':
        case 'screenshot': {
            const output = opts._positional || 'screenshot.png';
            if (opts.app) {
                console.log(`Capturing ${opts.app} window...`);
                const success = screenshotApp(opts.app, output, {
                    noShadow: opts['no-shadow'] !== false,
                    delay: opts.delay ? parseFloat(opts.delay) : 0
                });
                if (success) {
                    console.log(`Screenshot saved: ${output}`);
                }
                else {
                    console.error('Screenshot failed');
                    process.exit(1);
                }
            }
            else if (opts.window) {
                console.log(`Capturing window ${opts.window}...`);
                const success = screenshot({
                    output,
                    windowId: parseInt(opts.window, 10),
                    noShadow: opts['no-shadow'] !== false,
                    delay: opts.delay ? parseFloat(opts.delay) : 0
                });
                if (success) {
                    console.log(`Screenshot saved: ${output}`);
                }
                else {
                    console.error('Screenshot failed');
                    process.exit(1);
                }
            }
            else {
                console.log('Capturing fullscreen...');
                const success = screenshotFullscreen(output);
                if (success) {
                    console.log(`Screenshot saved: ${output}`);
                }
                else {
                    console.error('Screenshot failed');
                    process.exit(1);
                }
            }
            break;
        }
        case 'record':
        case 'video': {
            // Use the new recorder module for clean separation
            const output = opts._positional || 'recording.mp4';
            const region = opts.region ? parseRegion(opts.region) : undefined;
            if (opts.duration) {
                const duration = parseFloat(opts.duration);
                console.log(`Recording for ${duration} seconds...`);
                try {
                    const result = await recordDuration({
                        output,
                        duration,
                        region,
                        audio: opts.audio === true
                    });
                    console.log(`Recording saved: ${result}`);
                }
                catch (error) {
                    console.error('Recording failed:', error);
                    process.exit(1);
                }
            }
            else {
                console.log('Recording... Press Ctrl+C to stop');
                const recorder = new Recorder();
                try {
                    await recorder.start({
                        output,
                        region,
                        audio: opts.audio === true
                    });
                    process.on('SIGINT', async () => {
                        console.log('\nStopping recording...');
                        try {
                            const result = await recorder.stop();
                            console.log(`Recording saved: ${result}`);
                            process.exit(0);
                        }
                        catch (error) {
                            console.error('Failed to save recording:', error);
                            recorder.forceStop();
                            process.exit(1);
                        }
                    });
                    await new Promise(() => { });
                }
                catch (error) {
                    console.error('Recording failed:', error);
                    recorder.forceStop();
                    process.exit(1);
                }
            }
            break;
        }
        case 'record-demo': {
            const output = opts._positional || 'demo.mp4';
            const cursorOutput = output.replace(/\.[^.]+$/, '-cursor.json');
            console.log('Recording demo with cursor tracking...');
            console.log('Press Ctrl+C to stop\n');
            // Start cursor tracking
            const cursorTracker = startCursorTracking();
            // Start recording
            const recording = startRecording({
                output,
                audio: false // Demos typically don't need system audio
            });
            process.on('SIGINT', async () => {
                console.log('\nStopping recording...');
                try {
                    // Stop cursor tracking first
                    const cursorTrack = cursorTracker.stop();
                    saveCursorTrack(cursorTrack, cursorOutput);
                    console.log(`Cursor track saved: ${cursorOutput}`);
                    // Stop video recording
                    const result = await recording.stop();
                    console.log(`Recording saved: ${result}`);
                    console.log('\nUse in storyboard:');
                    console.log('  - type: recording');
                    console.log(`    source: ${output}`);
                    console.log(`    cursorTrack: ${cursorOutput}`);
                    console.log('    cursor: true');
                    console.log('    zoomPan:');
                    console.log('      enabled: true');
                    console.log('      zoom: 1.5');
                    process.exit(0);
                }
                catch (error) {
                    console.error('Failed to save:', error);
                    process.exit(1);
                }
            });
            await new Promise(() => { });
            break;
        }
        case 'auto-demo': {
            // End-to-end demo: record + track cursor + apply zoom/pan automatically
            const output = opts._positional || 'auto-demo.mp4';
            const zoom = parseFloat(opts.zoom) || 1.8;
            const rawOutput = output.replace(/\.mp4$/, '-raw.mp4');
            const cursorOutput = output.replace(/\.mp4$/, '-cursor.json');
            console.log('Auto Demo Recording');
            console.log('===================');
            console.log(`Output: ${output}`);
            console.log(`Zoom level: ${zoom}x`);
            console.log('');
            console.log('Move your mouse around to demonstrate.');
            console.log('Press Ctrl+C to stop and apply zoom effects.\n');
            // Start cursor tracking
            const cursorTracker = startCursorTracking();
            // Start recording
            const recording = startRecording({
                output: rawOutput,
                audio: false
            });
            process.on('SIGINT', async () => {
                console.log('\nStopping recording...');
                try {
                    // Stop cursor tracking
                    const cursorTrack = cursorTracker.stop();
                    saveCursorTrack(cursorTrack, cursorOutput);
                    console.log(`Tracked ${cursorTrack.positions.length} cursor positions`);
                    // Stop video recording
                    await recording.stop();
                    console.log(`Raw recording saved: ${rawOutput}`);
                    // Apply zoom/pan effect
                    console.log('\nApplying cursor-following zoom/pan...');
                    const success = applyCursorZoomPan(rawOutput, output, cursorTrack, { enabled: true, zoom }
                    // Resolution auto-detected from video
                    );
                    if (success) {
                        console.log(`\nDone! Final video: ${output}`);
                        console.log(`Cursor track: ${cursorOutput}`);
                        // Open the result
                        const { execSync } = await import('child_process');
                        execSync(`open "${output}"`);
                    }
                    else {
                        console.error('Zoom/pan effect failed, raw video available at:', rawOutput);
                    }
                    process.exit(0);
                }
                catch (error) {
                    console.error('Failed:', error);
                    process.exit(1);
                }
            });
            await new Promise(() => { });
            break;
        }
        case 'scripted-demo': {
            // Run a scripted demo with cursor automation
            const output = opts._positional || 'scripted-demo.mp4';
            const zoom = parseFloat(opts.zoom) || 1.8;
            const appName = opts.app;
            if (!hasCursorControl()) {
                console.error('Cursor control requires cliclick and accessibility permissions.');
                console.error('Install: brew install cliclick');
                console.error('Then grant accessibility permissions in System Preferences.');
                process.exit(1);
            }
            console.log('Scripted Demo Recording');
            console.log('=======================');
            console.log(`Output: ${output}`);
            if (appName)
                console.log(`App: ${appName}`);
            console.log('');
            // Build demo script
            const script = {
                app: appName,
                actions: [
                    // Example demo script - move around and click
                    { type: 'wait', duration: 1 },
                    { type: 'move', to: { x: 200, y: 200 }, duration: 0.5 },
                    { type: 'zoom', level: zoom, at: { x: 200, y: 200 } },
                    { type: 'wait', duration: 0.5 },
                    { type: 'click' },
                    { type: 'wait', duration: 0.3 },
                    { type: 'move', to: { x: 600, y: 300 }, duration: 0.8 },
                    { type: 'zoom', level: zoom, at: { x: 600, y: 300 } },
                    { type: 'wait', duration: 0.5 },
                    { type: 'click' },
                    { type: 'wait', duration: 0.3 },
                    { type: 'move', to: { x: 400, y: 500 }, duration: 0.6 },
                    { type: 'zoom', level: 1.0 }, // zoom out
                    { type: 'wait', duration: 1 },
                ],
            };
            const rawOutput = output.replace(/\.mp4$/, '-raw.mp4');
            const basePath = output.replace(/\.mp4$/, '');
            console.log('Starting screen recording...');
            // Start recording
            const recording = startRecording({
                output: rawOutput,
                audio: false,
            });
            // Small delay to ensure recording started
            await new Promise(r => setTimeout(r, 500));
            console.log('Executing demo script...');
            try {
                // Execute the demo
                const demoRecording = await executeDemo(script);
                // Save cursor track
                saveDemoRecording(demoRecording, basePath);
                console.log(`Tracked ${demoRecording.positions.length} cursor positions`);
                // Stop recording
                console.log('Stopping recording...');
                await recording.stop();
                console.log(`Raw recording saved: ${rawOutput}`);
                // Apply zoom/pan based on recorded zoom track or cursor track
                console.log('\nApplying zoom/pan effects...');
                const success = applyCursorZoomPan(rawOutput, output, toCursorTrack(demoRecording), { enabled: true, zoom });
                if (success) {
                    console.log(`\nDone! Final video: ${output}`);
                    execSync(`open "${output}"`);
                }
                else {
                    console.error('Zoom/pan effect failed');
                }
            }
            catch (error) {
                console.error('Demo execution failed:', error);
                await recording.stop();
            }
            break;
        }
        case 'convert': {
            const input = opts._positional;
            const output = opts._positional2;
            if (!input || !output) {
                console.error('Usage: vif convert <input> <output>');
                process.exit(1);
            }
            console.log(`Converting ${input} to ${output}...`);
            const success = convertVideo({
                input,
                output,
                width: opts.width ? parseInt(opts.width, 10) : undefined,
                scale: opts.scale ? parseFloat(opts.scale) : undefined,
                crf: opts.crf ? parseInt(opts.crf, 10) : undefined,
                noAudio: opts['no-audio'] === true
            });
            if (success) {
                console.log(`Converted: ${output}`);
            }
            else {
                console.error('Conversion failed');
                process.exit(1);
            }
            break;
        }
        case 'optimize': {
            const input = opts._positional;
            const output = opts._positional2;
            const width = opts.width ? parseInt(opts.width, 10) : 1280;
            if (!input || !output) {
                console.error('Usage: vif optimize <input> <output>');
                process.exit(1);
            }
            console.log(`Optimizing ${input} for web (max width: ${width}px)...`);
            const success = optimizeForWeb(input, output, width);
            if (success) {
                console.log(`Optimized: ${output}`);
            }
            else {
                console.error('Optimization failed');
                process.exit(1);
            }
            break;
        }
        case 'gif': {
            const input = opts._positional;
            const output = opts._positional2;
            if (!input || !output) {
                console.error('Usage: vif gif <input> <output.gif>');
                process.exit(1);
            }
            console.log(`Converting ${input} to GIF...`);
            const success = videoToGif(input, output, {
                width: opts.width ? parseInt(opts.width, 10) : 480,
                fps: opts.fps ? parseInt(opts.fps, 10) : 10
            });
            if (success) {
                console.log(`GIF created: ${output}`);
            }
            else {
                console.error('GIF conversion failed');
                process.exit(1);
            }
            break;
        }
        case 'mix': {
            const video = opts._positional;
            const audio = opts._positional2;
            const output = opts._positional3;
            if (!video || !audio || !output) {
                console.error('Usage: vif mix <video> <audio> <output>');
                process.exit(1);
            }
            console.log(`Mixing ${audio} into ${video}...`);
            const success = mixAudio({
                video,
                audio,
                output,
                volume: opts.volume ? parseFloat(opts.volume) : 1.0,
                fadeIn: opts['fade-in'] ? parseFloat(opts['fade-in']) : 0,
                fadeOut: opts['fade-out'] ? parseFloat(opts['fade-out']) : 0,
                loop: opts.loop === true
            });
            if (success) {
                console.log(`Mixed: ${output}`);
            }
            else {
                console.error('Mixing failed');
                process.exit(1);
            }
            break;
        }
        case 'analyze': {
            const input = opts._positional;
            if (!input) {
                console.error('Usage: vif analyze <audio-file> [--bpm N]');
                process.exit(1);
            }
            const bpm = opts.bpm ? parseInt(opts.bpm, 10) : undefined;
            const analysis = analyzeAudio(input, bpm);
            if (analysis) {
                console.log(`\nAudio Analysis: ${input}`);
                console.log('─'.repeat(40));
                console.log(`  Duration: ${analysis.duration.toFixed(2)}s`);
                console.log(`  Format: ${analysis.format}`);
                console.log(`  Sample Rate: ${analysis.sampleRate}Hz`);
                console.log(`  Channels: ${analysis.channels}`);
                if (analysis.bpm && analysis.beats) {
                    console.log(`  BPM: ${analysis.bpm}`);
                    console.log(`  Total Beats: ${analysis.beats.length}`);
                    console.log(`  First 10 beats: ${analysis.beats.slice(0, 10).map(b => b.toFixed(2)).join('s, ')}s`);
                }
                // Output JSON for piping
                if (opts.json) {
                    console.log('\nJSON:');
                    console.log(JSON.stringify(analysis, null, 2));
                }
            }
            else {
                console.error('Analysis failed');
                process.exit(1);
            }
            break;
        }
        case 'render': {
            const storyboardPath = opts._positional;
            if (!storyboardPath) {
                console.error('Usage: vif render <storyboard.yaml> [--verbose]');
                process.exit(1);
            }
            const verbose = opts.verbose === true;
            const legacy = opts.legacy === true;
            console.log(`Rendering storyboard: ${storyboardPath}`);
            let success;
            if (legacy) {
                // Use legacy renderer for simple clip concatenation
                const bpm = opts.bpm ? parseInt(opts.bpm, 10) : undefined;
                success = renderStoryboardFile(storyboardPath, { bpm, verbose });
            }
            else {
                // Use enhanced renderer with slides, screenshots, narration
                success = await renderStoryboardFileEnhanced(storyboardPath, { verbose });
            }
            if (success) {
                console.log('Render complete!');
            }
            else {
                console.error('Render failed');
                process.exit(1);
            }
            break;
        }
        case 'take': {
            const subcommand = opts._positional;
            switch (subcommand) {
                case 'new': {
                    const asset = opts._positional2;
                    const note = opts._positional3 || '';
                    if (!asset) {
                        console.error('Usage: vif take new <asset> [note]');
                        process.exit(1);
                    }
                    const take = createTake(asset, note);
                    if (take) {
                        console.log(`Created take ${take.version}: ${take.file}`);
                        if (note)
                            console.log(`  Note: ${note}`);
                    }
                    else {
                        console.error('Failed to create take');
                        process.exit(1);
                    }
                    break;
                }
                case 'list': {
                    const asset = opts._positional2;
                    if (!asset) {
                        console.error('Usage: vif take list <asset>');
                        process.exit(1);
                    }
                    const takes = listTakes(asset);
                    if (takes.length === 0) {
                        console.log('No takes found for this asset');
                    }
                    else {
                        console.log(`\nTakes for ${asset}:`);
                        console.log('─'.repeat(50));
                        for (const take of takes) {
                            const date = new Date(take.timestamp).toLocaleString();
                            console.log(`  v${take.version}: ${take.file}`);
                            console.log(`         ${date}${take.note ? ` - "${take.note}"` : ''}`);
                        }
                    }
                    break;
                }
                case 'revert': {
                    const asset = opts._positional2;
                    const version = opts._positional3 ? parseInt(opts._positional3, 10) : NaN;
                    if (!asset || isNaN(version)) {
                        console.error('Usage: vif take revert <asset> <version>');
                        process.exit(1);
                    }
                    const success = revertTake(asset, version);
                    if (success) {
                        console.log(`Reverted ${asset} to version ${version}`);
                    }
                    else {
                        console.error('Failed to revert');
                        process.exit(1);
                    }
                    break;
                }
                case 'prune': {
                    const asset = opts._positional2;
                    const keep = opts.keep ? parseInt(opts.keep, 10) : 5;
                    if (!asset) {
                        console.error('Usage: vif take prune <asset> --keep N');
                        process.exit(1);
                    }
                    const pruned = pruneTakes(asset, keep);
                    console.log(`Pruned ${pruned} old takes, keeping last ${keep}`);
                    break;
                }
                default:
                    console.error('Usage: vif take <new|list|revert|prune> ...');
                    process.exit(1);
            }
            break;
        }
        case 'activate': {
            const appName = opts._positional;
            if (!appName) {
                console.error('Usage: vif activate <app-name>');
                process.exit(1);
            }
            activateApp(appName);
            console.log(`Activated: ${appName}`);
            break;
        }
        case 'check': {
            console.log('System check:');
            console.log(`  screencapture: available (macOS built-in)`);
            console.log(`  ffmpeg: ${hasFFmpeg() ? 'available' : 'NOT FOUND (install with: brew install ffmpeg)'}`);
            break;
        }
        case 'music': {
            const subCmd = opts._positional;
            if (subCmd === 'browse') {
                const { execSync } = await import('child_process');
                console.log('\nOpening royalty-free music sources...\n');
                const sources = [
                    { name: 'Mixkit', url: 'https://mixkit.co/free-stock-music/' },
                    { name: 'Pixabay', url: 'https://pixabay.com/music/' },
                    { name: 'Uppbeat', url: 'https://uppbeat.io/browse/music' },
                ];
                for (const source of sources) {
                    console.log(`  Opening ${source.name}...`);
                    execSync(`open "${source.url}"`, { stdio: 'pipe' });
                }
                console.log('\nDownload a track, then reference it in your storyboard:');
                console.log('  music:');
                console.log('    source: ./music/your-track.mp3');
                console.log('    volume: 0.3\n');
            }
            else if (subCmd === 'generate') {
                const output = opts._positional2 || 'ambient.mp3';
                const duration = parseInt(opts.duration) || 30;
                const { execSync } = await import('child_process');
                console.log(`Generating ${duration}s ambient track...`);
                execSync(`ffmpeg -y \
          -f lavfi -i "sine=f=130.81:d=${duration}" \
          -f lavfi -i "sine=f=164.81:d=${duration}" \
          -f lavfi -i "sine=f=196:d=${duration}" \
          -f lavfi -i "sine=f=261.63:d=${duration}" \
          -filter_complex "
            [0:a]volume=0.12,tremolo=f=0.5:d=0.3[a];
            [1:a]volume=0.10,tremolo=f=0.4:d=0.2[b];
            [2:a]volume=0.08,tremolo=f=0.3:d=0.2[c];
            [3:a]volume=0.06,tremolo=f=0.6:d=0.4[d];
            [a][b][c][d]amix=inputs=4:duration=first,
            lowpass=f=2000,
            afade=t=in:d=3,
            afade=t=out:st=${duration - 4}:d=4[out]" \
          -map "[out]" -c:a libmp3lame -b:a 192k "${output}"`, { stdio: 'pipe' });
                console.log(`Generated: ${output}`);
            }
            else {
                printMusicRecommendations(subCmd);
            }
            break;
        }
        case 'cache': {
            const subCmd = opts._positional;
            if (subCmd === 'clear') {
                clearCache();
                console.log('Cache cleared.');
            }
            else {
                printCacheInfo();
            }
            break;
        }
        case 'voice': {
            const subCmd = opts._positional;
            if (subCmd === 'list') {
                const voices = getSystemVoices();
                console.log('\nAvailable system voices:');
                console.log('─'.repeat(40));
                for (const voice of voices) {
                    console.log(`  ${voice}`);
                }
                console.log(`\nTotal: ${voices.length} voices`);
            }
            else {
                printVoiceOptions();
            }
            break;
        }
        case 'narrate': {
            const text = opts._positional;
            const output = opts._positional2 || 'narration.mp3';
            if (!text) {
                console.error('Usage: vif narrate "text to speak" output.mp3 [--voice NAME]');
                process.exit(1);
            }
            const voice = opts.voice;
            const provider = opts.provider || 'system';
            console.log(`Generating narration...`);
            const success = await generateNarration(text, output, {
                provider: provider,
                voice,
            });
            if (success) {
                console.log(`Narration saved: ${output}`);
            }
            else {
                console.error('Narration failed');
                process.exit(1);
            }
            break;
        }
        case 'up': {
            // Start server + agent in background
            const verbose = opts.verbose === true || opts.v === true;
            try {
                await startServerBackground(verbose);
                const status = await checkServerStatus();
                console.log('✓ vif server running');
                console.log(`  Server: ${status.connected ? 'connected' : 'disconnected'}`);
                console.log(`  Agent:  ${status.agentReady ? 'ready' : 'not ready'}`);
            }
            catch (err) {
                console.error(`Error: ${err.message}`);
                process.exit(1);
            }
            break;
        }
        case 'down': {
            // Stop server + agent
            const verbose = opts.verbose === true || opts.v === true;
            await stopServer(verbose);
            console.log('✓ vif server stopped');
            break;
        }
        case 'status': {
            // Show current status
            const status = await checkServerStatus();
            if (status.connected) {
                console.log('✓ vif server running');
                console.log(`  Agent: ${status.agentReady ? 'ready' : 'not ready'}`);
            }
            else {
                console.log('○ vif server not running');
            }
            break;
        }
        case 'serve': {
            const port = opts.port ? parseInt(opts.port, 10) : 7850;
            const verbose = opts.verbose === true || opts.v === true;
            console.log('vif automation server (foreground mode)');
            console.log('========================================');
            console.log(`Protocol: WebSocket JSON-RPC`);
            console.log(`Endpoint: ws://localhost:${port}`);
            console.log('');
            try {
                const server = await startServer({ port, verbose: true });
                console.log('Ready for connections.');
                console.log('');
                console.log('Commands:');
                console.log('  {"action": "move", "x": 500, "y": 300, "duration": 0.3}');
                console.log('  {"action": "click", "x": 500, "y": 300}');
                console.log('  {"action": "click"}  // at current position');
                console.log('  {"action": "type", "text": "hello"}');
                console.log('  {"action": "key", "key": "enter", "modifiers": ["cmd"]}');
                console.log('  {"action": "position"}  // get cursor position');
                console.log('');
                console.log('Press Ctrl+C to stop.\n');
                // Keep running until interrupted
                process.on('SIGINT', async () => {
                    console.log('\nShutting down...');
                    await server.stop();
                    process.exit(0);
                });
                await new Promise(() => { }); // Keep alive
            }
            catch (err) {
                console.error('Failed to start server:', err);
                process.exit(1);
            }
            break;
        }
        case 'play': {
            const sceneFile = opts._positional;
            if (!sceneFile) {
                console.error('Usage: vif play <scene.yaml> [--verbose] [--validate] [--watch] [--keep]');
                process.exit(1);
            }
            const verbose = opts.verbose === true || opts.v === true;
            const validate = opts.validate === true;
            const watch = opts.watch === true;
            const keep = opts.keep === true; // Keep server running after demo
            if (validate) {
                // Validate only - parse and report (no server needed)
                console.log(`Validating: ${sceneFile}`);
                try {
                    const parser = new SceneParser();
                    const scene = parser.parseFile(sceneFile);
                    console.log(`✓ Valid scene: "${scene.scene.name}"`);
                    console.log(`  Actions: ${scene.sequence.length}`);
                    console.log(`  Views: ${scene.views.size}`);
                    console.log(`  Labels: ${scene.labels.size}`);
                }
                catch (err) {
                    console.error(`✗ Invalid: ${err.message}`);
                    process.exit(1);
                }
                break;
            }
            if (watch) {
                // Watch mode - keeps server running (implied --keep)
                const { watch: watchFile } = await import('fs');
                await startServerBackground(verbose);
                console.log(`Watching: ${sceneFile}`);
                console.log('Press Ctrl+C to stop.\n');
                const runOnce = async () => {
                    try {
                        await runScene(sceneFile, { verbose });
                    }
                    catch (err) {
                        console.error(`Error: ${err.message}`);
                    }
                };
                // Clean up on exit
                process.on('SIGINT', async () => {
                    console.log('\n[vif] Stopping...');
                    await stopServer(verbose);
                    process.exit(0);
                });
                // Initial run
                await runOnce();
                // Watch for changes
                watchFile(sceneFile, async (eventType) => {
                    if (eventType === 'change') {
                        console.log('\n--- File changed, re-running ---\n');
                        await runOnce();
                    }
                });
                await new Promise(() => { }); // Keep alive
                break;
            }
            // Normal run - start clean, run, clean up (unless --keep)
            let exitCode = 0;
            try {
                await startServerBackground(verbose);
                await runScene(sceneFile, { verbose });
            }
            catch (err) {
                console.error(`Error: ${err.message}`);
                exitCode = 1;
            }
            finally {
                if (!keep) {
                    await stopServer(verbose);
                }
            }
            process.exit(exitCode);
        }
        case 'slide': {
            const templateOrSubcmd = opts._positional;
            if (!templateOrSubcmd || templateOrSubcmd === 'list') {
                console.log('\nAvailable slide templates:');
                console.log('─'.repeat(40));
                for (const name of Object.keys(templates)) {
                    console.log(`  ${name}`);
                }
                console.log('\nUsage: vif slide <template> <output.png> --title "..." [options]');
                console.log('\nCommon options:');
                console.log('  --title        Main title text');
                console.log('  --subtitle     Subtitle text');
                console.log('  --width        Width in pixels (default: 1920)');
                console.log('  --height       Height in pixels (default: 1080)');
                console.log('  --background   CSS background value');
                console.log('\nExamples:');
                console.log('  vif slide title-card intro.png --title "Hello World" --subtitle "Welcome"');
                console.log('  vif slide outro cta.png --cta "Get Started" --url "example.com"');
                break;
            }
            const template = templateOrSubcmd;
            const output = opts._positional2;
            if (!output) {
                console.error('Usage: vif slide <template> <output.png> --title "..." [options]');
                process.exit(1);
            }
            if (!templates[template]) {
                console.error(`Unknown template: ${template}`);
                console.error(`Available: ${Object.keys(templates).join(', ')}`);
                process.exit(1);
            }
            // Build props from CLI options
            const props = {};
            for (const [key, value] of Object.entries(opts)) {
                if (!key.startsWith('_') && typeof value === 'string') {
                    props[key] = value;
                }
            }
            console.log(`Rendering ${template} to ${output}...`);
            try {
                await renderSlide({
                    template,
                    props: props,
                    output,
                    width: opts.width ? parseInt(opts.width, 10) : 1920,
                    height: opts.height ? parseInt(opts.height, 10) : 1080
                });
                await closeBrowser();
                console.log(`Slide saved: ${output}`);
            }
            catch (error) {
                console.error('Failed to render slide:', error);
                process.exit(1);
            }
            break;
        }
        default:
            console.error(`Unknown command: ${command}`);
            printHelp();
            process.exit(1);
    }
}
main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map