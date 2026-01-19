/**
 * Vif - Vivid screen capture for macOS
 * Screenshots, video, and GIFs.
 */
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { tmpdir } from 'os';
import YAML from 'yaml';
// ============================================================================
// Window Discovery
// ============================================================================
const SWIFT_GET_WINDOWS = `
import Cocoa
import CoreGraphics
import Foundation

struct WindowBounds: Codable {
    let x: Int
    let y: Int
    let width: Int
    let height: Int
}

struct WindowData: Codable {
    let id: Int
    let owner: String
    let name: String
    let bounds: WindowBounds
}

let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []

var windows: [WindowData] = []

for window in windowList {
    let ownerName = window[kCGWindowOwnerName as String] as? String ?? ""
    let windowID = window[kCGWindowNumber as String] as? Int ?? 0
    let windowName = window[kCGWindowName as String] as? String ?? ""
    let rawBounds = window[kCGWindowBounds as String] as? [String: Any] ?? [:]

    let bounds = WindowBounds(
        x: rawBounds["X"] as? Int ?? 0,
        y: rawBounds["Y"] as? Int ?? 0,
        width: rawBounds["Width"] as? Int ?? 0,
        height: rawBounds["Height"] as? Int ?? 0
    )

    // Skip tiny windows (menubar items, etc)
    if bounds.width < 50 || bounds.height < 50 {
        continue
    }

    windows.append(WindowData(id: windowID, owner: ownerName, name: windowName, bounds: bounds))
}

let encoder = JSONEncoder()
encoder.outputFormatting = .prettyPrinted
if let jsonData = try? encoder.encode(windows),
   let jsonString = String(data: jsonData, encoding: .utf8) {
    print(jsonString)
}
`;
/**
 * Get all visible windows on screen
 * @param appName Optional filter by application name
 */
export function getWindows(appName) {
    const scriptPath = join(tmpdir(), 'vif-get-windows.swift');
    writeFileSync(scriptPath, SWIFT_GET_WINDOWS);
    try {
        const output = execSync(`swift ${scriptPath}`, { encoding: 'utf-8', timeout: 10000 });
        const windows = JSON.parse(output);
        if (appName) {
            return windows.filter(w => w.owner.toLowerCase().includes(appName.toLowerCase()) ||
                w.name.toLowerCase().includes(appName.toLowerCase()));
        }
        return windows;
    }
    catch (error) {
        console.error('Failed to get windows:', error);
        return [];
    }
}
/**
 * Find a window by app name
 * Returns the first matching window
 */
export function findWindow(appName) {
    const windows = getWindows(appName);
    return windows.length > 0 ? windows[0] : null;
}
/**
 * Activate (bring to front) an application
 */
export function activateApp(appName) {
    try {
        execSync(`osascript -e 'tell application "${appName}" to activate'`, { timeout: 5000 });
        // Small delay to let the app come to front
        execSync('sleep 0.3');
    }
    catch {
        // App might not support AppleScript, continue anyway
    }
}
// ============================================================================
// Screenshot Capture
// ============================================================================
/**
 * Capture a screenshot
 */
export function screenshot(options) {
    const { output, windowId, region, noShadow = true, cursor = false, delay = 0 } = options;
    // Ensure output directory exists
    const dir = dirname(output);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const args = [];
    // Options
    if (noShadow)
        args.push('-o');
    args.push('-x'); // Silent (no screenshot sound)
    if (cursor)
        args.push('-C');
    if (delay > 0)
        args.push('-T', String(delay));
    // Capture mode
    if (windowId) {
        args.push('-l', String(windowId));
    }
    else if (region) {
        args.push('-R', `${region.x},${region.y},${region.width},${region.height}`);
    }
    args.push(output);
    try {
        execSync(`screencapture ${args.join(' ')}`, { timeout: 30000 });
        return existsSync(output);
    }
    catch (error) {
        console.error('Screenshot failed:', error);
        return false;
    }
}
/**
 * Capture a window by app name
 */
export function screenshotApp(appName, output, options) {
    activateApp(appName);
    // Small delay after activation
    execSync('sleep 0.5');
    const window = findWindow(appName);
    if (!window) {
        console.error(`No window found for app: ${appName}`);
        return false;
    }
    return screenshot({
        output,
        windowId: window.id,
        ...options
    });
}
/**
 * Capture the entire screen
 */
