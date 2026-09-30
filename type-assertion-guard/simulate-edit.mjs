/**
 * Reconstructs the BEFORE and AFTER text of a file for an `Edit`, `Write` or `MultiEdit` tool call,
 * without letting the real tool run first — this hook fires on `PreToolUse`, before the write happens,
 * so the only way to compare "before" and "after" is to simulate the same substitution the real tool is
 * about to perform.
 *
 * `Edit`/`MultiEdit` replace `old_string` with `new_string` in the file currently on disk (all
 * occurrences when `replace_all` is true, otherwise the first one — matching the real tool's own
 * contract that `old_string` be unique unless `replace_all` is set). `Write` replaces the whole file
 * with `tool_input.content`; when the file does not yet exist, "before" is the empty string, so a
 * brand-new file's assertion count starts at zero, never inherited from nowhere.
 *
 * Every failure to simulate — `old_string` not found (the payload disagrees with the disk, so nothing
 * here can be trusted), a missing `Edit`/`MultiEdit` target, an unreadable file for a reason other than
 * "does not exist" — is reported as `{ error }`, never guessed past. The guard's caller fails OPEN on
 * that `error`, per this guard's own contract: unable to verify is not the same as clean, and it says so.
 *
 * @es Reconstruye el texto ANTES y DESPUÉS de un `Edit`, `Write` o `MultiEdit`, sin dejar correr la
 * herramienta real primero — este hook corre en `PreToolUse`. `Edit`/`MultiEdit` sustituyen `old_string`
 * por `new_string` en el fichero actual en disco (todas las apariciones si `replace_all` es true, si no
 * la primera); `Write` reemplaza el fichero entero por `tool_input.content`, y si el fichero no existe
 * aún, "antes" es la cadena vacía. Cualquier fallo de simulación se informa como `{ error }`, nunca se
 * adivina: el llamador de esta guardia FALLA ABIERTO ante ese error — no poder verificar no es limpio.
 */

import { readFileSync } from 'node:fs';

/** @returns {{ text: string } | { missing: true } | { error: string }} */
function readDisk(filePath) {
  try {
    return { text: readFileSync(filePath, 'utf8') };
  } catch (error) {
    if (error && error.code === 'ENOENT') return { missing: true };

    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Applies ONE `old_string` -> `new_string` substitution the way `Edit`/`MultiEdit` apply it.
 * @returns {string | undefined} The new text, or `undefined` when `old_string` is not present.
 */
function applyStringEdit(text, oldString, newString, replaceAll) {
  if (oldString.length === 0) return undefined;

  const index = text.indexOf(oldString);

  if (index === -1) return undefined;
  if (replaceAll) return text.split(oldString).join(newString);

  return text.slice(0, index) + newString + text.slice(index + oldString.length);
}

/**
 * @param {'Edit' | 'Write' | 'MultiEdit'} toolName
 * @param {object} toolInput The tool call's `tool_input`.
 * @param {string} filePath Absolute path of the target file.
 * @returns {{ before: string, after: string } | { error: string }}
 */
export function simulateEdit(toolName, toolInput, filePath) {
  const disk = readDisk(filePath);

  if ('error' in disk) return { error: `cannot read ${filePath}: ${disk.error}` };

  const diskText = 'missing' in disk ? undefined : disk.text;

  if (toolName === 'Write') {
    if (typeof toolInput?.content !== 'string') return { error: `Write tool_input.content is not a string for ${filePath}` };

    return { before: diskText ?? '', after: toolInput.content };
  }

  if (diskText === undefined) return { error: `${toolName} targets ${filePath}, which does not exist on disk — cannot reconstruct a before/after diff` };

  if (toolName === 'Edit') {
    if (typeof toolInput?.old_string !== 'string' || typeof toolInput?.new_string !== 'string') return { error: `Edit tool_input is missing old_string/new_string for ${filePath}` };

    const after = applyStringEdit(diskText, toolInput.old_string, toolInput.new_string, toolInput.replace_all === true);

    if (after === undefined) return { error: `old_string was not found in ${filePath} — the payload disagrees with the disk, cannot simulate the edit` };

    return { before: diskText, after };
  }

  if (toolName === 'MultiEdit') {
    if (!Array.isArray(toolInput?.edits) || toolInput.edits.length === 0) return { error: `MultiEdit tool_input.edits is missing or empty for ${filePath}` };

    let running = diskText;

    for (const edit of toolInput.edits) {
      if (typeof edit?.old_string !== 'string' || typeof edit?.new_string !== 'string') return { error: `MultiEdit has a malformed edit entry for ${filePath}` };

      const after = applyStringEdit(running, edit.old_string, edit.new_string, edit.replace_all === true);

      if (after === undefined) return { error: `one of MultiEdit's old_string values was not found in ${filePath} — cannot simulate the edit` };

      running = after;
    }

    return { before: diskText, after: running };
  }

  return { error: `unsupported tool_name ${String(toolName)}` };
}
