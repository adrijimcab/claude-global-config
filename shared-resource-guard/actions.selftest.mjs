#!/usr/bin/env node
/**
 * Self-test for the control-action recognisers (start, stop, reconfigure) of the shared-resource guard.
 *
 * THE STATE SPACE, enumerated from the three decisions:
 *   - START: the executable plus the pattern words decide; spelling variants of the same entry point
 *     (`./bin/www`, an absolute path, `node.exe`, an env prefix, a launcher such as `npx` or PowerShell
 *     `Start-Process`) all start; reading the entry point (`cat`, `bat`), a near miss (`mybin/www`), a
 *     mention (`echo`, a commit message, a heredoc) and a command in ANOTHER checkout when the resource
 *     declares a `home` do not. A directory the `cd` cannot reveal counts as a match.
 *   - STOP: by PORT (`:PORT`, a flag, `kill-port`), by PID (resolved against the LIVE listener table: this
 *     very process listens on the declared port, so its own PID is the shared resource's PID), by NAME (a
 *     declared process name, a start path, a multi-word pattern), and the UNRESOLVABLE targets (`$pid`,
 *     `$(...)`, a pipe) judged on the whole script. The worker's own processes are never matched.
 *   - RECONFIGURE: prefix assignment, `export`, `set`, `setx`, `declare`, `$env:`, `Set-Item Env:`,
 *     `SetEnvironmentVariable`; reading the variable and carrying its name as data do not.
 *   - USING the resource (curl, netstat, lsof, Get-NetTCPConnection, tail) is none of the three.
 *
 * @es Auto-test de los reconocedores de acciones de control. Estados: ARRANCAR (variantes de grafía, lanzadores,
 * lectura, casi-aciertos, menciones, otro checkout con `home`), DETENER (por puerto, por PID contra la tabla
 * VIVA de escuchas, por nombre, objetivos no resolubles), REPROGRAMAR (asignar vs leer) y USAR (ninguna).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { ACTION_KINDS, controlActions } from './control-actions.mjs';
import { pidsListeningOn } from './listeners.mjs';

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

// --- CONSTRUCTED STATE: this process LISTENS on the declared port --------------------------------
const server = http.createServer((_request, response) => response.end('ok'));

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const PORT = server.address().port;
const MY_PID = String(process.pid);
const OTHER_PID = '99999999';
const root = mkdtempSync(path.join(os.tmpdir(), 'control-actions-'));
const HOME = path.join(root, 'app');
const ELSEWHERE = path.join(root, 'elsewhere');
const forward = (value) => value.split(path.sep).join('/');

const PROD = {
  name: 'local-prod',
  description: 'shared local PROD',
  ports: [PORT],
  startCommands: [['node', 'bin/www'], ['nodemon', 'bin/www']],
  processNames: ['nodemon'],
  reconfiguredBy: ['FRT_URL'],
  home: undefined
};
const APP = { name: 'app', description: 'an app with a home', startCommands: [['npm', 'start'], ['node', 'server/main.js']], home: HOME };
const REAL = (port) => pidsListeningOn(port);

/** The `kind@resource` list a line performs, sorted. @es La lista `tipo@recurso` que hace una línea. */
function kindsOf(script, { dialect = 'bash', cwd = ELSEWHERE, resources = [PROD, APP], listeners = REAL } = {}) {
  return controlActions(script, dialect, cwd, resources, listeners).map((action) => `${action.kind}@${action.resource}`).sort();
}

function expectKinds(label, script, expected, options) {
  const actual = kindsOf(script, options);
  const wanted = [...expected].sort();

  check(label, actual.join(',') === wanted.join(','), `line: ${script}\n       expected [${wanted}] got [${actual}]`);
}

const START = `${ACTION_KINDS.START}@local-prod`;
const STOP = `${ACTION_KINDS.STOP}@local-prod`;
const RECONFIGURE = `${ACTION_KINDS.RECONFIGURE}@local-prod`;

