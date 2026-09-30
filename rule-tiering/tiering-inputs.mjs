/**
 * Where the tiering check gets what it judges: the "before" of a rule file from git at a named revision (never
 * from a working copy another session may be editing), the proposed "after" and every `.md` evidence file from
 * disk, and the anchors for that file from `gentle-ai-overlay/customizations.mjs`, imported and filtered the
 * way that module defines them (an entry's `file` is relative to the home, so `.claude/` + the repository
 * path). Anything that cannot be read raises `NotMeasured`: no verdict is given on an input that is not there.
 *
 * @es De dónde saca la comprobación de escalonado lo que juzga: el "antes" de un fichero de reglas desde git en
 * una revisión nombrada (nunca desde una copia de trabajo que otra sesión puede estar editando), el "después"
 * propuesto y cada fichero de evidencia `.md` desde disco, y las anclas de ese fichero desde
 * `gentle-ai-overlay/customizations.mjs`, importado y filtrado como ese módulo las define (el `file` de una
 * entrada es relativo al home, así que `.claude/` + la ruta del repositorio). Lo que no se puede leer lanza
 * `NotMeasured`: no hay veredicto sobre una entrada que no está.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HOME_PREFIX = '.claude/';
const EVIDENCE_EXTENSION = '.md';

/** An input could not be read, so nothing was measured. @es No se pudo leer una entrada: no se midió nada. */
export class NotMeasured extends Error {}

const refuse = (english, spanish) => new NotMeasured(`${english} @es ${spanish}`);

/** The text of `file` in `repo` at `rev`. @es El texto de `file` en `repo` en la revisión `rev`. */
export function beforeAt({ repo, rev, file }) {
  const result = spawnSync('git', ['-C', repo, 'show', `${rev}:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  if (result.error !== undefined || result.status !== 0) {
    const reason = (result.error?.message ?? result.stderr ?? '').trim();

    throw refuse(`git cannot show ${rev}:${file} in ${repo}: ${reason}`, `git no puede mostrar ${rev}:${file} en ${repo}: ${reason}`);
  }

  return result.stdout;
}

/** The text of the file at `file`. @es El texto del fichero en `file`. */
export function textOf(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    throw refuse(`cannot read ${file}: ${error.message}`, `no se puede leer ${file}: ${error.message}`);
  }
}

/** Every `.md` file directly in `directory`, `[{ name, text }]`, by name. @es Cada fichero `.md` directamente en `directory`, por nombre. */
export function evidenceIn(directory) {
  let names;

  try {
    names = readdirSync(directory).filter((name) => name.endsWith(EVIDENCE_EXTENSION)).sort();
  } catch (error) {
    throw refuse(`cannot list the evidence directory ${directory}: ${error.message}`, `no se puede listar el directorio de evidencia ${directory}: ${error.message}`);
  }

  if (names.length === 0) throw refuse(`the evidence directory ${directory} holds no ${EVIDENCE_EXTENSION} file`, `el directorio de evidencia ${directory} no tiene ningún fichero ${EVIDENCE_EXTENSION}`);

  return names.map((name) => ({ name, text: textOf(path.join(directory, name)) }));
}

/** The anchors `customizations.mjs` in `repo` declares for `file`. @es Las anclas que `customizations.mjs` de `repo` declara para `file`. */
export async function anchorsFor({ repo, file }) {
  const module = path.join(repo, 'gentle-ai-overlay', 'customizations.mjs');
  let customizations;

  try {
    ({ CUSTOMIZATIONS: customizations } = await import(pathToFileURL(module).href));
  } catch (error) {
    throw refuse(`cannot import ${module}: ${error.message}`, `no se puede importar ${module}: ${error.message}`);
  }

  return customizations.filter((entry) => entry.file === `${HOME_PREFIX}${file}`).flatMap((entry) => entry.anchors ?? []);
}
