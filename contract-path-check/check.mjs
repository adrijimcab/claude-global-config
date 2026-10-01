/**
 * Finds the paths a contract document names under `~/.claude/` that the filesystem does not confirm.
 *
 * WHY THIS EXISTS (`contract-doc-names-a-mechanism-nobody-verifies`). The always-injected contract files
 * (`CLAUDE.md`, `rules/*.md`, `sdd-mandate.md`, `verification-contract.md`) describe mechanisms by path, and
 * nothing checked those paths: one of them named a script that did not exist and a hook that never called
 * it, and only running the documented command exposed it. Prose that describes a mechanism decays like prose
 * that describes code, and an always-injected file decays invisibly because it is read as authority. A path
 * claim is a hypothesis until the filesystem confirms it, so this module asks the filesystem, and its
 * selftest runs the question over the real documents on every landing.
 *
 * WHAT COUNTS AS A CLAIM. Any occurrence of `~/.claude/` (or this machine's home spelled out) followed by a
 * run of path characters. A run cut short by a placeholder (`<key>`, `*`, `…`, `{`, `$`, `[`) is a PATTERN,
 * not a path, and is skipped: it names a family, and a family has no single place to look. A claim that the
 * checkout lacks may still resolve in the live home, because the live home is where the documents are read
 * from, so a path is confirmed when it exists in either. Project-relative spellings (`.claude/…` without
 * the `~/`) name a project's own tooling and are outside this scope on purpose.
 *
 * NO REGEX (M5): `startsWith`, `includes`, `indexOf` and `slice` on literals. A regex that fails to match
 * skips a claim silently, which is the very defect being closed.
 *
 * @es Encuentra las rutas que un documento de contrato nombra bajo `~/.claude/` y que el sistema de
 * ficheros no confirma. Los ficheros de contrato siempre inyectados describen mecanismos por ruta y nada
 * comprobaba esas rutas: una nombraba un script inexistente y un hook que nunca lo llamaba. Una ruta
 * afirmada es una hipótesis hasta que el sistema de ficheros la confirma, así que este módulo se lo
 * pregunta, y su selftest corre la pregunta sobre los documentos reales en cada aterrizaje. Una racha
 * cortada por un marcador (`<clave>`, `*`, `…`) es un PATRÓN y se omite. Una ruta se confirma si existe en
 * el checkout o en el home vivo. Las rutas relativas de proyecto quedan fuera de alcance a propósito.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** The contract documents at the repository root. @es Los documentos de contrato de la raíz. */
export const ROOT_CONTRACT_DOCS = ['CLAUDE.md', 'sdd-mandate.md', 'verification-contract.md'];

/** The directory whose every `.md` is a loaded rule. @es El directorio cuyos `.md` son reglas cargadas. */
export const RULES_DIRECTORY = 'rules';

/** Characters a path is made of; anything else ends the claim. @es Caracteres de una ruta; cualquier otro termina la afirmación. */
const PATH_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-/';

/** Characters that turn a run into a pattern, not a path. @es Caracteres que vuelven una racha un patrón, no una ruta. */
const PATTERN_STARTS = '<*…{$[';

/** The two spellings of the claimed root. @es Las dos grafías de la raíz afirmada. */
function claimPrefixes(home) {
  return ['~/.claude/', `${home.split('\\').join('/')}/.claude/`];
}

/**
 * The documents the scan covers: the root contracts plus every `.md` in `rules/`, listed from the tree.
 * @es Los documentos del escaneo: los contratos de la raíz y cada `.md` de `rules/`, listados del árbol.
 */
export function contractDocs(root) {
  const rulesDirectory = path.join(root, RULES_DIRECTORY);
  const rules = existsSync(rulesDirectory)
    ? readdirSync(rulesDirectory).filter((name) => name.endsWith('.md')).sort().map((name) => `${RULES_DIRECTORY}/${name}`)
    : [];

  return [...ROOT_CONTRACT_DOCS, ...rules];
}

/**
 * The relative paths one text claims, in order. A pattern-cut run and a bare prefix claim nothing.
 * @es Las rutas relativas que un texto afirma, en orden. Una racha cortada por patrón y un prefijo suelto no afirman nada.
 */
export function claimsIn(text, home) {
  const claims = [];

  for (const prefix of claimPrefixes(home)) {
    let from = text.indexOf(prefix);

    while (from !== -1) {
      const start = from + prefix.length;
      let end = start;
      while (end < text.length && PATH_CHARACTERS.includes(text.charAt(end))) end += 1;

      const endsInPattern = end < text.length && PATTERN_STARTS.includes(text.charAt(end));
      let claimed = text.slice(start, end);
      while (claimed.endsWith('.')) claimed = claimed.slice(0, -1);

      if (!endsInPattern && claimed.length > 0) claims.push(claimed);
      from = text.indexOf(prefix, end);
    }
  }

  return claims;
}

/** True when `relative` exists in the checkout or in the live home. @es Verdadero si existe en el checkout o en el home vivo. */
function isConfirmed(relative, { root, home }) {
  return existsSync(path.join(root, ...relative.split('/'))) || existsSync(path.join(home, '.claude', ...relative.split('/')));
}

/**
 * Reads every contract document and returns how many claims it inspected and which are unconfirmed. A
 * document that is absent is itself a finding: a contract that is not there confirms nothing.
 * @es Lee cada documento de contrato y devuelve cuántas afirmaciones inspeccionó y cuáles no se confirman.
 * Un documento ausente es en sí un hallazgo: un contrato que no está no confirma nada.
 * @param {{ root: string, home?: string }} options
 * @returns {{ inspected: number, unresolved: { doc: string, claim: string }[] }}
 */
export function inspectContracts({ root, home = homedir() }) {
  const unresolved = [];
  let inspected = 0;

  for (const doc of contractDocs(root)) {
    const file = path.join(root, ...doc.split('/'));

    if (!existsSync(file)) {
      unresolved.push({ doc, claim: '(the document itself is missing)' });
      continue;
    }

    for (const claim of claimsIn(readFileSync(file, 'utf8'), home)) {
      inspected += 1;
      if (!isConfirmed(claim, { root, home })) unresolved.push({ doc, claim: `~/.claude/${claim}` });
    }
  }

  return { inspected, unresolved };
}
