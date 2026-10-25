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

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { readStdin, runWhenMain, tryParsePayload } from '../hook-io/hook-io.mjs';
import { stateDir } from '../hook-state/locations.mjs';
import { describeBlocks, recordBlocks } from './block-journal.mjs';
import { appliesTo, loadManifest } from './manifest.mjs';
import { mergeOutputs } from './merge.mjs';
import { runGuard } from './run-guard.mjs';

/** The dispatcher's own malfunctions, resolved at each call through the one state-location module. @es Los fallos propios del dispatcher, resueltos en cada llamada por el único módulo de ubicaciones. */
const errorsFile = () => path.join(stateDir('hook-dispatch'), 'errors.jsonl');

function journal(entry) {
  try {
    mkdirSync(path.dirname(errorsFile()), { recursive: true });
    appendFileSync(errorsFile(), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch {
    // Perder una línea del diario pierde evidencia, nunca una decisión.
  }
}

/** El nombre de herramienta del payload, o `undefined` si no se puede leer. */
function toolNameOf(raw) {
  const payload = tryParsePayload(raw);

  return typeof payload?.tool_name === 'string' ? payload.tool_name : undefined;
}

/**
 * Corre el manifiesto sobre un payload y devuelve `{ output, problems, blocks }`: la salida fusionada (o
 * `undefined`), los problemas, y los bloqueos que dijeron las guardias (`block-journal.mjs`), que `main`
 * registra y esta función NO: quien la importa (selftests, `replay.mjs`) no escribe journals de nadie.
 * Exportada para el selftest y para `replay.mjs`, que la llaman sin pasar por stdin.
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
    else results.push({ guard: guard.name, mechanism: guard.mechanism, output: result.output });
  }

  const { output, anomalies } = mergeOutputs(manifest.event, results);
  const problems = [...failures, ...anomalies];
  const blocks = describeBlocks({ event: manifest.event, raw, results });

  if (problems.length === 0) return { output, problems, blocks };

  const notice = `[hook-dispatch] ${problems.length} problema(s) en ${path.basename(manifestFile)}; esas guardias NO decidieron (el resto sí):\n${problems.map((problem) => `  - ${problem}`).join('\n')}`;
  const withNotice = { ...output, systemMessage: output?.systemMessage === undefined ? notice : `${output.systemMessage}\n\n${notice}` };

  return { output: withNotice, problems, blocks };
}

async function main() {
  const manifestFile = path.resolve(process.argv[2] ?? '');
  let raw;

  try {
    raw = await readStdin();
  } catch {
    return;
  }

  try {
    const { output, problems, blocks } = await dispatch(manifestFile, raw);

    if (problems.length > 0) {
      journal({ manifest: manifestFile, problems });
      process.stderr.write(`${problems.map((problem) => `[hook-dispatch] ${problem}`).join('\n')}\n`);
    }

    if (output !== undefined) process.stdout.write(`${JSON.stringify(output)}\n`);

    // Después de decir la decisión, y sin poder cambiarla: un diario que falla se informa, no se propaga.
    const journalFailures = recordBlocks(blocks);

    if (journalFailures.length > 0) {
      journal({ manifest: manifestFile, journalFailures });
      process.stderr.write(`${journalFailures.map((failure) => `[hook-dispatch] no se pudo registrar el bloqueo de ${failure}`).join('\n')}\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    journal({ manifest: manifestFile, fatal: message });
    process.stdout.write(`${JSON.stringify({ systemMessage: `[hook-dispatch] no pudo correr ${manifestFile}: ${message}. NINGUNA de sus guardias decidió.` })}\n`);
  }
}

// Only as the main process (`runWhenMain` compares real paths); it never leaves with a code other than 0.
// @es Solo como proceso principal (`runWhenMain` compara rutas reales); nunca sale con código distinto de 0.
runWhenMain(import.meta.url, async () => {
  await main();
  process.exitCode = 0;
});
