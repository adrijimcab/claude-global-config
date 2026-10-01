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
  ['review-contract-section.mjs', 'if (lineContent(line) === needle)', 'if (lineContent(line).includes(needle))'],
  ['review-contract-section.mjs', 'starts.length === 0 && lineStarts(text, CONTRACT_TITLE).length === 0', 'starts.length === 0'],
  ['review-contract-section.mjs', 'if (starts.length !== 1)', 'if (starts.length > 1)'],
  ['review-contract-section.mjs', 'if (ends.length !== 1)', 'if (ends.length > 1)'],
  ['review-contract-section.mjs', 'if (opens.length !== 1 || closes.length !== 1)', 'if (false)'],
  ['review-contract-section.mjs', 'if (!(opens[0] < start && start < end && end < closes[0]))', 'if (!(start < end))'],
  ['review-contract-section.mjs', 'line.startsWith(SENTINEL_PREFIX) && line.endsWith(SENTINEL_SUFFIX)', 'line.startsWith(SENTINEL_PREFIX)'],
  ['review-contract-section.mjs', "(text.includes('\\r\\n') ? '\\r\\n' : '\\n')", "'\\n'"],
  ['review-contract-section.mjs', '    `@es El desarrollo guiado', '    `El desarrollo guiado'],
  ['review-contract-section.mjs', "    if (keepLoaded) return { outcome: 'unchanged', form, text, stash };", ''],
  ['review-contract-section.mjs', 'pointerFor(text, sha256(moved), stashLabel)', "pointerFor(text, 'x', stashLabel)"],
  ['review-contract-section.mjs', 'stash === null || sha256(stash) !== section.sha', 'stash === null'],
  ['review-contract-section.mjs', "  if (!keepLoaded) return { outcome: 'unchanged', form, text, stash };", ''],
  ['review-contract-section.mjs', 'text.slice(0, start) + stash + text.slice(end)', 'text.slice(0, start) + stash.trimEnd() + text.slice(end)'],
  ['review-mode.mjs', "return { reviewsMayRun: report.status.global === 'on' };", "return { reviewsMayRun: report.status.effective === 'on' };"],
  ['review-mode.mjs', 'if (!run.ok) return { unreadable: run.reason };', ''],
  ['review-mode.mjs', 'report?.schema !== MODE_SCHEMA || ', ''],
  ['review-mode.mjs', ' || report.status?.schema !== STATUS_SCHEMA', ''],
  ['kinds/lazy-review-contract.mjs', 'const keepLoaded = mode.unreadable !== undefined || mode.reviewsMayRun;', 'const keepLoaded = mode.reviewsMayRun === true;'],
  ['kinds/lazy-review-contract.mjs', "if (plan.mode.unreadable !== undefined) return { status: 'unverifiable'", "if (false) return { status: 'unverifiable'"],
  ['kinds/lazy-review-contract.mjs', "if (plan.outcome !== 'unchanged') return { status: 'broken', detail: detailFor(plan) };", ''],
  ['kinds/lazy-review-contract.mjs', "if (plan.refused !== undefined) return { status: 'broken', detail: plan.refused };", "if (plan.refused !== undefined) return { status: 'held', detail: plan.refused };"],
  ['kinds/lazy-review-contract.mjs', "if (plan.outcome === 'moved') {", 'if (false) {'],
  ['kinds/lazy-review-contract.mjs', '  syncSafe: true,', '  syncSafe: false,'],
  ['kinds/lazy-review-contract.mjs', "    if (plan.refused !== undefined) return { outcome: 'refused', detail: plan.refused };\n    if (plan.outcome === 'unchanged')", "    if (plan.outcome === 'unchanged')"],
  ['invariants.mjs', 'syncSafe: kind.syncSafe === true,', 'syncSafe: true,'],
  ['apply.mjs', 'dryRun ? planAll(CUSTOMIZATIONS, context) : applyAll(CUSTOMIZATIONS, context)', 'applyAll(CUSTOMIZATIONS, context)'],
  ['lazy-review-triggers.mjs', 'if (typeof command !== \'string\') return null;', ''],
  ['lazy-review-triggers.mjs', '.some((invocation) => !invocation.dryRun)', '.some(() => true)'],
  ['lazy-review-triggers.mjs', "return program === 'gentle-ai' && group === 'review'", "return group === 'review'"],
  ['lazy-review-triggers.mjs', "noun === 'mode' && ", ''],
  ['lazy-review-triggers.mjs', 'MODE_CHANGES.has(verb)', 'verb !== undefined'],
  ['lazy-review-triggers.mjs', 'const dialect = dialectOfTool(toolName);', "const dialect = dialectOfTool('Bash');"],
  ['post-command-hook.mjs', 'if (lazyReviewTrigger(payload?.tool_input?.command, payload?.tool_name) === null) return undefined;', ''],
  ['post-command-hook.mjs', "hookOutput('PostToolUse',", "hookOutput('SessionStart',"],
  ['post-command-hook.mjs', 'process.stdout.write(`${JSON.stringify({ systemMessage: `[gentle-ai overlay] the post-command hook failed', 'void (`${JSON.stringify({ systemMessage: `[gentle-ai overlay] the post-command hook failed'],
  ['lazy-review-hook-output.mjs', "if (result.change !== 'restored') return {};", ''],
  ['lazy-review-hook-output.mjs', ', additionalContext: read };', ' };'],
  ['lazy-review-hook-output.mjs', "if (result.change === 'moved') return", "if (false) return"],
  ['session-start-hook.mjs', 'const replaced = reconcileLazyReview(context);', 'const replaced = {};'],
  ['session-start-hook.mjs', 'emit(message, joined([replaced.additionalContext, advisory]));', 'emit(message, joined([advisory]));'],
];

