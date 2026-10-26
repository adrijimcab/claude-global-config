#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `process-control/process-port.mjs`. Liveness runs on a REAL child process that this
 * file starts and kills; the listing parsers run on output CAPTURED from the real tools (Windows
 * `Get-CimInstance`, measured 2026-10-25, and the `ps -eo pid=,ppid=,args=` shape); the real listing runs once
 * with a private profile so PowerShell never writes into the home of whoever runs the proof.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `process-port.mjs`. La vida se prueba con un proceso hijo REAL que este
 * fichero arranca y mata; los analizadores del listado, con salida CAPTURADA de las herramientas reales; el
 * listado real corre una vez con un perfil privado para que PowerShell no escriba en el home de quien corre la prueba.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isAlive, killTree, listProcesses, rowsOfListing, rowsOfPs } from './process-port.mjs';
import { killTree as ownedKillTree } from './kill-tree.mjs';

const results = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

/** The value of `run`, or 'THROWS' so a crash is a failed check. @es El valor, o 'THROWS'. */
const attempt = (run) => {
  try {
    return run();
  } catch {
    return 'THROWS';
  }
};

const encoded = (text) => Buffer.from(text, 'utf8').toString('base64');
const errorWith = (code) => () => {
  throw Object.assign(new Error(code), { code });
};

const scratch = mkdtempSync(path.join(os.tmpdir(), 'process-port-'));

