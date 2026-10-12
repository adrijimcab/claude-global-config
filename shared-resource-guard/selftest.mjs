#!/usr/bin/env node
/**
 * Self-test for shared-resource-guard (2026-10-12 incident: a delegated writer restarted and stopped the
 * shared local PROD and its guard).
 *
 * THE STATE SPACE, on projects CONSTRUCTED here, never on a real one:
 *   - WHO CALLS: a subagent by `agent_id`, a subagent known only by its transcript directory, the main
 *     session. The main session is allowed every form, even with an unusable declaration.
 *   - WHAT THE PROJECT DECLARES: a valid file; no file (the project is untouched); an unusable file (JSON
 *     that does not parse, a schema problem) which refuses a worker with every reason.
 *   - WHERE THE WORKER STANDS: the project directory, a subdirectory, a `/.claude/worktrees/...` checkout
 *     (the git-ignored `.claude/` does not exist there), and a directory outside the project reached
 *     through `CLAUDE_PROJECT_DIR`.
 *   - WHAT THE WORKER DOES, as a worker: START (the incident's own command, with `FRT_URL`), STOP by port,
 *     by the live PID of the listener (this process listens on the declared port) and by a PID lookup in
 *     one line, RECONFIGURE (`export`, prefix, `$env:`), and USE (curl, netstat, reading the variable,
 *     a mention as data), which passes.
 *   - THE SHAPE OF THE OUTPUT: `deny`, English first, ` @es ` Spanish with accents, naming the resource,
 *     the offending command and the orchestrator; a non-shell tool, no command, malformed JSON, a BOM, a
 *     decision that throws (fails open) and the real process (the shim) with stdin and stdout.
 *
 * @es Auto-test de shared-resource-guard. Estados, sobre proyectos CONSTRUIDOS aquí: quién llama (subagente
 * por `agent_id`, por transcript, sesión principal), qué declara el proyecto (fichero válido, ninguno,
 * inservible), dónde está el worker (proyecto, subdirectorio, worktree, fuera por `CLAUDE_PROJECT_DIR`), qué
 * hace (ARRANCAR, DETENER por puerto, por PID vivo y por búsqueda de PID, REPROGRAMAR, USAR) y la forma de la
 * salida (deny bilingüe, falla abierto, el proceso real).
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { messageProblems } from '../bilingual-output/message.mjs';
import { dispatch } from '../hook-dispatch/dispatch.mjs';
import { payloadFor } from '../hook-payloads/payloads.mjs';
import { isolateState } from '../hook-state/locations.mjs';
import { evaluate } from './guard.mjs';
import { MESSAGES } from './refusal.mjs';

isolateState('shared-resource-guard');
delete process.env.CLAUDE_PROJECT_DIR; // hermetic: the harness running this proof must not pick the project

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'guard.mjs');

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${label}\n`);
  } else {
    failed += 1;
    process.stdout.write(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}\n`);
  }
}

// --- CONSTRUCTED STATE ---------------------------------------------------------------------------
const server = http.createServer((_request, response) => response.end('ok'));

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const PORT = server.address().port;
const MY_PID = process.pid;
const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'shared-resource-guard-')));
const forward = (value) => value.split(path.sep).join('/');

const DECLARATION = {
  schemaVersion: 1,
  resources: [
    { name: 'local-prod', description: 'the shared local PROD, used by every writer at once', ports: [PORT], startCommands: [['node', 'bin/www']], reconfiguredBy: ['FRT_URL'] }
  ]
};

function project(name, content) {
  const dir = path.join(root, name);

  mkdirSync(path.join(dir, '.claude'), { recursive: true });
  if (content !== undefined) writeFileSync(path.join(dir, '.claude', 'shared-resources.json'), content);

  return dir;
}

const declared = project('declared', JSON.stringify(DECLARATION));
const undeclared = project('undeclared');
const broken = project('broken', '{ not json');
const misspelt = project('misspelt', JSON.stringify({ ...DECLARATION, resourcez: [] }));
const subdirectory = path.join(declared, 'src', 'deep');
const worktree = path.join(declared, '.claude', 'worktrees', 'writer-1');
const outside = path.join(root, 'outside');

mkdirSync(subdirectory, { recursive: true });
mkdirSync(worktree, { recursive: true });
mkdirSync(outside, { recursive: true });

function asSubagent(tool, command, cwd) {
  return { ...payloadFor(tool, command, { sessionId: 'selftest' }), cwd };
}

function asMain(tool, command, cwd) {
  const { agent_id: _agentId, agent_type: _agentType, ...rest } = asSubagent(tool, command, cwd);

  return rest;
}

function asTranscriptOnlySubagent(tool, command, cwd) {
  return { ...asMain(tool, command, cwd), transcript_path: 'C:/Users/x/.claude/projects/p/s1/subagents/agent-abc.jsonl' };
}

const verdictOf = (payload) => evaluate(JSON.stringify(payload))?.hookSpecificOutput?.permissionDecision;

function expect(verdict, payload, label) {
  const actual = verdictOf(payload);

  check(`${verdict}: ${label}`, actual === (verdict === 'deny' ? 'deny' : undefined), `got ${String(actual)}`);
}

try {
  // --- WHO CALLS, with the incident's own command ----------------------------------------------
  const INCIDENT = 'FRT_URL=http://localhost:4300 node bin/www';

  expect('deny', asSubagent('Bash', INCIDENT, declared), 'worker by agent_id restarts PROD with its own FRT_URL (the incident)');
  expect('deny', asTranscriptOnlySubagent('Bash', INCIDENT, declared), 'worker known only by its transcript directory');
  expect('allow', asMain('Bash', INCIDENT, declared), 'the orchestrator may start PROD with FRT_URL');
  expect('allow', asMain('Bash', `taskkill /F /PID ${MY_PID}`, declared), 'the orchestrator may stop it by pid');
  expect('allow', asMain('PowerShell', `Get-NetTCPConnection -LocalPort ${PORT} | ForEach-Object { Stop-Process -Id $_.OwningProcess }`, declared), 'the orchestrator may stop it by port (PowerShell)');

  // --- START, STOP, RECONFIGURE, as a worker ---------------------------------------------------
  expect('deny', asSubagent('Bash', 'node bin/www', declared), 'worker starts PROD');
  expect('deny', asSubagent('Bash', 'cd src && node ../bin/www &', declared), 'worker starts PROD from a subdirectory, in the background');
  expect('deny', asSubagent('PowerShell', 'Start-Process node -ArgumentList bin/www', declared), 'worker starts PROD (PowerShell)');
  expect('deny', asSubagent('Bash', `kill $(lsof -ti :${PORT})`, declared), 'worker stops PROD by port');
  expect('deny', asSubagent('Bash', `pid=$(lsof -ti :${PORT}); kill -9 $pid`, declared), 'worker stops PROD by a pid lookup in one line');
  expect('deny', asSubagent('Bash', `taskkill /F /PID ${MY_PID}`, declared), 'worker stops PROD by the LIVE pid of its listener (lookup made in an earlier call)');
  expect('deny', asSubagent('PowerShell', `Stop-Process -Id ${MY_PID} -Force`, declared), 'worker stops PROD by live pid (PowerShell)');
  expect('deny', asSubagent('PowerShell', `Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess`, declared), 'worker stops PROD by a parenthesised lookup (PowerShell)');
  expect('deny', asSubagent('Bash', 'export FRT_URL=http://localhost:4300', declared), 'worker exports FRT_URL');
  expect('deny', asSubagent('PowerShell', "$env:FRT_URL = 'http://localhost:4300'", declared), 'worker sets $env:FRT_URL');
  expect('deny', asSubagent('PowerShell', "[Environment]::SetEnvironmentVariable('FRT_URL','http://x','User')", declared), 'worker sets FRT_URL machine-wide');

  // --- USING the resource, as a worker ---------------------------------------------------------
  for (const line of [`curl -s http://localhost:${PORT}/api/project`, `curl -X POST http://localhost:${PORT}/login/signIn -d '{}'`, `netstat -ano | findstr :${PORT}`, `lsof -ti :${PORT}`, 'echo $FRT_URL', 'printenv FRT_URL', 'tail -n 50 prod.log', 'npx playwright test e2e/login.spec.ts', 'git status', 'echo node bin/www', 'git commit -m "document node bin/www"', 'cat bin/www', `kill ${MY_PID + 1000000}`, 'pkill -f "ng serve"']) {
    expect('allow', asSubagent('Bash', line, declared), `worker uses it: ${line}`);
  }

  expect('allow', asSubagent('PowerShell', `Invoke-WebRequest http://localhost:${PORT}/`, declared), 'worker uses it (PowerShell Invoke-WebRequest)');
  expect('allow', asSubagent('PowerShell', 'echo $env:FRT_URL', declared), 'worker reads FRT_URL (PowerShell)');

  // --- WHAT THE PROJECT DECLARES ---------------------------------------------------------------
  expect('allow', asSubagent('Bash', 'node bin/www', undeclared), 'a project without the file is untouched: start');
  expect('allow', asSubagent('Bash', 'export FRT_URL=x', undeclared), 'a project without the file is untouched: env');
  expect('allow', asSubagent('Bash', 'node bin/www', outside), 'a directory outside any project is untouched');

  expect('deny', asSubagent('Bash', 'ls', broken), 'an unparseable declaration refuses a worker, even for ls');
  expect('deny', asSubagent('Bash', 'ls', misspelt), 'a misspelt key refuses a worker (never read as "absent")');
  expect('allow', asMain('Bash', 'ls', broken), 'the orchestrator is not blocked by an unusable declaration (it can fix it)');
  expect('allow', asMain('Bash', 'ls', misspelt), 'the orchestrator is not blocked by a schema problem either');

  const brokenText = evaluate(JSON.stringify(asSubagent('Bash', 'ls', misspelt)))?.hookSpecificOutput?.permissionDecisionReason ?? '';

  check('the invalid refusal lists the reason and names the file', brokenText.includes('unknown key "resourcez"') && brokenText.includes('shared-resources.json'));
  check('the invalid refusal is bilingual and tells the worker to ask the orchestrator', brokenText.includes('  @es ') && brokenText.includes('orchestrator') && brokenText.includes('orquestador'));

  // --- WHERE THE WORKER STANDS -----------------------------------------------------------------
  expect('deny', asSubagent('Bash', 'node bin/www', subdirectory), 'worker in a subdirectory of the project');
  expect('deny', asSubagent('Bash', 'node bin/www', worktree), 'worker in a /.claude/worktrees/ checkout (no .claude there)');

  process.env.CLAUDE_PROJECT_DIR = declared;
  expect('deny', asSubagent('Bash', 'node bin/www', outside), 'worker outside the project, reached through CLAUDE_PROJECT_DIR');
  delete process.env.CLAUDE_PROJECT_DIR;

  // --- THE SHAPE OF THE OUTPUT -----------------------------------------------------------------
  const refusal = evaluate(JSON.stringify(asSubagent('Bash', INCIDENT, declared)));
  const text = refusal?.hookSpecificOutput?.permissionDecisionReason ?? '';
  const [englishHalf, spanishHalf] = [text.slice(0, text.indexOf('  @es ')), text.slice(text.indexOf('  @es '))];

  check('refusal event is PreToolUse', refusal?.hookSpecificOutput?.hookEventName === 'PreToolUse');
  check('refusal is bilingual: English then " @es " Spanish', text.includes('REFUSED') && text.indexOf('REFUSED') < text.indexOf('@es'));
  check('refusal keeps the Spanish accents', text.includes('RECHAZÓ') && text.includes('POR QUÉ') && text.includes('así'));

  for (const [name, half] of [['English', englishHalf], ['Spanish', spanishHalf]]) {
    check(`refusal names the resource and its description in the ${name} half`, half.includes('"local-prod"') && half.includes('used by every writer at once'));
    check(`refusal names the offending command in the ${name} half`, half.includes(INCIDENT));
    check(`refusal names the incident in the ${name} half`, half.includes('FRT_URL') && half.includes('2026-10-12') && (name === 'English' ? half.includes('lost the backend') : half.includes('perdieron el backend')));
  }

  check('refusal says to ask the orchestrator', englishHalf.includes('ask the orchestrator') && spanishHalf.includes('pídeselo al orquestador'));

  const kindsRefused = new Set();

  for (const [line, kind] of [['node bin/www', 'start'], [`kill $(lsof -ti :${PORT})`, 'stop'], ['export FRT_URL=x', 'reconfigure']]) {
    const reason = evaluate(JSON.stringify(asSubagent('Bash', line, declared)))?.hookSpecificOutput?.permissionDecisionReason ?? '';

    if (reason.includes(`may not ${kind} the shared resource`) && reason.includes('no puede')) kindsRefused.add(kind);
  }

  check('each kind of action has its own refusal wording (start, stop, reconfigure)', kindsRefused.size === 3, [...kindsRefused].join(','));
  check('the message table has no bilingual problems', messageProblems(MESSAGES).length === 0, messageProblems(MESSAGES).join('; '));

  // --- FAILS OPEN ON ITS OWN MALFUNCTION, AND THE TOOLS IT DOES NOT READ ----------------------------
  const throwing = () => { throw new Error('boom'); };

  check('a decision that throws fails open', (() => {
    try {
      return evaluate(JSON.stringify(asSubagent('Bash', 'node bin/www', declared)), throwing) === undefined;
    } catch {
      return false;
    }
  })());

  check('a non-shell tool is not this guard\'s business', verdictOf({ ...asSubagent('Bash', 'node bin/www', declared), tool_name: 'Read' }) === undefined);
  check('a payload with no command passes', verdictOf({ ...asSubagent('Bash', 'x', declared), tool_input: {} }) === undefined);
  check('malformed JSON passes (fails open)', evaluate('{not json') === undefined);
  check('a BOM-prefixed payload is read', evaluate(`\uFEFF${JSON.stringify(asSubagent('Bash', 'node bin/www', declared))}`)?.hookSpecificOutput?.permissionDecision === 'deny');

  // --- THE SHIM: the real process, stdin in, stdout out ---------------------------------------------
  const run = (input) => spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8', windowsHide: true, env: { ...process.env, CLAUDE_PROJECT_DIR: '' } });
  const viaShim = run(JSON.stringify(asSubagent('Bash', INCIDENT, declared)));
  const viaShimMain = run(JSON.stringify(asMain('Bash', INCIDENT, declared)));
  const viaShimPid = run(JSON.stringify(asSubagent('Bash', `taskkill /F /PID ${MY_PID}`, declared)));

  check('shim: a worker start is denied on stdout, exit 0', viaShim.status === 0 && viaShim.stdout.includes('"permissionDecision":"deny"'));
  check('shim: the orchestrator prints nothing, exit 0', viaShimMain.status === 0 && viaShimMain.stdout === '');
  check('shim: a stop by live pid is denied through the real netstat', viaShimPid.status === 0 && viaShimPid.stdout.includes('"deny"'));

  // --- THE DISPATCHER: the guard is registered through a hook-dispatch manifest and its sidecar ----
  const manifest = path.join(root, 'manifest.json');

  writeFileSync(manifest, JSON.stringify({ event: 'PreToolUse', guards: [forward(GUARD)] }));

  const dispatched = async (payload) => (await dispatch(manifest, JSON.stringify(payload))).output?.hookSpecificOutput?.permissionDecision;

  check('dispatcher: a worker Bash start is denied', (await dispatched(asSubagent('Bash', INCIDENT, declared))) === 'deny');
  check('dispatcher: a worker PowerShell stop is denied', (await dispatched(asSubagent('PowerShell', `Stop-Process -Id ${MY_PID}`, declared))) === 'deny');
  check('dispatcher: the orchestrator is allowed', (await dispatched(asMain('Bash', INCIDENT, declared))) === undefined);
  check('dispatcher: a worker only using the resource is allowed', (await dispatched(asSubagent('Bash', `curl -s localhost:${PORT}/`, declared))) === undefined);
  check('dispatcher: a non-shell tool passes', (await dispatched({ ...asSubagent('Bash', INCIDENT, declared), tool_name: 'Read' })) === undefined);
} finally {
  server.close();
  rmSync(root, { recursive: true, force: true });
}

process.stdout.write(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed === 0 ? 0 : 1);
