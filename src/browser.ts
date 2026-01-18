/**
 * Vif Browser API
 *
 * Object-oriented browser automation API inspired by Stagehand.
 * Provides a clean interface for browser control without per-action API costs.
 *
 * Usage:
 *   const vif = new Vif();
 *   await vif.launch();
 *   await vif.navigate("https://example.com");
 *   const elements = await vif.observe();
 *   await vif.act("click the submit button");
 *   await vif.close();
 */

import { CDPClient } from './cdp/client.js';
import {
  getClickableElements,
  querySelector,
  querySelectorAll,
  getElementBounds,
  extractData,
  getAccessibilityTree,
  scrollIntoView,
  ClickableElement,
  AccessibilityNode,
  ElementBounds,
} from './cdp/dom.js';
import {
  clickElement,
  clickNodeId,
  typeIntoElement,
  typeText,
  scroll,
  keyPress,
  keyboardShortcut,
  hoverElement,
  mouseClick,
} from './cdp/input.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ─── Types ────────────────────────────────────────────────────────────────

export interface VifOptions {
  /** Chrome debugging port (default: 9222) */
  port?: number;
  /** Run in headless mode */
  headless?: boolean;
  /** Additional Chrome flags */
  chromeFlags?: string[];
}

export interface ObserveOptions {
  /** Filter to specific selector */
  selector?: string;
  /** Output format */
  format?: 'clickable' | 'accessibility' | 'full';
}

export interface ObserveResult {
  elements: ClickableElement[];
  selector?: string;
}

export interface ActOptions {
  /** Timeout for finding element (ms) */
  timeout?: number;
}

export interface TypeOptions {
  /** Clear existing text first */
  clear?: boolean;
  /** Delay between keystrokes (ms) */
  delay?: number;
}

export interface ScrollOptions {
  /** Pixels to scroll (default: viewport height) */
  amount?: number;
  /** Element to scroll (default: page) */
  selector?: string;
}

export interface ExtractOptions {
  /** Wait for selector before extracting */
  waitFor?: string;
}

export interface ScreenshotOptions {
  /** Capture full page */
  fullPage?: boolean;
  /** Capture specific element */
  selector?: string;
  /** Image format */
  format?: 'png' | 'jpeg' | 'webp';
  /** Save path (optional - returns base64 if not specified) */
  path?: string;
}

// ─── Vif Class ────────────────────────────────────────────────────────────

export class Vif {
  private client: CDPClient;
  private options: VifOptions;
  private launched = false;

  constructor(options: VifOptions = {}) {
    this.options = options;
    this.client = new CDPClient({
      port: options.port ?? 9222,
    });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Launch Chrome and connect
   */
  async launch(url?: string): Promise<void> {
    const flags: string[] = [...(this.options.chromeFlags || [])];

    if (this.options.headless) {
      flags.push('--headless=new');
    }

    if (url) {
      flags.push(url);
    }

    await this.client.launchChrome(flags);
    await this.client.connect();

    // Enable required CDP domains
    await this.client.enableDomain('DOM');
    await this.client.enableDomain('Page');
    await this.client.enableDomain('Runtime');

    this.launched = true;
  }

  /**
   * Connect to an existing Chrome instance
   */
  async connect(targetId?: string): Promise<void> {
    await this.client.connect(targetId);
    await this.client.enableDomain('DOM');
    await this.client.enableDomain('Page');
    await this.client.enableDomain('Runtime');
    this.launched = true;
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    this.client.close();
    this.launched = false;
  }

  /**
   * Check if browser is connected
   */
  isConnected(): boolean {
    return this.client.isConnected();
  }

  // ─── Navigation ─────────────────────────────────────────────────────────

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<void> {
    this.ensureConnected();

    await this.client.send('Page.navigate', { url });

    // Wait for load event
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.client.off('Page.loadEventFired', handler);
        reject(new Error('Navigation timeout'));
      }, 30000);

