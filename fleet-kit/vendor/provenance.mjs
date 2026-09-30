#!/usr/bin/env node
/**
 * Proves every vendored module is still exactly what was vendored, and that its source has not moved on.
 *
 * Two findings, both failures:
 *   - EDITED IN THE KIT: the vendored file's hash differs from the one `sync.mjs` recorded. The kit
 *     forked a module whose behaviour is proven only by the reference fleet's selftests.
 *   - SOURCE MOVED ON: the reference file exists and its hash differs from the recorded one. The kit runs
 *     an older copy than the fleet it was taken from; re-run `sync.mjs` and the selftests.
 * A reference file that is ABSENT (the b100 checkout is not on this machine) is reported, never a
 * failure: the recorded hash still proves the copy is untouched.
 *
 * @es Prueba que cada módulo vendorizado sigue siendo exactamente lo vendorizado y que su fuente no
 * avanzó. EDITADO EN EL KIT o FUENTE AVANZADA son fallos; una fuente AUSENTE se informa, no falla.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROVENANCE_FILE, SOURCE_ROOT, VENDOR_ROOT } from './sources.mjs';

/** The sha256 of a file's bytes, hex. @es El sha256 de los bytes de un fichero. */
export const sha256Of = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/**
 * The findings for a provenance record against the two roots.
 * @returns `{ failures: string[], notes: string[] }`.
 * @es Los hallazgos de un registro de procedencia contra las dos raíces.
 */
export function provenanceFindings(record, { vendorRoot = VENDOR_ROOT, sourceRoot = SOURCE_ROOT } = {}) {
  const failures = [];
  const notes = [];

  for (const { path: relative, sha256 } of record.files) {
    const vendored = path.join(vendorRoot, relative);
    const source = path.join(sourceRoot, relative);

    if (!existsSync(vendored)) failures.push(`MISSING IN THE KIT  ${relative}`);
    else if (sha256Of(vendored) !== sha256) failures.push(`EDITED IN THE KIT   ${relative}`);

    if (!existsSync(source)) notes.push(`source absent       ${relative}`);
    else if (sha256Of(source) !== sha256) failures.push(`SOURCE MOVED ON     ${relative} — run vendor/sync.mjs, then selftest-all.mjs`);
  }

  return { failures, notes };
}

function main() {
  const record = JSON.parse(readFileSync(PROVENANCE_FILE, 'utf8'));
  const { failures, notes } = provenanceFindings(record);

  for (const line of [...notes, ...failures]) process.stdout.write(`${line}\n`);
  process.stdout.write(`provenance: ${record.files.length} vendored module(s), ${failures.length} failure(s)\n`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
