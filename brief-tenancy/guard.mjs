#!/usr/bin/env node
/**
 * `PreToolUse` guard on delegation and resume — the hook shim for `decision.mjs`.
 *
 * WHERE IT MUST RUN, AND THE MEASURED TRAP IT AVOIDS. A guard registered for `Agent|Task` alone never
 * sees `SendMessage`, and `SendMessage` does not carry a `prompt`: its text is in `tool_input.message`,
 * with `tool_input.content` holding only a 50-character preview. That exact gap was measured on
 * 2026-09-14, when `brief-provenance` passed its own self-test while every real resume ran unguarded —
 * its fixtures invented a payload shape the harness never sends. So this file names no field itself:
 * `BRIEF_CARRIERS` in `brief-provenance/provenance.mjs` owns which tool carries its text where, the
 * registration is declared beside this file in `guard.mjs.hook-registration.json`, and `selftest.mjs`
 * replays a RECORDED harness payload for each tool rather than one typed from memory.
 *
 * ONE DECISION PER CALL, and no cooldown — which is a decision, not an omission. A guard that let a
 * re-sent identical brief through on its second attempt would be an escape hatch, and this repository's
 * hardest standing rule forbids exactly that. Two delegations launched in one turn are two briefs, each
 * needing its own fix, so each is decided on its own. What is bounded instead is NOISE: at most one
 * refusal is ever emitted for one payload.
 *
 * FAILS OPEN on every malfunction of its own — an unparseable payload, a throw in the decision, an
 * unreadable filesystem. A guard that can wedge delegation is a larger hazard than the one it closes.
 *
 * @es Guard de `PreToolUse` sobre delegación y resume: el shim de `decision.mjs`. DÓNDE DEBE CORRER, y
 * la trampa MEDIDA que evita: un guard registrado solo para `Agent|Task` no ve `SendMessage`, y
 * `SendMessage` no lleva `prompt` sino `message`. Este fichero no nombra ningún campo: lo posee
 * `BRIEF_CARRIERS`, el registro se declara en el sidecar, y el selftest reproduce un payload REGISTRADO
 * del harness por herramienta. UNA DECISIÓN POR LLAMADA Y SIN ENFRIAMIENTO, que es una decisión y no un
 * olvido: dejar pasar el mismo brief al segundo intento sería una vía de escape, y la regla más dura de
 * este repositorio las prohíbe. FALLA ABIERTO ante todo fallo propio.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { deny, hookMain, runWhenMain, tryParsePayload } from '../hook-io/hook-io.mjs';
import { stateDir } from '../hook-state/locations.mjs';
import { reason, refusalFor } from './decision.mjs';

/** Where this mechanism keeps its state, resolved at each call through the one state-location module. @es Dónde guarda su estado este mecanismo, resuelto en cada llamada por el único módulo de ubicaciones. */
const stateDirectory = () => stateDir('brief-tenancy');

/**
 * Where the fleet keeps the answer to "which field does tool X carry its text in?".
 *
 * LOCATED BESIDE THIS FILE, never through the user's home: both modules belong to the same repository, so
 * the sibling is wherever this checkout is — the install, a worktree, a selftest sandbox or a mutation
 * copy. Addressing it through the home made the guard import ANOTHER checkout's module, and fail OPEN,
 * silently, in every home that held no install (measured in the selftest sandbox; `selftest.mjs` now
 * replays the incident under an empty home and requires the denial).
 * @es Dónde guarda la flota la respuesta a «¿en qué campo lleva su texto la herramienta X?». Se ubica JUNTO
 * A ESTE FICHERO, nunca por el home del usuario: ambos módulos son del mismo repositorio, así que el hermano
 * está donde esté este checkout (la instalación, un worktree, el sandbox de un selftest o una copia de
 * mutación). Buscarlo por el home importaba el módulo de OTRO checkout y fallaba ABIERTO, en silencio, en
 * todo home sin instalación (medido en el sandbox; `selftest.mjs` repite el incidente con un home vacío y
 * exige la denegación).
 */
const CARRIERS = new URL('../brief-provenance/provenance.mjs', import.meta.url).href;

/** The journal is evidence, never a precondition: its failure must not change the decision. @es Diario. */
function journal(entry) {
  try {
    mkdirSync(stateDirectory(), { recursive: true });
    appendFileSync(join(stateDirectory(), 'refusals.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* intentionally silent */
  }
}

/**
 * La salida de hook para un payload crudo, o `undefined`. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra en su propio proceso; ejecutada directamente, la
 * misma función corre como hook propio (`main`, abajo).
 */
export async function evaluate(raw) {
  const payload = tryParsePayload(raw);

  if (payload === undefined) return undefined;

  // A missing carrier map fails OPEN, which would disable this guard SILENTLY — so `selftest.mjs`
  // asserts that it resolves and that it covers every tool the registration routes here. That is what
  // turns a silent disabling into a red proof instead of an invisible one.
  const { briefOf } = await import(CARRIERS);
  const brief = briefOf(payload);

  if (brief === undefined) return undefined;

  const refusal = refusalFor(brief.text);

  if (refusal === undefined) return undefined;

  // The journal records the DECLARATION STATE of each checkout. A run of `absent` says the declaration
  // is unknown to its authors; a run of `unnamed` says the line is being written as boilerplate and the
  // path binding is doing its work — two different remedies, and only the record tells them apart.
  journal({
    at: new Date().toISOString(),
    session: payload?.session_id,
    tool: brief.toolName,
    mutations: refusal.mutations,
    checkouts: refusal.checkouts.map(({ checkout, tenancy, declaration }) => ({ checkout, state: tenancy.state, declaration }))
  });

  return deny(reason(refusal, brief.surface, brief.toolName));
}

/** `evaluate` for the standalone hook: a malfunction of this guard allows the call. @es `evaluate` para el hook independiente: un fallo propio de la guardia deja pasar la llamada. */
const evaluateOrAllow = async (raw) => {
  try {
    return await evaluate(raw);
  } catch {
    return undefined;
  }
};

const standalone = hookMain(evaluateOrAllow);

// Solo como proceso principal. Si otro módulo la importa (el dispatcher, un selftest), el hook no corre:
// leería el stdin del importador. El proceso termina con estado 0.
runWhenMain(import.meta.url, () => standalone().then(() => process.exit(0)));