export function screenshotFullscreen(output) {
    return screenshot({ output });
}
// ============================================================================
// Video Capture
// ============================================================================
/**
 * Start video recording
 * Returns a handle to stop the recording
 */
export function startRecording(options) {
    const { output, fps = 30, region, audio = false, showClicks = false } = options;
    // Ensure output directory exists
    const dir = dirname(output);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    // Use screencapture -v for video
    const args = ['-v'];
    if (showClicks)
        args.push('-k');
    if (!audio)
        args.push('-x'); // No audio
    if (region) {
        args.push('-R', `${region.x},${region.y},${region.width},${region.height}`);
    }
    args.push(output);
    const proc = spawn('screencapture', args, {
        stdio: 'pipe',
        detached: false
    });
    return {
        process: proc,
        stop: () => {
            return new Promise((resolve, reject) => {
                // Send Ctrl+C to stop recording
                proc.kill('SIGINT');
                proc.on('close', () => {
                    if (existsSync(output)) {
                        resolve(output);
                    }
                    else {
                        reject(new Error('Video file not created'));
                    }
                });
                proc.on('error', reject);
                // Fallback timeout
                setTimeout(() => {
                    if (existsSync(output)) {
                        resolve(output);
                    }
                }, 2000);
            });
        }
    };
}
/**
 * Record video for a specific duration
 */
export async function recordVideo(options) {
    const recording = startRecording(options);
    await new Promise(resolve => setTimeout(resolve, options.duration * 1000));
    return recording.stop();
}
// ============================================================================
// Video Processing (requires ffmpeg)
// ============================================================================
/**
 * Check if ffmpeg is available
 */
