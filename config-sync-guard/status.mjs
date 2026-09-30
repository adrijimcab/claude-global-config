/**
 * Parses `git status --porcelain=v1 --branch` output into `{ aheadCount, dirtyPaths }`. Pure string
 * scanning, no regex (M5).
 *
 * WHY `--porcelain=v1 --branch`: `--porcelain=v1` is git's own stable, script-friendly format (never
 * the locale-dependent human format); `--branch` adds the ONE header line
 * (`## branch...origin/branch [ahead N]`) that names how far ahead of the remote HEAD sits — the same
 * information `git rev-list --count @{u}..HEAD` gives, in the same call that already lists dirty paths,
 * so this needs one git invocation per repo, not two.
 *
 * THE STATED LIMIT on rename lines (`R  old -> new`): this module takes everything after the two status
 * letters as "the path", which for a rename is `old -> new`, not a real path. That string will never
 * match a real file's absolute path, so a renamed path reads as UNATTRIBUTED to any live agent — the
 * SAFE direction for a delivery gate (a rename blocks for review rather than silently passing).
 *
 * @es Parsea la salida de `git status --porcelain=v1 --branch` a `{ aheadCount, dirtyPaths }`. Solo
 * escaneo de strings, sin regex (M5). LÍMITE DECLARADO sobre líneas de renombrado: se toma todo tras
 * las dos letras de estado como "la ruta", que para un renombrado es `viejo -> nuevo`, no una ruta real
 * — nunca casará con la ruta absoluta de un fichero real, así que se lee como NO atribuida, la
 * dirección SEGURA para una puerta de entrega.
 */

const BRANCH_HEADER_PREFIX = '## ';
const AHEAD_MARKER = '[ahead ';
const DIGITS = '0123456789';
const STATUS_CODE_LENGTH = 2; // "XY" — two status-letter columns before a space and the path

/** The ahead count in one `## ` branch-header line, or `0` when absent (no upstream, or not ahead). @es El conteo de adelanto en una línea de cabecera `## `, o `0` si no aparece. */
function aheadCountIn(branchLine) {
  const markerAt = branchLine.indexOf(AHEAD_MARKER);

  if (markerAt === -1) return 0;

  let end = markerAt + AHEAD_MARKER.length;

  while (end < branchLine.length && DIGITS.includes(branchLine[end])) end += 1;

  const digits = branchLine.slice(markerAt + AHEAD_MARKER.length, end);

  return digits.length > 0 ? Number(digits) : 0;
}

/**
 * Parses `text` (the raw stdout of `git status --porcelain=v1 --branch`) into `{ aheadCount,
 * dirtyPaths }`. `dirtyPaths` covers BOTH tracked and untracked changes — `git status --porcelain`
 * reports both, with no distinction this module needs to make (the owner directive asks about
 * "uncommitted tracked/untracked changes" as one population).
 * @es Parsea `text` a `{ aheadCount, dirtyPaths }`. `dirtyPaths` cubre AMBOS, tracked y untracked.
 */
export function parseStatusPorcelain(text) {
  if (typeof text !== 'string') return { aheadCount: 0, dirtyPaths: [] };

  let aheadCount = 0;
  const dirtyPaths = [];

  for (const line of text.split('\n')) {
    if (line.length === 0) continue;

    if (line.startsWith(BRANCH_HEADER_PREFIX)) {
      aheadCount = aheadCountIn(line);
      continue;
    }

    dirtyPaths.push(line.slice(STATUS_CODE_LENGTH + 1));
  }

  return { aheadCount, dirtyPaths };
}
