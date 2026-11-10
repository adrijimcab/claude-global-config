#!/usr/bin/env node
/**
 * A test process that stands in for the shell between the harness and a hook: it runs `end.mjs` as its child, feeding
 * it its own stdin, and prints `{ status, stdout, stderr }` of that run as JSON. Started with the session TEMP, it is
 * an ANCESTOR of the hook that carries the session's marker, the case the sweep must spare.
 * @es Un proceso de prueba que hace de shell entre el harness y un hook: ejecuta `end.mjs` como hijo, pasándole su
 * propio stdin, e imprime `{ status, stdout, stderr }` de esa corrida como JSON. Iniciado con el TEMP de la sesión es
 * un ANCESTRO del hook que lleva la marca de la sesión, el caso que el barrido debe respetar.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const END = path.join(path.dirname(fileURLToPath(import.meta.url)), 'end.mjs');
const ran = spawnSync(process.execPath, [END], { input: readFileSync(0, 'utf8'), encoding: 'utf8', windowsHide: true });

console.log(JSON.stringify({ status: ran.status, stdout: ran.stdout, stderr: ran.stderr }));
