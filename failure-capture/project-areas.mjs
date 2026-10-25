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

/** A glob is written between double quotes in the frontmatter, so it may hold neither a quote nor a line break. @es Un glob va entre comillas dobles en el frontmatter, así que no puede llevar comillas ni saltos de línea. */
const isWritableGlob = (glob) => typeof glob === 'string' && glob.length > 0 && ![...glob].some((character) => character === '"' || character === '\n' || character === '\r');

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
    ...(typeof area?.about === 'string' && area.about.length > 0 ? [] : [`the area "${name}" needs a non-empty "about". @es el área "${name}" necesita un "about" no vacío`]),
    ...(Array.isArray(area?.paths) && area.paths.length > 0 && area.paths.every(isWritableGlob) ? [] : [`the area "${name}" needs a non-empty "paths" list of globs with no double quote or line break. @es el área "${name}" necesita una lista "paths" no vacía de globs sin comillas dobles ni saltos de línea`]),
    ...Object.keys(area ?? {}).filter((key) => key !== 'about' && key !== 'paths').map((key) => `the area "${name}" has the unknown key "${key}". @es el área "${name}" tiene la clave desconocida "${key}"`)
  ]);
}
