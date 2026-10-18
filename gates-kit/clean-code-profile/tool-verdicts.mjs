/**
 * The verdicts of the gates that are a tool plus its config rather than one ESLint rule: lint on the landing
 * path, strict TypeScript, dependency-cruiser (cycles and the hexagonal layering), jscpd, knip and `npm audit`.
 * Each reads the project's own config (or asks the compiler) and the landing path, and applies the one rule of
 * `verdict-parts.mjs`. The numbers they compare against come from `profile.mjs`, never from this file.
 *
 * @es Los veredictos de los gates que son una herramienta más su config y no una regla de ESLint: lint en el
 * camino de aterrizaje, TypeScript estricto, dependency-cruiser (ciclos y capas hexagonales), jscpd, knip y `npm
 * audit`. Cada uno lee la config del propio proyecto (o pregunta al compilador) y el camino de aterrizaje, y
 * aplica la regla única de `verdict-parts.mjs`. Los números con que comparan vienen de `profile.mjs`, no de aquí.
 */

import { AUDIT_LEVELS_AT_LEAST_HIGH, JSCPD } from './profile.mjs';
import { reach } from './landing-reach.mjs';
import { forbids, forbidsCycles } from './layering-probe.mjs';
import { ev, landingEvidence, settle, unmeasured } from './verdict-parts.mjs';
import { commandsOf } from './shell-commands.mjs';

/** A path relative to the project, for evidence. @es Una ruta relativa al proyecto, para evidencia. */
const relative = (facts, file) => file.slice(facts.root.length).replace(/^[\\/]+/, '').split('\\').join('/');

/** eslint is configured and a lint command runs on the landing path. @es ESLint está configurado y un comando de lint corre en el camino. */
export function lintOnLanding(gate, facts) {
  const found = reach(facts.landing, 'eslint');
  const configured = facts.eslintConfig.file !== undefined;
  const config = configured ? ev('eslint-config', { file: relative(facts, facts.eslintConfig.file) }) : ev('no-eslint-config', { searched: facts.eslintConfig.searched.join(', ') });

  return settle({ gate, meets: configured, present: configured || found.other.length > 0, found, evidence: [config, ...landingEvidence(found, 'eslint', facts.landing, facts.root)] });
}

/** The compiler resolves `strict: true` and a command that type-checks runs on the landing path. @es El compilador resuelve `strict: true` y un comando que comprueba tipos corre en el camino. */
export function strictTypescript(gate, facts) {
  const found = reach(facts.landing, 'tsc');
  const tsc = facts.tsc;

  if (tsc.error !== undefined) return unmeasured(gate, [ev('tsc-not-runnable', { file: tsc.file, reason: tsc.error })]);
  if (tsc.missing) return settle({ gate, meets: false, present: false, found, evidence: [ev('no-tsconfig', {}), ...landingEvidence(found, 'tsc', facts.landing, facts.root)] });

  const reason = tsc.strict ? ev('strict-on', { file: tsc.file }) : ev('strict-off', { file: tsc.file });

  return settle({ gate, meets: tsc.strict, present: tsc.strict, found, evidence: [reason, ...landingEvidence(found, 'tsc', facts.landing, facts.root)] });
}

/** dependency-cruiser config evidence, or the verdict that says it cannot be read. @es Evidencia de la config de dependency-cruiser, o el veredicto que dice que no se puede leer. */
function depcruiseOrVerdict(gate, facts, found) {
  const config = facts.depcruise;

  if (config === undefined) return { done: settle({ gate, meets: false, present: found.other.length > 0, found, evidence: [ev('no-depcruise-config', {}), ...landingEvidence(found, 'dependency-cruiser', facts.landing, facts.root)] }) };
  if (config.error !== undefined) return { done: unmeasured(gate, [ev('depcruise-unreadable', { file: relative(facts, config.file), reason: config.error })]) };

  return { config };
}

/** A forbidden-cycles rule at error and a depcruise command on the landing path. @es Una regla de ciclos prohibidos en error y un comando depcruise en el camino. */
export function circularDependencies(gate, facts) {
  const found = reach(facts.landing, 'depcruise');
  const { config, done } = depcruiseOrVerdict(gate, facts, found);
  const alternative = facts.dependencies.includes('madge') ? [ev('madge-declared', {})] : [];

  if (done !== undefined) return { ...done, evidence: [...done.evidence, ...alternative] };

  const meets = forbidsCycles(config.config);
  const file = relative(facts, config.file);
  const reason = meets ? ev('circular-rule', { file }) : ev('no-circular-rule', { file });

  return settle({ gate, meets, present: true, found, evidence: [reason, ...alternative,...landingEvidence(found, 'dependency-cruiser', facts.landing, facts.root)] });
}

/** Every probe of the stack forbidden by the config, and a depcruise command on the landing path. @es Cada sonda del stack prohibida por la config y un comando depcruise en el camino. */
export function hexagonalLayering(gate, facts) {
  const found = reach(facts.landing, 'depcruise');
  const { config, done } = depcruiseOrVerdict(gate, facts, found);

  if (done !== undefined) return done;

  const probes = gate.probes[facts.stack];
  const missing = probes.filter((probe) => !forbids(config.config, probe)).map((probe) => probe.id);
  const file = relative(facts, config.file);
  const reason = missing.length === 0 ? ev('layering-ok', { file, count: probes.length }) : ev('layering-missing', { file, missing: missing.join(', ') });

  return settle({ gate, meets: missing.length === 0, present: missing.length < probes.length, found, evidence: [reason, ...landingEvidence(found, 'dependency-cruiser', facts.landing, facts.root)] });
}

