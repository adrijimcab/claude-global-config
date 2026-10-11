/**
 * The company-repository configuration: the tool NAMES that must never reach a company repository and the
 * company HOSTS that define which repositories are company ones. It is owned by the global layer
 * (`~/.claude`, the owner's private repository) and read by `company-commit-guard` and
 * `company-push-guard`; no company repository carries any of it.
 *
 * FAILS CLOSED. A missing, unreadable, malformed or empty list makes `companyConfig()` return a refusal
 * reason instead of an empty list, because an empty name list would let every commit pass silently. The
 * guards turn that reason into a refusal of any `git commit` / `git push` they see. Recovery is a file
 * write (the Write tool is not a git command), then the commit works again.
 *
 * `CLAUDE_COMPANY_CONFIG` points the module at another file; it exists so a selftest can simulate a
 * company host and a missing list without a network. It is read from the HOOK process environment, which a
 * shell command run by an agent cannot change.
 *
 * @es La configuración de repositorios de empresa: los NOMBRES de herramienta que no pueden llegar a un
 * repositorio de empresa y los HOSTS que definen cuáles son. La posee la capa global (`~/.claude`, el repo
 * privado del dueño) y la leen las dos guardias; ningún repo de empresa lleva nada de esto. FALLA CERRADO:
 * una lista ausente, ilegible, mal formada o vacía devuelve un motivo de rechazo, nunca una lista vacía.
 * `CLAUDE_COMPANY_CONFIG` apunta a otro fichero para que un selftest simule un host de empresa.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The versioned configuration file. @es El fichero de configuración versionado. */
const DEFAULT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'company-config.json');

/** A non-empty array of non-empty strings, lower-cased, or `undefined`. @es Lista de textos no vacíos en minúsculas, o `undefined`. */
function cleanList(value) {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  if (!value.every((item) => typeof item === 'string' && item.trim().length > 0)) return undefined;

  return value.map((item) => item.trim().toLowerCase());
}

/**
 * @returns `{ names, hosts }` when the configuration is usable, or `{ problem }` naming why it is not.
 * @es `{ names, hosts }` si la configuración sirve, o `{ problem }` con el motivo.
 */
export function companyConfig(file = process.env.CLAUDE_COMPANY_CONFIG ?? DEFAULT_FILE) {
  let parsed;

  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return { problem: `cannot read ${file}: ${error instanceof Error ? error.message : String(error)}` };
  }

  const names = cleanList(parsed?.names);
  const hosts = cleanList(parsed?.hosts);

  if (names === undefined) return { problem: `${file} has a missing or empty "names" list` };
  if (hosts === undefined) return { problem: `${file} has a missing or empty "hosts" list` };

  return { names, hosts };
}

/**
 * The bilingual refusal every guard emits when the configuration is unusable.
 * @es La negativa bilingüe que emite toda guardia cuando la configuración no sirve.
 */
export function missingListRefusal(guardName, problem) {
  return [
    `${guardName} REFUSED this command: the company-repository name/host list is missing or empty (${problem}).`,
    'Without it the guard cannot tell what must not reach a company repository, so it refuses every `git commit` and `git push` (fail closed).',
    'Restore ~/.claude/company-config/company-config.json with the Write tool (it is not a git command), then retry.',
    '',
    `@es ${guardName} RECHAZÓ este comando: falta la lista de nombres/hosts de repositorios de empresa o está vacía (${problem}).`,
    'Sin ella la guardia no sabe qué no puede llegar a un repositorio de empresa, así que rechaza todo `git commit` y `git push` (falla cerrado).',
    'Restaura ~/.claude/company-config/company-config.json con la herramienta Write (no es un comando git) y reintenta.'
  ].join('\n');
}
