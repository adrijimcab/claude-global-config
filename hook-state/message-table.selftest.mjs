#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `hook-state/message-table.mjs`: the hook-state runtime messages, consumed through
 * `bilingual-output/`. The mechanics of rendering and of refusing a non-bilingual table are proven by the
 * `bilingual-output` selftests; this proves what is specific to THIS table: it loads (a table with a missing
 * half throws at load), it has no problem by the house shape, it holds exactly the messages the module
 * and the dismiss command use, and each renders to the exact text it had before the move, English first and `@es` Spanish.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `message-table.mjs`: los mensajes de ejecución de hook-state, consumidos
 * por `bilingual-output/`. La mecánica de renderizado y de rechazo de una tabla no bilingüe la prueban los
 * selftests de `bilingual-output`; esto prueba lo propio de ESTA tabla: carga (una mitad ausente lanza al
 * cargar), no tiene problemas según la forma de la casa, tiene exactamente los mensajes que usan el
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
  'fires-busy': [{ file: 'F' }, 'The fires counter F stayed locked by another process; this fire was not counted. @es Otro proceso mantuvo bloqueado el contador de disparos F; este disparo no se contó.'],
  'fires-budget-spent': [{ file: 'F' }, 'The fires counter F was not tried again: the wait budget it shares with the other counters of this run was spent; this fire was not counted. @es El contador de disparos F no se volvió a intentar: se agotó el presupuesto de espera que comparte con los demás contadores de esta corrida; este disparo no se contó.'],
  'fires-uncounted': [{ mechanism: 'm' }, 'This fire of m was not counted; the reason is in the record. @es Este disparo de m no se contó; el motivo está en el registro.'],
  'lock-create-fault': [{ file: 'L', code: 'EPERM', detail: 'd' }, 'The lock L could not be created (EPERM): d. This is a fault, not another writer holding it. @es No se pudo crear el lock L (EPERM): d. Es un fallo, no otro escritor que lo tiene.'],
  'lock-break-fault': [{ file: 'L', code: 'EIO', detail: 'd' }, 'The stale lock L could not be broken (EIO): d. @es No se pudo romper el lock caducado L (EIO): d.'],
  'lock-break-journal-fault': [{ file: 'L', code: 'EISDIR', detail: 'd' }, 'The break of the stale lock L could not be journaled (EISDIR): d. The lock was taken all the same. @es No se pudo registrar la rotura del lock caducado L (EISDIR): d. El lock se tomó igualmente.'],
  'lock-release-fault': [{ file: 'L', code: 'EIO', detail: 'd' }, 'The lock L could not be released (EIO): d. @es No se pudo soltar el lock L (EIO): d.'],
  'lock-breaker-release-fault': [{ file: 'B', code: 'EPERM', detail: 'd' }, 'The breaker B could not be released (EPERM): d. It is left for a later break to clear once this process has exited. @es No se pudo soltar el breaker B (EPERM): d. Queda para que una rotura posterior lo quite cuando este proceso haya terminado.'],
  'lock-broken-dead-owner': [{ file: 'L', ageMs: 5, pid: 7 }, 'The lock L was 5 ms old and its owner pid 7 is gone; it was broken. @es El lock L tenía 5 ms y su dueño, el pid 7, ya no existe; se rompió.'],
  'lock-broken-no-owner': [{ file: 'L', ageMs: 5 }, 'The lock L was 5 ms old and names no owner (empty or unreadable); it was broken by its age. @es El lock L tenía 5 ms y no nombra dueño (vacío o ilegible); se rompió por su edad.'],
  'lock-broken-ceiling': [{ file: 'L', ageMs: 5, ceilingMs: 4, pid: 7 }, 'The lock L was 5 ms old, past the absolute ceiling of 4 ms, and was broken although its owner pid 7 still answers: a reused pid must not wedge the lock. @es El lock L tenía 5 ms, más que el techo absoluto de 4 ms, y se rompió aunque su dueño, el pid 7, aún responde: un pid reutilizado no debe bloquear el lock.'],
  dismissed: [{ blockId: 'B', mechanism: 'm' }, 'Block B of m dismissed; it is lifted. @es Bloqueo B de m descartado; queda levantado.'],
  'false-positive-recorded': [{ blockId: 'B', mechanism: 'm' }, 'False positive reported for block B of m; the block stays in force. @es Falso positivo informado para el bloqueo B de m; el bloqueo sigue vigente.'],
  'missing-argument': [{ option: '--block' }, 'Option --block is required and needs a non-empty value. @es La opción --block es obligatoria y necesita un valor no vacío.'],
  'unknown-option': [{ option: '--x' }, 'Unknown option or argument "--x"; usage: dismiss.mjs --mechanism <name> --block <id> --reason <text> [--false-positive]. @es Opción o argumento desconocido «--x»; uso: dismiss.mjs --mechanism <nombre> --block <id> --reason <texto> [--false-positive].'],
  'already-dismissed': [{ blockId: 'B', mechanism: 'm' }, 'Block B of m is already dismissed; a dismissal is recorded once. @es El bloqueo B de m ya está descartado; un descarte se registra una sola vez.'],
  'write-failed': [{ detail: 'd' }, 'The entry could not be recorded: d. @es No se pudo registrar la entrada: d.']
};

let loaded;

try {
  // Both modules are loaded here, not at the top: `locations.mjs` imports the table, so a malformed table
  // throws while either loads, and that must be a failed check, not an uncaught crash of the proof. The state
  // is redirected to a temp directory first: never the live one a real session reads.
  // @es Ambos módulos se cargan aquí y no arriba: `locations.mjs` importa la tabla, así que una tabla mal
  // formada lanza al cargar cualquiera de los dos, y eso debe ser un check fallido, no una caída sin capturar
  // de la prueba. El estado se redirige antes a un directorio temporal: nunca al vivo que lee una sesión real.
  const { isolateState } = await import('../hook-state/locations.mjs');

  isolateState('hook-state');
  loaded = await import('./message-table.mjs');
} catch (error) {
  failures.push(`the table does not load — ${error.message}`);
}

if (loaded !== undefined) {
  const { MESSAGE_TABLE, bilingual } = loaded;

  check('the table has no problem by the house shape', messageProblems(MESSAGE_TABLE), []);
  check('the table holds exactly the messages the module and the dismiss command use', Object.keys(MESSAGE_TABLE).sort(), Object.keys(EXPECTED).sort());

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
