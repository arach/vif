/**
 * Cursor Automation Module
 *
 * Provides cursor control for automated demo recording.
 * Uses native Swift mouse controller (vif-mouse) for macOS.
 */

import { execSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// Types
// ============================================================================

export interface Point {
  x: number;
  y: number;
}

export interface MoveAction {
  type: 'move';
  to: Point;
  duration?: number;
}

export interface ClickAction {
  type: 'click';
  at?: Point;
  button?: 'left' | 'right';
  count?: number;
}

export interface DragAction {
  type: 'drag';
  from: Point;
  to: Point;
  duration?: number;
}

export interface WaitAction {
  type: 'wait';
  duration: number;
}

export interface TypeAction {
  type: 'type';
  text: string;
}

export interface KeypressAction {
  type: 'keypress';
  key: string;
  modifiers?: ('command' | 'option' | 'control' | 'shift')[];
}

export interface ZoomMarker {
  type: 'zoom';
  level: number;
  at?: Point;
}

export type CursorAction = MoveAction | ClickAction | DragAction | WaitAction | TypeAction | KeypressAction | ZoomMarker;

export interface CursorScript {
  app?: string;
  url?: string;
  actions: CursorAction[];
}

export interface CursorRecording {
  positions: Array<{ x: number; y: number; timestamp: number }>;
  clicks: Array<{ x: number; y: number; timestamp: number; button: string }>;
  zoomMarkers: Array<{ time: number; level: number; x: number; y: number }>;
  startTime: number;
  endTime: number;
}

// ============================================================================
// Mouse Controller
// ============================================================================

/**
 * Get path to vif-mouse binary
 */
function getMouseBinaryPath(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, 'vif-mouse');
}

/**
 * Check if mouse control is available
 */
