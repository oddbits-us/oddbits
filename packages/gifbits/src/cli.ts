/**
 * GifBits CLI — print ffmpeg recipes or run ffmpeg when installed locally.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  buildAnimatedAvifArgs,
  buildAnimatedWebpArgs,
  buildGifArgs,
  buildGifFilterComplex,
  buildVideoFilterChain,
  describeRecipe,
  resolveEncodeParams,
  trimDurationSeconds,
} from './ffmpeg-plan';
import type { AnimatedExportFormat, CropRatio, GifBitsEncodePlan } from './types';
import { VERSION } from './version';

function printHelp(): void {
  console.log(`gifbits — ffmpeg recipes for animated AVIF, WebP, GIF, or PNG sequences

Usage:
  gifbits recipe [options]
  gifbits convert [options] -i <video> -o <out>

Commands:
  recipe    Print a shell-ready ffmpeg command (no ffmpeg required).
  convert   Run ffmpeg locally if found on PATH (otherwise exits with a hint).

Options:
  -i, --input <path>       Input video file (convert only)
  -o, --output <path>      Output file (convert only)
  --ratio <r>              16:9 | 1:1 | 9:16 (default: 16:9)
  --start <seconds>        Trim start (default: 0)
  --end <seconds>          Trim end (default: start + 10 if omitted)
  --fps <n>                Frame rate after crop/scale (default: 12; clamped 1–60)
  --quality <1-100>        Resolution / encoder tradeoff (default: 72)
  --format <f>             avif | webp | gif | image-sequence (default: avif)
  -h, --help               Show help
  -v, --version            Print version

Examples:
  gifbits recipe --ratio 9:16 --start 0 --end 4.5 --format avif --quality 80 --fps 15
  gifbits convert -i clip.mp4 -o hero.avif --ratio 1:1 --start 1 --end 5 --format avif
`);
}

function parseRatio(s: string): CropRatio {
  const t = s.trim();
  if (t === '16:9' || t === '1:1' || t === '9:16') return t;
  throw new Error(`Invalid --ratio "${s}". Use 16:9, 1:1, or 9:16.`);
}

function parseFormat(s: string): AnimatedExportFormat {
  const t = s.trim().toLowerCase();
  if (t === 'avif' || t === 'webp' || t === 'gif') return t;
  if (t === 'image-sequence' || t === 'sequence' || t === 'frames' || t === 'png-sequence') {
    return 'image-sequence';
  }
  throw new Error(`Invalid --format "${s}". Use avif, webp, gif, or image-sequence.`);
}

function parseNum(label: string, s: string): number {
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Invalid ${label} "${s}".`);
  return n;
}

function parseArgs(argv: string[]): {
  cmd: 'recipe' | 'convert';
  input?: string;
  output?: string;
  plan: GifBitsEncodePlan;
} {
  let cmd: 'recipe' | 'convert' = 'recipe';
  let input: string | undefined;
  let output: string | undefined;
  let ratio: CropRatio = '16:9';
  let start = 0;
  let end: number | undefined;
  let fps = 12;
  let quality = 72;
  let format: AnimatedExportFormat = 'avif';

  const rest = [...argv];
  const shift = () => rest.shift();

  if (rest[0] === 'recipe' || rest[0] === 'convert') {
    cmd = rest.shift() as 'recipe' | 'convert';
  }

  while (rest.length > 0) {
    const a = rest.shift()!;
    if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    }
    if (a === '-v' || a === '--version') {
      console.log(VERSION);
      process.exit(0);
    }
    if (a === '-i' || a === '--input') {
      input = shift();
      continue;
    }
    if (a === '-o' || a === '--output') {
      output = shift();
      continue;
    }
    if (a === '--ratio') {
      ratio = parseRatio(shift() ?? '');
      continue;
    }
    if (a === '--start') {
      start = parseNum('--start', shift() ?? '');
      continue;
    }
    if (a === '--end') {
      end = parseNum('--end', shift() ?? '');
      continue;
    }
    if (a === '--fps') {
      fps = parseNum('--fps', shift() ?? '');
      if (fps < 1 || fps > 60) throw new Error('--fps must be between 1 and 60.');
      continue;
    }
    if (a === '--quality') {
      quality = parseNum('--quality', shift() ?? '');
      if (quality < 1 || quality > 100) throw new Error('--quality must be between 1 and 100.');
      continue;
    }
    if (a === '--format') {
      format = parseFormat(shift() ?? '');
      continue;
    }
    throw new Error(`Unknown argument "${a}". Try gifbits --help.`);
  }

  if (end === undefined) {
    end = start + 10;
  }
  if (end <= start) {
    throw new Error('--end must be greater than --start.');
  }

  const plan: GifBitsEncodePlan = {
    cropRatio: ratio,
    trimStart: start,
    trimEnd: end,
    quality,
    fps,
    format,
  };

  return { cmd, input, output, plan };
}

function ffmpegOnPath(): string | null {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], {
    encoding: 'utf8',
  });
  if (r.status !== 0) return null;
  const line = r.stdout.trim().split(/\r?\n/)[0];
  return line || null;
}

function runConvert(plan: GifBitsEncodePlan, inputPath: string, outputPath: string): void {
  const absIn = path.resolve(inputPath);
  const absOut = path.resolve(outputPath);
  if (!fs.existsSync(absIn)) {
    console.error(`Input not found: ${absIn}`);
    process.exit(1);
  }

  if (plan.format === 'image-sequence') {
    console.error(
      'gifbits convert does not write PNG zip archives. Use `gifbits recipe --format image-sequence` for an ffmpeg line, or use the Oddbits browser workshop to download a zip.',
    );
    process.exit(1);
    return;
  }

  const resolved = resolveEncodeParams(plan.quality);
  const vf = buildVideoFilterChain(plan, resolved);
  const dur = trimDurationSeconds(plan);

  let argv: string[];
  if (plan.format === 'gif') {
    const fc = buildGifFilterComplex(plan, resolved);
    argv = buildGifArgs(fc, plan.trimStart, dur, absOut);
  } else if (plan.format === 'avif') {
    argv = buildAnimatedAvifArgs(vf, plan.trimStart, dur, resolved.avifCrf, absOut);
  } else {
    argv = buildAnimatedWebpArgs(vf, plan.trimStart, dur, resolved.webpQ, absOut);
  }

  const ffmpegPath = ffmpegOnPath();
  if (!ffmpegPath) {
    console.error('ffmpeg not found on PATH. Install ffmpeg or copy/paste the recipe instead:\n');
    console.error(describeRecipe(plan, inputPath, outputPath));
    process.exit(1);
  }

  const args = argv.map((x) => (x === 'input' ? absIn : x));
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

function main(): void {
  try {
    const argv = process.argv.slice(2);
    if (argv.length === 0) {
      printHelp();
      return;
    }
    const { cmd, input, output, plan } = parseArgs(argv);

    if (cmd === 'recipe') {
      const ext =
        plan.format === 'avif'
          ? 'avif'
          : plan.format === 'webp'
            ? 'webp'
            : plan.format === 'gif'
              ? 'gif'
              : 'zip';
      const line = describeRecipe(plan, 'input.mp4', `out.${ext}`);
      console.log(line);
      return;
    }

    if (cmd === 'convert') {
      if (!input || !output) {
        console.error('convert requires -i <video> and -o <output>');
        process.exit(1);
      }
      runConvert(plan, input, output);
      return;
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();
