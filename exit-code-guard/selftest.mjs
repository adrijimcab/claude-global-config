#!/usr/bin/env node
/**
 * Self-test for the exit-code guard.
 *
 * The state space that matters is defined by USAGE, not by the code's branches, so the allowed cases
 * are drawn from commands this project actually runs. The one that decides whether this guard
 * survives is the CORRECT logging shape — `cmd; code=$?; echo …; exit $code` — because that is what
 * the refusal tells people to write, and a guard that refused its own remedy would be switched off
 * within the hour.
 *
 * EVERY PAYLOAD HAS THE SHAPE THE HARNESS SENDS. Payloads come from `~/.claude/hook-payloads/`: the
 * PowerShell one CAPTURED from the live harness, the Bash one constructed from the documented shape and
 * live refusals. The PowerShell expectations are the MEASURED exit codes of Windows PowerShell 5.1 listed
 * in `status-echo.mjs` — including the guarded `if ($?) { … }` block, which preserves the failure and so
 * must NOT be refused.
 *
 * AND THE WIRING IS PART OF THE PROOF: the shells the decision covers must be exactly the tools the
 * guard's registration declaration names, so the code cannot cover PowerShell while the settings never
 * run it there — the drift that left SendMessage unguarded for brief-provenance.
 *
 * @es Auto-test. El caso que decide si este guard sobrevive es la forma CORRECTA que el propio rechazo
 * recomienda. Los payloads salen de `~/.claude/hook-payloads/` (PowerShell capturado), las expectativas de
 * PowerShell son los códigos MEDIDOS en 5.1, y el cableado es parte de la prueba.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'guard.mjs');
const { payloadFor } = await import(pathToFileURL(join(homedir(), '.claude', 'hook-payloads', 'payloads.mjs')).href);

// `input` carries the call's OWN fields — `timeout`, `run_in_background` — which real payloads were
// measured to hold (`.claude/gate-run/state/refusals.jsonl` journals both, verbatim from the harness),
// and which a call that declares neither simply omits, exactly as the recording does.
// @es `input` lleva los campos propios de la llamada (`timeout`, `run_in_background`), medidos en
// payloads REALES del journal de `gate-run`; una llamada que no los declara simplemente no los trae.
const bash = (command, input) => JSON.stringify(payloadFor('Bash', command, { sessionId: 'selftest', input }));
const powershell = (command, input) => JSON.stringify(payloadFor('PowerShell', command, { sessionId: 'selftest', input }));

const cases = [
  // --- BASH, REFUSED: the shape that destroyed five gate readings, in the spellings it arrived in.
  ['deny', bash('npm run build:ci-pr >> "$out" 2>&1; echo "EXIT=$?" >> "$out"'), 'REAL CASE: the exact shape used all day', 'EXIT-CODE GUARD REFUSED'],
  ['deny', bash('npm ci >> log.txt 2>&1; echo "REAL_NPM_CI_EXIT=$?" >> log.txt'), 'the npm ci variant'],
  ['deny', bash('rm -f "$out"\nnpm test\necho "EXIT=$?" >> "$out"'), 'newline-separated, echo last'],
  ['deny', bash('npm run lint > out 2>&1; printf "code=%s\\n" "$?" >> out'), 'printf instead of echo'],

  // --- BASH, ALLOWED. These outnumber the refusals: a false positive here kills the guard.
  ['allow', bash('npm run build:ci-pr >> "$out" 2>&1; code=$?; echo "EXIT=$code" >> "$out"; exit $code'), 'THE ONE THAT MATTERS — the correct shape the refusal itself recommends'],
  ['allow', bash('npm run build:ci-pr'), 'the bare command, nothing after it'],
  ['allow', bash('npm run build >> "$out" 2>&1'), 'redirected, nothing after it'],
  ['allow', bash('npm run lint && echo "lint clean"'), '`&&` binds the status — the failure still propagates'],
  ['allow', bash('npm test || echo "tests failed"'), '`||` likewise'],
  ['allow', bash('echo "$? was the last status"'), 'a lone echo discards nothing — no preceding command'],
  ['allow', bash('git status --porcelain; git log --oneline -1'), 'two commands, no echo of $?'],
  ['allow', bash('echo "starting"; npm run build'), 'echo FIRST, real command last'],
  ['allow', bash('npm run check:api; echo "done"'), 'a trailing echo that does not read $?'],

  // --- POWERSHELL, REFUSED: each row is a MEASURED exit 0 over a failure (status-echo.mjs).
  ['deny', powershell('npm run build:ci-pr *> out.txt; Write-Output "EXIT=$LASTEXITCODE"'), 'REAL SHAPE: Write-Output of $LASTEXITCODE — measured exit 0 over a 7', 'PowerShell'],
  ['deny', powershell('npm test; echo $LASTEXITCODE'), 'echo alias of the bare variable'],
  ['deny', powershell('npm test; "EXIT=$LASTEXITCODE"'), 'a bare string is output too — measured exit 0'],
  ['deny', powershell('npm test; Write-Host "EXIT=$LASTEXITCODE"'), 'Write-Host'],
  ['deny', powershell('Get-Item C:\\missing; Write-Output "ok=$?"'), '$? after a cmdlet — measured exit 0'],
  ['deny', powershell('npm test\nWrite-Output "EXIT=$LASTEXITCODE"'), 'newline-separated — measured exit 0'],
  ['deny', powershell('npm test *> log.txt; Add-Content log.txt "EXIT=$LASTEXITCODE"'), 'Add-Content, the logging idiom'],
  ['deny', powershell('npm test; WRITE-OUTPUT "EXIT=$LastExitCode"'), 'NEAR MISS: case does not matter to PowerShell, so it does not matter here'],
  ['deny', powershell('npm test; $LASTEXITCODE'), 'the bare variable as the last statement'],

  // --- POWERSHELL, ALLOWED.
  ['allow', powershell('npm test *> log.txt; $code = $LASTEXITCODE; Add-Content log.txt "EXIT=$code"; exit $code'), 'THE ONE THAT MATTERS — the correct shape, measured exit 7'],
  ['allow', powershell('npm test; if ($?) { Write-Output "ok=$?" }'), 'NEAR MISS: a guarded block preserves the failure — measured exit 1, so it must not be refused'],
  ['allow', powershell('npm test; if ($LASTEXITCODE -ne 0) { Write-Output "failed=$LASTEXITCODE"; exit $LASTEXITCODE }'), 'a `;` inside braces does not end the statement'],
  ['allow', powershell('Write-Output "a;b $LASTEXITCODE"'), 'a `;` inside quotes does not split — and a lone print hides nothing'],
  ['allow', powershell('npm test'), 'the bare command'],
  ['allow', powershell('Write-Output "starting"; npm test'), 'print FIRST, real command last'],
  ['allow', powershell('npm test; Write-Output "done"'), 'a trailing print that does not read a status variable'],
  ['allow', powershell('npm test `\n  --silent; exit $LASTEXITCODE'), 'a backtick line continuation is not a separator'],

  // --- BASH, REFUSED: `$?` read about a PIPELINE, whose failure bash has already thrown away.
  //     (`measurement-failure-is-not-a-zero`: `npm view … | head -5; echo exit=$?` printed exit=0.)
  ['deny', bash('npm view @base100/b100-am-ui version 2>&1 | head -5; code=$?; echo "npm=$code"'), 'REAL CASE: the registry probe, with the code kept in a variable so only the pipeline decides it', 'PIPELINE'],
  ['deny', bash('rg --files-with-matches token src | head -3; if [ $? -ne 0 ]; then echo none; fi'), '`[ $? … ]` after a pipeline — a test of the wrong member'],
  ['deny', bash('npm run lint | tee lint.log | tail -2; code=$?; exit $code'), 'three members: the status is `tail`\'s'],

  // --- BASH, ALLOWED: the two repairs the refusal names, and the mentions that are not readings.
  ['allow', bash('set -o pipefail; npm view pkg version | head -5; code=$?; echo "npm=$code"'), 'THE ONE THAT MATTERS — `pipefail` makes `$?` a real measurement (measured: 1, not 0)'],
  ['allow', bash('npm run lint | tee lint.log; code=${PIPESTATUS[0]}; echo "lint=$code"'), 'THE OTHER REPAIR — `${PIPESTATUS[0]}` reads the member that matters (measured: 1)'],
  ['allow', bash('set -euo pipefail\nnpm test | tee out.log\ncode=$?'), '`pipefail` inside a combined `set -euo`'],
  ['allow', bash('npm test > out.log 2>&1; code=$?; echo "test=$code"; exit $code'), 'no pipeline at all — the correct logging shape stays allowed'],
  ['allow', bash('npm run build > b.log 2>&1; npm test > t.log 2>&1; code=$?; echo "test=$code"'), 'THE COMMON SHAPE: two plain commands, the status of the second read in third position'],
  ['allow', bash('npm test | tee out.log | printf "test=%s\\n" "$?"'), 'NEAR MISS: the reader is itself a pipeline member, so its `$?` is the status of the statement BEFORE the pipeline — a different question, not this one'],
  ['allow', bash('rg pattern src | head -3; git log --oneline --grep "reads $? after a pipe" -5'), 'NEAR MISS: `$?` MENTIONED by a command that does not consume a status'],
  ['allow', bash("cat <<'EOF' > note.txt\nnpm view pkg | head -5; code=$?\nEOF"), 'DATA, NOT COMMAND: the shape inside a heredoc body is being written, not run'],
  ['allow', bash('npm test | tee out.log'), 'a pipeline with nothing reading a status'],
  ['allow', bash('npm run lint | tee a.log; npm run typecheck | tee b.log'), 'two pipelines, no status read'],
  ['allow', powershell('npm test | Out-Null; $code = $LASTEXITCODE; exit $code'), 'MEASURED on PowerShell 5.1: $LASTEXITCODE survives the pipeline (7), so refusing it would redden correct work'],

  // --- REFUSED: a hook-running git operation on a clock shorter than this repository's hooks.
  ['deny', bash('git cherry-pick --continue'), 'REAL CASE 2026-09-07: killed mid-hook, reported exit=128 over a pick that had succeeded', "runs this repository's git hooks"],
  ['deny', bash('git commit -m "fix(table): keep the sort stable"'), 'a plain commit under the harness default'],
  ['deny', bash('cd "C:/Users/adrian.jimenez/Desktop/Projects/b100-am-ui" && git merge --no-ff feature/x'), 'a merge commit runs the same hooks'],
  ['deny', bash('git commit -m "x"', { timeout: 120_000 }), 'NEAR MISS: a timeout declared EXPLICITLY, and still the killing default'],
  ['deny', powershell('git rebase --continue'), 'the same operation from the PowerShell tool'],

  // --- ALLOWED: every way the operation is already safe, plus the ones that run no hooks.
  ['allow', bash('git commit -m "fix(table): keep the sort stable"', { timeout: 600_000 }), 'THE ONE THAT MATTERS — the remedy the refusal names'],
  ['allow', bash('git commit -m "x"', { timeout: 300_000 }), 'BOUNDARY: exactly the minimum is enough'],
  ['allow', bash('git cherry-pick --continue', { run_in_background: true }), 'a background run is not bound by that clock'],
  ['allow', bash('git commit --no-verify -m "emergency"'), "NEAR MISS: git's own way of saying «no hooks»"],
  ['allow', bash('git cherry-pick --abort'), '`--abort` makes no commit'],
  ['allow', bash('git rebase --skip'), '`--skip` likewise'],
  ['allow', bash('git commit --dry-run --short'), '`--dry-run` commits nothing, so no hook runs'],
  ['allow', bash('git cherry-pick 4703f612'), 'MEASURED: a CLEAN pick never reaches `pre-commit` — git runs it only for `git commit`'],
  ['allow', bash('git status --porcelain; git log --oneline -3'), 'reads that run no hook'],
  ['allow', bash('echo "git commit -m x" >> runbook.md'), 'DATA, NOT COMMAND: a commit mentioned in an echoed string'],
  ['allow', bash('echo git commit -m "$message" >> runbook.md'), 'DATA, NOT COMMAND: the words are unquoted, and only COMMAND POSITION decides'],
  ['allow', bash("cat <<'EOF' >> runbook.md\ngit commit -m \"then commit\"\nEOF"), 'DATA, NOT COMMAND: a commit inside a heredoc body'],
  ['allow', bash('npm run build'), 'a long command that runs no git hook is none of this guard\'s business'],

  // --- NOT A SHELL COMMAND: outside the decision.
  ['allow', JSON.stringify(payloadFor('SendMessage', 'cmd; echo "EXIT=$?"', { sessionId: 'selftest' })), 'a message mentioning the shape is not running it'],
  ['allow', JSON.stringify({ ...payloadFor('Bash', '', { sessionId: 'selftest' }), tool_input: {} }), 'no command at all'],

  // --- FAIL-OPEN.
  ['allow', 'NOT JSON AT ALL', 'garbage payload'],
  ['allow', '', 'empty payload'],
  ['allow', '﻿NOT JSON', 'BOM + garbage']
];

let failures = 0;
let total = 0;

/** Records one outcome and prints it. @es Registra un resultado y lo imprime. */
function report(ok, line) {
  total += 1;

  if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

for (const [expected, input, label, expectedText] of cases) {
  let output = '';
  let code = 0;

  try {
    output = execFileSync('node', [GUARD], { input, encoding: 'utf8' });
  } catch (error) {
    code = error.status;
    output = error.stdout ?? '';
  }

  const actual = output.includes('"deny"') ? 'deny' : 'allow';
  const textOk = expectedText === undefined || output.includes(expectedText);

  report(actual === expected && code === 0 && textOk, `expected=${expected} actual=${actual} exit=${code}  ${label}${textOk ? '' : `  [the refusal never named: ${expectedText}]`}`);
}

// --- THE HOOK PREMISE, measured per repository: the refusal claims hooks run, so it must only speak
// where they do. Constructed repositories, one per state of `commitHooksOf`.
// @es LA PREMISA DE LOS HOOKS, medida por repositorio: la negativa afirma que corren hooks, así que solo
// puede hablar donde corren. Un repositorio construido por cada estado.
const sandbox = mkdtempSync(join(tmpdir(), 'exit-code-hooks-'));

try {
  const repoWith = (name, setup) => {
    const repo = join(sandbox, name);

    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init', '--quiet', repo]);
    setup(repo);

    return repo;
  };
  const noHooks = repoWith('no-hooks', (repo) => rmSync(join(repo, '.git', 'hooks'), { recursive: true, force: true }));
  const samplesOnly = repoWith('samples-only', (repo) => {
    mkdirSync(join(repo, '.git', 'hooks'), { recursive: true });
    writeFileSync(join(repo, '.git', 'hooks', 'pre-commit.sample'), '#!/bin/sh\n');
  });
  const preCommit = repoWith('pre-commit', (repo) => writeFileSync(join(repo, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\n'));
  const hooksPath = repoWith('hooks-path', (repo) => {
    mkdirSync(join(repo, '.husky', '_'), { recursive: true });
    writeFileSync(join(repo, '.husky', '_', 'commit-msg'), '#!/bin/sh\n');
    execFileSync('git', ['-C', repo, 'config', 'core.hooksPath', '.husky/_']);
  });
  const commitIn = (cwd) => JSON.stringify({ ...payloadFor('Bash', 'git commit -m "x"', { sessionId: 'selftest' }), cwd });
  const verdictIn = (cwd) => (execFileSync('node', [GUARD], { input: commitIn(cwd), encoding: 'utf8' }).includes('"deny"') ? 'deny' : 'allow');

  report(verdictIn(noHooks) === 'allow', 'a repository without a hooks folder runs no hook: a commit on the default clock is allowed');
  report(verdictIn(samplesOnly) === 'allow', 'only *.sample templates, which git never runs: allowed');
  report(verdictIn(preCommit) === 'deny', 'a real pre-commit hook: refused');
  report(verdictIn(hooksPath) === 'deny', 'a commit-msg hook reached through core.hooksPath (the husky layout): refused');
  report(verdictIn(join(sandbox, 'does-not-exist')) === 'deny', 'a directory that does not exist keeps the refusal, never reads as "no hooks"');

  const notARepository = join(sandbox, 'not-a-repository');

  mkdirSync(notARepository);
  report(verdictIn(notARepository) === 'deny', 'an existing folder git cannot answer for keeps the refusal, never reads as "no hooks"');
  report(execFileSync('node', [GUARD], { input: commitIn(preCommit), encoding: 'utf8' }).includes('pre-commit'), 'the refusal names the hooks it measured');
} catch (error) {
  report(false, `the hook-premise fixtures could not be built: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

// --- THE WIRING: the shells the decision covers are exactly the tools the declaration registers.
let shells;

try {
  ({ SHELLS: shells } = await import('./status-echo.mjs'));
} catch (error) {
  report(false, `the decision module could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
}

let declared;

try {
  const declaration = JSON.parse(readFileSync(join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));

  declared = new Set(String(declaration.registrations.find((one) => one.event === 'PreToolUse')?.matcher ?? '').split('|'));
} catch (error) {
  report(false, `the registration declaration is unreadable: ${error instanceof Error ? error.message : String(error)}`);
}

if (shells !== undefined && declared !== undefined) {
  for (const tool of Object.keys(shells)) report(declared.has(tool), `the declaration registers ${tool}, which the decision covers`);

  for (const tool of declared) report(Object.hasOwn(shells, tool), `the decision covers ${tool}, which the declaration registers`);
}

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
