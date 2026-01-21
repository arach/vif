/**
 * vif-recorder
 *
 * Clean, stateless screen recording module.
 * Just captures pixels from a region - no scene logic, no overlays.
 *
 * Usage:
 *   const recorder = new Recorder();
 *   await recorder.start({ x: 0, y: 0, width: 1920, height: 1080, output: 'demo.mp4' });
 *   // ... do stuff ...
 *   await recorder.stop();
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { EventEmitter } from 'events';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RecordingRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecordingOptions {
  output: string;
  region?: RecordingRegion;
  audio?: boolean;
  showClicks?: boolean;
}

export type RecorderState = 'idle' | 'recording' | 'stopping';

export interface RecorderStatus {
  state: RecorderState;
  output?: string;
  region?: RecordingRegion;
  startedAt?: Date;
  pid?: number;
}

// ─── Recorder Class ──────────────────────────────────────────────────────────

export class Recorder extends EventEmitter {
  private state: RecorderState = 'idle';
  private process: ChildProcess | null = null;
  private currentOutput: string | null = null;
  private currentRegion: RecordingRegion | undefined;
  private startedAt: Date | null = null;

  constructor() {
    super();
  }

  /**
   * Get current recorder status
   */
  getStatus(): RecorderStatus {
    return {
      state: this.state,
      output: this.currentOutput ?? undefined,
      region: this.currentRegion,
      startedAt: this.startedAt ?? undefined,
      pid: this.process?.pid
    };
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.state === 'recording';
  }

  /**
   * Start recording
   * @throws Error if already recording
   */
  async start(options: RecordingOptions): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot start recording: state is '${this.state}'`);
    }

    const { output, region, audio = false, showClicks = false } = options;

    // Ensure output directory exists
    const dir = dirname(output);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Build screencapture args
    const args: string[] = ['-v']; // Video mode

    if (showClicks) args.push('-k');
    if (!audio) args.push('-x'); // No audio
    if (region) {
      args.push('-R', `${region.x},${region.y},${region.width},${region.height}`);
    }

    args.push(output);

    // Spawn screencapture process
    this.process = spawn('screencapture', args, {
      stdio: 'pipe',
      detached: false
    });

    this.currentOutput = output;
    this.currentRegion = region;
    this.startedAt = new Date();
    this.state = 'recording';

    // Handle process events
    this.process.on('error', (err) => {
      this.emit('error', err);
      this.reset();
    });

    this.process.on('close', (code) => {
      if (this.state === 'recording') {
        // Unexpected close
        this.emit('error', new Error(`screencapture exited unexpectedly with code ${code}`));
        this.reset();
      }
    });

    this.emit('started', { output, region });
  }

  /**
   * Stop recording
   * @returns Path to the recorded file
   * @throws Error if not recording
   */
  async stop(): Promise<string> {
    if (this.state !== 'recording') {
      throw new Error(`Cannot stop recording: state is '${this.state}'`);
    }

    if (!this.process || !this.currentOutput) {
      throw new Error('No active recording process');
    }

    this.state = 'stopping';
    const output = this.currentOutput;

    return new Promise((resolve, reject) => {
      const proc = this.process!;
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          this.reset();

          if (existsSync(output)) {
            this.emit('stopped', { output });
            resolve(output);
          } else {
            reject(new Error('Video file not created'));
          }
        }
      };

      proc.on('close', cleanup);
      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          this.reset();
          reject(err);
        }
      });

      // Send SIGINT to stop recording gracefully
      // Use process.kill with PID directly for more reliable signal delivery
      const pid = proc.pid;
      if (pid) {
        try {
          process.kill(pid, 'SIGINT');
        } catch {
          // Process might already be dead
        }
      }

      // Fallback timeout - screencapture should stop within 2 seconds
      setTimeout(() => {
        if (!resolved && pid) {
          // Force kill if still running
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            // Process might already be dead
          }
          // Give it a moment to die, then cleanup
          setTimeout(cleanup, 200);
        } else if (!resolved) {
          cleanup();
        }
      }, 2000);
    });
  }

  /**
   * Force stop recording (emergency cleanup)
   */
  forceStop(): void {
    if (this.process) {
      this.process.kill('SIGKILL');
    }
    this.reset();
    this.emit('force-stopped');
  }

  /**
   * Reset internal state
   */
  private reset(): void {
    this.state = 'idle';
    this.process = null;
    this.currentOutput = null;
    this.currentRegion = undefined;
    this.startedAt = null;
  }
}

// ─── Singleton for simple usage ──────────────────────────────────────────────

let defaultRecorder: Recorder | null = null;

export function getRecorder(): Recorder {
  if (!defaultRecorder) {
    defaultRecorder = new Recorder();
  }
  return defaultRecorder;
}

// ─── Convenience functions ───────────────────────────────────────────────────

/**
 * Start recording (uses default recorder instance)
 */
export async function startRecording(options: RecordingOptions): Promise<void> {
  return getRecorder().start(options);
}

/**
 * Stop recording (uses default recorder instance)
 */
export async function stopRecording(): Promise<string> {
  return getRecorder().stop();
}

/**
 * Get recorder status (uses default recorder instance)
 */
export function getRecorderStatus(): RecorderStatus {
  return getRecorder().getStatus();
}

/**
 * Check if recording (uses default recorder instance)
 */
export function isRecording(): boolean {
  return getRecorder().isRecording();
}

/**
 * Force stop recording (uses default recorder instance)
 */
export function forceStopRecording(): void {
  return getRecorder().forceStop();
}

/**
 * Record for a specific duration
 */
export async function recordDuration(
  options: RecordingOptions & { duration: number }
): Promise<string> {
  const recorder = new Recorder();

  await recorder.start(options);
  await new Promise(resolve => setTimeout(resolve, options.duration * 1000));
  return recorder.stop();
}
