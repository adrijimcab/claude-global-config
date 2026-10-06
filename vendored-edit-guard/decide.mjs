/**
 * THE DECISION for `vendored-copy-edited-in-place`: does this tool call WRITE a module that `VENDORED`
 * (`../vendored/vendored.mjs`, the single list) declares vendored under the install?
 *
 * MEASURED INCIDENT. `shell-command/shell-command.mjs` is owned by b100-am-ui and copied into `~/.claude/` by
 * `node ~/.claude/vendored/vendored.mjs sync`, byte-identical. It was edited IN PLACE in `~/.claude/`: the
 * provenance check went red (EDITED IN THE KIT) and stayed red for a day and a half, because nothing stopped the
 * edit and the copy itself says nothing about where its owner is. ROOT CAUSE: an installed copy is
 * indistinguishable from a file one may edit. The fix is a refusal at the write that names the owner path and the
 * re-sync command (`guard.mjs`).
 *
 * WHICH WRITES. The same two channels the fleet's own boundary guards read, through ONE owner of "which files
 * does a tool call write" (`../write-targets/`, vendored from b100-am-ui; see there for what is and is not lexed):
 * an `Edit`/`Write`/`MultiEdit`/`NotebookEdit` call, and a `Bash`/`PowerShell` line (a redirection, `sed -i`, `tee`,
 * `cp`/`mv`, `Copy-Item`/`Move-Item`, `Set-Content`/`Out-File`/`Add-Content`). A write made by a CHILD process is
 * not seen, which is exactly why `node ~/.claude/vendored/vendored.mjs sync` — the sanctioned writer of these
 * copies — needs no exemption. A target nobody can resolve (a shell variable) is ALLOWED: the lexer's stated
 * tradeoff, since the case that matters is a hand-typed path.
 *
 * WHICH ROOTS. `~/.claude` and the folder this guard is installed in (where `sync` writes: the two are one folder
 * on a real install, and differ when `~/.claude` is a link). The owner's copy and any other folder are never
 * refused: editing the owner copy is the remedy. The comparison is on the resolved path, case-insensitive only on
 * Windows. Main session and subagent are refused alike: the incident is not about who edits.
 *
 * @es LA DECISIÓN de `vendored-copy-edited-in-place`: ¿escribe esta llamada de herramienta un módulo que
 * `VENDORED` (la lista única) declara vendorizado bajo la instalación? INCIDENTE MEDIDO: `shell-command.mjs`, de
 * b100-am-ui, se editó EN SITIO en `~/.claude/` y la comprobación de procedencia estuvo roja día y medio: una
 * copia instalada no se distingue de un fichero editable. La guardia rechaza en la escritura y nombra la ruta
 * dueña y la orden de resincronización. QUÉ ESCRITURAS: las de `Edit`/`Write`/`MultiEdit`/`NotebookEdit` y las de
 * una línea de shell, leídas por el dueño único de «qué ficheros escribe una llamada» (`../write-targets/`). Lo que
 * escribe un proceso HIJO no se ve, y por eso `vendored.mjs sync` no necesita excepción. Un destino no resoluble
 * (una variable) se PERMITE. RAÍCES: `~/.claude` y la carpeta donde está instalada esta guardia; la copia dueña y
 * cualquier otra carpeta nunca se rechazan. Principal y subagente se rechazan por igual.
 */

import os from 'node:os';
import path from 'node:path';

import { TARGET_ROOT, VENDORED } from '../vendored/vendored.mjs';
import { toolCallWrites } from '../write-targets/tool-call-writes.mjs';

/**
 * The folders that hold the installed copies: `~/.claude` and the folder this guard is installed in, each once.
 * @es Las carpetas que guardan las copias instaladas: `~/.claude` y la carpeta donde está instalada esta guardia, cada una una vez.
 */
export function installRoots({ home = os.homedir(), install = TARGET_ROOT } = {}) {
  return [...new Set([path.resolve(home, '.claude'), path.resolve(install)])];
}

/**
 * The vendored modules the call writes, each once, in the order written.
 * @param {unknown} payload the parsed `PreToolUse` payload
 * @param options.roots The folders holding the installed copies.
 * @param options.vendored The relative paths declared vendored.
 * @param options.platform Decides whether letter case matters in a path (it does not on Windows).
 * @returns {{ relative: string, via: string }[]} the declared path and how the call writes it; empty to allow
 * @es Los módulos vendorizados que escribe la llamada, cada uno una vez y en orden; vacío para permitir.
 */
export function vendoredWrites(payload, { roots = installRoots(), vendored = VENDORED, platform = process.platform } = {}) {
  const caseKey = platform === 'win32' ? (relative) => relative.toLowerCase() : (relative) => relative;
  const declared = new Map(vendored.map((relative) => [caseKey(relative), relative]));
  const found = new Map();

  for (const write of toolCallWrites(payload)) {
    if (write.path === undefined) continue;

    for (const root of roots) {
      // A path outside the root reads `../…` (or is absolute on another drive): never a declared path.
      // @es Una ruta fuera de la raíz se lee `../…` (o es absoluta en otra unidad): nunca una ruta declarada.
      const relative = declared.get(caseKey(path.relative(root, write.path).split(path.sep).join('/')));

      if (relative !== undefined && !found.has(relative)) found.set(relative, { relative, via: write.via });
    }
  }

  return [...found.values()];
}
