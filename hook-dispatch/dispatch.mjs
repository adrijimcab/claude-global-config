#!/usr/bin/env node
/**
 * Dispatcher de hooks: UN proceso `node` por evento y matcher, en vez de un proceso por guardia.
 *
 *   node dispatch.mjs <manifiesto.json>
 *
 * Por qué existe, medido el 2026-09-28: cada llamada a Bash lanzaba 9 procesos `node` (1 global y 8
 * del proyecto b100), 300 ms de CPU por llamada, 63 ms de pared porque el harness los corre en
 * paralelo. Con varios agentes vivos eso se multiplica por cada comando de cada agente.
 *
 * Qué conserva: cada guardia decide exactamente lo mismo que decidía sola. Corre solo para las
 * herramientas de su propio sidecar de registro, recibe el payload literal, y su veredicto se fusiona
 * con la precedencia del harness (`merge.mjs`). Lo prueban el selftest de cada guardia (sin cambios) y
 * `replay.mjs`, que pasa payloads reales por los dos caminos y exige el mismo veredicto.
 *
 * Qué NO hace: nunca sale con código distinto de 0. Con código ≠ 0 el harness ignora el JSON de
 * stdout, y un error de UNA guardia se comería el `deny` de otra. Los errores salen como
 * `systemMessage` (el usuario los ve), en stderr y en `state/errors.jsonl`: fallar abierto, nunca
 * fallar invisible.
 */

import { appendFileSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { appliesTo, loadManifest } from './manifest.mjs';
import { mergeOutputs } from './merge.mjs';
import { runGuard } from './run-guard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ERRORS = path.join(HERE, 'state', 'errors.jsonl');

function journal(entry) {
  try {
    mkdirSync(path.dirname(ERRORS), { recursive: true });
    appendFileSync(ERRORS, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch {
    // Perder una línea del diario pierde evidencia, nunca una decisión.
  }
}

/** El nombre de herramienta del payload, o `undefined` si no se puede leer. */
function toolNameOf(raw) {
  try {
    const payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);

    return typeof payload?.tool_name === 'string' ? payload.tool_name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Corre el manifiesto sobre un payload y devuelve la salida fusionada, o `undefined`. Exportada para
 * el selftest y para `replay.mjs`, que la llaman sin pasar por stdin.
 */
export async function dispatch(manifestFile, raw, options = {}) {
  const manifest = loadManifest(manifestFile);
  const toolName = toolNameOf(raw);
  const results = [];
  const failures = [];

  for (const guard of manifest.guards) {
    if (toolName !== undefined && !appliesTo(guard.registrations, manifest.event, toolName)) continue;

    const result = await runGuard(guard, raw, options);

    if (result.error !== undefined) failures.push(`${guard.name}: ${result.error}`);
    else results.push({ guard: guard.name, output: result.output });
  }

  const { output, anomalies } = mergeOutputs(manifest.event, results);
  const problems = [...failures, ...anomalies];

  if (problems.length === 0) return { output, problems };

  const notice = `[hook-dispatch] ${problems.length} problema(s) en ${path.basename(manifestFile)}; esas guardias NO decidieron (el resto sí):\n${problems.map((problem) => `  - ${problem}`).join('\n')}`;
  const withNotice = { ...output, systemMessage: output?.systemMessage === undefined ? notice : `${output.systemMessage}\n\n${notice}` };

  return { output: withNotice, problems };
}

async function main() {
  const manifestFile = path.resolve(process.argv[2] ?? '');
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return;
  }

  try {
    const { output, problems } = await dispatch(manifestFile, raw);

    if (problems.length > 0) {
      journal({ manifest: manifestFile, problems });
      process.stderr.write(`${problems.map((problem) => `[hook-dispatch] ${problem}`).join('\n')}\n`);
    }

    if (output !== undefined) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    journal({ manifest: manifestFile, fatal: message });
    process.stdout.write(`${JSON.stringify({ systemMessage: `[hook-dispatch] no pudo correr ${manifestFile}: ${message}. NINGUNA de sus guardias decidió.` })}\n`);
  }
}

/**
 * Si este archivo es el programa en ejecución. Se compara por `realpathSync.native` (junctions, rutas
 * 8.3, mayúsculas) y, ante cualquier duda, responde «sí»: un dispatcher que se cree importado no
 * decide nada y deja a todas sus guardias mudas.
 */
function isEntryPoint() {
  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
}

if (process.argv[1] !== undefined && isEntryPoint()) {
  await main();
  process.exitCode = 0;
}
