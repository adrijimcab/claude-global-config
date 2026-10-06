/**
 * The ONE line a session reads about its project: what the profile measured, then where the version-correct
 * rules, docs and gates are. Angular gets the support status (an EOL or near-EOL major is named with its date
 * and the next major, once per session, because a major without patches is a security posture, not a style
 * choice), the column of `rules/fe-angular.md` to apply, and the docs: for 21+ the official rules file that
 * `@angular/core` ships (`node_modules/@angular/core/resources/best-practices.md`, read first) plus this
 * repository's delta file; for 19/20, where no official file ships, this repository's file is the full source.
 *
 * Pure: the day and the existence test are injected, so the selftest decides every branch without a clock or
 * a disk. Facts (package names, versions, paths) are identifiers and stay as they are; the directives are
 * English first and then their Spanish mirror after `@es`, on the same line.
 *
 * @es La ÚNICA línea que una sesión lee sobre su proyecto: lo que midió el perfil y dónde están las reglas, la
 * documentación y los gates correctos para su versión. Angular recibe el estado de soporte (un major sin
 * soporte o cerca del fin se nombra con su fecha y el major siguiente, una vez por sesión, porque un major sin
 * parches es una postura de seguridad), la columna de `rules/fe-angular.md` que aplica y la documentación: en
 * 21+ el fichero oficial de reglas que trae `@angular/core` (leído primero) más el fichero delta de este repo;
 * en 19/20, sin fichero oficial, el de este repo es la fuente completa. Pura: el día y la prueba de existencia
 * se inyectan. Los hechos son identificadores y no se traducen; las directivas van en inglés y luego su espejo
 * en español tras `@es`, en la misma línea.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { supportOf } from './angular-support.mjs';

/** The majors this repository has a version file for. @es Los majors para los que este repo tiene fichero de versión. */
export const VERSION_FILE_MAJORS = Object.freeze([19, 20, 21, 22]);

/** The first major whose `@angular/core` ships the official rules file. @es El primer major cuyo `@angular/core` trae el fichero oficial de reglas. */
export const OFFICIAL_RULES_SINCE = 21;

/** Where `@angular/core` ships the official rules file, relative to the project root. @es Dónde trae `@angular/core` el fichero oficial, relativo a la raíz. */
export const OFFICIAL_RULES_FILE = 'node_modules/@angular/core/resources/best-practices.md';

const SKILL_DIR = '~/.claude/skills/angular-best-practices/versions';
const LABELS = Object.freeze({ karma: 'Karma', jasmine: 'Jasmine', jest: 'Jest', vitest: 'Vitest' });

/** `x.y`, plus `(declared)` when nothing is installed. @es `x.y`, más `(declared)` si no hay nada instalado. */
const versionText = (version) => (version === undefined ? '?' : `${version.major}.${version.minor}${version.source === 'declared' ? ' (declared, not installed)' : ''}`);

/** The measured facts, `·`-separated. @es Los hechos medidos, separados por `·`. */
export function factsText(profile) {
  const parts = [`${profile.frameworkLabel}${profile.frameworkVersion === undefined ? '' : ` ${versionText(profile.frameworkVersion)}`}`];

  if (profile.typescript !== undefined) parts.push(`TS ${versionText(profile.typescript)}`);
  if (profile.testRunners.length > 0) parts.push(profile.testRunners.map((id) => LABELS[id] ?? id).join('+'));
  if (profile.eslint !== undefined) parts.push(`ESLint ${profile.eslint.major}${profile.eslintConfig === undefined ? '' : ` ${profile.eslintConfig}`}`);
  if (profile.angular?.build !== undefined) parts.push(profile.angular.build);
  if (profile.angular !== undefined) parts.push(profile.angular.zoneless === true ? 'zoneless' : profile.angular.zoneless === false ? 'zone.js' : 'zone.js?');
  if (profile.packageManager !== undefined) parts.push(profile.packageManager);

  return parts.join(' · ');
}

