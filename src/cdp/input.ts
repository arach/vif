/**
 * CDP Input Module
 *
 * Functions for simulating user input (mouse, keyboard) via CDP.
 */

import { CDPClient } from './client.js';
import {
  querySelector,
  getElementBounds,
  scrollIntoView,
  focusElement,
  ElementBounds,
} from './dom.js';

// Mouse button types
type MouseButton = 'left' | 'right' | 'middle';

// Key modifiers
interface KeyModifiers {
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

/**
 * Move the mouse to a position
 */
export async function mouseMove(
  client: CDPClient,
  x: number,
  y: number
): Promise<void> {
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
  });
}

/**
 * Click at a position
 */
export async function mouseClick(
  client: CDPClient,
  x: number,
  y: number,
  options: {
    button?: MouseButton;
    clickCount?: number;
    delay?: number;
  } = {}
): Promise<void> {
  const { button = 'left', clickCount = 1, delay = 50 } = options;

  const buttonCode = { left: 0, middle: 1, right: 2 }[button];

  // Move to position first
  await mouseMove(client, x, y);

  // Mouse down
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button,
    buttons: 1 << buttonCode,
    clickCount,
  });

  // Small delay between down and up
  await new Promise(resolve => setTimeout(resolve, delay));

  // Mouse up
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button,
    buttons: 0,
    clickCount,
  });
}

/**
 * Double click at a position
 */
export async function mouseDoubleClick(
  client: CDPClient,
  x: number,
  y: number
): Promise<void> {
  await mouseClick(client, x, y, { clickCount: 2 });
}

/**
 * Click on an element by selector
 */
export async function clickElement(
  client: CDPClient,
  selector: string
): Promise<ElementBounds> {
  const nodeId = await querySelector(client, selector);
  if (!nodeId) {
    throw new Error(`Element not found: ${selector}`);
  }

  // Scroll element into view first
  await scrollIntoView(client, nodeId);

  // Small delay for scroll animation
  await new Promise(resolve => setTimeout(resolve, 100));

  // Get updated bounds after scroll
  const bounds = await getElementBounds(client, nodeId);
  if (!bounds) {
    throw new Error(`Could not get bounds for: ${selector}`);
  }

  // Click at center of element
  await mouseClick(client, bounds.centerX, bounds.centerY);

  return bounds;
}

/**
 * Click on an element by its node ID
 */
export async function clickNodeId(
  client: CDPClient,
  nodeId: number
): Promise<ElementBounds> {
  // Scroll element into view first
  await scrollIntoView(client, nodeId);
  await new Promise(resolve => setTimeout(resolve, 100));

  const bounds = await getElementBounds(client, nodeId);
  if (!bounds) {
    throw new Error(`Could not get bounds for nodeId: ${nodeId}`);
  }

  await mouseClick(client, bounds.centerX, bounds.centerY);

  return bounds;
}

/**
 * Type text using keyboard events
 */
export async function typeText(
  client: CDPClient,
  text: string,
  options: {
    delay?: number;
    clearFirst?: boolean;
  } = {}
): Promise<void> {
  const { delay = 0, clearFirst = false } = options;

  // Clear existing text if requested
  if (clearFirst) {
    // Select all and delete
    await keyPress(client, 'a', { meta: true });
    await keyPress(client, 'Backspace');
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  for (const char of text) {
    // For printable characters, use insertText
    if (char.length === 1 && char.charCodeAt(0) >= 32) {
      await client.send('Input.insertText', { text: char });
    } else {
      // Handle special characters
      await keyPress(client, char);
    }

    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Type text into an element by selector
 */
export async function typeIntoElement(
  client: CDPClient,
  selector: string,
  text: string,
  options: {
    delay?: number;
    clearFirst?: boolean;
  } = {}
): Promise<void> {
  const nodeId = await querySelector(client, selector);
  if (!nodeId) {
    throw new Error(`Element not found: ${selector}`);
  }

  // Focus the element
  await focusElement(client, nodeId);
  await new Promise(resolve => setTimeout(resolve, 50));

  // Type the text
  await typeText(client, text, options);
}

/**
 * Press a key
 */
export async function keyPress(
  client: CDPClient,
  key: string,
  modifiers: KeyModifiers = {}
): Promise<void> {
  const modifierFlags =
    (modifiers.alt ? 1 : 0) |
    (modifiers.ctrl ? 2 : 0) |
    (modifiers.meta ? 4 : 0) |
    (modifiers.shift ? 8 : 0);

  // Map common key names to CDP key codes
  const keyMap: Record<string, { key: string; code: string; keyCode?: number }> = {
    Enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
    Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
    Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
    Delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
    Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
    ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
    ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
    ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
    Home: { key: 'Home', code: 'Home', keyCode: 36 },
    End: { key: 'End', code: 'End', keyCode: 35 },
    PageUp: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
    PageDown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
    Space: { key: ' ', code: 'Space', keyCode: 32 },
  };

  const keyInfo = keyMap[key] || {
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    keyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined,
  };

  // Key down
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    modifiers: modifierFlags,
    key: keyInfo.key,
    code: keyInfo.code,
    windowsVirtualKeyCode: keyInfo.keyCode,
  });

  // Key up
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    modifiers: modifierFlags,
    key: keyInfo.key,
    code: keyInfo.code,
    windowsVirtualKeyCode: keyInfo.keyCode,
  });
}

