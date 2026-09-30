#!/usr/bin/env node
/**
 * The shared modules the GLOBAL guards in `~/.claude/` import, vendored byte-identical from the b100-am-ui
 * fleet, which still owns them because its own project-specific guards import them too.
 *
 *   node ~/.claude/vendored/vendored.mjs check   provenance: every copy untouched, every source unchanged
 *   node ~/.claude/vendored/vendored.mjs sync    re-copy every source and re-record its sha256
 *
 * WHY THEY SIT WHERE THEY SIT. Each copy keeps the relative position its source has under
 * `b100-am-ui/.claude/` (`~/.claude/shell-command/…`, `~/.claude/cherry-pick-guard/working-directory.mjs`),
 * so the moved guards' own relative imports resolve unchanged. A folder named for a b100-only guard
 * (`cherry-pick-guard/`, `toolchain-guard/`) holds ONLY the vendored module listed here — the guard itself
 * stays in b100.
 *
 * WHY NOT MOVE THEM. A module both sides import has one owner; b100's guards import these by relative path,
 * so moving them would break b100's fleet. Copying is this script's job, never a person's, and the check
 * fails the moment either side moves.
 *
 * @es Los módulos compartidos que importan las guardias GLOBALES de `~/.claude/`, vendorizados idénticos
 * desde la flota de b100-am-ui, que sigue siendo su dueña porque sus guardias propias también los importan.
 * Cada copia conserva la posición relativa de su fuente, para que los imports relativos resuelvan igual.
 * Copiar es trabajo de este script; la comprobación falla en cuanto cualquiera de los dos lados cambia.
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { provenanceFindings, sha256Of } from '../fleet-kit/vendor/provenance.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET_ROOT = path.resolve(HERE, '..');
const SOURCE_ROOT = path.join(os.homedir(), 'Desktop', 'Projects', 'b100-am-ui', '.claude');
const PROVENANCE_FILE = path.join(HERE, 'PROVENANCE.json');

/** Relative paths under both roots. @es Rutas relativas bajo ambas raíces. */
export const VENDORED = Object.freeze([
  'shell-command/shell-command.mjs',
  'shell-command/git-invocations.mjs',
  'cherry-pick-guard/working-directory.mjs',
  'agent-liveness/liveness.mjs',
  'toolchain-guard/tree-tenancy.mjs',
  'toolchain-guard/package-manager-mutations.mjs',
  'brief-tenancy/tenancy-declaration.mjs'
]);

function sync() {
  const files = VENDORED.map((relative) => {
    const target = path.join(TARGET_ROOT, relative);

    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(SOURCE_ROOT, relative), target);

    return { path: relative, sha256: sha256Of(target) };
  });

  writeFileSync(PROVENANCE_FILE, `${JSON.stringify({ sourceRoot: SOURCE_ROOT, syncedAt: new Date().toISOString(), files }, null, 2)}\n`);
  process.stdout.write(`vendored ${files.length} module(s) from ${SOURCE_ROOT}\n`);

  return 0;
}

function check() {
  const record = JSON.parse(readFileSync(PROVENANCE_FILE, 'utf8'));
  const { failures, notes } = provenanceFindings(record, { vendorRoot: TARGET_ROOT, sourceRoot: SOURCE_ROOT });

  for (const line of [...notes, ...failures]) process.stdout.write(`${line}\n`);
  process.stdout.write(`provenance: ${record.files.length} vendored module(s), ${failures.length} failure(s)\n`);

  return failures.length === 0 ? 0 : 1;
}

const command = process.argv[2];

if (command === 'sync') process.exitCode = sync();
else if (command === 'check') process.exitCode = check();
else {
  process.stdout.write('usage: vendored.mjs check | sync\n');
  process.exitCode = 2;
}
