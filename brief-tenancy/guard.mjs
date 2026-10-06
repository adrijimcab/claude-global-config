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

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { stateDir } from '../hook-state/locations.mjs';
import { reason, refusalFor } from './decision.mjs';

/** Where this mechanism keeps its state, resolved at each call through the one state-location module. @es Dónde guarda su estado este mecanismo, resuelto en cada llamada por el único módulo de ubicaciones. */
const stateDirectory = () => stateDir('brief-tenancy');

/**
 * Where the fleet keeps the answer to "which field does tool X carry its text in?".
 *
 * ADDRESSED THROUGH THE HOME DIRECTORY, never by counting `..` segments out of this file: this guard
 * lives inside the repository and that module lives beside the user's own configuration, so a relative
 * path between them encodes how deep this repository happens to sit on disk. Resolved as a file URL
 * because an absolute Windows path is not an importable ESM specifier.
 * @es Dónde guarda la flota la respuesta a «¿en qué campo lleva su texto la herramienta X?». Se
 * direcciona por el directorio personal y no contando segmentos `..`, porque una ruta relativa entre
 * ambos codificaría a qué profundidad está este repositorio en el disco.
 */
const CARRIERS = pathToFileURL(join(homedir(), '.claude', 'brief-provenance', 'provenance.mjs')).href;

/** The journal is evidence, never a precondition: its failure must not change the decision. @es Diario. */
function journal(entry) {
  try {
    mkdirSync(stateDirectory(), { recursive: true });
    appendFileSync(join(stateDirectory(), 'refusals.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* intentionally silent */
  }
}

function allow() {
  process.exit(0);
}

/**
 * La salida de hook para un payload crudo, o `undefined`. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra en su propio proceso; ejecutada directamente, la
 * misma función corre como hook propio (`main`, abajo).
 */
export async function evaluate(raw) {
  let payload;

  try {
    // A PowerShell-written payload can carry a UTF-8 BOM, which makes JSON.parse throw.
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

    payload = JSON.parse(text);
  } catch {
    return undefined;
  }

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

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason(refusal, brief.surface, brief.toolName)
    }
  };

  process.exit(0);
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }

  Promise.resolve()
    .then(() => evaluate(raw))
    .then((output) => {
      if (output !== undefined) console.log(JSON.stringify(output));
    })
    .catch(() => {
      /* un fallo propio de la guardia deja pasar la llamada */
    })
    .finally(() => process.exit(0));
}

// Solo como proceso principal. Si otro módulo la importa (el dispatcher, un selftest), main() no corre:
// leería el stdin del importador y lo cortaría con process.exit(0) a mitad de camino.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
