/**
 * Which file PATHS belong to an AI tool, matched by path SEGMENT, never as a bare word in the text: a
 * directory segment (`.cursor/`), a file name (`AGENTS.md`), a segment prefix (`.aider*`, `AGENT-LEDGER*`),
 * a segment suffix (`*.cursorrules`) or a fragment of the whole path (`*subagent*`). Matching is
 * case-insensitive and a plain scan, no regular expression. The terms are the ones `b100-am-ui` enforced in
 * its own `.husky/lib/tooling-artifact-paths.sh`, each measured against the real company trees.
 *
 * @es Qué RUTAS de fichero pertenecen a una herramienta de IA, comparadas por SEGMENTO de ruta, nunca como
 * palabra suelta en el texto: un directorio (`.cursor/`), un nombre de fichero (`AGENTS.md`), un prefijo de
 * segmento (`.aider*`, `AGENT-LEDGER*`), un sufijo (`*.cursorrules`) o un fragmento de la ruta entera
 * (`*subagent*`). Sin distinguir mayúsculas y con escaneo simple, sin expresión regular. Los términos son los
 * que `b100-am-ui` aplicaba en su `.husky/lib/tooling-artifact-paths.sh`, medidos contra los árboles reales.
 */

/** Directory names: a hit when the segment is not the last one. @es Nombres de directorio: acierto si el segmento no es el último. */
export const DIRECTORY_SEGMENTS = ['.agents', '.cursor', '.gemini', '.codex', '.opencode', '.kimi', '.windsurf', '.atl', '.mimocode', '.playwright-mcp', 'agent-lifecycle'];

/** File names: a hit when the LAST segment equals one. @es Nombres de fichero: acierto si el último segmento es uno. */
export const FILE_NAMES = ['agents.md', 'gemini.md'];

/** Segment prefixes (`.aider*`, `AGENT-LEDGER*`). @es Prefijos de segmento. */
export const SEGMENT_PREFIXES = ['.aider', 'agent-ledger'];

/** Segment suffixes (`*.cursorrules`). @es Sufijos de segmento. */
export const SEGMENT_SUFFIXES = ['.cursorrules'];

/** Fragments that mark a path anywhere in it (`*subagent*`). @es Fragmentos que marcan una ruta en cualquier punto. */
export const PATH_FRAGMENTS = ['agent-worktree', 'subagent', 'agent-contract'];

/**
 * @returns The listed terms `path` matches, each as the glob that names it (`.cursor/`, `AGENTS.md`,
 *   `.aider*`, `*.cursorrules`, `*subagent*`); `[]` for a path that belongs to no tool.
 * @es Los términos de la lista que `path` cumple, cada uno como el glob que lo nombra; `[]` si la ruta no es de ninguna herramienta.
 */
export function toolPathTerms(path) {
  const segments = path.toLowerCase().replaceAll('\\', '/').split('/');
  const last = segments.length - 1;
  const lowered = segments.join('/');
  const terms = [];

  for (const directory of DIRECTORY_SEGMENTS) if (segments.slice(0, last).includes(directory)) terms.push(`${directory}/`);
  for (const file of FILE_NAMES) if (segments[last] === file) terms.push(file);
  for (const prefix of SEGMENT_PREFIXES) if (segments.some((segment) => segment.startsWith(prefix))) terms.push(`${prefix}*`);
  for (const suffix of SEGMENT_SUFFIXES) if (segments.some((segment) => segment.endsWith(suffix))) terms.push(`*${suffix}`);
  for (const fragment of PATH_FRAGMENTS) if (lowered.includes(fragment)) terms.push(`*${fragment}*`);

  return terms;
}
