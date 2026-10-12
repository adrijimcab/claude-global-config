/**
 * Turns texts, added lines and paths into FINDINGS — `{ where, name, excerpt }` — by asking the whole-word
 * matcher of `company-config`, and renders findings as the bilingual list both company guards print. A
 * finding always says WHERE (`path:line`, a path, or a message label), WHICH listed name, and a short
 * excerpt of the line around it.
 *
 * @es Convierte textos, líneas añadidas y rutas en HALLAZGOS — `{ where, name, excerpt }` — con el
 * comparador por palabra completa de `company-config`, y los muestra como la lista bilingüe que imprimen
 * las dos guardias. Un hallazgo dice siempre DÓNDE (`ruta:línea`, una ruta o la etiqueta de un mensaje),
 * QUÉ nombre y un extracto corto de la línea.
 */

import { findNames } from '../company-config/names.mjs';
import { attributionHits } from './attribution.mjs';
import { toolPathTerms } from './tool-paths.mjs';

/** The widest excerpt shown, so a minified line never floods a refusal. @es El extracto más ancho que se muestra. */
const EXCERPT_WIDTH = 100;

/** The line of `text` holding `index`, trimmed to the excerpt width. @es La línea de `text` que contiene `index`. */
function lineAround(text, index) {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  const line = text.slice(start, end === -1 ? text.length : end).trim();

  return line.length > EXCERPT_WIDTH ? `${line.slice(0, EXCERPT_WIDTH)}...` : line;
}

/** One finding per listed name found in `text`, all reported at `where`. @es Un hallazgo por nombre encontrado en `text`. */
export function scanText(text, names, where) {
  return findNames(text, names).map((hit) => ({ where, name: hit.name, excerpt: lineAround(text, hit.index) }));
}

/** `scanText` plus the attribution a COMMIT MESSAGE may not carry. @es `scanText` más la atribución que un MENSAJE DE COMMIT no puede llevar. */
export function scanMessage(text, names, where) {
  const lines = text.split('\n');
  const attributed = attributionHits(text).map((hit) => ({ where, name: hit.name, excerpt: `(attribution) ${lines[hit.line - 1].trim().slice(0, EXCERPT_WIDTH)}` }));

  return [...scanText(text, names, where), ...attributed];
}

/** Findings in added lines, reported as `path:line`. @es Hallazgos en líneas añadidas, como `ruta:línea`. */
export function scanAdded(added, names) {
  return added.flatMap((entry) => scanText(entry.text, names, `${entry.path}:${entry.line}`));
}

/**
 * Findings in file PATHS: a path that names a tool, or sits where a tool keeps its files, is itself a leak.
 * @es Hallazgos en RUTAS de fichero: una ruta que nombra una herramienta, o que está donde una herramienta guarda sus ficheros, ya es una fuga.
 */
export function scanPaths(paths, names) {
  return paths.flatMap((path) => [
    ...scanText(path, names, path).map((finding) => ({ ...finding, excerpt: `(path) ${finding.excerpt}` })),
    ...toolPathTerms(path).map((term) => ({ where: path, name: term, excerpt: `(tool path) ${path}` }))
  ]);
}

/** The bilingual list of findings, at most `limit` shown. @es La lista bilingüe de hallazgos, con tope `limit`. */
export function renderFindings(findings, limit = 20) {
  const shown = findings.slice(0, limit);
  const more = findings.length - shown.length;
  const lines = shown.map((finding) => `  ${finding.where}  [${finding.name}]  ${finding.excerpt}`);

  if (more > 0) lines.push(`  ... and ${more} more. @es ... y ${more} más.`);

  return lines.join('\n');
}
