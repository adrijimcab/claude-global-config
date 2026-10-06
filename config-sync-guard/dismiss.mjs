#!/usr/bin/env node
/**
 * Records a dismissal of a config-sync-guard block, with a stated reason — same discipline as
 * `backlog-guard/dismiss.mjs` and `failure-capture/capture.mjs dismiss`: a false positive is tolerated,
 * but costs a WRITTEN reason, never a silent escape.
 *
 * SCOPED TO A FINGERPRINT since 2026-09-30. The original shape recorded only `{at, session, repo,
 * reason}`, so a dismissal excused a repo FOREVER — measured directly: the same two paths
 * (`hook-dispatch/manifests/subagent-stop.json` and `vendored/`, a stopped agent's frozen work) had to
 * be re-dismissed on every single turn of the same session, because `decide.mjs` never read the log at
 * all. Every dismissal now also measures and records `fingerprint` (`fingerprint.mjs` — the repo's
 * current ahead count plus a content-addressed tree hash of its whole worktree) at the moment of the
 * dismissal, and `decide.mjs` only honours it while the repo's CURRENT fingerprint matches. A
 * fingerprint that cannot be measured REFUSES the dismissal outright — recording one anyway would write
 * a record that could never scope anything, which is worse than no record at all.
 *
 * @es Registra el descarte de un bloqueo de config-sync-guard, con un motivo. Mismo criterio que
 * `backlog-guard/dismiss.mjs`: un falso positivo se tolera, pero cuesta un motivo ESCRITO.
 *
 * ACOTADO A UNA HUELLA desde 2026-09-30: la forma original solo grababa `{at, session, repo, reason}`,
 * así que un descarte disculpaba un repo PARA SIEMPRE — medido directamente: las mismas dos rutas
 * tuvieron que redescartarse en cada turno de la misma sesión, porque `decide.mjs` nunca leía el log.
 * Cada descarte ahora también mide y graba `fingerprint` (`fingerprint.mjs`) en el momento del descarte,
 * y `decide.mjs` solo lo honra mientras la huella ACTUAL del repo coincida. Una huella que no se puede
 * medir RECHAZA el descarte: grabar uno de todas formas dejaría un registro que nunca podría acotar
 * nada, peor que no tener registro.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stateDir } from '../hook-state/locations.mjs';
import { measureFingerprint } from './fingerprint.mjs';
import { declaredRepos } from './repos.mjs';

/** Where this mechanism keeps its state, resolved at each call through the one state-location module. @es Dónde guarda su estado este mecanismo, resuelto en cada llamada por el único módulo de ubicaciones. */
const stateDirectory = () => stateDir('config-sync-guard');
const dismissalsFile = () => path.join(stateDirectory(), 'dismissals.jsonl');

/** The shortest reason accepted, the same floor every sibling dismiss command applies. @es El motivo más corto aceptado. */
export const MINIMUM_REASON_LENGTH = 25;

/**
 * Every dismissal record ever appended, parsed, oldest first. A malformed line is SKIPPED, never
 * thrown over — one corrupted line must not blind `decide.mjs` to every other dismissal in the file. A
 * file that cannot be read at all (absent, permissions) yields an empty list, which is exactly right:
 * "no dismissal recorded" is `decide.mjs`'s own safe default too.
 * @es Cada descarte grabado, parseado, del más antiguo al más nuevo. Una línea mal formada se OMITE, sin
 * lanzar — un fichero ilegible produce una lista vacía, el mismo valor por defecto seguro de `decide.mjs`.
 */
export function readDismissals({ read = readFileSync } = {}) {
  let raw;

  try {
    raw = read(dismissalsFile(), 'utf8');
  } catch {
    return [];
  }

  const records = [];

  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue;

    try {
      records.push(JSON.parse(line));
    } catch {
      continue; // one corrupted line skips, the rest of the log still speaks. @es una línea corrupta se omite, el resto del log sigue hablando.
    }
  }

  return records;
}

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

/**
 * Records `args`' dismissal, or refuses with problems. `repos`/`fingerprintOf` are injectable so a
 * selftest can drive this against a fake repo without touching any real declared repo or spawning git.
 * @es Registra el descarte de `args`, o rechaza. `repos`/`fingerprintOf` son inyectables.
 */
export function commandDismiss(args, { append = appendFileSync, mkdir = mkdirSync, repos = declaredRepos(), fingerprintOf = measureFingerprint } = {}) {
  const { reason, repo: repoName, session } = args;
  const problems = [];

  if (typeof reason !== 'string' || reason.trim().length < MINIMUM_REASON_LENGTH) {
    problems.push(`--reason must say WHY this repo's state is not real drift (${String(MINIMUM_REASON_LENGTH)}+ chars)`);
  }
  if (typeof reason === 'string' && (reason.includes('\n') || reason.includes('\r'))) {
    problems.push('--reason must be one line: it is written verbatim into a one-line JSONL entry');
  }

  const repo = typeof repoName === 'string' ? repos.find((entry) => entry.name === repoName) : undefined;

  if (repo === undefined) {
    problems.push(`--repo must name one of the declared backup repos (${repos.map((entry) => entry.name).join(', ')})`);
  }

  if (problems.length > 0) return { ok: false, problems };

  const fingerprint = fingerprintOf(repo);

  if (fingerprint === undefined) {
    return { ok: false, problems: [`could not measure ${repoName}'s current fingerprint; the dismissal was NOT recorded (an unmeasured state excuses nothing)`] };
  }

  try {
    mkdir(stateDirectory(), { recursive: true });
    append(dismissalsFile(), `${JSON.stringify({ at: new Date().toISOString(), session: session ?? 'unknown', repo: repoName, reason, fingerprint })}\n`, 'utf8');
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

  console.log('DISMISSED for the CURRENT state and recorded. Any later change (a new path, an edited byte, a different ahead count) re-blocks automatically. The turn may end.');
  process.exit(0);
}

// Solo como proceso principal. Si otro módulo la importa (un selftest), main() no corre.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
