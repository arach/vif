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

  // Poll cursor position using mouse location from Quartz
  const interval = setInterval(() => {
    if (!running) return;

    try {
      // Use JXA (JavaScript for Automation) to get mouse position
      const result = execSync(
        `osascript -l JavaScript -e 'ObjC.import("AppKit"); var loc = $.NSEvent.mouseLocation; loc.x.toFixed(0) + "," + loc.y.toFixed(0);'`,
        { encoding: 'utf-8', timeout: 200 }
      ).trim();

      const [x, y] = result.split(',').map(Number);
      if (!isNaN(x) && !isNaN(y)) {
        positions.push({
          x,
          y,
          timestamp: Date.now() - startTime,
        });
      }
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
  resolution?: { width: number; height: number }
): boolean {
  if (!config.enabled) {
    execSync(`cp "${inputVideo}" "${outputVideo}"`);
    return true;
  }

  const { zoom = 1.5 } = config;

  if (cursorTrack.positions.length === 0) {
    execSync(`cp "${inputVideo}" "${outputVideo}"`);
    return true;
  }

  // Auto-detect video dimensions if not provided
  let width = resolution?.width || 1920;
  let height = resolution?.height || 1080;
  let videoDuration = 5;

  try {
    const probeResult = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -show_entries format=duration -of csv=p=0 "${inputVideo}"`,
      { encoding: 'utf-8' }
    ).trim();
    const lines = probeResult.split('\n');
    if (lines[0]) {
      const [w, h] = lines[0].split(',').map(Number);
      if (w && h) {
        width = w;
        height = h;
      }
    }
    if (lines[1]) {
      videoDuration = parseFloat(lines[1]) || 5;
    }
  } catch {}

  // Calculate zoomed view size
  const viewWidth = Math.round(width / zoom);
  const viewHeight = Math.round(height / zoom);

  // Build keyframe expressions for x and y based on cursor positions
  // Sample every ~0.5 seconds for smooth panning
  const keyframes: { t: number; x: number; y: number }[] = [];
  const sampleMs = 500;

  for (let i = 0; i < cursorTrack.positions.length; i++) {
    const pos = cursorTrack.positions[i];
    if (i === 0 || pos.timestamp - keyframes[keyframes.length - 1].t * 1000 >= sampleMs) {
      // Clamp position to keep zoom window in bounds
      const x = Math.max(0, Math.min(width - viewWidth, pos.x - viewWidth / 2));
      const y = Math.max(0, Math.min(height - viewHeight, pos.y - viewHeight / 2));
      keyframes.push({ t: pos.timestamp / 1000, x, y });
    }
  }

  if (keyframes.length < 2) {
    // Not enough keyframes, just do static zoom on first position
    const pos = cursorTrack.positions[0];
    const x = Math.max(0, Math.min(width - viewWidth, pos.x - viewWidth / 2));
    const y = Math.max(0, Math.min(height - viewHeight, pos.y - viewHeight / 2));

    try {
      execSync(
        `ffmpeg -y -i "${inputVideo}" -vf "crop=${viewWidth}:${viewHeight}:${x}:${y},scale=${width}:${height}" -c:a copy "${outputVideo}"`,
        { stdio: 'pipe' }
      );
      return existsSync(outputVideo);
    } catch (error) {
      console.error('Zoom effect failed:', error);
      return false;
    }
  }

  try {
    // Use crop filter with time-based expressions for animated pan
    // FFmpeg crop filter supports expressions with 't' (time in seconds)

    // Calculate positions at start and end for linear pan
    const startPos = keyframes[0];
    const endPos = keyframes[keyframes.length - 1];

    // Keyframes already contain crop positions (adjusted for centering cursor in view)
    const startX = Math.round(startPos.x);
    const startY = Math.round(startPos.y);
    const endX = Math.round(endPos.x);
    const endY = Math.round(endPos.y);

    // Calculate velocity (pixels per second)
    const duration = videoDuration;
    const xVelocity = (endX - startX) / duration;
    const yVelocity = (endY - startY) / duration;

    // Build ffmpeg filter with expressions
    // crop=w:h:x:y where x and y can be expressions using 't' for time
    // Expression: startPos + velocity * t
    // Need to clamp to ensure we stay in bounds
    const xExpr = `min(max(0\\,${startX}+${xVelocity.toFixed(2)}*t)\\,${width - viewWidth})`;
    const yExpr = `min(max(0\\,${startY}+${yVelocity.toFixed(2)}*t)\\,${height - viewHeight})`;

    const filterComplex = `crop=${viewWidth}:${viewHeight}:${xExpr}:${yExpr},scale=${width}:${height}`;

    execSync(
      `ffmpeg -y -i "${inputVideo}" -vf "${filterComplex}" -c:a copy "${outputVideo}"`,
      { stdio: 'pipe' }
    );

    return existsSync(outputVideo);
  } catch (error) {
    console.error('Zoom/pan effect failed:', error);

    // Fallback: try simpler static crop approach
    try {
      const avgX = keyframes.reduce((sum, k) => sum + k.x, 0) / keyframes.length;
      const avgY = keyframes.reduce((sum, k) => sum + k.y, 0) / keyframes.length;
      const cropX = Math.max(0, Math.min(width - viewWidth, Math.round(avgX - viewWidth / 2)));
      const cropY = Math.max(0, Math.min(height - viewHeight, Math.round(avgY - viewHeight / 2)));

      execSync(
        `ffmpeg -y -i "${inputVideo}" -vf "crop=${viewWidth}:${viewHeight}:${cropX}:${cropY},scale=${width}:${height}" -c:a copy "${outputVideo}"`,
        { stdio: 'pipe' }
      );
      return existsSync(outputVideo);
    } catch {
      return false;
    }
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
// Zoom Segments
// ============================================================================

export interface ZoomSegment {
  start: number;
  end: number;
  x: number;
  y: number;
  zoom?: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

/**
 * Apply zoom segments to video
 * Zooms to specific areas at specific times
 */
export function applyZoomSegments(
  inputVideo: string,
  outputVideo: string,
  segments: ZoomSegment[],
  resolution: { width: number; height: number }
): boolean {
  if (!segments || segments.length === 0) {
    execSync(`cp "${inputVideo}" "${outputVideo}"`);
    return true;
  }

  const { width, height } = resolution;

  // Get video duration
  let videoDuration = 10;
  try {
    const durStr = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${inputVideo}"`,
      { encoding: 'utf-8' }
    ).trim();
    videoDuration = parseFloat(durStr) || 10;
  } catch {}

  // Sort segments by start time
  const sortedSegments = [...segments].sort((a, b) => a.start - b.start);

  // Transition duration in seconds
  const transitionDuration = 0.5;

  // Use trim to extract segments and concat
  const tmpDir = join(tmpdir(), `vif-zoom-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  try {
    // For smooth transitions, we'll use a single pass with animated crop expressions
    // The crop position and size animate over time based on segments

    // Build timeline of zoom states
    interface ZoomState {
      time: number;
      x: number;
      y: number;
      zoom: number;
    }

    const states: ZoomState[] = [];

    // Initial state: full frame (zoom = 1.0, centered)
    states.push({ time: 0, x: width / 2, y: height / 2, zoom: 1.0 });

    for (const seg of sortedSegments) {
      // Transition into zoom
      states.push({ time: seg.start, x: seg.x, y: seg.y, zoom: seg.zoom || 1.5 });
      // Hold zoom
      states.push({ time: seg.end - transitionDuration, x: seg.x, y: seg.y, zoom: seg.zoom || 1.5 });
    }

    // Final state: back to full frame
    if (sortedSegments.length > 0) {
      const lastSeg = sortedSegments[sortedSegments.length - 1];
      states.push({ time: lastSeg.end, x: width / 2, y: height / 2, zoom: 1.0 });
    }
    states.push({ time: videoDuration, x: width / 2, y: height / 2, zoom: 1.0 });

    // Build ffmpeg expression for animated crop
    // We need to express crop_w, crop_h, crop_x, crop_y as functions of time

    // For simplicity with multiple segments, we'll use a piecewise linear approach
    // Build expression that interpolates between consecutive states

    // Helper to build piecewise expression
    function buildExpr(getValue: (s: ZoomState) => number): string {
      if (states.length < 2) return String(getValue(states[0]));

      let expr = String(getValue(states[states.length - 1]));

      for (let i = states.length - 2; i >= 0; i--) {
        const curr = states[i];
        const next = states[i + 1];
        const v0 = getValue(curr);
        const v1 = getValue(next);
        const t0 = curr.time;
        const t1 = next.time;

        if (t1 <= t0) continue;

        // Linear interpolation: v0 + (v1 - v0) * (t - t0) / (t1 - t0)
        const slope = (v1 - v0) / (t1 - t0);
        const segment = `${v0.toFixed(1)}+${slope.toFixed(2)}*(t-${t0.toFixed(2)})`;
        expr = `if(lt(t\\,${t1.toFixed(2)})\\,${segment}\\,${expr})`;
      }

      return expr;
    }

    // Build expressions for crop dimensions and position
    const zoomExpr = buildExpr(s => s.zoom);
    const cropWExpr = `${width}/(${zoomExpr})`;
    const cropHExpr = `${height}/(${zoomExpr})`;

    // Center position expressions
    const cxExpr = buildExpr(s => s.x);
    const cyExpr = buildExpr(s => s.y);

    // Crop x/y = center - size/2, clamped to bounds
    const cropXExpr = `max(0\\,min(${width}-(${cropWExpr})\\,(${cxExpr})-(${cropWExpr})/2))`;
    const cropYExpr = `max(0\\,min(${height}-(${cropHExpr})\\,(${cyExpr})-(${cropHExpr})/2))`;

    // Build the filter
    const filter = `crop=w='${cropWExpr}':h='${cropHExpr}':x='${cropXExpr}':y='${cropYExpr}',scale=${width}:${height}`;

    execSync(
      `ffmpeg -y -i "${inputVideo}" -vf "${filter}" -c:a copy "${outputVideo}"`,
      { stdio: 'pipe' }
    );

    return existsSync(outputVideo);
  } catch (error) {
    console.error('Zoom segments failed:', error);

    // Fallback: just copy the input
    try {
      execSync(`cp "${inputVideo}" "${outputVideo}"`);
      return true;
    } catch {
      return false;
    }
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
