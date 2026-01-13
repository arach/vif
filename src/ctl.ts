#!/usr/bin/env node
/**
 * vif-ctl - Simple CLI for controlling vif agent
 *
 * Usage:
 *   vif-ctl cursor show
 *   vif-ctl cursor move 500 400 [duration]
 *   vif-ctl cursor click
 *   vif-ctl cursor hide
 *   vif-ctl label show "Hello world"
 *   vif-ctl label update "New text"
 *   vif-ctl label hide
 *   vif-ctl backdrop on|off
 *   vif-ctl stage center AppName [width] [height]
 *   vif-ctl stage clear
 *   vif-ctl viewport set x y width height
 *   vif-ctl viewport show|hide
 *   vif-ctl indicator on|off
 *   vif-ctl keys show cmd shift p
 *   vif-ctl keys hide
 *   vif-ctl typer type "text" [style]
 *   vif-ctl typer hide
 *   vif-ctl panel show|hide
 *   vif-ctl panel headless on|off
 *   vif-ctl raw '{"action": "...", ...}'
 */

import WebSocket from 'ws';

const WS_URL = 'ws://localhost:7850';

async function send(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Connection timeout'));
    }, 5000);

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, action, ...params }));
    });

    ws.on('message', (data) => {
      clearTimeout(timeout);
      const msg = JSON.parse(data.toString());
      if (msg.id === 1) {
        ws.close();
        if (msg.ok) {
          resolve(msg);
        } else {
          reject(new Error(msg.error || 'Command failed'));
        }
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`Usage: vif-ctl <command> [args...]

Commands:
  cursor show|hide|click
  cursor move <x> <y> [duration]
  label show "<text>" [position]
  label update "<text>"
  label hide
  backdrop on|off
  stage center <app> [width] [height]
  stage clear
  viewport set <x> <y> <width> <height>
  viewport show|hide
  indicator on|off
  keys show <key1> <key2> ...
  keys hide
  typer type "<text>" [style]
  typer hide
  panel show|hide
  panel headless on|off
  raw '<json>'`);
    process.exit(0);
  }

  const [group, cmd, ...rest] = args;

  try {
    let result: unknown;

    switch (group) {
      case 'cursor':
        switch (cmd) {
          case 'show':
            result = await send('cursor.show');
            break;
          case 'hide':
            result = await send('cursor.hide');
            break;
          case 'click':
            result = await send('cursor.click');
            break;
          case 'move':
            const [x, y, duration] = rest.map(Number);
            result = await send('cursor.moveTo', { x, y, duration: duration || 0.3 });
            break;
          default:
            throw new Error(`Unknown cursor command: ${cmd}`);
        }
        break;

      case 'label':
        switch (cmd) {
          case 'show':
            result = await send('label.show', { text: rest[0], position: rest[1] || 'top' });
            break;
          case 'update':
            result = await send('label.update', { text: rest[0] });
            break;
          case 'hide':
            result = await send('label.hide');
            break;
          default:
            throw new Error(`Unknown label command: ${cmd}`);
        }
        break;

      case 'backdrop':
        result = await send('stage.backdrop', { show: cmd === 'on' });
        break;

      case 'stage':
        switch (cmd) {
          case 'center':
            const [app, width, height] = rest;
            result = await send('stage.center', {
              app,
              width: width ? Number(width) : undefined,
              height: height ? Number(height) : undefined,
            });
            break;
          case 'clear':
            await send('stage.backdrop', { show: false });
            await send('cursor.hide');
            await send('label.hide');
            await send('viewport.hide');
            await send('keys.hide');
            await send('typer.hide');
            result = { ok: true };
            break;
          default:
            throw new Error(`Unknown stage command: ${cmd}`);
        }
        break;

      case 'viewport':
        switch (cmd) {
          case 'set':
            const [vx, vy, vw, vh] = rest.map(Number);
            result = await send('viewport.set', { x: vx, y: vy, width: vw, height: vh });
            break;
          case 'show':
            result = await send('viewport.show');
            break;
          case 'hide':
            result = await send('viewport.hide');
            break;
          default:
            throw new Error(`Unknown viewport command: ${cmd}`);
        }
        break;

      case 'indicator':
        result = await send('record.indicator', { show: cmd === 'on' });
        break;

      case 'keys':
        switch (cmd) {
          case 'show':
            result = await send('keys.show', { keys: rest, press: true });
            break;
          case 'hide':
            result = await send('keys.hide');
            break;
          default:
            throw new Error(`Unknown keys command: ${cmd}`);
        }
        break;

      case 'typer':
        switch (cmd) {
          case 'type':
            result = await send('typer.type', { text: rest[0], style: rest[1] || 'default' });
            break;
          case 'hide':
            result = await send('typer.hide');
            break;
          default:
            throw new Error(`Unknown typer command: ${cmd}`);
        }
        break;

      case 'panel':
        switch (cmd) {
          case 'show':
            result = await send('panel.show');
            break;
          case 'hide':
            result = await send('panel.hide');
            break;
          case 'headless':
            result = await send('panel.headless', { enabled: rest[0] === 'on' });
            break;
          default:
            throw new Error(`Unknown panel command: ${cmd}`);
        }
        break;

      case 'raw':
        const raw = JSON.parse(cmd);
        result = await send(raw.action, raw);
        break;

      default:
        throw new Error(`Unknown command group: ${group}`);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

main();
