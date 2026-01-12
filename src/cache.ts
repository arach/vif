/**
 * Asset Cache
 *
 * Cache expensive resources (music, generated audio) locally
 * so repeated renders don't re-fetch from external APIs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { homedir } from 'os';

// ============================================================================
// Types
// ============================================================================

export interface CacheEntry {
  key: string;
  path: string;
  source: string;
  createdAt: string;
  size: number;
  metadata?: Record<string, unknown>;
}

export interface CacheManifest {
  version: string;
  entries: Record<string, CacheEntry>;
}

// ============================================================================
// Cache Directory
// ============================================================================

const CACHE_DIR = join(homedir(), '.cache', 'vif');
const MANIFEST_PATH = join(CACHE_DIR, 'manifest.json');

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function loadManifest(): CacheManifest {
  ensureCacheDir();
  if (existsSync(MANIFEST_PATH)) {
    try {
      return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    } catch {
      return { version: '1', entries: {} };
    }
  }
  return { version: '1', entries: {} };
}

function saveManifest(manifest: CacheManifest): void {
  ensureCacheDir();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Generate a cache key from source descriptor
 */
export function generateCacheKey(source: string, metadata?: Record<string, unknown>): string {
  const input = metadata
    ? `${source}:${JSON.stringify(metadata)}`
    : source;
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Check if an asset is cached
 */
export function isCached(key: string): boolean {
  const manifest = loadManifest();
  const entry = manifest.entries[key];
  if (!entry) return false;
  return existsSync(entry.path);
}

/**
 * Get cached asset path
 */
export function getCachedPath(key: string): string | null {
  const manifest = loadManifest();
  const entry = manifest.entries[key];
  if (!entry) return null;
  if (!existsSync(entry.path)) return null;
  return entry.path;
}

/**
 * Get or fetch an asset
 * Returns cached path if available, otherwise calls fetcher and caches result
 */
export async function getOrFetch(
  source: string,
  extension: string,
  fetcher: () => Promise<string | Buffer>,
  metadata?: Record<string, unknown>
): Promise<string> {
  const key = generateCacheKey(source, metadata);

  // Check cache first
  const cached = getCachedPath(key);
  if (cached) {
    console.log(`[cache] Hit: ${source.slice(0, 50)}...`);
    return cached;
  }

  console.log(`[cache] Miss: ${source.slice(0, 50)}... fetching`);

  // Fetch the asset
  const result = await fetcher();

  // Save to cache
  ensureCacheDir();
  const cachePath = join(CACHE_DIR, `${key}${extension}`);

  if (typeof result === 'string') {
    // Result is a file path - copy it
    copyFileSync(result, cachePath);
  } else {
    // Result is a buffer - write it
    writeFileSync(cachePath, result);
  }

  // Update manifest
  const manifest = loadManifest();
  manifest.entries[key] = {
    key,
    path: cachePath,
    source,
    createdAt: new Date().toISOString(),
    size: statSync(cachePath).size,
    metadata,
  };
  saveManifest(manifest);

  return cachePath;
}

/**
 * Cache a local file (for music, etc.)
 */
export function cacheFile(
  sourcePath: string,
  source: string,
  metadata?: Record<string, unknown>
): string {
  const key = generateCacheKey(source, metadata);

  // Check cache first
  const cached = getCachedPath(key);
  if (cached) return cached;

  // Copy to cache
  ensureCacheDir();
  const ext = sourcePath.match(/\.[^.]+$/)?.[0] || '';
  const cachePath = join(CACHE_DIR, `${key}${ext}`);
  copyFileSync(sourcePath, cachePath);

  // Update manifest
  const manifest = loadManifest();
  manifest.entries[key] = {
    key,
    path: cachePath,
    source,
    createdAt: new Date().toISOString(),
    size: statSync(cachePath).size,
    metadata,
  };
  saveManifest(manifest);

  return cachePath;
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Get cache statistics
 */
export function getCacheStats(): { entries: number; totalSize: number; oldestEntry?: string } {
  const manifest = loadManifest();
  const entries = Object.values(manifest.entries);

  let totalSize = 0;
  let oldestDate: string | undefined;

  for (const entry of entries) {
    if (existsSync(entry.path)) {
      totalSize += entry.size;
      if (!oldestDate || entry.createdAt < oldestDate) {
        oldestDate = entry.createdAt;
      }
    }
  }

  return {
    entries: entries.length,
    totalSize,
    oldestEntry: oldestDate,
  };
}

/**
 * Clear the cache
 */
export function clearCache(): void {
  const manifest = loadManifest();

  for (const entry of Object.values(manifest.entries)) {
    try {
      if (existsSync(entry.path)) {
        unlinkSync(entry.path);
      }
    } catch {}
  }

  saveManifest({ version: '1', entries: {} });
  console.log('[cache] Cleared');
}

/**
 * Print cache info
 */
export function printCacheInfo(): void {
  const stats = getCacheStats();
  const sizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);

  console.log('\n📦 Vif Asset Cache\n');
  console.log(`Location: ${CACHE_DIR}`);
  console.log(`Entries: ${stats.entries}`);
  console.log(`Total Size: ${sizeMB} MB`);
  if (stats.oldestEntry) {
    console.log(`Oldest: ${new Date(stats.oldestEntry).toLocaleDateString()}`);
  }
  console.log('\nCached assets (music, external resources) are stored here');
  console.log('to avoid re-fetching on each render.\n');
  console.log('Commands:');
  console.log('  vif cache         - Show cache info');
  console.log('  vif cache clear   - Clear the cache');
  console.log('');
}
