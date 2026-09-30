#!/usr/bin/env node
/**
 * Proves the vendored-code provenance check DISCRIMINATES, on constructed roots: untouched, a copy edited
 * in place, a source that moved on, a missing copy, and an absent source (a note, never a failure).
 * @es Prueba que la comprobación de procedencia DISCRIMINA, sobre raíces construidas.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { provenanceFindings, sha256Of } from '../fleet-kit/vendor/provenance.mjs';

const root = mkdtempSync(path.join(os.tmpdir(), 'vendored-selftest-'));
const vendorRoot = path.join(root, 'vendor');
const sourceRoot = path.join(root, 'source');
let failed = 0;
let checks = 0;

const put = (base, relative, text) => {
  mkdirSync(path.dirname(path.join(base, relative)), { recursive: true });
  writeFileSync(path.join(base, relative), text);
};

function check(label, findings, expected) {
  const actual = JSON.stringify({ failures: findings.failures.map((line) => line.split(' ')[0]), notes: findings.notes.length });
  const ok = actual === JSON.stringify(expected);

  checks += 1;

  if (!ok) failed += 1;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  expected ${JSON.stringify(expected)} got ${actual}`}\n`);
}

try {
  put(sourceRoot, 'a/one.mjs', 'export const one = 1;\n');
  put(vendorRoot, 'a/one.mjs', 'export const one = 1;\n');

  const record = { files: [{ path: 'a/one.mjs', sha256: sha256Of(path.join(vendorRoot, 'a/one.mjs')) }] };
  const findings = () => provenanceFindings(record, { vendorRoot, sourceRoot });

  check('untouched copy and unchanged source: no failure', findings(), { failures: [], notes: 0 });
  put(vendorRoot, 'a/one.mjs', 'export const one = 2;\n');
  check('a copy edited in the kit fails as EDITED', findings(), { failures: ['EDITED'], notes: 0 });
  put(vendorRoot, 'a/one.mjs', 'export const one = 1;\n');
  put(sourceRoot, 'a/one.mjs', 'export const one = 3;\n');
  check('a source that moved on fails as SOURCE', findings(), { failures: ['SOURCE'], notes: 0 });
  rmSync(path.join(sourceRoot, 'a/one.mjs'));
  check('an absent source is a note, never a failure', findings(), { failures: [], notes: 1 });
  rmSync(path.join(vendorRoot, 'a/one.mjs'));
  check('a missing copy fails as MISSING', findings(), { failures: ['MISSING'], notes: 1 });
} finally {
  rmSync(root, { recursive: true, force: true });
}

process.stdout.write(`vendored provenance selftest: ${checks - failed}/${checks} passed\n`);
process.exitCode = failed === 0 ? 0 : 1;
