/**
 * Voice/Narration Integration
 *
 * Generate voiceovers using Speakeasy or system TTS.
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, unlinkSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { hasFFmpeg } from './index.js';

// ============================================================================
// Types
// ============================================================================

export interface VoiceOptions {
  /** TTS provider */
  provider?: 'speakeasy' | 'openai' | 'elevenlabs' | 'system';
  /** Voice name/ID */
  voice?: string;
  /** Speaking rate (words per minute) */
  rate?: number;
  /** API key (for openai/elevenlabs) */
  apiKey?: string;
}

export interface NarrationSegment {
  text: string;
  startTime: number;
  duration?: number;
  outputPath?: string;
}

// ============================================================================
// System Voices (macOS)
// ============================================================================

/**
 * Get available macOS system voices
 */
export function getSystemVoices(): string[] {
  try {
    const output = execSync('say -v "?"', { encoding: 'utf-8' });
    const voices = output
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const match = line.match(/^(\S+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean) as string[];
    return voices;
  } catch {
    return ['Samantha', 'Alex', 'Victoria', 'Daniel'];
  }
}

/**
 * Recommended voices by type
 */
export const RECOMMENDED_VOICES = {
  neutral: ['Samantha', 'Alex', 'Karen', 'Daniel'],
  professional: ['Samantha', 'Alex', 'Moira', 'Daniel'],
  friendly: ['Samantha', 'Karen', 'Tessa'],
  dramatic: ['Alex', 'Daniel', 'Oliver'],
};

// ============================================================================
// Speakeasy Integration
// ============================================================================

/**
 * Check if Speakeasy is available
 */
export function hasSpeakeasy(): boolean {
  try {
    // Check if speakeasy npm package is importable
    const result = spawnSync('node', ['-e', 'require("speakeasy")'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 5000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Generate speech using Speakeasy
 */
async function speakeasyTTS(
  text: string,
  outputPath: string,
  options: VoiceOptions
): Promise<boolean> {
  const { provider = 'system', voice, rate = 180, apiKey } = options;

  // Create a temp script to run Speakeasy
  const scriptPath = join(tmpdir(), `vif-speakeasy-${Date.now()}.mjs`);
  const script = `
import { SpeakEasy } from 'speakeasy';

const speaker = new SpeakEasy({
  provider: '${provider === 'speakeasy' ? 'openai' : provider}',
  ${voice ? `openaiVoice: '${voice}',` : ''}
  ${voice ? `elevenlabsVoice: '${voice}',` : ''}
  ${voice ? `systemVoice: '${voice}',` : ''}
  rate: ${rate},
  ${apiKey ? `apiKeys: { openai: '${apiKey}', elevenlabs: '${apiKey}' },` : ''}
});

const text = ${JSON.stringify(text)};
const output = '${outputPath}';

try {
  await speaker.speakToFile(text, output);
  console.log('OK');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
`;

  writeFileSync(scriptPath, script);

  try {
    const result = execSync(`node "${scriptPath}"`, {
      encoding: 'utf-8',
      timeout: 60000,
      env: {
        ...process.env,
        OPENAI_API_KEY: apiKey || process.env.OPENAI_API_KEY,
        ELEVENLABS_API_KEY: apiKey || process.env.ELEVENLABS_API_KEY,
      },
    });
    return result.includes('OK');
  } catch (error) {
    console.error('Speakeasy TTS failed:', error);
    return false;
  } finally {
    try {
      unlinkSync(scriptPath);
    } catch {}
  }
}

// ============================================================================
// System TTS (macOS)
// ============================================================================

/**
 * Generate speech using macOS say command
 */
function systemTTS(
  text: string,
  outputPath: string,
  options: VoiceOptions
): boolean {
  const { voice = 'Samantha', rate = 180 } = options;

  try {
    // Generate AIFF first (say command native format)
    const aiffPath = outputPath.replace(/\.[^.]+$/, '.aiff');

    execSync(
      `say -v "${voice}" -r ${rate} -o "${aiffPath}" "${text.replace(/"/g, '\\"')}"`,
      { timeout: 60000 }
    );

    // Convert to MP3 if ffmpeg available
    if (hasFFmpeg() && !outputPath.endsWith('.aiff')) {
      execSync(
        `ffmpeg -y -i "${aiffPath}" -acodec libmp3lame -b:a 192k "${outputPath}"`,
        { stdio: 'pipe', timeout: 30000 }
      );
      unlinkSync(aiffPath);
    } else if (!outputPath.endsWith('.aiff')) {
      // Rename if can't convert
      execSync(`mv "${aiffPath}" "${outputPath}"`);
    }

    return existsSync(outputPath);
  } catch (error) {
    console.error('System TTS failed:', error);
    return false;
  }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Generate narration audio from text
 */
export async function generateNarration(
  text: string,
  outputPath: string,
  options: VoiceOptions = {}
): Promise<boolean> {
  const { provider = 'system' } = options;

  // Clean up text for TTS
  const cleanText = text
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) {
    console.warn('Empty narration text');
    return false;
  }

  // Try Speakeasy for non-system providers
  if (provider !== 'system' && hasSpeakeasy()) {
    const success = await speakeasyTTS(cleanText, outputPath, options);
    if (success) return true;
    console.warn('Speakeasy failed, falling back to system voice');
  }

  // Fall back to system TTS
  return systemTTS(cleanText, outputPath, options);
}

/**
 * Generate multiple narration segments with timing
 */
export async function generateNarrationSegments(
  segments: NarrationSegment[],
  outputDir: string,
  options: VoiceOptions = {}
): Promise<NarrationSegment[]> {
  const results: NarrationSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const outputPath = join(outputDir, `narration-${i.toString().padStart(3, '0')}.mp3`);

    const success = await generateNarration(segment.text, outputPath, options);

    if (success) {
      // Get duration of generated audio
      let duration = segment.duration;
      if (!duration && hasFFmpeg()) {
        try {
          const durationStr = execSync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`,
            { encoding: 'utf-8' }
          ).trim();
          duration = parseFloat(durationStr);
        } catch {}
      }

      results.push({
        ...segment,
        outputPath,
        duration,
      });
    }
  }

  return results;
}

/**
 * Estimate narration duration based on text length
 * Average speaking rate is ~150 words per minute
 */
export function estimateNarrationDuration(text: string, rate = 150): number {
  const words = text.split(/\s+/).length;
  return (words / rate) * 60;
}

/**
 * Print available voices
 */
export function printVoiceOptions(): void {
  console.log('\n🎙️ Voice Options:\n');

  console.log('System voices (macOS):');
  const voices = getSystemVoices();
  console.log(`  Available: ${voices.slice(0, 10).join(', ')}${voices.length > 10 ? '...' : ''}`);
  console.log('  Recommended: Samantha, Alex, Daniel, Karen\n');

  console.log('OpenAI voices (requires API key):');
  console.log('  alloy, echo, fable, onyx, nova, shimmer\n');

  console.log('ElevenLabs voices (requires API key):');
  console.log('  See https://elevenlabs.io/voice-library\n');

  console.log('📁 Usage in storyboard:');
  console.log('   voice:');
  console.log('     provider: system  # or openai, elevenlabs');
  console.log('     voice: Samantha');
  console.log('     rate: 180\n');

  console.log('   sequence:');
  console.log('     - type: intro');
  console.log('       title: "Hello"');
  console.log('       narration: "Welcome to the demo."');
  console.log('');
}
