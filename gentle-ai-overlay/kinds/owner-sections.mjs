/**
 * Invariant: every owner section of a gentle-ai-managed markdown file sits OUTSIDE every managed
 * region, exactly once, and the region markers themselves are well formed.
 *
 * "Outside" is the property sync respects — it keeps all text before and after each region
 * (filemerge/section.go) — so a section below the last region is as safe as one above the first.
 * Positions are derived from the markers in the file on every run; no line number is stored.
 *
 * An anchor is the literal start of the section's first line (a heading, or a promoted-rule key).
 * It matches only at the start of a line, so a mention of the section inside other prose is not it.
 * There is no `apply`: moving prose back out of a region needs a human to decide where it goes.
 */
import path from 'node:path';
import { OWNER_TEXT_REMEDY, parseManagedRegions, regionEnclosing } from '../managed-regions.mjs';
import { readTextOrNull, splitLines } from '../text-file.mjs';

function anchorFinding(anchor, lines, regions) {
  const at = lines.flatMap((line, index) => (line.startsWith(anchor) ? [index] : []));
  if (at.length === 0) return `missing: "${anchor}"`;
  if (at.length > 1) return `appears ${at.length} times (lines ${at.map((index) => index + 1).join(', ')}): "${anchor}"`;
  const region = regionEnclosing(regions, at[0]);
  if (region === undefined) return null;
  return `line ${at[0] + 1} is INSIDE <!-- gentle-ai:${region.id} --> (lines ${region.open + 1}-${region.close + 1}); sync will erase it: "${anchor}"`;
}

export const ownerSectionsOutsideManagedRegions = {
  remedy: OWNER_TEXT_REMEDY,

  evaluate(customization, context) {
    const text = readTextOrNull(path.join(context.home, customization.file));
    if (text === null) return { status: 'broken', detail: 'file does not exist' };
    const { regions, problems } = parseManagedRegions(text);
    if (problems.length > 0) return { status: 'broken', detail: `managed markers are malformed: ${problems.join('; ')}` };
    const lines = splitLines(text);
    const findings = customization.anchors.map((anchor) => anchorFinding(anchor, lines, regions)).filter((finding) => finding !== null);
    return findings.length === 0
      ? { status: 'held', detail: `${customization.anchors.length} owner sections, all outside the ${regions.length} managed regions` }
      : { status: 'broken', detail: findings.join(' | ') };
  },
};
