#!/usr/bin/env node
/**
 * `PreToolUse` guard on the edit tools AND the shell tools — `vendored-copy-edited-in-place`. Refuses a write
 * to any module `vendored/vendored.mjs` lists in `VENDORED`: those files in `~/.claude/` are byte-identical
 * copies of b100-am-ui's, so an in-place edit turns the provenance check red until someone notices (it stayed
 * red for a day and a half) and the next `sync` overwrites the edit anyway. The refusal names the OWNER path to
 * edit instead and the re-sync command.
 *
 * The decision lives in `decide.mjs`, pure; this file is the thin shim — stdin -> `vendoredWrites()` -> a
 * bilingual refusal -> stdout. The dispatcher journals every refusal it says, so this guard keeps no journal of
 * its own. FAILS OPEN on every malfunction of its own.
 *
 * @es Guardia `PreToolUse` sobre las herramientas de edición Y las de shell — `vendored-copy-edited-in-place`.
 * Rechaza una escritura a cualquier módulo que `vendored/vendored.mjs` liste en `VENDORED`: en `~/.claude/` son
 * copias idénticas a las de b100-am-ui, así que editarlas en sitio deja la comprobación de procedencia roja
 * (estuvo día y medio) y el siguiente `sync` sobrescribe la edición. El rechazo nombra la ruta DUEÑA que se debe
 * editar y la orden de resincronización. La decisión vive en `decide.mjs`; este fichero es el conducto fino.
 * El dispatcher registra cada rechazo, así que esta guardia no lleva journal propio. Falla ABIERTO ante cualquier
 * fallo propio.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { SOURCE_ROOT_RECORDED } from '../vendored/vendored.mjs';
import { vendoredWrites } from './decide.mjs';

const INSTALL = '~/.claude';
const SYNC_COMMAND = `node ${INSTALL}/vendored/vendored.mjs sync`;

/**
 * The bilingual refusal for the vendored modules one call writes.
 * @param {{ relative: string, via: string }[]} offences what `vendoredWrites()` found
 * @es La negativa bilingüe para los módulos vendorizados que escribe una llamada.
 */
export function refusalText(offences) {
  const installed = offences.map(({ relative, via }) => `  - ${INSTALL}/${relative} (${via})`);
  const owners = offences.map(({ relative }) => `  ${SOURCE_ROOT_RECORDED}/${relative}`);

  return [
    'VENDORED-EDIT GUARD REFUSED this call: it writes a module vendored byte-identical from b100-am-ui:',
    ...installed,
    '',
    'WHY. b100-am-ui OWNS these modules; the copy in `~/.claude/` is only kept byte-identical by `vendored.mjs sync`.',
    'An in-place edit turns `node ~/.claude/vendored/vendored.mjs check` red (EDITED IN THE KIT) and the next sync',
    'would overwrite it. Measured: an in-place edit of shell-command/shell-command.mjs left provenance red for 1.5 days.',
    '',
    'DO THIS INSTEAD:',
    '  1. edit the OWNER copy, in b100-am-ui:',
    ...owners,
    '  2. then re-sync the copy here:',
    `  ${SYNC_COMMAND}`,
    '',
    '@es VENDORED-EDIT GUARD RECHAZÓ esta llamada: escribe un módulo vendorizado idéntico desde b100-am-ui:',
    ...installed,
    '',
    'POR QUÉ. b100-am-ui es DUEÑA de estos módulos; la copia de `~/.claude/` solo se mantiene idéntica con `vendored.mjs sync`.',
    'Una edición en sitio deja `node ~/.claude/vendored/vendored.mjs check` en rojo (EDITADO EN EL KIT) y el siguiente',
    'sync la sobrescribe. Medido: una edición en sitio de shell-command/shell-command.mjs dejó la procedencia en rojo 1,5 días.',
    '',
    'HAZ ESTO EN SU LUGAR:',
    '  1. edita la copia DUEÑA, en b100-am-ui:',
    ...owners,
    '  2. y vuelve a sincronizar la copia de aquí:',
    `  ${SYNC_COMMAND}`
  ].join('\n');
}

/**
 * The hook output for a raw payload, or `undefined` to allow. Exported for the dispatcher. Fails open.
 * @param options.decide Replaces `vendoredWrites` (a test seam). @es Sustituye a `vendoredWrites` (punto de prueba).
 * @es La salida de hook para un payload crudo, o `undefined` para permitir. Falla abierto.
 */
export function evaluate(raw, { decide = vendoredWrites } = {}) {
  let offences;

  try {
    offences = decide(JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw));
  } catch {
    return undefined;
  }

  if (offences.length === 0) return undefined;

  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: refusalText(offences) } };
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return;
  }

  const output = evaluate(raw);

  if (output !== undefined) console.log(JSON.stringify(output));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
