/**
 * The AREAS a project declares for its own lessons, in `<project>/.claude/failure-capture.json`:
 *   "areas": { "<name>": { "about": "<what the area is>", "paths": ["<glob>", …] }, … }
 * The same shape as the home's areas (`ledger-routes.mjs`): a project's area ledger is
 * `<project>/.claude/rules/lessons-<name>.md`, scoped by a `paths:` frontmatter, so Claude Code loads it ONLY
 * when a file matching those globs is read. This module owns the shape and its validation, nothing else.
 *
 * @es Las ÁREAS que un proyecto declara para sus propias lecciones, en `<proyecto>/.claude/failure-capture.json`:
 * `"areas": { "<nombre>": { "about": "<qué es el área>", "paths": ["<glob>", …] } }`. Misma forma que las áreas
 * del home: el ledger de área de un proyecto es `<proyecto>/.claude/rules/lessons-<nombre>.md`, con frontmatter
 * `paths:`, así que Claude Code lo carga SOLO al leer un fichero que coincide con esos globs. Este módulo es
 * dueño de la forma y su validación, nada más.
 */

import { isValidKey } from './ledger-line.mjs';

/** Whether a character is a control character (C0 or DEL), line breaks included. @es Si un carácter es de control (C0 o DEL), saltos de línea incluidos. */
const isControl = (character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f;

/**
 * A glob is written between double quotes in the YAML frontmatter, where a backslash starts an escape and a quote ends
 * the scalar, so it may hold no backslash, no double quote and no control character. A Windows separator is not
 * refused: `normalizedAreas` turns it into a forward slash before the declaration is validated.
 * @es Un glob va entre comillas dobles en el frontmatter YAML, donde una barra invertida inicia un escape y una comilla
 * cierra el escalar, así que no puede llevar barra invertida, comilla doble ni carácter de control. Un separador de
 * Windows no se rechaza: `normalizedAreas` lo convierte en barra normal antes de validar la declaración.
 */
const isWritableGlob = (glob) => typeof glob === 'string' && glob.length > 0 && ![...glob].some((character) => character === '"' || character === '\\' || isControl(character));

/** Whether an `about` can be written into the header: no line break, which would inject lines into the ledger. @es Si un `about` puede escribirse en el encabezado: sin saltos de línea, que inyectarían líneas en el ledger. */
const isWritableAbout = (about) => typeof about === 'string' && about.length > 0 && !about.includes('\n') && !about.includes('\r');

/**
 * Whether a glob matches every file (`**`, `**\/*`, `**\/**`, …): an area with one is loaded always, so it is not path-scoped.
 * @es Si un glob coincide con todo fichero (`**`, `**\/*`, `**\/**`, …): un área con uno se carga siempre, así que no tiene alcance de ruta.
 */
function matchesEverything(glob) {
  let rest = glob;

  while (rest.endsWith('/**') || rest.endsWith('/*')) rest = rest.slice(0, rest.lastIndexOf('/'));

  return rest === '**';
}

/**
 * `areas` with every glob's Windows separators turned into forward slashes, so a glob declared as `src\app\**` is
 * written and matched as `src/app/**`; anything that is not a list of text is left as it is, for `areaProblems` to name.
 * @es `areas` con los separadores de Windows de cada glob convertidos en barras normales, así un glob declarado como
 * `src\app\**` se escribe y se compara como `src/app/**`; lo que no es una lista de texto se deja igual, para que
 * `areaProblems` lo nombre.
 */
export function normalizedAreas(areas) {
  if (typeof areas !== 'object' || areas === null || Array.isArray(areas)) return areas;

  return Object.fromEntries(Object.entries(areas).map(([name, area]) => [name, Array.isArray(area?.paths) ? { ...area, paths: area.paths.map((glob) => (typeof glob === 'string' ? glob.replaceAll('\\', '/') : glob)) } : area]));
}

/**
 * The defects of a declared `areas` value, bilingual; empty when it is valid (or absent).
 * @param areas the value of the `areas` key, or `undefined`.
 * @es Los defectos de un valor `areas` declarado, bilingües; vacío si es válido (o falta).
 */
export function areaProblems(areas) {
  if (areas === undefined) return [];
  if (typeof areas !== 'object' || areas === null || Array.isArray(areas)) return ['"areas" must be an object of area name -> { about, paths }. @es "areas" debe ser un objeto nombre de área -> { about, paths }'];

  return Object.entries(areas).flatMap(([name, area]) => [
    ...(isValidKey(name) ? [] : [`the area name "${name}" must be lowercase kebab, 4 to 60 characters. @es el nombre de área "${name}" debe ser kebab en minúsculas, de 4 a 60 caracteres`]),
    ...(typeof area === 'object' && area !== null && !Array.isArray(area) ? [] : [`the area "${name}" must be an object { about, paths }. @es el área "${name}" debe ser un objeto { about, paths }`]),
    ...(isWritableAbout(area?.about) ? [] : [`the area "${name}" needs a non-empty "about" on one line. @es el área "${name}" necesita un "about" no vacío y en una sola línea`]),
    ...(Array.isArray(area?.paths) && area.paths.length > 0 && area.paths.every(isWritableGlob) ? [] : [`the area "${name}" needs a non-empty "paths" list of globs with no double quote, backslash or control character. @es el área "${name}" necesita una lista "paths" no vacía de globs sin comillas dobles, barras invertidas ni caracteres de control`]),
    ...(Array.isArray(area?.paths) && area.paths.some((glob) => typeof glob === 'string' && matchesEverything(glob)) ? [`the area "${name}" has a glob that matches every file, so it would be loaded always, not path-scoped. @es el área "${name}" tiene un glob que coincide con todo fichero, así que se cargaría siempre, sin alcance de ruta`] : []),
    ...Object.keys(area ?? {}).filter((key) => key !== 'about' && key !== 'paths').map((key) => `the area "${name}" has the unknown key "${key}". @es el área "${name}" tiene la clave desconocida "${key}"`)
  ]);
}
