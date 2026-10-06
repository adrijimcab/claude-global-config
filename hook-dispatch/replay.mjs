#!/usr/bin/env node
/**
 * Prueba de equivalencia: pasa payloads REALES por los dos caminos y exige el mismo veredicto.
 *
 *   camino viejo  — una entrada de settings por guardia: cada guardia como PROCESO propio, filtrada por
 *                   el matcher de ESA entrada de settings (fuente independiente del sidecar que usa el
 *                   dispatcher), y las salidas fusionadas como las fusiona el harness;
 *   camino nuevo  — `dispatch.mjs <manifiesto>` como UN proceso.
 *
 *   node replay.mjs <settings.json> <manifiesto.json> <payloads.jsonl> --root <dir con .claude/> [--concurrency N]
 *
 * `payloads.jsonl`: una línea por payload, `{ "raw": "<payload literal>", "source": "..." }`.
 * Correr SIEMPRE sobre un espejo de las guardias, no sobre las vivas: las dos rutas escriben en los
 * diarios de las guardias, y un diario vivo lleno de repeticiones deja de ser tráfico real.
 *
 * MODO `latency` (procedimiento P3b, `latency.mjs`): `node replay.mjs latency --manifest <manifiesto> [--runs 20]
 * [--projects-root <dir>] [--cwd <dir>] [--repo nombre|worktree[|gitDir]]` corre el manifiesto N veces seguidas sobre un
 * payload de Stop con forma real y escribe UNA línea JSON (mediana, p95, transcripts a su alcance, bytes, repos).
 * @es LATENCY mode (procedure P3b): runs the manifest N consecutive times on a real-shaped Stop payload and prints
 * ONE JSON line (median, p95, transcripts in reach, bytes, repos).
 *
 * Una discrepancia se vuelve a medir una vez, porque algunas guardias leen estado vivo (worktrees,
 * agentes) que puede moverse entre las dos corridas; solo cuenta si se repite.
 */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLAUDE_HOME_VARIABLE } from '../hook-state/locations.mjs';
import { runLatencyCli } from './latency.mjs';
import { labelOf, loadManifest } from './manifest.mjs';
import { mergeOutputs } from './merge.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LATENCY = process.argv[2] === 'latency';
const [settingsFile, manifestFile, payloadsFile] = process.argv.slice(2);
const concurrencyAt = process.argv.indexOf('--concurrency');
const CONCURRENCY = concurrencyAt === -1 ? 6 : Number(process.argv[concurrencyAt + 1]);
const rootAt = process.argv.indexOf('--root');

if (!LATENCY && rootAt === -1) throw new Error('falta --root <directorio que contiene .claude/>: el camino viejo se resuelve bajo ese espejo');

const ROOT = process.argv[rootAt + 1];
const optionValue = (flag) => {
  const at = process.argv.indexOf(flag);

  return at === -1 ? undefined : process.argv[at + 1];
};
// Guardias de USUARIO registradas por el proyecto (`$HOME/.claude/...`): el camino viejo las resuelve bajo
// `--home-root` (espejo A del home) y el nuevo bajo `--new-home` (espejo B), que llega al dispatcher como
// `HOOK_DISPATCH_HOME`. Dos espejos, porque varias guardias escriben estado (cooldowns, diarios) y el
// estado que deja un camino no puede decidir el veredicto del otro.
const HOME_ROOT = optionValue('--home-root') ?? ROOT;
const NEW_HOME = optionValue('--new-home');
// Guardias que se quedan DELIBERADAMENTE fuera del dispatcher, con su propia entrada de settings (por
// ejemplo, una que destruye estado vivo y no se puede reproducir en un espejo). Se nombran por rótulo.
const RETRY_ON_DIFF = process.argv.includes('--retry-on-diff');
const EXCLUDED = new Set((optionValue('--exclude') ?? '').split(',').map((label) => label.trim()).filter(Boolean));

function run(args, input, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'], env });
    let stdout = '';

    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', () => {});
    child.on('close', (code) => resolve({ stdout, code }));
    child.stdin.end(input);
  });
}

function parse(stdout) {
  const text = stdout.trim();

  if (text === '') return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return { unparseable: text.slice(0, 200) };
  }
}

