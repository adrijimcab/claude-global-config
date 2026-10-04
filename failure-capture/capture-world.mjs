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
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

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
 * @returns `{ home, repo, ledger, incidents, run }` where `run(args, { cwd })` gives `{ status, out }`.
 * @es `files` son ficheros extra, relativos a la raíz del mundo (`home/...`, `repo/...`).
 */
export function makeCaptureWorld({ scratch, name, config = { scope: 'demo' }, files = {} }) {
  const root = path.join(scratch, name);
  const home = path.join(root, 'home');
  const repo = path.join(root, 'repo');
  const loop = path.join(home, '.claude', 'failure-capture');

  mkdirSync(path.join(loop, 'state'), { recursive: true });

  for (const file of readdirSync(HERE)) {
    if (file.endsWith('.mjs') && !file.includes('selftest') && !file.includes('mutants')) copyFileSync(path.join(HERE, file), path.join(loop, file));
  }

  writeFiles(root, { 'repo/.claude/CLAUDE.md': '# Project instructions\n', 'repo/.claude/failure-capture.json': JSON.stringify(config), 'home/.claude/rules/promoted-rules.md': '# Contract\n', ...files });

  const run = (args, { cwd = repo } = {}) => {
    const answer = spawnSync(process.execPath, [path.join(loop, 'capture.mjs'), ...args, ...(args[0] === 'capture' ? ['--ceiling', scratch] : [])], { cwd, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home }, timeout: 120_000 });

    return { status: answer.status, out: `${answer.stdout}${answer.stderr}` };
  };

  return { home, repo, ledger: path.join(home, '.claude', 'lessons-ledger.md'), incidents: path.join(loop, 'state', 'incidents.jsonl'), run };
}
