/**
 * The words a worker is told when it starts: where its project contract is, and the route rule. Bilingual
 * through `bilingual-output/`, which refuses at load a message that lacks a half. The text is a POINTER, never
 * the contract itself: a long hook output is persisted to a file and the model sees a 2 KB preview, so a
 * pasted contract never arrived whole (measured in the b100-am-ui project, 2026-09-28).
 *
 * @es Las palabras que se le dicen a un worker al arrancar: dónde está el contrato de su proyecto y la regla
 * de ruta. Bilingüe por `bilingual-output/`, que rechaza al cargar un mensaje al que le falta una mitad. El
 * texto es un PUNTERO, nunca el contrato: una salida larga de hook se guarda en un fichero y el modelo ve una
 * vista previa de 2 KB, así que un contrato pegado nunca llegaba entero (medido en b100-am-ui, 2026-09-28).
 */

import path from 'node:path';

import { makeSpeaker } from '../bilingual-output/speaker.mjs';
import { claudeHome } from '../hook-state/locations.mjs';

/** The messages. Placeholders are `{name}`. @es Los mensajes; los marcadores son `{name}`. */
export const MESSAGE_TABLE = {
  'contract-where': {
    en: ['[Agent operating contract: it applies for the whole of your task, including after a resume]', 'Your project contract is in these files:'],
    es: ['[Contrato operativo de agentes: rige toda tu tarea, también tras reanudarte]', 'El contrato de tu proyecto está en estos ficheros:']
  },
  'contract-read': {
    en: [
      'Check that its rules are already in your context. Explore agents do not load CLAUDE.md, and neither does a',
      'session started inside a worktree. If they are NOT there, READ those files before anything else.'
    ],
    es: [
      'Verificá que sus reglas ya estén en tu contexto. Los agentes Explore no cargan CLAUDE.md, ni tampoco una',
      'sesión iniciada dentro de un worktree. Si NO están, LEÉ esos ficheros antes que cualquier otra cosa.'
    ]
  },
  'contract-none': {
    en: 'No project contract file was found from {directory}. Follow your brief.',
    es: 'No se encontró ningún fichero de contrato del proyecto desde {directory}. Seguí tu brief.'
  },
  'route-rule': {
    en: [
      '[Route rule]',
      'Your brief carries a line "ROUTE: direct" or "ROUTE: tracked-odd <feature-name>". Follow it.',
      'Never create or edit an ODD feature document (odd/tasks/<feature>.md) or its engram mirror unless your',
      'ROUTE line is "tracked-odd" with that feature name: the orchestrator owns those documents.',
      'A brief with no ROUTE line is "direct": touch no feature document, and say in your report that the line was missing.'
    ],
    es: [
      '[Regla de ruta]',
      'Tu brief lleva una línea "ROUTE: direct" o "ROUTE: tracked-odd <nombre-de-feature>". Seguila.',
      'Nunca crees ni edites un documento de feature ODD (odd/tasks/<feature>.md) ni su espejo en engram salvo que tu',
      'línea ROUTE sea "tracked-odd" con ese nombre de feature: esos documentos son del orquestador.',
      'Un brief sin línea ROUTE es "direct": no toques ningún documento de feature y decí en tu informe que faltaba la línea.'
    ]
  },
  'engineering-standard': {
    en: [
      '[Engineering standard]',
      'Read {file} before your first write. Tie-break: correctness and security, gates, performance, simplicity.',
      'KISS and YAGNI: the simplest design that meets the requirement measured today, nothing speculative.',
      'SOLID: one responsibility per unit, dependencies inward. Architecture: hexagonal where code talks to',
      'external systems, no layers a small script does not need. Route: tracked-odd when the design is open or',
      'the work has two or more meaningful steps; direct when the design is settled and it is one step.'
    ],
    es: [
      '[Estándar de ingeniería]',
      'Leé {file} antes de tu primera escritura. Desempate: corrección y seguridad, gates, rendimiento, simplicidad.',
      'KISS y YAGNI: el diseño más simple que cumple el requisito medido hoy, nada especulativo.',
      'SOLID: una responsabilidad por unidad, dependencias hacia adentro. Arquitectura: hexagonal donde se habla',
      'con sistemas externos, sin capas que un script chico no necesita. Ruta: tracked-odd si el diseño está abierto',
      'o el trabajo tiene dos o más pasos significativos; direct si el diseño está asentado y es un paso.'
    ]
  }
};

const { line } = makeSpeaker(MESSAGE_TABLE);

/** The standard every agent reads, under the real home. @es El estándar que todo agente lee, bajo el home real. */
const STANDARD_FILE = path.join(claudeHome(), 'engineering-standard.md');

/**
 * The text delivered to the worker. `located` is `{ files }` of a project whose contract was found, or
 * `{ files: [], directory }` when none was; the route rule and the engineering standard always follow.
 * @es El texto entregado al worker. `located` es `{ files }` de un proyecto con contrato encontrado, o
 * `{ files: [], directory }` si no hubo; la regla de ruta y el estándar de ingeniería siempre van después.
 */
export function pointerText(located) {
  const contract = located.files.length > 0
    ? [line('contract-where'), ...located.files.map((file) => `  ${file}`), line('contract-read')]
    : [line('contract-none', { directory: located.directory })];

  return [contract.join('\n'), line('route-rule'), line('engineering-standard', { file: STANDARD_FILE })].join('\n\n');
}
