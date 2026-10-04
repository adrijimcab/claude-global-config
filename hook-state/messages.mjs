/**
 * The bilingual runtime messages of the hook-state module: English first, then the Spanish half marked
 * `@es`, in one line. An entry without both halves throws instead of printing half a message.
 *
 * @es Los mensajes de ejecución bilingües del módulo hook-state: inglés primero y luego la mitad en español
 * marcada con `@es`, en una sola línea. Una entrada sin sus dos mitades lanza un error en vez de imprimir
 * medio mensaje.
 */

/** The message table. Placeholders are `{name}`. @es La tabla de mensajes; los marcadores son `{name}`. */
export const MESSAGES = {
  'unknown-kind': {
    en: 'Unknown journal record kind "{kind}"; allowed kinds: {allowed}.',
    es: 'Tipo de registro de journal desconocido «{kind}»; tipos permitidos: {allowed}.'
  },
  'bad-field': {
    en: 'Journal record field "{field}" is missing or has the wrong type ({expected}).',
    es: 'El campo «{field}» del registro de journal falta o tiene un tipo erróneo ({expected}).'
  },
  'bad-mechanism': {
    en: 'A mechanism name must be a plain name (letters, digits, "-" and "_"), got {value}.',
    es: 'El nombre de un mecanismo debe ser un nombre simple (letras, dígitos, «-» y «_»), se recibió {value}.'
  },
  'fires-corrupt': {
    en: 'The fires counter {file} is not a valid counter and was left untouched.',
    es: 'El contador de disparos {file} no es un contador válido y se dejó intacto.'
  }
};

/** Both halves are required and non-empty. @es Las dos mitades son obligatorias y no vacías. */
function assertHalves(id, entry) {
  if (typeof entry.en !== 'string' || entry.en === '') throw new Error(`Message "${id}" has no English half. @es El mensaje «${id}» no tiene mitad en inglés.`);
  if (typeof entry.es !== 'string' || entry.es === '') throw new Error(`Message "${id}" has no Spanish half. @es El mensaje «${id}» no tiene mitad en español.`);
}

/** Replaces each `{name}` with its parameter; a parameter nobody passed throws. @es Sustituye cada `{name}`; un parámetro no pasado lanza. */
function fill(id, text, params) {
  return text.replace(/\{(\w+)\}/g, (placeholder, name) => {
    if (!Object.hasOwn(params, name)) throw new Error(`Message "${id}" needs the parameter "${name}". @es El mensaje «${id}» necesita el parámetro «${name}».`);

    return String(params[name]);
  });
}

/**
 * The one-line bilingual text of message `id`.
 * @es El texto bilingüe de una línea del mensaje `id`.
 */
export function bilingual(id, params = {}, table = MESSAGES) {
  if (!Object.hasOwn(table, id)) throw new Error(`Unknown message id "${id}". @es Id de mensaje desconocido «${id}».`);

  assertHalves(id, table[id]);

  return `${fill(id, table[id].en, params)} @es ${fill(id, table[id].es, params)}`;
}
