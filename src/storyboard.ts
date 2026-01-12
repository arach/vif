/**
 * Enhanced Storyboard System
 *
 * Supports: intro, screenshot, video, slide, outro
 * With: music, voiceover (via Speakeasy), transitions
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join, dirname, resolve, basename } from 'path';
import { tmpdir } from 'os';
import YAML from 'yaml';
import { renderSlide, closeBrowser } from './slides.js';
import { templates, TemplateName } from './templates/index.js';
import { screenshot, screenshotApp, hasFFmpeg } from './index.js';
import { generateNarration as generateNarrationVoice, VoiceOptions } from './voice.js';

// ============================================================================
// Types
// ============================================================================

export interface MusicConfig {
  /** Local file path or 'pixabay' for API */
  source: string;
  /** Search query if using pixabay */
  query?: string;
  /** Volume 0.0 - 1.0 */
  volume?: number;
  /** Fade in duration (seconds) */
  fadeIn?: number;
  /** Fade out duration (seconds) */
  fadeOut?: number;
}

export interface VoiceConfig {
  /** TTS provider: openai, elevenlabs, system */
  provider?: 'openai' | 'elevenlabs' | 'system';
  /** Voice name */
  voice?: string;
  /** Speaking rate */
  rate?: number;
}

export interface TransitionConfig {
  type: 'none' | 'fade' | 'crossfade' | 'wipe';
  duration?: number;
}

// Block types
export interface SlideBlock {
  type: 'slide';
  template: TemplateName;
  duration: number;
  narration?: string;
  transition?: TransitionConfig | string;
  // Template-specific props
  title?: string;
  subtitle?: string;
  cta?: string;
  url?: string;
  tagline?: string;
  logo?: string;
  background?: string;
  launchDate?: string;
}

export interface ScreenshotBlock {
  type: 'screenshot';
  /** App name to capture */
  app?: string;
  /** URL to load and capture (uses Puppeteer) */
  url?: string;
  /** Window ID */
  windowId?: number;
  /** Duration to show */
  duration: number;
  narration?: string;
  transition?: TransitionConfig | string;
  /** Ken Burns effect */
  animate?: 'none' | 'zoom-in' | 'zoom-out' | 'pan';
}

export interface VideoBlock {
  type: 'video';
  /** Source video file */
  source: string;
  /** Start time in source */
  startTime?: number;
  /** Duration to use */
  duration?: number;
  narration?: string;
  transition?: TransitionConfig | string;
  /** Speed multiplier */
  speed?: number;
}

export interface IntroBlock extends Omit<SlideBlock, 'type'> {
  type: 'intro';
}

export interface OutroBlock extends Omit<SlideBlock, 'type'> {
  type: 'outro';
}

export type StoryboardBlock = SlideBlock | ScreenshotBlock | VideoBlock | IntroBlock | OutroBlock;

export interface EnhancedStoryboard {
  name: string;
  output: string;
  /** Target resolution */
  resolution?: { width: number; height: number };
  /** Target frame rate */
  fps?: number;
  /** Background music */
  music?: MusicConfig;
  /** Voice configuration for narration */
  voice?: VoiceConfig;
  /** Default transition between blocks */
  defaultTransition?: TransitionConfig | string;
  /** Sequence of blocks */
  sequence: StoryboardBlock[];
}

export interface RenderProgress {
  stage: string;
  current: number;
  total: number;
  message: string;
}

// ============================================================================
// Narration (delegates to voice.ts)
// ============================================================================

async function generateNarration(
  text: string,
  outputPath: string,
  config?: VoiceConfig
): Promise<boolean> {
  const voiceOptions: VoiceOptions = {
    provider: config?.provider || 'system',
    voice: config?.voice,
    rate: config?.rate || 180,
  };

  return generateNarrationVoice(text, outputPath, voiceOptions);
}

// ============================================================================
// Block Rendering
// ============================================================================

