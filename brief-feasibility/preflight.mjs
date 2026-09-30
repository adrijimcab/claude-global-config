#!/usr/bin/env node
/**
 * Pre-flight check of a DRAFT brief: every delegation-time guard, in one pass, before the brief is sent.
 *
 *   node ~/.claude/brief-feasibility/preflight.mjs <draft-file> [--tool Agent|SendMessage]
 *        [--description "<text>"] [--isolation worktree] [--to <agentId>] [--cwd <checkout>]
 *
 * WHY. The owner, 2026-09-30: «Este error que sale en rojo por la HIPOTESIS o por el error que sea
 * pasárselo al de brief para que no pase más». MEASURED in session c45d798b's main transcript: 39
 * delegations or resumes were refused by brief-provenance, 20 by the orphan-work guard, 8 by
 * resume-before-fresh and 3 by brief-tenancy — each discovered one refusal at a time, by sending. The
 * guards were right; the cost was that the orchestrator met them serially. This runs them all at once
 * on a draft and prints every refusal together.
 *
 * IT DECIDES NOTHING ITSELF. The guards that run are exactly the ones the harness would run: the
 * delegation manifests the settings register, loaded and dispatched by the fleet's own dispatcher
 * (`~/.claude/hook-dispatch/dispatch.mjs`). A check added to a manifest is covered here the moment it is
 * registered, and no guard's logic is copied — the resume-before-fresh lookup, the provenance form and
 * the feasibility faces all answer through their own `evaluate`.
 *
 * THE PAYLOAD is built from the RECORDED harness payload of the tool (`~/.claude/hook-payloads/`), so a
 * guard reads the draft from the field the real call carries it in. For a resume (`--to`), the
 * recipient's harness meta is located across `~/.claude/projects/*` and the payload carries that
 * session's id and transcript path, because that is how the feasibility guard finds where the recipient
 * runs. A refusal a guard journals from here is therefore journaled under that session: it is a real
 * refusal of a real draft, only one caught before sending.
 *
 * EXIT: 0 no guard objects; 1 at least one guard refuses (every refusal printed); 2 not measured — the
 * draft is unreadable, a manifest cannot be loaded, or a guard failed to run, so silence would not mean
 * the draft is clean.
 *
 * @es Pre-chequeo de un BORRADOR de brief: todos los guards de delegación en una pasada, antes de
 * enviarlo. Medido: 39 rechazos de brief-provenance, 20 de orphan-work, 8 de resume-before-fresh y 3 de
 * brief-tenancy, descubiertos uno a uno al enviar. NO DECIDE NADA: corre exactamente los guards de los
 * manifiestos registrados, con el dispatcher de la flota, sin copiar la lógica de ninguno. Salida: 0
 * sin objeciones, 1 con rechazos (todos impresos), 2 sin medir.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dispatch } from '../hook-dispatch/dispatch.mjs';
import { payloadFor } from '../hook-payloads/payloads.mjs';
import { mainCheckoutOf } from './worker-location.mjs';

export const EXIT = Object.freeze({ CLEAN: 0, REFUSED: 1, NOT_MEASURED: 2 });

/** The session id every preflight payload carries unless a resume's recipient names a real one. @es La sesión de un pre-chequeo. */
const PREFLIGHT_SESSION = 'preflight';

const USAGE = 'usage: node preflight.mjs <draft-file> [--tool Agent|SendMessage] [--description "<text>"] [--isolation worktree] [--to <agentId>] [--cwd <checkout>]';

/** `{ draft, tool, description, isolation, to, cwd }` from argv, or `{ error }`. @es Las opciones de la línea de comandos. */
export function parseArguments(argv) {
  const options = { tool: 'Agent', description: '', isolation: undefined, to: undefined, cwd: process.cwd() };
  const flags = { '--tool': 'tool', '--description': 'description', '--isolation': 'isolation', '--to': 'to', '--cwd': 'cwd' };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const key = flags[argv[index]];

    if (key === undefined) {
      positional.push(argv[index]);
      continue;
    }

    if (index + 1 >= argv.length) return { error: `${argv[index]} needs a value. ${USAGE}` };

    options[key] = argv[index + 1];
    index += 1;
  }

  if (positional.length !== 1) return { error: USAGE };
  if (!['Agent', 'Task', 'SendMessage'].includes(options.tool)) return { error: `--tool must be Agent, Task or SendMessage. ${USAGE}` };
  if (options.tool === 'SendMessage' && options.to === undefined) return { error: `a SendMessage draft needs --to <agentId>. ${USAGE}` };

  return { ...options, draft: positional[0] };
}

