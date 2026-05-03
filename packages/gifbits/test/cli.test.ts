/**
 * CLI smoke test (uses built dist/cli.js).
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { VERSION } from '../src/version';

const cliPath = path.resolve(__dirname, '..', 'dist', 'cli.js');

describe('gifbits CLI', () => {
  it('prints version', () => {
    if (!fs.existsSync(cliPath)) {
      throw new Error('Run `pnpm run build` in packages/gifbits before cli tests.');
    }
    const r = spawnSync(process.execPath, [cliPath, '-v'], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), VERSION);
  });
});