async function renderBlock(
  block: StoryboardBlock,
  outputPath: string,
  config: {
    resolution: { width: number; height: number };
    fps: number;
    basePath: string;
    voice?: VoiceConfig;
  }
): Promise<{ video: string; audio?: string }> {
  const { resolution, fps, basePath, voice } = config;
  const tempDir = dirname(outputPath);

  // Generate narration if present
  let audioPath: string | undefined;
  if (block.narration) {
    audioPath = outputPath.replace('.mp4', '-narration.mp3');
    await generateNarration(block.narration, audioPath, voice);
  }

  switch (block.type) {
    case 'intro':
    case 'outro':
    case 'slide': {
      const slideBlock = block as SlideBlock;
      const template = block.type === 'intro' ? 'title-card' :
                       block.type === 'outro' ? 'outro' :
                       slideBlock.template;

      // Render slide to PNG
      const pngPath = outputPath.replace('.mp4', '.png');
      await renderSlide({
        template,
        props: {
          title: slideBlock.title,
          subtitle: slideBlock.subtitle,
          cta: slideBlock.cta,
          url: slideBlock.url,
          tagline: slideBlock.tagline,
          logo: slideBlock.logo,
          background: slideBlock.background,
          launchDate: slideBlock.launchDate,
        } as any,
        output: pngPath,
        width: resolution.width,
        height: resolution.height
      });

      // Convert to video with duration
      const duration = slideBlock.duration || 3;
      execSync(
        `ffmpeg -y -loop 1 -i "${pngPath}" -c:v libx264 -t ${duration} -pix_fmt yuv420p -vf "fps=${fps}" "${outputPath}"`,
        { stdio: 'pipe' }
      );

      // Clean up PNG
      unlinkSync(pngPath);

      return { video: outputPath, audio: audioPath };
    }

    case 'screenshot': {
      const ssBlock = block as ScreenshotBlock;
      const pngPath = outputPath.replace('.mp4', '.png');

      if (ssBlock.app) {
        screenshotApp(ssBlock.app, pngPath);
      } else if (ssBlock.url) {
        // Use Puppeteer for URL screenshots
        const puppeteer = await import('puppeteer');
        const browser = await puppeteer.default.launch({ headless: true });
        const page = await browser.newPage();
        await page.setViewport({ width: resolution.width, height: resolution.height });
        await page.goto(ssBlock.url, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.screenshot({ path: pngPath });
        await browser.close();
      } else if (ssBlock.windowId) {
        screenshot({ output: pngPath, windowId: ssBlock.windowId });
      } else {
        screenshot({ output: pngPath });
      }

      // Convert to video with optional animation
      const duration = ssBlock.duration || 4;
      let filter = `fps=${fps},scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2`;

      if (ssBlock.animate === 'zoom-in') {
        filter += `,zoompan=z='min(zoom+0.001,1.2)':d=${duration * fps}:s=${resolution.width}x${resolution.height}`;
      } else if (ssBlock.animate === 'zoom-out') {
        filter += `,zoompan=z='if(lte(zoom,1.0),1.2,max(1.001,zoom-0.001))':d=${duration * fps}:s=${resolution.width}x${resolution.height}`;
      }

      execSync(
        `ffmpeg -y -loop 1 -i "${pngPath}" -c:v libx264 -t ${duration} -pix_fmt yuv420p -vf "${filter}" "${outputPath}"`,
        { stdio: 'pipe' }
      );

      unlinkSync(pngPath);
      return { video: outputPath, audio: audioPath };
    }

    case 'video': {
      const vidBlock = block as VideoBlock;
      const sourcePath = resolve(basePath, vidBlock.source);

      if (!existsSync(sourcePath)) {
        throw new Error(`Video source not found: ${sourcePath}`);
      }

      const args: string[] = ['-y', '-i', sourcePath];

      if (vidBlock.startTime !== undefined) {
        args.push('-ss', String(vidBlock.startTime));
      }
      if (vidBlock.duration !== undefined) {
        args.push('-t', String(vidBlock.duration));
      }

      // Normalize resolution
      args.push(
        '-vf', `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2,fps=${fps}`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-an', // Remove audio, we'll add music later
        outputPath
      );

      execSync(`ffmpeg ${args.map(a => `"${a}"`).join(' ')}`, { stdio: 'pipe' });
      return { video: outputPath, audio: audioPath };
    }

    default:
      throw new Error(`Unknown block type: ${(block as any).type}`);
  }
}

// ============================================================================
// Main Render Function
// ============================================================================

export async function renderEnhancedStoryboard(
  storyboard: EnhancedStoryboard,
  options?: {
    basePath?: string;
    verbose?: boolean;
    onProgress?: (progress: RenderProgress) => void;
  }
): Promise<boolean> {
  const { basePath = '.', verbose = false, onProgress } = options || {};

  if (!hasFFmpeg()) {
    console.error('ffmpeg not found. Install with: brew install ffmpeg');
    return false;
  }

  const log = verbose ? console.log : () => {};
  const progress = (stage: string, current: number, total: number, message: string) => {
    onProgress?.({ stage, current, total, message });
    log(`[${stage}] ${message}`);
  };

  const resolution = storyboard.resolution || { width: 1920, height: 1080 };
  const fps = storyboard.fps || 30;
  const outputPath = resolve(basePath, storyboard.output);

  // Create temp directory
  const tempDir = join(tmpdir(), `vif-storyboard-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  try {
    // Step 1: Render all blocks
    progress('render', 0, storyboard.sequence.length, 'Rendering blocks...');

    const renderedBlocks: Array<{ video: string; audio?: string }> = [];

    for (let i = 0; i < storyboard.sequence.length; i++) {
      const block = storyboard.sequence[i];
      progress('render', i + 1, storyboard.sequence.length, `Rendering ${block.type} block ${i + 1}...`);

      const blockOutput = join(tempDir, `block-${i.toString().padStart(3, '0')}.mp4`);
      const result = await renderBlock(block, blockOutput, {
        resolution,
        fps,
        basePath,
        voice: storyboard.voice
      });

      renderedBlocks.push(result);
    }

    // Close Puppeteer browser
    await closeBrowser();

    // Step 2: Concatenate video blocks
    progress('concat', 0, 1, 'Concatenating video blocks...');

    const concatListPath = join(tempDir, 'concat.txt');
    const concatContent = renderedBlocks.map(b => `file '${b.video}'`).join('\n');
    writeFileSync(concatListPath, concatContent);

    const concatenatedPath = join(tempDir, 'concatenated.mp4');
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${concatenatedPath}"`,
      { stdio: 'pipe' }
    );

    // Step 3: Mix narration audio
    progress('audio', 0, 2, 'Mixing narration...');

    let currentPath = concatenatedPath;
    const narrationPaths = renderedBlocks
      .map((b, i) => ({ audio: b.audio, index: i }))
      .filter(b => b.audio && existsSync(b.audio!));

    if (narrationPaths.length > 0) {
      // Calculate start times for each narration
      let currentTime = 0;
      const narrationInputs: string[] = [];
      const narrationFilters: string[] = [];

      for (let i = 0; i < renderedBlocks.length; i++) {
        const block = storyboard.sequence[i];
        const duration = (block as any).duration || 3;

        const narration = narrationPaths.find(n => n.index === i);
        if (narration?.audio) {
          narrationInputs.push(`-i "${narration.audio}"`);
          const inputIndex = narrationInputs.length; // 0 is video
          narrationFilters.push(`[${inputIndex}:a]adelay=${Math.round(currentTime * 1000)}|${Math.round(currentTime * 1000)}[a${inputIndex}]`);
        }

        currentTime += duration;
      }

      if (narrationInputs.length > 0) {
        const withNarrationPath = join(tempDir, 'with-narration.mp4');
        const mixInputs = narrationFilters.map((_, i) => `[a${i + 1}]`).join('');
        const mixFilter = `${narrationFilters.join(';')};${mixInputs}amix=inputs=${narrationInputs.length}:duration=longest:normalize=0[aout]`;

        execSync(
          `ffmpeg -y -i "${currentPath}" ${narrationInputs.join(' ')} -filter_complex "${mixFilter}" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -ac 2 -ar 48000 "${withNarrationPath}"`,
          { stdio: 'pipe' }
        );
        currentPath = withNarrationPath;
      }
    }

    // Step 4: Add background music
    progress('audio', 1, 2, 'Adding music...');

    if (storyboard.music) {
      let musicPath = storyboard.music.source;

      // Resolve relative path
      if (!musicPath.startsWith('/') && musicPath !== 'pixabay') {
        musicPath = resolve(basePath, musicPath);
      }

      if (musicPath === 'pixabay') {
        log('Pixabay music integration coming soon, skipping music...');
      } else if (existsSync(musicPath)) {
        const withMusicPath = join(tempDir, 'with-music.mp4');
        const volume = storyboard.music.volume || 0.3;
        const fadeIn = storyboard.music.fadeIn || 0;
        const fadeOut = storyboard.music.fadeOut || 0;

        // Get video duration
        const durationStr = execSync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${currentPath}"`,
          { encoding: 'utf-8' }
        ).trim();
        const videoDuration = parseFloat(durationStr);

        // Build audio filter
        let audioFilter = `volume=${volume}`;
        if (fadeIn > 0) {
          audioFilter += `,afade=t=in:st=0:d=${fadeIn}`;
        }
        if (fadeOut > 0) {
          audioFilter += `,afade=t=out:st=${videoDuration - fadeOut}:d=${fadeOut}`;
        }

        // Check if video already has audio
        const hasAudio = execSync(
          `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${currentPath}" | head -1`,
          { encoding: 'utf-8' }
        ).trim();

        if (hasAudio === 'audio') {
          // Mix with existing audio
          execSync(
            `ffmpeg -y -i "${currentPath}" -stream_loop -1 -i "${musicPath}" -filter_complex "[1:a]${audioFilter}[music];[0:a][music]amix=inputs=2:duration=first:normalize=0[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -ac 2 -ar 48000 -shortest "${withMusicPath}"`,
            { stdio: 'pipe' }
          );
        } else {
          // Just add music
          execSync(
            `ffmpeg -y -i "${currentPath}" -stream_loop -1 -i "${musicPath}" -filter_complex "[1:a]${audioFilter}[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -ac 2 -ar 48000 -shortest "${withMusicPath}"`,
            { stdio: 'pipe' }
          );
        }
        currentPath = withMusicPath;
      }
    }

    // Step 5: Final output
    progress('finalize', 0, 1, 'Finalizing...');

    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Final encode with QuickTime-friendly settings
    execSync(`ffmpeg -y -i "${currentPath}" -c:v copy -c:a aac -b:a 192k -ac 2 -ar 48000 -movflags +faststart "${outputPath}"`, { stdio: 'pipe' });

    progress('complete', 1, 1, `Output: ${outputPath}`);
    return existsSync(outputPath);

  } catch (error) {
    console.error('Render failed:', error);
    return false;
  } finally {
    // Clean up
    try {
      execSync(`rm -rf "${tempDir}"`, { stdio: 'pipe' });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================================
// Parse and Render
// ============================================================================

export function parseEnhancedStoryboard(path: string): EnhancedStoryboard | null {
  if (!existsSync(path)) {
    console.error(`Storyboard file not found: ${path}`);
    return null;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    return YAML.parse(content) as EnhancedStoryboard;
  } catch (error) {
    console.error('Failed to parse storyboard:', error);
    return null;
  }
}

export async function renderStoryboardFileEnhanced(
  path: string,
  options?: { verbose?: boolean }
): Promise<boolean> {
  const storyboard = parseEnhancedStoryboard(path);
  if (!storyboard) {
    return false;
  }

  return renderEnhancedStoryboard(storyboard, {
    basePath: dirname(path),
    ...options
  });
}
