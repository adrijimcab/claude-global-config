/**
 * WHICH files are a project's agent contract, as far as a worker can be told.
 *
 * Two sources, in this order. The project's declaration `.claude/agent-contract/anchors.json` (`english`, the
 * contract Claude Code workers read) when it is usable; otherwise the files its `CLAUDE.md` imports with `@`
 * (`.claude/CLAUDE.md`, else `CLAUDE.md`). A project that declares nothing and imports nothing has no contract
 * to point at, and that is a valid answer, not an error. A declaration that is broken falls through to the
 * imports: the pointer's job is to help the worker, and the parity guard is what refuses the broken file.
 *
 * @es QUÉ ficheros son el contrato de agentes de un proyecto, hasta donde se le puede decir a un worker. Dos
 * fuentes, en este orden: la declaración `.claude/agent-contract/anchors.json` (`english`, el contrato que leen
 * los workers de Claude Code) cuando es usable; si no, los ficheros que su `CLAUDE.md` importa con `@`
 * (`.claude/CLAUDE.md`, o `CLAUDE.md`). Un proyecto que no declara ni importa nada no tiene contrato al que
 * apuntar, y es una respuesta válida. Una declaración rota cae a los imports: el guard de paridad es quien la rechaza.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { readAnchors } from '../agent-contract-parity/anchors-file.mjs';
import { importedFiles } from './claude-md-imports.mjs';

/** The CLAUDE.md files of a project, nearest the tooling first. @es Los CLAUDE.md de un proyecto, primero el del tooling. */
export const CLAUDE_MD_CANDIDATES = ['.claude/CLAUDE.md', 'CLAUDE.md'];

/**
 * `{ source: 'anchors' | 'claude-md', files }`: absolute paths of contract files that exist on this machine.
 * @es `source` dice de dónde salió la lista, `files` son rutas absolutas de ficheros de contrato que existen aquí.
 */
export function contractLocations(root) {
  const declaration = readAnchors(root);

  if (declaration.status === 'ok') {
    const declared = declaration.english.map((relative) => path.join(root, relative)).filter((candidate) => existsSync(candidate));

    if (declared.length > 0) return { source: 'anchors', files: declared };
  }

  const imports = CLAUDE_MD_CANDIDATES.map((relative) => path.join(root, relative)).filter((candidate) => existsSync(candidate)).flatMap((claudeMd) => importedFiles(claudeMd));

  return { source: 'claude-md', files: [...new Set(imports)] };
}
