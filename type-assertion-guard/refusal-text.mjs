/**
 * The refusal text shown to the agent that tried to add a type assertion — bilingual (English, then
 * `@es`), naming every newly added assertion by line:column and what to do instead, per the owner's
 * directive: «NO QUIERO QUE SE VUELVA A ESCRIBIR CODIGO ASÍ EN NINGUN REPO, Y QUIERO QUE LO CACE ALGUN
 * GATE» — this guard IS that gate, for the authoring moment, everywhere on this machine.
 *
 * No bypass flag, no allowlist, no per-repo opt-out is offered here, on purpose — the owner rule
 * `failure-hidden-in-a-central-exception-registry`: a rule with an escape hatch is a rule that survives
 * exactly until someone is in a hurry.
 *
 * @es El texto de rechazo, bilingüe, que nombra cada aserción nueva con línea:columna y qué hacer en su
 * lugar. Sin bandera de salto, sin lista blanca: la regla `failure-hidden-in-a-central-exception-registry`
 * — una regla con escapatoria sobrevive exactamente hasta que alguien tiene apuro.
 */

const KIND_LABEL_EN = { as: 'type assertion (`as`)', 'angle-bracket': 'angle-bracket type assertion (`<T>x`)', 'non-null': 'non-null assertion (`!`)' };
const KIND_LABEL_ES = { as: 'aserción de tipo (`as`)', 'angle-bracket': 'aserción de tipo en ángulos (`<T>x`)', 'non-null': 'aserción de no-nulo (`!`)' };

/** Keeps a long literal from making the message unreadable, without hiding which one it is. */
function truncate(text, max = 120) {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function listLines(newlyAdded, labels) {
  return newlyAdded.map((assertion) => `  - ${assertion.line}:${assertion.column} — ${labels[assertion.kind] ?? assertion.kind}: \`${truncate(assertion.text)}\``).join('\n');
}

/**
 * @param {string} filePath
 * @param {import('./collect-assertions.mjs').AssertionRecord[]} newlyAdded Non-empty.
 * @param {number} beforeCount
 * @param {number} afterCount
 * @returns {string} The full bilingual `permissionDecisionReason`.
 */
export function refusalText(filePath, newlyAdded, beforeCount, afterCount) {
  return [
    `TYPE ASSERTION GUARD REFUSED: this edit would raise ${filePath}'s value-level type assertions from ${beforeCount} to ${afterCount}.`,
    'New code may never ADD a type assertion (`x as T`, `<T>x`, `as unknown as T`, or the postfix non-null `!`); existing debt in the file may only shrink, never grow. Owner directive: "no quiero que se vuelva a escribir código así en ningún repo, y quiero que lo cace algún gate."',
    '',
    'NEWLY ADDED, by line:column:',
    listLines(newlyAdded, KIND_LABEL_EN),
    '',
    'INSTEAD OF ASSERTING THE TYPE:',
    '  - narrow the value with a real type guard (a user-defined type predicate, `typeof`, `instanceof`, a discriminant check);',
    '  - express the contract with `satisfies` instead of `as` — it checks without discarding the inferred type (always allowed);',
    '  - build the value through a typed factory function that returns the exact type, instead of casting a loosely-typed one;',
    '  - split the output per mode/branch into its own correctly-typed path, instead of unioning it and casting the union away;',
    '  - add an overload signature that returns the narrower type for the input shape that produces it;',
    '  - or fix the type at its source — the function, generic, or interface that is really too wide for this use.',
    '',
    'There is no bypass flag and no allowlist for this guard. The fix belongs in the code, never in an exception.',
    '',
    '─────────',
    '',
    `@es GUARDIA DE ASERCIONES DE TIPO RECHAZÓ: esta edición subiría las aserciones de tipo en tiempo de valor de ${filePath} de ${beforeCount} a ${afterCount}.`,
    'El código nuevo NUNCA puede AÑADIR una aserción de tipo (`x as T`, `<T>x`, `as unknown as T`, o el `!` postfijo de no-nulo); la deuda ya existente en el fichero solo puede achicarse, nunca crecer. Directiva del dueño: «no quiero que se vuelva a escribir código así en ningún repo, y quiero que lo cace algún gate».',
    '',
    'NUEVAS, por línea:columna:',
    listLines(newlyAdded, KIND_LABEL_ES),
    '',
    'EN VEZ DE ASERTAR EL TIPO:',
    '  - estrechar el valor con un type guard real (un predicado de tipo definido por el usuario, `typeof`, `instanceof`, una comprobación de discriminante);',
    '  - expresar el contrato con `satisfies` en vez de `as` — comprueba sin descartar el tipo inferido (siempre permitido);',
    '  - construir el valor con una fábrica tipada que devuelva el tipo exacto, en vez de castear uno flojamente tipado;',
    '  - separar la salida por modo/rama en su propio camino bien tipado, en vez de unirla y castear la unión;',
    '  - agregar una sobrecarga (`overload`) que devuelva el tipo más angosto para la forma de entrada que lo produce;',
    '  - o corregir el tipo en su origen — la función, el genérico o la interfaz que es realmente demasiado ancha para este uso.',
    '',
    'No hay bandera de salto ni lista blanca para esta guardia. La corrección va en el código, nunca en una excepción.'
  ].join('\n');
}
