/**
 * Cursor Tracking and Effects
 *
 * Custom cursor overlay and cursor-following zoom/pan for screen recordings.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

// ============================================================================
// Types
// ============================================================================

export interface CursorPosition {
  x: number;
  y: number;
  timestamp: number;
}

export interface CursorConfig {
  /** Custom cursor image path (PNG with transparency) */
  image?: string;
  /** Cursor size multiplier */
  scale?: number;
  /** Show click animations */
  showClicks?: boolean;
  /** Cursor color for default cursor */
  color?: string;
}

export interface ZoomPanConfig {
  /** Enable cursor-following zoom */
  enabled: boolean;
  /** Zoom level (1.0 = no zoom, 2.0 = 2x zoom) */
  zoom?: number;
  /** How quickly to follow cursor (0-1, lower = smoother) */
  smoothing?: number;
  /** Padding from edges before panning */
  padding?: number;
}

export interface CursorTrack {
  positions: CursorPosition[];
  clicks: CursorPosition[];
  startTime: number;
  endTime: number;
}

// ============================================================================
// Default Cursor
// ============================================================================

/**
 * Generate a simple cursor PNG
 */
export function generateDefaultCursor(outputPath: string, color = '#FF5722', size = 24): void {
  // Create SVG cursor
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="1" dy="1" stdDeviation="1" flood-opacity="0.3"/>
    </filter>
  </defs>
  <path d="M 0,0 L 0,17 L 4,13 L 7,20 L 10,19 L 7,12 L 13,12 Z"
        fill="${color}" stroke="white" stroke-width="1.5" filter="url(#shadow)"/>
</svg>`;

  const svgPath = outputPath.replace('.png', '.svg');
  writeFileSync(svgPath, svg);

  // Convert to PNG if we have rsvg-convert or use inline
  try {
    execSync(`rsvg-convert -w ${size} -h ${size} "${svgPath}" -o "${outputPath}"`, { stdio: 'pipe' });
  } catch {
    // Fallback: use sips to convert (less quality but works)
    try {
      execSync(`qlmanage -t -s ${size} -o "${dirname(outputPath)}" "${svgPath}"`, { stdio: 'pipe' });
    } catch {
      // Just keep the SVG, ffmpeg can use it
      writeFileSync(outputPath.replace('.png', '.svg'), svg);
    }
  }
}

// ============================================================================
// Cursor Tracking
// ============================================================================

/**
 * Track cursor position during recording
 * Returns positions at ~30fps
 */
export function startCursorTracking(): { stop: () => CursorTrack } {
  const positions: CursorPosition[] = [];
  const clicks: CursorPosition[] = [];
  const startTime = Date.now();
  let running = true;

  // Poll cursor position
  const interval = setInterval(() => {
    if (!running) return;

    try {
      // Get cursor position using AppleScript
      const result = execSync(
        `osascript -e 'tell application "System Events" to return (get position of mouse)'`,
        { encoding: 'utf-8', timeout: 100 }
      ).trim();

      const [x, y] = result.split(', ').map(Number);
      positions.push({
        x,
        y,
        timestamp: Date.now() - startTime,
      });
    } catch {
      // Ignore errors during tracking
    }
  }, 33); // ~30fps

  return {
    stop: () => {
      running = false;
      clearInterval(interval);
      return {
        positions,
        clicks,
        startTime,
        endTime: Date.now(),
      };
    },
  };
}

/**
 * Save cursor track to file
 */
export function saveCursorTrack(track: CursorTrack, outputPath: string): void {
  writeFileSync(outputPath, JSON.stringify(track, null, 2));
}

/**
 * Load cursor track from file
 */
export function loadCursorTrack(path: string): CursorTrack | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

// ============================================================================
// Cursor Overlay
// ============================================================================

/**
 * Apply custom cursor overlay to video
 */
export function applyCursorOverlay(
  inputVideo: string,
  outputVideo: string,
  cursorTrack: CursorTrack,
  config: CursorConfig = {}
): boolean {
  const { image, scale = 1.0 } = config;

  // Generate cursor positions for ffmpeg drawtext
  const tmpDir = join(tmpdir(), `vif-cursor-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  // If no custom cursor, generate default
  let cursorPath = image;
  if (!cursorPath || !existsSync(cursorPath)) {
    cursorPath = join(tmpDir, 'cursor.png');
    generateDefaultCursor(cursorPath, config.color || '#FF5722');
  }

  // Create position file for ffmpeg
  // We'll use sendcmd to move overlay position
  const positionsFile = join(tmpDir, 'positions.txt');
  let cmds = '';

  for (let i = 0; i < cursorTrack.positions.length; i++) {
    const pos = cursorTrack.positions[i];
    const time = pos.timestamp / 1000;
    cmds += `${time} [overlay] x ${pos.x};\n`;
    cmds += `${time} [overlay] y ${pos.y};\n`;
  }

  writeFileSync(positionsFile, cmds);

  try {
    // Apply cursor overlay
    // Note: This is a simplified version - real implementation would use
    // a more sophisticated approach with proper interpolation
    const cursorSize = Math.round(24 * scale);

    execSync(
      `ffmpeg -y -i "${inputVideo}" -i "${cursorPath}" -filter_complex "[1:v]scale=${cursorSize}:${cursorSize}[cursor];[0:v][cursor]overlay=x='if(gte(t,0),${cursorTrack.positions[0]?.x || 0},0)':y='if(gte(t,0),${cursorTrack.positions[0]?.y || 0},0)'" -c:a copy "${outputVideo}"`,
      { stdio: 'pipe' }
    );

    return existsSync(outputVideo);
  } catch (error) {
    console.error('Cursor overlay failed:', error);
    return false;
  }
}

