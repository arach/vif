/**
 * Browser MCP Tools
 *
 * Defines MCP tools for browser automation via Chrome DevTools Protocol.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { CDPClient, getCDPClient } from '../../cdp/client.js';
import {
  getClickableElements,
  querySelector,
  querySelectorAll,
  getElementBounds,
  extractData,
  getAccessibilityTree,
  ClickableElement,
  AccessibilityNode,
} from '../../cdp/dom.js';
import {
  clickElement,
  clickNodeId,
  typeIntoElement,
  typeText,
  scroll,
  keyPress,
  keyboardShortcut,
  hoverElement,
} from '../../cdp/input.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Shared CDP client instance
let cdpClient: CDPClient | null = null;

/**
 * Get or create CDP client, optionally launching Chrome
 */
async function getClient(launchIfNeeded = true): Promise<CDPClient> {
  if (cdpClient?.isConnected()) {
    return cdpClient;
  }

  cdpClient = await getCDPClient();

  // Try to connect to existing Chrome
  try {
    await cdpClient.connect();
    return cdpClient;
  } catch {
    // No Chrome running
  }

  if (!launchIfNeeded) {
    throw new Error('Chrome not running. Use vif_browser_launch to start Chrome.');
  }

  // Launch Chrome and connect
  await cdpClient.launchChrome();
  await cdpClient.connect();

  // Enable required domains
  await cdpClient.enableDomain('DOM');
  await cdpClient.enableDomain('Page');
  await cdpClient.enableDomain('Runtime');

  return cdpClient;
}

// ─── Tool Definitions ─────────────────────────────────────────────────────

export const browserTools: Tool[] = [
  {
    name: 'vif_browser_launch',
    description: 'Launch Chrome with remote debugging enabled. Required before other browser commands.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Initial URL to navigate to (optional)',
        },
        headless: {
          type: 'boolean',
          description: 'Run Chrome in headless mode (default: false)',
        },
      },
      required: [],
    },
  },
  {
    name: 'vif_browser_close',
    description: 'Close the Chrome browser instance',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'vif_browser_navigate',
    description: 'Navigate to a URL in the browser',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to',
        },
        waitUntil: {
          type: 'string',
          enum: ['load', 'domcontentloaded', 'networkidle'],
          description: 'When to consider navigation complete (default: load)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'vif_browser_click',
    description: 'Click on an element by CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to click',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'vif_browser_type',
    description: 'Type text into an element or the focused element',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to type',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for input element (optional - uses focused element if omitted)',
        },
        clear: {
          type: 'boolean',
          description: 'Clear existing text first (default: false)',
        },
        delay: {
          type: 'number',
          description: 'Delay between keystrokes in ms (default: 0)',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'vif_browser_scroll',
    description: 'Scroll the page or a specific element',
    inputSchema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['up', 'down', 'left', 'right'],
          description: 'Scroll direction',
        },
        amount: {
          type: 'number',
          description: 'Pixels to scroll (default: 400)',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for element to scroll (default: page)',
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'vif_browser_extract',
    description: 'Extract text content from elements using CSS selectors',
    inputSchema: {
      type: 'object',
      properties: {
        selectors: {
          type: 'object',
          description: 'Map of names to CSS selectors, e.g. {"title": "h1", "links": "a.nav"}',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['selectors'],
    },
  },
  {
    name: 'vif_browser_press',
    description: 'Press a keyboard key or shortcut',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Key to press (e.g., "Enter", "Tab", "Escape")',
        },
        keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keyboard shortcut as array (e.g., ["cmd", "shift", "p"])',
        },
      },
      required: [],
    },
  },
  {
    name: 'vif_browser_hover',
    description: 'Hover over an element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for element to hover',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'vif_observe',
    description: 'Get interactive elements on the current page. Returns clickable elements with their positions.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['clickable', 'accessibility', 'full'],
          description: 'Output format: clickable (interactive elements), accessibility (AX tree), full (both)',
        },
        selector: {
          type: 'string',
          description: 'Narrow observation to elements matching this selector',
        },
      },
      required: [],
    },
  },
  {
    name: 'vif_click_element',
    description: 'Click an element by its node ID (from vif_observe output)',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'number',
          description: 'Node ID from vif_observe output',
        },
        label: {
          type: 'string',
          description: 'Alternative: find element by accessible label',
        },
        role: {
          type: 'string',
          description: 'Filter by role when using label (e.g., "button", "link")',
        },
      },
      required: [],
    },
  },
  {
    name: 'vif_screenshot',
    description: 'Capture a screenshot of the page',
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: {
          type: 'boolean',
          description: 'Capture full page (default: false, viewport only)',
        },
        selector: {
          type: 'string',
          description: 'CSS selector to capture specific element',
        },
        format: {
          type: 'string',
          enum: ['png', 'jpeg', 'webp'],
          description: 'Image format (default: png)',
        },
      },
      required: [],
    },
  },
];

