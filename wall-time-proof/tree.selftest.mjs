#!/usr/bin/env node
/**
 * The enforcement of the wall-time guard (ledger key wall-time-asserted-as-concurrency-proof): it scans EVERY
 * selftest of this tree, the population `selftest-runner/discovery.mjs` decides, and goes red naming file:line for
 * each assertion that compares an elapsed wall time against a bound. Being a `*.selftest.mjs`, the selftest runner
 * runs it on every landing; there is no list to keep. What the scanner recognises is proved in `selftest.mjs`.
 *
 * @es La aplicación del guard de tiempo de pared (clave del ledger wall-time-asserted-as-concurrency-proof): escanea
 * TODOS los selftests de este árbol, la población que decide `selftest-runner/discovery.mjs`, y se pone en rojo con
 * archivo:línea por cada aserción que compara un tiempo de pared transcurrido con una cota. Al ser un
 * `*.selftest.mjs`, el runner lo ejecuta en cada aterrizaje; no hay lista que mantener. Lo que el escáner reconoce se
 * prueba en `selftest.mjs`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverSelftests } from '../selftest-runner/discovery.mjs';
import { summaryMessage } from './messages.mjs';
import { scanFiles } from './scan.mjs';

const { root, entries } = discoverSelftests(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const unreadable = [];

/** A file the listing names but the disk cannot give is a red line, never a silent skip. @es Un fichero que el listado nombra y el disco no da es una línea roja, nunca un salto silencioso. */
function read(file) {
  try {
    return readFileSync(path.join(root, file), 'utf8');
  } catch (error) {
    unreadable.push(`${file}: cannot be read (${error.message}). @es ${file}: no se puede leer (${error.message}).`);

    return '';
  }
}

const { scanned, findings } = scanFiles(
  entries.map((entry) => entry.path),
  read,
);

if (findings.length > 0 || unreadable.length > 0 || scanned === 0) {
  const lines = [...findings.map((finding) => finding.message), ...unreadable];

  if (scanned === 0) lines.push('No selftest was found to scan: the population is empty, which proves nothing. @es No se encontró ningún selftest que escanear: la población vacía no prueba nada.');

  console.error(`wall-time guard FAILED. @es El guard de tiempo de pared FALLÓ.\n${lines.join('\n')}\n${summaryMessage(scanned, findings.length)}`);
  process.exit(1);
}

console.log(`wall-time guard: ${summaryMessage(scanned, 0)}`);
