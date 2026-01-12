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
// ElevenLabs API
// ============================================================================

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Popular ElevenLabs voices (premade)
export const ELEVENLABS_VOICES = {
  rachel: '21m00Tcm4TlvDq8ikWAM',
  drew: '29vD33N1CtxCmqQRPOHJ',
  clyde: '2EiwWnXFnvU5JabPnv8n',
  paul: '5Q0t7uMcjvnagumLfvZi',
  domi: 'AZnzlk1XvdvUeBnXmlld',
  dave: 'CYw3kZ02Hs0563khs1Fj',
  fin: 'D38z5RcWu1voky8WS1ja',
  sarah: 'EXAVITQu4vr4xnSDxMaL',
  antoni: 'ErXwobaYiN019PkySvjV',
  thomas: 'GBv7mTt0atIp3Br8iCZE',
  charlie: 'IKne3meq5aSn9XLyUdCD',
  george: 'JBFqnCBsd6RMkjVDRZzb',
  emily: 'LcfcDJNUP1GQjkzn1xUU',
  elli: 'MF3mGyEYCl7XYWbV9V6O',
  callum: 'N2lVS1w4EtoT3dr4eOWO',
  patrick: 'ODq5zmih8GrVes37Dizd',
  harry: 'SOYHLrjzK2X1ezoPC6cr',
  liam: 'TX3LPaxmHKxFdv7VOQHJ',
  dorothy: 'ThT5KcBeYPX3keUQqHPh',
  josh: 'TxGEqnHWrfWFTfGW9XjX',
  arnold: 'VR6AewLTigWG4xSOukaG',
  charlotte: 'XB0fDUnXU5powFXDhCwa',
  alice: 'Xb7hH8MSUJpSbSDYk0k2',
  matilda: 'XrExE9yKIg1WjnnlVkGX',
  james: 'ZQe5CZNOzWyzPSCn5a3c',
  joseph: 'Zlb1dXrM653N07WRdFW3',
  jessica: 'cgSgspJ2msm6clMCkdW9',
  michael: 'flq6f7yk4E4fJM5XTYuZ',
  ethan: 'g5CIjZEefAph4nQFvHAz',
  chris: 'iP95p4xoKVk53GoZ742B',
  brian: 'nPczCjzI2devNBz1zQrb',
  daniel: 'onwK4e9ZLuTAKqWW03F9',
  lily: 'pFZP5JQG7iQjIQuC4Bku',
  bill: 'pqHfZKP75CvOlQylNhV4',
  bella: 'EkK5I93jTn4sHxGEKpZ0',
  nicole: 'piTKgcLEGmPE4e6mEKli',
  adam: 'pNInz6obpgDQGcFmaJgB',
  sam: 'yoZ06aMxZJJ28mfd3POQ',
};

/**
 * Get ElevenLabs voice ID from name
 */
function getElevenLabsVoiceId(voice: string): string {
  const lower = voice.toLowerCase();
  return ELEVENLABS_VOICES[lower as keyof typeof ELEVENLABS_VOICES] || voice;
}

/**
 * Generate speech using ElevenLabs API directly
 */
async function elevenlabsTTS(
  text: string,
  outputPath: string,
  options: VoiceOptions
): Promise<boolean> {
  const apiKey = options.apiKey || process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    console.warn('ELEVENLABS_API_KEY not set');
    return false;
  }

  const voiceId = getElevenLabsVoiceId(options.voice || 'rachel');

  try {
    const response = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs API error:', error);
      return false;
    }

    const buffer = await response.arrayBuffer();
    writeFileSync(outputPath, Buffer.from(buffer));

    return existsSync(outputPath);
  } catch (error) {
    console.error('ElevenLabs TTS failed:', error);
    return false;
  }
}

// ============================================================================
// OpenAI TTS API
// ============================================================================

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';

/**
 * Generate speech using OpenAI TTS API
 */
async function openaiTTS(
  text: string,
  outputPath: string,
  options: VoiceOptions
): Promise<boolean> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set');
    return false;
  }

  const voice = options.voice || 'alloy';

  try {
    const response = await fetch(OPENAI_TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI TTS API error:', error);
      return false;
    }

    const buffer = await response.arrayBuffer();
    writeFileSync(outputPath, Buffer.from(buffer));

    return existsSync(outputPath);
  } catch (error) {
    console.error('OpenAI TTS failed:', error);
    return false;
  }
}

// ============================================================================
// Speakeasy CLI Integration
// ============================================================================

/**
 * Check if Speakeasy CLI is available
 */
export function hasSpeakeasy(): boolean {
  try {
    const result = spawnSync('which', ['speakeasy'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return result.status === 0 && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Generate speech using Speakeasy CLI
 */
async function speakeasyCLI(
  text: string,
  outputPath: string,
  options: VoiceOptions
): Promise<boolean> {
  const { provider = 'elevenlabs', voice } = options;

  if (!hasSpeakeasy()) {
    console.warn('Speakeasy CLI not found');
    return false;
  }

  try {
    // Build speakeasy command
    const args = ['--provider', provider];
    // For OpenAI, pass voice if specified; for ElevenLabs, let it use config default
    if (voice && provider === 'openai') {
      args.push('--voice', voice);
    }
    args.push('--out', outputPath);
    args.push(text);

    const result = spawnSync('speakeasy', args, {
      encoding: 'utf-8',
      timeout: 60000,
    });

    if (result.status !== 0) {
      console.error('Speakeasy error:', result.stderr);
      return false;
    }

    return existsSync(outputPath);
  } catch (error) {
    console.error('Speakeasy CLI failed:', error);
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

  // Use Speakeasy CLI for elevenlabs/openai (it's already configured)
  if (provider === 'elevenlabs' || provider === 'openai') {
    const success = await speakeasyCLI(cleanText, outputPath, options);
    if (success) return true;
    console.warn(`Speakeasy ${provider} failed, falling back to system voice`);
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

  console.log('ElevenLabs voices (requires ELEVENLABS_API_KEY):');
  const elevenLabsNames = Object.keys(ELEVENLABS_VOICES);
  console.log(`  Available: ${elevenLabsNames.slice(0, 12).join(', ')}...`);
  console.log('  Popular: rachel, sarah, charlotte, emily, adam, josh\n');

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
