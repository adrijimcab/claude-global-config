/**
 * WHAT WOULD BE LOST — the adjudicating half, asked of the INDEX rather than of the command.
 *
 * THE LESSON (`collision-fixed-by-deleting-unread-side`). Resolving a conflict by taking one whole
 * side preserves only what somebody thought to check afterwards. Measured on this project: three
 * `docs/SCRIPTS.md` conflicts were resolved by keeping one side and re-substituting the cells a gate
 * compares, which silently dropped a hand-authored paragraph salvaged hours earlier — leaving the row
 * self-contradicting while `check:script-docs` stayed green throughout, because that gate compares
 * commands and never reads prose. A side-taking resolution loses exactly the content NO GATE VERIFIES,
 * which is also the content a human wrote deliberately and nobody will notice missing.
 *
 * SO THE QUESTION IS NOT "is this a conflict" BUT "does the side being DROPPED hold anything the base
 * did not". git already knows: a conflicted path has up to three index stages — 1 the merge base, 2
 * ours, 3 theirs — and comparing the dropped side's blob with the base's answers it exactly, with no
 * heuristics and no reading of content.
 *
 *   dropped blob ABSENT            the other side deleted the file; there is no content to lose here
 *   base ABSENT (add/add)          both sides authored this file independently: every byte of the
 *                                  dropped one is unique
 *   dropped blob === base blob     that side changed nothing; taking the other one is LOSSLESS
 *   dropped blob !== base blob     that side carries changes the resolution would discard unread
 *
 * A FAILED MEASUREMENT IS NEVER A FINDING (`measurement-failure-is-not-a-zero`): when git cannot be
 * asked, the result is `unmeasured`, and the caller allows rather than refusing on an empty answer.
 *
 * NO REGEX (M5): `split` and `startsWith` on literals.
 *
 * @es QUÉ SE PERDERÍA, preguntado al ÍNDICE y no al comando. Quedarse con un lado entero conserva solo
 * lo que alguien se acuerde de comprobar después: MEDIDO, tres conflictos de `docs/SCRIPTS.md`
 * resueltos así tiraron un párrafo escrito a mano con el gate en verde todo el rato, porque ese gate
 * compara comandos y no lee prosa. La pregunta no es «¿hay conflicto?» sino «¿el lado que se DESCARTA
 * tiene algo que la base no tenía?», y git ya lo sabe: las etapas 1 (base), 2 (nuestro) y 3 (suyo) del
 * índice lo responden sin heurística. Una medición fallida NUNCA es un hallazgo: si git no responde, el
 * resultado es `unmeasured` y quien llama deja pasar.
 */

import { execFileSync } from 'node:child_process';

/** The index stage of each side. @es La etapa de índice de cada lado. */
const STAGE = Object.freeze({ BASE: '1', OURS: '2', THEIRS: '3' });

/** Runs git in `directory` and returns stdout, or `undefined` when it could not be asked. @es Ejecuta git; `undefined` si no se pudo. */
function runGit(directory, args) {
  try {
    return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 });
  } catch {
    return undefined;
  }
}

/**
 * The blob of each stage of every conflicted path under `paths`, as
 * `Map<path, { '1': sha, '2': sha, '3': sha }>`, or `undefined` when git could not be asked.
 * `ls-files -u` lists ONLY unmerged entries, so a path with no conflict simply does not appear.
 * @es El blob de cada etapa de cada ruta en conflicto, o `undefined` si no se pudo preguntar a git.
 */
export function unmergedStages(directory, paths, run = runGit) {
  const output = run(directory, ['ls-files', '--unmerged', '--', ...paths]);

  if (output === undefined) return undefined;

  const stages = new Map();

  for (const line of output.split('\n')) {
    if (line.length === 0) continue;

    const tab = line.indexOf('\t');

    if (tab === -1) continue;

    const fields = line.slice(0, tab).split(' ');
    const stage = fields.at(-1);
    const blob = fields[1];
    const file = line.slice(tab + 1);

    if (!stages.has(file)) stages.set(file, {});

    stages.get(file)[stage] = blob;
  }

  return stages;
}

/**
 * The paths this side-taking would resolve by DISCARDING content the base did not have, as
 * `[{ path, reason, dropped }]`. An empty list means one of two things, and they are deliberately not
 * distinguished: nothing would be lost, or nothing could be measured — git unreachable, a directory the
 * line's own `cd` made unknowable, a path in no conflict. Both must ALLOW, so a flag telling them apart
 * would be a branch nothing could act on, and a branch that cannot change an outcome is the defect this
 * fleet keeps finding in its own guards.
 * @es Las rutas que este «quedarse con un lado» resolvería DESCARTANDO contenido que la base no tenía.
 * Una lista vacía significa dos cosas que a propósito no se distinguen —no se pierde nada, o no se pudo
 * medir—, porque ambas DEJAN PASAR y una bandera que nadie puede usar es una rama que no decide nada.
 */
export function lossyResolutions({ directory, side, paths }, run = runGit) {
  const stages = unmergedStages(directory, paths, run);

  if (stages === undefined) return [];

  const dropped = side === 'ours' ? STAGE.THEIRS : STAGE.OURS;
  const lossy = [];

  for (const [file, blobs] of stages) {
    if (blobs[dropped] === undefined) continue;
    if (blobs[STAGE.BASE] === undefined) {
      lossy.push({ path: file, reason: 'both sides created this file independently, so every byte of the dropped one is unique', dropped });
      continue;
    }

    if (blobs[dropped] !== blobs[STAGE.BASE]) lossy.push({ path: file, reason: 'the dropped side changed this file relative to the merge base', dropped });
  }

  return lossy;
}