// Qué entradas de settings forman el camino viejo: las del evento cuyo matcher usa SOLO estas
// herramientas (`--matcher-set "Bash|PowerShell"`, el valor por defecto) o, con `--matcher-set ""`,
// las que no tienen matcher (Stop, SubagentStop).
const matcherSetAt = process.argv.indexOf('--matcher-set');
const MATCHER_SET = new Set((matcherSetAt === -1 ? 'Bash|PowerShell' : process.argv[matcherSetAt + 1]).split('|').map((part) => part.trim()).filter(Boolean));

/**
 * El camino viejo sale de SETTINGS, no del manifiesto: cada entrada del evento cuyo matcher entra en
 * `MATCHER_SET` y cuyo comando corre `node .../.claude/<ruta>.mjs`, resuelta bajo `root` (el espejo). Así
 * una guardia que falte en el manifiesto aparece en el camino viejo y no en el nuevo, y se ve. La entrada
 * del propio dispatcher nunca cuenta como camino viejo.
 */
function settingsGuards(settings, event, root) {
  const guards = [];

  for (const group of settings.hooks?.[event] ?? []) {
    const tools = (group.matcher ?? '').split('|').map((part) => part.trim()).filter(Boolean);
    const selected = MATCHER_SET.size === 0 ? tools.length === 0 : tools.length > 0 && tools.every((tool) => MATCHER_SET.has(tool));

    if (!selected) continue;

    for (const hook of group.hooks ?? []) {
      const command = (hook.command ?? '').split('\\').join('/');
      const at = command.indexOf('.claude/');

      if (at === -1 || !command.startsWith('node ') || command.includes('hook-dispatch/dispatch.mjs')) continue;

      const relative = command.slice(at).split('"')[0].trim().split(' ')[0];
      const before = command.slice(0, at);
      const homeRooted = before.endsWith('$HOME/') || before.endsWith('${HOME}/') || before.endsWith('~/');
      const file = path.join(homeRooted ? HOME_ROOT : root, relative);

      if (EXCLUDED.has(labelOf(file))) continue;

      guards.push({ name: labelOf(file), file, oldMatcher: group.matcher });
    }
  }

  return guards;
}

/**
 * Si la entrada de settings corre para `tool`. Sin matcher, o con matcher vacío o `*`, corre siempre —
 * como en el harness. Medido: la primera versión trataba `""` como «ninguna herramienta» y el camino
 * viejo de Stop no corría NUNCA, con 722 de 770 payloads «idénticos» porque ambos permitían.
 */
function matches(matcher, tool) {
  const alternatives = typeof matcher === 'string' ? matcher.split('|').map((part) => part.trim()).filter(Boolean) : [];

  return alternatives.length === 0 || alternatives.includes('*') || alternatives.includes(tool);
}

async function oldPath(guards, event, raw, tool) {
  const results = [];

  for (const guard of guards) {
    if (!matches(guard.oldMatcher, tool)) continue;

    const { stdout } = await run([guard.file], raw);

    results.push({ guard: guard.name, output: parse(stdout) });
  }

  return mergeOutputs(event, results).output;
}

async function newPath(raw) {
  // El dispatcher registra los bloqueos en el estado de cada guardia: bajo el espejo B, nunca en el home vivo.
  const env = NEW_HOME === undefined ? process.env : { ...process.env, HOOK_DISPATCH_HOME: NEW_HOME, [CLAUDE_HOME_VARIABLE]: path.join(NEW_HOME, '.claude') };
  const { stdout, code } = await run([path.join(HERE, 'dispatch.mjs'), manifestFile], raw, env);

  return { output: parse(stdout), code };
}

/**
 * Las raíces de los dos espejos, en las dos grafías en que aparecen dentro de un JSON (barra y barra
 * invertida escapada). Una guardia que imprime su propia ruta —turn-guard imprime el comando de
 * `capture.mjs`— nombra el espejo A en un camino y el B en el otro, y esa es la única diferencia.
 */