try {
  // --- THE PREMISE: the live listener table sees this process --------------------------------------
  check('premise: the live table lists this process as the listener of the declared port', REAL(PORT).has(MY_PID), `listeners: ${[...REAL(PORT)]}`);
  check('premise: a port nobody listens on has no listener', REAL(1).size === 0);
  check('listeners fail open: a runner that throws gives an empty set', pidsListeningOn(PORT, process.platform, () => { throw new Error('boom'); }).size === 0);
  check('listeners on a Unix-like platform read lsof output', pidsListeningOn(PORT, 'linux', () => ({ stdout: '4242\n77\n' })).has('77'));
  check('listeners on Windows ignore a line that is not LISTENING', pidsListeningOn(3100, 'win32', () => ({ stdout: '  TCP    0.0.0.0:3100   0.0.0.0:0   ESTABLISHED   55\n' })).size === 0);
  check('listeners on Windows ignore another port that merely ends alike', pidsListeningOn(100, 'win32', () => ({ stdout: '  TCP    0.0.0.0:3100   0.0.0.0:0   LISTENING   55\n' })).size === 0);
  check('listeners on Windows read the PID of the LISTENING line', pidsListeningOn(3100, 'win32', () => ({ stdout: '  TCP    0.0.0.0:3100   0.0.0.0:0   LISTENING   55\r\n' })).has('55'));

  // --- START ---------------------------------------------------------------------------------------
  for (const line of ['node bin/www', 'node ./bin/www', 'node C:/somewhere/bin/www', 'node.exe bin/www', 'NODE_ENV=x node bin/www &', 'nodemon ./bin/www', 'npx nodemon ./bin/www', 'cd sub && node bin/www', 'bash -c "node bin/www"', '(node bin/www)', 'node --inspect bin/www', 'echo $(node bin/www)']) {
    expectKinds(`start: ${line}`, line, [START]);
  }

  expectKinds('start: PowerShell Start-Process', 'Start-Process node -ArgumentList bin/www', [START], { dialect: 'powershell' });
  expectKinds('start: PowerShell call operator', '& node bin/www', [START], { dialect: 'powershell' });
  expectKinds('start with a reconfiguring prefix is both', 'FRT_URL=http://localhost:4300 node bin/www', [START, RECONFIGURE]);

  for (const line of ['cat bin/www', 'bat bin/www', 'node bin/other', 'node mybin/www', 'echo node bin/www', 'git commit -m "node bin/www"', 'cat <<EOF\nnode bin/www\nEOF', 'node', 'www', 'npm start']) {
    expectKinds(`not a start: ${line.replace('\n', ' / ')}`, line, []);
  }

  expectKinds('home: npm start inside the home starts it', `cd ${forward(HOME)} && npm start`, [`${ACTION_KINDS.START}@app`]);
  expectKinds('home: npm start in a subdirectory of the home starts it', `cd ${forward(HOME)}/sub && npm start`, [`${ACTION_KINDS.START}@app`]);
  expectKinds('home: npm start in another checkout is not the shared one', `cd ${forward(ELSEWHERE)} && npm start`, []);
  expectKinds('home: a directory the cd cannot reveal counts as a match', 'cd $SOMEWHERE && npm start', [`${ACTION_KINDS.START}@app`]);
  expectKinds('home: the entry point by absolute path starts it from anywhere', `node ${forward(HOME)}/server/main.js`, [`${ACTION_KINDS.START}@app`]);
  expectKinds('home: the entry point by relative path from the home starts it', 'node server/main.js', [`${ACTION_KINDS.START}@app`], { cwd: HOME });
  expectKinds('home: the same relative entry point from another checkout does not', 'node server/main.js', []);
  expectKinds('home: a sibling directory that shares the home prefix is not inside it', `cd ${forward(HOME)}-copy && npm start`, []);

  // --- STOP: by PID (live table) -------------------------------------------------------------------
  for (const line of [`kill ${MY_PID}`, `kill -9 ${MY_PID}`, `taskkill /F /PID ${MY_PID}`, `taskkill //F //PID ${MY_PID}`, `taskkill /PID ${MY_PID} /T /F`, `echo x | xargs kill ${MY_PID}`]) {
    expectKinds(`stop by listening pid: ${line}`, line, [STOP]);
  }

  expectKinds('stop by listening pid: PowerShell Stop-Process -Id', `Stop-Process -Id ${MY_PID} -Force`, [STOP], { dialect: 'powershell' });
  expectKinds('a pid that listens on nothing declared is not the resource', `kill ${OTHER_PID}`, []);
  expectKinds('taskkill of another pid is not the resource', `taskkill /F /PID ${OTHER_PID}`, []);
  expectKinds('with no listener table the pid cannot be attributed (fails open)', `kill ${MY_PID}`, [], { listeners: () => new Set() });

  // --- STOP: by port -------------------------------------------------------------------------------
  for (const line of [`kill $(lsof -ti :${PORT})`, `pid=$(lsof -ti :${PORT}); kill -9 $pid`, `npx kill-port ${PORT}`, `kill-port ${PORT}`, `netstat -ano | findstr :${PORT} | xargs taskkill /F /PID`, `kill $(lsof -ti tcp:${PORT})`, `fuser -k ${PORT}/tcp; kill $!`]) {
    expectKinds(`stop by port: ${line}`, line, [STOP], { listeners: () => new Set() });
  }

  expectKinds('stop by port: PowerShell pipeline', `Get-NetTCPConnection -LocalPort ${PORT} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`, [STOP], { dialect: 'powershell' });
  expectKinds('stop by port: PowerShell parenthesised lookup', `Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess`, [STOP], { dialect: 'powershell' });
  expectKinds('stop by port: PowerShell variable lookup', `$p = (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess; Stop-Process -Id $p`, [STOP], { dialect: 'powershell' });
  expectKinds('a port that only looks alike is not the resource', `kill $(lsof -ti :${PORT}1)`, []);
  expectKinds('a bare number after a non-port flag is a pid, not a port', `kill -s ${PORT}`, [], { listeners: () => new Set() });

  // --- STOP: by name -------------------------------------------------------------------------------
  for (const line of ['pkill nodemon', 'killall nodemon', 'taskkill /F /IM nodemon.exe', 'pkill -f bin/www', 'pkill -f "node bin/www"', 'pkill -f ./bin/www']) {
    expectKinds(`stop by name: ${line}`, line, [STOP]);
  }

  expectKinds('stop by name: PowerShell Stop-Process -Name', 'Stop-Process -Name nodemon', [STOP], { dialect: 'powershell' });
  expectKinds('stop by name: PowerShell pipeline from Get-Process', 'Get-Process nodemon | Stop-Process', [STOP], { dialect: 'powershell' });
  expectKinds('a multi-word pattern with only the bare name narrows nothing down', 'pkill -f "nodemon my-own-script.js"', []);
  expectKinds('a name that is not declared is not the resource', 'killall node', []);

  // --- STOP: the worker's own processes, and unresolvable targets that name nothing declared ------
  for (const line of ['pkill -f "ng serve"', 'kill $!', 'kill $(lsof -ti :4300)', 'taskkill /F /PID 4321', 'kill %1', 'echo "taskkill /PID 1"']) {
    expectKinds(`own process, no match: ${line}`, line, [], { listeners: () => new Set() });
  }

  expectKinds('own process, PowerShell Stop-Process -Name ng', 'Stop-Process -Name ng', [], { dialect: 'powershell' });
  expectKinds('documented tradeoff: an unresolvable stop beside a mention of the port is attributed', `curl localhost:${PORT}/x; kill $!`, [STOP], { listeners: () => new Set() });
  expectKinds('a mention of the port in data is not a stop', `echo "kill ${MY_PID}"`, []);

  // --- USING the resource is none of the three -----------------------------------------------------
  for (const line of [`curl localhost:${PORT}/api/project`, `curl -s -X POST http://localhost:${PORT}/login/signIn`, `netstat -ano | findstr :${PORT}`, `lsof -ti :${PORT}`, 'tail -f nodemon.log', 'ps aux | grep nodemon', 'cat start/default-app.js', `npx playwright test --config pw.config.ts # port ${PORT}`]) {
    expectKinds(`use only: ${line}`, line, []);
  }

  expectKinds('use only: PowerShell Get-NetTCPConnection', `Get-NetTCPConnection -LocalPort ${PORT}`, [], { dialect: 'powershell' });
  expectKinds('use only: PowerShell Invoke-WebRequest', `Invoke-WebRequest http://localhost:${PORT}/`, [], { dialect: 'powershell' });

  // --- RECONFIGURE ---------------------------------------------------------------------------------
  for (const line of ['FRT_URL=http://localhost:4300 echo hi', 'export FRT_URL=http://localhost:4300', 'declare -x FRT_URL=x', 'set FRT_URL=x', 'setx FRT_URL http://localhost:4300', 'env FRT_URL=x ls', 'frt_url=x ls', 'FRT_URL=x', 'export A=1 FRT_URL=2']) {
    expectKinds(`reconfigure: ${line}`, line, [RECONFIGURE]);
  }

  for (const line of ["$env:FRT_URL = 'http://x'", "$env:FRT_URL='http://x'", "$env:FRT_URL += ';x'", 'Set-Item Env:FRT_URL http://x', 'Set-Item -Path Env:FRT_URL -Value x', 'Remove-Item Env:FRT_URL', "[Environment]::SetEnvironmentVariable('FRT_URL','http://x','User')"]) {
    expectKinds(`reconfigure (PowerShell): ${line}`, line, [RECONFIGURE], { dialect: 'powershell' });
  }

  for (const line of ['echo $FRT_URL', 'printenv FRT_URL', 'curl -d FRT_URL=x http://example.invalid', 'echo FRT_URL=x', 'FRT_URLS=x ls', 'OTHER=x ls', 'export PATH=x', 'git commit -m "export FRT_URL=x"']) {
    expectKinds(`not a reconfigure: ${line}`, line, []);
  }

  for (const line of ['echo $env:FRT_URL', 'Get-ChildItem Env:FRT_URL', 'Get-Item Env:FRT_URL', "$env:FRT_URL_OTHER = 'x'", "[Environment]::SetEnvironmentVariable('OTHER','x','User')", "[Environment]::GetEnvironmentVariable('FRT_URL')"]) {
    expectKinds(`not a reconfigure (PowerShell): ${line}`, line, [], { dialect: 'powershell' });
  }

  // --- THE SHAPE OF AN ACTION ----------------------------------------------------------------------
  const [action] = controlActions('FRT_URL=zz-marker ls', 'bash', ELSEWHERE, [PROD], REAL);

  check('an action names the resource, its description, the kind, the detail and the command text', action.resource === 'local-prod' && action.description === 'shared local PROD' && action.kind === 'reconfigure' && action.detail.includes('FRT_URL') && action.text === 'FRT_URL=zz-marker ls');
  check('a line with no resources yields no actions', controlActions('node bin/www', 'bash', ELSEWHERE, [], REAL).length === 0);
  check('an unknown dialect yields no actions', controlActions('node bin/www', 'fish', ELSEWHERE, [PROD], REAL).length === 0);
  check('the listener table is asked once per port, however many pids are checked', (() => {
    let asked = 0;

    controlActions(`kill 1 2 3 4 5`, 'bash', ELSEWHERE, [PROD], () => { asked += 1; return new Set(); });

    return asked === 1;
  })());
} finally {
  server.close();
  rmSync(root, { recursive: true, force: true });
}

process.stdout.write(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed === 0 ? 0 : 1);
