/**
 * Where the tiering check gets what it judges: the "before" of a rule file from git at a named revision (never
 * from a working copy another session may be editing), the proposed "after" and every `.md` evidence file from
 * disk, and the anchors for that file from `gentle-ai-overlay/customizations.mjs`, imported and filtered the
 * way that module defines them (an entry's `file` is relative to the home, so `.claude/` + the repository
 * path). A repository with no such module (a project's `.claude/`, which has no overlay) has no overlay
 * anchors. Anything else that cannot be read raises `NotMeasured`: no verdict is given on an input that is not
 * there, and a module that is there but cannot be imported is not "no anchors".
 *
 * @es De dónde saca la comprobación de escalonado lo que juzga: el "antes" de un fichero de reglas desde git en
 * una revisión nombrada (nunca desde una copia de trabajo que otra sesión puede estar editando), el "después"
 * propuesto y cada fichero de evidencia `.md` desde disco, y las anclas de ese fichero desde
 * `gentle-ai-overlay/customizations.mjs`, importado y filtrado como ese módulo las define (el `file` de una
 * entrada es relativo al home, así que `.claude/` + la ruta del repositorio). Un repositorio sin ese módulo (el
 * `.claude/` de un proyecto, que no tiene overlay) no tiene anclas de overlay. Todo lo demás que no se puede
 * leer lanza `NotMeasured`: no hay veredicto sobre una entrada que no está, y un módulo que está pero no se
 * puede importar no es "sin anclas".
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

/**
 * Every `.md` file directly in `directory`, `[{ name, text, path }]`, by name; `path` is its POSIX path from
 * `repo` when `directory` is inside it, so a line can point to it, and is absent otherwise.
 * @es Cada fichero `.md` directamente en `directory`, por nombre; `path` es su ruta POSIX desde `repo` cuando `directory` está dentro, para que una línea pueda apuntarle, y falta si no.
 */
export function evidenceIn(directory, repo) {
  let names;

  try {
    names = readdirSync(directory).filter((name) => name.endsWith(EVIDENCE_EXTENSION)).sort();
  } catch (error) {
    throw refuse(`cannot list the evidence directory ${directory}: ${error.message}`, `no se puede listar el directorio de evidencia ${directory}: ${error.message}`);
  }

  if (names.length === 0) throw refuse(`the evidence directory ${directory} holds no ${EVIDENCE_EXTENSION} file`, `el directorio de evidencia ${directory} no tiene ningún fichero ${EVIDENCE_EXTENSION}`);

  const inside = path.relative(repo, directory);
  const fromRepo = inside === '' || inside.startsWith('..') || path.isAbsolute(inside) ? undefined : inside.split(path.sep).join('/');

  return names.map((name) => ({ name, text: textOf(path.join(directory, name)), ...(fromRepo === undefined ? {} : { path: `${fromRepo}/${name}` }) }));
}

/** The anchors `customizations.mjs` in `repo` declares for `file`; none when `repo` has no such module. @es Las anclas que `customizations.mjs` de `repo` declara para `file`; ninguna si `repo` no tiene ese módulo. */
export async function anchorsFor({ repo, file }) {
  const module = path.join(repo, 'gentle-ai-overlay', 'customizations.mjs');
  let customizations;

  if (!existsSync(module)) return [];

  try {
    ({ CUSTOMIZATIONS: customizations } = await import(pathToFileURL(module).href));
  } catch (error) {
    throw refuse(`cannot import ${module}: ${error.message}`, `no se puede importar ${module}: ${error.message}`);
  }

  return customizations.filter((entry) => entry.file === `${HOME_PREFIX}${file}`).flatMap((entry) => entry.anchors ?? []);
}
