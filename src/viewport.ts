/**
 * Viewport Control System
 *
 * Render-time "mouse awareness" - controls zoom/pan based on cursor track.
 * Separate from cursor control (capture time).
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { CursorTrack } from './cursor.js';

// ============================================================================
// Types
// ============================================================================

/** Viewport command types */
export type ViewportCommand =
  | FollowCommand
  | ZoomCommand
  | PanCommand
  | HoldCommand;

/** Follow the cursor */
export interface FollowCommand {
  type: 'follow';
  target: 'mouse';
  from: number;  // start time (seconds)
  to: number;    // end time (seconds)
  zoom?: number; // zoom level while following (default: current)
}

/** Zoom in/out */
export interface ZoomCommand {
  type: 'zoom';
  level: number;      // 1.0 = full view, 2.0 = 2x zoom
  at: number;         // time to zoom (seconds)
  duration?: number;  // transition duration (default: 0.5)
  center?: 'mouse' | { x: number; y: number }; // where to zoom (default: mouse)
}

/** Pan to position */
export interface PanCommand {
  type: 'pan';
  to: 'mouse' | { x: number; y: number };
  at: number;
  duration?: number;
}

/** Hold current viewport */
export interface HoldCommand {
  type: 'hold';
  from: number;
  to: number;
}

/** Complete viewport configuration for a recording */
export interface ViewportConfig {
  commands: ViewportCommand[];
}

// ============================================================================
// Cursor Track Query
// ============================================================================

/**
 * Get cursor position at a specific time from the track
 */
export function getCursorAt(track: CursorTrack, timeMs: number): { x: number; y: number } {
  if (track.positions.length === 0) {
    return { x: 0, y: 0 };
  }

  // Find surrounding positions for interpolation
  let before = track.positions[0];
  let after = track.positions[track.positions.length - 1];

  for (let i = 0; i < track.positions.length - 1; i++) {
    if (track.positions[i].timestamp <= timeMs && track.positions[i + 1].timestamp >= timeMs) {
      before = track.positions[i];
      after = track.positions[i + 1];
      break;
    }
  }

  // If exact match or before all positions
  if (before.timestamp >= timeMs) {
    return { x: before.x, y: before.y };
  }

  // If after all positions
  if (after.timestamp <= timeMs) {
    return { x: after.x, y: after.y };
  }

  // Interpolate
  const t = (timeMs - before.timestamp) / (after.timestamp - before.timestamp);
  return {
    x: before.x + (after.x - before.x) * t,
    y: before.y + (after.y - before.y) * t,
  };
}

// ============================================================================
// Viewport State Machine
// ============================================================================

interface ViewportState {
  time: number;      // seconds
  zoom: number;      // current zoom level
  centerX: number;   // viewport center X
  centerY: number;   // viewport center Y
}

/**
 * Build viewport state timeline from commands and cursor track
 */
export function buildViewportTimeline(
  commands: ViewportCommand[],
  cursorTrack: CursorTrack,
  videoDuration: number
): ViewportState[] {
  const states: ViewportState[] = [];
  const fps = 30;
  const frameCount = Math.ceil(videoDuration * fps);

  // Sort commands by time
  const sortedCommands = [...commands].sort((a, b) => {
    const timeA = 'at' in a ? a.at : a.from;
    const timeB = 'at' in b ? b.at : b.from;
    return timeA - timeB;
  });

  // Initialize state
  let currentZoom = 1.0;
  let currentCenterX = 640; // Will be set based on resolution
  let currentCenterY = 360;

  // Process each frame
  for (let frame = 0; frame < frameCount; frame++) {
    const time = frame / fps;
    const timeMs = time * 1000;

    // Find active commands at this time
    let zoom = currentZoom;
    let centerX = currentCenterX;
    let centerY = currentCenterY;

    for (const cmd of sortedCommands) {
      if (cmd.type === 'follow') {
        if (time >= cmd.from && time <= cmd.to) {
          // Follow the mouse
          const pos = getCursorAt(cursorTrack, timeMs);
          centerX = pos.x;
          centerY = pos.y;
          if (cmd.zoom) zoom = cmd.zoom;
        }
      } else if (cmd.type === 'zoom') {
        const duration = cmd.duration || 0.5;
        const startTime = cmd.at;
        const endTime = cmd.at + duration;

        if (time >= startTime && time <= endTime) {
          // Transitioning zoom
          const t = (time - startTime) / duration;
          const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          zoom = currentZoom + (cmd.level - currentZoom) * ease;

          // Set center based on command
          if (cmd.center === 'mouse' || !cmd.center) {
            const pos = getCursorAt(cursorTrack, timeMs);
            centerX = pos.x;
            centerY = pos.y;
          } else {
            centerX = cmd.center.x;
            centerY = cmd.center.y;
          }
        } else if (time > endTime) {
          // After zoom transition
          currentZoom = cmd.level;
          zoom = cmd.level;
        }
      } else if (cmd.type === 'pan') {
        const duration = cmd.duration || 0.5;
        const startTime = cmd.at;
        const endTime = cmd.at + duration;

        if (time >= startTime && time <= endTime) {
          const t = (time - startTime) / duration;
          const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

          const target = cmd.to === 'mouse'
            ? getCursorAt(cursorTrack, timeMs)
            : cmd.to;

          centerX = currentCenterX + (target.x - currentCenterX) * ease;
          centerY = currentCenterY + (target.y - currentCenterY) * ease;
        } else if (time > endTime) {
          const target = cmd.to === 'mouse'
            ? getCursorAt(cursorTrack, timeMs)
            : cmd.to;
          currentCenterX = target.x;
          currentCenterY = target.y;
        }
      } else if (cmd.type === 'hold') {
        // Keep current state
      }
    }

    states.push({ time, zoom, centerX, centerY });
    currentCenterX = centerX;
    currentCenterY = centerY;
  }

  return states;
}

