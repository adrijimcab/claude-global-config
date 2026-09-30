#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `cwd-change-guard` — `orchestrator-cwd-change-leaked-to-workers`.
 *
 * THE STATE SPACE THE DECISION RANGES OVER, each state exercised (`guard-that-cannot-go-red`):
 *   caller            main session / subagent by `agent_id` alone / by `subagents/` transcript alone / by both
 *   tool              Bash / PowerShell / a tool that runs no shell
 *   run mode          foreground / `run_in_background: true` / an explicit `false`
 *   directory changer cd, chdir, pushd, popd, Set-Location, sl, Push-Location — at the first position and later
 *   scope             top level / `( … )` subshell / `$( … )` / backticks / `bash -c` / `powershell -Command` /
 *                     `cmd /c` / pipe left side / pipe right side / `&` background job / `{ … }` group / `if` body
 *   data              `cd` inside `echo`, a commit message, a heredoc body, a longer word (`cdx`, `mycd`, `cd-tool`)
 *   its own failures  not JSON, empty, BOM + garbage, a null `tool_input`, a non-string command
 * plus the WIRING: the dispatcher manifest lists this guard, and its registration names exactly the tools the
 * decision covers, so the code cannot cover a shell the settings never run it for.
 *
 * EVERY PAYLOAD HAS THE REAL SHAPE: built by `hook-payloads/payloads.mjs` from the recorded Bash / PowerShell
 * payload, then made a MAIN-session payload the way the harness sends it (no `agent_id`, a transcript path not
 * under `subagents/`; measured on 3,040 real payloads in `backlog-owner-guard/identify-caller.mjs`). The first
 * row replays the exact command of the 2026-09-30 incident.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `cwd-change-guard`. Espacio de estados: llamante, herramienta, modo de
 * ejecución, comando que cambia de directorio (en primera posición y después), ámbito (nivel superior,
 * subshell, sustitución, `bash -c`, `cmd /c`, tubería, segundo plano, grupo, cuerpo de `if`), DATO (`echo`,
 * mensaje de commit, heredoc, palabras más largas) y fallos propios. Más el CABLEADO: el manifiesto del
 * dispatcher lista esta guardia y su registro nombra exactamente las herramientas que decide. Los payloads
 * tienen la forma real; la primera fila repite el comando exacto del incidente.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { payloadFor } = await import(pathToFileURL(path.join(HERE, '..', 'hook-payloads', 'payloads.mjs')).href);
const { evaluate, refusalText } = await import(pathToFileURL(path.join(HERE, 'guard.mjs')).href);
const { DIRECTORY_CHANGERS } = await import(pathToFileURL(path.join(HERE, 'decide.mjs')).href);

const MAIN_TRANSCRIPT = 'C:/Users/adrian.jimenez/.claude/projects/C--Users-adrian-jimenez-Desktop-Projects-b100-am-ui/784bb328-d6e8-4651-9adc-d67137d7beb4.jsonl';
const SUBAGENT_TRANSCRIPT = 'C:/Users/adrian.jimenez/.claude/projects/C--Users-adrian-jimenez-Desktop-Projects-b100-am-ui/784bb328-d6e8-4651-9adc-d67137d7beb4/subagents/agent-a8a1cf09d42b447f9.jsonl';
const INCIDENT_COMMAND = 'cd /c/Users/adrian.jimenez/Desktop/Projects/b100-am-ui/.claude/worktrees/fix-spec-types && node scripts/check-spec-typecheck.ts';

/** A main-session payload, the way the harness sends it: no `agent_id`, a transcript outside `subagents/`. @es Un payload de la sesión principal. */
function mainSession(tool, command, input) {
  const { agent_id: _agent, agent_type: _type, ...payload } = payloadFor(tool, command, { sessionId: 'selftest', input });

  return { ...payload, transcript_path: MAIN_TRANSCRIPT, cwd: 'C:/Users/adrian.jimenez/Desktop/Projects/b100-am-ui' };
}

