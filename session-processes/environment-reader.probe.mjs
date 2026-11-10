#!/usr/bin/env node
/**
 * The live probe of the environment reader, kept as a fixture: it proves on real processes what the T17 design
 * rests on, and prints one measurement per line (exit 1 when any of (a)-(c) fails):
 *   (a) the reader sees the TEMP of a child node process;
 *   (b) it sees the TEMP of an orphan whose parent was killed;
 *   (c) a process with another marker is never read as ours;
 *   (d) what a read of every process of the machine costs.
 * Run it with `node session-processes/environment-reader.probe.mjs`.
 * @es La sonda viva del lector de entorno, conservada como fixture: prueba con procesos reales lo que sostiene el
 * diseño de T17 e imprime una medición por línea (sale con 1 si falla (a)-(c)): (a) el lector ve el TEMP de un hijo
 * node; (b) ve el TEMP de un huérfano cuyo padre murió; (c) un proceso con otro marcador no se lee como nuestro;
 * (d) cuánto cuesta leer todos los procesos de la máquina.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readEnvironments } from './process-table.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOLDER = path.join(HERE, 'holder.fixture.mjs');
const MAKER = path.join(HERE, 'orphan-maker.fixture.mjs');
const OURS = 'C:/probe/ours';
const THEIRS = 'C:/probe/theirs';
const scratch = mkdtempSync(path.join(tmpdir(), 't17-probe-'));
const release = path.join(scratch, 'release');
const started = [];
let failures = 0;

const withTemp = (value) => ({ ...process.env, TEMP: value, TMP: value, TMPDIR: value });
const report = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail === '' ? '' : `: ${detail}`}`);
};

try {
  const child = spawn(process.execPath, [HOLDER, release], { env: withTemp(OURS), stdio: 'ignore', windowsHide: true });
  const foreign = spawn(process.execPath, [HOLDER, release], { env: withTemp(THEIRS), stdio: 'ignore', windowsHide: true });
  const made = spawnSync(process.execPath, [MAKER, OURS, release], { encoding: 'utf8', windowsHide: true });
  const orphanPid = Number(made.stdout.trim());

  started.push(child.pid, foreign.pid, orphanPid);

  const t0 = process.hrtime.bigint();
  const rows = readEnvironments();
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const byPid = new Map(rows.map((row) => [row.pid, row]));

  report('(a) the TEMP of a child node process is read', byPid.get(child.pid)?.temp === OURS, String(byPid.get(child.pid)?.temp));
  report('(b) the TEMP of an orphan (its parent exited) is read', byPid.get(orphanPid)?.temp === OURS, String(byPid.get(orphanPid)?.temp));
  report('(b) the orphan really has no live parent', !byPid.has(byPid.get(orphanPid)?.parentPid ?? -1), String(byPid.get(orphanPid)?.parentPid));
  report('(c) the foreign marker is read as foreign, never as ours', byPid.get(foreign.pid)?.temp === THEIRS);
  // A console host (conhost) inherits the marker of the process it serves: it is ours too, and a sweep rightly ends it.
  // @es Un host de consola (conhost) hereda el marcador del proceso al que sirve: también es nuestro y el barrido lo termina con razón.
  const marked = rows.filter((row) => row.temp === OURS);
  report('(c) only our own processes and their console hosts carry our marker', marked.every((row) => [child.pid, orphanPid].includes(row.pid) || row.name === 'conhost') && byPid.has(process.pid) && byPid.get(process.pid).temp !== OURS, JSON.stringify(marked));
  console.log(`(d) ${rows.length} processes read in ${elapsedMs.toFixed(0)} ms; ${rows.filter((row) => row.temp === undefined).length} unreadable @es ${rows.length} procesos leídos en ${elapsedMs.toFixed(0)} ms`);
} finally {
  writeFileSync(release, 'x');
  for (const pid of started) {
    try {
      process.kill(pid);
    } catch {
      // already gone. @es ya terminó.
    }
  }
  rmSync(scratch, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);
