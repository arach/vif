/**
 * CDP DOM Module
 *
 * Functions for querying and interacting with the DOM via CDP.
 */

import { CDPClient } from './client.js';

// DOM node types
export interface DOMNode {
  nodeId: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  localName: string;
  nodeValue: string;
  childNodeCount?: number;
  children?: DOMNode[];
  attributes?: string[];
}

export interface BoxModel {
  content: number[];
  padding: number[];
  border: number[];
  margin: number[];
  width: number;
  height: number;
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface ClickableElement {
  nodeId: number;
  backendNodeId: number;
  tag: string;
  role: string;
  label: string;
  text: string;
  bounds: ElementBounds;
  selector: string;
  attributes: Record<string, string>;
}

export interface AccessibilityNode {
  nodeId: string;
  role: string;
  name: string;
  value?: string;
  description?: string;
  bounds?: ElementBounds;
  children?: AccessibilityNode[];
}

/**
 * Get the document root node
 */
export async function getDocument(client: CDPClient): Promise<DOMNode> {
  const result = await client.send<{ root: DOMNode }>('DOM.getDocument', {
    depth: 0,
    pierce: true,
  });
  return result.root;
}

/**
 * Query for a single element by CSS selector
 */
export async function querySelector(
  client: CDPClient,
  selector: string,
  rootNodeId?: number
): Promise<number | null> {
  if (!rootNodeId) {
    const doc = await getDocument(client);
    rootNodeId = doc.nodeId;
  }

  try {
    const result = await client.send<{ nodeId: number }>('DOM.querySelector', {
      nodeId: rootNodeId,
      selector,
    });
    return result.nodeId > 0 ? result.nodeId : null;
  } catch {
    return null;
  }
}

/**
 * Query for all elements matching a CSS selector
 */
export async function querySelectorAll(
  client: CDPClient,
  selector: string,
  rootNodeId?: number
): Promise<number[]> {
  if (!rootNodeId) {
    const doc = await getDocument(client);
    rootNodeId = doc.nodeId;
  }

  try {
    const result = await client.send<{ nodeIds: number[] }>('DOM.querySelectorAll', {
      nodeId: rootNodeId,
      selector,
    });
    return result.nodeIds.filter(id => id > 0);
  } catch {
    return [];
  }
}

/**
 * Get the bounding box of an element
 */
export async function getElementBounds(
  client: CDPClient,
  nodeId: number
): Promise<ElementBounds | null> {
  try {
    const result = await client.send<{ model: BoxModel }>('DOM.getBoxModel', {
      nodeId,
    });

    const content = result.model.content;
    // content is [x1, y1, x2, y2, x3, y3, x4, y4] - corners of the quad
    const x = Math.min(content[0], content[2], content[4], content[6]);
    const y = Math.min(content[1], content[3], content[5], content[7]);
    const maxX = Math.max(content[0], content[2], content[4], content[6]);
    const maxY = Math.max(content[1], content[3], content[5], content[7]);
    const width = maxX - x;
    const height = maxY - y;

    return {
      x,
      y,
      width,
      height,
      centerX: x + width / 2,
      centerY: y + height / 2,
    };
  } catch {
    return null;
  }
}

/**
 * Get attributes of an element
 */
export async function getAttributes(
  client: CDPClient,
  nodeId: number
): Promise<Record<string, string>> {
  try {
    const result = await client.send<{ attributes: string[] }>('DOM.getAttributes', {
      nodeId,
    });

    const attrs: Record<string, string> = {};
    for (let i = 0; i < result.attributes.length; i += 2) {
      attrs[result.attributes[i]] = result.attributes[i + 1];
    }
    return attrs;
  } catch {
    return {};
  }
}

/**
 * Get the outer HTML of an element
 */
export async function getOuterHTML(
  client: CDPClient,
  nodeId: number
): Promise<string> {
  const result = await client.send<{ outerHTML: string }>('DOM.getOuterHTML', {
    nodeId,
  });
  return result.outerHTML;
}

/**
 * Get computed ARIA role for an element
 */
async function getComputedRole(
  client: CDPClient,
  backendNodeId: number
): Promise<string> {
  try {
    // Use Accessibility domain to get the role
    const result = await client.send<{
      nodes: Array<{ role?: { value: string } }>;
    }>('Accessibility.getPartialAXTree', {
      backendNodeId,
      fetchRelatives: false,
    });

    if (result.nodes?.[0]?.role?.value) {
      return result.nodes[0].role.value;
    }
  } catch {
    // Accessibility domain may not be enabled
  }
  return '';
}

/**
 * Get all clickable/interactive elements on the page
 */
export async function getClickableElements(
  client: CDPClient
): Promise<ClickableElement[]> {
  const elements: ClickableElement[] = [];

  // Common interactive element selectors
  const selectors = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  const nodeIds = await querySelectorAll(client, selectors);

  for (const nodeId of nodeIds) {
    try {
      // Get node details
      const result = await client.send<{ node: DOMNode }>('DOM.describeNode', {
        nodeId,
        depth: 0,
      });

      const node = result.node;
      const bounds = await getElementBounds(client, nodeId);

      if (!bounds || bounds.width === 0 || bounds.height === 0) {
        continue; // Skip invisible elements
      }

      const attrs = await getAttributes(client, nodeId);

      // Try to get a meaningful label
      let label = '';
      let text = '';

      // Check aria-label
      if (attrs['aria-label']) {
        label = attrs['aria-label'];
      }

      // Check title
      if (!label && attrs['title']) {
        label = attrs['title'];
      }

      // Check placeholder for inputs
      if (!label && attrs['placeholder']) {
        label = attrs['placeholder'];
      }

      // Get inner text
      try {
        const htmlResult = await client.send<{ outerHTML: string }>('DOM.getOuterHTML', {
          nodeId,
        });
        const match = htmlResult.outerHTML.match(/>([^<]*)</);
        if (match) {
          text = match[1].trim();
        }
      } catch {
        // Ignore
      }

      if (!label && text) {
        label = text;
      }

      // Determine role
      let role = attrs['role'] || '';
      if (!role) {
        const tagRoles: Record<string, string> = {
          a: 'link',
          button: 'button',
          input: attrs['type'] || 'textbox',
          select: 'combobox',
          textarea: 'textbox',
        };
        role = tagRoles[node.localName] || 'generic';
      }

      // Generate a selector for this element
      let selector = node.localName;
      if (attrs['id']) {
        selector = `#${attrs['id']}`;
      } else if (attrs['class']) {
        const classes = attrs['class'].split(/\s+/).filter(c => c).slice(0, 2);
        if (classes.length > 0) {
          selector = `${node.localName}.${classes.join('.')}`;
        }
      }

      elements.push({
        nodeId,
        backendNodeId: node.backendNodeId,
        tag: node.localName,
        role,
        label: label.slice(0, 100), // Truncate long labels
        text: text.slice(0, 100),
        bounds,
        selector,
        attributes: attrs,
      });
    } catch {
      // Skip elements that can't be described
      continue;
    }
  }

  return elements;
}

/**
 * Get the full accessibility tree for the page
 */
export async function getAccessibilityTree(
  client: CDPClient
): Promise<AccessibilityNode[]> {
  await client.enableDomain('Accessibility');

  const result = await client.send<{
    nodes: Array<{
      nodeId: string;
      role: { value: string };
      name?: { value: string };
      value?: { value: string };
      description?: { value: string };
      backendDOMNodeId?: number;
      childIds?: string[];
    }>;
  }>('Accessibility.getFullAXTree');

  // Build a map for quick lookup
  const nodeMap = new Map<string, AccessibilityNode>();

  for (const node of result.nodes) {
    // Get bounds if we have a backend DOM node
    let bounds: ElementBounds | undefined;
    if (node.backendDOMNodeId) {
      try {
        const boxResult = await client.send<{ model: BoxModel }>('DOM.getBoxModel', {
          backendNodeId: node.backendDOMNodeId,
        });
        const content = boxResult.model.content;
        const x = Math.min(content[0], content[2], content[4], content[6]);
        const y = Math.min(content[1], content[3], content[5], content[7]);
        const maxX = Math.max(content[0], content[2], content[4], content[6]);
        const maxY = Math.max(content[1], content[3], content[5], content[7]);
        const width = maxX - x;
        const height = maxY - y;
        bounds = {
          x,
          y,
          width,
          height,
          centerX: x + width / 2,
          centerY: y + height / 2,
        };
      } catch {
        // Element may not be visible
      }
    }

    nodeMap.set(node.nodeId, {
      nodeId: node.nodeId,
      role: node.role.value,
      name: node.name?.value || '',
      value: node.value?.value,
      description: node.description?.value,
      bounds,
      children: [],
    });
  }

  // Build tree structure
  const roots: AccessibilityNode[] = [];

  for (const node of result.nodes) {
    const axNode = nodeMap.get(node.nodeId)!;

    if (node.childIds) {
      for (const childId of node.childIds) {
        const child = nodeMap.get(childId);
        if (child) {
          axNode.children!.push(child);
        }
      }
    }

    // Root nodes have no parent
    const isRoot = !result.nodes.some(n =>
      n.childIds?.includes(node.nodeId)
    );
    if (isRoot) {
      roots.push(axNode);
    }
  }

  return roots;
}

/**
 * Extract text content from elements matching selectors
 */
export async function extractData(
  client: CDPClient,
  selectors: Record<string, string>
): Promise<Record<string, string | string[]>> {
  const result: Record<string, string | string[]> = {};

  for (const [key, selector] of Object.entries(selectors)) {
    const nodeIds = await querySelectorAll(client, selector);

    if (nodeIds.length === 0) {
      result[key] = '';
    } else if (nodeIds.length === 1) {
      // Single element - return string
      const text = await getElementText(client, nodeIds[0]);
      result[key] = text;
    } else {
      // Multiple elements - return array
      const texts: string[] = [];
      for (const nodeId of nodeIds) {
        texts.push(await getElementText(client, nodeId));
      }
      result[key] = texts;
    }
  }

  return result;
}

/**
 * Get text content of an element (including child text nodes)
 */
async function getElementText(client: CDPClient, nodeId: number): Promise<string> {
  try {
    // Use JavaScript to get innerText which handles visibility
    const result = await client.send<{ result: { value: string } }>(
      'Runtime.callFunctionOn',
      {
        functionDeclaration: 'function() { return this.innerText || this.textContent || ""; }',
        objectId: await getRemoteObjectId(client, nodeId),
        returnByValue: true,
      }
    );
    return result.result.value?.trim() || '';
  } catch {
    return '';
  }
}

/**
 * Get a remote object ID for a DOM node
 */
async function getRemoteObjectId(client: CDPClient, nodeId: number): Promise<string> {
  const result = await client.send<{ object: { objectId: string } }>(
    'DOM.resolveNode',
    { nodeId }
  );
  return result.object.objectId;
}

/**
 * Focus an element
 */
export async function focusElement(client: CDPClient, nodeId: number): Promise<void> {
  await client.send('DOM.focus', { nodeId });
}

/**
 * Scroll an element into view
 */
export async function scrollIntoView(client: CDPClient, nodeId: number): Promise<void> {
  await client.send('DOM.scrollIntoViewIfNeeded', { nodeId });
}

/**
 * Get the node ID for an element at a specific point
 */
export async function getNodeAtPoint(
  client: CDPClient,
  x: number,
  y: number
): Promise<number | null> {
  try {
    const result = await client.send<{ backendNodeId: number; nodeId: number }>(
      'DOM.getNodeForLocation',
      { x, y, includeUserAgentShadowDOM: false }
    );
    return result.nodeId || null;
  } catch {
    return null;
  }
}
