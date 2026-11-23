/**
 * Whether a delegated agent's shell call WRITES THE TEXT of a source file: `sed -i`, a redirection (`>`, `>>`,
 * `cat <<EOF > x.ts`), `tee`, or PowerShell's `Set-Content`, `Add-Content` and `Out-File` — every writer the shared
 * lexer knows. `perl -i`, `sd` and `awk -i inplace` are not known to it yet: that lexer is vendored from b100-am-ui and
 * hash-pinned, so they are added at its source (requested, master-green-carry T79c), never patched here. The promoted rule shell-one-liner-corrupted-data says source files are written only with
 * the Write and Edit tools; it recurred 7 times with no mechanism (2026-11-22: an escape-free `sed -i` on a spec;
 * 2026-11-23: `cat >>` appending source to network-vis-click.ts). This is that mechanism.
 *
 * WHERE THE WRITES COME FROM: the shared write-targets lexer (`write-targets/tool-call-writes.mjs`), the one the
 * full-chain write guard and the other boundaries already use, never a detector of its own. A byte COPY or MOVE (`cp`,
 * `mv`, `Copy-Item`, `Move-Item`, cmd `copy`/`move`) passes: it carries no text through the shell, so nothing can be
 * mangled on the way. A source file is one whose extension is code or markup a build reads (CODE_EXTENSIONS).
 *
 *   shellSourceWrite(payload) -> { via, target } | undefined
 *
 * @es Si una llamada de shell de un agente delegado ESCRIBE EL TEXTO de un fuente: un editor en el sitio, una
 * redirección, `tee` o los cmdlets de contenido de PowerShell. La regla promovida dice que los fuentes se escriben solo
 * con Write y Edit; se repitió 7 veces sin mecanismo. Este es ese mecanismo. Las escrituras salen del lexer compartido
 * de write-targets, el mismo que usan el write guard y las demás fronteras, nunca de un detector propio. Una COPIA o un
 * MOVIMIENTO de bytes pasa: no lleva texto por el shell, así que nada puede corromperse en el camino.
 */

import { toolCallWrites } from '../write-targets/tool-call-writes.mjs';

/** The extensions of source files. @es Las extensiones de los ficheros fuente. */
export const CODE_EXTENSIONS = new Set(['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'html', 'scss', 'css', 'json', 'vue', 'svelte', 'go', 'py', 'ps1', 'sh']);

/** The writer labels that copy or move bytes rather than write text. @es Las etiquetas de escritores que copian o mueven bytes. */
const BYTE_COPIES = new Set(['cp', 'mv', 'PowerShell Copy-Item', 'PowerShell Move-Item', 'cmd copy', 'cmd move']);

/** Whether a path names a source file. @es Si una ruta nombra un fichero fuente. */
export function isSourceFile(word) {
  // The extension is the trailing run of letters and digits after the last dot; a dotfile such as `.gitignore` has
  // none of the code extensions, so it needs no special case.
  // @es La extensión es la racha final de letras y dígitos tras el último punto; un dotfile no necesita caso aparte.
  const extension = /\.([A-Za-z0-9]+)$/.exec(word)?.[1];

  return extension !== undefined && CODE_EXTENSIONS.has(extension.toLowerCase());
}

/**
 * @param {object} payload a PreToolUse payload of the Bash or PowerShell tool
 * @returns {{ via: string, target: string } | undefined}
 */
export function shellSourceWrite(payload) {
  const write = toolCallWrites(payload).find((one) => one.channel === 'shell' && !BYTE_COPIES.has(one.via) && isSourceFile(one.path));

  return write === undefined ? undefined : { via: write.via, target: write.path };
}
