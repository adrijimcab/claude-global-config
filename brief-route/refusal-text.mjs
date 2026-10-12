/**
 * The words of the brief-route refusal, bilingual, and the function that turns an inspected brief into them.
 * The table goes through `bilingual-output/`, which refuses at load a message that lacks a half, so no sentence
 * of the guard can be English only.
 *
 * @es Las palabras del rechazo de brief-route, bilingües, y la función que convierte un brief inspeccionado en
 * ellas. La tabla pasa por `bilingual-output/`, que rechaza al cargar un mensaje al que le falta una mitad.
 */

import { makeSpeaker } from '../bilingual-output/speaker.mjs';

/** The messages. Placeholders are `{name}`. @es Los mensajes; los marcadores son `{name}`. */
export const MESSAGE_TABLE = {
  'header-delegation': {
    en: 'BRIEF-ROUTE REFUSED this delegation ({tool}): the brief does not say which route its worker takes.',
    es: 'BRIEF-ROUTE RECHAZÓ esta delegación ({tool}): el brief no dice qué ruta sigue su worker.'
  },
  'header-message': {
    en: 'BRIEF-ROUTE REFUSED this message ({tool}): the brief does not say which route its worker takes.',
    es: 'BRIEF-ROUTE RECHAZÓ este mensaje ({tool}): el brief no dice qué ruta sigue su worker.'
  },
  absent: {
    en: 'ABSENT: the brief has no ROUTE line. Add one near the top, next to MEASURED and HYPOTHESIS.',
    es: 'AUSENTE: el brief no tiene línea ROUTE. Agregá una arriba, junto a MEASURED y HYPOTHESIS.'
  },
  buried: {
    en: 'NEAR MISS: "ROUTE:" appears in the brief, but not at the START of a line. A route is a heading, not a phrase inside a sentence.',
    es: 'CASI ACIERTO: "ROUTE:" aparece en el brief, pero no al INICIO de una línea. La ruta es un encabezado, no una frase dentro de una oración.'
  },
  malformed: {
    en: 'MALFORMED: this line heads with ROUTE but its form is wrong: {line}',
    es: 'MAL FORMADA: esta línea empieza con ROUTE pero su forma es errónea: {line}'
  },
  multiple: {
    en: 'MULTIPLE: the brief has {count} ROUTE lines, and a worker cannot follow two routes. Keep exactly one. Lines: {lines}',
    es: 'MÚLTIPLE: el brief tiene {count} líneas ROUTE, y un worker no puede seguir dos rutas. Dejá exactamente una. Líneas: {lines}'
  },
  grammar: {
    en: [
      'THE GRAMMAR, exactly one of:',
      '  ROUTE: direct',
      '  ROUTE: tracked-odd <feature-name>',
      '<feature-name> is the stem of the feature document odd/tasks/<feature-name>.md: lowercase words of letters',
      'and digits joined by single hyphens, 64 characters at most. Nothing may follow the value: no reason, no quotes.',
      'WHO CHOOSES: you, the orchestrator. "direct" where the design is settled; "tracked-odd" where it is open and you',
      'track the feature document. This guard checks the form and never judges the choice or the size of the work.',
      'WHY IT IS REFUSED, not suggested: the worker cannot tell whether to open or touch a feature document, and',
      'the orchestrator owns those documents. The line is what tells it.'
    ],
    es: [
      'LA GRAMÁTICA, exactamente una de:',
      '  ROUTE: direct',
      '  ROUTE: tracked-odd <nombre-de-feature>',
      '<nombre-de-feature> es el nombre del documento de feature odd/tasks/<nombre-de-feature>.md: palabras en minúscula de',
      'letras y dígitos unidas por guiones simples, 64 caracteres como máximo. Nada puede seguir al valor: ni motivo ni comillas.',
      'QUIÉN ELIGE: vos, el orquestador. "direct" donde el diseño está asentado; "tracked-odd" donde está abierto y',
      'registrás el documento de feature. Este guard comprueba la forma y nunca juzga la elección ni el tamaño del trabajo.',
      'POR QUÉ SE RECHAZA y no se sugiere: el worker no puede saber si debe abrir o tocar un documento de feature, y',
      'esos documentos son del orquestador. La línea es lo que se lo dice.'
    ]
  }
};

const { line } = makeSpeaker(MESSAGE_TABLE);

/**
 * The refusal text for an inspected brief that is not `present`, or `undefined` when it is.
 * @es El texto del rechazo para un brief inspeccionado que no está `present`, o `undefined` si lo está.
 * @param {{ state: string, line?: string, lines?: string[] }} inspection from `inspectRoute`
 * @param {{ surface: string, toolName: string }} brief from `briefOf`
 */
export function refusalReason(inspection, brief) {
  if (inspection.state === 'present') return undefined;

  const detail = {
    absent: () => line('absent'),
    buried: () => line('buried'),
    malformed: () => line('malformed', { line: inspection.line }),
    multiple: () => line('multiple', { count: String(inspection.lines?.length), lines: (inspection.lines ?? []).join(' | ') })
  }[inspection.state];

  return [line(`header-${brief.surface}`, { tool: brief.toolName }), '', detail(), '', line('grammar')].join('\n');
}