const mirrorRoots = [ROOT, HOME_ROOT, optionValue('--new-root'), NEW_HOME]
  .filter((root) => typeof root === 'string')
  .flatMap((root) => {
    const resolved = path.resolve(root);

    // Dentro de JSON.stringify cada `\` de la ruta aparece como `\\` (dos caracteres).
    return [resolved.split('\\').join('\\\\'), resolved.split('\\').join('/')];
  })
  .sort((left, right) => right.length - left.length);

/**
 * La forma comparable de una salida. Dos cambios, ambos medidos: una marca de tiempo en milisegundos
 * (13 dígitos) pasa a `<epoch-ms>` —eval-guard nombra en su razón un archivo `eval-<Date.now()>.mjs`—, y
 * la raíz de cada espejo pasa a `<mirror>`. Todo lo demás se compara literal.
 */
const comparable = (output) =>
  mirrorRoots.reduce((text, root) => text.split(root).join('<mirror>'), JSON.stringify(output ?? null)).replace(/\b1\d{12}\b/g, '<epoch-ms>');

/** El veredicto de una salida, para el recuento: deny/ask/allow de PreToolUse, block de Stop, o mensaje. */
function verdictOf(output) {
  if (output?.decision === 'block') return 'block';
  if (output?.hookSpecificOutput?.permissionDecision !== undefined) return output.hookSpecificOutput.permissionDecision;

  return output?.systemMessage === undefined ? 'allow' : 'message';
}

async function main() {
  const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
  const manifest = loadManifest(manifestFile);
  const guards = settingsGuards(settings, manifest.event, ROOT);
  // Se compara por RÓTULO (`<carpeta>/<archivo>`), no por ruta: el camino viejo corre desde un espejo.
  const inManifest = new Set(manifest.guards.map((guard) => guard.name.toLowerCase()));
  const uncovered = guards.filter((guard) => !inManifest.has(guard.name.toLowerCase()));

  console.log(`camino viejo: ${guards.length} guardias de settings; manifiesto: ${manifest.guards.length}`);
  for (const guard of uncovered) console.log(`NO CUBIERTA por el manifiesto: ${guard.name}`);
  const payloads = readFileSync(payloadsFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const tally = { total: payloads.length, same: 0, differ: 0, nonZeroExit: 0, verdicts: {} };
  const differences = [];
  let next = 0;

  async function worker() {
    while (next < payloads.length) {
      const item = payloads[next++];
      let tool;

      try {
        tool = JSON.parse(item.raw).tool_name;
      } catch {
        tool = undefined;
      }

      let before = await oldPath(guards, manifest.event, item.raw, tool);
      let after = await newPath(item.raw);

      // Re-medir SOLO cuando se pide (`--retry-on-diff`): sirve para guardias sin estado que leen estado
      // vivo que se mueve entre las dos corridas. Con guardias que escriben estado (cooldowns de Stop) la
      // segunda corrida ya no mide lo mismo: medido el 2026-09-29, el reintento tapaba una diferencia
      // real porque ambos caminos caían en su cooldown y «coincidían» dejando pasar.
      if (RETRY_ON_DIFF && comparable(before) !== comparable(after.output)) {
        before = await oldPath(guards, manifest.event, item.raw, tool);
        after = await newPath(item.raw);
      }

      if (after.code !== 0) tally.nonZeroExit++;

      const verdict = verdictOf(after.output);

      tally.verdicts[verdict] = (tally.verdicts[verdict] ?? 0) + 1;

      if (comparable(before) === comparable(after.output)) tally.same++;
      else {
        tally.differ++;
        differences.push({ source: item.source, raw: item.raw, before, after: after.output });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(JSON.stringify({ manifest: manifestFile, ...tally }, null, 1));
  if (differences.length > 0) {
    const file = `${payloadsFile}.differences-${Date.now()}.jsonl`;

    writeFileSync(file, differences.map((difference) => JSON.stringify(difference)).join('\n'));
    console.log(`${differences.length} diferencia(s) completas en ${file}`);
  }
  process.exitCode = tally.differ === 0 && tally.nonZeroExit === 0 && uncovered.length === 0 ? 0 : 1;
}

if (LATENCY) process.exitCode = runLatencyCli(process.argv.slice(3));
else await main();
