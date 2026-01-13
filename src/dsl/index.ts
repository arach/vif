/**
 * Vif Declarative DSL
 *
 * Transform imperative demos into declarative YAML scene files.
 */

export { SceneParser, parser } from './parser.js';
export type {
  Scene,
  App,
  Stage,
  View,
  LabelDef,
  Action,
  SceneFile,
  ParsedScene
} from './parser.js';

export { SceneRunner, runScene } from './runner.js';
export type { RunnerOptions } from './runner.js';
