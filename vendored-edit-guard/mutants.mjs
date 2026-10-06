#!/usr/bin/env node
/**
 * The decisions of `vendored-edit-guard` (`vendored-copy-edited-in-place`), each broken once, that `selftest.mjs`
 * must catch. The runner and its rules — green unmutated baseline, exactly-once target, parse check — live in
 * `../mutation-proof/run-mutants.mjs`. Each row names the DECISION it removes, not the line it edits, and keeps
 * the code runnable so a kill means the selftest CHECKED the decision. Not mutated: the lexer that finds a call's
 * write targets (`write-targets/`, vendored from its owner b100-am-ui, whose campaign proves it there) and the
 * list of vendored modules (`VENDORED` is DATA: the selftest reads it from the module under test).
 *
 * @es Las decisiones de `vendored-edit-guard`, rotas una a una, que `selftest.mjs` debe cazar. Cada fila nombra
 * la DECISIÓN que elimina, no la línea que edita. No se mutan el analizador de destinos de escritura
 * (`write-targets/`, vendorizado desde su dueño b100-am-ui, cuya campaña lo prueba allí) ni la lista de módulos
 * vendorizados (`VENDORED` es DATO).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const DECIDE = 'vendored-edit-guard/decide.mjs';
const GUARD = 'vendored-edit-guard/guard.mjs';

const MUTANTS = [
  // --- WHERE: which folders hold the installed copies.
  ['`~/.claude` is not an install root', DECIDE, "path.resolve(home, '.claude'), ", ''],
  ['the folder the guard is installed in is not an install root', DECIDE, ', path.resolve(install)', ''],
  ['an install root that is also `~/.claude` is listed twice', DECIDE, '[...new Set([path.resolve(home, \'.claude\'), path.resolve(install)])]', "[path.resolve(home, '.claude'), path.resolve(install)]"],
  ['no folder is an install root by default', DECIDE, 'roots = installRoots()', 'roots = []'],

  // --- WHAT: which paths are vendored.
  ['nothing is declared vendored by default', DECIDE, 'vendored = VENDORED', 'vendored = []'],
  ['letter case never matters, on any platform', DECIDE, "platform === 'win32' ? (relative) => relative.toLowerCase() : (relative) => relative", '(relative) => relative.toLowerCase()'],
  ['letter case always matters, on Windows too', DECIDE, "platform === 'win32' ? (relative) => relative.toLowerCase() : (relative) => relative", '(relative) => relative'],
  ['a target nobody can resolve is read as a path', DECIDE, 'if (write.path === undefined) continue;', ''],
  ['the same module written twice is listed twice', DECIDE, 'if (relative !== undefined && !found.has(relative))', 'if (relative !== undefined)'],
  ['the way a module is written is not carried to the refusal', DECIDE, 'found.set(relative, { relative, via: write.via })', "found.set(relative, { relative, via: '' })"],
  ['a path is judged against the folder it was typed in, not the root it resolves under', DECIDE, 'path.relative(root, write.path)', 'path.relative(root, path.basename(write.path))'],

  // --- the shim.
  ['the shim never asks the decision', GUARD, 'offences = decide(JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw));', 'offences = [];'],
  ['a BOM-prefixed payload is no longer read', GUARD, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['a malfunction of the decision crashes the hook instead of allowing', GUARD, '  } catch {\n    return undefined;\n  }\n\n  if (offences.length', '  } catch (error) {\n    throw error;\n  }\n\n  if (offences.length'],
  ['a call that writes nothing vendored is refused anyway', GUARD, 'if (offences.length === 0) return undefined;', ''],
  ['the shim answers "allow" while naming a refusal', GUARD, "permissionDecision: 'deny'", "permissionDecision: 'allow'"],
  ['the refusal is answered for another event', GUARD, "hookEventName: 'PreToolUse'", "hookEventName: 'Stop'"],
  ['run as a hook, the refusal is never printed', GUARD, 'if (output !== undefined) console.log(JSON.stringify(output));', ''],

  // --- the refusal teaches the remedy, in both languages.
  ['the refusal stops naming the owner path in English', GUARD, "    '  1. edit the OWNER copy, in b100-am-ui:',\n    ...owners,\n", "    '  1. edit the OWNER copy, in b100-am-ui:',\n"],
  ['the refusal stops naming the owner path in Spanish', GUARD, "    '  1. edita la copia DUEÑA, en b100-am-ui:',\n    ...owners,\n", "    '  1. edita la copia DUEÑA, en b100-am-ui:',\n"],
  ['the refusal names the wrong re-sync command', GUARD, 'vendored/vendored.mjs sync`;', 'vendored/vendored.mjs check`;'],
  ['the refusal stops naming the re-sync command in English', GUARD, "    '  2. then re-sync the copy here:',\n    `  ${SYNC_COMMAND}`,\n", "    '  2. then re-sync the copy here:',\n"],
  ['the refusal stops naming the re-sync command in Spanish', GUARD, "    '  2. y vuelve a sincronizar la copia de aquí:',\n    `  ${SYNC_COMMAND}`\n", "    '  2. y vuelve a sincronizar la copia de aquí:',\n"],
  ['the refusal stops naming the installed copy in English', GUARD, "    ...installed,\n    '',\n    'WHY.", "    '',\n    'WHY."],
  ['the refusal stops naming the installed copy in Spanish', GUARD, "    ...installed,\n    '',\n    'POR QUÉ.", "    '',\n    'POR QUÉ."],
  ['the refusal stops saying the provenance check goes red, in English', GUARD, '(EDITED IN THE KIT)', '(red)'],
  ['the refusal stops saying the next sync overwrites the edit, in English', GUARD, 'would overwrite it', 'would keep it'],
  ['the refusal stops saying the provenance check goes red, in Spanish', GUARD, '(EDITADO EN EL KIT)', '(rojo)'],
  ['the refusal stops saying the next sync overwrites the edit, in Spanish', GUARD, 'la sobrescribe', 'la conserva'],
  ['the refusal loses its Spanish mirror', GUARD, "'@es VENDORED-EDIT GUARD RECHAZÓ esta llamada", "'VENDORED-EDIT GUARD RECHAZÓ esta llamada"],
  ['the refusal loses its English opening', GUARD, "'VENDORED-EDIT GUARD REFUSED this call", "'REFUSED this call"],
  ['the owner path is looked up in the wrong place', GUARD, '${SOURCE_ROOT_RECORDED}/${relative}`);', '${INSTALL}/${relative}`);']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: [
    'vendored-edit-guard',
    'vendored',
    'write-targets',
    'shell-command',
    'cherry-pick-guard',
    'fleet-kit/vendor',
    'settings.json',
    'hook-caller',
    'hook-dispatch',
    'hook-state',
    'bilingual-output',
    'hook-payloads',
    'mutation-proof',
    'exit-code-guard',
    'eval-guard',
    'gentle-ai-sync-guard',
    'collision-guard',
    'commit-pathspec-guard',
    'config-sync-guard',
    'cwd-change-guard',
    'type-assertion-guard'
  ],
  selftest: 'vendored-edit-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