/** The support sentence for an Angular major, or `undefined` while it is comfortably supported. @es La frase de soporte de un major, o `undefined` mientras tenga soporte holgado. */
export function supportText(major, today) {
  const { status, until } = supportOf(major, today);

  if (status === 'eol') return [`Angular ${major} is END OF LIFE${until === undefined ? '' : ` since ${until}`} (no security patches): plan the update to v${major + 1}.`, `Angular ${major} está FUERA DE SOPORTE${until === undefined ? '' : ` desde el ${until}`} (sin parches de seguridad): planificar la actualización a v${major + 1}.`];
  if (status === 'near-eol') return [`Angular ${major} support ends ${until}: plan the update to v${major + 1}.`, `El soporte de Angular ${major} termina el ${until}: planificar la actualización a v${major + 1}.`];
  if (status === 'unknown') return [`Angular ${major} is newer than this repository's support table: check angular.dev/reference/releases.`, `Angular ${major} es más nuevo que la tabla de soporte de este repo: comprobar angular.dev/reference/releases.`];

  return undefined;
}

/** The docs sentence for an Angular major. @es La frase de documentación de un major. */
export function docsText(major, { root, exists }) {
  const nearest = VERSION_FILE_MAJORS.includes(major) ? major : major < VERSION_FILE_MAJORS[0] ? VERSION_FILE_MAJORS[0] : VERSION_FILE_MAJORS.at(-1);
  const ours = `${SKILL_DIR}/v${nearest}.md`;
  const column = VERSION_FILE_MAJORS.includes(major) ? `column v${major}` : `column v${nearest} (nearest; the project is v${major}, verify each API)`;
  const columnEs = VERSION_FILE_MAJORS.includes(major) ? `columna v${major}` : `columna v${nearest} (la más cercana; el proyecto es v${major}, verificar cada API)`;

  if (major < OFFICIAL_RULES_SINCE) return [`Apply ${column} of ~/.claude/rules/fe-angular.md; docs: ${ours} (full source, no official rules file before v21).`, `Aplicar la ${columnEs} de ~/.claude/rules/fe-angular.md; docs: ${ours} (fuente completa, no hay fichero oficial antes de v21).`];

  const official = path.join(root, OFFICIAL_RULES_FILE);
  const present = exists(official);
  const first = present ? `read ${official} first (official rules for this exact version), then the delta ${ours}` : `official rules file missing (${OFFICIAL_RULES_FILE}: dependencies not installed), so read the delta ${ours} and verify against angular.dev`;
  const firstEs = present ? `leer primero ${official} (reglas oficiales de esta versión exacta) y luego el delta ${ours}` : `falta el fichero oficial (${OFFICIAL_RULES_FILE}: dependencias sin instalar), así que leer el delta ${ours} y verificar contra angular.dev`;

  return [`Apply ${column} of ~/.claude/rules/fe-angular.md; ${first}.`, `Aplicar la ${columnEs} de ~/.claude/rules/fe-angular.md; ${firstEs}.`];
}

/**
 * The one line for a profile. `today` is an ISO date; `exists(path)` tests a file; `gatesToolchains` is the
 * folder holding `gates-kit/toolchains/<stack>/`.
 * @es La línea para un perfil. `today` es una fecha ISO; `exists(path)` prueba un fichero.
 */
export function profileLine(profile, { home, today = new Date().toISOString().slice(0, 10), exists = existsSync } = {}) {
  const english = [];
  const spanish = [];
  const add = (pair) => {
    if (pair === undefined) return;

    english.push(pair[0]);
    spanish.push(pair[1]);
  };
  const major = profile.frameworkVersion?.major;

  if (profile.framework === 'angular' && major !== undefined) {
    add(supportText(major, today));
    add(docsText(major, { root: profile.root, exists }));
  } else {
    add(['Apply the matching ~/.claude/rules/fe-*.md for the files you touch.', 'Aplicar las ~/.claude/rules/fe-*.md que correspondan a los ficheros que se toquen.']);
  }

  if (profile.gatesStack !== undefined && home !== undefined && exists(path.join(home, '.claude', 'gates-kit', 'toolchains', profile.gatesStack, 'package.json'))) {
    add([`Gates toolchain: ~/.claude/gates-kit/toolchains/${profile.gatesStack}.`, `Toolchain de gates: ~/.claude/gates-kit/toolchains/${profile.gatesStack}.`]);
  }

  const where = profile.relativeRoot === undefined || profile.relativeRoot === '' ? '' : ` (${profile.relativeRoot}/)`;

  return `Profile${where}: ${factsText(profile)}. ${english.join(' ')} @es ${spanish.join(' ')}`;
}
