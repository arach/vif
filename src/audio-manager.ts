/**
 * Vif Audio Manager
 *
 * Manages multi-channel audio for scene playback and post-processing.
 * - Channel 1 (narration): Real-time playback through BlackHole virtual mic
 * - Other channels: Recorded to timeline for post-processing mix
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { AudioConfig, AudioChannelConfig, AudioTrackConfig, SceneParser } from './dsl/parser.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AudioChannel {
  id: number;
  role: string;
  output: 'virtual-mic' | 'monitor' | 'both' | 'post-only';
  volume: number;
  pan: number;
}

export interface AudioEvent {
  type: 'play' | 'stop' | 'volume';
  channel: number;
  time: number;  // ms from recording start
  file?: string;
  fadeIn?: number;
  fadeOut?: number;
  loop?: boolean;
  volume?: number;
  duration?: number;  // For volume automation
  audioDuration?: number;  // Actual duration of audio file
}

export interface ActiveTrack {
  file: string;
  startTime: number;
  duration: number;
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
  volume: number;
}

// ─── Audio Manager ───────────────────────────────────────────────────────────

export class AudioManager {
  private channels: Map<number, AudioChannel> = new Map();
  private activeTracks: Map<number, ActiveTrack> = new Map();
  private timeline: AudioEvent[] = [];
  private recordingStartTime: number = 0;
  private basePath: string = '';

  // Callback to send commands to vif agent (for real-time playback)
  private sendToAgent?: (action: string, params: Record<string, unknown>) => Promise<unknown>;

  constructor() {
    // Default channel 1 for narration (real-time)
    this.channels.set(1, {
      id: 1,
      role: 'narration',
      output: 'virtual-mic',
      volume: 1.0,
      pan: 0,
    });
  }

  /**
   * Configure audio channels from scene config
   */
  configure(config: AudioConfig | undefined, basePath: string): void {
    this.basePath = basePath;

    if (!config) return;

    // Configure channels
    if (config.channels) {
      for (const [idStr, channelConfig] of Object.entries(config.channels)) {
        const id = parseInt(idStr, 10);
        this.channels.set(id, {
          id,
          role: channelConfig.role || 'custom',
          output: channelConfig.output || (id === 1 ? 'virtual-mic' : 'post-only'),
          volume: channelConfig.volume ?? 1.0,
          pan: channelConfig.pan ?? 0,
        });
      }
    }

    // Pre-load tracks will be started when recording begins
    // Store them for later processing
    if (config.tracks) {
      for (const track of config.tracks) {
        const resolvedFile = this.resolvePath(track.file);
        const startTime = SceneParser.parseDuration(track.startTime || 0);
        const fadeIn = SceneParser.parseDuration(track.fadeIn || 0);
        const fadeOut = SceneParser.parseDuration(track.fadeOut || 0);

        // Add to timeline as pre-scheduled event
        this.timeline.push({
          type: 'play',
          channel: track.channel,
          time: startTime,
          file: resolvedFile,
          fadeIn,
          fadeOut,
          loop: track.loop || false,
          volume: track.volume,
          audioDuration: this.getAudioDuration(resolvedFile),
        });
      }
    }
  }

  /**
   * Set the agent send function for real-time playback
   */
  setAgentSender(sender: (action: string, params: Record<string, unknown>) => Promise<unknown>): void {
    this.sendToAgent = sender;
  }

  /**
   * Mark the start of recording (for timeline sync)
   */
  startRecording(): void {
    this.recordingStartTime = Date.now();
  }

  /**
   * Get current time relative to recording start
   */
  private getCurrentTime(): number {
    return Date.now() - this.recordingStartTime;
  }

  /**
   * Play audio on a channel
   */
  async play(options: {
    file: string;
    channel?: number;
    wait?: boolean;
    fadeIn?: number;
    fadeOut?: number;
    startAt?: number;
    loop?: boolean;
  }): Promise<number> {
    const channel = options.channel ?? 1;
    const channelConfig = this.channels.get(channel) || this.getDefaultChannel(channel);
    const resolvedFile = this.resolvePath(options.file);
    const fadeIn = options.fadeIn ?? 0;
    const fadeOut = options.fadeOut ?? 0;
    const loop = options.loop ?? false;
    const duration = this.getAudioDuration(resolvedFile);

    // Check if there's an active track on this channel (crossfade)
    const existingTrack = this.activeTracks.get(channel);
    if (existingTrack) {
      // Add stop event for existing track with crossfade
      const crossfadeDuration = Math.max(fadeIn, existingTrack.fadeOut, 500);
      this.timeline.push({
        type: 'stop',
        channel,
        time: this.getCurrentTime(),
        fadeOut: crossfadeDuration,
      });
    }

    // Record event to timeline
    const event: AudioEvent = {
      type: 'play',
      channel,
      time: this.getCurrentTime(),
      file: resolvedFile,
      fadeIn,
      fadeOut,
      loop,
      audioDuration: duration,
    };
    this.timeline.push(event);

    // Track active state
    this.activeTracks.set(channel, {
      file: resolvedFile,
      startTime: this.getCurrentTime(),
      duration,
      fadeIn,
      fadeOut,
      loop,
      volume: channelConfig.volume,
    });

    // If channel outputs to virtual-mic, play through agent
    if (channelConfig.output === 'virtual-mic' || channelConfig.output === 'both') {
      if (this.sendToAgent) {
        const result = await this.sendToAgent('voice.play', { file: resolvedFile }) as { duration?: number };
        // Wait for playback if requested
        if (options.wait !== false) {
          const waitMs = (result.duration || duration / 1000) * 1000 + 200;
          await this.sleep(waitMs);
        }
      }
    } else if (options.wait !== false && channelConfig.output === 'post-only') {
      // For post-only channels, wait simulates the duration
      await this.sleep(duration);
    }

    return duration;
  }

  /**
   * Stop audio on a channel
   */
  async stop(options: { channel?: number; fadeOut?: number }): Promise<void> {
    const channel = options.channel;
    const fadeOut = options.fadeOut ?? 500;

    if (channel !== undefined) {
      // Stop specific channel
      this.timeline.push({
        type: 'stop',
        channel,
        time: this.getCurrentTime(),
        fadeOut,
      });
      this.activeTracks.delete(channel);

      // If it's the virtual-mic channel, stop agent playback
      const channelConfig = this.channels.get(channel);
      if (channelConfig?.output === 'virtual-mic' || channelConfig?.output === 'both') {
        if (this.sendToAgent) {
          await this.sendToAgent('voice.stop', {});
        }
      }
    } else {
      // Stop all channels
      for (const [ch] of this.activeTracks) {
        this.timeline.push({
          type: 'stop',
          channel: ch,
          time: this.getCurrentTime(),
          fadeOut,
        });
      }
      this.activeTracks.clear();

      if (this.sendToAgent) {
        await this.sendToAgent('voice.stop', {});
      }
    }
  }

  /**
   * Set volume on a channel (with optional animation)
   */
  async setVolume(options: { channel: number; volume: number; duration?: number }): Promise<void> {
    const { channel, volume, duration = 0 } = options;

    this.timeline.push({
      type: 'volume',
      channel,
      time: this.getCurrentTime(),
      volume,
      duration,
    });

    // Update channel config
    const channelConfig = this.channels.get(channel);
    if (channelConfig) {
      channelConfig.volume = volume;
    }
  }

  /**
   * Get the recorded timeline
   */
  getTimeline(): AudioEvent[] {
    return [...this.timeline];
  }

  /**
   * Generate FFmpeg filter_complex for post-processing
   */
  generateFilterComplex(videoPath: string, videoDuration?: number): { inputs: string[]; filterComplex: string; hasAudio: boolean } {
    const inputs: string[] = [videoPath];
    const filterParts: string[] = [];
    const mixInputs: string[] = [];

    // Group events by channel
    const channelEvents = new Map<number, AudioEvent[]>();
    for (const event of this.timeline) {
      if (!channelEvents.has(event.channel)) {
        channelEvents.set(event.channel, []);
      }
      channelEvents.get(event.channel)!.push(event);
    }

    let inputIndex = 1;  // Start after video input [0]

    for (const [channel, events] of channelEvents) {
      const channelConfig = this.channels.get(channel) || this.getDefaultChannel(channel);

      // Skip virtual-mic only channels (they're captured in video)
      if (channelConfig.output === 'virtual-mic') {
        continue;
      }

      // Process play events for this channel
      const playEvents = events.filter(e => e.type === 'play' && e.file);

      for (let i = 0; i < playEvents.length; i++) {
        const event = playEvents[i];
        if (!event.file) continue;

        inputs.push(event.file);
        const streamLabel = `ch${channel}_${i}`;

        // Build filter for this audio segment
        const filters: string[] = [];

        // Delay to position in timeline
        const delayMs = Math.round(event.time);
        if (delayMs > 0) {
          filters.push(`adelay=${delayMs}|${delayMs}`);
        }

        // Fade in
        if (event.fadeIn && event.fadeIn > 0) {
          filters.push(`afade=t=in:st=0:d=${event.fadeIn / 1000}`);
        }

        // Fade out (calculate position based on duration)
        if (event.fadeOut && event.fadeOut > 0 && event.audioDuration) {
          // Check if there's a stop event for this
          const stopEvent = events.find(e =>
            e.type === 'stop' && e.time > event.time
          );
          const endTime = stopEvent ? stopEvent.time : event.time + event.audioDuration;
          const fadeOutStart = (endTime - event.time - event.fadeOut) / 1000;
          if (fadeOutStart > 0) {
            filters.push(`afade=t=out:st=${fadeOutStart}:d=${event.fadeOut / 1000}`);
          }
        }

        // Volume (from channel config or event override)
        const volume = event.volume ?? channelConfig.volume;
        if (volume !== 1.0) {
          filters.push(`volume=${volume}`);
        }

        // Loop handling
        if (event.loop) {
          filters.push('aloop=loop=-1:size=2e+09');
        }

        // Build the filter string
        const filterChain = filters.length > 0 ? filters.join(',') : 'anull';
        filterParts.push(`[${inputIndex}:a]${filterChain}[${streamLabel}]`);
        mixInputs.push(`[${streamLabel}]`);

        inputIndex++;
      }
    }

    if (mixInputs.length === 0) {
      return { inputs: [videoPath], filterComplex: '', hasAudio: false };
    }

    // Combine all streams with amix, then trim to video duration
    let amixFilter = `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=2`;
    if (videoDuration && videoDuration > 0) {
      // Trim audio to match video duration exactly
      amixFilter += `,atrim=0:${videoDuration},asetpts=PTS-STARTPTS`;
    }
    amixFilter += '[aout]';
    filterParts.push(amixFilter);

    return {
      inputs,
      filterComplex: filterParts.join(';'),
      hasAudio: true,
    };
  }

  /**
   * Render final mix by combining video with audio timeline
   */
  renderFinalMix(videoPath: string, outputPath: string): boolean {
    // Get video duration for trimming audio
    const videoDuration = this.getAudioDuration(videoPath) / 1000;  // Convert ms to seconds
    const { inputs, filterComplex, hasAudio } = this.generateFilterComplex(videoPath, videoDuration);

    if (!hasAudio) {
      // No post-processing audio, just copy the video
      try {
        execSync(`cp "${videoPath}" "${outputPath}"`, { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    }

    // Build FFmpeg command
    const inputArgs = inputs.map(f => `-i "${f}"`).join(' ');
    const cmd = `ffmpeg -y ${inputArgs} -filter_complex "${filterComplex}" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k "${outputPath}"`;

    try {
      execSync(cmd, { stdio: 'pipe' });
      return true;
    } catch (error) {
      console.error('Audio mix failed:', error);
      return false;
    }
  }

  /**
   * Reset the manager for a new recording
   */
  reset(): void {
    this.timeline = [];
    this.activeTracks.clear();
    this.recordingStartTime = 0;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private resolvePath(file: string): string {
    if (file.startsWith('/') || file.startsWith('~')) {
      return file.replace(/^~/, process.env.HOME || '');
    }
    return resolve(this.basePath, file);
  }

  private getDefaultChannel(id: number): AudioChannel {
    return {
      id,
      role: 'custom',
      output: id === 1 ? 'virtual-mic' : 'post-only',
      volume: 1.0,
      pan: 0,
    };
  }

  private getAudioDuration(filePath: string): number {
    if (!existsSync(filePath)) {
      return 0;
    }

    try {
      const result = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const duration = parseFloat(result.trim());
      return isNaN(duration) ? 0 : duration * 1000;  // Return ms
    } catch {
      return 0;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let defaultAudioManager: AudioManager | null = null;

export function getAudioManager(): AudioManager {
  if (!defaultAudioManager) {
    defaultAudioManager = new AudioManager();
  }
  return defaultAudioManager;
}

export function resetAudioManager(): void {
  if (defaultAudioManager) {
    defaultAudioManager.reset();
  }
  defaultAudioManager = null;
}
