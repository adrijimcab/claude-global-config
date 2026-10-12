/**
 * Provisions one clone: puts the declared AI-exclusion block into its shared `info/exclude`, or judges
 * whether it is already there. Three modes: `apply` writes (and only when the text would change), `dry-run`
 * writes nothing and reports what would change, `check` writes nothing and reports `ok`, `stale` or `missing`.
 * It never touches the versioned `.gitignore`. A clone that TRACKS a file one entry would match is a
 * `conflict`: nothing is written, because hiding a tracked path's new files is not a decision to make silently.
 *
 * @es Provisiona un clon: pone el bloque de exclusión de IA declarado en su `info/exclude` compartido, o
 * juzga si ya está. Tres modos: `apply` escribe (solo si el texto cambia), `dry-run` no escribe y dice qué
 * cambiaría, `check` no escribe y dice `ok`, `stale` o `missing`. Nunca toca el `.gitignore` versionado. Un
 * clon que VERSIONA un fichero que una entrada coincidiría es un `conflict`: no se escribe nada.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { AI_PATHS } from './ai-paths.mjs';
import { blockState, withBlock } from './block.mjs';
import { commonExcludeFile, trackedMatches } from './clone.mjs';

const PATTERNS = AI_PATHS.map((entry) => entry.pattern);

/**
 * @returns `{ status, file, conflicts?, alreadyByHand? }` where `status` is `conflict`, `ok`, `stale`,
 * `missing` (check), `would-write` or `unchanged` (dry-run), `written` or `unchanged` (apply).
 * @es `{ status, file, conflicts?, alreadyByHand? }`.
 */
export function provision(repo, mode, patterns = PATTERNS) {
  const file = commonExcludeFile(repo);
  const conflicts = trackedMatches(repo, patterns);

  if (conflicts.length > 0) return { status: 'conflict', file, conflicts };

  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const state = blockState(before, patterns);

  if (mode === 'check') return { status: state, file };

  const after = withBlock(before, patterns);
  const handLines = new Set(before.split(/\r?\n/));
  const alreadyByHand = patterns.filter((pattern) => handLines.has(pattern));

  if (after === before) return { status: 'unchanged', file, alreadyByHand };
  if (mode === 'dry-run') return { status: 'would-write', file, alreadyByHand };

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, after);

  return { status: 'written', file, alreadyByHand };
}
