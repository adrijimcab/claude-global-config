/**
 * Every sentence the pollution check prints, as a bilingual table consumed through `bilingual-output/`.
 *
 * @es Cada frase que imprime la comprobación de contaminación, como tabla bilingüe consumida por `bilingual-output/`.
 */

/** The messages. Placeholders are `{name}`. @es Los mensajes; los marcadores son `{name}`. */
export const MESSAGES = {
  population: {
    en: 'Watching {count} real state directories of {home}.',
    es: 'Vigilando {count} directorios de estado reales de {home}.'
  },
  'change-added': {
    en: 'POLLUTION in {area}: {path} was added by the run.',
    es: 'CONTAMINACIÓN en {area}: la corrida agregó {path}.'
  },
  'change-removed': {
    en: 'POLLUTION in {area}: {path} was removed by the run.',
    es: 'CONTAMINACIÓN en {area}: la corrida eliminó {path}.'
  },
  'change-changed': {
    en: 'POLLUTION in {area}: {path} was changed by the run.',
    es: 'CONTAMINACIÓN en {area}: la corrida modificó {path}.'
  },
  candidate: {
    en: '  candidate: a source file of {mechanism} calls homedir() (a lead, not the verdict).',
    es: '  candidato: un fichero fuente de {mechanism} llama a homedir() (una pista, no el veredicto).'
  },
  'command-exit': {
    en: 'The measured command ended with status {status}; the verdict below is about pollution only.',
    es: 'El comando medido terminó con estado {status}; el veredicto de abajo es solo sobre contaminación.'
  },
  green: {
    en: 'GREEN: the run left the real state, the main checkout and the temp root as it found them.',
    es: 'VERDE: la corrida dejó el estado real, el checkout principal y la raíz temporal como los encontró.'
  },
  red: {
    en: 'RED: the run polluted {count} path(s); the real environment is not isolated.',
    es: 'ROJO CONTAMINACIÓN: la corrida contaminó {count} ruta(s); el entorno real no está aislado.'
  },
  usage: {
    en: 'Not measured: usage is `pollution.mjs [--home <dir>] [--checkout <dir>] [--temp <dir>] -- <command> [args]`.',
    es: 'No medido: el uso es `pollution.mjs [--home <dir>] [--checkout <dir>] [--temp <dir>] -- <comando> [args]`.'
  },
  'not-measured': {
    en: 'Not measured: {reason}',
    es: 'No medido: {reason}'
  },
  'cannot-list': {
    en: 'Cannot list the state of {root} with git: {reason}',
    es: 'No se puede listar el estado de {root} con git: {reason}'
  }
};
