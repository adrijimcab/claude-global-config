#!/usr/bin/env node
/**
 * Self-test for the brief-feasibility guard.
 *
 * It exercises the DECISION's state space, not merely that the guard fires (`guard-that-cannot-go-red`):
 * every face is shown to DENY, and every face's near miss is shown to ALLOW — the command stated as a
 * prohibition, an absolute tooling path, a tracked `.claude/` file, a main-checkout worker. Each case
 * asserts the verdict AND a fragment of the refusal text, because a guard that refuses for the wrong
 * stated reason gets routed around.
 *
 * REAL SHAPES, NEVER TYPED FROM MEMORY:
 * - payloads come from `~/.claude/hook-payloads/payloads.mjs` (the recorded `Agent` and the CAPTURED
 *   `SendMessage` payload). The recorded `Agent` payload carries no `cwd`/`transcript_path`; the captured
 *   `SendMessage` envelope shows the harness sends both, so they are added from that capture's shape;
 * - `isolation: "worktree"` is the value 210 real delegations of session c45d798b carry;
 * - the deny list is read at run time from the real `b100-am-ui/.claude/settings.local.json`;
 * - the recipient metas and the incident briefs are `fixtures/incidents.json`, copied verbatim from that
 *   session's transcripts, and the last block REPLAYS the incidents.
 *
 * The fixture checkout is a real git repository in the temp directory, so "gitignored" is answered by
 * git itself, exactly as in production.
 *
 * @es Auto-test del guard. Ejercita el espacio de estados de la DECISIÓN: cada cara DENIEGA y cada casi-
 * acierto PERMITE; por caso se afirma veredicto y fragmento del texto. Formas REALES: payloads grabados,
 * lista deny leída del fichero real, metas y briefs copiados del transcript, e incidentes REPRODUCIDOS.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { payloadFor, recordedPayload } from '../hook-payloads/payloads.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('brief-feasibility');

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'guard.mjs');
const DECLARATION = join(HERE, 'guard.mjs.hook-registration.json');
const REAL_PROJECT_SETTINGS = '/home/user/b100-am-ui-claude-tooling/settings.local.json';
const FIXTURES = JSON.parse(readFileSync(join(HERE, 'fixtures', 'incidents.json'), 'utf8'));
const INCIDENTS = FIXTURES.incidents;
const CWD_ONLY = FIXTURES.recipients.cwdOnly;

/** The session every payload here carries, so no proof run is journaled as real traffic. @es La sesión de las pruebas. */
const SESSION = 'selftest';

// ---------------------------------------------------------------------------------------------------
// The fixture world: a main checkout with gitignored tooling and the real deny list, and the harness's
// per-agent metas beside a transcript.
// @es El mundo de prueba: un checkout con tooling gitignorado y la lista deny real, y los metas del harness.
// ---------------------------------------------------------------------------------------------------

const world = mkdtempSync(join(tmpdir(), 'brief-feasibility-'));
const repo = join(world, 'repo');
const transcript = join(world, 'projects', 'fixture-project', `${SESSION}.jsonl`);
const subagents = join(world, 'projects', 'fixture-project', SESSION, 'subagents');
const TOOL = join('.claude', 'diff-coverage', 'diff-coverage.mjs');

const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

mkdirSync(join(repo, '.claude', 'diff-coverage'), { recursive: true });
mkdirSync(subagents, { recursive: true });
writeFileSync(transcript, '');
git('init', '-q');
writeFileSync(join(repo, '.gitignore'), '/.claude/*\n!/.claude/tracked-tool.mjs\n');
writeFileSync(join(repo, TOOL), 'export {};\n');
writeFileSync(join(repo, '.claude', 'tracked-tool.mjs'), 'export {};\n');
writeFileSync(join(repo, '.claude', 'AGENT-LEDGER.md'), '# contract\n');
writeFileSync(join(repo, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { deny: JSON.parse(readFileSync(REAL_PROJECT_SETTINGS, 'utf8')).permissions.deny } }));