/** `{ sessionId, transcriptPath }` of the session whose records hold `agentId`'s meta, or `undefined`. @es La sesión cuyo registro guarda el meta del agente. */
export function sessionOfAgent(agentId, projectsRoot = join(homedir(), '.claude', 'projects')) {
  for (const slug of readdirSync(projectsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const slugDir = join(projectsRoot, slug.name);

    for (const session of readdirSync(slugDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      if (existsSync(join(slugDir, session.name, 'subagents', `agent-${agentId}.meta.json`))) return { sessionId: session.name, transcriptPath: join(slugDir, `${session.name}.jsonl`) };
    }
  }

  return undefined;
}

/** The payload the harness would send for this draft. @es El payload que enviaría el harness para este borrador. */
export function draftPayload(text, options, locateSession = sessionOfAgent) {
  const recordingTool = options.tool === 'SendMessage' ? 'SendMessage' : 'Agent';
  const input = options.tool === 'SendMessage'
    ? { to: options.to, recipient: options.to }
    : { description: options.description, ...(options.isolation === undefined ? {} : { isolation: options.isolation }) };
  const located = options.tool === 'SendMessage' ? locateSession(options.to) : undefined;
  const payload = payloadFor(recordingTool, text, { toolName: options.tool, sessionId: located?.sessionId ?? PREFLIGHT_SESSION, input });

  return { ...payload, cwd: options.cwd, ...(located === undefined ? {} : { transcript_path: located.transcriptPath }) };
}

/** Every delegation manifest the settings register, global first. @es Todo manifiesto de delegación registrado. */
export function delegationManifests(cwd, home = homedir()) {
  return [
    join(home, '.claude', 'hook-dispatch', 'manifests', 'pretooluse-delegation.json'),
    join(mainCheckoutOf(cwd), '.claude', 'hook-dispatch', 'pretooluse-delegation.json')
  ].filter((file) => existsSync(file));
}

/**
 * Runs every manifest over the payload: `{ refusals: [{ manifest, reason }], problems: [string] }`.
 * @es Corre cada manifiesto sobre el payload.
 */
export async function preflight(payload, manifests, run = dispatch) {
  const refusals = [];
  const problems = [];

  for (const manifest of manifests) {
    try {
      const { output, problems: dispatchProblems } = await run(manifest, JSON.stringify(payload));

      problems.push(...dispatchProblems.map((problem) => `${manifest}: ${problem}`));

      if (output?.hookSpecificOutput?.permissionDecision === 'deny') refusals.push({ manifest, reason: output.hookSpecificOutput.permissionDecisionReason });
    } catch (error) {
      problems.push(`${manifest}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { refusals, problems };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.error !== undefined) {
    console.error(options.error);
    process.exitCode = EXIT.NOT_MEASURED;

    return;
  }

  let text;

  try {
    text = readFileSync(options.draft, 'utf8');
  } catch (error) {
    console.error(`PREFLIGHT NOT MEASURED: cannot read ${options.draft}: ${error instanceof Error ? error.message : String(error)}\n@es PRE-CHEQUEO SIN MEDIR: no se puede leer el borrador.`);
    process.exitCode = EXIT.NOT_MEASURED;

    return;
  }

  const manifests = delegationManifests(options.cwd);
  const { refusals, problems } = await preflight(draftPayload(text, options), manifests);

  for (const { manifest, reason } of refusals) console.log(`\n═══ ${manifest}\n\n${reason}`);

  if (problems.length > 0) {
    console.log(`\nPREFLIGHT NOT MEASURED: ${String(problems.length)} guard problem(s), so a clean result would not mean a clean draft:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\n@es PRE-CHEQUEO SIN MEDIR: algún guard no pudo decidir.`);
    process.exitCode = EXIT.NOT_MEASURED;

    return;
  }

  if (refusals.length === 0) {
    console.log(`PREFLIGHT CLEAN: ${String(manifests.length)} delegation manifest(s) ran and no guard objects.\n@es PRE-CHEQUEO LIMPIO: ningún guard objeta.`);
    process.exitCode = EXIT.CLEAN;

    return;
  }

  console.log(`\nPREFLIGHT REFUSED: fix every block above, then run this again.\n@es PRE-CHEQUEO RECHAZADO: corrige cada bloque de arriba y vuelve a correrlo.`);
  process.exitCode = EXIT.REFUSED;
}

// Only as the main process: imported by the selftest, it must not read argv or set an exit code.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