export function hasFFmpeg() {
    try {
        execSync('which ffmpeg', { stdio: 'ignore' });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Convert/process video using ffmpeg
 */
export function convertVideo(options) {
    const { input, output, scale, width, height, crf = 23, startTime, endTime, duration, noAudio = false } = options;
    if (!hasFFmpeg()) {
        console.error('ffmpeg not found. Install with: brew install ffmpeg');
        return false;
    }
    if (!existsSync(input)) {
        console.error(`Input file not found: ${input}`);
        return false;
    }
    // Ensure output directory exists
    const dir = dirname(output);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const args = ['-y', '-i', input];
    // Time options
    if (startTime !== undefined)
        args.push('-ss', String(startTime));
    if (endTime !== undefined)
        args.push('-to', String(endTime));
    if (duration !== undefined)
        args.push('-t', String(duration));
    // Video filters
    const filters = [];
    if (scale)
        filters.push(`scale=iw*${scale}:ih*${scale}`);
    else if (width)
        filters.push(`scale=${width}:-2`);
    else if (height)
        filters.push(`scale=-2:${height}`);
    if (filters.length > 0) {
        args.push('-vf', filters.join(','));
    }
    // Output options
    args.push('-c:v', 'libx264', '-crf', String(crf), '-preset', 'medium');
    if (noAudio) {
        args.push('-an');
    }
    else {
        args.push('-c:a', 'aac', '-b:a', '128k');
    }
    args.push(output);
    try {
        execSync(`ffmpeg ${args.map(a => `"${a}"`).join(' ')}`, {
            stdio: 'pipe',
            timeout: 300000
        });
        return existsSync(output);
    }
    catch (error) {
        console.error('Video conversion failed:', error);
        return false;
    }
}
/**
 * Create an optimized web-ready MP4 from a video
 */
export function optimizeForWeb(input, output, maxWidth = 1280) {
    return convertVideo({
        input,
        output,
        width: maxWidth,
        crf: 23,
        noAudio: true
    });
}
/**
 * Create a GIF from a video
 */
export function videoToGif(input, output, options) {
    const { width = 480, fps = 10 } = options || {};
    if (!hasFFmpeg()) {
        console.error('ffmpeg not found. Install with: brew install ffmpeg');
        return false;
    }
    const palettePath = join(tmpdir(), `vif-palette-${Date.now()}.png`);
    try {
        // Generate palette for better colors
        execSync(`ffmpeg -y -i "${input}" -vf "fps=${fps},scale=${width}:-1:flags=lanczos,palettegen" "${palettePath}"`, {
            stdio: 'pipe',
            timeout: 60000
        });
        // Create GIF using palette
        execSync(`ffmpeg -y -i "${input}" -i "${palettePath}" -lavfi "fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse" "${output}"`, {
            stdio: 'pipe',
            timeout: 120000
        });
        // Clean up palette
        unlinkSync(palettePath);
        return existsSync(output);
    }
    catch (error) {
        console.error('GIF conversion failed:', error);
        return false;
    }
}
// ============================================================================
// Mouse Simulation (for UI automation)
// ============================================================================
/**
 * Click at a screen position
 * Uses AppleScript CGEvent for click simulation
 */
export function click(x, y) {
    const script = `
    tell application "System Events"
      click at {${x}, ${y}}
    end tell
  `;
    try {
        execSync(`osascript -e '${script}'`, { timeout: 5000 });
    }
    catch {
        // System Events might not have accessibility permissions
        // Fall back to cliclick if available
        try {
            execSync(`cliclick c:${x},${y}`, { timeout: 5000 });
        }
        catch {
            console.warn('Click simulation requires accessibility permissions or cliclick tool');
        }
    }
}
/**
 * Move mouse to position
 */
export function moveMouse(x, y) {
    try {
        execSync(`cliclick m:${x},${y}`, { timeout: 5000 });
    }
    catch {
        console.warn('Mouse movement requires cliclick tool: brew install cliclick');
    }
}
// ============================================================================
// Convenience Functions
// ============================================================================
/**
 * Quick screenshot with auto-generated filename
 */
export function quickShot(prefix = 'shot') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${prefix}-${timestamp}.png`;
    const output = join(process.cwd(), filename);
    screenshot({ output });
    return output;
}
/**
 * List all app windows (useful for debugging)
 */
export function listWindows() {
    const windows = getWindows();
    console.log('\nVisible Windows:');
    console.log('================');
    for (const w of windows) {
        console.log(`[${w.id}] ${w.owner} - "${w.name}" (${w.bounds.width}x${w.bounds.height} at ${w.bounds.x},${w.bounds.y})`);
    }
}
// ============================================================================
// Audio Analysis
// ============================================================================
/**
 * Analyze an audio file
 * Returns duration, format, and optionally beat timestamps if BPM is provided
 */
export function analyzeAudio(input, bpm) {
    if (!existsSync(input)) {
        console.error(`File not found: ${input}`);
        return null;
    }
    try {
        // Use ffprobe to get audio info
        const probeResult = execSync(`ffprobe -v quiet -print_format json -show_format -show_streams "${input}"`, { encoding: 'utf-8', timeout: 30000 });
        const probe = JSON.parse(probeResult);
        const audioStream = probe.streams?.find((s) => s.codec_type === 'audio');
        if (!audioStream && !probe.format) {
            console.error('No audio data found in file');
            return null;
        }
        const duration = parseFloat(probe.format?.duration || audioStream?.duration || '0');
        const sampleRate = parseInt(audioStream?.sample_rate || '44100', 10);
        const channels = parseInt(audioStream?.channels || '2', 10);
        const format = probe.format?.format_name || 'unknown';
        const analysis = {
            duration,
            sampleRate,
            channels,
            format
        };
        // Calculate beats if BPM provided
        if (bpm && bpm > 0) {
            analysis.bpm = bpm;
            analysis.beats = [];
            const beatInterval = 60 / bpm;
            let time = 0;
            while (time < duration) {
                analysis.beats.push(Math.round(time * 1000) / 1000); // Round to ms
                time += beatInterval;
            }
        }
        return analysis;
    }
    catch (error) {
        console.error('Audio analysis failed:', error);
        return null;
    }
}
/**
 * Get beat timestamps for a given BPM and duration
 */
export function getBeats(bpm, duration, offset = 0) {
    const beats = [];
    const beatInterval = 60 / bpm;
    let time = offset;
    while (time < duration) {
        beats.push(Math.round(time * 1000) / 1000);
        time += beatInterval;
    }
    return beats;
}
/**
 * Mix audio track with video
 */
export function mixAudio(options) {
    const { video, audio, output, volume = 1.0, fadeIn = 0, fadeOut = 0, replace = true, loop = false, audioStart = 0 } = options;
    if (!hasFFmpeg()) {
        console.error('ffmpeg not found. Install with: brew install ffmpeg');
        return false;
    }
    if (!existsSync(video)) {
        console.error(`Video file not found: ${video}`);
        return false;
    }
    if (!existsSync(audio)) {
        console.error(`Audio file not found: ${audio}`);
        return false;
    }
    // Ensure output directory exists
    const dir = dirname(output);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    // Build audio filter chain
    const audioFilters = [];
    if (audioStart > 0) {
        audioFilters.push(`atrim=start=${audioStart}`);
        audioFilters.push('asetpts=PTS-STARTPTS');
    }
    if (volume !== 1.0) {
        audioFilters.push(`volume=${volume}`);
    }
    if (fadeIn > 0) {
        audioFilters.push(`afade=t=in:st=0:d=${fadeIn}`);
    }
    // Get video duration for fade out
    if (fadeOut > 0) {
        try {
            const durationStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${video}"`, { encoding: 'utf-8' }).trim();
            const duration = parseFloat(durationStr);
            audioFilters.push(`afade=t=out:st=${duration - fadeOut}:d=${fadeOut}`);
        }
        catch {
            // Ignore fade out if can't get duration
        }
    }
    const audioFilterStr = audioFilters.length > 0 ? audioFilters.join(',') : null;
    // Build ffmpeg command
    const args = ['-y'];
    // Input files
    args.push('-i', video);
    if (loop) {
        args.push('-stream_loop', '-1');
    }
    args.push('-i', audio);
    // Mapping
    args.push('-map', '0:v'); // Video from first input
    if (replace) {
        // Use only new audio
        args.push('-map', '1:a');
    }
    else {
        // Mix original and new audio
        args.push('-filter_complex', `[0:a][1:a]amix=inputs=2:duration=first[aout]`);
        args.push('-map', '[aout]');
    }
    // Apply audio filters
    if (audioFilterStr && replace) {
        args.push('-af', audioFilterStr);
    }
    // Output settings
    args.push('-c:v', 'copy'); // Copy video stream
    args.push('-c:a', 'aac', '-b:a', '192k');
    args.push('-shortest'); // End when shortest stream ends
    args.push(output);
    try {
        execSync(`ffmpeg ${args.map(a => `"${a}"`).join(' ')}`, {
            stdio: 'pipe',
            timeout: 300000
        });
        return existsSync(output);
    }
    catch (error) {
        console.error('Audio mixing failed:', error);
        return false;
    }
}
// ============================================================================
// Take Management
// ============================================================================
const TAKES_DIR = '.vif';
const TAKES_FILE = 'takes.json';
function getTakesPath(assetPath) {
    const dir = dirname(assetPath);
    return join(dir, TAKES_DIR, TAKES_FILE);
}
function loadTakeHistory(assetPath) {
    const takesPath = getTakesPath(assetPath);
    if (!existsSync(takesPath)) {
        return null;
    }
    try {
        const data = readFileSync(takesPath, 'utf-8');
        return JSON.parse(data);
    }
    catch {
        return null;
    }
}
function saveTakeHistory(assetPath, history) {
    const takesPath = getTakesPath(assetPath);
    const dir = dirname(takesPath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(takesPath, JSON.stringify(history, null, 2));
}
/**
 * Create a new take of an asset
 */
export function createTake(assetPath, note = '') {
    if (!existsSync(assetPath)) {
        console.error(`Asset not found: ${assetPath}`);
        return null;
    }
    const history = loadTakeHistory(assetPath) || {
        asset: assetPath,
        currentVersion: 0,
        takes: []
    };
    const newVersion = history.currentVersion + 1;
    const ext = assetPath.split('.').pop() || '';
    const baseName = assetPath.replace(`.${ext}`, '');
    const takeFile = `${baseName}-take-${newVersion}.${ext}`;
    // Copy current file to take file
    try {
        execSync(`cp "${assetPath}" "${takeFile}"`);
    }
    catch (error) {
        console.error('Failed to create take:', error);
        return null;
    }
    const take = {
        version: newVersion,
        file: takeFile,
        note,
        timestamp: new Date().toISOString(),
        parentVersion: history.currentVersion > 0 ? history.currentVersion : undefined
    };
    history.takes.push(take);
    history.currentVersion = newVersion;
    saveTakeHistory(assetPath, history);
    return take;
}
/**
 * List all takes for an asset
 */
export function listTakes(assetPath) {
    const history = loadTakeHistory(assetPath);
    if (!history) {
        return [];
    }
    return history.takes.filter(t => !t.pruned);
}
/**
 * Revert to a specific take
 */
export function revertTake(assetPath, version) {
    const history = loadTakeHistory(assetPath);
    if (!history) {
        console.error('No take history found');
        return false;
    }
    const take = history.takes.find(t => t.version === version && !t.pruned);
    if (!take) {
        console.error(`Take version ${version} not found`);
        return false;
    }
    if (!existsSync(take.file)) {
        console.error(`Take file not found: ${take.file}`);
        return false;
    }
    try {
        execSync(`cp "${take.file}" "${assetPath}"`);
        history.currentVersion = version;
        saveTakeHistory(assetPath, history);
        return true;
    }
    catch (error) {
        console.error('Failed to revert:', error);
        return false;
    }
}
/**
 * Prune old takes, keeping only the most recent N
 */
export function pruneTakes(assetPath, keep) {
    const history = loadTakeHistory(assetPath);
    if (!history) {
        return 0;
    }
    const activeTakes = history.takes.filter(t => !t.pruned);
    if (activeTakes.length <= keep) {
        return 0;
    }
    // Sort by version descending, mark older ones for pruning
    const sorted = [...activeTakes].sort((a, b) => b.version - a.version);
    const toPrune = sorted.slice(keep);
    let pruned = 0;
    for (const take of toPrune) {
        const idx = history.takes.findIndex(t => t.version === take.version);
        if (idx >= 0) {
            history.takes[idx].pruned = true;
            // Delete the file
            if (existsSync(take.file)) {
                try {
                    unlinkSync(take.file);
                    pruned++;
                }
                catch {
                    // Ignore deletion errors
                }
            }
        }
    }
    saveTakeHistory(assetPath, history);
    return pruned;
}
// ============================================================================
// Storyboard Rendering
// ============================================================================
/**
 * Parse a storyboard YAML file
 */
export function parseStoryboard(path) {
    if (!existsSync(path)) {
        console.error(`Storyboard file not found: ${path}`);
        return null;
    }
    try {
        const content = readFileSync(path, 'utf-8');
        const storyboard = YAML.parse(content);
        return storyboard;
    }
    catch (error) {
        console.error('Failed to parse storyboard:', error);
        return null;
    }
}
/**
 * Get video duration using ffprobe
 */
export function getVideoDuration(path) {
    try {
        const result = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${path}"`, { encoding: 'utf-8' }).trim();
        return parseFloat(result);
    }
    catch {
        return 0;
    }
}
/**
 * Render a storyboard to video
 */
export function renderStoryboard(storyboard, options) {
    const { basePath = '.', bpm, verbose = false } = options || {};
    if (!hasFFmpeg()) {
        console.error('ffmpeg not found. Install with: brew install ffmpeg');
        return false;
    }
    const log = verbose ? console.log : () => { };
    // Resolve paths relative to basePath
    const resolvePath = (p) => resolve(basePath, p);
    const outputPath = resolvePath(storyboard.output);
    // Ensure output directory exists
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
    }
    // Validate clips exist
    for (const clip of storyboard.sequence) {
        const clipPath = resolvePath(clip.source);
        if (!existsSync(clipPath)) {
            console.error(`Clip not found: ${clip.source}`);
            return false;
        }
    }
    // Calculate beat timestamps if audio and BPM provided
    let beats = [];
    if (storyboard.audio && bpm) {
        const audioPath = resolvePath(storyboard.audio.track);
        const analysis = analyzeAudio(audioPath, bpm);
        if (analysis?.beats) {
            beats = analysis.beats;
            log(`Found ${beats.length} beats at ${bpm} BPM`);
        }
    }
    // Temporary directory for intermediate files
    const tempDir = join(tmpdir(), `vif-render-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    try {
        // Step 1: Prepare each clip (trim, normalize)
        log('Preparing clips...');
        const preparedClips = [];
        let currentBeatIndex = 0;
        for (let i = 0; i < storyboard.sequence.length; i++) {
            const clip = storyboard.sequence[i];
            const sourcePath = resolvePath(clip.source);
            const preparedPath = join(tempDir, `clip-${i}.mp4`);
            const clipArgs = ['-y', '-i', sourcePath];
            // Handle timing
            if (clip.startTime !== undefined) {
                clipArgs.push('-ss', String(clip.startTime));
            }
            if (clip.duration !== undefined) {
                clipArgs.push('-t', String(clip.duration));
            }
            // Normalize resolution and framerate
            const resolution = storyboard.resolution || { width: 1920, height: 1080 };
            const fps = storyboard.fps || 30;
            clipArgs.push('-vf', `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2,fps=${fps}`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-an', // Remove audio for now, we'll add music later
            preparedPath);
            log(`  Preparing clip ${i + 1}: ${clip.source}`);
            execSync(`ffmpeg ${clipArgs.map(a => `"${a}"`).join(' ')}`, { stdio: 'pipe' });
            preparedClips.push(preparedPath);
            // Track beat alignment
            if (clip.sync === 'beat' && beats.length > currentBeatIndex) {
                log(`    → Synced to beat ${currentBeatIndex} at ${beats[currentBeatIndex]}s`);
                currentBeatIndex++;
            }
        }
        // Step 2: Concatenate clips
        log('Concatenating clips...');
        const concatListPath = join(tempDir, 'concat.txt');
        const concatContent = preparedClips.map(p => `file '${p}'`).join('\n');
        writeFileSync(concatListPath, concatContent);
        const concatenatedPath = join(tempDir, 'concatenated.mp4');
        execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${concatenatedPath}"`, { stdio: 'pipe' });
        // Step 3: Add audio if specified
        if (storyboard.audio) {
            log('Adding audio...');
            const audioPath = resolvePath(storyboard.audio.track);
            const success = mixAudio({
                video: concatenatedPath,
                audio: audioPath,
                output: outputPath,
                volume: storyboard.audio.volume,
                fadeIn: storyboard.audio.fadeIn,
                fadeOut: storyboard.audio.fadeOut,
                audioStart: storyboard.audio.startAt,
                replace: true,
                loop: true
            });
            if (!success) {
                console.error('Failed to add audio');
                return false;
            }
        }
        else {
            // No audio, just copy the concatenated file
            execSync(`cp "${concatenatedPath}" "${outputPath}"`);
        }
        log(`\nRendered: ${outputPath}`);
        return existsSync(outputPath);
    }
    catch (error) {
        console.error('Render failed:', error);
        return false;
    }
    finally {
        // Clean up temp directory
        try {
            execSync(`rm -rf "${tempDir}"`);
        }
        catch {
            // Ignore cleanup errors
        }
    }
}
/**
 * Render a storyboard from a YAML file
 */