// A recipient located by `worktreePath` ALONE, so that source is proven by itself (a7793255's meta also
// carries a worktree `cwd`, which would locate it even if `worktreePath` were ignored).
// @es Un destinatario ubicado SOLO por `worktreePath`, para probar esa fuente por sí misma.
const WORKTREE_AGENT = INCIDENTS.find((incident) => incident.recipientMeta?.worktreePath !== undefined && incident.recipientMeta.cwd === undefined).input.to;
const MAIN_AGENT = INCIDENTS.find((incident) => incident.recipientMeta !== null && incident.recipientMeta.worktreePath === undefined).input.to;

writeFileSync(join(subagents, `agent-${CWD_ONLY.agentId}.meta.json`), JSON.stringify(CWD_ONLY.meta));

for (const incident of INCIDENTS) if (incident.recipientMeta !== null) writeFileSync(join(subagents, `agent-${incident.input.to}.meta.json`), JSON.stringify(incident.recipientMeta));

/** The envelope fields the captured SendMessage payload shows the harness sends. @es Los campos de sobre que envía el harness. */
const envelope = { cwd: repo, transcript_path: transcript };

/** A delegation, optionally isolated. @es Una delegación, aislada o no. */
const agent = (text, { isolated = false, withCwd = true } = {}) => {
  const payload = payloadFor('Agent', text, { sessionId: SESSION, input: isolated ? { isolation: 'worktree' } : {} });

  return JSON.stringify(withCwd ? { ...payload, ...envelope } : payload);
};

/** A resume to the agent `to`, in the captured SendMessage shape. @es Un resume al agente `to`. */
const resume = (text, to) => JSON.stringify({ ...payloadFor('SendMessage', text, { sessionId: SESSION, input: { to, recipient: to } }), ...envelope });

const ABSOLUTE_TOOL = join(repo, TOOL);

