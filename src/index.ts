/**
 * Vif - Vivid screen capture for macOS
 * Screenshots, video, and GIFs.
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

// ============================================================================
// Types
// ============================================================================

export interface WindowInfo {
  id: number;
  owner: string;
  name: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ScreenshotOptions {
  /** Output file path (png) */
  output: string;
  /** Window ID to capture (use getWindows to find) */
  windowId?: number;
  /** Capture specific region */
  region?: { x: number; y: number; width: number; height: number };
  /** Remove window shadow */
  noShadow?: boolean;
  /** Capture cursor */
  cursor?: boolean;
  /** Delay before capture (seconds) */
  delay?: number;
}

export interface VideoOptions {
  /** Output file path (mp4 or mov) */
  output: string;
  /** Duration in seconds */
  duration?: number;
  /** Frame rate (default: 30) */
  fps?: number;
  /** Capture region */
  region?: { x: number; y: number; width: number; height: number };
  /** Audio capture (default: false) */
  audio?: boolean;
  /** Show clicks (default: false) */
  showClicks?: boolean;
}

export interface ConvertOptions {
  /** Input file path */
  input: string;
  /** Output file path */
  output: string;
  /** Scale factor (e.g., 0.5 for half size) */
  scale?: number;
  /** Target width (maintains aspect ratio) */
  width?: number;
  /** Target height (maintains aspect ratio) */
  height?: number;
  /** Video quality (0-51, lower is better, default: 23) */
  crf?: number;
  /** Start time (seconds) */
  startTime?: number;
  /** End time (seconds) */
  endTime?: number;
  /** Trim duration (seconds) */
  duration?: number;
  /** Remove audio */
  noAudio?: boolean;
}

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
export function getWindows(appName?: string): WindowInfo[] {
  const scriptPath = join(tmpdir(), 'vif-get-windows.swift');
  writeFileSync(scriptPath, SWIFT_GET_WINDOWS);

  try {
    const output = execSync(`swift ${scriptPath}`, { encoding: 'utf-8', timeout: 10000 });
    const windows: WindowInfo[] = JSON.parse(output);

    if (appName) {
      return windows.filter(w =>
        w.owner.toLowerCase().includes(appName.toLowerCase()) ||
        w.name.toLowerCase().includes(appName.toLowerCase())
      );
    }

    return windows;
  } catch (error) {
    console.error('Failed to get windows:', error);
    return [];
  }
}

/**
 * Find a window by app name
 * Returns the first matching window
 */
export function findWindow(appName: string): WindowInfo | null {
  const windows = getWindows(appName);
  return windows.length > 0 ? windows[0] : null;
}

/**
 * Activate (bring to front) an application
 */
export function activateApp(appName: string): void {
  try {
    execSync(`osascript -e 'tell application "${appName}" to activate'`, { timeout: 5000 });
    // Small delay to let the app come to front
    execSync('sleep 0.3');
  } catch {
    // App might not support AppleScript, continue anyway
  }
}

// ============================================================================
// Screenshot Capture
// ============================================================================

/**
 * Capture a screenshot
 */
export function screenshot(options: ScreenshotOptions): boolean {
  const { output, windowId, region, noShadow = true, cursor = false, delay = 0 } = options;

  // Ensure output directory exists
  const dir = dirname(output);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const args: string[] = [];

  // Options
  if (noShadow) args.push('-o');
  args.push('-x'); // Silent (no screenshot sound)
  if (cursor) args.push('-C');
  if (delay > 0) args.push('-T', String(delay));

  // Capture mode
  if (windowId) {
    args.push('-l', String(windowId));
  } else if (region) {
    args.push('-R', `${region.x},${region.y},${region.width},${region.height}`);
  }

  args.push(output);

  try {
    execSync(`screencapture ${args.join(' ')}`, { timeout: 30000 });
    return existsSync(output);
  } catch (error) {
    console.error('Screenshot failed:', error);
    return false;
  }
}

