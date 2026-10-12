/**
 * Answers one question about the landing path: does a command of a given tool run there, and through which
 * root? A tool is recognised by the program (and verb) of a command, never by a substring of the script text.
 * The answer splits the matching commands into those reached from an ENFORCING root and those reached only from
 * a root that does not enforce (a local hook, a CI job allowed to fail), and says whether the landing guard's
 * own unit suite reaches it.
 *
 * @es Responde una pregunta sobre el camino de aterrizaje: ¿corre ahí un comando de cierta herramienta y por qué
 * raíz? Una herramienta se reconoce por el programa (y verbo) de un comando, nunca por un trozo del texto del
 * script. La respuesta separa los comandos que coinciden en los alcanzados desde una raíz que APLICA y los
 * alcanzados solo desde una raíz que no aplica (un hook local, un job de CI que puede fallar), y dice si la suite
 * de unidad del propio guard de aterrizaje lo alcanza.
 */

import path from 'node:path';

import { ENFORCING_ROOTS } from './landing-path.mjs';

/** Recognisers by tool id: each takes a command's argv. @es Reconocedores por herramienta: cada uno recibe el argv de un comando. */
export const TOOLS = Object.freeze({
  eslint: (argv) => argv[0] === 'eslint' || (argv[0] === 'ng' && argv.includes('lint')) || (argv[0] === 'nx' && argv.some((word) => word === 'lint' || word === 'run-many')),
  tsc: (argv) => argv[0] === 'tsc' || (argv[0] === 'ng' && (argv.includes('build') || argv.includes('test'))),
  knip: (argv) => argv[0] === 'knip',
  depcruise: (argv) => argv[0] === 'depcruise' || argv[0] === 'dependency-cruiser',
  jscpd: (argv) => argv[0] === 'jscpd',
  'npm-audit': (argv) => argv[0] === 'npm' && argv[1] === 'audit',
});

/** The commands of the landing path that `tool` recognises, split by whether their root enforces. @es Los comandos del camino que reconoce `tool`, separados según si su raíz aplica. */
export function reach(landing, tool) {
  const matching = landing.records.filter((record) => TOOLS[tool](record.argv));
  const enforcing = matching.filter((record) => ENFORCING_ROOTS.includes(record.rootKind));

  return {
    enforcing,
    other: matching.filter((record) => !ENFORCING_ROOTS.includes(record.rootKind)),
    landingGuard: enforcing.some((record) => record.rootKind === 'unit-suite'),
  };
}

/** One command of the path as an evidence line with its file, root and chain. @es Un comando del camino como línea de evidencia. */
export function describeRecord(record, projectRoot) {
  const file = path.relative(projectRoot, record.file).split(path.sep).join('/');
  const place = record.line === undefined ? `${file} script "${record.script}"` : `${file}:${record.line}`;
  const chain = record.via.length > 0 ? ` via ${record.via.join(' > ')}` : '';
  const command = record.argv.join(' ');

  return `${place}${chain} [${record.rootKind}] ${command.length > 90 ? `${command.slice(0, 87)}...` : command}`;
}

/** The first `limit` evidence lines for `records`, with a count of the rest. @es Las primeras `limit` líneas de evidencia, con el recuento del resto. */
export function describeRecords(records, projectRoot, limit = 1) {
  const lines = records.slice(0, limit).map((record) => describeRecord(record, projectRoot));

  if (records.length > limit) lines.push(`... and ${records.length - limit} more`);

  return lines;
}
