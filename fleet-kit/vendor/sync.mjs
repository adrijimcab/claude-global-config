#!/usr/bin/env node
/**
 * Re-vendors every module in `sources.mjs` from the reference fleet and rewrites `PROVENANCE.json`.
 * Copying is this script's job, never a person's: a hand copy is how a vendored module forks silently.
 * After a sync, run `node ~/.claude/fleet-kit/selftest-all.mjs` — a changed source is a changed kit.
 *
 * @es Vuelve a vendorizar cada módulo de `sources.mjs` y reescribe `PROVENANCE.json`. Copiar es trabajo
 * de este script, nunca de una persona. Tras sincronizar, correr `selftest-all.mjs`.
 */

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { sha256Of } from './provenance.mjs';
import { PROVENANCE_FILE, SOURCE_ROOT, VENDORED, VENDOR_ROOT } from './sources.mjs';

const files = VENDORED.map((relative) => {
  const source = path.join(SOURCE_ROOT, relative);
  const target = path.join(VENDOR_ROOT, relative);

  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(source, target);

  return { path: relative, sha256: sha256Of(target) };
});

writeFileSync(PROVENANCE_FILE, `${JSON.stringify({ sourceRoot: SOURCE_ROOT, syncedAt: new Date().toISOString(), files }, null, 2)}\n`);
process.stdout.write(`vendored ${files.length} module(s) from ${SOURCE_ROOT}\n`);
