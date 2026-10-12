/**
 * The bilingual refusals of the shared-resource guard, in the house form (`bilingual-output/message.mjs`):
 * one per kind of control action, and one for a declaration the guard cannot read.
 *
 * @es Las negativas bilingües del guard de recursos compartidos, en la forma de la casa: una por tipo de
 * acción de control y una para una declaración que el guard no puede leer.
 */

import { render } from '../bilingual-output/message.mjs';

const INCIDENT_EN = [
  'Measured 2026-10-12 (Discovery): a delegated writer restarted the shared local PROD with its own',
  'FRT_URL, then stopped PROD and its guard, and three other writers lost the backend they were using.'
];
const INCIDENT_ES = [
  'Medido el 2026-10-12 (Discovery): un writer delegado reinició el PROD local compartido con su propio',
  'FRT_URL y luego detuvo PROD y su guardián; otros tres writers perdieron el backend que usaban.'
];

/** One refusal for a control action: what the worker may do instead is always the same. @es Una negativa por acción de control. */
function actionRefusal(verbEn, verbEs) {
  return {
    en: [
      `SHARED-RESOURCE GUARD REFUSED this command: a delegated worker may not ${verbEn} the shared resource "{resource}" ({detail}).`,
      '',
      'COMMAND. {command}',
      'RESOURCE. {description}',
      '',
      'WHY. A shared resource is used by every live session at once, so whoever controls it controls all of them:',
      ...INCIDENT_EN,
      'Only the orchestrator session starts, stops or reconfigures it.',
      '',
      'USE INSTEAD: use the resource as it is (read it, `curl` it, point your tests at it). If you need it started,',
      'stopped or configured differently, ask the orchestrator: say what you need and why in your report or a message,',
      'and keep working on what does not depend on it.'
    ],
    es: [
      `SHARED-RESOURCE GUARD RECHAZÓ este comando: un worker delegado no puede ${verbEs} el recurso compartido "{resource}" ({detail}).`,
      '',
      'COMANDO. {command}',
      'RECURSO. {description}',
      '',
      'POR QUÉ. Un recurso compartido lo usan a la vez todas las sesiones vivas, así que quien lo controla las controla a todas:',
      ...INCIDENT_ES,
      'Solo la sesión orquestadora lo arranca, lo detiene o lo reconfigura.',
      '',
      'USAR EN SU LUGAR: usa el recurso tal como está (léelo, hazle `curl`, apunta tus tests a él). Si necesitas que se',
      'arranque, se detenga o se configure distinto, pídeselo al orquestador: di qué necesitas y por qué en tu informe',
      'o en un mensaje, y sigue con lo que no depende de él.'
    ]
  };
}

/** The message table; both halves of each name the same placeholders. @es La tabla de mensajes; ambas mitades de cada una nombran los mismos marcadores. */
export const MESSAGES = {
  start: actionRefusal('start', 'arrancar'),
  stop: actionRefusal('stop', 'detener'),
  reconfigure: actionRefusal('reconfigure', 'reconfigurar'),
  invalid: {
    en: [
      'SHARED-RESOURCE GUARD REFUSED this command: the project declares its shared resources in {file}, and that',
      'file cannot be used, so the guard cannot tell a safe command from a control action on a shared resource.',
      '',
      'PROBLEMS.',
      '{problems}',
      '',
      'USE INSTEAD: ask the orchestrator to fix {file}. The orchestrator session is not blocked by this guard and',
      'can correct the declaration; deleting the file declares no shared resources, and is the orchestrator\'s call.'
    ],
    es: [
      'SHARED-RESOURCE GUARD RECHAZÓ este comando: el proyecto declara sus recursos compartidos en {file} y ese',
      'fichero no se puede usar, así que el guard no distingue un comando seguro de una acción de control sobre un',
      'recurso compartido.',
      '',
      'PROBLEMAS.',
      '{problems}',
      '',
      'USAR EN SU LUGAR: pídele al orquestador que corrija {file}. La sesión orquestadora no queda bloqueada por este',
      'guard y puede corregir la declaración; borrar el fichero declara cero recursos compartidos, y lo decide el orquestador.'
    ]
  }
};

/**
 * @param {{ resource: string, description: string, kind: string, detail: string, text: string }} action The control action refused.
 * @returns {string} The rendered refusal, English then ` @es ` Spanish.
 * @es La negativa renderizada, inglés y luego español marcado con ` @es `.
 */
export function actionRefusalText(action) {
  return render(MESSAGES[action.kind], { resource: action.resource, detail: action.detail, command: action.text, description: action.description });
}

/**
 * @param {string} file The declaration file that cannot be used.
 * @param {string[]} problems Everything wrong with it.
 * @returns {string} The rendered refusal, English then ` @es ` Spanish.
 * @es La negativa renderizada, inglés y luego español marcado con ` @es `.
 */
export function invalidDeclarationText(file, problems) {
  return render(MESSAGES.invalid, { file, problems: problems.map((problem) => `  - ${problem}`).join('\n') });
}
