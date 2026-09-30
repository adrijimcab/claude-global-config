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

const RUNNER = 'C:/Users/adrian.jimenez/Desktop/Projects/b100-am-ui/.claude/mutation-proof/run-mutants.mjs';
const { runMutants } = await import(pathToFileURL(RUNNER).href);

const I = 'brief-feasibility/instructions.mjs';
const D = 'brief-feasibility/deny-rules.mjs';
const L = 'brief-feasibility/worker-location.mjs';
const F = 'brief-feasibility/feasibility.mjs';

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
  ['a quoted tool mention reads as an order', I, 'if (!isInside(quotes, at) && !isProhibition(', 'if (!isProhibition(']
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
const paths = ['brief-feasibility', 'brief-provenance', 'hook-payloads', 'fleet-kit/vendor/shell-command', 'hook-dispatch'];
const survivors =
  runMutants({ fleetRoot, paths, selftest: 'brief-feasibility/selftest.mjs', mutants: MUTANTS }) +
  runMutants({ fleetRoot, paths, selftest: 'brief-feasibility/preflight.selftest.mjs', mutants: PREFLIGHT_MUTANTS });

process.exit(survivors === 0 ? 0 : 1);