const selftestIn = (directory) => spawnSync(process.execPath, [path.join(directory, 'selftest.mjs')], { encoding: 'utf8' });
// The selftest's last line is its "N/M passed" tally.
const tally = (run) => run.stdout.trim().split('\n').at(-1) ?? 'no tally';

// The selftest reaches beyond this directory (the sync guard's shell parser, the hook dispatcher, the
// settings entry), so each mutant runs in a copy of that whole tree, and an UNMUTATED copy must be green
// first — otherwise a kill could be a missing sibling. @es El selftest llega más allá de este directorio
// (el analizador de shell del guard de sync, el dispatcher de hooks, la entrada de settings), así que
// cada mutante corre en una copia de todo ese árbol, y una copia SIN mutar debe estar verde primero.
const TREE = ['gentle-ai-overlay', 'gentle-ai-sync-guard', 'hook-dispatch', 'settings.json'];
function copyTree() {
  const root = mkdtempSync(path.join(tmpdir(), 'gentle-ai-overlay-mutant-'));
  TREE.forEach((entry) => cpSync(path.join(HERE, '..', entry), path.join(root, entry), { recursive: true }));
  return root;
}

function measure([file, from, to]) {
  const root = copyTree();
  const copy = path.join(root, 'gentle-ai-overlay');
  try {
    const target = path.join(copy, file);
    const source = readFileSync(target, 'utf8');
    const occurrences = source.split(from).length - 1;
    if (occurrences !== 1) return { verdict: 'INVALID', note: `${occurrences} occurrences of the target` };
    writeFileSync(target, source.replace(from, to));
    if (spawnSync(process.execPath, ['--check', target]).status !== 0) return { verdict: 'INVALID', note: 'mutation does not parse' };
    const run = selftestIn(copy);
    return { verdict: run.status === 0 ? 'SURVIVED' : 'KILLED', note: tally(run) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function unmutatedCopy() {
  const root = copyTree();
  try {
    return selftestIn(path.join(root, 'gentle-ai-overlay'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const [label, baseline] of [['baseline', selftestIn(HERE)], ['unmutated copy', unmutatedCopy()]]) {
  if (baseline.status !== 0) {
    console.log(`${label} selftest is RED (${tally(baseline)}): refusing to measure mutants @es el selftest está ROJO: no se miden mutantes`);
    process.exit(2);
  }
  console.log(`${label}: ${tally(baseline)}`);
}
const verdicts = MUTANTS.map((mutant) => {
  const result = measure(mutant);
  console.log(`${result.verdict.padEnd(8)} ${mutant[0]}: ${mutant[1].split('\n')[0].slice(0, 60)} -> ${result.note}`);
  return result.verdict;
});
const killed = verdicts.filter((verdict) => verdict === 'KILLED').length;
console.log(`\n${killed}/${MUTANTS.length} killed`);
process.exitCode = killed === MUTANTS.length ? 0 : 1;