/**
 * Press a keyboard shortcut
 */
export async function keyboardShortcut(
  client: CDPClient,
  keys: string[]
): Promise<void> {
  const modifiers: KeyModifiers = {};
  let mainKey = '';

  for (const key of keys) {
    const lower = key.toLowerCase();
    if (lower === 'cmd' || lower === 'meta' || lower === 'command') {
      modifiers.meta = true;
    } else if (lower === 'ctrl' || lower === 'control') {
      modifiers.ctrl = true;
    } else if (lower === 'alt' || lower === 'option') {
      modifiers.alt = true;
    } else if (lower === 'shift') {
      modifiers.shift = true;
    } else {
      mainKey = key;
    }
  }

  if (mainKey) {
    await keyPress(client, mainKey, modifiers);
  }
}

/**
 * Scroll the page or an element
 */
export async function scroll(
  client: CDPClient,
  options: {
    direction: 'up' | 'down' | 'left' | 'right';
    amount?: number;
    selector?: string;
  }
): Promise<void> {
  const { direction, amount = 400, selector } = options;

  let x = 0;
  let y = 0;

  if (selector) {
    // Scroll within a specific element
    const nodeId = await querySelector(client, selector);
    if (!nodeId) {
      throw new Error(`Element not found: ${selector}`);
    }

    const bounds = await getElementBounds(client, nodeId);
    if (bounds) {
      x = bounds.centerX;
      y = bounds.centerY;
    }
  } else {
    // Scroll the viewport - get viewport center
    const layoutResult = await client.send<{
      layoutViewport: { clientWidth: number; clientHeight: number };
    }>('Page.getLayoutMetrics');

    x = layoutResult.layoutViewport.clientWidth / 2;
    y = layoutResult.layoutViewport.clientHeight / 2;
  }

  // Calculate delta based on direction
  let deltaX = 0;
  let deltaY = 0;

  switch (direction) {
    case 'up':
      deltaY = -amount;
      break;
    case 'down':
      deltaY = amount;
      break;
    case 'left':
      deltaX = -amount;
      break;
    case 'right':
      deltaX = amount;
      break;
  }

  // Dispatch mouse wheel event
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x,
    y,
    deltaX,
    deltaY,
  });

  // Wait for scroll to complete
  await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Scroll to the top of the page
 */
export async function scrollToTop(client: CDPClient): Promise<void> {
  await keyPress(client, 'Home', { meta: true });
}

/**
 * Scroll to the bottom of the page
 */
export async function scrollToBottom(client: CDPClient): Promise<void> {
  await keyPress(client, 'End', { meta: true });
}

/**
 * Hover over an element
 */
export async function hoverElement(
  client: CDPClient,
  selector: string
): Promise<ElementBounds> {
  const nodeId = await querySelector(client, selector);
  if (!nodeId) {
    throw new Error(`Element not found: ${selector}`);
  }

  const bounds = await getElementBounds(client, nodeId);
  if (!bounds) {
    throw new Error(`Could not get bounds for: ${selector}`);
  }

  await mouseMove(client, bounds.centerX, bounds.centerY);

  return bounds;
}

/**
 * Drag from one point to another
 */
export async function drag(
  client: CDPClient,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  options: {
    steps?: number;
    duration?: number;
  } = {}
): Promise<void> {
  const { steps = 10, duration = 300 } = options;
  const stepDelay = duration / steps;

  // Move to start position
  await mouseMove(client, fromX, fromY);

  // Mouse down
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: fromX,
    y: fromY,
    button: 'left',
    buttons: 1,
  });

  // Move in steps
  for (let i = 1; i <= steps; i++) {
    const x = fromX + (toX - fromX) * (i / steps);
    const y = fromY + (toY - fromY) * (i / steps);

    await mouseMove(client, x, y);
    await new Promise(resolve => setTimeout(resolve, stepDelay));
  }

  // Mouse up
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: toX,
    y: toY,
    button: 'left',
    buttons: 0,
  });
}

/**
 * Select text in an element
 */
export async function selectAllText(client: CDPClient): Promise<void> {
  await keyPress(client, 'a', { meta: true });
}

/**
 * Copy selected text
 */
export async function copy(client: CDPClient): Promise<void> {
  await keyPress(client, 'c', { meta: true });
}

/**
 * Paste from clipboard
 */
export async function paste(client: CDPClient): Promise<void> {
  await keyPress(client, 'v', { meta: true });
}

/**
 * Cut selected text
 */
export async function cut(client: CDPClient): Promise<void> {
  await keyPress(client, 'x', { meta: true });
}
