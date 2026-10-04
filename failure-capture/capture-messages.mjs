/**
 * What `capture.mjs` says when it records, lists, dismisses, inits or reports status — every sentence in
 * the house bilingual form (`message.mjs`): English first, the Spanish half marked `@es`, never one without
 * the other. Each message names its data as `{name}` placeholders; `messageProblems` proves the halves carry
 * the same data. A listing row that holds only data (`key (3x)`) has no prose to translate and is printed
 * as data, not as a message.
 *
 * @es Lo que dice `capture.mjs` al registrar, listar, descartar, iniciar o informar del estado: cada frase
 * en la forma bilingüe de la casa: primero el inglés, la mitad española marcada `@es`, nunca una sin la
 * otra. Cada mensaje nombra sus datos como marcadores `{nombre}`; `messageProblems` prueba que las mitades
 * llevan los mismos datos. Una fila de listado que solo lleva datos (`clave (3x)`) no tiene prosa que
 * traducir y se imprime como dato, no como mensaje.
 */

export const CAPTURE_MESSAGES = {
  'keys.none': { en: '(no keyed lessons yet — every capture so far predates the failure-capture loop)', es: '(aún no hay lecciones con clave: toda captura hasta ahora es anterior al bucle failure-capture)' },
  'keys.header': { en: 'EXISTING LESSON KEYS — reuse one if this incident is the SAME lesson:', es: 'CLAVES DE LECCIÓN EXISTENTES: reutiliza una si este incidente es la MISMA lección:' },

  'capture.refused': { en: 'capture REFUSED — the entry would not be a usable lesson:', es: 'capture RECHAZADO: la entrada no sería una lección utilizable:' },
  'capture.problem.key': { en: '--key must be lowercase-kebab-case, 4-60 chars (it becomes the parity anchor if this lesson is ever promoted)', es: '--key debe ir en kebab-case minúsculas, de 4 a 60 caracteres (pasa a ser el ancla de paridad si esta lección se promueve)' },
  'capture.problem.scope': { en: '--scope must be {allowed} here', es: '--scope debe ser {allowed} aquí' },
  'capture.problem.scope.noProject': { en: '--scope must be {allowed} here (no project holds this directory: run from inside one to record a project lesson)', es: '--scope debe ser {allowed} aquí (ningún proyecto contiene este directorio: corre desde dentro de uno para registrar una lección de proyecto)' },
  'capture.problem.actor': { en: '--actor must be "orchestrator" or "worker:<agent-type>"', es: '--actor debe ser "orchestrator" o "worker:<agent-type>"' },
  'capture.problem.lessonShort': { en: '--lesson must be a real one-line lesson (40+ chars)', es: '--lesson debe ser una lección real de una línea (40+ caracteres)' },
  'capture.problem.lessonRule': { en: '--lesson must state the rule explicitly and contain the word RULE (ledger format: what went wrong -> root cause -> RULE)', es: '--lesson debe enunciar la regla y contener la palabra RULE (formato del ledger: qué falló -> causa raíz -> RULE)' },
  'capture.deferred': { en: 'RECORDED (spooled) — the ledger is locked by another writer; {count} entr(y/ies) will fold on the next capture. Nothing is lost.', es: 'REGISTRADA (en spool): el ledger está bloqueado por otro escritor; {count} entrada(s) se plegará(n) en la próxima captura. No se pierde nada.' },
  'capture.spooled': { en: 'RECORDED (spooled) — not folded in this pass; it will fold on the next capture.', es: 'REGISTRADA (en spool): no se plegó en esta pasada; se plegará en la próxima captura.' },
  'capture.new': {
    en: ['RECORDED in the lessons ledger as a NEW lesson: {key} (1x).', 'It stays an INCIDENT. If it happens again the loop will demand promotion AND a mechanism (or a written reason none is possible).'],
    es: ['REGISTRADA en el ledger de lecciones como lección NUEVA: {key} (1x).', 'Sigue siendo un INCIDENTE. Si vuelve a ocurrir el bucle exigirá promoción Y un mecanismo (o un motivo escrito de por qué no cabe ninguno).']
  },
  'capture.recurrence': {
    en: ['RECURRENCE — "{key}" has now been recorded {count}x.', 'An incident that repeats is no longer an incident: ledger injection alone did NOT prevent it.', 'This project already ruled on that (ledger 2026-07-07: "a lesson without a blocking gate WILL recur").'],
    es: ['REINCIDENCIA: "{key}" ya se registró {count}x.', 'Un incidente que se repite deja de ser incidente: la sola inyección del ledger NO lo previno.', 'Este proyecto ya lo dictaminó (ledger 2026-07-07: "una lección sin gate bloqueante VOLVERÁ a ocurrir").']
  },

  'dismiss.refused': {
    en: ['dismiss REFUSED — --reason must say WHY this is not a correction (25+ chars).', 'A dismissal is recorded, never silent: the dismissal log is the only evidence that', 'can ever justify tuning the markers, so an empty one destroys the data it exists for.'],
    es: ['dismiss RECHAZADO: --reason debe decir POR QUÉ esto no es una corrección (25+ caracteres).', 'Un descarte se registra, nunca es silencioso: el registro de descartes es la única evidencia', 'que puede justificar ajustar los marcadores, así que uno vacío destruye los datos para los que existe.']
  },
  'dismiss.done': { en: 'DISMISSED and recorded. The turn may end.', es: 'DESCARTADA y registrada. El turno puede terminar.' },

  'status.ledger': { en: 'ledger {scope}: {file} — {bytes} bytes (~{tokens} tokens, loaded once per session)', es: 'ledger {scope}: {file} — {bytes} bytes (~{tokens} tokens, cargado una vez por sesión)' },
  'status.keyed': { en: 'keyed lessons: {count}', es: 'lecciones con clave: {count}' },
  'status.incidents': { en: 'incidents recorded: {count}', es: 'incidentes registrados: {count}' },
  'status.dismissals': { en: 'dismissals: {count}', es: 'descartes: {count}' },
  'status.due': { en: 'PROMOTION DUE (recurred, still only an incident):', es: 'PROMOCIÓN PENDIENTE (reincidió, sigue siendo solo un incidente):' },

  'init.noProject': { en: "init REFUSED — no project holds this directory (no .claude/CLAUDE.md above it, short of the home: the home's own .claude is global configuration, never a project).", es: 'init RECHAZADO: ningún proyecto contiene este directorio (no hay .claude/CLAUDE.md por encima, sin llegar al home: el .claude del home es configuración global, nunca un proyecto).' },
  'init.ledger.created': { en: 'project {scope}: ledger CREATED at {file}', es: 'proyecto {scope}: ledger CREADO en {file}' },
  'init.ledger.present': { en: 'project {scope}: ledger already present at {file}', es: 'proyecto {scope}: ledger ya presente en {file}' },
  'init.import.added': { en: 'project {scope}: import ADDED in {file}', es: 'proyecto {scope}: import AÑADIDO en {file}' },
  'init.import.present': { en: 'project {scope}: import already present in {file}', es: 'proyecto {scope}: import ya presente en {file}' },

  'condense.keysInvalid': { en: 'condense REFUSED — --keys needs a JSON file of the form {"keys":[{"line":"...","key":"..."}]} ({detail}).', es: 'condense RECHAZADO: --keys necesita un fichero JSON de la forma {"keys":[{"line":"...","key":"..."}]} ({detail}).' },
  'project.configUnreadable': { en: '{command} REFUSED — the project configuration cannot be read: {defect}. Nothing was changed.', es: '{command} RECHAZADO: no se puede leer la configuración del proyecto: {defect}. No se cambió nada.' },

  usage: {
    en: [
      'failure-capture — record a correction as a durable lesson.',
      '  init                 give this project its own ledger and import it from .claude/CLAUDE.md',
      '  keys                 list existing lesson keys (reuse one when it is the SAME lesson)',
      "  capture   --key <kebab-key> --scope <global|<this project's scope>> --actor <orchestrator|worker:<type>>",
      '            --lesson "<what went wrong -> root cause -> RULE ...>" [--session <id>]',
      '            or --lesson "<what went wrong -> root cause>" --rule "<the rule, one sentence>" (tiered ledger line)',
      '  dismiss   --reason "<why this is not a correction>" [--marker <m>] [--session <id>]',
      '  promote   --key <kebab-key> (--mechanism <guard path> | --no-mechanism "<why none is possible>")',
      '  condense  [--keys <file>] [--write]   shorten ledger lines whose text is kept in evidence (dry run without --write)',
      '  budget   [--project <dir>]            measure the always-loaded instruction set against its ceiling (exit 0 within, 1 over, 2 not measured)',
      '  status   counts, ledger token cost, and which lessons are due for promotion',
      "  Exit 2 when the project's .claude/failure-capture.json is invalid (only the commands that read the project fail)."
    ],
    es: [
      'failure-capture — registra una corrección como lección durable.',
      '  init: da a este proyecto su propio ledger y lo importa desde .claude/CLAUDE.md',
      '  keys: lista las claves de lección existentes (reutiliza una cuando es la MISMA lección)',
      "  capture: --key <clave-kebab> --scope <global|<alcance de este proyecto>> --actor <orchestrator|worker:<tipo>>",
      '           --lesson "<qué falló -> causa raíz -> RULE ...>" [--session <id>]',
      '           o --lesson "<qué falló -> causa raíz>" --rule "<la regla, una frase>" (línea de ledger por niveles)',
      '  dismiss: --reason "<por qué esto no es una corrección>" [--marker <m>] [--session <id>]',
      '  promote: --key <clave-kebab> (--mechanism <ruta del guard> | --no-mechanism "<por qué no cabe ninguno>")',
      '  condense: [--keys <fichero>] [--write] acorta las líneas del ledger cuyo texto se conserva en evidencia (simulacro sin --write)',
      '  budget: [--project <dir>] mide el conjunto de instrucciones siempre cargado frente a su techo (salida 0 dentro, 1 sobre el techo, 2 no medido)',
      '  status: recuentos, coste en tokens del ledger y qué lecciones tocan promoción',
      '  Salida 2 si el .claude/failure-capture.json del proyecto es inválido (solo fallan los comandos que leen el proyecto).'
    ]
  }
};