const cases = [
  // --- denied-command ------------------------------------------------------------------------------
  ['deny', resume('Rebase onto the integration line.\n1. Run `git rebase integrate/lint-zero` on your branch.', MAIN_AGENT), 'a denied command in a code span, main-checkout worker', 'DENIED COMMAND'],
  ['deny', agent('Finish with:\n```\ngit push origin develop\n```'), 'a denied command in a fenced block', 'Bash(git push:*)'],
  ['deny', agent('Run git reset --hard HEAD~1 before starting.'), 'a denied command on an imperative line, no code span', 'git reset --hard'],
  ['deny', agent('`git rebase 3fdb3380` on your own branch (if any commit does not drop out, stop).'), 'the prohibition word sits in ANOTHER clause of the same line', 'line 1'],
  ['deny', agent('Rebase your branch: `git rebase develop`.'), 'the refusal names the permitted route', 'git cherry-pick'],
  ['deny', agent('Rebase your branch: `git rebase develop`.'), 'the refusal carries its Spanish half', '@es COMANDO DENEGADO'],
  ['deny', agent('Run `npm run lint --no-cache` and then `git push origin develop`.'), 'a prohibition word inside ANOTHER span of the clause is data, never prose', 'DENIED COMMAND'],
  ['allow', agent('`git rebase` is denied here, so branch off develop and cherry-pick.'), 'NEAR MISS: the command stated as denied in its own clause'],
  ['allow', agent('Never run `git rebase`; branch off develop instead.'), 'NEAR MISS: "never run" before the span'],
  ['allow', agent('Rebase and reset are denied to you.'), 'NEAR MISS: prose, no code span, no imperative opening'],
  ['allow', agent('A brief told a worker to `git rebase`, which is in the permissions deny list.'), 'NEAR MISS: a description whose prohibition follows a comma'],
  ['allow', agent("Don't `git push`; I push."), "NEAR MISS: n't is read as not"],
  ['allow', agent('These are refused to you:\n```\ngit push origin develop\n```'), 'NEAR MISS: a fence introduced by a prohibition'],
  ['allow', agent('Run `git -C C:/x push origin master`.'), 'the permission prefix does not reach past git global options, so neither does the guard'],
  ['allow', agent('Run `git status` and `npm run lint`.'), 'permitted commands'],

  // --- a list introduced by a colon, and quoted text ------------------------------------------------
  ['allow', agent('These are denied here: `git rebase develop`, `git push origin develop`.'), 'NEAR MISS: a prohibition before the colon governs EVERY item of its list'],
  ['deny', agent('Run: `git rebase develop`, then `git push origin develop`.'), 'a list introduced by an imperative stays an order', 'Bash(git push:*)'],
  ['deny', agent('Two steps: `git status`, then `git push origin develop`.'), 'a colon-introduced list with no prohibition stays an order', 'DENIED COMMAND'],
  ['allow', agent('The old brief said "Run `git rebase develop` now." and it was wrong.'), 'NEAR MISS: an order inside straight double quotes is quoted DATA'],
  ['allow', agent('The old brief said “Run `git rebase develop`.” and it was wrong.'), 'NEAR MISS: an order inside typographic quotes is quoted DATA'],
  ['allow', agent('El brief viejo decía «ejecuta `git rebase develop`» y estaba mal.'), 'NEAR MISS: an order inside guillemets is quoted DATA'],
  ['deny', agent('The old brief said "never `git push`" — now run `git rebase develop`.'), 'the scan RESUMES after the closing quote, and a quoted "never" governs nothing', 'git rebase develop` falls under'],
  ['deny', agent('Finish with `git commit -m "no more"` and `git push origin develop`.'), 'a quoted phrase INSIDE a code span governs nothing', 'Bash(git push:*)'],
  ['deny', agent('Print one mark with `printf "` and then `git push origin develop`, then read "the log".'), 'a lone quote INSIDE a code span opens no quotation', 'Bash(git push:*)'],
  ['allow', agent('Then say "call EnterWorktree" to show the old mistake.', { isolated: true }), 'NEAR MISS: EnterWorktree inside a quotation is data'],

  // --- worktree-inside-a-worktree ------------------------------------------------------------------
  ['deny', agent('- create a worktree: `git worktree add ../x -b y develop`;', { isolated: true }), 'isolated worker told to git worktree add', 'WORKTREE INSIDE A WORKTREE'],
  ['deny', agent('Then call EnterWorktree on the new branch.', { isolated: true }), 'isolated worker told to call EnterWorktree', 'ExitWorktree is refused'],
  ['deny', agent('TENANCY: b100-am-ui `.claude/worktrees/agent-x`\nRun `git worktree add .claude/worktrees/y -b y develop`.'), 'a TENANCY line naming a linked worktree locates the worker', 'TENANCY line names a linked worktree'],
  ['deny', resume('Deliver on develop: `git worktree add .claude/worktrees/z -b z develop`.', WORKTREE_AGENT), 'a resume to an agent whose harness meta names a worktree', `agent ${WORKTREE_AGENT} runs in`],
  ['deny', agent('Run `git -C . worktree add ../x`.', { isolated: true }), 'git global options before worktree add', 'creates a worktree'],
  ['allow', agent('Create a worktree: `git worktree add .claude/worktrees/y -b y develop`.'), 'NEAR MISS: a main-checkout worker may create a worktree'],
  ['allow', agent('Do not run `git worktree add`; stay in your own worktree.', { isolated: true }), 'NEAR MISS: the command stated as a prohibition'],
  ['allow', agent('EnterWorktree is refused to you, so stay where you are.', { isolated: true }), 'NEAR MISS: EnterWorktree named as refused'],
  ['allow', agent('Run `git worktree list` to see the others.', { isolated: true }), 'NEAR MISS: another worktree subcommand'],

  // --- relative-tooling-path -----------------------------------------------------------------------
  ['deny', agent('- `node .claude/diff-coverage/diff-coverage.mjs --base develop`', { isolated: true }), 'isolated worker, relative gitignored tooling path', ABSOLUTE_TOOL.split('\\').join('\\\\')],
  ['deny', resume('Verify: `node .claude/diff-coverage/diff-coverage.mjs --base develop`', WORKTREE_AGENT), 'resume to a worktree agent, relative tooling path', 'RELATIVE TOOLING PATH'],
  ['deny', agent('Run `node ./.claude/diff-coverage/diff-coverage.mjs`.', { isolated: true }), 'the ./ spelling is relative too', 'use the absolute path'],
  ['deny', resume('Verify: `node .claude/diff-coverage/diff-coverage.mjs`', CWD_ONLY.agentId), 'a meta locating its agent by cwd alone, with no worktreePath', `agent ${CWD_ONLY.agentId} runs in`],
  ['allow', agent(`Run \`node ${ABSOLUTE_TOOL}\`.`, { isolated: true }), 'NEAR MISS: the absolute tooling path'],
  ['allow', agent('Run `node .claude/diff-coverage/diff-coverage.mjs`.'), 'NEAR MISS: a main-checkout worker resolves the relative path'],
  ['allow', agent('Run `node .claude/tracked-tool.mjs`.', { isolated: true }), 'NEAR MISS: a TRACKED .claude file exists in every worktree'],
  ['allow', agent('Run `node .claude/absent-tool.mjs`.', { isolated: true }), 'NEAR MISS: a path that is not a file in the main checkout is not this face'],
  ['allow', resume('Run `node .claude/diff-coverage/diff-coverage.mjs`.', 'a-worker-addressed-by-name'), 'a resume addressed by NAME has no meta: unlocated, fails open'],

  // --- outside the decision ------------------------------------------------------------------------
  ['allow', agent('MEASURED: none.\nHYPOTHESIS: none.\nRead src/x.ts and report its exports.', { isolated: true }), 'an unrelated brief'],
  ['allow', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git rebase develop' } }), 'not a brief-bearing tool'],
  ['allow', 'NOT JSON AT ALL', 'garbage payload'],
  ['allow', '', 'empty payload'],
  ['allow', '{"tool_name":', 'truncated json'],
  ['allow', '\uFEFFNOT JSON', 'BOM + garbage'],
  ['deny', `\uFEFF${agent('Rebase your branch: `git rebase develop`.')}`, 'a BOM-prefixed payload (PowerShell writes one) is still decided, not read as garbage', 'DENIED COMMAND']
];

let failures = 0;
let total = 0;

/** Records one outcome and prints it. @es Registra un resultado. */
function report(ok, line) {
  total += 1;

  if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

/** True when `output` is exactly the envelope the harness reads for a refused PreToolUse call. @es Verdadero si `output` es el sobre exacto que lee el harness. */
function isHookRefusal(output) {
  try {
    const { hookSpecificOutput } = JSON.parse(output);

    return hookSpecificOutput.hookEventName === 'PreToolUse' && hookSpecificOutput.permissionDecision === 'deny' && hookSpecificOutput.permissionDecisionReason.startsWith('BRIEF-FEASIBILITY REFUSED');
  } catch {
    return false;
  }
}

/** Runs the guard as the harness does, returning `{ verdict, output, code }`. @es Corre el guard como el harness. */
function run(input, cwd = world) {
  let output = '';
  let code = 0;

  try {
    output = execFileSync('node', [GUARD], { input, encoding: 'utf8', cwd });
  } catch (error) {
    code = error.status;
    output = error.stdout ?? '';
  }

  return { verdict: output.includes('"deny"') ? 'deny' : 'allow', output, code };
}

try {
  for (const [expected, input, label, expectedText] of cases) {
    const { verdict, output, code } = run(input);
    const textOk = expectedText === undefined || output.includes(expectedText);
    const shapeOk = expected === 'allow' ? output === '' : isHookRefusal(output);

    report(verdict === expected && code === 0 && textOk && shapeOk, `expected=${expected} actual=${verdict} exit=${code}  ${label}${textOk ? '' : `  [the refusal never named: ${expectedText}]`}`);
  }

  // The module is a library first: the dispatcher imports `evaluate` and runs it in its own process, so
  // importing the guard must run nothing (it would read the importer's stdin and cut it off), and
  // `evaluate` must hand back the envelope the process prints. The guard is imported in a CHILD process: were
  // its entry check wrong, the import itself would read this selftest's stdin and end the process with exit 0,
  // taking the verdict with it.
  // @es El módulo es primero una biblioteca: importarlo no corre nada y `evaluate` devuelve el sobre del
  // proceso. Se importa en un proceso HIJO: si su comprobación de entrada fallara, el import terminaría este selftest con 0.
  const PROBE = `const { evaluate } = await import(process.argv[1]);
console.log(JSON.stringify({ type: typeof evaluate, refused: evaluate(process.argv[2]) ?? null, allowed: evaluate(process.argv[3]) ?? null, nonBrief: evaluate(process.argv[4]) ?? null, garbage: evaluate('NOT JSON') ?? null }));`;
  const refusedBrief = agent('Rebase your branch: `git rebase develop`.');
  const probe = spawnSync('node', ['--input-type=module', '-e', PROBE, pathToFileURL(GUARD).href, refusedBrief, agent('Run `git status`.'), JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git rebase develop' } })], { input: refusedBrief, encoding: 'utf8', cwd: world });
  const lines = probe.stdout.split('\n').filter((line) => line.length > 0);

  report(probe.status === 0 && lines.length === 1, 'importing the guard from another module runs nothing: it neither reads stdin nor prints a verdict of its own');

  try {
    const answer = JSON.parse(lines.at(-1));

    report(answer.type === 'function' && isHookRefusal(JSON.stringify(answer.refused)) && answer.allowed === null && answer.nonBrief === null && answer.garbage === null, 'the exported evaluate refuses with the envelope the process prints, and returns undefined for an allowed, a non-brief or an unreadable payload');
  } catch {
    report(false, 'the guard could not be imported as a library');
  }

  // A delegation payload without `cwd` falls back to the process directory, which the harness sets to
  // the session's checkout.
  // @es Sin `cwd` en el payload se usa el directorio del proceso.
  const fallback = run(agent('- `node .claude/diff-coverage/diff-coverage.mjs`', { isolated: true, withCwd: false }), repo);

  report(fallback.verdict === 'deny' && fallback.output.includes('use the absolute path'), `expected=deny actual=${fallback.verdict}  no cwd in the payload: the process directory names the main checkout`);

  // ---------------------------------------------------------------------------------------------
  // THE REAL INCIDENTS, replayed verbatim.
  // @es LOS INCIDENTES REALES, reproducidos literalmente.
  // ---------------------------------------------------------------------------------------------
  for (const incident of INCIDENTS) {
    const payload = incident.tool === 'SendMessage'
      ? { ...recordedPayload('SendMessage').payload, session_id: SESSION, tool_input: incident.input, ...envelope }
      : { ...recordedPayload('Agent').payload, session_id: SESSION, tool_input: incident.input, ...envelope };
    const { verdict, output, code } = run(JSON.stringify(payload));
    const facesOk = incident.faces.every((face) => output.includes(face.toUpperCase().split('-').join(' ')));

    report(verdict === incident.expected && code === 0 && facesOk, `expected=${incident.expected} actual=${verdict}  ${incident.label} [${incident.source.toolUseId}]${facesOk ? '' : `  [missing a face of ${incident.faces.join(', ')}]`}`);
  }

  // ---------------------------------------------------------------------------------------------
  // THE WIRING: the tools the decision reads a brief from are exactly the tools the declaration names.
  // @es EL CABLEADO: las herramientas de las que se lee un brief son exactamente las declaradas.
  // ---------------------------------------------------------------------------------------------
  const { BRIEF_CARRIERS } = await import('../brief-provenance/provenance.mjs');
  const declared = new Set(String(JSON.parse(readFileSync(DECLARATION, 'utf8')).registrations.find((entry) => entry.event === 'PreToolUse')?.matcher ?? '').split('|'));

  for (const tool of Object.keys(BRIEF_CARRIERS)) report(declared.has(tool), `the declaration registers ${tool}, which the decision reads a brief from`);

  for (const tool of declared) report(Object.hasOwn(BRIEF_CARRIERS, tool), `the decision reads a brief from ${tool}, which the declaration registers`);
} finally {
  rmSync(world, { recursive: true, force: true });
}

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
