/**
 * The exact persona text the INSTALLED gentle-ai writes between its persona markers in
 * ~/.claude/CLAUDE.md — the reference that says whether anything else is sitting in that region.
 *
 * It is read from the gentle-ai source in the Go module cache (gentle-ai is installed with
 * `go install`, which populates it), at the version recorded in ~/.gentle-ai/state.json. When any
 * link is missing the answer is `unavailable` with the reason: the region is then UNVERIFIABLE, which
 * is reported as such and never as held.
 */
import path from 'node:path';
import { lineContent, readTextOrNull, splitLines } from './text-file.mjs';

// Mirrors gentle-ai v2.9.1 internal/components/persona/inject.go (gentlemanPersonaContent /
// neutralPersonaContent) for the Claude Code adapter, which has output styles and so gets the
// residual neutral asset. A `custom` persona writes no region, so it has no reference.
const CLAUDE_PERSONA_ASSETS = {
  gentleman: 'claude/persona-gentleman.md',
  neutral: 'claude/persona-neutral-residual.md',
};

// Go escapes upper-case letters in module cache paths, and both spellings exist on this machine.
const MODULE_OWNERS = ['gentleman-programming', '!gentleman-!programming'];

/** Normalise text for comparison: LF line content, no leading or trailing blank lines. */
export const normalizeBlock = (text) => splitLines(text).map(lineContent).join('\n').trim();

function moduleDirectory(modCache, owner, version) {
  const major = Number.parseInt(version, 10);
  const suffix = major >= 2 ? `/v${major}` : '';
  return path.join(modCache, 'github.com', owner, `gentle-ai${suffix}@v${version}`);
}

function readState(home) {
  const raw = readTextOrNull(path.join(home, '.gentle-ai', 'state.json'));
  if (raw === null) return { unavailable: '~/.gentle-ai/state.json does not exist' };
  try {
    return { state: JSON.parse(raw) };
  } catch (error) {
    return { unavailable: `~/.gentle-ai/state.json is not valid JSON (${error.message})` };
  }
}

/**
 * @param {{ home: string, modCache: string }} context
 * @returns {{ text: string, source: string } | { unavailable: string }}
 */
export function resolvePersonaReference({ home, modCache }) {
  const { state, unavailable } = readState(home);
  if (unavailable) return { unavailable };
  const version = state.installed_binary_version;
  const asset = CLAUDE_PERSONA_ASSETS[state.persona];
  if (typeof version !== 'string' || version === '') return { unavailable: 'state.json records no installed_binary_version' };
  if (asset === undefined) return { unavailable: `persona "${state.persona}" has no managed Claude asset` };
  for (const owner of MODULE_OWNERS) {
    const source = path.join(moduleDirectory(modCache, owner, version), 'internal', 'assets', asset);
    const text = readTextOrNull(source);
    if (text !== null) return { text: normalizeBlock(text), source };
  }
  return { unavailable: `gentle-ai v${version} source is not in the Go module cache at ${modCache}` };
}
