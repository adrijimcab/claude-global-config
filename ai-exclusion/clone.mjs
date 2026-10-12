/**
 * The git side of provisioning: where a clone's SHARED exclude file is, and which tracked files a set of
 * patterns would hide. The file is `<git-common-dir>/info/exclude`, so every linked worktree of the clone
 * reads the same one. Git itself decides what a pattern matches (`ls-files -c -i -X`), never a hand-made glob.
 *
 * @es El lado git de la provisión: dónde está el fichero de exclusión COMPARTIDO de un clon y qué ficheros
 * versionados ocultaría un conjunto de patrones. El fichero es `<git-common-dir>/info/exclude`, así que todo
 * worktree enlazado del clon lee el mismo. Lo que un patrón coincide lo decide git (`ls-files -c -i -X`),
 * nunca un glob hecho a mano.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Runs git in `repo` and returns stdout. @es Ejecuta git en `repo` y devuelve stdout. */
function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** The shared exclude file of the clone `repo` belongs to. @es El fichero de exclusión compartido del clon de `repo`. */
export function commonExcludeFile(repo) {
  const common = git(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();

  return path.join(common, 'info', 'exclude');
}

/**
 * The tracked files (paths from the worktree root) that `patterns` would match: a conflict if non-empty.
 * @es Los ficheros versionados que `patterns` coincidiría: si no está vacío, hay conflicto.
 */
export function trackedMatches(repo, patterns) {
  const top = git(repo, ['rev-parse', '--show-toplevel']).trim();
  const dir = mkdtempSync(path.join(tmpdir(), 'ai-exclusion-'));

  try {
    const patternFile = path.join(dir, 'patterns');

    writeFileSync(patternFile, `${patterns.join('\n')}\n`);

    return git(top, ['ls-files', '-z', '-c', '-i', '-X', patternFile]).split('\0').filter((entry) => entry.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