export function hasMouseControl(): boolean {
  const binary = getMouseBinaryPath();
  if (!existsSync(binary)) {
    return false;
  }
  try {
    execSync(`"${binary}" pos`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current mouse position
 */
export function getMousePosition(): Point {
  const binary = getMouseBinaryPath();
  try {
    const result = execSync(`"${binary}" pos`, { encoding: 'utf-8' }).trim();
    const [x, y] = result.split(',').map(Number);
    return { x, y };
  } catch {
    // Fallback to JXA
    try {
      const result = execSync(
        `osascript -l JavaScript -e 'ObjC.import("AppKit"); var loc = $.NSEvent.mouseLocation; loc.x.toFixed(0) + "," + loc.y.toFixed(0);'`,
        { encoding: 'utf-8' }
      ).trim();
      const [x, y] = result.split(',').map(Number);
      return { x, y };
    } catch {
      return { x: 0, y: 0 };
    }
  }
}

/**
 * Move mouse to position instantly
 */
export function moveMouse(to: Point): void {
  const binary = getMouseBinaryPath();
  execSync(`"${binary}" move ${Math.round(to.x)} ${Math.round(to.y)}`, { stdio: 'pipe' });
}

/**
 * Move mouse smoothly with easing
 */
export async function smoothMove(to: Point, duration = 0.3): Promise<void> {
  if (duration <= 0.05) {
    moveMouse(to);
    return;
  }

  const from = getMousePosition();
  const steps = Math.max(10, Math.round(duration * 120));
  const stepDelay = (duration * 1000) / steps;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // Ease-in-out
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const x = from.x + (to.x - from.x) * ease;
    const y = from.y + (to.y - from.y) * ease;

    moveMouse({ x, y });
    await sleep(stepDelay);
  }
}

/**
 * Click at position
 */
export function click(at?: Point, button: 'left' | 'right' = 'left', count = 1): void {
  const binary = getMouseBinaryPath();
  const pos = at || getMousePosition();
  const cmd = count === 2 ? 'doubleclick' : button === 'right' ? 'rightclick' : 'click';
  execSync(`"${binary}" ${cmd} ${Math.round(pos.x)} ${Math.round(pos.y)}`, { stdio: 'pipe' });
}

/**
 * Drag from one point to another
 */
export function drag(from: Point, to: Point): void {
  const binary = getMouseBinaryPath();
  execSync(
    `"${binary}" drag ${Math.round(from.x)} ${Math.round(from.y)} ${Math.round(to.x)} ${Math.round(to.y)}`,
    { stdio: 'pipe' }
  );
}

// ============================================================================
// Script Execution
// ============================================================================

/**
 * Execute a cursor script with recording
 */
export async function executeCursorScript(script: CursorScript): Promise<CursorRecording> {
  const recording: CursorRecording = {
    positions: [],
    clicks: [],
    zoomMarkers: [],
    startTime: Date.now(),
    endTime: 0,
  };

  // Start position tracking
  let tracking = true;
  const trackInterval = setInterval(() => {
    if (!tracking) return;
    const pos = getMousePosition();
    recording.positions.push({
      x: pos.x,
      y: pos.y,
      timestamp: Date.now() - recording.startTime,
    });
  }, 33);

  try {
    // Open app if specified
    if (script.app) {
      execSync(`open -a "${script.app}"`, { stdio: 'pipe' });
      await sleep(1000);
    }

    // Open URL if specified
    if (script.url) {
      execSync(`open "${script.url}"`, { stdio: 'pipe' });
      await sleep(1500);
    }

    // Execute actions
    for (const action of script.actions) {
      await executeAction(action, recording);
    }
  } finally {
    tracking = false;
    clearInterval(trackInterval);
    recording.endTime = Date.now();
  }

  return recording;
}

async function executeAction(action: CursorAction, recording: CursorRecording): Promise<void> {
  switch (action.type) {
    case 'move':
      await smoothMove(action.to, action.duration ?? 0.3);
      break;

    case 'click': {
      if (action.at) {
        await smoothMove(action.at, 0.1);
      }
      click(action.at, action.button ?? 'left', action.count ?? 1);
      const pos = getMousePosition();
      recording.clicks.push({
        x: pos.x,
        y: pos.y,
        timestamp: Date.now() - recording.startTime,
        button: action.button ?? 'left',
      });
      break;
    }

    case 'drag':
      await smoothMove(action.from, 0.1);
      drag(action.from, action.to);
      break;

    case 'wait':
      await sleep(action.duration * 1000);
      break;

    case 'type':
      // Use AppleScript for typing
      execSync(`osascript -e 'tell application "System Events" to keystroke "${action.text}"'`, {
        stdio: 'pipe',
      });
      break;

    case 'keypress': {
      // Build modifier string for AppleScript
      const modifiers = action.modifiers || [];
      const modifierStr = modifiers.map(m => {
        switch (m) {
          case 'command': return 'command down';
          case 'option': return 'option down';
          case 'control': return 'control down';
          case 'shift': return 'shift down';
          default: return '';
        }
      }).filter(Boolean).join(', ');

      const script = modifierStr
        ? `tell application "System Events" to keystroke "${action.key}" using {${modifierStr}}`
        : `tell application "System Events" to keystroke "${action.key}"`;

      execSync(`osascript -e '${script}'`, { stdio: 'pipe' });
      break;
    }

    case 'zoom': {
      const pos = action.at || getMousePosition();
      recording.zoomMarkers.push({
        time: (Date.now() - recording.startTime) / 1000,
        level: action.level,
        x: pos.x,
        y: pos.y,
      });
      break;
    }
  }
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Save cursor recording to file
 */
export function saveCursorRecording(recording: CursorRecording, path: string): void {
  writeFileSync(path, JSON.stringify(recording, null, 2));
}

/**
 * Convert cursor recording to cursor track format (for viewport.ts)
 */
export function toCursorTrack(recording: CursorRecording) {
  return {
    positions: recording.positions,
    clicks: recording.clicks,
    startTime: recording.startTime,
    endTime: recording.endTime,
  };
}

// ============================================================================
// CLI Compatibility Aliases
// ============================================================================

/** @deprecated Use CursorScript instead */
export type DemoScript = CursorScript;

/** @deprecated Use CursorAction instead */
export type DemoAction = CursorAction;

/** @deprecated Use hasMouseControl instead */
export const hasCursorControl = hasMouseControl;

/** @deprecated Use executeCursorScript instead */
export const executeDemo = executeCursorScript;

/** @deprecated Use saveCursorRecording instead */
export function saveDemoRecording(recording: CursorRecording, basePath: string): void {
  saveCursorRecording(recording, `${basePath}-cursor.json`);
}
