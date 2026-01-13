#!/usr/bin/env node
/**
 * Vif MCP Server
 *
 * Exposes vif automation commands as MCP tools for Claude to use directly.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';

// WebSocket connection to vif server
let ws: WebSocket | null = null;
let messageId = 1;
const pending = new Map<number, { resolve: (r: any) => void; reject: (e: Error) => void }>();

async function connect(): Promise<void> {
  if (ws?.readyState === WebSocket.OPEN) return;

  return new Promise((resolve, reject) => {
    ws = new WebSocket('ws://localhost:7850');

    ws.on('open', () => resolve());
    ws.on('error', reject);
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id && pending.has(msg.id)) {
          const p = pending.get(msg.id)!;
          pending.delete(msg.id);
          if (msg.ok) {
            p.resolve(msg);
          } else {
            p.reject(new Error(msg.error || 'Unknown error'));
          }
        }
      } catch {}
    });
    ws.on('close', () => {
      ws = null;
    });
  });
}

async function send(action: string, params: Record<string, unknown> = {}): Promise<any> {
  await connect();

  return new Promise((resolve, reject) => {
    const id = messageId++;
    pending.set(id, { resolve, reject });
    ws!.send(JSON.stringify({ id, action, ...params }));

    // Timeout after 10s
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('Timeout'));
      }
    }, 10000);
  });
}

// Define tools
const tools: Tool[] = [
  // Cursor tools
  {
    name: 'vif_cursor_show',
    description: 'Show the animated cursor overlay',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'vif_cursor_hide',
    description: 'Hide the cursor overlay',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'vif_cursor_move',
    description: 'Move the cursor to a position with smooth animation',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
        duration: { type: 'number', description: 'Animation duration in seconds (default 0.3)' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'vif_cursor_click',
    description: 'Perform a click animation at current position',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },

  // Label tools
  {
    name: 'vif_label_show',
    description: 'Show a label/caption overlay',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to display' },
        position: { type: 'string', enum: ['top', 'bottom'], description: 'Position (default top)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'vif_label_update',
    description: 'Update the label text',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'New text' },
      },
      required: ['text'],
    },
  },
  {
    name: 'vif_label_hide',
    description: 'Hide the label overlay',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },

  // Stage/backdrop tools
  {
    name: 'vif_backdrop_show',
    description: 'Show the backdrop (dims everything outside viewport)',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'vif_backdrop_hide',
    description: 'Hide the backdrop',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'vif_stage_center',
    description: 'Center an app window on screen at specified size',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'App name (e.g., "Safari", "Talkie")' },
        width: { type: 'number', description: 'Window width' },
        height: { type: 'number', description: 'Window height' },
      },
      required: ['app'],
    },
  },
  {
    name: 'vif_stage_clear',
    description: 'Clear all stage elements (backdrop, cursor, label, viewport)',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },

  // Viewport tools
  {
    name: 'vif_viewport_set',
    description: 'Set the viewport region (visible area through backdrop)',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
        width: { type: 'number', description: 'Width' },
        height: { type: 'number', description: 'Height' },
      },
      required: ['x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'vif_viewport_show',
    description: 'Show the viewport mask',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'vif_viewport_hide',
    description: 'Hide the viewport mask',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },

  // Recording tools
  {
    name: 'vif_record_indicator',
    description: 'Show or hide the recording indicator (red dot)',
    inputSchema: {
      type: 'object',
      properties: {
        show: { type: 'boolean', description: 'Whether to show the indicator' },
      },
      required: ['show'],
    },
  },

  // Keys overlay
  {
    name: 'vif_keys_show',
    description: 'Show keyboard shortcut overlay',
    inputSchema: {
      type: 'object',
      properties: {
        keys: { type: 'array', items: { type: 'string' }, description: 'Keys to show (e.g., ["cmd", "shift", "p"])' },
        press: { type: 'boolean', description: 'Animate as key press' },
      },
      required: ['keys'],
    },
  },
  {
    name: 'vif_keys_hide',
    description: 'Hide the keys overlay',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },

  // Typer overlay
  {
    name: 'vif_typer_type',
    description: 'Show animated typing overlay',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type' },
        style: { type: 'string', enum: ['default', 'terminal', 'code'], description: 'Visual style' },
        delay: { type: 'number', description: 'Delay between characters (default 0.05)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'vif_typer_hide',
    description: 'Hide the typer overlay',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

// Tool handlers
async function handleTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    // Cursor
    case 'vif_cursor_show':
      await send('cursor.show');
      return 'Cursor shown';
    case 'vif_cursor_hide':
      await send('cursor.hide');
      return 'Cursor hidden';
    case 'vif_cursor_move':
      await send('cursor.moveTo', { x: args.x, y: args.y, duration: args.duration ?? 0.3 });
      return `Cursor moved to (${args.x}, ${args.y})`;
    case 'vif_cursor_click':
      await send('cursor.click');
      return 'Clicked';

    // Label
    case 'vif_label_show':
      await send('label.show', { text: args.text, position: args.position });
      return `Label shown: "${args.text}"`;
    case 'vif_label_update':
      await send('label.update', { text: args.text });
      return `Label updated: "${args.text}"`;
    case 'vif_label_hide':
      await send('label.hide');
      return 'Label hidden';

    // Stage/backdrop
    case 'vif_backdrop_show':
      await send('stage.backdrop', { show: true });
      return 'Backdrop shown';
    case 'vif_backdrop_hide':
      await send('stage.backdrop', { show: false });
      return 'Backdrop hidden';
    case 'vif_stage_center':
      const result = await send('stage.center', { app: args.app, width: args.width, height: args.height });
      return `Centered ${args.app}${result.bounds ? ` at (${result.bounds.x}, ${result.bounds.y})` : ''}`;
    case 'vif_stage_clear':
      await send('stage.backdrop', { show: false });
      await send('cursor.hide');
      await send('label.hide');
      await send('viewport.hide');
      await send('keys.hide');
      await send('typer.hide');
      return 'Stage cleared';

    // Viewport
    case 'vif_viewport_set':
      await send('viewport.set', { x: args.x, y: args.y, width: args.width, height: args.height });
      return `Viewport set to (${args.x}, ${args.y}, ${args.width}x${args.height})`;
    case 'vif_viewport_show':
      await send('viewport.show');
      return 'Viewport shown';
    case 'vif_viewport_hide':
      await send('viewport.hide');
      return 'Viewport hidden';

    // Recording
    case 'vif_record_indicator':
      await send('record.indicator', { show: args.show });
      return args.show ? 'Recording indicator on' : 'Recording indicator off';

    // Keys
    case 'vif_keys_show':
      await send('keys.show', { keys: args.keys, press: args.press });
      return `Keys shown: ${(args.keys as string[]).join('+')}`;
    case 'vif_keys_hide':
      await send('keys.hide');
      return 'Keys hidden';

    // Typer
    case 'vif_typer_type':
      await send('typer.type', { text: args.text, style: args.style, delay: args.delay });
      return `Typing: "${args.text}"`;
    case 'vif_typer_hide':
      await send('typer.hide');
      return 'Typer hidden';

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Create and run server
const server = new Server(
  { name: 'vif', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, args as Record<string, unknown>);
    return { content: [{ type: 'text', text: result }] };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Vif MCP server running');
}

main().catch(console.error);
