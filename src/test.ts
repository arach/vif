/**
 * Vif Test Suite
 */

import { getWindows, listWindows, screenshotFullscreen, hasFFmpeg } from './index.js';
import { existsSync, unlinkSync } from 'fs';

console.log('Vif Test Suite\n');

// Test 1: System check
console.log('1. System Check');
console.log(`   screencapture: available`);
console.log(`   ffmpeg: ${hasFFmpeg() ? 'available' : 'not found'}`);
console.log('');

// Test 2: Window discovery
console.log('2. Window Discovery');
const windows = getWindows();
console.log(`   Found ${windows.length} windows`);
if (windows.length > 0) {
  console.log(`   First window: [${windows[0].id}] ${windows[0].owner}`);
}
console.log('');

// Test 3: List all windows
console.log('3. All Windows:');
listWindows();
console.log('');

// Test 4: Screenshot (cleanup after)
console.log('4. Screenshot Test');
const testFile = '/tmp/vif-test.png';
const success = screenshotFullscreen(testFile);
if (success && existsSync(testFile)) {
  console.log(`   Screenshot captured: ${testFile}`);
  unlinkSync(testFile);
  console.log('   Cleaned up test file');
} else {
  console.log('   Screenshot failed');
}
console.log('');

console.log('All tests completed!');
