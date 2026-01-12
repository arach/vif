/**
 * Music Integration
 *
 * Fetch royalty-free music from Pixabay and other sources.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, createWriteStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import https from 'https';

// ============================================================================
// Types
// ============================================================================

export interface MusicTrack {
  id: number;
  title: string;
  artist: string;
  duration: number;
  url: string;
  tags: string[];
  source: 'pixabay' | 'local';
}

export interface MusicSearchOptions {
  query?: string;
  /** Genre/category */
  category?: 'backgrounds' | 'beats' | 'ambient' | 'cinematic' | 'corporate' | 'happy' | 'inspiring';
  /** Minimum duration in seconds */
  minDuration?: number;
  /** Maximum duration in seconds */
  maxDuration?: number;
  /** Sort order */
  order?: 'popular' | 'latest';
  /** Number of results */
  limit?: number;
}

// ============================================================================
// Pixabay Music API
// ============================================================================

const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;
const PIXABAY_MUSIC_API = 'https://pixabay.com/api/';

/**
 * Search for music on Pixabay
 * Requires PIXABAY_API_KEY environment variable
 */
export async function searchPixabayMusic(options: MusicSearchOptions = {}): Promise<MusicTrack[]> {
  if (!PIXABAY_API_KEY) {
    console.warn('PIXABAY_API_KEY not set. Get a free key at https://pixabay.com/api/docs/');
    return [];
  }

  const params = new URLSearchParams({
    key: PIXABAY_API_KEY,
    q: options.query || '',
    category: options.category || '',
    order: options.order || 'popular',
    per_page: String(options.limit || 10),
  });

  // Note: Pixabay's music API is actually part of their video API
  // For audio specifically, we use the audio endpoint
  const url = `https://pixabay.com/api/videos/?${params}&video_type=film`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    // Pixabay doesn't have a dedicated music API in the free tier
    // We'll use their audio from videos or suggest alternatives
    console.log('Note: Pixabay free API has limited music. Consider using local files.');
    return [];
  } catch (error) {
    console.error('Pixabay search failed:', error);
    return [];
  }
}

/**
 * Download a music track to a local file
 */
export async function downloadTrack(track: MusicTrack, outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const file = createWriteStream(outputPath);

    https.get(track.url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(true);
      });
    }).on('error', (error) => {
      console.error('Download failed:', error);
      resolve(false);
    });
  });
}

// ============================================================================
// Free Music Sources
// ============================================================================

/**
 * Curated list of free music sources with direct links
 * These are CC0 or royalty-free tracks
 */
export const FREE_MUSIC_SOURCES = {
  // Uppbeat free tracks (requires attribution in some cases)
  uppbeat: 'https://uppbeat.io/browse/music',

  // Free Music Archive
  fma: 'https://freemusicarchive.org/',

  // Incompetech (Kevin MacLeod) - CC BY
  incompetech: 'https://incompetech.com/music/royalty-free/music.html',

  // YouTube Audio Library (for YouTube use)
  youtube: 'https://studio.youtube.com/channel/audio',

  // Mixkit (free, no attribution)
  mixkit: 'https://mixkit.co/free-stock-music/',
};

/**
 * Generate placeholder audio (silence or tone) for testing
 */
export function generatePlaceholderAudio(
  outputPath: string,
  duration: number,
  type: 'silence' | 'tone' = 'silence'
): boolean {
  try {
    if (type === 'silence') {
      execSync(
        `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${duration} -c:a aac "${outputPath}"`,
        { stdio: 'pipe' }
      );
    } else {
      // Generate a gentle ambient tone
      execSync(
        `ffmpeg -y -f lavfi -i "sine=frequency=220:duration=${duration}" -af "volume=0.1,afade=t=in:d=1,afade=t=out:st=${duration - 1}:d=1" -c:a aac "${outputPath}"`,
        { stdio: 'pipe' }
      );
    }
    return existsSync(outputPath);
  } catch (error) {
    console.error('Failed to generate placeholder audio:', error);
    return false;
  }
}

// ============================================================================
// Music Selection Helper
// ============================================================================

export interface MusicSuggestion {
  mood: string;
  genres: string[];
  tempo: 'slow' | 'medium' | 'fast';
  searchTerms: string[];
}

/**
 * Get music suggestions based on video content type
 */
export function suggestMusic(contentType: string): MusicSuggestion {
  const suggestions: Record<string, MusicSuggestion> = {
    'product-demo': {
      mood: 'upbeat, professional',
      genres: ['corporate', 'tech', 'inspiring'],
      tempo: 'medium',
      searchTerms: ['corporate upbeat', 'tech background', 'product demo music'],
    },
    'tutorial': {
      mood: 'calm, focused',
      genres: ['ambient', 'lo-fi', 'minimal'],
      tempo: 'slow',
      searchTerms: ['tutorial background', 'calm ambient', 'focus music'],
    },
    'announcement': {
      mood: 'exciting, energetic',
      genres: ['cinematic', 'epic', 'trailer'],
      tempo: 'fast',
      searchTerms: ['announcement fanfare', 'exciting reveal', 'launch music'],
    },
    'explainer': {
      mood: 'friendly, approachable',
      genres: ['acoustic', 'happy', 'light'],
      tempo: 'medium',
      searchTerms: ['explainer video music', 'friendly background', 'happy acoustic'],
    },
  };

  return suggestions[contentType] || suggestions['product-demo'];
}

/**
 * Print music source recommendations
 */
export function printMusicRecommendations(contentType?: string): void {
  console.log('\n🎵 Royalty-Free Music Sources:\n');

  console.log('No attribution required:');
  console.log('  • Mixkit: https://mixkit.co/free-stock-music/');
  console.log('  • Pixabay: https://pixabay.com/music/ (free account needed)');

  console.log('\nAttribution required (CC BY):');
  console.log('  • Incompetech: https://incompetech.com/music/royalty-free/');
  console.log('  • Free Music Archive: https://freemusicarchive.org/');

  console.log('\nFor YouTube videos:');
  console.log('  • YouTube Audio Library: https://studio.youtube.com/channel/audio');

  if (contentType) {
    const suggestion = suggestMusic(contentType);
    console.log(`\n💡 For "${contentType}" videos, search for:`);
    console.log(`   Mood: ${suggestion.mood}`);
    console.log(`   Genres: ${suggestion.genres.join(', ')}`);
    console.log(`   Search terms: "${suggestion.searchTerms.join('", "')}"`);
  }

  console.log('\n📁 Usage in storyboard:');
  console.log('   music:');
  console.log('     source: ./music/background.mp3');
  console.log('     volume: 0.3');
  console.log('     fadeIn: 1');
  console.log('     fadeOut: 2');
  console.log('');
}
