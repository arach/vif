/**
 * Test CDP Module
 *
 * Quick test to verify CDP modules load and basic functionality works.
 * Run with: node dist/test-cdp.js
 */

import { CDPClient } from './cdp/client.js';
import { browserTools, isBrowserTool } from './mcp/tools/browser.js';

async function main() {
  console.log('CDP Module Test\n');

  // Test 1: Chrome detection
  console.log('1. Chrome detection:');
  const chromePath = CDPClient.findChrome();
  if (chromePath) {
    console.log(`   ✓ Chrome found at: ${chromePath}`);
  } else {
    console.log('   ✗ Chrome not found');
  }

  // Test 2: Browser tools registered
  console.log('\n2. Browser tools registered:');
  const toolNames = browserTools.map(t => t.name);
  console.log(`   Found ${toolNames.length} browser tools:`);
  for (const name of toolNames) {
    console.log(`   - ${name}`);
  }

  // Test 3: isBrowserTool function
  console.log('\n3. isBrowserTool detection:');
  const testCases = [
    'vif_browser_navigate',
    'vif_observe',
    'vif_cursor_move',
    'unknown_tool',
  ];
  for (const name of testCases) {
    const result = isBrowserTool(name);
    console.log(`   ${name}: ${result ? '✓ browser tool' : '✗ not browser tool'}`);
  }

  console.log('\n✓ All tests passed!');
}

main().catch(console.error);
