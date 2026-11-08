#!/usr/bin/env node
/**
 * The stand-in for the calling session of a proof: a process that starts a DETACHED full chain through the real
 * `detachChain` and then stays alive like a shell would, so the proof can kill its whole process tree.
 *
 *   node detach-kill.fixture.mjs <real|plain> <runDir> <exitCode> <sleepMs>
 *
 * `real` uses the launcher the runner picks for this platform; `plain` swaps it for a bare `spawn({ detached: true })`,
 * the path that was measured to die with its caller. The chain is `chain-child.fixture.mjs sleep-exit <sleepMs>
 * <exitCode>`.
 *
 * @es El sustituto de la sesión que llama en una prueba: un proceso que inicia una cadena DESACOPLADA con el
 * `detachChain` real y luego se queda vivo como un shell, para que la prueba mate todo su árbol de procesos. `real`
 * usa el lanzador de la plataforma; `plain` lo cambia por un `spawn({ detached: true })` simple, el camino que se
 * midió que muere con quien lo llama.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { detachChain } from './detach-chain.mjs';
import { detachedLauncher, spawnLauncher } from './detach-launcher.mjs';
import { speak } from './messages.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [adapter, runDir, exitCode, sleepMs] = process.argv.slice(2);

const request = {
  chain: 'detach-kill-proof',
  project: 'proof',
  session: 'proof',
  tree: path.resolve(HERE, '..'),
  command: process.execPath,
  args: [path.join(HERE, 'chain-child.fixture.mjs'), 'sleep-exit', sleepMs, exitCode],
  waitMs: 60_000,
  pollMs: 200,
  detach: true,
  runDir
};

const code = detachChain(request, { launcher: adapter === 'plain' ? spawnLauncher() : detachedLauncher(), say: speak(), runsRoot: path.join(runDir, '..'), environment: process.env, cwd: process.cwd() });

if (code !== 0) process.exit(code);

setInterval(() => undefined, 1000);
