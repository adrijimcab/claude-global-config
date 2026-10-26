/**
 * The bilingual refusal a delegated agent receives for a deletion it may not make, in the house form
 * (`bilingual-output/message.mjs`): one message for foreign files, and one per REASON CODE for a deletion whose
 * targets cannot be known before it runs.
 *
 * @es La negativa bilingüe que recibe un agente delegado por un borrado que no puede hacer, en la forma de la
 * casa: un mensaje para ficheros ajenos y uno por CÓDIGO DE MOTIVO para un borrado cuyos objetivos no se pueden
 * saber antes de ejecutarlo.
 */

import { render } from '../bilingual-output/message.mjs';

/** The most foreign files a refusal lists by name. @es El máximo de ficheros ajenos que un rechazo lista por nombre. */
export const MAX_LISTED = 5;

/** Why a target cannot be known, per code, in both languages. @es Por qué no se puede saber un objetivo, por código, en los dos idiomas. */
const REASONS = {
  variable: {
    en: 'a target depends on a variable, a command substitution or a brace range that is only known when the command runs',
    es: 'un objetivo depende de una variable, una sustitución de comandos o un rango de llaves que solo se conoce al ejecutar el comando'
  },
  directory: {
    en: 'the folder it runs in is only known when the command runs',
    es: 'la carpeta en la que corre solo se conoce al ejecutar el comando'
  },
  backslash: {
    en: 'a nested cmd /c script loses the backslashes of its Windows paths when it is read, so the paths it deletes cannot be known',
    es: 'un script de cmd /c anidado pierde las barras invertidas de sus rutas de Windows al leerse, así que no se pueden saber las rutas que borra'
  },
  stdin: {
    en: 'its targets arrive through standard input',
    es: 'sus objetivos llegan por la entrada estándar'
  },
  pipeline: {
    en: 'its targets arrive through the pipeline',
    es: 'sus objetivos llegan por la canalización'
  },
  limit: {
    en: 'the folder holds more entries than can be checked',
    es: 'la carpeta contiene más entradas de las que se pueden comprobar'
  },
  preview: {
    en: 'git clean could not list what it would remove',
    es: 'git clean no pudo listar lo que borraría'
  }
};

const INCIDENT_EN = [
  'WHY. Measured 2026-10-19 (third occurrence of worker-temp-file-collided-across-sessions): writers told to',
  '"delete the scratch scripts after" removed the orchestrator\'s provision.mjs, engram-save.mjs, mirror-odd.mjs,',
  'split-backlog.mjs and contrast.mjs from the shared session scratchpad root. A wildcard or a folder reaches the',
  'files of every actor that shares the folder.'
];

const INCIDENT_ES = [
  'POR QUÉ. Medido el 2026-10-19 (tercera ocurrencia de worker-temp-file-collided-across-sessions): escritores a',
  'los que se les dijo "borra los scripts temporales al terminar" eliminaron provision.mjs, engram-save.mjs,',
  'mirror-odd.mjs, split-backlog.mjs y contrast.mjs del orquestador de la raíz compartida del scratchpad de la',
  'sesión. Un comodín o una carpeta alcanza los ficheros de cada actor que comparte la carpeta.'
];

/** The message for a deletion whose targets cannot be known, built from one reason. @es El mensaje para un borrado cuyos objetivos no se pueden saber. */
const unresolvedMessage = (reason) => ({
  en: [
    `FOREIGN-DELETE GUARD REFUSED this deletion: it cannot tell what {via} would delete, because ${reason.en}.`,
    '',
    'A delegated agent may delete only files it created in this session, and that can only be checked against',
    'paths known before the command runs.',
    ...INCIDENT_EN,
    '',
    'USE INSTEAD: write out literally each file you created, one by one, and run the deletion again.'
  ],
  es: [
    `FOREIGN-DELETE GUARD RECHAZÓ este borrado: no se puede saber qué borraría {via}, porque ${reason.es}.`,
    '',
    'Un agente delegado solo puede borrar ficheros que creó en esta sesión, y eso solo se puede comprobar contra',
    'rutas conocidas antes de ejecutar el comando.',
    ...INCIDENT_ES,
    '',
    'USAR EN SU LUGAR: escribir de forma literal cada fichero que creaste, uno por uno, y repetir el borrado.'
  ]
});

/** The message table; every half names the same placeholders. @es La tabla de mensajes; ambas mitades nombran los mismos marcadores. */
export const MESSAGES = {
  foreign: {
    en: [
      'FOREIGN-DELETE GUARD REFUSED this deletion: a delegated agent may delete only files it created in this',
      'session, and {via} would delete {count} file(s) it did not create (showing {shown}): {files}',
      '',
      ...INCIDENT_EN,
      '',
      'LEAVE THEM ALONE: those files belong to another actor. Name each file you created, one by one (no wildcard',
      'that reaches its neighbours), or make your own scratchpad subfolder first with mkdir',
      '(<scratchpad>/<your-name>/), keep your scratch output there and delete there. Your own worktree is yours too.',
      'If a foreign file has to go, ask the orchestrator.'
    ],
    es: [
      'FOREIGN-DELETE GUARD RECHAZÓ este borrado: un agente delegado solo puede borrar ficheros que creó en esta',
      'sesión, y {via} borraría {count} fichero(s) que no creó (se muestran {shown}): {files}',
      '',
      ...INCIDENT_ES,
      '',
      'DEJAR ESOS FICHEROS EN PAZ: pertenecen a otro actor. Nombrar uno por uno los ficheros que creaste (sin',
      'comodines que alcancen a sus vecinos), o crear primero con mkdir tu propia subcarpeta del scratchpad',
      '(<scratchpad>/<tu-nombre>/), guardar allí la salida temporal y borrar allí. Tu propio worktree también es',
      'tuyo. Si un fichero ajeno debe desaparecer, pedírselo al orquestador.'
    ]
  },
  ...Object.fromEntries(Object.entries(REASONS).map(([code, reason]) => [`unresolved_${code}`, unresolvedMessage(reason)]))
};

/**
 * @param {{ kind: 'foreign', via: string, files: string[] } | { kind: 'unresolved', code: string, via: string }} verdict What the guard decided.
 * @returns {string} The rendered refusal, English then ` @es ` Spanish.
 * @es La negativa renderizada, inglés y luego español marcado con ` @es `.
 */
export function refusalText(verdict) {
  if (verdict.kind === 'unresolved') return render(MESSAGES[`unresolved_${verdict.code}`], { via: verdict.via });

  const listed = verdict.files.slice(0, MAX_LISTED);

  return render(MESSAGES.foreign, { via: verdict.via, count: String(verdict.files.length), shown: String(listed.length), files: listed.join('; ') });
}
