/**
 * The runtime messages of the hand-labelling command, as a table consumed through `bilingual-output/`: the
 * speaker refuses a table with a message that lacks a half at load, and renders every line English first with
 * the Spanish half marked `@es`. Placeholders are `{name}`.
 *
 * @es Los mensajes de ejecución del comando de etiquetado a mano, como una tabla consumida por
 * `bilingual-output/`: el speaker rechaza al cargar una tabla con un mensaje al que le falta una mitad, y
 * renderiza cada línea en inglés primero con la mitad española marcada `@es`. Los marcadores son `{name}`.
 */

import { makeSpeaker } from '../bilingual-output/speaker.mjs';

/** The messages. Placeholders are `{name}`. @es Los mensajes; los marcadores son `{name}`. */
export const MESSAGE_TABLE = {
  'sample-header': {
    en: '{mechanism}: {shown} of the {drawn} sampled blocks still to label (seed {seed}); {labelled} of {blocks} blocks labelled by sample.',
    es: '{mechanism}: {shown} de los {drawn} bloqueos muestreados por etiquetar (semilla {seed}); {labelled} de {blocks} bloqueos etiquetados por muestra.'
  },
  'sample-block': {
    en: 'block {blockId}: {ts}, {event}, tool use {toolUseId}, input digest {digest}, reason: {reason}.',
    es: 'bloqueo {blockId}: {ts}, {event}, uso de herramienta {toolUseId}, huella de la entrada {digest}, motivo: {reason}.'
  },
  'sample-usage': {
    en: 'Label a sampled block you judged: label.mjs --mechanism <name> --seed {seed} --sample {size} --correct <blockId> | --false <blockId>.',
    es: 'Etiqueta un bloqueo muestreado que hayas juzgado: label.mjs --mechanism <nombre> --seed {seed} --sample {size} --correct <blockId> | --false <blockId>.'
  },
  'no-blocks': {
    en: 'No guard has blocks to label.',
    es: 'Ningún guard tiene bloqueos que etiquetar.'
  },
  'labelled-correct': {
    en: 'Block {blockId} of {mechanism} labelled correct (a true positive).',
    es: 'Bloqueo {blockId} de {mechanism} etiquetado como acertado (un verdadero positivo).'
  },
  'labelled-false': {
    en: 'Block {blockId} of {mechanism} labelled false (a false block); the block stays in force.',
    es: 'Bloqueo {blockId} de {mechanism} etiquetado como falso (un falso bloqueo); el bloqueo sigue vigente.'
  },
  'no-guard': {
    en: 'No guard journal was found for {mechanism}.',
    es: 'No se encontró ningún journal del guard {mechanism}.'
  },
  'not-sampled': {
    en: 'Block {blockId} of {mechanism} is not in the sample of {size} (seed {seed}): only a sampled block can be labelled here, because only a random sample estimates the rate. Report a block of your own choosing with dismiss.mjs.',
    es: 'El bloqueo {blockId} de {mechanism} no está en la muestra de {size} (semilla {seed}): aquí solo se etiqueta un bloqueo muestreado, porque solo una muestra aleatoria estima la tasa. Informa de un bloqueo elegido por ti con dismiss.mjs.'
  },
  'unknown-block': {
    en: 'Block {blockId} of {mechanism} is not a recorded block.',
    es: 'El bloqueo {blockId} de {mechanism} no es un bloqueo registrado.'
  },
  'already-labelled': {
    en: 'Block {blockId} of {mechanism} is already labelled {label}.',
    es: 'El bloqueo {blockId} de {mechanism} ya está etiquetado como {label}.'
  },
  'missing-argument': {
    en: 'Option {option} is required and needs a non-empty value.',
    es: 'La opción {option} es obligatoria y necesita un valor no vacío.'
  },
  'duplicate-option': {
    en: 'Option {option} was given more than once.',
    es: 'La opción {option} se indicó más de una vez.'
  },
  'options-conflict': {
    en: 'Options {first} and {second} cannot be used together.',
    es: 'Las opciones {first} y {second} no se pueden usar juntas.'
  },
  'bad-sample': {
    en: 'Option --sample needs a positive whole number, got "{value}".',
    es: 'La opción --sample necesita un número entero positivo, se recibió «{value}».'
  },
  'unknown-option': {
    en: 'Unknown option or argument "{option}"; usage: label.mjs [--mechanism <name>] [--sample <n>] [--seed <text>] | label.mjs --mechanism <name> [--sample <n>] [--seed <text>] (--correct <blockId> | --false <blockId>).',
    es: 'Opción o argumento desconocido «{option}»; uso: label.mjs [--mechanism <nombre>] [--sample <n>] [--seed <texto>] | label.mjs --mechanism <nombre> [--sample <n>] [--seed <texto>] (--correct <blockId> | --false <blockId>).'
  },
  'command-failed': {
    en: 'The command failed: {detail}.',
    es: 'El comando falló: {detail}.'
  }
};

/** The one-line bilingual text of a message of the table. @es El texto bilingüe de una línea de un mensaje de la tabla. */
export const { line: bilingual } = makeSpeaker(MESSAGE_TABLE);
