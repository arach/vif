/**
 * Vif Declarative DSL Parser
 *
 * Parses YAML scene files and validates against the schema.
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import YAML from 'yaml';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Scene {
  name: string;
  output?: string;
  mode?: 'draft' | 'final';
}

export interface App {
  type?: 'native' | 'react' | 'webpage' | 'electron';
  name: string;
  window?: {
    width?: number;
    height?: number;
    center?: boolean;
  };
}

export interface Stage {
  backdrop?: boolean | 'gradient' | string;
  viewport?: {
    app?: string | 'auto';
    padding?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
}

export interface ViewItem {
  [name: string]: { x?: number; y?: number };
}

export interface View {
  region?: string | { x?: number; y?: number; width?: number | string; height?: number | string };
  items?: ViewItem[];
  positions?: { [name: string]: { x: number | string; y: number | string } };
}

export interface LabelStyle {
  font?: string;
  size?: string;
  color?: string;
  background?: string;
}

export interface LabelDef {
  position?: 'top' | 'bottom' | { x: number; y: number };
  text?: string;
  style?: LabelStyle;
}

// Action types
export interface CursorShowAction { 'cursor.show': true | {} }
export interface CursorHideAction { 'cursor.hide': true | {} }
export interface CursorMoveToAction { 'cursor.moveTo': { x: number; y: number; duration?: number } }
export interface CursorClickAction { 'cursor.click': true | {} }
export interface ClickAction { click: string | { x: number; y: number } }
export interface WaitAction { wait: string | number }
export interface RecordAction { record: 'start' | 'stop' }
export interface NavigateAction {
  navigate: {
    through: string;
    items: string[];
    wait?: string | number;
  }
}
export interface LabelAction { label: string; text?: string }
export interface LabelUpdateAction { 'label.update': string }
export interface LabelHideAction { 'label.hide': true | {} }
export interface UseAction { use: string }

// Typer actions (visual typing overlay)
export interface TyperTypeAction { 'typer.type': { text: string; style?: 'default' | 'terminal' | 'code' | 'input'; delay?: number } }
export interface TyperHideAction { 'typer.hide': true | {} }
export interface TyperClearAction { 'typer.clear': true | {} }

// Input actions (actual keyboard input)
export interface InputTypeAction { 'input.type': { text: string; delay?: number } }
export interface InputKeysAction { 'input.keys': string[] }

// Voice actions (audio playback through virtual mic)
export interface VoicePlayAction { 'voice.play': { file: string; wait?: boolean } | string }
export interface VoiceStopAction { 'voice.stop': true | {} }

// ─── Multi-Channel Audio System ──────────────────────────────────────────────

// Audio channel configuration
export interface AudioChannelConfig {
  role?: 'music' | 'narration' | 'sfx' | 'ambient' | 'custom';
  output?: 'virtual-mic' | 'monitor' | 'both' | 'post-only';
  volume?: number;  // 0.0 - 1.0
  pan?: number;     // -1.0 (left) to 1.0 (right)
}

// Audio track configuration (pre-loaded tracks)
export interface AudioTrackConfig {
  file: string;
  channel: number;
  startTime?: number | string;  // When to start in scene timeline
  duration?: number | string;   // Override duration (auto-detect if omitted)
  fadeIn?: number | string;
  fadeOut?: number | string;
  loop?: boolean;
  volume?: number;  // Override channel volume
}

// Scene-level audio configuration
export interface AudioConfig {
  channels?: { [id: number]: AudioChannelConfig };
  tracks?: AudioTrackConfig[];
}

// Audio play action
export interface AudioPlayAction {
  'audio.play': {
    file: string;
    channel?: number;           // Default: 1
    wait?: boolean;             // Default: true for channel 1, false for others
    fadeIn?: number | string;
    fadeOut?: number | string;
    startAt?: number | string;  // Offset within audio file
    loop?: boolean;
  };
}

// Audio stop action
export interface AudioStopAction {
  'audio.stop': {
    channel?: number;           // Omit to stop all
    fadeOut?: number | string;
  } | true;
}

// Audio volume action
export interface AudioVolumeAction {
  'audio.volume': {
    channel: number;
    volume: number;
    duration?: number | string;  // Animate over time
  };
}

export type Action =
  | CursorShowAction
  | CursorHideAction
  | CursorMoveToAction
  | CursorClickAction
  | ClickAction
  | WaitAction
  | RecordAction
  | NavigateAction
  | LabelAction
  | LabelUpdateAction
  | LabelHideAction
  | UseAction
  | TyperTypeAction
  | TyperHideAction
  | TyperClearAction
  | InputTypeAction
  | InputKeysAction
  | VoicePlayAction
  | VoiceStopAction
  | AudioPlayAction
  | AudioStopAction
  | AudioVolumeAction;

export interface SceneFile {
  scene: Scene;
  import?: string[];
  app?: App;
  stage?: Stage;
  audio?: AudioConfig;
  views?: { [name: string]: View };
  labels?: { [name: string]: LabelDef };
  sequence: Action[];
}

export interface ParsedScene {
  scene: Scene;
  app?: App;
  stage: Stage;
  audio?: AudioConfig;
  views: Map<string, View>;
  labels: Map<string, LabelDef>;
  sequence: Action[];
  basePath: string;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

export class SceneParser {
  private basePath: string = '';

  /**
   * Parse a scene file from path
   */
  parseFile(filePath: string): ParsedScene {
    if (!existsSync(filePath)) {
      throw new Error(`Scene file not found: ${filePath}`);
    }

    const content = readFileSync(filePath, 'utf-8');
    this.basePath = dirname(resolve(filePath));

    return this.parse(content);
  }

  /**
   * Parse scene from YAML string
   */
  parse(content: string): ParsedScene {
    const data = YAML.parse(content) as SceneFile;

    // Validate required fields
    if (!data.scene) {
      throw new Error('Scene file must have a "scene" section');
    }
    if (!data.scene.name) {
      throw new Error('Scene must have a "name"');
    }
    if (!data.sequence || !Array.isArray(data.sequence)) {
      throw new Error('Scene must have a "sequence" array');
    }

    // Process imports
    const views = new Map<string, View>();
    const labels = new Map<string, LabelDef>();
    const appRef: { app?: App } = { app: data.app };

    if (data.import) {
      for (const importPath of data.import) {
        this.processImport(importPath, views, labels, appRef);
      }
    }

    // Add local views and labels
    if (data.views) {
      for (const [name, view] of Object.entries(data.views)) {
        views.set(name, view);
      }
    }
    if (data.labels) {
      for (const [name, label] of Object.entries(data.labels)) {
        labels.set(name, label);
      }
    }

    // Set defaults for stage
    const stage: Stage = data.stage || {};
    if (stage.backdrop === undefined) {
      stage.backdrop = true;
    }

    return {
      scene: data.scene,
      app: appRef.app,
      stage,
      audio: data.audio,
      views,
      labels,
      sequence: data.sequence,
      basePath: this.basePath,
    };
  }

  /**
   * Process an import file
   */
  private processImport(
    importPath: string,
    views: Map<string, View>,
    labels: Map<string, LabelDef>,
    appRef: { app?: App }
  ): void {
    const fullPath = resolve(this.basePath, importPath);

    if (!existsSync(fullPath)) {
      throw new Error(`Import file not found: ${fullPath}`);
    }

    const content = readFileSync(fullPath, 'utf-8');
    const data = YAML.parse(content);

    // Import app definition (if not already set)
    if (data.app && !appRef.app) {
      appRef.app = data.app;
    }

    // Import views
    if (data.views) {
      for (const [name, view] of Object.entries(data.views)) {
        views.set(name, view as View);
      }
    }

    // Import labels
    if (data.labels) {
      for (const [name, label] of Object.entries(data.labels)) {
        labels.set(name, label as LabelDef);
      }
    }
  }

  /**
   * Parse duration string (e.g., "500ms", "1s", "2.5s") to milliseconds
   */
  static parseDuration(value: string | number): number {
    if (typeof value === 'number') {
      return value;
    }

    const str = value.trim().toLowerCase();

    if (str.endsWith('ms')) {
      return parseFloat(str.slice(0, -2));
    }
    if (str.endsWith('s')) {
      return parseFloat(str.slice(0, -1)) * 1000;
    }

    // Assume milliseconds if no unit
    return parseFloat(str);
  }
}

export const parser = new SceneParser();
