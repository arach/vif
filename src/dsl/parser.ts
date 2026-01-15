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
  targets?: 'connected' | 'standalone' | 'auto';  // Target resolution mode
  countdown?: boolean | number;  // Enable countdown before recording (true = 3 seconds, or specify count)
  cues?: {
    start?: string;  // Sound file to play before recording starts
    end?: string;    // Sound file to play when scene completes
    tick?: string;   // Sound file to play on each countdown tick (default: tick.mp3)
  };
}

export interface App {
  type?: 'native' | 'react' | 'webpage' | 'electron';
  name: string;
  path?: string;  // Optional path to specific app bundle
  window?: {
    width?: number;
    height?: number;
    center?: boolean;
  };
}

export interface EntryTiming {
  timing?: number;  // Default ms per layer (default: 300)
  layers?: {
    backdrop?: number;   // Z1 - backdrop appear
    app?: number;        // Z2 - app center/position
    viewport?: number;   // Z4 - viewport frame
    controls?: number;   // Z5 - controls ready
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
  entry?: number | EntryTiming;  // Choreographed entry timing (ms per layer or detailed config)
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

// Easing types for animations
export type EasingType =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'spring'
  | { type: 'spring'; tension?: number; friction?: number }
  | { type: 'cubic-bezier'; values: [number, number, number, number] };

// Zoom transition timing
export interface ZoomTransition {
  duration?: number | string;  // Duration in ms or "0.3s"
  easing?: EasingType;
}

// Zoom action - supports both crop and lens styles
export interface ZoomAction {
  zoom: {
    type?: 'crop' | 'lens';       // Visual style (default: crop)
    level: number;                 // Zoom magnification (1.5 = 150%)
    target?: 'cursor' | { x: number; y: number };  // What to zoom to (default: cursor)
    in?: ZoomTransition;           // Zoom-in timing
    out?: ZoomTransition;          // Zoom-out timing
    hold?: number | string | 'auto';  // How long to stay zoomed (default: auto = until next action)
    // Lens-specific options
    size?: number;                 // Lens diameter in pixels (for type: lens)
    border?: boolean;              // Show lens border (for type: lens)
    shadow?: boolean;              // Show lens drop shadow (for type: lens)
  };
}

// Zoom reset action
export interface ZoomResetAction { 'zoom.reset': true | { duration?: number | string; easing?: EasingType } }

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
  | ZoomAction
  | ZoomResetAction;

export interface SceneFile {
  scene: Scene;
  import?: string[];
  app?: App;
  stage?: Stage;
  views?: { [name: string]: View };
  labels?: { [name: string]: LabelDef };
  sequence: Action[];
}

export interface ParsedScene {
  scene: Scene;
  app?: App;
  stage: Stage;
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
