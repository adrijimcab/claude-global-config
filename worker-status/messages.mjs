/**
 * Every line `status.mjs` prints, as a bilingual table rendered by `bilingual-output/`.
 * @es Cada línea que imprime `status.mjs`, como tabla bilingüe.
 */

import { makeSpeaker } from '../bilingual-output/speaker.mjs';

export const MESSAGE_TABLE = {
  usage: { en: 'Usage: status.mjs <agent-id> [--project-dir <dir>] [--json].', es: 'Uso: status.mjs <agent-id> [--project-dir <dir>] [--json].' },
  unknown: { en: 'No subagent transcript found for id "{id}".', es: 'No se encontró ningún transcript de subagente para el id «{id}».' },
  transcript: { en: 'Transcript: {path}', es: 'Transcripción: {path}' },
  age: { en: 'Last write {at}, {seconds} s ago.', es: 'Última escritura {at}, hace {seconds} s.' },
  last: { en: 'Last record: {kind}{detail}', es: 'Último registro: {kind}{detail}' },
  worktree: { en: 'Worktree: {path}', es: 'Árbol de trabajo: {path}' },
  'no-worktree': { en: 'The transcript shows no worktree.', es: 'El transcript no muestra ningún worktree.' },
  git: { en: 'Branch {branch} at {head}; {ahead} ahead of {base}; {dirty} dirty.', es: 'Rama {branch} en {head}; {ahead} por delante de {base}; {dirty} sucios.' },
  'no-git': { en: 'The worktree is not readable as a git checkout.', es: 'El worktree no se puede leer como checkout de git.' },
  process: { en: 'Process {pid}: {command}', es: 'Proceso {pid}: {command}' },
  'no-process': { en: 'No live process names the worktree.', es: 'Ningún proceso vivo nombra el worktree.' }
};

export const speaker = makeSpeaker(MESSAGE_TABLE);