/** The value of a command-line flag, long or short, or undefined. @es El valor de una opción de línea de comandos, larga o corta, o undefined. */
function flagValue(argv, names) {
  for (let index = 0; index < argv.length; index += 1) {
    const word = argv[index];
    const name = names.find((candidate) => word === candidate || word.startsWith(`${candidate}=`));

    if (name === undefined) continue;

    return word.includes('=') ? word.slice(word.indexOf('=') + 1) : argv[index + 1];
  }

  return undefined;
}

/** The effective jscpd settings: the config file, overridden by the flags of the command that runs. @es Los ajustes efectivos de jscpd: el fichero, sobrescrito por las opciones del comando. */
function jscpdSettings(facts, commands) {
  const settings = { minTokens: facts.jscpd?.config?.minTokens, threshold: facts.jscpd?.config?.threshold, from: facts.jscpd === undefined ? '(none)' : relative(facts, facts.jscpd.file) };

  for (const record of commands) {
    const tokens = flagValue(record.argv, ['--min-tokens', '-k']);
    const threshold = flagValue(record.argv, ['--threshold', '-t']);

    if (tokens !== undefined) Object.assign(settings, { minTokens: Number(tokens), from: 'command line' });
    if (threshold !== undefined) Object.assign(settings, { threshold: Number(threshold), from: 'command line' });
  }

  return settings;
}

/** jscpd with the profile's minTokens (or lower) and threshold 0, on the landing path. @es jscpd con el minTokens del perfil (o menor) y umbral 0, en el camino. */
export function duplication(gate, facts) {
  if (facts.jscpd?.error !== undefined) return unmeasured(gate, [ev('jscpd-unreadable', { file: relative(facts, facts.jscpd.file) })]);

  const found = reach(facts.landing, 'jscpd');
  const settings = jscpdSettings(facts, [...found.enforcing, ...found.other]);
  const present = facts.jscpd !== undefined || found.enforcing.length + found.other.length > 0;
  const meets = settings.minTokens !== undefined && settings.minTokens <= JSCPD.minTokens && settings.threshold === JSCPD.threshold;
  const reason = present ? ev(meets ? 'jscpd-ok' : 'jscpd-weak', { tokens: settings.minTokens ?? 'unset', threshold: settings.threshold ?? 'unset', from: settings.from, needed: JSCPD.minTokens }) : ev('no-jscpd', {});

  return settle({ gate, meets, present, found, evidence: [reason, ...landingEvidence(found, 'jscpd', facts.landing, facts.root)] });
}

/** True when some package script runs knip. @es Verdadero si algún script de package ejecuta knip. */
function scriptRunsKnip(scripts) {
  return Object.values(scripts).some((text) => commandsOf(text).some((argv) => argv[0] === 'knip'));
}

/** knip configured (file or script) and run on the landing path, reporting its ignore debt. @es knip configurado (fichero o script) y corrido en el camino, informando su deuda de ignorados. */
export function deadCode(gate, facts) {
  const found = reach(facts.landing, 'knip');
  const config = facts.knip;
  const configured = config !== undefined || scriptRunsKnip(facts.landing.scripts);
  const evidence = [];

  if (config !== undefined) evidence.push(ev('knip-config', { file: relative(facts, config.file) }));
  else if (configured) evidence.push(ev('knip-script', {}));
  else evidence.push(ev('no-knip', {}));

  if (config !== undefined && config.ignoreEntries === undefined) evidence.push(ev('knip-ignore-unmeasured', { file: relative(facts, config.file), reason: config.reason }));
  if (config?.ignoreEntries > 0) evidence.push(ev('knip-ignore-debt', { count: config.ignoreEntries, file: relative(facts, config.file) }));

  return settle({ gate, meets: configured, present: configured, found, evidence: [...evidence, ...landingEvidence(found, 'knip', facts.landing, facts.root)] });
}

/** The audit level an `npm audit` command states, or undefined. @es El nivel de auditoría que declara un comando `npm audit`. */
function auditLevel(argv) {
  return flagValue(argv, ['--audit-level']);
}

/** `npm audit` at the profile's level or stricter, blocking, on the landing path. @es `npm audit` al nivel del perfil o más estricto, bloqueante, en el camino. */
export function dependencyAudit(gate, facts) {
  const found = reach(facts.landing, 'npm-audit');
  const strong = (record) => AUDIT_LEVELS_AT_LEAST_HIGH.includes(auditLevel(record.argv));
  const enforcingStrong = found.enforcing.filter(strong);
  const inScripts = Object.values(facts.landing.scripts).some((text) => commandsOf(text).some((argv) => argv[0] === 'npm' && argv[1] === 'audit'));
  const present = found.enforcing.length + found.other.length > 0 || inScripts;
  const strongFound = { ...found, enforcing: enforcingStrong, landingGuard: enforcingStrong.some((record) => record.rootKind === 'unit-suite') };
  const levels = [...found.enforcing, ...found.other].map((record) => auditLevel(record.argv) ?? 'unstated');
  const reason = levels.length === 0 ? ev(inScripts ? 'audit-in-scripts' : 'no-audit', {}) : ev(enforcingStrong.length > 0 ? 'audit-level-ok' : 'audit-level-weak', { levels: [...new Set(levels)].join(', '), needed: gate.config.command });

  return settle({ gate, meets: enforcingStrong.length > 0, present, found: strongFound, evidence: [reason, ...landingEvidence(found, 'npm audit', facts.landing, facts.root)] });
}
