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
  hasFFmpeg,
  analyzeAudio,
  mixAudio,
  createTake,
  listTakes,
  revertTake,
  pruneTakes,
  renderStoryboardFile
} from './index.js';

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
Vif - Vivid screen capture for macOS

Usage: vif <command> [options]

Capture Commands:
  windows                      List all visible windows
  shot <output.png>            Take a fullscreen screenshot
  shot --app <name> <output>   Screenshot an app window
  record <output.mp4>          Start video recording (Ctrl+C to stop)
  record --duration <s> <out>  Record for specific duration

Processing Commands:
  convert <input> <output>     Convert/process video
  gif <input> <output.gif>     Convert video to GIF
  optimize <input> <output>    Optimize video for web
  mix <video> <audio> <out>    Add audio track to video

Storyboard Commands:
  render <storyboard.yaml>     Render a storyboard to video
  analyze <audio>              Analyze audio file (duration, beats)

Take Management:
  take new <asset> [note]      Create a new take/version
  take list <asset>            List all takes for an asset
  take revert <asset> <ver>    Revert to a specific take
  take prune <asset> --keep N  Keep only last N takes

Options:
  --app <name>       Target app by name
  --window <id>      Target window by ID
  --duration <sec>   Recording/clip duration
  --width <px>       Target width
  --fps <n>          Frame rate
  --bpm <n>          Beats per minute (for audio sync)
  --volume <0-1>     Audio volume
  --fade-in <sec>    Audio fade in
  --fade-out <sec>   Audio fade out
  --verbose, -v      Verbose output
  --keep <n>         Number of takes to keep

Examples:
  vif shot --app Safari safari.png
  vif record --duration 10 demo.mp4
  vif mix demo.mp4 music.mp3 final.mp4 --volume 0.7 --fade-out 2
  vif render storyboard.yaml --bpm 120 --verbose
  vif take new demo.mp4 "shortened intro"
  vif analyze music.mp3 --bpm 128
`);
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('--') && !nextArg.startsWith('-')) {
        result[key] = nextArg;
        i += 2;
      } else {
        result[key] = true;
        i += 1;
      }
    } else if (arg === '-v') {
      result['verbose'] = true;
      i += 1;
    } else {
      positionals.push(arg);
      i += 1;
    }
  }

  // Assign positionals
  if (positionals[0]) result._positional = positionals[0];
  if (positionals[1]) result._positional2 = positionals[1];
  if (positionals[2]) result._positional3 = positionals[2];
  if (positionals[3]) result._positional4 = positionals[3];

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
        console.error('Usage: vif gif <input> <output.gif>');
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

    case 'mix': {
      const video = opts._positional as string;
      const audio = opts._positional2 as string;
      const output = opts._positional3 as string;

      if (!video || !audio || !output) {
        console.error('Usage: vif mix <video> <audio> <output>');
        process.exit(1);
      }

      console.log(`Mixing ${audio} into ${video}...`);
      const success = mixAudio({
        video,
        audio,
        output,
        volume: opts.volume ? parseFloat(opts.volume as string) : 1.0,
        fadeIn: opts['fade-in'] ? parseFloat(opts['fade-in'] as string) : 0,
        fadeOut: opts['fade-out'] ? parseFloat(opts['fade-out'] as string) : 0,
        loop: opts.loop === true
      });

      if (success) {
        console.log(`Mixed: ${output}`);
      } else {
        console.error('Mixing failed');
        process.exit(1);
      }
      break;
    }

    case 'analyze': {
      const input = opts._positional as string;

      if (!input) {
        console.error('Usage: vif analyze <audio-file> [--bpm N]');
        process.exit(1);
      }

      const bpm = opts.bpm ? parseInt(opts.bpm as string, 10) : undefined;
      const analysis = analyzeAudio(input, bpm);

      if (analysis) {
        console.log(`\nAudio Analysis: ${input}`);
        console.log('─'.repeat(40));
        console.log(`  Duration: ${analysis.duration.toFixed(2)}s`);
        console.log(`  Format: ${analysis.format}`);
        console.log(`  Sample Rate: ${analysis.sampleRate}Hz`);
        console.log(`  Channels: ${analysis.channels}`);

        if (analysis.bpm && analysis.beats) {
          console.log(`  BPM: ${analysis.bpm}`);
          console.log(`  Total Beats: ${analysis.beats.length}`);
          console.log(`  First 10 beats: ${analysis.beats.slice(0, 10).map(b => b.toFixed(2)).join('s, ')}s`);
        }

        // Output JSON for piping
        if (opts.json) {
          console.log('\nJSON:');
          console.log(JSON.stringify(analysis, null, 2));
        }
      } else {
        console.error('Analysis failed');
        process.exit(1);
      }
      break;
    }

    case 'render': {
      const storyboardPath = opts._positional as string;

      if (!storyboardPath) {
        console.error('Usage: vif render <storyboard.yaml> [--bpm N] [--verbose]');
        process.exit(1);
      }

      const bpm = opts.bpm ? parseInt(opts.bpm as string, 10) : undefined;
      const verbose = opts.verbose === true;

      console.log(`Rendering storyboard: ${storyboardPath}`);
      const success = renderStoryboardFile(storyboardPath, { bpm, verbose });

      if (success) {
        console.log('Render complete!');
      } else {
        console.error('Render failed');
        process.exit(1);
      }
      break;
    }

    case 'take': {
      const subcommand = opts._positional as string;

      switch (subcommand) {
        case 'new': {
          const asset = opts._positional2 as string;
          const note = opts._positional3 as string || '';

          if (!asset) {
            console.error('Usage: vif take new <asset> [note]');
            process.exit(1);
          }

          const take = createTake(asset, note);
          if (take) {
            console.log(`Created take ${take.version}: ${take.file}`);
            if (note) console.log(`  Note: ${note}`);
          } else {
            console.error('Failed to create take');
            process.exit(1);
          }
          break;
        }

        case 'list': {
          const asset = opts._positional2 as string;

          if (!asset) {
            console.error('Usage: vif take list <asset>');
            process.exit(1);
          }

          const takes = listTakes(asset);
          if (takes.length === 0) {
            console.log('No takes found for this asset');
          } else {
            console.log(`\nTakes for ${asset}:`);
            console.log('─'.repeat(50));
            for (const take of takes) {
              const date = new Date(take.timestamp).toLocaleString();
              console.log(`  v${take.version}: ${take.file}`);
              console.log(`         ${date}${take.note ? ` - "${take.note}"` : ''}`);
            }
          }
          break;
        }

        case 'revert': {
          const asset = opts._positional2 as string;
          const version = opts._positional3 ? parseInt(opts._positional3 as string, 10) : NaN;

          if (!asset || isNaN(version)) {
            console.error('Usage: vif take revert <asset> <version>');
            process.exit(1);
          }

          const success = revertTake(asset, version);
          if (success) {
            console.log(`Reverted ${asset} to version ${version}`);
          } else {
            console.error('Failed to revert');
            process.exit(1);
          }
          break;
        }

        case 'prune': {
          const asset = opts._positional2 as string;
          const keep = opts.keep ? parseInt(opts.keep as string, 10) : 5;

          if (!asset) {
            console.error('Usage: vif take prune <asset> --keep N');
            process.exit(1);
          }

          const pruned = pruneTakes(asset, keep);
          console.log(`Pruned ${pruned} old takes, keeping last ${keep}`);
          break;
        }

        default:
          console.error('Usage: vif take <new|list|revert|prune> ...');
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
