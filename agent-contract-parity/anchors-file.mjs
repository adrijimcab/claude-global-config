/**
 * The declaration a project makes to opt into contract parity: `.claude/agent-contract/anchors.json`.
 *
 *   { "english": ["<path>", ...], "spanish": ["<path>", ...], "anchors": ["<token>", ...] }
 *
 * `english` and `spanish` are the files of the two contracts, relative to the project root (the directory that
 * holds `.claude/`); a path naming a directory stands for every `.md` file under it, recursively.
 * `anchors` are the language-neutral tokens both contracts must carry (mandate ids, rule keys, command
 * names). Absent file: the project opts out and is not checked. A file that exists but is not a valid
 * declaration is `invalid`, never `absent`: a typo that silently turned the check off is the very defect the
 * check exists to prevent, so an unknown key, an empty list, a duplicate anchor, an absolute path and a path
 * that climbs out of the project are all named, not tolerated.
 *
 * @es La declaración con la que un proyecto entra en la paridad de contratos: `.claude/agent-contract/anchors.json`.
 * `english` y `spanish` son los ficheros de los dos contratos, relativos a la raíz del proyecto (la carpeta que
 * contiene `.claude/`); una ruta que nombra un directorio vale por cada `.md` bajo él, recursivo.
 * `anchors` son los tokens neutros que ambos contratos deben llevar. Sin fichero: el proyecto no participa. Un
 * fichero que existe pero no es una declaración válida es `invalid`, nunca `absent`: una errata que apagara el
 * chequeo en silencio es el defecto que el chequeo existe para evitar.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Where the declaration lives, relative to the project root. @es Dónde vive la declaración, relativa a la raíz del proyecto. */
export const ANCHORS_FILE = '.claude/agent-contract/anchors.json';

const KNOWN_KEYS = ['english', 'spanish', 'anchors'];

const BYTE_ORDER_MARK = 0xfeff;

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

/** Why `value` is not a usable contract path, or `undefined`. @es Por qué `value` no es una ruta de contrato usable, o `undefined`. */
function pathProblem(value) {
  if (!isNonEmptyString(value)) return 'is not a non-empty string / no es una cadena no vacía';
  // win32 rules call both `C:\x` and `/x` absolute, which is every absolute form either platform knows.
  // @es Las reglas win32 llaman absolutas a `C:\x` y a `/x`: toda forma absoluta de ambas plataformas.
  if (path.win32.isAbsolute(value)) return 'is absolute; use a path relative to the project root / es absoluta; usá una ruta relativa a la raíz del proyecto';
  if (value.split('\\').join('/').split('/').includes('..')) return 'climbs out of the project with ".." / sale del proyecto con ".."';

  return undefined;
}

function listProblems(declaration, side) {
  const list = declaration[side];

  if (!Array.isArray(list) || list.length === 0) return [`"${side}" must be a non-empty list of paths / "${side}" debe ser una lista no vacía de rutas`];

  return list.flatMap((entry) => {
    const problem = pathProblem(entry);

    return problem === undefined ? [] : [`"${side}" entry ${JSON.stringify(entry)} ${problem}`];
  });
}

function anchorProblems(declaration) {
  const list = declaration.anchors;

  if (!Array.isArray(list) || list.length === 0) return ['"anchors" must be a non-empty list of tokens / "anchors" debe ser una lista no vacía de tokens'];

  const problems = list.filter((anchor) => !isNonEmptyString(anchor)).map((anchor) => `"anchors" entry ${JSON.stringify(anchor)} is not a non-empty string / no es una cadena no vacía`);
  const seen = new Set();

  for (const anchor of list.filter(isNonEmptyString)) {
    if (seen.has(anchor)) problems.push(`"anchors" entry ${JSON.stringify(anchor)} is duplicated / está duplicado`);

    seen.add(anchor);
  }

  return problems;
}

/**
 * `{ status: 'absent' }` when the project has no declaration; `{ status: 'invalid', problems }` when it has a
 * broken one; `{ status: 'ok', english, spanish, anchors }` otherwise.
 * @es `absent` sin declaración, `invalid` con una rota, `ok` con sus listas si es válida.
 */
export function readAnchors(root) {
  const file = path.join(root, ANCHORS_FILE);

  if (!existsSync(file)) return { status: 'absent' };

  let declaration;

  try {
    const text = readFileSync(file, 'utf8');

    declaration = JSON.parse(text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text);
  } catch (error) {
    return { status: 'invalid', problems: [`cannot be read as JSON: ${error instanceof Error ? error.message : String(error)} / no se puede leer como JSON`] };
  }

  if (declaration === null || typeof declaration !== 'object' || Array.isArray(declaration)) return { status: 'invalid', problems: ['must be a JSON object / debe ser un objeto JSON'] };

  const unknown = Object.keys(declaration).filter((key) => !KNOWN_KEYS.includes(key));
  const problems = [
    ...unknown.map((key) => `unknown key ${JSON.stringify(key)}; allowed: ${KNOWN_KEYS.join(', ')} / clave desconocida`),
    ...listProblems(declaration, 'english'),
    ...listProblems(declaration, 'spanish'),
    ...anchorProblems(declaration)
  ];

  if (problems.length > 0) return { status: 'invalid', problems };

  return { status: 'ok', english: declaration.english, spanish: declaration.spanish, anchors: declaration.anchors };
}
