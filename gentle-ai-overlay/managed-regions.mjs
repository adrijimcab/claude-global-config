/**
 * The regions of a markdown file that `gentle-ai sync` owns and rewrites.
 *
 * gentle-ai delimits each one with `<!-- gentle-ai:<id> -->` ... `<!-- /gentle-ai:<id> -->` and, on
 * sync, replaces EVERYTHING between the two with its own asset (filemerge/section.go,
 * InjectMarkdownSection). Text outside every region survives; text inside any region is erased.
 *
 * gentle-ai finds a marker with strings.Index over the whole file, so a marker mentioned inside a line
 * of prose is still a marker to it. This parser therefore treats a marker that is not alone on its
 * line as a structural problem, not as harmless text.
 */
import { lineContent, splitLines } from './text-file.mjs';

/** What a human must do when owner text is found inside a region: no tool can place prose safely. */
export const OWNER_TEXT_REMEDY =
  'Owner text in CLAUDE.md is NOT auto-fixed (prose cannot be placed safely): move it outside every <!-- gentle-ai:* --> region by hand. ' +
  'If a sync already erased it, the pre-sync copy is in the newest ~/.gentle-ai/backups/<id>/snapshot.tar.gz. ' +
  'Do NOT run `gentle-ai sync` until this holds: sync replaces every managed region and erases owner text inside it.';

const OPEN_PREFIX = '<!-- gentle-ai:';
const CLOSE_PREFIX = '<!-- /gentle-ai:';
const SUFFIX = '-->';

const markerId = (trimmed, prefix) => trimmed.slice(prefix.length, -SUFFIX.length).trim();

function classify(line) {
  const trimmed = lineContent(line).trim();
  if (trimmed.startsWith(CLOSE_PREFIX) && trimmed.endsWith(SUFFIX)) return { type: 'close', id: markerId(trimmed, CLOSE_PREFIX) };
  if (trimmed.startsWith(OPEN_PREFIX) && trimmed.endsWith(SUFFIX)) return { type: 'open', id: markerId(trimmed, OPEN_PREFIX) };
  if (trimmed.includes(OPEN_PREFIX) || trimmed.includes(CLOSE_PREFIX)) return { type: 'stray' };
  return { type: 'text' };
}

/**
 * Parse the managed regions of `text`.
 * @returns {{ regions: {id: string, open: number, close: number}[], problems: string[] }}
 *   `open` / `close` are 0-based line indexes of the marker lines; `problems` is empty when the
 *   markers are well formed.
 */
export function parseManagedRegions(text) {
  const regions = [];
  const problems = [];
  const stack = [];
  splitLines(text).forEach((line, index) => {
    const marker = classify(line);
    if (marker.type === 'stray') problems.push(`line ${index + 1} mentions a gentle-ai marker inside prose; sync would read it as a real marker`);
    if (marker.type === 'open') stack.push({ id: marker.id, open: index });
    if (marker.type !== 'close') return;
    const top = stack.pop();
    if (top === undefined) problems.push(`line ${index + 1} closes region "${marker.id}" that was never opened`);
    else if (top.id !== marker.id) problems.push(`line ${index + 1} closes "${marker.id}" while "${top.id}" (line ${top.open + 1}) is still open`);
    else regions.push({ id: top.id, open: top.open, close: index });
  });
  stack.forEach((unclosed) => problems.push(`region "${unclosed.id}" opened at line ${unclosed.open + 1} is never closed`));
  return { regions, problems };
}

/** The first region whose markers enclose line `index`, or undefined. */
export const regionEnclosing = (regions, index) => regions.find((region) => region.open < index && index < region.close);
