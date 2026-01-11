#!/usr/bin/env node
/**
 * Vif CLI - Vivid screen capture for macOS
 */

import {
  getWindows,
  screenshot,
  screenshotApp,
  screenshotFullscreen,
  startRecording,
  recordVideo,
  convertVideo,
  optimizeForWeb,
  videoToGif,
  activateApp,
  listWindows,
  hasFFmpeg
} from './index.js';

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
Vif - Vivid screen capture for macOS

Usage: vif <command> [options]

Commands:
  windows                      List all visible windows
  shot <output.png>            Take a fullscreen screenshot
  shot --app <name> <output>   Take a screenshot of an app window
  shot --window <id> <output>  Take a screenshot of a window by ID
  record <output.mp4>          Start video recording (Ctrl+C to stop)
  record --duration <s> <out>  Record for specific duration
  convert <input> <output>     Convert/process video
  gif <input.mp4> <output.gif> Convert video to GIF
  optimize <input> <output>    Optimize video for web

Options:
  --app <name>       Target app by name
  --window <id>      Target window by ID
  --duration <sec>   Recording duration
  --width <px>       Target width for conversion
  --scale <factor>   Scale factor (e.g., 0.5)
  --fps <n>          Frame rate for GIF
  --no-shadow        Remove window shadow (default)
  --delay <sec>      Delay before capture

Examples:
  vif windows
  vif shot screenshot.png
  vif shot --app Safari safari.png
  vif record demo.mp4
  vif record --duration 10 demo.mp4
  vif gif demo.mp4 demo.gif --width 600 --fps 15
  vif optimize raw.mov web-ready.mp4 --width 1280
`);
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  let i = 0;

  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('--')) {
        result[key] = nextArg;
        i += 2;
      } else {
        result[key] = true;
        i += 1;
      }
    } else {
      if (!result._positional) {
        result._positional = arg;
      } else if (!result._positional2) {
        result._positional2 = arg;
      }
      i += 1;
    }
  }

  return result;
}

async function main() {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  const opts = parseArgs(args.slice(1));

  switch (command) {
    case 'windows':
    case 'list': {
      listWindows();
      break;
    }

    case 'shot':
    case 'screenshot': {
      const output = (opts._positional as string) || 'screenshot.png';

      if (opts.app) {
        console.log(`Capturing ${opts.app} window...`);
        const success = screenshotApp(opts.app as string, output, {
          noShadow: opts['no-shadow'] !== false,
          delay: opts.delay ? parseFloat(opts.delay as string) : 0
        });

        if (success) {
          console.log(`Screenshot saved: ${output}`);
        } else {
          console.error('Screenshot failed');
          process.exit(1);
        }
      } else if (opts.window) {
        console.log(`Capturing window ${opts.window}...`);
        const success = screenshot({
          output,
          windowId: parseInt(opts.window as string, 10),
          noShadow: opts['no-shadow'] !== false,
          delay: opts.delay ? parseFloat(opts.delay as string) : 0
        });

        if (success) {
          console.log(`Screenshot saved: ${output}`);
        } else {
          console.error('Screenshot failed');
          process.exit(1);
        }
      } else {
        console.log('Capturing fullscreen...');
        const success = screenshotFullscreen(output);

        if (success) {
          console.log(`Screenshot saved: ${output}`);
        } else {
          console.error('Screenshot failed');
          process.exit(1);
        }
      }
      break;
    }

    case 'record':
    case 'video': {
      const output = (opts._positional as string) || 'recording.mp4';

      if (opts.duration) {
        const duration = parseFloat(opts.duration as string);
        console.log(`Recording for ${duration} seconds...`);

        try {
          const result = await recordVideo({
            output,
            duration,
            audio: opts.audio === true
          });
          console.log(`Recording saved: ${result}`);
        } catch (error) {
          console.error('Recording failed:', error);
          process.exit(1);
        }
      } else {
        console.log('Recording... Press Ctrl+C to stop');

        const recording = startRecording({
          output,
          audio: opts.audio === true
        });

        process.on('SIGINT', async () => {
          console.log('\nStopping recording...');
          try {
            const result = await recording.stop();
            console.log(`Recording saved: ${result}`);
            process.exit(0);
          } catch (error) {
            console.error('Failed to save recording:', error);
            process.exit(1);
          }
        });

        // Keep process alive
        await new Promise(() => {});
      }
      break;
    }

    case 'convert': {
      const input = opts._positional as string;
      const output = opts._positional2 as string;

      if (!input || !output) {
        console.error('Usage: vif convert <input> <output>');
        process.exit(1);
      }

      console.log(`Converting ${input} to ${output}...`);
      const success = convertVideo({
        input,
        output,
        width: opts.width ? parseInt(opts.width as string, 10) : undefined,
        scale: opts.scale ? parseFloat(opts.scale as string) : undefined,
        crf: opts.crf ? parseInt(opts.crf as string, 10) : undefined,
        noAudio: opts['no-audio'] === true
      });

      if (success) {
        console.log(`Converted: ${output}`);
      } else {
        console.error('Conversion failed');
        process.exit(1);
      }
      break;
    }

    case 'optimize': {
      const input = opts._positional as string;
      const output = opts._positional2 as string;
      const width = opts.width ? parseInt(opts.width as string, 10) : 1280;

      if (!input || !output) {
        console.error('Usage: vif optimize <input> <output>');
        process.exit(1);
      }

      console.log(`Optimizing ${input} for web (max width: ${width}px)...`);
      const success = optimizeForWeb(input, output, width);

      if (success) {
        console.log(`Optimized: ${output}`);
      } else {
        console.error('Optimization failed');
        process.exit(1);
      }
      break;
    }

    case 'gif': {
      const input = opts._positional as string;
      const output = opts._positional2 as string;

      if (!input || !output) {
        console.error('Usage: vif gif <input.mp4> <output.gif>');
        process.exit(1);
      }

      console.log(`Converting ${input} to GIF...`);
      const success = videoToGif(input, output, {
        width: opts.width ? parseInt(opts.width as string, 10) : 480,
        fps: opts.fps ? parseInt(opts.fps as string, 10) : 10
      });

      if (success) {
        console.log(`GIF created: ${output}`);
      } else {
        console.error('GIF conversion failed');
        process.exit(1);
      }
      break;
    }

    case 'activate': {
      const appName = opts._positional as string;
      if (!appName) {
        console.error('Usage: vif activate <app-name>');
        process.exit(1);
      }
      activateApp(appName);
      console.log(`Activated: ${appName}`);
      break;
    }

    case 'check': {
      console.log('System check:');
      console.log(`  screencapture: available (macOS built-in)`);
      console.log(`  ffmpeg: ${hasFFmpeg() ? 'available' : 'NOT FOUND (install with: brew install ffmpeg)'}`);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
