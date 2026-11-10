#!/usr/bin/env node
/**
 * A test process that starts a detached `holder.fixture.mjs` carrying a given TEMP, prints the holder's pid and exits
 * at once, so the holder is an orphan whose parent is gone: the case a SessionEnd sweep exists for.
 *   orphan-maker.fixture.mjs <TEMP the holder carries> <release file of the holder>
 * @es Un proceso de prueba que inicia un `holder.fixture.mjs` desacoplado con un TEMP dado, imprime el pid del holder
 * y sale al instante, así el holder queda huérfano con su padre ya muerto: el caso para el que existe el barrido de
 * SessionEnd.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [temp, releaseFile] = process.argv.slice(2);
const HOLDER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'holder.fixture.mjs');
const child = spawn(process.execPath, [HOLDER, releaseFile], { env: { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp }, stdio: 'ignore', detached: true, windowsHide: true });

child.unref();
console.log(String(child.pid));
