/**
 * Invariant: the persona region holds gentle-ai's persona text and NOTHING else.
 *
 * This is the general form of the owner-sections check: it also catches owner text that nobody has
 * declared yet (a new rule written just below the marker), because the only text allowed in the
 * region is the installed version's own asset. When that asset cannot be found the result is
 * UNVERIFIABLE, never held. There is no `apply`: the extra text must be moved by a human.
 */
import path from 'node:path';
import { OWNER_TEXT_REMEDY, parseManagedRegions } from '../managed-regions.mjs';
import { normalizeBlock, resolvePersonaReference } from '../persona-reference.mjs';
import { lineContent, readTextOrNull, splitLines } from '../text-file.mjs';

const MAX_QUOTE = 90;

/**
 * The region's lines as `{ line, text }` (1-based file line, LF content), without the lines the customization
 * declares as `ownedLines`: another invariant (anchored-line-insertion) guards those. @es Las líneas de la región
 * como `{ line, text }` (línea 1-based del fichero, contenido LF), sin las líneas que la personalización declara
 * en `ownedLines`: las vigila otra invariante (anchored-line-insertion).
 */
function regionEntries(lines, region, ownedLines = []) {
  return lines
    .slice(region.open + 1, region.close)
    .map((raw, offset) => ({ line: region.open + 2 + offset, text: lineContent(raw) }))
    .filter((entry) => !ownedLines.includes(entry.text));
}

/** The first line (1-based, in the file) where the region's content departs from the reference. */
function firstDivergence(entries, region, reference) {
  const expected = reference.split('\n');
  const actual = entries.map((entry) => entry.text);
  const leading = actual.findIndex((line) => line.trim() !== '');
  const start = leading < 0 ? actual.length : leading;
  const at = actual.slice(start).findIndex((line, offset) => line !== expected[offset]);
  const index = start + (at < 0 ? expected.length : at);
  return { line: entries[index]?.line ?? region.close + 1, text: (actual[index] ?? '').slice(0, MAX_QUOTE) };
}

export const personaRegionMatchesUpstream = {
  remedy: OWNER_TEXT_REMEDY,

  evaluate(customization, context) {
    const text = readTextOrNull(path.join(context.home, customization.file));
    if (text === null) return { status: 'broken', detail: 'file does not exist' };
    const reference = resolvePersonaReference(context);
    if (reference.unavailable) return { status: 'unverifiable', detail: reference.unavailable };
    const { regions, problems } = parseManagedRegions(text);
    if (problems.length > 0) return { status: 'broken', detail: `managed markers are malformed: ${problems.join('; ')}` };
    const region = regions.find((candidate) => candidate.id === customization.region);
    if (region === undefined) return { status: 'broken', detail: `no <!-- gentle-ai:${customization.region} --> region` };
    const lines = splitLines(text);
    const entries = regionEntries(lines, region, customization.ownedLines);
    const content = normalizeBlock(entries.map((entry) => entry.text).join('\n'));
    if (content === reference.text) return { status: 'held', detail: `region matches ${path.basename(reference.source)} exactly` };
    const divergence = firstDivergence(entries, region, reference.text);
    return { status: 'broken', detail: `region holds text that is not gentle-ai's; first divergence at line ${divergence.line}: "${divergence.text}" — sync will erase it` };
  },
};
