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
export type { ChildProcess };
//# sourceMappingURL=index.d.ts.map