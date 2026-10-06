#!/usr/bin/env node
/**
 * Mutation campaign for the brief-feasibility guard: each mutant breaks ONE decision the selftest says it
 * guards, and the selftest must go red. It uses the shared runner of the b100 project
 * (`.claude/mutation-proof/run-mutants.mjs`), which demands a green baseline, an exactly-once target and a
 * parseable mutant, so an "N/N killed" here cannot come from a selftest that was already red.
 *
 * @es Campaña de mutantes del guard: cada mutante rompe UNA decisión que el selftest dice cuidar, y el
 * selftest debe ponerse rojo. Usa el runner compartido, que exige línea base verde, objetivo exacto y
 * mutante parseable.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The global runner beside this fleet, never a project checkout (it carries the assertion/crash classification).
// @es El corredor global de esta flota, nunca el checkout de un proyecto (lleva la clasificación aserción/crash).
const RUNNER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'mutation-proof', 'run-mutants.mjs');
const { runMutants } = await import(pathToFileURL(RUNNER).href);

const I = 'brief-feasibility/instructions.mjs';
const D = 'brief-feasibility/deny-rules.mjs';
const L = 'brief-feasibility/worker-location.mjs';
const F = 'brief-feasibility/feasibility.mjs';
const G = 'brief-feasibility/guard.mjs';
const DENY = "{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'BRIEF-FEASIBILITY REFUSED' } }";

const MUTANTS = [
  ['prohibition words stop counting', I, 'return proseWords(prose).some((word) => PROHIBITION_WORDS.has(word));', 'return false;'],
  ["n't stops reading as not", I, ".split(\"n't\").join(' not')", ''],
  ['the comma becomes a clause boundary', I, "const CLAUSE_BOUNDARIES = '.;:()!?';", "const CLAUSE_BOUNDARIES = '.;:()!?,';"],
  ['the clause after a span runs to the end of the line', I, 'while (to < masked.length && !CLAUSE_BOUNDARIES.includes(masked.charAt(to))) to += 1;', 'to = masked.length;'],
  ['span contents are read as prose', I, 'const spanMasked = maskRanges(line, spans);', 'const spanMasked = line;'],
  ['fenced commands are never instructions', I, "if (!fenceIntroducedByProhibition && line.trim().length > 0) instructions.push(", 'if (false) instructions.push('],
  ['a prohibition introducing a fence is ignored', I, 'isProhibition(lastProse)', 'false'],
  ['imperative lines are never instructions', I, 'const verb = IMPERATIVE_VERBS.find((candidate) => lead.toLowerCase().startsWith(`${candidate} `));', 'const verb = undefined;'],
  ['a :* rule matches only the exact command', D, 'return rule.prefix ? command.startsWith(body) : command === body;', 'return command === body;'],
  ['the project settings.local.json is not read', D, "    join(projectRoot, '.claude', 'settings.local.json')\n", ''],
  ['isolation: worktree is ignored', L, "if (payload?.tool_input?.isolation === 'worktree')", "if (payload?.tool_input?.isolation === 'never')"],
  ['the meta worktreePath is ignored', L, 'if (typeof meta?.worktreePath === \'string\' && meta.worktreePath.length > 0) return meta.worktreePath;', ''],
  ['the meta cwd is ignored', L, 'return typeof meta?.cwd === \'string\' && forward(meta.cwd).includes(WORKTREES_SEGMENT) ? meta.cwd : undefined;', 'return undefined;'],
  ['a TENANCY worktree line is ignored', L, "return trimmed.startsWith(TENANCY_WORD) && trimmed.includes(':') && forward(trimmed).includes('.claude/worktrees/');", 'return false;'],
  ['the worktree faces apply to main-checkout workers', F, '...(location.linkedWorktree ? [', '...(true ? ['],
  ['EnterWorktree is never an instruction', F, 'const enters = instructedMentions(text, ENTER_WORKTREE)', 'const enters = [].concat([])'],
  ['every worktree subcommand counts as add', F, "words.at(subcommand + 1) === 'add'", "words.at(subcommand + 1) !== undefined"],
  ['git is not asked whether the file is ignored', F, 'return result.status === 0;', 'return true;'],
  ['a path that is not a file still counts', F, 'if (!statSync(join(mainCheckout, relativePath)).isFile()) return false;', 'if (false) return false;'],
  ['the refusal prints the relative path back', F, 'const absolute = join(location.mainCheckout, relativePath);', 'const absolute = relativePath;'],
  ['the rebase alternative is lost', F, "['git rebase', 'create a branch", "['git rebasex', 'create a branch"],
  ['a colon-introduced list loses the prohibition that governs it', I, "if (from === 0 || masked.charAt(from - 1) !== ':') return own;", 'return own;'],
  ['a quoted span reads as an order', I, 'if (isInside(quotes, span.start) || isProhibition(', 'if (isProhibition('],
  ['a quoted word governs a clause', I, 'return { quotes, prose: maskRanges(spanMasked, quotes) };', 'return { quotes, prose: spanMasked };'],
  ['a quote inside a code span opens a quotation', I, 'const quotes = quotedRanges(spanMasked);', 'const quotes = quotedRanges(line);'],
  ['typographic quotes and guillemets stop quoting', I, "const QUOTE_PAIRS = [['\"', '\"'], ['“', '”'], ['«', '»']];", "const QUOTE_PAIRS = [['\"', '\"']];"],
  ['a quoted tool mention reads as an order', I, 'if (!isInside(quotes, at) && !isProhibition(', 'if (!isProhibition('],

  // The hook shim `guard.mjs` is a deciding module too (it is dispatched): what the harness reads. NOT mutated,
  // by measurement: the `catch` in `main` that allows a delegation when `evaluate` throws, because no payload
  // makes `evaluate` throw, so no fixture reaches it.
  // @es El shim `guard.mjs` también decide: lo que lee el harness. No se muta el `catch` de `main`: ningún payload hace lanzar a `evaluate`.
  ['a BOM-prefixed payload is read as garbage', G, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['the BOM strip cuts into the payload', G, 'raw.slice(1) : raw', 'raw.slice(2) : raw'],
  ['every payload reads as unreadable', G, 'payload = JSON.parse(text);', 'payload = JSON.parse(text.slice(0, 0));'],
  ['a payload with no brief is inspected all the same', G, 'if (brief === undefined) return undefined;', ''],
  ['a brief the decision allows is refused all the same', G, 'if (refusal === undefined) return undefined;', `if (refusal === undefined) return ${DENY};`],
  ['a refusal asks instead of denying', G, "permissionDecision: 'deny',", "permissionDecision: 'ask',"],
  ['a refusal names the wrong hook event', G, "hookEventName: 'PreToolUse',", "hookEventName: 'PostToolUse',"],
  ['every refusal gives one reason, whatever it found', G, 'permissionDecisionReason: reason(refusal)', "permissionDecisionReason: 'BRIEF-FEASIBILITY REFUSED this call.'"],
  ['the denied-command face is not named', G, "'DENIED COMMAND — ", "'COMMAND — "],
  ['the Spanish half of the denied-command face is lost', G, '@es COMANDO DENEGADO — ', '@es COMANDO — '],
  ['the worktree face is not named', G, "'WORKTREE INSIDE A WORKTREE — ", "'WORKTREE — "],
  ['the tooling-path face is not named', G, "'RELATIVE TOOLING PATH — ", "'TOOLING PATH — "],
  ['a finding names the wrong line', G, '`  line ${lineNumber}: ${line.trim()}`', '`  line ${lineNumber + 1}: ${line.trim()}`'],
  ['a finding offers the detail as the alternative', G, '`  instead: ${alternative}`', '`  instead: ${detail}`'],
  ['the process prints nothing for a refusal', G, 'if (output !== undefined) console.log(JSON.stringify(output));', "if (output !== undefined) console.log('');"],
  ['importing the guard runs it as a process', G, 'process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))', 'true']
];

const P = 'brief-feasibility/preflight.mjs';

/** The preflight's own decisions, proven by its own selftest. @es Las decisiones del pre-chequeo. */
const PREFLIGHT_MUTANTS = [
  ['only the first refusal is kept', P, 'refusals.push({ manifest, reason: output.hookSpecificOutput.permissionDecisionReason });', 'if (refusals.length === 0) refusals.push({ manifest, reason: output.hookSpecificOutput.permissionDecisionReason });'],
  ['a guard that failed to run reads as silence', P, 'problems.push(...dispatchProblems.map(', '[].push(...dispatchProblems.map('],
  ['a manifest that cannot load reads as silence', P, '    } catch (error) {\n      problems.push(', '    } catch (error) {\n      [].push('],
  ['a resume is built as a delegation', P, "const recordingTool = options.tool === 'SendMessage' ? 'SendMessage' : 'Agent';", "const recordingTool = 'Agent';"],
  ["a resume loses its recipient's session", P, 'sessionId: located?.sessionId ?? PREFLIGHT_SESSION', 'sessionId: PREFLIGHT_SESSION'],
  ["a worktree cwd looks for its own manifest, not the main checkout's", P, "join(mainCheckoutOf(cwd), '.claude', 'hook-dispatch', 'pretooluse-delegation.json')", "join(cwd, '.claude', 'hook-dispatch', 'pretooluse-delegation.json')"],
  ['a resume with no recipient is guessed at', P, "if (options.tool === 'SendMessage' && options.to === undefined) return", "if (false) return"]
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const paths = ['brief-feasibility', 'brief-provenance', 'hook-payloads', 'fleet-kit/vendor/shell-command', 'hook-dispatch', 'hook-state', 'bilingual-output'];
const survivors =
  runMutants({ fleetRoot, paths, selftest: 'brief-feasibility/selftest.mjs', mutants: MUTANTS, crashKills: 'fail' }) +
  runMutants({ fleetRoot, paths, selftest: 'brief-feasibility/preflight.selftest.mjs', mutants: PREFLIGHT_MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
