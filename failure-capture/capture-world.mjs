/**
 * A CONSTRUCTED world for driving `capture.mjs` from a proof: a home holding a copy of the loop (so its
 * state, ledger and promoted-rules file are the fixture's own) and a project repository beside it. Nothing
 * here reads or writes the real home, ledger or incident log.
 *
 * @es Un mundo CONSTRUIDO para manejar `capture.mjs` desde una prueba: un home con copia del bucle (así su
 * estado, su ledger y su fichero de reglas promovidas son del fixture) y un repositorio de proyecto al lado.
 * Nada aquí lee ni escribe el home, el ledger o el registro de incidentes reales.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stateDirIn } from '../hook-state/locations.mjs';
import { provisionLoop, worldEnv } from './fixture-loop.mjs';

/** The lesson text every driven capture carries (40+ characters, states its RULE). @es El texto de lección de cada captura. */
export const lessonFor = (key) => `what went wrong for ${key} -> root cause -> RULE: do it right every time`;

/** Writes `files` (relative POSIX path -> contents) under `root`. @es Escribe `files` bajo `root`. */
export function writeFiles(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, ...relative.split('/'));

    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
}

/** The file's text, or the empty string when it is absent. @es El texto del fichero, o vacío si no existe. */
export const readOrEmpty = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

/**
 * @param scratch directory the world lives under; `name` its folder; `config` the project's
 *   `.claude/failure-capture.json`; `files` extra files, relative to the world root (`home/...`, `repo/...`).
 * @returns `{ home, repo, ledger, incidents, run }` where `run(args, { cwd, nodeArgs, env })` gives `{ status, out }`.
 * @es `files` son ficheros extra, relativos a la raíz del mundo (`home/...`, `repo/...`).
 */
export function makeCaptureWorld({ scratch, name, config = { scope: 'demo' }, files = {} }) {
  const root = path.join(scratch, name);
  const home = path.join(root, 'home');
  const repo = path.join(root, 'repo');
  const loop = path.join(home, '.claude', 'failure-capture');

  const state = stateDirIn(path.join(home, '.claude'), 'failure-capture');

  mkdirSync(state, { recursive: true });

  provisionLoop(loop, (file) => !file.includes('selftest') && !file.includes('mutants'));

  writeFiles(root, { 'repo/.claude/CLAUDE.md': '# Project instructions\n', 'repo/.claude/failure-capture.json': JSON.stringify(config), 'home/.claude/rules/promoted-rules.md': '# Contract\n', ...files });

  // `nodeArgs` go before the script (a `--require` test preload) and `env` is added to the world's own.
  // @es `nodeArgs` van antes del script (un `--require` de prueba) y `env` se suma al del mundo.
  const run = (args, { cwd = repo, nodeArgs = [], env = {} } = {}) => {
    const answer = spawnSync(process.execPath, [...nodeArgs, path.join(loop, 'capture.mjs'), ...args, ...(args[0] === 'capture' ? ['--ceiling', scratch] : [])], { cwd, encoding: 'utf8', env: { ...worldEnv(home), ...env }, timeout: 120_000 });

    return { status: answer.status, out: `${answer.stdout}${answer.stderr}` };
  };

  return { home, repo, ledger: path.join(home, '.claude', 'lessons-ledger.md'), incidents: path.join(state, 'incidents.jsonl'), run };
}

/**
 * The runs of `out` that are English only: a run is a stretch of non-blank lines, and it is bilingual when
 * the marker `@es` appears in it (one-line messages carry it inline, multi-line ones on their Spanish lines).
 * @returns the runs without the marker, empty when every message is bilingual.
 * @es Los tramos de `out` solo en inglés: un tramo es un conjunto de líneas no vacías y es bilingüe si lleva el marcador `@es`.
 */
export function monolingualRuns(out) {
  const runs = [[]];

  for (const line of out.split('\n')) {
    if (line.trim().length === 0) runs.push([]);
    else runs.at(-1).push(line);
  }

  return runs.map((run) => run.join('\n')).filter((run) => run.length > 0 && !run.includes('@es'));
}
