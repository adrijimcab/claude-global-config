#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `hook-state/message-table.mjs`: the hook-state runtime messages, consumed through
 * `bilingual-output/`. The mechanics of rendering and of refusing a non-bilingual table are proven by the
 * `bilingual-output` selftests; this proves what is specific to THIS table: it loads (a table with a missing
 * half throws at load), it has no problem by the house shape, it holds exactly the ten messages the module
 * and the dismiss command use, and each renders to the exact text it had before the move, English first and `@es` Spanish.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `message-table.mjs`: los mensajes de ejecución de hook-state, consumidos
 * por `bilingual-output/`. La mecánica de renderizado y de rechazo de una tabla no bilingüe la prueban los
 * selftests de `bilingual-output`; esto prueba lo propio de ESTA tabla: carga (una mitad ausente lanza al
 * cargar), no tiene problemas según la forma de la casa, tiene exactamente los diez mensajes que usan el
 * módulo y el comando de descarte y cada uno se renderiza al texto exacto que tenía antes del cambio.
 */

import { messageProblems } from '../bilingual-output/message.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const EXPECTED = {
  'unknown-kind': [{ kind: 'k', allowed: 'a, b' }, 'Unknown journal record kind "k"; allowed kinds: a, b. @es Tipo de registro de journal desconocido «k»; tipos permitidos: a, b.'],
  'bad-field': [{ field: 'f', expected: 'e' }, 'Journal record field "f" is missing or has the wrong type (e). @es El campo «f» del registro de journal falta o tiene un tipo erróneo (e).'],
  'bad-mechanism': [{ value: '"v"' }, 'A mechanism name must be a plain name (letters, digits, "-" and "_"), got "v". @es El nombre de un mecanismo debe ser un nombre simple (letras, dígitos, «-» y «_»), se recibió "v".'],
  'fires-corrupt': [{ file: 'F' }, 'The fires counter F is not a valid counter and was left untouched. @es El contador de disparos F no es un contador válido y se dejó intacto.'],
  dismissed: [{ blockId: 'B', mechanism: 'm' }, 'Block B of m dismissed; it is lifted. @es Bloqueo B de m descartado; queda levantado.'],
  'false-positive-recorded': [{ blockId: 'B', mechanism: 'm' }, 'False positive reported for block B of m; the block stays in force. @es Falso positivo informado para el bloqueo B de m; el bloqueo sigue vigente.'],
  'missing-argument': [{ option: '--block' }, 'Option --block is required and needs a non-empty value. @es La opción --block es obligatoria y necesita un valor no vacío.'],
  'unknown-option': [{ option: '--x' }, 'Unknown option or argument "--x"; usage: dismiss.mjs --mechanism <name> --block <id> --reason <text> [--false-positive]. @es Opción o argumento desconocido «--x»; uso: dismiss.mjs --mechanism <nombre> --block <id> --reason <texto> [--false-positive].'],
  'already-dismissed': [{ blockId: 'B', mechanism: 'm' }, 'Block B of m is already dismissed; a dismissal is recorded once. @es El bloqueo B de m ya está descartado; un descarte se registra una sola vez.'],
  'write-failed': [{ detail: 'd' }, 'The entry could not be recorded: d. @es No se pudo registrar la entrada: d.']
};

let loaded;

try {
  loaded = await import('./message-table.mjs');
} catch (error) {
  failures.push(`the table does not load — ${error.message}`);
}

if (loaded !== undefined) {
  const { MESSAGE_TABLE, bilingual } = loaded;

  check('the table has no problem by the house shape', messageProblems(MESSAGE_TABLE), []);
  check('the table holds exactly the ten messages the module and the dismiss command use', Object.keys(MESSAGE_TABLE).sort(), Object.keys(EXPECTED).sort());

  for (const [id, [params, text]] of Object.entries(EXPECTED)) {
    let line;

    try {
      line = bilingual(id, params);
    } catch (error) {
      line = `threw: ${error.message}`;
    }

    check(`message "${id}" renders to its exact bilingual text`, line, text);
  }

  let unknown;

  try {
    bilingual('nope', {});
  } catch (error) {
    unknown = error.message;
  }

  check('an id the table does not carry throws, with its own @es half', /"nope"/.test(unknown ?? '') && /@es /.test(unknown ?? ''), true);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.error(`${failures.length} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`${passed} passed`);
