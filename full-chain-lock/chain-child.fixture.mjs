#!/usr/bin/env node
/**
 * The command a proof runs UNDER the lock, as a real child process.
 *
 *   node chain-child.fixture.mjs hold <logFile> <label> <holdMs>   appends "<label> start <ms>", waits, appends "<label> end <ms>"
 *   node chain-child.fixture.mjs sleep-exit <ms> <code>            prints a line, sleeps <ms>, prints another and exits with <code>
 *   node chain-child.fixture.mjs gate-exit <stopFile> <code> <maxMs>
 *                                                                  prints a line, waits until <stopFile> exists (or <maxMs>),
 *                                                                  prints another and exits with <code>, so a proof decides
 *                                                                  when the chain ends instead of racing a clock
 *   node chain-child.fixture.mjs exit <code>                      prints a line and exits with <code>
 *   node chain-child.fixture.mjs signal                            ends itself with SIGTERM
 *   node chain-child.fixture.mjs until <logFile> <label> <stopFile> <maxMs>
 *                                                                  appends "<label> start <ms>", ends once <stopFile>
 *                                                                  exists (or after <maxMs>), so a proof ends the chain the
 *                                                                  normal way on every platform: a Windows process killed
 *                                                                  from outside runs no cleanup of its own
 *
 * @es El comando que una prueba ejecuta BAJO el lock, como proceso hijo real: `hold` registra inicio y fin con una
 * espera en medio, `exit` sale con el código dado, `signal` se termina a sí mismo con SIGTERM y `until` termina cuando
 * existe <stopFile> (o tras <maxMs>), para que una prueba cierre la cadena por su camino normal en toda plataforma: un
 * proceso de Windows matado desde fuera no ejecuta su propia limpieza. `gate-exit` imprime una línea, espera a que exista
 * <stopFile> (o <maxMs>), imprime otra y sale con <code>, para que la prueba decida cuándo termina la cadena en vez de
 * competir con un reloj.
 */

import { appendFileSync, existsSync } from 'node:fs';

const [mode, ...rest] = process.argv.slice(2);

if (mode === 'hold') {
  const [logFile, label, holdMs] = rest;

  appendFileSync(logFile, `${label} start ${String(Date.now())}\n`);
  await new Promise((resolve) => setTimeout(resolve, Number(holdMs)));
  appendFileSync(logFile, `${label} end ${String(Date.now())}\n`);
} else if (mode === 'until') {
  const [logFile, label, stopFile, maxMs] = rest;
  const deadline = Date.now() + Number(maxMs);

  appendFileSync(logFile, `${label} start ${String(Date.now())}\n`);
  while (!existsSync(stopFile) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  appendFileSync(logFile, `${label} end ${String(Date.now())}\n`);
} else if (mode === 'sleep-exit') {
  const [sleepMs, code] = rest;

  console.log('sleep-exit start');
  await new Promise((resolve) => setTimeout(resolve, Number(sleepMs)));
  console.log('sleep-exit end');
  process.exit(Number(code));
} else if (mode === 'gate-exit') {
  const [stopFile, code, maxMs] = rest;
  const deadline = Date.now() + Number(maxMs);

  console.log('gate-exit start');
  while (!existsSync(stopFile) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  console.log('gate-exit end');
  process.exit(Number(code));
} else if (mode === 'cwd') {
  console.log(`cwd ${process.cwd()}`);
} else if (mode === 'exit') {
  console.log(`child exiting with ${rest[0]}`);
  process.exit(Number(rest[0]));
} else if (mode === 'signal') {
  process.kill(process.pid, 'SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
