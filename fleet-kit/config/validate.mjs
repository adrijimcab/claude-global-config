/**
 * Validates a `.claude/fleet-kit.json` object and returns every problem at once.
 *
 * Strict by design: an unknown key is a problem, because a misspelt section (`landingGaurd`) would
 * otherwise read as "absent" and silently switch a guard off. A disabled section must carry a reason of
 * at least {@link MINIMUM_REASON_LENGTH} characters, because silence reads as coverage.
 *
 * @es Valida un objeto `.claude/fleet-kit.json` y devuelve todos los problemas de una vez. Estricto: una
 * clave desconocida es un problema (una sección mal escrita se leería como ausente y apagaría una guarda
 * en silencio), y una sección desactivada debe llevar un motivo, porque el silencio se lee como cobertura.
 */

export const SCHEMA_VERSION = 1;
export const MINIMUM_REASON_LENGTH = 20;

const TOP_LEVEL_KEYS = ['schemaVersion', 'integrationBranches', 'worktreeRoot', 'unitSuite', 'coverage', 'landingGuard', 'handback'];
const RUNNERS = ['karma'];
const LANDING_MODES = ['enforce', 'advise'];
const HANDBACK_COVERAGE = ['refuse', 'off'];

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.length > 0;
const isTextList = (value) => Array.isArray(value) && value.every(isText);

/** Whether a section is the `{ enabled: false, reason }` form. @es Si una sección es la forma desactivada. */
export const isDisabled = (section) => isObject(section) && section.enabled === false;

/** Every key of `value` not in `allowed`, as problems under `where`. @es Las claves no permitidas. */
function unknownKeys(value, allowed, where) {
  return Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map((key) => `${where}: unknown key "${key}"`);
}

/**
 * A repository-relative path: forward slashes, not absolute, no `..` segment. `''` means the top level
 * and is allowed only where `allowEmpty` says so.
 * @es Una ruta relativa al repositorio con `/`, sin ser absoluta ni contener `..`.
 */
function pathProblems(value, where, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') return [`${where}: must be a string`];
  if (value.length === 0) return allowEmpty ? [] : [`${where}: must not be empty`];
  if (value.includes('\\')) return [`${where}: use forward slashes`];
  if (value.startsWith('/') || value.charAt(1) === ':') return [`${where}: must be relative to the git top level`];
  if (value.split('/').includes('..')) return [`${where}: must not contain ".."`];

  return [];
}

function disabledProblems(section, where) {
  const problems = unknownKeys(section, ['enabled', 'reason'], where);

  if (typeof section.reason !== 'string' || section.reason.trim().length < MINIMUM_REASON_LENGTH) {
    problems.push(`${where}: a disabled section needs a "reason" of at least ${MINIMUM_REASON_LENGTH} characters`);
  }

  return problems;
}

/** A section that is either disabled-with-reason or valid per `check`. @es Una sección desactivada con motivo o válida según `check`. */
function sectionProblems(section, where, check) {
  if (!isObject(section)) return [`${where}: must be an object`];
  if (isDisabled(section)) return disabledProblems(section, where);

  return check(section, where);
}

function unitSuiteProblems(section, where) {
  return [
    ...unknownKeys(section, ['npmScript', 'cwd'], where),
    ...(isText(section.npmScript) ? [] : [`${where}.npmScript: must be a non-empty string`]),
    ...pathProblems(section.cwd, `${where}.cwd`, { allowEmpty: true })
  ];
}

function karmaProblems(karma, where) {
  if (!isObject(karma)) return [`${where}: must be an object`];

  return [
    ...unknownKeys(karma, ['workspace', 'ngProject', 'baseConfig'], where),
    ...pathProblems(karma.workspace, `${where}.workspace`, { allowEmpty: true }),
    ...(isText(karma.ngProject) ? [] : [`${where}.ngProject: must be a non-empty string`]),
    ...(karma.baseConfig === 'angular-builtin' ? [] : pathProblems(karma.baseConfig, `${where}.baseConfig`))
  ];
}

