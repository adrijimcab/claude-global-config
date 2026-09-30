#!/usr/bin/env node
/**
 * Records a dismissal of a config-sync-guard block, with a stated reason — same discipline as
 * `backlog-guard/dismiss.mjs` and `failure-capture/capture.mjs dismiss`: a false positive is tolerated,
 * but costs a WRITTEN reason, never a silent escape.
 * @es Registra el descarte de un bloqueo de config-sync-guard, con un motivo. Mismo criterio que
 * `backlog-guard/dismiss.mjs`: un falso positivo se tolera, pero cuesta un motivo ESCRITO.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(HERE, 'state');
const DISMISSALS_FILE = path.join(STATE_DIR, 'dismissals.jsonl');

/** The shortest reason accepted, the same floor every sibling dismiss command applies. @es El motivo más corto aceptado. */
export const MINIMUM_REASON_LENGTH = 25;

/** Parses `--flag value` pairs into a plain object, no regex. @es Convierte pares `--flag valor` en un objeto, sin regex. */
export function parseArgs(argv) {
  const out = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!token.startsWith('--')) continue;

    const name = token.slice(2);
    const next = argv[i + 1];

    if (next === undefined || next.startsWith('--')) {
      out[name] = true;
      continue;
    }

    out[name] = next;
    i += 1;
  }

  return out;
}

/** Records `args`' dismissal, or refuses with problems. @es Registra el descarte de `args`, o rechaza. */
export function commandDismiss(args, { append = appendFileSync, mkdir = mkdirSync } = {}) {
  const { reason, repo, session } = args;
  const problems = [];

  if (typeof reason !== 'string' || reason.trim().length < MINIMUM_REASON_LENGTH) {
    problems.push(`--reason must say WHY this repo's state is not real drift (${String(MINIMUM_REASON_LENGTH)}+ chars)`);
  }
  if (typeof reason === 'string' && (reason.includes('\n') || reason.includes('\r'))) {
    problems.push('--reason must be one line: it is written verbatim into a one-line JSONL entry');
  }

  if (problems.length > 0) return { ok: false, problems };

  try {
    mkdir(STATE_DIR, { recursive: true });
    append(DISMISSALS_FILE, `${JSON.stringify({ at: new Date().toISOString(), session: session ?? 'unknown', repo: repo ?? 'unknown', reason })}\n`, 'utf8');
  } catch (error) {
    return { ok: false, problems: [`could not write the dismissal log: ${error instanceof Error ? error.message : String(error)}`] };
  }

  return { ok: true };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { ok, problems } = commandDismiss(args);

  if (!ok) {
    console.error('config-sync-guard dismiss REFUSED:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  console.log('DISMISSED and recorded. The turn may end.');
  process.exit(0);
}

// Solo como proceso principal. Si otro módulo la importa (un selftest), main() no corre.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
