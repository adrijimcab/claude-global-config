#!/usr/bin/env node
/**
 * One contender of the ledger lock, run as a REAL child process by `ledger-lock.selftest.mjs`: it takes the lock,
 * holds it for a while doing a critical section, and reports whether another contender was inside at the same
 * time. Two processes inside at once is exactly the defect the lock exists to prevent.
 *
 * Usage: node ledger-lock-contender.mjs <lockFile> <inside-file> <violations-file> <holdMs> <staleAfterMs> <attempts>
 *
 * @es Un contendiente del lock del ledger, lanzado como proceso hijo REAL por `ledger-lock.selftest.mjs`: toma
 * el lock, lo mantiene un rato en una sección crítica e informa si otro contendiente estaba dentro a la vez.
 * Dos procesos dentro a la vez es exactamente el defecto que el lock existe para evitar.
 */

import { appendFileSync, rmSync, writeFileSync } from 'node:fs';

import { withLock } from './ledger-lock.mjs';

const [lockFile, insideFile, violationsFile, holdMs, staleAfterMs, attempts] = process.argv.slice(2);

/** Sleeps the thread; the critical section is synchronous like the real writers. @es Duerme el hilo; la sección crítica es síncrona como la de los escritores reales. */
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const outcome = withLock(
  lockFile,
  () => {
    try {
      // `wx` fails when another contender is already inside: that is the violation being counted.
      // @es `wx` falla si otro contendiente ya está dentro: esa es la violación que se cuenta.
      writeFileSync(insideFile, String(process.pid), { flag: 'wx' });
    } catch {
      appendFileSync(violationsFile, `${String(process.pid)}\n`);
    }

    sleep(Number(holdMs));
    rmSync(insideFile, { force: true });
  },
  { staleAfterMs: Number(staleAfterMs), attempts: Number(attempts) },
);

process.exit(outcome.held ? 0 : 3);
