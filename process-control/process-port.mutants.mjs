#!/usr/bin/env node
/**
 * The decisions of `process-control/process-port.mjs`, each broken once, that `process-port.selftest.mjs` must
 * catch. The runner lives in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that only
 * crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `process-port.mjs`, rotas una a una, que `process-port.selftest.mjs` debe detectar. Un
 * mutante que solo hace caer el selftest cuenta como superviviente.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const P = 'process-control/process-port.mjs';

const MUTANTS = [
  // --- liveness ---
  ['EPERM is read as dead', P, "return error?.code === 'EPERM';", 'return false;'],
  ['any error is read as alive', P, "return error?.code === 'EPERM';", 'return true;'],
  ['ESRCH is read as alive', P, "return error?.code === 'EPERM';", "return error?.code === 'EPERM' || error?.code === 'ESRCH';"],
  ['an error without a code throws', P, "error?.code === 'EPERM'", "error.code === 'EPERM'"],
  ['the probe sends a real signal', P, 'kill(pid, 0);', "kill(pid, 'SIGTERM');"],
  ['the probe targets the wrong pid', P, 'kill(pid, 0);', 'kill(pid + 1, 0);'],
  ['nothing is ever alive', P, '    kill(pid, 0);\n\n    return true;', '    kill(pid, 0);\n\n    return false;'],

  // --- the Windows listing ---
  ['the parent token is ignored', P, 'const parentPid = parent !== undefined && /^\\d+$/.test(parent) ? Number(parent) : undefined;', 'const parentPid = undefined;'],
  ['a non-numeric parent is kept', P, 'parent !== undefined && /^\\d+$/.test(parent) ? Number(parent) : undefined', 'parent !== undefined ? Number(parent) : undefined'],
  ['the command line is not decoded', P, "Buffer.from(encoded, 'base64').toString('utf8')", 'encoded'],
  ['the command line is decoded as latin1', P, "Buffer.from(encoded, 'base64').toString('utf8')", "Buffer.from(encoded, 'base64').toString('latin1')"],
  ['blank lines become rows', P, ".filter((line) => line !== '')", ''],
  ['a missing encoded half throws', P, "const [identity, encoded = ''] = line.split(' ');", "const [identity, encoded] = line.split(' ');"],
  ['the listing is not trimmed', P, 'text.split(\'\\n\').map((line) => line.trim())', "text.split('\\n').map((line) => line)"],

  // --- the POSIX listing ---
  ['the ps command line keeps only its first word', P, "commandLine: words.join(' ')", 'commandLine: words[0]'],
  ['the ps parent is dropped', P, 'parentPid: Number(parentPid), commandLine: words', 'parentPid: undefined, commandLine: words'],
  ['ps blank lines become rows', P, "text.split('\\n').filter((line) => line.trim() !== '')", "text.split('\\n')"],

  // --- the real listing ---
  ['the listing tool gets the real profile (no env)', P, 'maxBuffer: 64 << 20, env };', 'maxBuffer: 64 << 20 };'],
  ['Windows uses the POSIX listing', P, "if (platform === 'win32') return rowsOfListing", "if (false) return rowsOfListing"],
  ['the platform seam is ignored for the real OS', P, "run = spawnSync, platform = process.platform", "run = spawnSync, platform = 'linux'"],
  ['the Windows listing runs with a profile', P, "['-NoProfile', '-Command', WINDOWS_LISTING]", "['-Command', WINDOWS_LISTING]"],
  ['the System command line is null, not empty', P, "if ($null -eq $line) { $line = '' }; ", ''],
  ['the listing drops the parent', P, ', $_.ParentProcessId, [Convert]', ', 0, [Convert]'],
  ['the command line is not UTF-8 encoded', P, '[Text.Encoding]::UTF8.GetBytes($line)', '[Text.Encoding]::ASCII.GetBytes($line)'],

  // --- the seam to the owner of the kill ---
  ['killTree is not re-exported', P, "export { killTree } from './kill-tree.mjs';", 'export const killTree = () => ({ outcome: \'failed\' });']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['process-control'],
  selftest: 'process-control/process-port.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 180_000
});

process.exit(survivors === 0 ? 0 : 1);
