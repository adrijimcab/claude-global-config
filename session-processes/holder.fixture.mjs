#!/usr/bin/env node
/**
 * A test process that does nothing until the file named by its first argument exists, then exits (a second argument
 * `with-child` also starts one holder below it). The tests start it
 * with the TEMP they want to prove about, and release it (or kill it) when the proof is done. A safety ceiling ends
 * it by itself if a crashed test never does, so a failed run leaves no orphan behind; the ceiling decides no
 * assertion. When SESSION_PROCESSES_PROOF_OWNER names a pid, it also exits as soon as that process is gone.
 * @es Un proceso de prueba que no hace nada hasta que existe el fichero que nombra su primer argumento, y entonces
 * sale. Los tests lo inician con el TEMP que quieren probar y lo liberan (o matan) al terminar. Un tope de seguridad
 * lo termina solo si un test caído nunca lo hace, para que una corrida fallida no deje huérfanos; el tope no decide
 * ninguna aserción. Cuando SESSION_PROCESSES_PROOF_OWNER nombra un pid, también sale en cuanto ese proceso desaparece.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const [releaseFile, withChild] = process.argv.slice(2);

// With `with-child` it also starts one holder below itself, which inherits its environment: the case of a tree.
// @es Con `with-child` inicia además un holder por debajo de sí, que hereda su entorno: el caso de un árbol.
if (withChild === 'with-child') spawn(process.execPath, [process.argv[1], releaseFile], { stdio: 'ignore', windowsHide: true });

const SAFETY_CEILING_MS = 10 * 60 * 1000;
// The proof that owns this holder, inherited through the environment by every holder below it (the orphan and the
// detached chain's included): a proof killed before its cleanup (a mutant pool stops a selftest at its first failure)
// takes its holders with it instead of leaving them alive for the ceiling. Measured 2026-11-11: holders a killed proof
// left alive held a folder inside a campaign's chain TEMP, so that runner could not remove it.
// @es La prueba dueña de este holder, heredada por el entorno por todo holder de debajo (el huérfano y el de la cadena
// desacoplada incluidos): una prueba matada antes de su limpieza se lleva sus holders en vez de dejarlos vivos hasta
// el tope. Medido el 2026-11-11: holders que una prueba matada dejó vivos tenían una carpeta dentro del TEMP de cadena
// de una campaña, y su runner no pudo borrarla.
const owner = Number(process.env.SESSION_PROCESSES_PROOF_OWNER);
const ownerAlive = () => {
  try {
    process.kill(owner, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

setTimeout(() => process.exit(0), SAFETY_CEILING_MS);
setInterval(() => {
  if (releaseFile !== undefined && existsSync(releaseFile)) process.exit(0);
  if (Number.isInteger(owner) && owner > 0 && !ownerAlive()) process.exit(0);
}, 50);
