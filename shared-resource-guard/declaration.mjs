/**
 * Owns the question "which shared resources does this project DECLARE?" for the shared-resource guard: ONE
 * reader and ONE schema, so the guard and any later tool (a brief checker, a status report) cannot disagree
 * about what a project shares.
 *
 * WHERE. `.claude/shared-resources.json` at the project root, beside `.claude/fleet-kit.json` and
 * `.claude/agent-contract/anchors.json`, and like them it follows `schemaVersion` + strict keys.
 *
 * THREE OUTCOMES, never collapsed: `absent` (no file: the project shares nothing, the guard is silent),
 * `invalid` (the file exists but breaks the schema or cannot be parsed: every problem is listed at once, and
 * the guard refuses a worker with them, because a misspelt key read as "absent" would switch the protection
 * off in silence, the lesson fleet-kit's validator already carries), and `valid`.
 *
 * SCHEMA (version 1)
 *   { "schemaVersion": 1,
 *     "resources": [ {
 *       "name":           "local-prod"            // unique, lower-case words joined by "-"
 *       "description":    "why it is shared"      // non-empty: it is shown to the worker who is refused
 *       "home":           "C:/path/to/the/app"    // optional directory its sources live in (absolute, or relative to the project root)
 *       "ports":          [3100]                  // TCP ports it listens on
 *       "startCommands":  [["node", "bin/www"]]   // argv patterns that start it: executable, then the words that must appear
 *       "processNames":   ["nodemon"]             // image names a name-based kill would take it down by
 *       "reconfiguredBy": ["FRT_URL"]             // environment variables that change its behaviour
 *     } ] }
 * A resource declares at least one of `ports`, `startCommands`, `processNames`, `reconfiguredBy`: a resource
 * with none identifies no control action and would read as protected while protecting nothing.
 *
 * @es Es dueño de la pregunta «¿qué recursos compartidos DECLARA este proyecto?»: UN lector y UN esquema.
 * Vive en `.claude/shared-resources.json` junto a `fleet-kit.json` y `anchors.json`, con `schemaVersion` y
 * claves estrictas. Tres resultados que no se confunden: `absent` (sin fichero: no comparte nada, el guard
 * calla), `invalid` (existe pero rompe el esquema o no se parsea: se listan todos los problemas y el guard
 * rechaza al worker con ellos, porque una clave mal escrita leída como «ausente» apagaría la protección en
 * silencio) y `valid`. Un recurso declara al menos uno de `ports`, `startCommands`, `processNames`,
 * `reconfiguredBy`: uno sin ninguno no identifica ninguna acción de control y parecería protegido sin estarlo.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The declaration's location, relative to the project root. @es Dónde está la declaración, relativa a la raíz del proyecto. */
export const SHARED_RESOURCES_FILE = '.claude/shared-resources.json';

/** The only schema version this reader understands. @es La única versión de esquema que entiende este lector. */
export const SCHEMA_VERSION = 1;

const TOP_LEVEL_KEYS = ['schemaVersion', 'resources'];
const RESOURCE_KEYS = ['name', 'description', 'home', 'ports', 'startCommands', 'processNames', 'reconfiguredBy'];
const IDENTIFYING_KEYS = ['ports', 'startCommands', 'processNames', 'reconfiguredBy'];
const NAME_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789-';
const ENVIRONMENT_NAME_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
const HIGHEST_PORT = 65_535;

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isTextList = (value) => Array.isArray(value) && value.length > 0 && value.every(isText);

/** Every key of `value` outside `allowed`, as problems under `where`. @es Las claves no permitidas, como problemas. */
function unknownKeys(value, allowed, where) {
  return Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map((key) => `${where}: unknown key "${key}"`);
}

function nameProblems(name, where) {
  if (!isText(name)) return [`${where}.name: must be a non-empty string`];
  if (![...name].every((character) => NAME_CHARACTERS.includes(character)) || name.startsWith('-')) return [`${where}.name: use lower-case letters, digits and "-", not starting with "-"`];

  return [];
}

function portsProblems(ports, where) {
  const valid = Array.isArray(ports) && ports.length > 0 && ports.every((port) => Number.isInteger(port) && port >= 1 && port <= HIGHEST_PORT);

  return valid ? [] : [`${where}.ports: must be a non-empty list of integers from 1 to ${HIGHEST_PORT}`];
}

