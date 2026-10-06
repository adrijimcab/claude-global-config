#!/usr/bin/env node
/**
 * The decisions of the gentle-ai overlay, each broken once, that `selftest.mjs` must catch. The runner and
 * its rules (green unmutated baseline, target exactly once, parse check, non-empty campaign) live in
 * `../mutation-proof/run-mutants.mjs`. Each row names the DECISION it removes, not the line it edits.
 * The selftest reaches beyond this directory (the sync guard's shell parser, the hook dispatcher, the
 * settings entry), so the runner copies that whole tree into every sandbox.
 *
 *   node mutants.mjs      exit 0 only when every mutant is killed
 *
 * @es Las decisiones del overlay de gentle-ai, rotas una a una, que `selftest.mjs` debe cazar. El runner y
 * sus reglas (línea base verde sin mutar, texto exactamente una vez, comprobación de sintaxis, campaña no
 * vacía) viven en `../mutation-proof/run-mutants.mjs`. Cada fila nombra la DECISIÓN que elimina, no la línea
 * que edita. El selftest llega más allá de este directorio (el analizador de shell del guard de sync, el
 * dispatcher de hooks, la entrada de settings), así que el runner copia todo ese árbol en cada sandbox.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMutants } from '../mutation-proof/run-mutants.mjs';

// [decision label, file relative to the home directory, exact text, replacement]
// @es [etiqueta de la decisión, fichero relativo al directorio home, texto exacto, reemplazo]
const MUTANTS = [
  ['Bash is read from the raw file text, not from the tools line', 'gentle-ai-overlay/kinds/agent-tool.mjs', "parsed.tokens.includes(customization.tool)\n      ? { status: 'held'", "text.includes(customization.tool)\n      ? { status: 'held'"],
  ['a missing agent file reads as held for a withheld tool', 'gentle-ai-overlay/kinds/agent-tool.mjs', "if (error) return { status: 'broken', detail: error };\n    return parsed.tokens.includes(customization.tool)\n      ? { status: 'broken'", "if (error) return { status: 'held', detail: error };\n    return parsed.tokens.includes(customization.tool)\n      ? { status: 'broken'"],
  ['apply rewrites a tools line that is not in the canonical form', 'gentle-ai-overlay/kinds/agent-tool.mjs', "const isCanonical = parsed.form === 'plain' &&", 'const isCanonical = true ||'],
  ['a marker inside a managed region is not seen as inside it', 'gentle-ai-overlay/managed-regions.mjs', 'region.open < index && index < region.close', 'false'],
  ['a stray closing marker is read as ordinary text', 'gentle-ai-overlay/managed-regions.mjs', "return { type: 'stray' };", "return { type: 'text' };"],
  ['a region closed under a different id is accepted', 'gentle-ai-overlay/managed-regions.mjs', 'else if (top.id !== marker.id)', 'else if (false)'],
  ['the persona region is always read as equal to upstream', 'gentle-ai-overlay/kinds/persona-region.mjs', 'if (content === reference.text)', 'if (true)'],
  ['a missing persona reference reads as empty text instead of unverifiable', 'gentle-ai-overlay/persona-reference.mjs', 'if (text !== null) return { text: normalizeBlock(text), source };', "if (text !== null) return { text: normalizeBlock(text), source };\n    return { text: '', source };"],
  ['a duplicated owner section is accepted', 'gentle-ai-overlay/kinds/owner-sections.mjs', 'if (at.length > 1)', 'if (false)'],
  ['an owner anchor mentioned mid-line counts as the section', 'gentle-ai-overlay/kinds/owner-sections.mjs', 'line.startsWith(anchor)', 'line.includes(anchor)'],
  ['the first mcp tool is no longer where Bash is inserted', 'gentle-ai-overlay/agent-frontmatter.mjs', "token.startsWith('mcp__')", "token.startsWith('zzz')"],
  ['a tools line outside the frontmatter is read as the agent tools', 'gentle-ai-overlay/agent-frontmatter.mjs', 'at > 0 && at < end && line.startsWith(KEY)', 'at > 0 && line.startsWith(KEY)'],
  ['a rewritten line loses its CRLF ending', 'gentle-ai-overlay/text-file.mjs', 'export const withEndingOf = (original, content) =>', 'export const withEndingOf = (original, content) => content;\nconst unused = (original, content) =>'],
  ['unverifiable no longer exits 2', 'gentle-ai-overlay/report.mjs', "if (results.some((result) => result.status === 'unverifiable')) return 2;", ''],
  ['the session-start hook exits 1 on drift', 'gentle-ai-overlay/session-start-hook.mjs', 'process.exitCode = 0;', 'process.exitCode = 1;'],
  ['the session-start hook no longer reports its own malfunction', 'gentle-ai-overlay/session-start-hook.mjs', 'emit(`[gentle-ai overlay] the drift check itself failed', 'void (`[gentle-ai overlay] the drift check itself failed'],
  ['the CLI keeps the environment variables that mask the answer', 'gentle-ai-overlay/gentle-ai-cli.mjs', 'MASKING_VARIABLES.forEach((name) => delete environment[name]);', ''],
  ['a failing CLI run is read as an answer', 'gentle-ai-overlay/gentle-ai-cli.mjs', 'if (result.status !== 0) return', 'if (false) return'],
  ['telemetry counts as disabled without checking its source', 'gentle-ai-overlay/kinds/telemetry.mjs', "status.enabled === false && status.source === 'state'", 'status.enabled === false'],
  ['the telemetry status schema is not checked', 'gentle-ai-overlay/kinds/telemetry.mjs', 'if (status.schema !== STATUS_SCHEMA)', 'if (false)'],
  ['an unverifiable telemetry answer reads as held', 'gentle-ai-overlay/kinds/telemetry.mjs', "if (unverifiable) return { status: 'unverifiable', detail: unverifiable };", "if (unverifiable) return { status: 'held', detail: unverifiable };"],
  ['telemetry apply enables instead of disabling', 'gentle-ai-overlay/kinds/telemetry.mjs', "['telemetry', 'disable', '--json']", "['telemetry', 'enable', '--json']"],
  ['the review heading is matched as a substring of a line', 'gentle-ai-overlay/review-contract-section.mjs', 'if (lineContent(line) === needle)', 'if (lineContent(line).includes(needle))'],
  ['an absent span is declared without checking the contract title', 'gentle-ai-overlay/review-contract-section.mjs', 'starts.length === 0 && lineStarts(text, CONTRACT_TITLE).length === 0', 'starts.length === 0'],
  ['a duplicated start heading is accepted', 'gentle-ai-overlay/review-contract-section.mjs', 'if (starts.length !== 1)', 'if (starts.length > 1)'],
  ['a duplicated end heading is accepted', 'gentle-ai-overlay/review-contract-section.mjs', 'if (ends.length !== 1)', 'if (ends.length > 1)'],
  ['a missing or duplicated orchestrator region is accepted', 'gentle-ai-overlay/review-contract-section.mjs', 'if (opens.length !== 1 || closes.length !== 1)', 'if (false)'],
  ['a span outside its region is accepted', 'gentle-ai-overlay/review-contract-section.mjs', 'if (!(opens[0] < start && start < end && end < closes[0]))', 'if (!(start < end))'],
  ['a sentinel without its closing is read as a sentinel', 'gentle-ai-overlay/review-contract-section.mjs', 'line.startsWith(SENTINEL_PREFIX) && line.endsWith(SENTINEL_SUFFIX)', 'line.startsWith(SENTINEL_PREFIX)'],
  ['the pointer ignores the file line ending', 'gentle-ai-overlay/review-contract-section.mjs', "(text.includes('\\r\\n') ? '\\r\\n' : '\\n')", "'\\n'"],
  ['the pointer loses its Spanish half', 'gentle-ai-overlay/review-contract-section.mjs', '    `@es El desarrollo guiado', '    `El desarrollo guiado'],
  ['keepLoaded no longer keeps a present span', 'gentle-ai-overlay/review-contract-section.mjs', "    if (keepLoaded) return { outcome: 'unchanged', form, text, stash };", ''],
  ['the pointer carries a wrong sha', 'gentle-ai-overlay/review-contract-section.mjs', 'pointerFor(text, sha256(moved), stashLabel)', "pointerFor(text, 'x', stashLabel)"],
  ['a tampered or missing stash is restored', 'gentle-ai-overlay/review-contract-section.mjs', 'stash === null || sha256(stash) !== section.sha', 'stash === null'],
  ['a moved span is restored while reviews are off', 'gentle-ai-overlay/review-contract-section.mjs', "  if (!keepLoaded) return { outcome: 'unchanged', form, text, stash };", ''],
  ['a restored span loses its trailing newline', 'gentle-ai-overlay/review-contract-section.mjs', 'text.slice(0, start) + stash + text.slice(end)', 'text.slice(0, start) + stash.trimEnd() + text.slice(end)'],
  ['the review mode reads the effective mode instead of the global one', 'gentle-ai-overlay/review-mode.mjs', "return { reviewsMayRun: report.status.global === 'on' };", "return { reviewsMayRun: report.status.effective === 'on' };"],
  ['an unreadable review mode is ignored', 'gentle-ai-overlay/review-mode.mjs', 'if (!run.ok) return { unreadable: run.reason };', ''],
  ['the review mode report schema is not checked', 'gentle-ai-overlay/review-mode.mjs', 'report?.schema !== MODE_SCHEMA || ', ''],
  ['the review mode status schema is not checked', 'gentle-ai-overlay/review-mode.mjs', ' || report.status?.schema !== STATUS_SCHEMA', ''],
  ['an unreadable mode no longer keeps the span loaded', 'gentle-ai-overlay/kinds/lazy-review-contract.mjs', 'const keepLoaded = mode.unreadable !== undefined || mode.reviewsMayRun;', 'const keepLoaded = mode.reviewsMayRun === true;'],
  ['an unreadable mode no longer reports unverifiable', 'gentle-ai-overlay/kinds/lazy-review-contract.mjs', "if (plan.mode.unreadable !== undefined) return { status: 'unverifiable'", "if (false) return { status: 'unverifiable'"],
  ['a pending move is no longer broken', 'gentle-ai-overlay/kinds/lazy-review-contract.mjs', "if (plan.outcome !== 'unchanged') return { status: 'broken', detail: detailFor(plan) };", ''],
  ['a refused plan reads as held', 'gentle-ai-overlay/kinds/lazy-review-contract.mjs', "if (plan.refused !== undefined) return { status: 'broken', detail: plan.refused };", "if (plan.refused !== undefined) return { status: 'held', detail: plan.refused };"],
  ['apply never writes the stash', 'gentle-ai-overlay/kinds/lazy-review-contract.mjs', "if (plan.outcome === 'moved') {", 'if (false) {'],
  ['the lazy kind is no longer sync-safe', 'gentle-ai-overlay/kinds/lazy-review-contract.mjs', '  syncSafe: true,', '  syncSafe: false,'],
  ['apply does not refuse when the plan is refused', 'gentle-ai-overlay/kinds/lazy-review-contract.mjs', "    if (plan.refused !== undefined) return { outcome: 'refused', detail: plan.refused };\n    if (plan.outcome === 'unchanged')", "    if (plan.outcome === 'unchanged')"],
  ['every kind reads as sync-safe', 'gentle-ai-overlay/invariants.mjs', 'syncSafe: kind.syncSafe === true,', 'syncSafe: true,'],
  ['apply.mjs ignores --dry-run and writes', 'gentle-ai-overlay/apply.mjs', 'dryRun ? planAll(CUSTOMIZATIONS, context) : applyAll(CUSTOMIZATIONS, context)', 'applyAll(CUSTOMIZATIONS, context)'],
  ['a non-string command is parsed', 'gentle-ai-overlay/lazy-review-triggers.mjs', 'if (typeof command !== \'string\') return null;', ''],
  ['a dry-run sync counts as a trigger', 'gentle-ai-overlay/lazy-review-triggers.mjs', '.some((invocation) => !invocation.dryRun)', '.some(() => true)'],
  ['any program running a review group counts as gentle-ai', 'gentle-ai-overlay/lazy-review-triggers.mjs', "return program === 'gentle-ai' && group === 'review'", "return group === 'review'"],
  ['a review verb without the mode noun counts as a mode change', 'gentle-ai-overlay/lazy-review-triggers.mjs', "noun === 'mode' && ", ''],
  ['any verb counts as a mode change', 'gentle-ai-overlay/lazy-review-triggers.mjs', 'MODE_CHANGES.has(verb)', 'verb !== undefined'],
  ['the tool name no longer picks the shell dialect', 'gentle-ai-overlay/lazy-review-triggers.mjs', 'const dialect = dialectOfTool(toolName);', "const dialect = dialectOfTool('Bash');"],
  ['the post-command hook acts on every command', 'gentle-ai-overlay/post-command-hook.mjs', 'if (lazyReviewTrigger(payload?.tool_input?.command, payload?.tool_name) === null) return undefined;', ''],
  ['the post-command hook names the wrong event', 'gentle-ai-overlay/post-command-hook.mjs', "hookOutput('PostToolUse',", "hookOutput('SessionStart',"],
  ['the post-command hook no longer reports its own malfunction', 'gentle-ai-overlay/post-command-hook.mjs', 'process.stdout.write(`${JSON.stringify({ systemMessage: `[gentle-ai overlay] the post-command hook failed', 'void (`${JSON.stringify({ systemMessage: `[gentle-ai overlay] the post-command hook failed'],
  ['a restore is no longer announced', 'gentle-ai-overlay/lazy-review-hook-output.mjs', "if (result.change !== 'restored') return {};", ''],
  ['a restore no longer tells the model to read the stash', 'gentle-ai-overlay/lazy-review-hook-output.mjs', ', additionalContext: read };', ' };'],
  ['a move is no longer announced', 'gentle-ai-overlay/lazy-review-hook-output.mjs', "if (result.change === 'moved') return", "if (false) return"],
  ['session start no longer re-places the review contract', 'gentle-ai-overlay/session-start-hook.mjs', 'const replaced = reconcileLazyReview(context);', 'const replaced = {};'],
  ['session start drops the restore context', 'gentle-ai-overlay/session-start-hook.mjs', 'emit(message, joined([replaced.additionalContext, advisory]));', 'emit(message, joined([advisory]));'],
  ['the line replacement matches a substring of a line', 'gentle-ai-overlay/kinds/line-replacement.mjs', 'lineContent(line) === sentence', 'lineContent(line).includes(sentence)'],
  ['a duplicated upstream line is replaced', 'gentle-ai-overlay/kinds/line-replacement.mjs', 'upstream.length === 1 && replaced.length === 0', 'upstream.length >= 1 && replaced.length === 0'],
  ['the replacement and the upstream sentence together read as held', 'gentle-ai-overlay/kinds/line-replacement.mjs', 'if (upstream.length === 0 && replaced.length === 1) return', 'if (replaced.length >= 1) return'],
  ['a reworded upstream sentence is not reported as an anchor miss', 'gentle-ai-overlay/kinds/line-replacement.mjs', 'if (upstream.length === 0 && replaced.length === 0) {', 'if (false) {'],
  ['the replaced line loses its CRLF ending', 'gentle-ai-overlay/kinds/line-replacement.mjs', 'withEndingOf(lines[state.index], customization.replacement)', 'customization.replacement'],
  ['apply rewrites the file without the replacement', 'gentle-ai-overlay/kinds/line-replacement.mjs', 'joinLines(lines));', 'joinLines(state.lines));'],
  ['the line replacement is no longer sync-safe', 'gentle-ai-overlay/kinds/line-replacement.mjs', '  syncSafe: true,', '  syncSafe: false,'],
  ['the line replacement plan names the wrong outcome', 'gentle-ai-overlay/kinds/line-replacement.mjs', "outcome: 'would-replace'", "outcome: 'would-try'"],
  ['the real anchor sentence drifts from the upstream text', 'gentle-ai-overlay/customizations.mjs', '`blocked` without running the full suite.\'', '`blocked` without running the whole suite.\''],
  ['a help flag inside a review command no longer stops the mode change read', 'gentle-ai-overlay/lazy-review-triggers.mjs', 'const [group, noun, verb] = subcommandWords(args);', 'const [group, noun, verb] = args.filter((arg) => !arg.startsWith(\'-\'));'],
  ['the apply no-op line loses its Spanish half', 'gentle-ai-overlay/apply.mjs', 'broken @es nada reaplicable', 'broken nada reaplicable'],
  ['the apply verdict heading loses its Spanish half', 'gentle-ai-overlay/apply.mjs', 'verdict after apply @es veredicto', 'verdict after apply veredicto'],
  ['the drift advisory header loses its Spanish half', 'gentle-ai-overlay/report.mjs', 'not intact: @es ', 'not intact: '],
  ['the drift advisory restore line loses its Spanish half', 'gentle-ai-overlay/report.mjs', '${APPLY_COMMAND} @es Restaurar', '${APPLY_COMMAND} Restaurar'],
  ['the drift advisory re-check line loses its Spanish half', 'gentle-ai-overlay/report.mjs', '${CHECK_COMMAND} @es Volver', '${CHECK_COMMAND} Volver'],
  ['the hook malfunction message loses its Spanish half', 'gentle-ai-overlay/session-start-hook.mjs', '${CHECK_COMMAND} @es la comprobación', '${CHECK_COMMAND} la comprobación'],
  ['the withheld-tool remedy loses its Spanish half', 'gentle-ai-overlay/kinds/agent-tool.mjs', 'grant). @es Se concedió', 'grant). Se concedió'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['gentle-ai-overlay', 'gentle-ai-sync-guard', 'hook-dispatch', 'hook-state', 'bilingual-output', 'settings.json'],
  selftest: 'gentle-ai-overlay/selftest.mjs',
  mutants: MUTANTS,
});

process.exit(survivors === 0 ? 0 : 1);