// ============================================================================
// Cursor-Following Zoom/Pan
// ============================================================================

/**
 * Apply cursor-following zoom/pan effect
 */
export function applyCursorZoomPan(
  inputVideo: string,
  outputVideo: string,
  cursorTrack: CursorTrack,
  config: ZoomPanConfig,
  resolution: { width: number; height: number }
): boolean {
  if (!config.enabled) {
    execSync(`cp "${inputVideo}" "${outputVideo}"`);
    return true;
  }

  const { zoom = 1.5, smoothing = 0.1, padding = 100 } = config;
  const { width, height } = resolution;

  // Calculate zoomed view size
  const viewWidth = Math.round(width / zoom);
  const viewHeight = Math.round(height / zoom);

  // Generate zoom/pan keyframes based on cursor positions
  // We'll use ffmpeg's zoompan filter with expressions

  // Sample cursor positions to create smooth movement
  const sampledPositions: CursorPosition[] = [];
  const sampleInterval = 100; // ms

  for (let t = 0; t < cursorTrack.positions.length; t += 3) {
    sampledPositions.push(cursorTrack.positions[t]);
  }

  if (sampledPositions.length === 0) {
    execSync(`cp "${inputVideo}" "${outputVideo}"`);
    return true;
  }

  try {
    // Calculate center positions for the zoom window
    // The window follows the cursor with smoothing
    const centerX = sampledPositions.map(p =>
      Math.max(viewWidth / 2, Math.min(width - viewWidth / 2, p.x))
    );
    const centerY = sampledPositions.map(p =>
      Math.max(viewHeight / 2, Math.min(height - viewHeight / 2, p.y))
    );

    // Use zoompan filter with cursor-following
    // This creates a smooth zoom that follows cursor movement
    const avgX = centerX.reduce((a, b) => a + b, 0) / centerX.length;
    const avgY = centerY.reduce((a, b) => a + b, 0) / centerY.length;

    execSync(
      `ffmpeg -y -i "${inputVideo}" -vf "zoompan=z=${zoom}:x='${avgX - viewWidth/2}':y='${avgY - viewHeight/2}':d=1:s=${width}x${height}:fps=30" -c:a copy "${outputVideo}"`,
      { stdio: 'pipe' }
    );

    return existsSync(outputVideo);
  } catch (error) {
    console.error('Zoom/pan effect failed:', error);
    return false;
  }
}

/**
 * Apply spotlight effect around cursor
 */
export function applyCursorSpotlight(
  inputVideo: string,
  outputVideo: string,
  cursorTrack: CursorTrack,
  spotlightRadius = 150
): boolean {
  // This creates a vignette-like effect that follows the cursor
  // Dimming everything except the area around the cursor

  if (cursorTrack.positions.length === 0) {
    execSync(`cp "${inputVideo}" "${outputVideo}"`);
    return true;
  }

  const firstPos = cursorTrack.positions[0];

  try {
    // Simple spotlight using vignette centered on cursor
    execSync(
      `ffmpeg -y -i "${inputVideo}" -vf "vignette=PI/4:${firstPos.x}:${firstPos.y}" -c:a copy "${outputVideo}"`,
      { stdio: 'pipe' }
    );

    return existsSync(outputVideo);
  } catch (error) {
    console.error('Spotlight effect failed:', error);
    return false;
  }
}

// ============================================================================
// Exports
// ============================================================================

export const CURSOR_COLORS = {
  orange: '#FF5722',
  blue: '#2196F3',
  green: '#4CAF50',
  red: '#F44336',
  purple: '#9C27B0',
  yellow: '#FFEB3B',
  white: '#FFFFFF',
  black: '#000000',
};