// ============================================================================
// Apply Viewport to Video
// ============================================================================

/**
 * Apply viewport commands to a video using cursor track for mouse awareness
 */
export function applyViewport(
  inputVideo: string,
  outputVideo: string,
  cursorTrack: CursorTrack,
  config: ViewportConfig,
  resolution?: { width: number; height: number }
): boolean {
  if (!config.commands || config.commands.length === 0) {
    execSync(`cp "${inputVideo}" "${outputVideo}"`);
    return true;
  }

  // Auto-detect video dimensions
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
      if (w && h) { width = w; height = h; }
    }
    if (lines[1]) {
      videoDuration = parseFloat(lines[1]) || 5;
    }
  } catch {}

  // Build viewport timeline
  const timeline = buildViewportTimeline(config.commands, cursorTrack, videoDuration);

  if (timeline.length < 2) {
    execSync(`cp "${inputVideo}" "${outputVideo}"`);
    return true;
  }

  // Sample keyframes for ffmpeg expression (every 0.5s)
  const keyframes: ViewportState[] = [];
  for (let i = 0; i < timeline.length; i += 15) { // Every 15 frames = 0.5s at 30fps
    keyframes.push(timeline[i]);
  }
  keyframes.push(timeline[timeline.length - 1]);

  try {
    // Build piecewise expressions for zoom, centerX, centerY
    function buildExpr(getValue: (s: ViewportState) => number): string {
      let expr = String(getValue(keyframes[keyframes.length - 1]).toFixed(1));

      for (let i = keyframes.length - 2; i >= 0; i--) {
        const curr = keyframes[i];
        const next = keyframes[i + 1];
        const v0 = getValue(curr);
        const v1 = getValue(next);
        const t0 = curr.time;
        const t1 = next.time;

        if (t1 <= t0) continue;

        const slope = (v1 - v0) / (t1 - t0);
        const segment = `${v0.toFixed(1)}+${slope.toFixed(2)}*(t-${t0.toFixed(2)})`;
        expr = `if(lt(t\\,${t1.toFixed(2)})\\,${segment}\\,${expr})`;
      }

      return expr;
    }

    const zoomExpr = buildExpr(s => s.zoom);
    const cxExpr = buildExpr(s => s.centerX);
    const cyExpr = buildExpr(s => s.centerY);

    // Crop dimensions based on zoom
    const cropWExpr = `${width}/(${zoomExpr})`;
    const cropHExpr = `${height}/(${zoomExpr})`;

    // Crop position (center - size/2, clamped)
    const cropXExpr = `max(0\\,min(${width}-(${cropWExpr})\\,(${cxExpr})-(${cropWExpr})/2))`;
    const cropYExpr = `max(0\\,min(${height}-(${cropHExpr})\\,(${cyExpr})-(${cropHExpr})/2))`;

    const filter = `crop=w='${cropWExpr}':h='${cropHExpr}':x='${cropXExpr}':y='${cropYExpr}',scale=${width}:${height}`;

    execSync(
      `ffmpeg -y -i "${inputVideo}" -vf "${filter}" -c:a copy "${outputVideo}"`,
      { stdio: 'pipe' }
    );

    return existsSync(outputVideo);
  } catch (error) {
    console.error('Viewport effect failed:', error);
    return false;
  }
}

// ============================================================================
// Simple DSL Parser
// ============================================================================

/**
 * Parse viewport commands from YAML-style config
 */
export function parseViewportConfig(config: any): ViewportConfig {
  if (!config || !config.viewport) {
    return { commands: [] };
  }

  const commands: ViewportCommand[] = [];

  for (const item of config.viewport) {
    if (item.follow === 'mouse') {
      commands.push({
        type: 'follow',
        target: 'mouse',
        from: item.from || 0,
        to: item.to || 999,
        zoom: item.zoom,
      });
    } else if (item.zoom !== undefined) {
      commands.push({
        type: 'zoom',
        level: item.zoom,
        at: item.at || 0,
        duration: item.duration,
        center: item.center,
      });
    } else if (item.pan) {
      commands.push({
        type: 'pan',
        to: item.pan === 'mouse' ? 'mouse' : item.pan,
        at: item.at || 0,
        duration: item.duration,
      });
    }
  }

  return { commands };
}
