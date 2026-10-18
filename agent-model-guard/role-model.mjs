/**
 * What a role's definition file says about its model. A role is `<home>/agents/<role>.md`; its model is the
 * `model:` line of the YAML frontmatter (the block between the first two `---` lines). Only the frontmatter
 * counts: a line `model: opus` in the body of the file declares nothing. The Claude home comes from
 * `hook-state/locations.mjs`, the one owner of that path.
 *
 * @es Qué dice el fichero de definición de un rol sobre su modelo. Un rol es `<home>/agents/<rol>.md`; su
 * modelo es la línea `model:` del frontmatter YAML (el bloque entre las dos primeras líneas `---`). Solo cuenta
 * el frontmatter: una línea `model: opus` en el cuerpo no declara nada. El home de Claude sale de
 * `hook-state/locations.mjs`, el único dueño de esa ruta.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { claudeHome } from '../hook-state/locations.mjs';

/** The only model a role may declare to be called with `opus`. @es El único modelo que un rol puede declarar para llamarse con `opus`. */
export const OPUS = 'opus';

/** A role name is a plain file stem: it can never climb out of the agents directory. @es Un nombre de rol es un nombre de fichero simple: no puede salir del directorio de agentes. */
const ROLE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The `model:` value of a definition's frontmatter, lowercased, or `undefined`. @es El valor de `model:` del frontmatter, en minúscula, o `undefined`. */
export function declaredModel(definition) {
  const lines = definition.split(/\r?\n/);

  if (lines[0]?.trim() !== '---') return undefined;

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');

  if (end === -1) return undefined;

  for (const line of lines.slice(1, end)) {
    const match = /^model:\s*["']?([^"'\s#]+)["']?\s*(#.*)?$/.exec(line);

    if (match !== null) return match[1].toLowerCase();
  }

  return undefined;
}

/** The agents directory of the Claude home. @es El directorio de agentes del home de Claude. */
export const agentsDirectory = () => path.join(claudeHome(), 'agents');

/**
 * Whether the role's definition declares `model: opus`. A missing, unreadable or odd-named role does not.
 * @es Si la definición del rol declara `model: opus`. Un rol ausente, ilegible o de nombre extraño no lo declara.
 */
export function declaresOpus(roleName) {
  if (typeof roleName !== 'string' || !ROLE_NAME.test(roleName)) return false;

  try {
    return declaredModel(readFileSync(path.join(agentsDirectory(), `${roleName}.md`), 'utf8')) === OPUS;
  } catch {
    return false;
  }
}

/** The names of every role that declares opus, sorted; empty when the directory cannot be read. @es Los nombres de cada rol que declara opus, ordenados; vacío si el directorio no se puede leer. */
export function opusRoles() {
  try {
    return readdirSync(agentsDirectory())
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.slice(0, -'.md'.length))
      .filter(declaresOpus)
      .sort();
  } catch {
    return [];
  }
}
