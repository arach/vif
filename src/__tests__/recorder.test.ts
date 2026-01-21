/**
 * Recorder Module Tests
 *
 * Tests the screen recording functionality including:
 * - Starting and stopping recordings
 * - Process lifecycle management
 * - File creation verification
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Recorder } from '../recorder/index.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

// Helper to check if screencapture processes are running
function getScreencaptureProcesses(): string[] {
  try {
    const output = execSync('pgrep -l screencapture', { encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return []; // No processes found
  }
}

// Helper to kill any stale screencapture processes
function cleanupScreencapture(): void {
  try {
    execSync('pkill -9 screencapture', { stdio: 'ignore' });
  } catch {
    // No processes to kill
  }
}

describe('Recorder', () => {
  let recorder: Recorder;
  let testOutputPath: string;

  beforeEach(() => {
    cleanupScreencapture();
    recorder = new Recorder();
    testOutputPath = join(tmpdir(), `vif-test-${Date.now()}.mp4`);
  });

  afterEach(async () => {
    // Ensure recorder is stopped
    if (recorder.isRecording()) {
      recorder.forceStop();
    }

    // Clean up test file
    if (existsSync(testOutputPath)) {
      unlinkSync(testOutputPath);
    }

    // Clean up any stale processes
    cleanupScreencapture();
  });

  describe('start()', () => {
    it('should start recording and create a process', async () => {
      await recorder.start({ output: testOutputPath });

      expect(recorder.isRecording()).toBe(true);
      expect(recorder.getStatus().state).toBe('recording');

      // Verify screencapture process is running
      const processes = getScreencaptureProcesses();
      expect(processes.length).toBeGreaterThan(0);
    });

    it('should throw if already recording', async () => {
      await recorder.start({ output: testOutputPath });

      await expect(
        recorder.start({ output: testOutputPath })
      ).rejects.toThrow(/Cannot start recording/);
    });

    it('should emit started event', async () => {
      let emittedOutput: string | undefined;

      recorder.on('started', ({ output }) => {
        emittedOutput = output;
      });

      await recorder.start({ output: testOutputPath });

      expect(emittedOutput).toBe(testOutputPath);
    });
  });

  describe('stop()', () => {
    it('should stop recording and create video file', async () => {
      await recorder.start({ output: testOutputPath });

      // Record for a brief moment
      await new Promise(resolve => setTimeout(resolve, 1000));

      const outputPath = await recorder.stop();

      expect(recorder.isRecording()).toBe(false);
      expect(recorder.getStatus().state).toBe('idle');
      expect(outputPath).toBe(testOutputPath);
      expect(existsSync(testOutputPath)).toBe(true);
    });

    it('should kill the screencapture process', async () => {
      await recorder.start({ output: testOutputPath });
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify process is running
      expect(getScreencaptureProcesses().length).toBeGreaterThan(0);

      await recorder.stop();

      // Give it a moment to fully terminate
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify process is gone
      const processes = getScreencaptureProcesses();
      expect(processes.length).toBe(0);
    });

    it('should throw if not recording', async () => {
      await expect(recorder.stop()).rejects.toThrow(/Cannot stop recording/);
    });

    it('should emit stopped event', async () => {
      let emittedOutput: string | undefined;

      recorder.on('stopped', ({ output }) => {
        emittedOutput = output;
      });

      await recorder.start({ output: testOutputPath });
      await new Promise(resolve => setTimeout(resolve, 500));
      await recorder.stop();

      expect(emittedOutput).toBe(testOutputPath);
    });
  });

  describe('forceStop()', () => {
    it('should immediately kill the recording process', async () => {
      await recorder.start({ output: testOutputPath });

      recorder.forceStop();

      expect(recorder.isRecording()).toBe(false);

      // Give it a moment
      await new Promise(resolve => setTimeout(resolve, 300));

      const processes = getScreencaptureProcesses();
      expect(processes.length).toBe(0);
    });
  });

  describe('getStatus()', () => {
    it('should return idle status initially', () => {
      const status = recorder.getStatus();

      expect(status.state).toBe('idle');
      expect(status.output).toBeUndefined();
      expect(status.pid).toBeUndefined();
    });

    it('should return recording status while recording', async () => {
      await recorder.start({ output: testOutputPath });

      const status = recorder.getStatus();

      expect(status.state).toBe('recording');
      expect(status.output).toBe(testOutputPath);
      expect(status.pid).toBeDefined();
      expect(status.startedAt).toBeInstanceOf(Date);
    });
  });
});
