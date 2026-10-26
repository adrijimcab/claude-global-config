/**
 * The runtime messages of `rotate.mjs`, as a table consumed through `bilingual-output/`: the speaker refuses a
 * table with a message that lacks a half at load, and renders every line English first with the Spanish half
 * marked `@es`.
 *
 * @es Los mensajes de ejecución de `rotate.mjs`, como tabla consumida por `bilingual-output/`: el speaker
 * rechaza al cargar una tabla con un mensaje sin una mitad, y renderiza cada línea en inglés primero con la mitad
 * española marcada `@es`.
 */

import { makeSpeaker } from '../bilingual-output/speaker.mjs';

/** The messages. Placeholders are `{name}`. @es Los mensajes; los marcadores son `{name}`. */
export const MESSAGE_TABLE = {
  usage: {
    en: 'REFUSED: bad arguments ({problem}). Usage: rotate.mjs [--home <dir>] [--date YYYY-MM-DD] [--dry-run | --apply].',
    es: 'RECHAZADO: argumentos inválidos ({problem}). Uso: rotate.mjs [--home <dir>] [--date AAAA-MM-DD] [--dry-run | --apply].'
  },
  'bad-date': { en: 'REFUSED: the date {date} is not YYYY-MM-DD.', es: 'RECHAZADO: la fecha {date} no es AAAA-MM-DD.' },
  'no-home': { en: 'REFUSED: the Claude home {home} is not a directory.', es: 'RECHAZADO: el home de Claude {home} no es un directorio.' },
  header: {
    en: 'Rotation plan for {home}, archive {archive} ({mode}):',
    es: 'Plan de rotación de {home}, archivo {archive} ({mode}):'
  },
  'plan-archive': { en: 'ARCHIVE  {file}: {reason}', es: 'ARCHIVAR {file}: {reason}' },
  'plan-journal': {
    en: 'ARCHIVE  {file}: hook journal; {carried} dismissal(s) still in force are carried into the fresh journal',
    es: 'ARCHIVAR {file}: journal de hooks; {carried} descarte(s) vigente(s) pasan al journal nuevo'
  },
  'plan-journal-current': {
    en: 'KEEP     {file}: hook journal that holds only the {carried} dismissal(s) in force; nothing to archive',
    es: 'MANTENER {file}: journal de hooks con solo los {carried} descarte(s) vigentes; nada que archivar'
  },
  'plan-empty': { en: 'KEEP     {file}: empty, nothing to archive', es: 'MANTENER {file}: vacío, nada que archivar' },
  'plan-keep': { en: 'KEEP     {file}: operative ({reason})', es: 'MANTENER {file}: operativo ({reason})' },
  'plan-lock': { en: 'KEEP     {file}: a lock ({reason}); while it exists --apply is refused', es: 'MANTENER {file}: un lock ({reason}); mientras exista se rechaza --apply' },
  'plan-prune': { en: 'REMOVE   {file}: past its age ({reason})', es: 'BORRAR   {file}: pasada su edad ({reason})' },
  'plan-remove': { en: 'REMOVE   {file}: obsolete ({reason})', es: 'BORRAR   {file}: obsoleto ({reason})' },
  removed: { en: 'Removed {file} ({reason}).', es: 'Borrado {file} ({reason}).' },
  'plan-unknown': {
    en: 'UNKNOWN  {file}: no known state kind; reported and left alone, never guessed',
    es: 'DESCONOCIDO {file}: ningún tipo de estado conocido; se informa y se deja intacto, nunca se adivina'
  },
  'plan-redact': {
    en: 'REPLACE  {file}: {count} line(s) still hold the `{field}` text; it is replaced by its sha256 (`{digest}`)',
    es: 'SUSTITUIR {file}: {count} línea(s) aún guardan el texto de `{field}`; se sustituye por su sha256 (`{digest}`)'
  },
  redacted: {
    en: 'Replaced the `{field}` text by its sha256 in {count} line(s) of {file}.',
    es: 'Sustituido el texto de `{field}` por su sha256 en {count} línea(s) de {file}.'
  },
  summary: {
    en: '{archive} to archive, {remove} to remove, {keep} kept, {unknown} unknown.',
    es: '{archive} por archivar, {remove} por borrar, {keep} mantenidos, {unknown} desconocidos.'
  },
  'nothing-to-do': { en: 'Nothing to rotate: every journal is already current.', es: 'Nada que rotar: cada journal ya está al día.' },
  'dry-run': { en: 'Dry run: nothing was changed. Run again with --apply to execute this plan.', es: 'Simulación: no se cambió nada. Vuelve a correr con --apply para ejecutar este plan.' },
  'would-refuse': { en: '--apply would be REFUSED now, because:', es: '--apply se RECHAZARÍA ahora, porque:' },
  refused: { en: 'REFUSED: --apply cannot run now and nothing was changed, because:', es: 'RECHAZADO: --apply no puede correr ahora y no se cambió nada, porque:' },
  'live-session': {
    en: '  - a live Claude Code session is registered in {file} (pid {pid}); close every session first',
    es: 'hay una sesión viva de Claude Code registrada en {file} (pid {pid}); cierra antes todas las sesiones'
  },
  'held-lock': {
    en: '  - a writer holds the lock {file}; wait for it to finish, or remove the lock if its writer is gone',
    es: 'un escritor tiene el lock {file}; espera a que termine, o borra el lock si su escritor ya no existe'
  },
  archived: { en: 'Archived {file} -> {target}.', es: 'Archivado {file} -> {target}.' },
  carried: { en: 'Carried {carried} dismissal(s) in force into the fresh {file}.', es: 'Pasados {carried} descarte(s) vigente(s) al nuevo {file}.' },
  done: { en: 'Rotated {count} file(s) into {archive}.', es: 'Rotados {count} fichero(s) a {archive}.' },
  failed: { en: 'FAILED on {file}: {detail}. The files listed above were rotated; the rest are untouched.', es: 'FALLÓ en {file}: {detail}. Los ficheros de arriba se rotaron; el resto está intacto.' }
};

/** A speaker over the table, for `sink`. @es Un speaker sobre la tabla. */
export const speakerFor = (sink) => makeSpeaker(MESSAGE_TABLE, sink);