/**
 * Capture a window by app name
 */
export function screenshotApp(appName: string, output: string, options?: Partial<ScreenshotOptions>): boolean {
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
export function screenshotFullscreen(output: string): boolean {
  return screenshot({ output });
}

// ============================================================================
// Video Capture
// ============================================================================

/**
 * Start video recording
 * Returns a handle to stop the recording
 */
export function startRecording(options: VideoOptions): { stop: () => Promise<string>; process: ChildProcess } {
  const { output, fps = 30, region, audio = false, showClicks = false } = options;

  // Ensure output directory exists
  const dir = dirname(output);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Use screencapture -v for video
  const args: string[] = ['-v'];

  if (showClicks) args.push('-k');
  if (!audio) args.push('-x'); // No audio
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
          } else {
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
export async function recordVideo(options: VideoOptions & { duration: number }): Promise<string> {
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
export function hasFFmpeg(): boolean {
  try {
    execSync('which ffmpeg', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert/process video using ffmpeg
 */
export function convertVideo(options: ConvertOptions): boolean {
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

  const args: string[] = ['-y', '-i', input];

  // Time options
  if (startTime !== undefined) args.push('-ss', String(startTime));
  if (endTime !== undefined) args.push('-to', String(endTime));
  if (duration !== undefined) args.push('-t', String(duration));

  // Video filters
  const filters: string[] = [];
  if (scale) filters.push(`scale=iw*${scale}:ih*${scale}`);
  else if (width) filters.push(`scale=${width}:-2`);
  else if (height) filters.push(`scale=-2:${height}`);

  if (filters.length > 0) {
    args.push('-vf', filters.join(','));
  }

  // Output options
  args.push('-c:v', 'libx264', '-crf', String(crf), '-preset', 'medium');
  if (noAudio) {
    args.push('-an');
  } else {
    args.push('-c:a', 'aac', '-b:a', '128k');
  }

  args.push(output);

  try {
    execSync(`ffmpeg ${args.map(a => `"${a}"`).join(' ')}`, {
      stdio: 'pipe',
      timeout: 300000
    });
    return existsSync(output);
  } catch (error) {
    console.error('Video conversion failed:', error);
    return false;
  }
}

/**
 * Create an optimized web-ready MP4 from a video
 */
export function optimizeForWeb(input: string, output: string, maxWidth = 1280): boolean {
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
export function videoToGif(input: string, output: string, options?: { width?: number; fps?: number }): boolean {
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
  } catch (error) {
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
export function click(x: number, y: number): void {
  const script = `
    tell application "System Events"
      click at {${x}, ${y}}
    end tell
  `;

  try {
    execSync(`osascript -e '${script}'`, { timeout: 5000 });
  } catch {
    // System Events might not have accessibility permissions
    // Fall back to cliclick if available
    try {
      execSync(`cliclick c:${x},${y}`, { timeout: 5000 });
    } catch {
      console.warn('Click simulation requires accessibility permissions or cliclick tool');
    }
  }
}

/**
 * Move mouse to position
 */
export function moveMouse(x: number, y: number): void {
  try {
    execSync(`cliclick m:${x},${y}`, { timeout: 5000 });
  } catch {
    console.warn('Mouse movement requires cliclick tool: brew install cliclick');
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick screenshot with auto-generated filename
 */
export function quickShot(prefix = 'shot'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${prefix}-${timestamp}.png`;
  const output = join(process.cwd(), filename);

  screenshot({ output });
  return output;
}

/**
 * List all app windows (useful for debugging)
 */
export function listWindows(): void {
  const windows = getWindows();
  console.log('\nVisible Windows:');
  console.log('================');
  for (const w of windows) {
    console.log(`[${w.id}] ${w.owner} - "${w.name}" (${w.bounds.width}x${w.bounds.height} at ${w.bounds.x},${w.bounds.y})`);
  }
}

// Export types
export type { ChildProcess };