      const handler = () => {
        clearTimeout(timeout);
        this.client.off('Page.loadEventFired', handler);
        resolve();
      };
      this.client.on('Page.loadEventFired', handler);
    });
  }

  /**
   * Go back in history
   */
  async back(): Promise<void> {
    this.ensureConnected();
    await this.client.send('Page.navigateToHistoryEntry', {
      entryId: -1,
    });
  }

  /**
   * Go forward in history
   */
  async forward(): Promise<void> {
    this.ensureConnected();
    await this.client.send('Page.navigateToHistoryEntry', {
      entryId: 1,
    });
  }

  /**
   * Reload the page
   */
  async reload(): Promise<void> {
    this.ensureConnected();
    await this.client.send('Page.reload');
  }

  /**
   * Get current URL
   */
  async url(): Promise<string> {
    this.ensureConnected();
    const result = await this.client.send<{ frameTree: { frame: { url: string } } }>(
      'Page.getFrameTree'
    );
    return result.frameTree.frame.url;
  }

  // ─── Observation (Stagehand-style) ──────────────────────────────────────

  /**
   * Observe the page - returns interactive elements
   *
   * Similar to Stagehand's observe() but without LLM inference.
   * Returns structured data that Claude (or user) can interpret.
   */
  async observe(options: ObserveOptions = {}): Promise<ObserveResult> {
    this.ensureConnected();

    let elements = await getClickableElements(this.client);

    // Filter by selector if provided
    if (options.selector) {
      const matchingIds = await querySelectorAll(this.client, options.selector);
      const matchingSet = new Set(matchingIds);
      elements = elements.filter(e => matchingSet.has(e.nodeId));
    }

    return {
      elements,
      selector: options.selector,
    };
  }

  /**
   * Get the accessibility tree
   */
  async accessibility(): Promise<AccessibilityNode[]> {
    this.ensureConnected();
    return getAccessibilityTree(this.client);
  }

  // ─── Actions (Stagehand-style) ───────────────────────────────────────────

  /**
   * Perform an action by natural language description
   *
   * Unlike Stagehand, this doesn't call an external LLM.
   * It uses fuzzy matching on element labels/text.
   *
   * For complex actions, use observe() + click()/type() explicitly.
   */
  async act(instruction: string, options: ActOptions = {}): Promise<ElementBounds> {
    this.ensureConnected();

    // Parse the instruction to determine action type
    const lowerInstruction = instruction.toLowerCase();

    // Get all interactive elements
    const elements = await getClickableElements(this.client);

    // Extract the target from instruction
    // e.g., "click the submit button" → "submit button"
    // e.g., "click on Login" → "login"
    let target = instruction;
    const actionPrefixes = [
      'click on ', 'click the ', 'click ',
      'tap on ', 'tap the ', 'tap ',
      'press ', 'hit ',
    ];
    for (const prefix of actionPrefixes) {
      if (lowerInstruction.startsWith(prefix)) {
        target = instruction.slice(prefix.length);
        break;
      }
    }

    // Find best matching element
    const match = this.findBestMatch(elements, target);

    if (!match) {
      throw new Error(`Could not find element matching: "${target}"`);
    }

    // Perform the click
    await scrollIntoView(this.client, match.nodeId);
    await new Promise(resolve => setTimeout(resolve, 100));

    const bounds = await getElementBounds(this.client, match.nodeId);
    if (!bounds) {
      throw new Error(`Could not get bounds for matched element`);
    }

    await mouseClick(this.client, bounds.centerX, bounds.centerY);

    return bounds;
  }

  /**
   * Click an element
   */
  async click(selector: string): Promise<ElementBounds> {
    this.ensureConnected();
    return clickElement(this.client, selector);
  }

  /**
   * Click an element by its node ID (from observe())
   */
  async clickNode(nodeId: number): Promise<ElementBounds> {
    this.ensureConnected();
    return clickNodeId(this.client, nodeId);
  }

  /**
   * Type text into an element
   */
  async type(selector: string, text: string, options: TypeOptions = {}): Promise<void> {
    this.ensureConnected();
    await typeIntoElement(this.client, selector, text, {
      clearFirst: options.clear,
      delay: options.delay,
    });
  }

  /**
   * Type text into the currently focused element
   */
  async typeText(text: string, options: TypeOptions = {}): Promise<void> {
    this.ensureConnected();
    await typeText(this.client, text, {
      clearFirst: options.clear,
      delay: options.delay,
    });
  }

  /**
   * Press a key or keyboard shortcut
   */
  async press(key: string | string[]): Promise<void> {
    this.ensureConnected();

    if (Array.isArray(key)) {
      await keyboardShortcut(this.client, key);
    } else {
      await keyPress(this.client, key);
    }
  }

  /**
   * Hover over an element
   */
  async hover(selector: string): Promise<ElementBounds> {
    this.ensureConnected();
    return hoverElement(this.client, selector);
  }

  /**
   * Scroll the page
   */
  async scroll(direction: 'up' | 'down' | 'left' | 'right', options: ScrollOptions = {}): Promise<void> {
    this.ensureConnected();
    await scroll(this.client, {
      direction,
      amount: options.amount,
      selector: options.selector,
    });
  }

  // ─── Data Extraction (Stagehand-style) ───────────────────────────────────

  /**
   * Extract data from the page using CSS selectors
   *
   * Unlike Stagehand's schema-based extraction, this uses explicit selectors.
   * For AI-powered extraction, use observe() and let Claude interpret.
   */
  async extract(selectors: Record<string, string>): Promise<Record<string, string | string[]>> {
    this.ensureConnected();
    return extractData(this.client, selectors);
  }

  /**
   * Get text content of an element
   */
  async getText(selector: string): Promise<string> {
    this.ensureConnected();
    const result = await this.extract({ text: selector });
    return Array.isArray(result.text) ? result.text.join(' ') : result.text;
  }

  /**
   * Get attribute value of an element
   */
  async getAttribute(selector: string, attribute: string): Promise<string | null> {
    this.ensureConnected();

    const nodeId = await querySelector(this.client, selector);
    if (!nodeId) return null;

    const result = await this.client.send<{ result: { value: string | null } }>(
      'Runtime.callFunctionOn',
      {
        functionDeclaration: `function() { return this.getAttribute("${attribute}"); }`,
        objectId: await this.getRemoteObjectId(nodeId),
        returnByValue: true,
      }
    );

    return result.result.value;
  }

  // ─── Screenshots ────────────────────────────────────────────────────────

  /**
   * Take a screenshot
   */
  async screenshot(options: ScreenshotOptions = {}): Promise<string> {
    this.ensureConnected();

    const format = options.format || 'png';

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

    if (options.fullPage) {
      const metrics = await this.client.send<{
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

    if (options.selector) {
      const nodeId = await querySelector(this.client, options.selector);
      if (!nodeId) {
        throw new Error(`Element not found: ${options.selector}`);
      }
      const bounds = await getElementBounds(this.client, nodeId);
      if (!bounds) {
        throw new Error(`Could not get bounds for: ${options.selector}`);
      }
      captureParams.clip = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        scale: 1,
      };
    }

    const result = await this.client.send<{ data: string }>(
      'Page.captureScreenshot',
      captureParams
    );

    if (options.path) {
      writeFileSync(options.path, Buffer.from(result.data, 'base64'));
      return options.path;
    }

    // Save to temp file
    const tempDir = join(tmpdir(), 'vif-screenshots');
    mkdirSync(tempDir, { recursive: true });
    const filename = `screenshot-${Date.now()}.${format}`;
    const filepath = join(tempDir, filename);

    writeFileSync(filepath, Buffer.from(result.data, 'base64'));
    return filepath;
  }

  // ─── Waiting ────────────────────────────────────────────────────────────

  /**
   * Wait for an element to appear
   */
  async waitForSelector(selector: string, timeout = 30000): Promise<number> {
    this.ensureConnected();

    const start = Date.now();

    while (Date.now() - start < timeout) {
      const nodeId = await querySelector(this.client, selector);
      if (nodeId) {
        return nodeId;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Timeout waiting for selector: ${selector}`);
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(timeout = 30000): Promise<void> {
    this.ensureConnected();

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.client.off('Page.loadEventFired', handler);
        reject(new Error('Navigation timeout'));
      }, timeout);

      const handler = () => {
        clearTimeout(timer);
        this.client.off('Page.loadEventFired', handler);
        resolve();
      };
      this.client.on('Page.loadEventFired', handler);
    });
  }

  /**
   * Wait for a fixed amount of time
   */
  async wait(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─── Evaluate JavaScript ────────────────────────────────────────────────

  /**
   * Execute JavaScript in the page context
   */
  async evaluate<T = unknown>(expression: string): Promise<T> {
    this.ensureConnected();

    const result = await this.client.send<{
      result: { value: T };
      exceptionDetails?: { text: string };
    }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      throw new Error(`Evaluation failed: ${result.exceptionDetails.text}`);
    }

    return result.result.value;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private ensureConnected(): void {
    if (!this.client.isConnected()) {
      throw new Error('Browser not connected. Call launch() or connect() first.');
    }
  }

  private async getRemoteObjectId(nodeId: number): Promise<string> {
    const result = await this.client.send<{ object: { objectId: string } }>(
      'DOM.resolveNode',
      { nodeId }
    );
    return result.object.objectId;
  }

  /**
   * Find the best matching element for a natural language target
   */
  private findBestMatch(elements: ClickableElement[], target: string): ClickableElement | null {
    const targetLower = target.toLowerCase().trim();
    const targetWords = targetLower.split(/\s+/);

    let bestMatch: ClickableElement | null = null;
    let bestScore = 0;

    for (const el of elements) {
      const label = (el.label || '').toLowerCase();
      const text = (el.text || '').toLowerCase();
      const combined = `${label} ${text}`;

      // Exact match
      if (label === targetLower || text === targetLower) {
        return el;
      }

      // Contains match
      if (combined.includes(targetLower)) {
        const score = targetLower.length / combined.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = el;
        }
        continue;
      }

      // Word overlap score
      let wordMatches = 0;
      for (const word of targetWords) {
        if (word.length > 2 && combined.includes(word)) {
          wordMatches++;
        }
      }

      if (wordMatches > 0) {
        const score = wordMatches / targetWords.length * 0.5; // Lower weight for partial
        if (score > bestScore) {
          bestScore = score;
          bestMatch = el;
        }
      }
    }

    return bestMatch;
  }
}

// ─── Convenience Export ───────────────────────────────────────────────────

/**
 * Create and launch a new Vif instance
 */
export async function createVif(options: VifOptions & { url?: string } = {}): Promise<Vif> {
  const vif = new Vif(options);
  await vif.launch(options.url);
  return vif;
}