function projectProblems(project, where) {
  if (!isObject(project)) return [`${where}: must be an object`];

  return [
    ...unknownKeys(project, ['name', 'sourceRoot', 'extensions', 'excludeSuffixes', 'excludeSegments', 'karma'], where),
    ...(isText(project.name) ? [] : [`${where}.name: must be a non-empty string`]),
    ...pathProblems(project.sourceRoot, `${where}.sourceRoot`),
    ...(isText(project.sourceRoot) && !project.sourceRoot.endsWith('/') ? [`${where}.sourceRoot: must end with "/" so it cannot match a sibling folder by prefix`] : []),
    ...(isTextList(project.extensions) && project.extensions.length > 0 ? [] : [`${where}.extensions: must be a non-empty list of strings`]),
    ...(isTextList(project.excludeSuffixes) ? [] : [`${where}.excludeSuffixes: must be a list of strings`]),
    ...(isTextList(project.excludeSegments) ? [] : [`${where}.excludeSegments: must be a list of strings`]),
    ...karmaProblems(project.karma, `${where}.karma`)
  ];
}

function coverageProblems(section, where) {
  const problems = [...unknownKeys(section, ['runner', 'projects'], where)];

  if (!RUNNERS.includes(section.runner)) problems.push(`${where}.runner: must be one of ${RUNNERS.join(', ')}`);
  if (!Array.isArray(section.projects) || section.projects.length === 0) return [...problems, `${where}.projects: must be a non-empty list`];

  return [...problems, ...section.projects.flatMap((project, index) => projectProblems(project, `${where}.projects[${index}]`))];
}

function landingProblems(section, where) {
  return [...unknownKeys(section, ['mode'], where), ...(LANDING_MODES.includes(section.mode) ? [] : [`${where}.mode: must be one of ${LANDING_MODES.join(', ')}`])];
}

function handbackProblems(section, where) {
  if (!isObject(section)) return [`${where}: must be an object`];

  const problems = [...unknownKeys(section, ['coverage', 'reason'], where)];

  if (!HANDBACK_COVERAGE.includes(section.coverage)) problems.push(`${where}.coverage: must be one of ${HANDBACK_COVERAGE.join(', ')}`);
  if (section.coverage === 'off' && (typeof section.reason !== 'string' || section.reason.trim().length < MINIMUM_REASON_LENGTH)) {
    problems.push(`${where}: coverage "off" needs a "reason" of at least ${MINIMUM_REASON_LENGTH} characters`);
  }

  return problems;
}

/** Requirements BETWEEN sections: a guard that could never be satisfied is a configuration error. @es Requisitos ENTRE secciones. */
function crossProblems(config) {
  const problems = [];

  if (isObject(config.landingGuard) && !isDisabled(config.landingGuard) && isDisabled(config.unitSuite)) {
    problems.push('landingGuard: enabled while unitSuite is disabled — no verdict could ever exist, so every landing would be refused');
  }
  if (config.handback?.coverage === 'refuse' && isDisabled(config.coverage)) {
    problems.push('handback.coverage: "refuse" while coverage is disabled — nothing could grade a handback');
  }

  return problems;
}

/**
 * Every problem in `config`, or `[]` when it is valid.
 * @es Todos los problemas de `config`, o `[]` si es válida.
 */
export function configProblems(config) {
  if (!isObject(config)) return ['the configuration must be a JSON object'];

  const problems = [...unknownKeys(config, TOP_LEVEL_KEYS, 'config')];

  if (config.schemaVersion !== SCHEMA_VERSION) problems.push(`schemaVersion: must be ${SCHEMA_VERSION}`);
  if (!isTextList(config.integrationBranches) || config.integrationBranches.length === 0) problems.push('integrationBranches: must be a non-empty list of branch names');
  problems.push(...pathProblems(config.worktreeRoot, 'worktreeRoot'));
  problems.push(...sectionProblems(config.unitSuite, 'unitSuite', unitSuiteProblems));
  problems.push(...sectionProblems(config.coverage, 'coverage', coverageProblems));
  problems.push(...sectionProblems(config.landingGuard, 'landingGuard', landingProblems));
  problems.push(...handbackProblems(config.handback, 'handback'));

  return problems.length === 0 ? crossProblems(config) : problems;
}