const bash = (command, input) => mainSession('Bash', command, input);
const powershell = (command, input) => mainSession('PowerShell', command, input);

/** The same call, fired by a subagent: by `agent_id` alone, by transcript alone, or by both. @es La misma llamada, lanzada por un subagente. */
const byAgentIdOnly = (payload) => ({ ...payload, agent_id: 'a8a1cf09d42b447f9' });
const byTranscriptOnly = (payload) => ({ ...payload, transcript_path: SUBAGENT_TRANSCRIPT });
const byBoth = (payload) => byTranscriptOnly(byAgentIdOnly(payload));

const cases = [
  // --- REFUSED: a directory change in the session's own shell.
  ['deny', bash(INCIDENT_COMMAND), 'REAL CASE 2026-09-30: the exact `cd …/fix-spec-types && node …` that moved the session cwd', 'CWD-CHANGE GUARD REFUSED'],
  ['deny', bash('cd /tmp'), 'a bare cd'],
  ['deny', bash('cd'), 'cd with no operand (home)'],
  ['deny', bash('cd "C:/a b" && ls'), 'a quoted path'],
  ['deny', bash('cd x; ls'), 'cd first, `;` separated'],
  ['deny', bash('git status && cd x && node y.mjs'), 'NOT the first command: the leak is the same wherever the cd sits'],
  ['deny', bash('ls\ncd x\nls'), 'newline-separated statements'],
  ['deny', bash('cd x || exit 1'), '`||` guard after the cd'],
  ['deny', bash('pushd /tmp && ls'), 'pushd'],
  ['deny', bash('popd'), 'popd'],
  ['deny', bash('chdir /tmp'), 'chdir'],
  ['deny', bash('if true; then cd x; fi'), 'a cd inside an `if` body still runs in the session shell'],
  ['deny', bash('{ cd x; ls; }'), 'a brace group runs in the session shell, unlike a subshell'],
  ['deny', bash('sleep 1 & cd x'), 'a background job BEFORE the cd does not move it into a subshell'],
  ['deny', bash('FOO=1 cd x'), 'an environment prefix in front'],
  ['deny', bash('cd x', { run_in_background: false }), 'NEAR MISS: `run_in_background` declared, but false'],
  ['deny', bash('cd x', { timeout: 600_000 }), 'a declared timeout changes nothing'],
  ['deny', powershell('Set-Location C:\\x; npm test'), 'PowerShell Set-Location'],
  ['deny', powershell('set-location C:\\x'), 'NEAR MISS: lower case, PowerShell does not care'],
  ['deny', powershell('sl C:\\x'), 'the `sl` alias'],
  ['deny', powershell('cd C:\\x; npm test'), 'the `cd` alias in PowerShell'],
  ['deny', powershell('Push-Location C:\\x; npm test; Pop-Location'), 'Push-Location'],

  // --- ALLOWED: the three shapes the refusal names.
  ['allow', bash('git -C /c/Users/adrian.jimenez/Desktop/Projects/b100-am-ui status'), 'SHAPE 1 — `git -C`, no directory change'],
  ['allow', bash('node /c/Users/adrian.jimenez/.claude/failure-capture/capture.mjs promote --key x'), 'SHAPE 1 — an absolute path'],
  ['allow', bash('( cd /c/Users/adrian.jimenez/Desktop/Projects/b100-am-ui/.claude/worktrees/fix-spec-types && node scripts/x.ts )'), 'SHAPE 2 — THE ONE THAT MATTERS: the subshell the refusal itself recommends'],
  ['allow', bash('( cd x && ls ); ls'), 'a subshell followed by ordinary commands'],
  ['allow', bash(INCIDENT_COMMAND, { run_in_background: true }), 'SHAPE 3 — the incident command, in the background'],

  // --- ALLOWED: other scopes where the session shell never changes directory.
  ['allow', bash('bash -c "cd x && ls"'), '`bash -c` is a child process'],
  ['allow', bash("sh -c 'cd /tmp; pwd'"), '`sh -c`, single-quoted'],
  ['allow', bash('where=$(cd x && pwd); echo "$where"'), 'a `$( )` substitution'],
  ['allow', bash('echo `cd x && pwd`'), 'a backtick substitution'],
  ['allow', bash('cmd /c "cd x && dir"'), '`cmd /c`'],
  ['allow', bash('powershell -Command "Set-Location x; ls"'), '`powershell -Command` from bash'],
  ['allow', bash('cd x | tee out.txt'), 'the left side of a pipe runs in a subshell'],
  ['allow', bash('echo x | cd y'), 'the right side of a pipe runs in a subshell'],
  ['allow', bash('cd x &'), 'a background job'],
  ['allow', powershell('powershell -Command "Set-Location x; ls"'), 'a nested powershell'],

  // --- ALLOWED: a subagent keeps its own cwd; each identity signal alone is enough, so none can drift alone.
  ['allow', byAgentIdOnly(bash(INCIDENT_COMMAND)), 'subagent identified by `agent_id` alone'],
  ['allow', byTranscriptOnly(bash(INCIDENT_COMMAND)), 'subagent identified by its `subagents/` transcript alone'],
  ['allow', byBoth(bash(INCIDENT_COMMAND)), 'subagent identified by both signals'],
  ['allow', byBoth(powershell('Set-Location C:\\x')), 'a subagent in PowerShell'],

  // --- ALLOWED: `cd` as DATA, never in command position.
  ['allow', bash('echo "cd x && node y"'), 'an echoed string'],
  ['allow', bash('echo cd x'), 'NEAR MISS: the words are unquoted, only COMMAND POSITION decides'],
  ['allow', bash('git commit -m "fix: cd into the worktree before running"'), 'a commit message'],
  ['allow', bash("cat <<'EOF' > note.txt\ncd x\nnpm test\nEOF"), 'a heredoc body'],
  ['allow', bash('rg "cd " docs/'), 'a search pattern'],
  ['allow', bash('node cd.mjs'), 'a script called cd.mjs is an argument'],
  ['allow', bash('cdx x'), 'NEAR MISS: a longer word'],
  ['allow', bash('mycd x'), 'NEAR MISS: a longer word ending in cd'],
  ['allow', bash('cd-tool x'), 'NEAR MISS: a hyphenated word starting with cd'],
  ['allow', bash('git cd'), '`cd` as a git subcommand word'],
  ['allow', bash('ls -la && git status'), 'an ordinary line'],

  // --- NOT A SHELL COMMAND: outside the decision.
  ['allow', { ...bash('cd x'), tool_name: 'SendMessage' }, 'a tool that runs no shell'],
  ['allow', { ...bash('cd x'), tool_input: null }, 'a null tool_input'],
  ['allow', { ...bash('cd x'), tool_input: { command: 42 } }, 'a non-string command'],
  ['allow', { ...bash('cd x'), tool_input: {} }, 'no command at all'],

  // --- FAIL-OPEN, as raw text.
  ['allow', 'NOT JSON AT ALL', 'garbage payload'],
  ['allow', '', 'empty payload'],
  ['allow', '﻿NOT JSON', 'BOM + garbage'],
  ['deny', `﻿${JSON.stringify(bash('cd x'))}`, 'a BOM in front of a VALID payload is still read']
];

