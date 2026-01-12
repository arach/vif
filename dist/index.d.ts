/**
 * Vif - Vivid screen capture for macOS
 * Screenshots, video, and GIFs.
 */
import { ChildProcess } from 'child_process';
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
    region?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
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
    region?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
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
/**
 * Get all visible windows on screen
 * @param appName Optional filter by application name
 */
export declare function getWindows(appName?: string): WindowInfo[];
/**
 * Find a window by app name
 * Returns the first matching window
 */
export declare function findWindow(appName: string): WindowInfo | null;
/**
 * Activate (bring to front) an application
 */
export declare function activateApp(appName: string): void;
/**
 * Capture a screenshot
 */
export declare function screenshot(options: ScreenshotOptions): boolean;
/**
 * Capture a window by app name
 */
export declare function screenshotApp(appName: string, output: string, options?: Partial<ScreenshotOptions>): boolean;
/**
 * Capture the entire screen
 */
export declare function screenshotFullscreen(output: string): boolean;
/**
 * Start video recording
 * Returns a handle to stop the recording
 */
export declare function startRecording(options: VideoOptions): {
    stop: () => Promise<string>;
    process: ChildProcess;
};
/**
 * Record video for a specific duration
 */
export declare function recordVideo(options: VideoOptions & {
    duration: number;
}): Promise<string>;
/**
 * Check if ffmpeg is available
 */
export declare function hasFFmpeg(): boolean;
/**
 * Convert/process video using ffmpeg
 */
export declare function convertVideo(options: ConvertOptions): boolean;
/**
 * Create an optimized web-ready MP4 from a video
 */
export declare function optimizeForWeb(input: string, output: string, maxWidth?: number): boolean;
/**
 * Create a GIF from a video
 */
export declare function videoToGif(input: string, output: string, options?: {
    width?: number;
    fps?: number;
}): boolean;
/**
 * Click at a screen position
 * Uses AppleScript CGEvent for click simulation
 */
export declare function click(x: number, y: number): void;
/**
 * Move mouse to position
 */
export declare function moveMouse(x: number, y: number): void;
/**
 * Quick screenshot with auto-generated filename
 */
export declare function quickShot(prefix?: string): string;
/**
 * List all app windows (useful for debugging)
 */
export declare function listWindows(): void;
export interface AudioTrack {
    /** Path to audio file */
    track: string;
    /** Volume (0.0 - 1.0) */
    volume?: number;
    /** Fade in duration (seconds) */
    fadeIn?: number;
    /** Fade out duration (seconds) */
    fadeOut?: number;
    /** Start offset in audio (seconds) */
    startAt?: number;
}
export interface ClipTransition {
    type: 'none' | 'fade' | 'crossfade' | 'dissolve';
    duration?: number;
}
export interface StoryboardClip {
    /** Path to source video/image */
    source: string;
    /** Start time in source (seconds) */
    startTime?: number;
    /** Duration to use (seconds) */
    duration?: number;
    /** Sync to beat number or 'next' */
    sync?: number | 'beat';
    /** Transition to next clip */
    transition?: ClipTransition | string;
    /** Label for this clip */
    label?: string;
}
export interface Storyboard {
    /** Project name */
    name: string;
    /** Output file path */
    output: string;
    /** Audio configuration */
    audio?: AudioTrack;
    /** Sequence of clips */
    sequence: StoryboardClip[];
    /** Default transition between clips */
    defaultTransition?: ClipTransition | string;
    /** Target resolution */
    resolution?: {
        width: number;
        height: number;
    };
    /** Target frame rate */
    fps?: number;
}
export interface AudioAnalysis {
    /** Duration in seconds */
    duration: number;
    /** Sample rate */
    sampleRate: number;
    /** Channels */
    channels: number;
    /** BPM (if detected or specified) */
    bpm?: number;
    /** Beat timestamps in seconds */
    beats?: number[];
    /** Format */
    format: string;
}
export interface TakeMetadata {
    version: number;
    file: string;
    note: string;
    timestamp: string;
    parentVersion?: number;
    pruned?: boolean;
}
export interface TakeHistory {
    asset: string;
    currentVersion: number;
    takes: TakeMetadata[];
}
/**
 * Analyze an audio file
 * Returns duration, format, and optionally beat timestamps if BPM is provided
 */
export declare function analyzeAudio(input: string, bpm?: number): AudioAnalysis | null;
/**
 * Get beat timestamps for a given BPM and duration
 */
export declare function getBeats(bpm: number, duration: number, offset?: number): number[];
export interface MixOptions {
    /** Input video file */
    video: string;
    /** Input audio file */
    audio: string;
    /** Output file */
    output: string;
    /** Audio volume (0.0 - 1.0, default: 1.0) */
    volume?: number;
    /** Fade in duration (seconds) */
    fadeIn?: number;
    /** Fade out duration (seconds) */
    fadeOut?: number;
    /** Replace original audio (default: true) */
    replace?: boolean;
    /** Loop audio if shorter than video */
    loop?: boolean;
    /** Start position in audio (seconds) */
    audioStart?: number;
}
/**
 * Mix audio track with video
 */
export declare function mixAudio(options: MixOptions): boolean;
/**
 * Create a new take of an asset
 */
export declare function createTake(assetPath: string, note?: string): TakeMetadata | null;
/**
 * List all takes for an asset
 */
export declare function listTakes(assetPath: string): TakeMetadata[];
/**
 * Revert to a specific take
 */
export declare function revertTake(assetPath: string, version: number): boolean;
/**
 * Prune old takes, keeping only the most recent N
 */
export declare function pruneTakes(assetPath: string, keep: number): number;
/**
 * Parse a storyboard YAML file
 */
export declare function parseStoryboard(path: string): Storyboard | null;
/**
 * Get video duration using ffprobe
 */
export declare function getVideoDuration(path: string): number;
/**
 * Render a storyboard to video
 */
export declare function renderStoryboard(storyboard: Storyboard, options?: {
    basePath?: string;
    bpm?: number;
    verbose?: boolean;
}): boolean;
/**
 * Render a storyboard from a YAML file
 */
export declare function renderStoryboardFile(path: string, options?: {
    bpm?: number;
    verbose?: boolean;
}): boolean;
export * from './templates/index.js';
export * from './slides.js';
export * from './storyboard.js';
export type { ChildProcess };
//# sourceMappingURL=index.d.ts.map