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
const SOURCE_SEGMENTS = Object.freeze(['Desktop', 'Projects', 'b100-am-ui', '.claude']);
const SOURCE_ROOT = path.join(os.homedir(), ...SOURCE_SEGMENTS);
// The record names the source home-relative: an absolute path would change with whichever machine synced
// (and leak its user name) while naming the same fleet. @es El registro nombra la fuente relativa al home:
// una ruta absoluta cambiaría según la máquina que sincronizó (y filtraría su usuario) para la misma flota.
const SOURCE_ROOT_RECORDED = ['~', ...SOURCE_SEGMENTS].join('/');
const PROVENANCE_FILE = path.join(HERE, 'PROVENANCE.json');

/** Relative paths under both roots. @es Rutas relativas bajo ambas raíces. */
export const VENDORED = Object.freeze([
  'shell-command/shell-command.mjs',
  'shell-command/git-invocations.mjs',
  'cherry-pick-guard/working-directory.mjs',
  'agent-liveness/liveness.mjs',
  'toolchain-guard/tree-tenancy.mjs',
  'toolchain-guard/package-manager-mutations.mjs',
  'brief-tenancy/tenancy-declaration.mjs',
  'mutation-proof/campaign-plan.mjs',
  'mutation-proof/deciding-modules.mjs',
  'mutation-proof/scope.mjs',
  'mutation-proof/scope.selftest.mjs',
  'mutation-proof/scope.mutants.mjs',
  'mutation-proof/scope-repository.selftest.mjs'
]);

function sync() {
  const files = VENDORED.map((relative) => {
    const target = path.join(TARGET_ROOT, relative);

    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(SOURCE_ROOT, relative), target);

    return { path: relative, sha256: sha256Of(target) };
  });

  writeFileSync(PROVENANCE_FILE, `${JSON.stringify({ sourceRoot: SOURCE_ROOT_RECORDED, syncedAt: new Date().toISOString(), files }, null, 2)}\n`);
  process.stdout.write(`vendored ${files.length} module(s) from ${SOURCE_ROOT} @es ${files.length} módulo(s) vendorizado(s) desde ${SOURCE_ROOT}\n`);

  return 0;
}

function check() {
  const record = JSON.parse(readFileSync(PROVENANCE_FILE, 'utf8'));
  const { failures, notes } = provenanceFindings(record, { vendorRoot: TARGET_ROOT, sourceRoot: SOURCE_ROOT });

  for (const line of [...notes, ...failures]) process.stdout.write(`${line}\n`);
  process.stdout.write(`provenance: ${record.files.length} vendored module(s), ${failures.length} failure(s) @es procedencia: ${record.files.length} módulo(s) vendorizado(s), ${failures.length} fallo(s)\n`);

  return failures.length === 0 ? 0 : 1;
}

/** Runs one command and returns the exit code. @es Ejecuta una orden y devuelve el código de salida. */
function main(command) {
  if (command === 'sync') return sync();
  if (command === 'check') return check();

  process.stdout.write('usage: vendored.mjs check | sync @es uso: vendored.mjs check | sync\n');

  return 2;
}

// Only as the main module: `VENDORED` is exported, so importing this file must not run a command.
// @es Solo como módulo principal: `VENDORED` se exporta, así que importar este fichero no debe correr una orden.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv[2]);