let passed = 0;
const failures = [];

/** Records one outcome. @es Registra un resultado. */
function check(name, actual, expected) {
  if (actual === expected) {
    passed += 1;
    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

for (const [expected, input, label, expectedText] of cases) {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  const output = evaluate(raw);
  const actual = output?.hookSpecificOutput?.permissionDecision === 'deny' ? 'deny' : 'allow';

  check(`${label} (verdict)`, actual, expected);

  if (expectedText !== undefined) check(`${label} (names ${expectedText})`, output?.hookSpecificOutput?.permissionDecisionReason?.includes(expectedText), true);
}

// --- THE REFUSAL TEACHES THE REMEDY: all three shapes, in both languages, and the recommended shape is allowed.
const reason = refusalText({ executable: 'cd', text: 'cd x' });

const [english, spanish] = reason.split('@es ');

check('the refusal names the `git -C` shape in English', english.includes('git -C <dir>'), true);
check('the refusal names the subshell shape in English', english.includes('( cd <dir> && <command> )'), true);
check('the refusal names the background shape in English', english.includes('run_in_background: true'), true);
check('the refusal names the `git -C` shape in Spanish', spanish.includes('git -C <dir>'), true);
check('the refusal names the subshell shape in Spanish', spanish.includes('( cd <dir> && <comando> )'), true);
check('the refusal names the background shape in Spanish', spanish.includes('run_in_background: true'), true);
check('the refusal carries the @es mirror', reason.includes('@es CWD-CHANGE GUARD RECHAZÓ'), true);

// --- THE DECISION COVERS EXACTLY THE DIRECTORY CHANGERS WE EXPECT: the expectation is written HERE, never read
// from the set under test, so removing a member from the set cannot also remove its test.
const EXPECTED_CHANGERS = { cd: bash, chdir: bash, pushd: bash, popd: bash, 'set-location': powershell, sl: powershell, 'push-location': powershell, 'pop-location': powershell };

check('the decision names exactly the expected directory changers', [...DIRECTORY_CHANGERS].sort().join(), Object.keys(EXPECTED_CHANGERS).sort().join());

for (const [executable, dialect] of Object.entries(EXPECTED_CHANGERS)) {
  check(`changer ${executable}, ALONE, is refused`, evaluate(JSON.stringify(dialect(`${executable} x`)))?.hookSpecificOutput?.permissionDecision, 'deny');
}

// --- THE WIRING: the dispatcher runs this guard, for exactly the tools the decision covers.
const manifest = JSON.parse(readFileSync(path.join(HERE, '..', 'hook-dispatch', 'manifests', 'pretooluse-shell.json'), 'utf8'));
const registration = JSON.parse(readFileSync(path.join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));

check('the shell manifest lists this guard', manifest.guards.includes('../../cwd-change-guard/guard.mjs'), true);
check('the registration names exactly Bash and PowerShell', registration.registrations.map((entry) => entry.matcher).join(), 'Bash|PowerShell');

// --- END TO END through the dispatcher, the way the harness runs it.
const dispatched = execFileSync('node', [path.join(HERE, '..', 'hook-dispatch', 'dispatch.mjs'), path.join(HERE, '..', 'hook-dispatch', 'manifests', 'pretooluse-shell.json')], {
  input: JSON.stringify(bash(INCIDENT_COMMAND)),
  encoding: 'utf8'
});

check('the real payload of the incident is DENIED through the dispatcher', dispatched.includes('"deny"') && dispatched.includes('CWD-CHANGE GUARD REFUSED'), true);

const dispatchedAllowed = execFileSync('node', [path.join(HERE, '..', 'hook-dispatch', 'dispatch.mjs'), path.join(HERE, '..', 'hook-dispatch', 'manifests', 'pretooluse-shell.json')], {
  input: JSON.stringify(bash('( cd x && ls )')),
  encoding: 'utf8'
});

check('the subshell shape is ALLOWED through the dispatcher', dispatchedAllowed.includes('CWD-CHANGE GUARD'), false);

const total = passed + failures.length;

for (const failure of failures) console.log(`FAIL  ${failure}`);
console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'}  cwd-change-guard selftest: ${passed}/${total}`);
process.exit(failures.length === 0 ? 0 : 1);