export function renderStoryboardFile(path, options) {
    const storyboard = parseStoryboard(path);
    if (!storyboard) {
        return false;
    }
    return renderStoryboard(storyboard, {
        basePath: dirname(path),
        ...options
    });
}
// Export slide templates and renderer
export * from './templates/index.js';
export * from './slides.js';
// Export enhanced storyboard system
export * from './storyboard.js';
// Export music and voice modules
export * from './music.js';
export * from './voice.js';
// Export cache module
export * from './cache.js';
// Export cursor module
export * from './cursor.js';
// Export viewport (mouse-aware rendering)
export * from './viewport.js';
// Export automation (cursor control)
export * from './automation.js';
// Export server
export * from './server.js';
// Export agent client (native overlays)
export * from './agent-client.js';
// Export hooks system
export { hooks, defineVifPlugin, registerPlugin, registerPlugins, createVifHooks, } from './hooks/index.js';
// Export CDP browser automation (namespace to avoid conflicts)
export * as cdp from './cdp/index.js';
// Export Vif browser class (Stagehand-style API)
export { Vif, createVif } from './browser.js';
// Export Stagehand adapter
export { StagehandAdapter, createStagehandAdapter, createWithStagehand } from './stagehand-adapter.js';
// Export Stagehand prompt spy
export { StagehandSpy, createStagehandSpy, runPromptCapture } from './stagehand-spy.js';
//# sourceMappingURL=index.js.map