// ─── Tool Handlers ────────────────────────────────────────────────────────

export async function handleBrowserTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case 'vif_browser_launch': {
      const flags: string[] = [];
      if (args.headless) {
        flags.push('--headless=new');
      }
      if (args.url) {
        flags.push(args.url as string);
      }

      const client = await getCDPClient();
      await client.launchChrome(flags);
      await client.connect();

      // Enable required domains
      await client.enableDomain('DOM');
      await client.enableDomain('Page');
      await client.enableDomain('Runtime');

      cdpClient = client;

      if (args.url) {
        await client.send('Page.navigate', { url: args.url });
        // Wait for load
        await new Promise<void>((resolve) => {
          const handler = () => {
            client.off('Page.loadEventFired', handler);
            resolve();
          };
          client.on('Page.loadEventFired', handler);
        });
        return `Chrome launched and navigated to ${args.url}`;
      }

      return 'Chrome launched with remote debugging on port 9222';
    }

    case 'vif_browser_close': {
      if (cdpClient) {
        cdpClient.close();
        cdpClient = null;
      }
      return 'Chrome closed';
    }

    case 'vif_browser_navigate': {
      const client = await getClient();
      const url = args.url as string;

      // Enable Page events if not already
      await client.enableDomain('Page');

      // Navigate
      await client.send('Page.navigate', { url });

      // Wait for load event
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.off('Page.loadEventFired', handler);
          reject(new Error('Navigation timeout'));
        }, 30000);

        const handler = () => {
          clearTimeout(timeout);
          client.off('Page.loadEventFired', handler);
          resolve();
        };
        client.on('Page.loadEventFired', handler);
      });

      return `Navigated to ${url}`;
    }

    case 'vif_browser_click': {
      const client = await getClient();
      const selector = args.selector as string;

      const bounds = await clickElement(client, selector);
      return `Clicked element "${selector}" at (${Math.round(bounds.centerX)}, ${Math.round(bounds.centerY)})`;
    }

    case 'vif_browser_type': {
      const client = await getClient();
      const text = args.text as string;
      const selector = args.selector as string | undefined;
      const clear = args.clear as boolean | undefined;
      const delay = args.delay as number | undefined;

      if (selector) {
        await typeIntoElement(client, selector, text, { clearFirst: clear, delay });
        return `Typed "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}" into "${selector}"`;
      } else {
        await typeText(client, text, { clearFirst: clear, delay });
        return `Typed "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`;
      }
    }

    case 'vif_browser_scroll': {
      const client = await getClient();
      await scroll(client, {
        direction: args.direction as 'up' | 'down' | 'left' | 'right',
        amount: args.amount as number | undefined,
        selector: args.selector as string | undefined,
      });
      return `Scrolled ${args.direction}${args.amount ? ` ${args.amount}px` : ''}`;
    }

    case 'vif_browser_extract': {
      const client = await getClient();
      const selectors = args.selectors as Record<string, string>;
      const data = await extractData(client, selectors);
      return JSON.stringify(data, null, 2);
    }

    case 'vif_browser_press': {
      const client = await getClient();

      if (args.keys) {
        await keyboardShortcut(client, args.keys as string[]);
        return `Pressed ${(args.keys as string[]).join('+')}`;
      } else if (args.key) {
        await keyPress(client, args.key as string);
        return `Pressed ${args.key}`;
      } else {
        throw new Error('Either key or keys must be provided');
      }
    }

    case 'vif_browser_hover': {
      const client = await getClient();
      const selector = args.selector as string;
      const bounds = await hoverElement(client, selector);
      return `Hovering over "${selector}" at (${Math.round(bounds.centerX)}, ${Math.round(bounds.centerY)})`;
    }

    case 'vif_observe': {
      const client = await getClient();
      const format = (args.format as string) || 'clickable';

      interface ObserveResult {
        elements?: ClickableElement[];
        accessibility?: AccessibilityNode[];
      }
      const result: ObserveResult = {};

      if (format === 'clickable' || format === 'full') {
        const elements = await getClickableElements(client);

        // Filter by selector if provided
        if (args.selector) {
          const matchingIds = await querySelectorAll(client, args.selector as string);
          const matchingSet = new Set(matchingIds);
          result.elements = elements.filter(e => matchingSet.has(e.nodeId));
        } else {
          result.elements = elements;
        }
      }

      if (format === 'accessibility' || format === 'full') {
        result.accessibility = await getAccessibilityTree(client);
      }

      // Format output for Claude
      if (format === 'clickable') {
        const lines = ['Interactive elements on page:', ''];
        for (const el of result.elements || []) {
          const label = el.label || el.text || el.selector;
          lines.push(
            `[${el.nodeId}] ${el.role} "${label}" at (${Math.round(el.bounds.centerX)}, ${Math.round(el.bounds.centerY)})`
          );
        }
        return lines.join('\n');
      }

      return JSON.stringify(result, null, 2);
    }

    case 'vif_click_element': {
      const client = await getClient();

      if (args.nodeId) {
        const bounds = await clickNodeId(client, args.nodeId as number);
        return `Clicked element at (${Math.round(bounds.centerX)}, ${Math.round(bounds.centerY)})`;
      }

      if (args.label) {
        // Find element by label
        const elements = await getClickableElements(client);
        const label = (args.label as string).toLowerCase();
        const role = args.role as string | undefined;

        const matches = elements.filter(el => {
          const matchesLabel =
            el.label.toLowerCase().includes(label) ||
            el.text.toLowerCase().includes(label);
          const matchesRole = !role || el.role === role;
          return matchesLabel && matchesRole;
        });

        if (matches.length === 0) {
          throw new Error(`No element found with label "${args.label}"${role ? ` and role "${role}"` : ''}`);
        }

        if (matches.length > 1) {
          const options = matches
            .slice(0, 5)
            .map(m => `[${m.nodeId}] ${m.role} "${m.label || m.text}"`)
            .join('\n');
          return `Multiple matches found. Use nodeId to be specific:\n${options}`;
        }

        const bounds = await clickNodeId(client, matches[0].nodeId);
        return `Clicked "${matches[0].label || matches[0].text}" at (${Math.round(bounds.centerX)}, ${Math.round(bounds.centerY)})`;
      }

      throw new Error('Either nodeId or label must be provided');
    }

    case 'vif_screenshot': {
      const client = await getClient();
      const fullPage = args.fullPage as boolean | undefined;
      const format = (args.format as string) || 'png';

      interface CaptureParams {
        [key: string]: unknown;
        format: string;
        quality?: number;
        captureBeyondViewport?: boolean;
        clip?: { x: number; y: number; width: number; height: number; scale: number };
      }
      const captureParams: CaptureParams = {
        format,
        quality: format === 'jpeg' ? 80 : undefined,
      };

      if (fullPage) {
        // Get full page dimensions
        const metrics = await client.send<{
          contentSize: { width: number; height: number };
        }>('Page.getLayoutMetrics');

        captureParams.captureBeyondViewport = true;
        captureParams.clip = {
          x: 0,
          y: 0,
          width: metrics.contentSize.width,
          height: metrics.contentSize.height,
          scale: 1,
        };
      }

      if (args.selector) {
        const nodeId = await querySelector(client, args.selector as string);
        if (!nodeId) {
          throw new Error(`Element not found: ${args.selector}`);
        }
        const bounds = await getElementBounds(client, nodeId);
        if (!bounds) {
          throw new Error(`Could not get bounds for: ${args.selector}`);
        }
        captureParams.clip = {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          scale: 1,
        };
      }

      const result = await client.send<{ data: string }>(
        'Page.captureScreenshot',
        captureParams
      );

      // Save to temp file
      const tempDir = join(tmpdir(), 'vif-screenshots');
      mkdirSync(tempDir, { recursive: true });
      const filename = `screenshot-${Date.now()}.${format}`;
      const filepath = join(tempDir, filename);

      writeFileSync(filepath, Buffer.from(result.data, 'base64'));

      return `Screenshot saved to: ${filepath}`;
    }

    default:
      throw new Error(`Unknown browser tool: ${name}`);
  }
}

/**
 * Check if a tool name is a browser tool
 */
export function isBrowserTool(name: string): boolean {
  return browserTools.some(t => t.name === name);
}