function startCommandsProblems(commands, where) {
  const valid = Array.isArray(commands) && commands.length > 0 && commands.every(isTextList);

  return valid ? [] : [`${where}.startCommands: must be a non-empty list of non-empty word lists, the first word being the executable`];
}

function environmentProblems(names, where) {
  const valid = isTextList(names) && names.every((name) => [...name].every((character) => ENVIRONMENT_NAME_CHARACTERS.includes(character)) && !'0123456789'.includes(name.charAt(0)));

  return valid ? [] : [`${where}.reconfiguredBy: must be a non-empty list of environment variable names (letters, digits, "_")`];
}

function resourceProblems(resource, index) {
  const where = `resources[${index}]`;

  if (!isObject(resource)) return [`${where}: must be an object`];

  const problems = [...unknownKeys(resource, RESOURCE_KEYS, where), ...nameProblems(resource.name, where)];

  if (!isText(resource.description)) problems.push(`${where}.description: must say why the resource is shared (non-empty string)`);
  if (resource.home !== undefined && !isText(resource.home)) problems.push(`${where}.home: must be a non-empty string when present`);
  if (resource.ports !== undefined) problems.push(...portsProblems(resource.ports, where));
  if (resource.startCommands !== undefined) problems.push(...startCommandsProblems(resource.startCommands, where));
  if (resource.processNames !== undefined && !isTextList(resource.processNames)) problems.push(`${where}.processNames: must be a non-empty list of strings`);
  if (resource.reconfiguredBy !== undefined) problems.push(...environmentProblems(resource.reconfiguredBy, where));

  if (!IDENTIFYING_KEYS.some((key) => resource[key] !== undefined)) {
    problems.push(`${where}: declare at least one of ${IDENTIFYING_KEYS.join(', ')}; a resource that identifies no control action protects nothing`);
  }

  return problems;
}

/**
 * Every problem of a parsed declaration, all at once.
 * @param {unknown} declaration The parsed JSON.
 * @returns {string[]} The problems; empty when the declaration is valid.
 * @es Todos los problemas de una declaración parseada, de una vez; vacío si es válida.
 */
export function declarationProblems(declaration) {
  if (!isObject(declaration)) return ['the file must hold a JSON object'];

  const problems = unknownKeys(declaration, TOP_LEVEL_KEYS, 'file');

  if (declaration.schemaVersion !== SCHEMA_VERSION) problems.push(`schemaVersion: must be ${SCHEMA_VERSION}`);

  if (!Array.isArray(declaration.resources) || declaration.resources.length === 0) {
    problems.push('resources: must be a non-empty list (delete the file to declare no resources)');
    return problems;
  }

  declaration.resources.forEach((resource, index) => problems.push(...resourceProblems(resource, index)));

  const names = declaration.resources.map((resource) => resource?.name);

  for (const name of new Set(names.filter((candidate, index) => isText(candidate) && names.indexOf(candidate) !== index))) problems.push(`resources: name "${name}" is declared twice`);

  return problems;
}

/**
 * The declaration of the project at `projectRoot`.
 *
 * @param {string} projectRoot The directory that holds `.claude/`.
 * @returns {{ status: 'absent' } | { status: 'invalid', file: string, problems: string[] } | { status: 'valid', file: string, resources: object[] }}
 *   Each resource comes back with `home` resolved to an absolute path (or `undefined`).
 * @es La declaración del proyecto en `projectRoot`; cada recurso devuelve `home` resuelta a ruta absoluta.
 */
export function readDeclaration(projectRoot) {
  const file = path.join(projectRoot, SHARED_RESOURCES_FILE);

  if (!existsSync(file)) return { status: 'absent' };

  let parsed;

  try {
    const text = readFileSync(file, 'utf8');

    parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    return { status: 'invalid', file, problems: [`cannot be read as JSON: ${error.message}`] };
  }

  const problems = declarationProblems(parsed);

  if (problems.length > 0) return { status: 'invalid', file, problems };

  return {
    status: 'valid',
    file,
    resources: parsed.resources.map((resource) => ({ ...resource, home: resource.home === undefined ? undefined : path.resolve(projectRoot, resource.home) }))
  };
}
