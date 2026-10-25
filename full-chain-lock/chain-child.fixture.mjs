#!/usr/bin/env node
/**
 * The command a proof runs UNDER the lock, as a real child process.
 *
 *   node chain-child.fixture.mjs hold <logFile> <label> <holdMs>   appends "<label> start <ms>", waits, appends "<label> end <ms>"
 *   node chain-child.fixture.mjs exit <code>                       prints a line and exits with <code>
 *   node chain-child.fixture.mjs signal                            ends itself with SIGTERM
 *
 * @es El comando que una prueba ejecuta BAJO el lock, como proceso hijo real: `hold` registra inicio y fin con una
 * espera en medio, `exit` sale con el código dado y `signal` se termina a sí mismo con SIGTERM.
 */

import { appendFileSync } from 'node:fs';

const [mode, ...rest] = process.argv.slice(2);

if (mode === 'hold') {
  const [logFile, label, holdMs] = rest;

  appendFileSync(logFile, `${label} start ${String(Date.now())}\n`);
  await new Promise((resolve) => setTimeout(resolve, Number(holdMs)));
  appendFileSync(logFile, `${label} end ${String(Date.now())}\n`);
} else if (mode === 'exit') {
  console.log(`child exiting with ${rest[0]}`);
  process.exit(Number(rest[0]));
} else if (mode === 'signal') {
  process.kill(process.pid, 'SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
