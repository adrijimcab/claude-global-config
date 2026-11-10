#!/usr/bin/env node
/**
 * A test process that does nothing until the file named by its first argument exists, then exits (a second argument
 * `with-child` also starts one holder below it). The tests start it
 * with the TEMP they want to prove about, and release it (or kill it) when the proof is done. A safety ceiling ends
 * it by itself if a crashed test never does, so a failed run leaves no orphan behind; the ceiling decides no
 * assertion.
 * @es Un proceso de prueba que no hace nada hasta que existe el fichero que nombra su primer argumento, y entonces
 * sale. Los tests lo inician con el TEMP que quieren probar y lo liberan (o matan) al terminar. Un tope de seguridad
 * lo termina solo si un test caído nunca lo hace, para que una corrida fallida no deje huérfanos; el tope no decide
 * ninguna aserción.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const [releaseFile, withChild] = process.argv.slice(2);

// With `with-child` it also starts one holder below itself, which inherits its environment: the case of a tree.
// @es Con `with-child` inicia además un holder por debajo de sí, que hereda su entorno: el caso de un árbol.
if (withChild === 'with-child') spawn(process.execPath, [process.argv[1], releaseFile], { stdio: 'ignore', windowsHide: true });

const SAFETY_CEILING_MS = 10 * 60 * 1000;

setTimeout(() => process.exit(0), SAFETY_CEILING_MS);
setInterval(() => {
  if (releaseFile !== undefined && existsSync(releaseFile)) process.exit(0);
}, 50);