try {
  // ── liveness: a real child ──
  check('port: killTree is the one owned by kill-tree.mjs', killTree === ownedKillTree, true);

  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });

  check('isAlive: a running child is alive', isAlive(child.pid), true);
  check('isAlive: this very process is alive', isAlive(process.pid), true);

  const exited = new Promise((resolve) => child.once('exit', resolve));

  child.kill();
  await exited;
  check('isAlive: the child is dead after it was killed', isAlive(child.pid), false);
  check('isAlive: a pid that never existed is dead', isAlive(2 ** 31 - 2), false);

  // ── liveness: the error codes (EPERM cannot be provoked by a test process as itself) ──
  check('isAlive: EPERM means alive (it exists, another user owns it)', isAlive(1, errorWith('EPERM')), true);
  check('isAlive: ESRCH means dead', isAlive(1, errorWith('ESRCH')), false);
  check('isAlive: any other error means dead', isAlive(1, errorWith('EINVAL')), false);
  check('isAlive: an error with no code means dead', isAlive(1, () => {
    throw new Error('x');
  }), false);
  check('isAlive: a thrown non-error (null) means dead, never a crash', attempt(() => isAlive(1, () => {
    throw null; // eslint-disable-line no-throw-literal
  })), false);
  check('isAlive: signal 0 is the probe, on the asked pid', (() => {
    const seen = [];

    isAlive(4321, (...args) => seen.push(args));

    return seen;
  })(), [[4321, 0]]);

  // ── the Windows listing, parsed from captured real output ──
  const CAPTURED = '0:0 \r\n4:0 \r\n9872:34772 QzpcV0lORE9XU1xTeXN0ZW0zMlxXaW5kb3dzUG93ZXJTaGVsbFx2MS4wXHBvd2Vyc2hlbGwuZXhl\r\n';

  check('rowsOfListing: captured real output (System rows with empty text, a command line decoded)', attempt(() => rowsOfListing(CAPTURED)), [
    { pid: 0, parentPid: 0, commandLine: '' },
    { pid: 4, parentPid: 0, commandLine: '' },
    { pid: 9872, parentPid: 34772, commandLine: 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' }
  ]);
  check('rowsOfListing: a line with an empty command line is one row with no text', attempt(() => rowsOfListing('7 \r\n')), [{ pid: 7, commandLine: '' }]);
  check('rowsOfListing: a line without the encoded half is one row with no text', attempt(() => rowsOfListing('7')), [{ pid: 7, commandLine: '' }]);
  check('rowsOfListing: every line is a row, decoded from UTF-8', attempt(() => rowsOfListing(`1 ${encoded('a ñ')}\r\n2 ${encoded('b')}\r\n`)), [{ pid: 1, commandLine: 'a ñ' }, { pid: 2, commandLine: 'b' }]);
  check('rowsOfListing: empty output is no rows', attempt(() => rowsOfListing('')), []);
  check('rowsOfListing: a `pid:parent` token is a row with its parent', attempt(() => rowsOfListing(`7:3 ${encoded('x')}`)), [{ pid: 7, parentPid: 3, commandLine: 'x' }]);
  check('rowsOfListing: a non-numeric parent is no parent', attempt(() => rowsOfListing(`7:abc ${encoded('x')}`)), [{ pid: 7, commandLine: 'x' }]);

  check('rowsOfListing: leading blanks and a CR after the parent do not change a row', attempt(() => rowsOfListing(`  7:3\r\n  8:4 ${encoded('y')}  \r\n`)), [{ pid: 7, parentPid: 3, commandLine: '' }, { pid: 8, parentPid: 4, commandLine: 'y' }]);

  // ── the exact command asked of the listing tool, on each platform ──
  const asked = (platform) => {
    const calls = [];

    listProcesses({ marker: 'env' }, (...call) => {
      calls.push(call);

      return { stdout: platform === 'win32' ? `5:1 ${encoded('w')}` : '5 1 p' };
    }, platform);

    return calls.map(([tool, args, options]) => ({ tool, args: args.slice(0, 2), env: options.env, encoding: options.encoding }));
  };

  check('listProcesses: Windows asks PowerShell without its profile, in the given environment', asked('win32'), [{ tool: 'powershell', args: ['-NoProfile', '-Command'], env: { marker: 'env' }, encoding: 'utf8' }]);
  check('listProcesses: POSIX asks ps for pid, parent and arguments, in the given environment', asked('linux'), [{ tool: 'ps', args: ['-eo', 'pid=,ppid=,args='], env: { marker: 'env' }, encoding: 'utf8' }]);
  check('listProcesses: Windows parses the PowerShell rows', attempt(() => listProcesses({}, () => ({ stdout: `5:1 ${encoded('w')}` }), 'win32')), [{ pid: 5, parentPid: 1, commandLine: 'w' }]);
  check('listProcesses: POSIX parses the ps rows', attempt(() => listProcesses({}, () => ({ stdout: '5 1 p' }), 'linux')), [{ pid: 5, parentPid: 1, commandLine: 'p' }]);
  check('listProcesses: a Windows tool that printed nothing is no rows', attempt(() => listProcesses({}, () => ({}), 'win32')), []);

  // ── the POSIX listing, parsed from the `ps -eo pid=,ppid=,args=` shape ──
  check('rowsOfPs: pid, parent and the whole command line, spaces kept as single separators', attempt(() => rowsOfPs('    1     0 /sbin/init splash\n  412   1 node  a.mjs --flag\n\n')), [
    { pid: 1, parentPid: 0, commandLine: '/sbin/init splash' },
    { pid: 412, parentPid: 1, commandLine: 'node a.mjs --flag' }
  ]);
  check('rowsOfPs: empty output is no rows', attempt(() => rowsOfPs('')), []);

  // ── the real listing, with a private profile ──
  const profile = path.join(scratch, 'profile');
  const roaming = path.join(profile, 'AppData', 'Roaming');
  const privateEnv = { ...process.env, USERPROFILE: profile, HOME: profile, APPDATA: roaming, LOCALAPPDATA: path.join(profile, 'AppData', 'Local') };

  mkdirSync(profile);

  const listed = attempt(() => listProcesses(privateEnv));
  const real = listed === 'THROWS' ? [] : listed;

  check('listProcesses: the real listing does not throw', listed === 'THROWS', false);
  check('listProcesses: rows with numeric pid and text command line', real.length > 0 && real.every((row) => Number.isInteger(row.pid) && typeof row.commandLine === 'string'), true);
  check('listProcesses: carries this very process with its parent', real.some((row) => row.pid === process.pid && row.parentPid === process.ppid), true);
  check('listProcesses: a process without a command line is still listed, with empty text', process.platform !== 'win32' || real.some((row) => row.pid === 4 && row.commandLine === ''), true);

  // A live command line may hold control characters and non-ASCII text; the listing must carry it intact.
  // @es Una línea de comandos viva puede tener caracteres de control y texto no ASCII; el listado la trae intacta.
  const odd = `marker${String.fromCharCode(0x1b)}${String.fromCharCode(0x01)}ñ«»á-end`;
  const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)', odd], { stdio: 'ignore' });

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const withOdd = attempt(() => listProcesses(privateEnv));

  holder.kill();
  check('listProcesses: a command line with control and non-ASCII characters is listed intact', withOdd === 'THROWS' ? 'THROWS' : withOdd.some((row) => row.pid === holder.pid && row.commandLine.includes(odd)), true);
  check('listProcesses: the listing tool ran inside the private profile', existsSync(roaming), process.platform === 'win32');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const failed = results.filter((ok) => !ok).length;

console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
