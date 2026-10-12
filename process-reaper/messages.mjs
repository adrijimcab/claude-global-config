/**
 * Every line the process reaper reports, as a bilingual table rendered by `bilingual-output/`.
 * @es Cada línea que informa el segador de procesos, como tabla bilingüe renderizada por `bilingual-output/`.
 */

import { makeSpeaker } from '../bilingual-output/speaker.mjs';

export const MESSAGE_TABLE = {
  'no-markers': {
    en: 'Nothing to match: no worktree, agent id or scratch path was given, so no process was touched.',
    es: 'Nada que buscar: no se dio worktree, id de agente ni ruta de scratch, así que no se tocó ningún proceso.'
  },
  'not-a-linked-worktree': {
    en: '{path} is not a linked worktree (it is a main checkout or a plain directory), so no process was touched.',
    es: '{path} no es un worktree enlazado (es un checkout principal o un directorio común), así que no se tocó ningún proceso.'
  },
  none: {
    en: 'No live process belongs to the closed agent.',
    es: 'Ningún proceso vivo pertenece al agente cerrado.'
  },
  summary: {
    en: 'Reaped {count} process(es) of the closed agent in {trees} tree(s).',
    es: 'Segados {count} proceso(s) del agente cerrado en {trees} árbol(es).'
  },
  killed: {
    en: 'Killed {pid}: {command}',
    es: 'Muerto {pid}: {command}'
  },
  survivor: {
    en: 'Still alive after the kill {pid}: {command}',
    es: 'Sigue vivo tras el kill {pid}: {command}'
  },
  protected: {
    en: 'Left alone {pid} (this reaper or one of its ancestors names the agent): {command}',
    es: 'Se deja {pid} (este segador o uno de sus ancestros nombra al agente): {command}'
  }
};

export const speaker = makeSpeaker(MESSAGE_TABLE);
