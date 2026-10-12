/**
 * The text of the origin/HEAD sync and of the drift warning, as a bilingual table rendered by `bilingual-output/`.
 * @es El texto de la sincronización de origin/HEAD y del aviso de deriva, como tabla bilingüe.
 */

import { makeSpeaker } from '../bilingual-output/speaker.mjs';

export const MESSAGE_TABLE = {
  usage: {
    en: 'Usage: node sync.mjs <clone>   (any directory of the clone; makes its origin/HEAD follow the declared integration branch).',
    es: 'Uso: node sync.mjs <clon>   (cualquier directorio del clon; hace que su origin/HEAD siga la rama de integración declarada).'
  },
  'not-a-repository': {
    en: '{dir} is not inside a git repository with a working tree, so there is no origin/HEAD to sync.',
    es: '{dir} no está dentro de un repositorio git con árbol de trabajo, así que no hay origin/HEAD que sincronizar.'
  },
  ungoverned: {
    en: '{main} declares no integration branch ({fleetKit}, {ownModule}); origin/HEAD is left as it is.',
    es: '{main} no declara ninguna rama de integración ({fleetKit}, {ownModule}); origin/HEAD se deja como está.'
  },
  'in-sync': {
    en: 'origin/HEAD of {main} already points at {want}, the first integration branch declared in {source}. Nothing changed.',
    es: 'origin/HEAD de {main} ya apunta a {want}, la primera rama de integración declarada en {source}. No se cambió nada.'
  },
  updated: {
    en: 'origin/HEAD of {main} moved from {current} to {want}, the first integration branch declared in {source}.',
    es: 'origin/HEAD de {main} pasó de {current} a {want}, la primera rama de integración declarada en {source}.'
  },
  'missing-remote-ref': {
    en: 'origin/HEAD of {main} cannot follow {want} (declared in {source}): this clone has no refs/remotes/origin/{want}. This tool never pushes and never invents a ref; you decide: if the branch exists on the remote, run git -C "{main}" fetch origin {want}; if it exists only here, push it first with git -C "{main}" push origin {want}; then run this command again.',
    es: 'origin/HEAD de {main} no puede seguir a {want} (declarada en {source}): este clon no tiene refs/remotes/origin/{want}. Esta herramienta nunca hace push ni inventa una referencia; decides tú: si la rama existe en el remoto, ejecuta git -C "{main}" fetch origin {want}; si solo existe aquí, súbela antes con git -C "{main}" push origin {want}; luego ejecuta este comando otra vez.'
  },
  'drift-set': {
    en: 'INTEGRATION BRANCH DRIFT: {main} declares {want} as its integration branch ({source}) but its origin/HEAD points at {current}; tools that take the default branch from origin/HEAD (the review base, agent worktrees) will start from the wrong branch. Fix it with: node "{sync}" "{main}"',
    es: 'DERIVA DE LA RAMA DE INTEGRACIÓN: {main} declara {want} como su rama de integración ({source}) pero su origin/HEAD apunta a {current}; las herramientas que toman la rama por defecto de origin/HEAD (la base de la revisión, los worktrees de agentes) partirán de la rama equivocada. Se arregla con: node "{sync}" "{main}"'
  },
  'drift-missing-ref': {
    en: 'INTEGRATION BRANCH DRIFT: {main} declares {want} as its integration branch ({source}) but its origin/HEAD points at {current}, and this clone has no refs/remotes/origin/{want} to point it at. The owner decides the fetch or the push; then run: node "{sync}" "{main}"',
    es: 'DERIVA DE LA RAMA DE INTEGRACIÓN: {main} declara {want} como su rama de integración ({source}) pero su origin/HEAD apunta a {current}, y este clon no tiene refs/remotes/origin/{want} a la que apuntarlo. El dueño decide el fetch o el push; luego ejecuta: node "{sync}" "{main}"'
  }
};

export const speaker = makeSpeaker(MESSAGE_TABLE);
