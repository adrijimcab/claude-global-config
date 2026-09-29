#!/usr/bin/env node
/**
 * Proves the selftest can go RED: each mutant breaks one decision in a temporary copy of this
 * directory, and the selftest must fail against it. A kill only counts as evidence when the unmutated
 * selftest is green first (exit 2 otherwise), the target text occurs exactly once, and the mutated
 * file still parses — otherwise the "kill" would be the baseline, a typo, or a syntax error.
 *
 *   node mutants.mjs      exit 0 only when every mutant is killed
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// [file, exact text, replacement] — each one flips a single decision the overlay makes.
const MUTANTS = [
  ['kinds/agent-tool.mjs', "parsed.tokens.includes(customization.tool)\n      ? { status: 'held'", "text.includes(customization.tool)\n      ? { status: 'held'"],
  ['kinds/agent-tool.mjs', "if (error) return { status: 'broken', detail: error };\n    return parsed.tokens.includes(customization.tool)\n      ? { status: 'broken'", "if (error) return { status: 'held', detail: error };\n    return parsed.tokens.includes(customization.tool)\n      ? { status: 'broken'"],
  ['kinds/agent-tool.mjs', "const isCanonical = parsed.form === 'plain' &&", 'const isCanonical = true ||'],
  ['managed-regions.mjs', 'region.open < index && index < region.close', 'false'],
  ['managed-regions.mjs', "return { type: 'stray' };", "return { type: 'text' };"],
  ['managed-regions.mjs', 'else if (top.id !== marker.id)', 'else if (false)'],
  ['kinds/persona-region.mjs', 'if (content === reference.text)', 'if (true)'],
  ['persona-reference.mjs', 'if (text !== null) return { text: normalizeBlock(text), source };', "if (text !== null) return { text: normalizeBlock(text), source };\n    return { text: '', source };"],
  ['kinds/owner-sections.mjs', 'if (at.length > 1)', 'if (false)'],
  ['kinds/owner-sections.mjs', 'line.startsWith(anchor)', 'line.includes(anchor)'],
  ['agent-frontmatter.mjs', "token.startsWith('mcp__')", "token.startsWith('zzz')"],
  ['agent-frontmatter.mjs', 'at > 0 && at < end && line.startsWith(KEY)', 'at > 0 && line.startsWith(KEY)'],
  ['text-file.mjs', 'export const withEndingOf = (original, content) =>', 'export const withEndingOf = (original, content) => content;\nconst unused = (original, content) =>'],
  ['report.mjs', "if (results.some((result) => result.status === 'unverifiable')) return 2;", ''],
  ['session-start-hook.mjs', 'process.exitCode = 0;', 'process.exitCode = 1;'],
  ['session-start-hook.mjs', 'emit(`[gentle-ai overlay] the drift check itself failed', 'void (`[gentle-ai overlay] the drift check itself failed'],
  ['gentle-ai-cli.mjs', 'MASKING_VARIABLES.forEach((name) => delete environment[name]);', ''],
  ['gentle-ai-cli.mjs', 'if (result.status !== 0) return', 'if (false) return'],
  ['kinds/telemetry.mjs', "status.enabled === false && status.source === 'state'", 'status.enabled === false'],
  ['kinds/telemetry.mjs', 'if (status.schema !== STATUS_SCHEMA)', 'if (false)'],
  ['kinds/telemetry.mjs', "if (unverifiable) return { status: 'unverifiable', detail: unverifiable };", "if (unverifiable) return { status: 'held', detail: unverifiable };"],
  ['kinds/telemetry.mjs', "['telemetry', 'disable', '--json']", "['telemetry', 'enable', '--json']"],
];

const selftestIn = (directory) => spawnSync(process.execPath, [path.join(directory, 'selftest.mjs')], { encoding: 'utf8' });
// The selftest's last line is its "N/M passed" tally.
const tally = (run) => run.stdout.trim().split('\n').at(-1) ?? 'no tally';

function measure([file, from, to]) {
  const copy = mkdtempSync(path.join(tmpdir(), 'gentle-ai-overlay-mutant-'));
  try {
    cpSync(HERE, copy, { recursive: true });
    const target = path.join(copy, file);
    const source = readFileSync(target, 'utf8');
    const occurrences = source.split(from).length - 1;
    if (occurrences !== 1) return { verdict: 'INVALID', note: `${occurrences} occurrences of the target` };
    writeFileSync(target, source.replace(from, to));
    if (spawnSync(process.execPath, ['--check', target]).status !== 0) return { verdict: 'INVALID', note: 'mutation does not parse' };
    const run = selftestIn(copy);
    return { verdict: run.status === 0 ? 'SURVIVED' : 'KILLED', note: tally(run) };
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

const baseline = selftestIn(HERE);
if (baseline.status !== 0) {
  console.log(`baseline selftest is RED (${tally(baseline)}): refusing to measure mutants`);
  process.exit(2);
}
console.log(`baseline: ${tally(baseline)}`);
const verdicts = MUTANTS.map((mutant) => {
  const result = measure(mutant);
  console.log(`${result.verdict.padEnd(8)} ${mutant[0]}: ${mutant[1].split('\n')[0].slice(0, 60)} -> ${result.note}`);
  return result.verdict;
});
const killed = verdicts.filter((verdict) => verdict === 'KILLED').length;
console.log(`\n${killed}/${MUTANTS.length} killed`);
process.exitCode = killed === MUTANTS.length ? 0 : 1;
