/**
 * Whether a project has its OWN agent contract, which is what obliges it to declare contract parity.
 *
 * A project has one when `.claude/AGENT-LEDGER.md` exists, or when `.claude/CLAUDE.md` imports a file that
 * exists. An import is a line that opens with `@` and whose first word is a path: it holds a `/` or a `.`
 * (`@AGENT-CONTRACT.md`, `@~/.claude/x.md`). That is what separates it from the Spanish marker `@es`, which
 * opens many lines of the house bilingual style and names no file. The imported file must exist, so a line of
 * prose that happens to open with `@` does not make a project of a folder.
 *
 * @es Si un proyecto tiene su PROPIO contrato de agentes, lo que lo obliga a declarar la paridad. Lo tiene si
 * existe `.claude/AGENT-LEDGER.md` o si `.claude/CLAUDE.md` importa un fichero que existe. Una importación es
 * una línea que abre con `@` y cuya primera palabra es una ruta: lleva `/` o `.`. Eso la separa del marcador
 * español `@es`, que abre muchas líneas del estilo bilingüe y no nombra ningún fichero. El fichero importado
 * debe existir, para que una línea de prosa que abre con `@` no convierta una carpeta en proyecto.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const CLAUDE_DIRECTORY = '.claude';
const LEDGER_FILE = 'AGENT-LEDGER.md';
const INSTRUCTIONS_FILE = 'CLAUDE.md';
const HOME_PREFIX = '~/';

const isFile = (target) => {
  try {
    return statSync(target).isFile();
  } catch {
    return false;
  }
};

/** The first word after the `@` of an import line, or `undefined` when the line is no import. @es La primera palabra tras el `@` de una línea de importación, o `undefined`. */
function importedPath(line) {
  const trimmed = line.trim();

  if (!trimmed.startsWith('@')) return undefined;

  const word = trimmed.slice(1).split(' ')[0].split('\t')[0];

  return word.includes('/') || word.includes('.') ? word : undefined;
}

/**
 * @param {string} root the project root / la raíz del proyecto
 * @returns {boolean}
 */
export function ownsContract(root) {
  const claudeDirectory = path.join(root, CLAUDE_DIRECTORY);

  if (existsSync(path.join(claudeDirectory, LEDGER_FILE))) return true;

  const instructions = path.join(claudeDirectory, INSTRUCTIONS_FILE);

  if (!isFile(instructions)) return false;

  return readFileSync(instructions, 'utf8')
    .split('\n')
    .map(importedPath)
    .filter((imported) => imported !== undefined)
    .some((imported) => isFile(imported.startsWith(HOME_PREFIX) ? path.join(homedir(), imported.slice(HOME_PREFIX.length)) : path.resolve(claudeDirectory, imported)));
}
