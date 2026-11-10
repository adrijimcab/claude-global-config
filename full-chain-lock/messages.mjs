/**
 * Every sentence the full-chain lock prints or refuses with, as ONE table consumed through
 * `bilingual-output/speaker.mjs`: English first, then the Spanish half marked `@es`. The speaker refuses a table
 * with a message that lacks a half, and an id the table does not carry throws.
 *
 * @es Cada frase que imprime o con la que rechaza el lock de cadenas completas, como UNA tabla consumida por
 * `bilingual-output/speaker.mjs`: inglés primero y luego la mitad española marcada `@es`. El speaker rechaza una
 * tabla con un mensaje al que le falta una mitad, y un id que la tabla no lleva lanza un error.
 */

import { makeSpeaker } from '../bilingual-output/speaker.mjs';

/** The heading and the reason both refusals give. @es El encabezado y la razón que dan las dos negativas. */
const REFUSAL_OPENING = {
  en: [
    'FULL-CHAIN GUARD REFUSED this command: {command} is a full chain ({chain}, project {project}) and runs only through the machine-wide lock.',
    '',
    'WHY. Every full chain (build:ci-pr, the coverage suites, mutation, a11y, the whole selftest runner) is heavy on memory;',
    'two at once starved the machine (a background gate run was reaped for low memory on 2026-10-05). The rule was kept by',
    'hand, through messages between sessions; this lock keeps it by mechanism: one chain at a time on this machine.'
  ],
  es: [
    'FULL-CHAIN GUARD RECHAZÓ este comando: {command} es una cadena completa ({chain}, proyecto {project}) y corre solo por el lock de toda la máquina.',
    '',
    'POR QUÉ. Toda cadena completa (build:ci-pr, las suites con cobertura, mutación, a11y, el runner de selftests entero) consume',
    'mucha memoria; dos a la vez ahogaron la máquina (una corrida de gates en segundo plano fue cerrada por poca memoria el',
    '2026-10-05). La regla se cumplía a mano, con mensajes entre sesiones; este lock la cumple por mecanismo: una cadena a la vez.'
  ]
};

/** The messages. Placeholders are `{name}`. @es Los mensajes; los marcadores son `{name}`. */
export const MESSAGES = {
  waiting: {
    en: 'FULL-CHAIN LOCK: waiting. Another full chain runs on this machine: chain {holderChain} of project {holderProject}, session {holderSession}, pid {holderPid}, started {holderStartedAt}. Waiting up to {waitSeconds}s for it to finish; nothing runs meanwhile.',
    es: 'LOCK DE CADENAS COMPLETAS: esperando. Otra cadena completa corre en esta máquina: cadena {holderChain} del proyecto {holderProject}, sesión {holderSession}, pid {holderPid}, iniciada {holderStartedAt}. Se espera hasta {waitSeconds}s a que termine; mientras tanto no se ejecuta nada.'
  },
  'waiting-unreadable': {
    en: 'FULL-CHAIN LOCK: waiting. Another full chain holds the lock on this machine and its record is not readable yet. Waiting up to {waitSeconds}s; nothing runs meanwhile.',
    es: 'LOCK DE CADENAS COMPLETAS: esperando. Otra cadena completa tiene el lock en esta máquina y su registro aún no se puede leer. Se espera hasta {waitSeconds}s; mientras tanto no se ejecuta nada.'
  },
  'wait-expired': {
    en: 'FULL-CHAIN LOCK: gave up after {waitSeconds}s. The lock is still held by chain {holderChain} of project {holderProject}, session {holderSession}, pid {holderPid}, started {holderStartedAt}. Your command did NOT run (a full chain never runs unlocked). Retry when that chain ends, or raise --wait-seconds.',
    es: 'LOCK DE CADENAS COMPLETAS: se desistió tras {waitSeconds}s. El lock sigue en manos de la cadena {holderChain} del proyecto {holderProject}, sesión {holderSession}, pid {holderPid}, iniciada {holderStartedAt}. Tu comando NO se ejecutó (una cadena completa nunca corre sin lock). Reintenta cuando esa cadena termine, o sube --wait-seconds.'
  },
  'wait-expired-unreadable': {
    en: 'FULL-CHAIN LOCK: gave up after {waitSeconds}s. The lock is still held and its holder record is not readable. Your command did NOT run (a full chain never runs unlocked). Retry later, or raise --wait-seconds.',
    es: 'LOCK DE CADENAS COMPLETAS: se desistió tras {waitSeconds}s. El lock sigue ocupado y el registro de su dueño no se puede leer. Tu comando NO se ejecutó (una cadena completa nunca corre sin lock). Reintenta más tarde, o sube --wait-seconds.'
  },
  'lock-fault': {
    en: 'FULL-CHAIN LOCK: the lock could not be taken because of a fault, not because another chain holds it: {detail} Your command did NOT run (a full chain never runs unlocked).',
    es: 'LOCK DE CADENAS COMPLETAS: el lock no se pudo tomar por un fallo, no porque otra cadena lo tenga: {detail} Tu comando NO se ejecutó (una cadena completa nunca corre sin lock).'
  },
  'token-unreadable': {
    en: 'FULL-CHAIN LOCK: the lock was taken but its holder id could not be read back, so the command cannot be given its FULL_CHAIN_LOCK_TOKEN. Your command did NOT run (a full chain never runs unlocked); the lock was released.',
    es: 'LOCK DE CADENAS COMPLETAS: el lock se tomó pero no se pudo releer su id de dueño, así que no se puede dar al comando su FULL_CHAIN_LOCK_TOKEN. Tu comando NO se ejecutó (una cadena completa nunca corre sin lock); el lock se soltó.'
  },
  'run-failed': {
    en: 'FULL-CHAIN LOCK: the command could not be run because of an internal error: {detail} The lock was released.',
    es: 'LOCK DE CADENAS COMPLETAS: el comando no se pudo ejecutar por un error interno: {detail} El lock se soltó.'
  },
  'release-failed': {
    en: 'FULL-CHAIN LOCK: the command finished, but releasing the lock failed: {detail} The exit code of your command is unchanged. A dead holder is broken by the next chain after the stale age.',
    es: 'LOCK DE CADENAS COMPLETAS: el comando terminó, pero soltar el lock falló: {detail} El código de salida de tu comando no cambió. El siguiente que llegue rompe un dueño muerto pasada la edad de caducidad.'
  },
  'spawn-failed': {
    en: 'FULL-CHAIN LOCK: the command could not be started ({code}): {detail}. The lock was released.',
    es: 'LOCK DE CADENAS COMPLETAS: no se pudo iniciar el comando ({code}): {detail}. El lock se soltó.'
  },
  'unsafe-argument': {
    en: 'FULL-CHAIN LOCK: the argument {argument} holds a double quote or a percent sign, which a Windows .cmd launcher cannot carry safely. Run the command with a plain argument or call the program directly.',
    es: 'LOCK DE CADENAS COMPLETAS: el argumento {argument} lleva comillas dobles o un signo de porcentaje, que un lanzador .cmd de Windows no puede transportar con seguridad. Ejecuta el comando con un argumento simple o llama al programa directamente.'
  },
  usage: {
    en: [
      'FULL-CHAIN LOCK usage: node run.mjs --chain <name> [--project <name>] [--session <id>] [--tree <dir>] [--wait-seconds <n>] [--poll-ms <n>] [--detach [--run-dir <dir>]] -- <command> [args...]',
      '                       node run.mjs --read <run dir>'
    ],
    es: [
      'USO DEL LOCK DE CADENAS COMPLETAS: node run.mjs --chain <nombre> [--project <nombre>] [--session <id>] [--tree <dir>] [--wait-seconds <n>] [--poll-ms <n>] [--detach [--run-dir <dir>]] -- <comando> [args...]',
      '                                   node run.mjs --read <directorio de corrida>'
    ]
  },
  detached: {
    en: [
      'FULL-CHAIN LOCK: the chain was started DETACHED from this session; no kill of this session\'s process tree reaches it. It still runs under the machine-wide lock.',
      'Run directory: {runDir}',
      'Detached pid:  {pid}',
      'Read its state (running, finished with its exit code, or lost) with:',
      '',
      '  {readCommand}'
    ],
    es: [
      'LOCK DE CADENAS COMPLETAS: la cadena se inició DESACOPLADA de esta sesión; ningún kill del árbol de procesos de esta sesión la alcanza. Sigue corriendo bajo el lock de toda la máquina.',
      'Directorio de corrida: {runDir}',
      'Pid desacoplado:       {pid}',
      'Lee su estado (corriendo, terminada con su código de salida, o perdida) con:',
      '',
      '  {readCommand}'
    ]
  },
  'detach-failed': {
    en: 'FULL-CHAIN LOCK: the chain could NOT be started detached: {detail} Nothing runs and no environment was left on disk.',
    es: 'LOCK DE CADENAS COMPLETAS: la cadena NO se pudo iniciar desacoplada: {detail} No corre nada y no quedó ningún entorno en disco.'
  },
  'run-dir-used': {
    en: 'FULL-CHAIN LOCK: the run directory {runDir} already holds a run. Pick another --run-dir; nothing was started.',
    es: 'LOCK DE CADENAS COMPLETAS: el directorio de corrida {runDir} ya tiene una corrida. Elige otro --run-dir; no se inició nada.'
  },
  'read-running': {
    en: 'FULL-CHAIN LOCK: RUNNING. The detached chain of {runDir} is alive (pid {pid}) and has not written its verdict yet.',
    es: 'LOCK DE CADENAS COMPLETAS: CORRIENDO. La cadena desacoplada de {runDir} está viva (pid {pid}) y aún no escribió su veredicto.'
  },
  'read-finished': {
    en: 'FULL-CHAIN LOCK: FINISHED with exit {exitCode} at {endedAt}. The output is in {runDir}. This command exits with that code.',
    es: 'LOCK DE CADENAS COMPLETAS: TERMINADA con salida {exitCode} a las {endedAt}. La salida está en {runDir}. Este comando sale con ese código.'
  },
  'read-unstarted': {
    en: 'FULL-CHAIN LOCK: FINISHED WITHOUT AN EXIT CODE in {runDir}: {detail} The chain did not run to an exit of its own.',
    es: 'LOCK DE CADENAS COMPLETAS: TERMINADA SIN CÓDIGO DE SALIDA en {runDir}: {detail} La cadena no llegó a una salida propia.'
  },
  'read-lost': {
    en: 'FULL-CHAIN LOCK: LOST. The detached chain of {runDir} has no verdict and no live process: it was killed or never started. Its output so far is in that directory.',
    es: 'LOCK DE CADENAS COMPLETAS: PERDIDA. La cadena desacoplada de {runDir} no tiene veredicto ni proceso vivo: la mataron o nunca inició. Su salida hasta ahora está en ese directorio.'
  },
  'usage-read': {
    en: 'FULL-CHAIN LOCK: --read takes exactly one run directory: node run.mjs --read <run dir>.',
    es: 'LOCK DE CADENAS COMPLETAS: --read recibe exactamente un directorio de corrida: node run.mjs --read <directorio de corrida>.'
  },
  'usage-run-dir-without-detach': {
    en: 'FULL-CHAIN LOCK: --run-dir only makes sense with --detach.',
    es: 'LOCK DE CADENAS COMPLETAS: --run-dir solo tiene sentido con --detach.'
  },
  'usage-no-separator': {
    en: 'FULL-CHAIN LOCK: the command must follow a "--" separator.',
    es: 'LOCK DE CADENAS COMPLETAS: el comando debe ir después de un separador "--".'
  },
  'usage-unknown-flag': {
    en: 'FULL-CHAIN LOCK: unknown flag {flag}.',
    es: 'LOCK DE CADENAS COMPLETAS: flag desconocido {flag}.'
  },
  'usage-missing-value': {
    en: 'FULL-CHAIN LOCK: the flag {flag} needs a value.',
    es: 'LOCK DE CADENAS COMPLETAS: el flag {flag} necesita un valor.'
  },
  'usage-bad-number': {
    en: 'FULL-CHAIN LOCK: the flag {flag} must be a positive number, got {value}.',
    es: 'LOCK DE CADENAS COMPLETAS: el flag {flag} debe ser un número positivo, se recibió {value}.'
  },
  'usage-no-chain': {
    en: 'FULL-CHAIN LOCK: --chain is required and must not be empty.',
    es: 'LOCK DE CADENAS COMPLETAS: --chain es obligatorio y no puede estar vacío.'
  },
  'usage-no-command': {
    en: 'FULL-CHAIN LOCK: the command after "--" is missing or empty.',
    es: 'LOCK DE CADENAS COMPLETAS: falta el comando tras "--" o está vacío.'
  },
  'config-invalid': {
    en: 'The full-chain declaration {file} is not valid: {problem}.',
    es: 'La declaración de cadenas completas {file} no es válida: {problem}.'
  },
  'tree-write-refusal': {
    en: [
      'FULL-CHAIN WRITE GUARD REFUSED this call: it writes inside the tree a running full chain measures.',
      '',
      '{targets}',
      '',
      'THE CHAIN: {holderChain} of project {holderProject}, session {holderSession}, pid {holderPid}, started {holderStartedAt},',
      'measuring {holderTree}.',
      '',
      'WHY. A chain reads its tree while it runs: the selftest runner compares `git status` of the tree before and after',
      'every selftest, so an edit, a `git add` or a `git commit` made meanwhile is counted as an escape of whichever',
      'selftest is running. Measured 2026-10-26: an edit and a commit of checklists/master-backlog.md during the',
      '~/.claude runner turned brief-feasibility, commit-index-guard and foreign-delete-guard red; the re-run with no',
      'writes showed those three reds were false.',
      '',
      'WAIT, DO NOT POLL: queue this write until the chain has finished and its verdict is read (the chain\'s own log or',
      'its background-task notification). This refusal lifts by itself the moment the chain releases its lock or its',
      'runner process {holderPid} ends. Work that cannot wait goes in another tree (your own worktree), never this one.'
    ],
    es: [
      'FULL-CHAIN WRITE GUARD RECHAZÓ esta llamada: escribe dentro del árbol que mide una cadena completa en marcha.',
      '',
      '{targets}',
      '',
      'LA CADENA: {holderChain} del proyecto {holderProject}, sesión {holderSession}, pid {holderPid}, iniciada {holderStartedAt},',
      'midiendo {holderTree}.',
      '',
      'POR QUÉ. Una cadena lee su árbol mientras corre: el runner de selftests compara el `git status` del árbol antes y',
      'después de cada selftest, así que una edición, un `git add` o un `git commit` hechos entretanto cuentan como fuga',
      'del selftest que esté corriendo. Medido el 2026-10-26: una edición y un commit de checklists/master-backlog.md',
      'durante el runner de ~/.claude pusieron en rojo brief-feasibility, commit-index-guard y foreign-delete-guard; la',
      'nueva corrida sin escrituras mostró que esos tres rojos eran falsos.',
      '',
      'ESPERA, SIN SONDEAR: deja esta escritura en cola hasta que la cadena termine y se lea su veredicto (su propio log o',
      'la notificación de su tarea en segundo plano). Este rechazo se levanta solo en cuanto la cadena suelta su lock o',
      'termina su proceso runner {holderPid}. El trabajo que no puede esperar va en otro árbol (tu propio worktree), nunca en este.'
    ]
  },
  refusal: {
    en: [
      ...REFUSAL_OPENING.en,
      '',
      'USE INSTEAD, replacing that command by:',
      '',
      '  {wrapped}',
      '',
      '--tree names the tree the chain measures, so the lock records and protects the right one.',
      'It waits (bounded, --wait-seconds, default {defaultWaitSeconds}) while another chain runs, prints who holds the lock, runs your',
      'command with its exact exit code and releases the lock on every exit path.'
    ],
    es: [
      ...REFUSAL_OPENING.es,
      '',
      'USAR EN SU LUGAR, reemplazando ese comando por:',
      '',
      '  {wrapped}',
      '',
      '--tree nombra el árbol que mide la cadena, para que el lock registre y proteja el correcto.',
      'Espera (acotado, --wait-seconds, por defecto {defaultWaitSeconds}) mientras otra cadena corre, muestra quién tiene el lock, ejecuta tu',
      'comando con su código de salida exacto y suelta el lock en toda salida.'
    ]
  },
  'refusal-tree-unknown': {
    en: [
      ...REFUSAL_OPENING.en,
      '',
      'NO COMMAND IS SUGGESTED: the tree this chain measures could not be determined (the call carried no directory, it changed',
      'directory in a way that cannot be followed, the directory is in no git working tree, or a landing named no --worktree).',
      'A guessed --tree would make the lock record, and the write guard protect, the wrong tree.',
      '',
      'Wrap the command yourself and name the tree explicitly: node <full-chain-lock>/run.mjs --chain {chain} --tree <the tree the chain',
      'measures> -- {command}. It waits (bounded, --wait-seconds, default {defaultWaitSeconds}) while another chain runs.'
    ],
    es: [
      ...REFUSAL_OPENING.es,
      '',
      'NO SE SUGIERE NINGÚN COMANDO: no se pudo determinar el árbol que mide esta cadena (la llamada no traía directorio, cambió de',
      'directorio de un modo que no se puede seguir, el directorio no está en ningún árbol de trabajo git, o un aterrizaje no nombró --worktree).',
      'Un --tree adivinado haría que el lock registre, y el guard de escritura proteja, el árbol equivocado.',
      '',
      'Envuelve el comando tú mismo y nombra el árbol de forma explícita: node <full-chain-lock>/run.mjs --chain {chain} --tree <el árbol que',
      'mide la cadena> -- {command}. Espera (acotado, --wait-seconds, por defecto {defaultWaitSeconds}) mientras otra cadena corre.'
    ]
  }
};

/** The speaker of this table. @es El speaker de esta tabla. */
export const speak = (sink = console) => makeSpeaker(MESSAGES, sink);
