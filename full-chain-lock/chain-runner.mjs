/**
 * The domain of the full-chain lock: run ONE command while holding the machine-wide lock, or say why it did not.
 * It knows nothing of files, processes or clocks; it talks to four PORTS handed in by the composition root
 * (`run.mjs`), so a proof can drive it with fakes and a new lock or process adapter changes nothing here.
 *
 *   - `lock`:  `tryTake(record)` takes the lock once (stale holders are broken by the lock's own rule) and says
 *              whether it did; `readHolder()` reads who holds it, or `undefined`; `release()` gives it back.
 *   - `child`: `run(command, args)` runs the command and resolves its exit code, exactly. It rejects when the
 *              command cannot be started.
 *   - `clock`: `now()` in milliseconds and `sleep(ms)`.
 *   - `say`:   the speaker of `messages.mjs` (`say.say`, `say.complain`, `say.line`).
 *
 * THE INVARIANTS. The command NEVER runs without the lock. While another chain holds it, the runner waits for a
 * bounded time, announcing the holder (once per distinct holder), then gives up with a distinct exit code. Once
 * taken, the lock is released on EVERY path out: the command returning, exiting non-zero, being killed by a
 * signal (the child port maps it to a code), or the child port throwing. A release that fails is reported but
 * never changes the command's exit code, and never masks the command's own error.
 *
 * @es El dominio del lock de cadenas completas: ejecutar UN comando con el lock de toda la máquina, o decir por
 * qué no. No sabe nada de ficheros, procesos ni relojes: habla con cuatro PUERTOS que le da la raíz de
 * composición (`run.mjs`), así una prueba lo maneja con falsos. INVARIANTES: el comando NUNCA corre sin el lock;
 * mientras otra cadena lo tiene, espera un tiempo acotado anunciando al dueño (una vez por dueño distinto) y luego
 * se rinde con un código propio; una vez tomado, el lock se suelta en TODA salida (el comando vuelve, sale con
 * error, lo mata una señal o el puerto del hijo lanza). Soltar con fallo se informa pero no cambia el código del
 * comando ni tapa su error.
 */

/** The exit codes the runner itself produces; every other code is the command's. @es Los códigos de salida propios del runner; todo otro código es del comando. */
export const EXIT = Object.freeze({ usage: 2, lockFault: 70, waitExpired: 75, notStarted: 127 });

/** How long a chain waits for the lock by default, in seconds. @es Cuánto espera una cadena el lock por defecto, en segundos. */
export const DEFAULT_WAIT_SECONDS = 3600;

/** How often a waiting chain looks at the lock again, in milliseconds. @es Cada cuánto vuelve a mirar el lock una cadena que espera, en milisegundos. */
export const DEFAULT_POLL_MS = 2000;

/**
 * What a child port throws when the command could not even be started: the id and parameters of the bilingual
 * message that says why. Any other error it throws is a defect and propagates after the lock is released.
 * @es Lo que lanza el puerto del hijo cuando el comando ni siquiera pudo iniciarse: el id y los parámetros del
 * mensaje bilingüe que dice por qué. Cualquier otro error es un defecto y se propaga tras soltar el lock.
 */
export class CommandNotStarted extends Error {
  constructor(messageId, params, options) {
    super(messageId, options);
    this.name = 'CommandNotStarted';
    this.messageId = messageId;
    this.params = params;
  }
}

/** The placeholders that describe a holder record in a message. @es Los marcadores que describen el registro de un dueño en un mensaje. */
const holderFields = (holder) => ({
  holderChain: holder.chain,
  holderProject: holder.project,
  holderSession: holder.session,
  holderPid: holder.pid,
  holderStartedAt: holder.startedAt
});

/** The text of a failure. @es El texto de un fallo. */
const faultDetail = (error) => (error instanceof Error ? error.message : String(error));

/**
 * Announces who holds the lock, once per distinct holder.
 * @es Anuncia quién tiene el lock, una vez por dueño distinto.
 */
function announce(say, holder, waitSeconds) {
  if (holder === undefined) say.complain('waiting-unreadable', { waitSeconds });
  else say.complain('waiting', { ...holderFields(holder), waitSeconds });
}

/** Gives the lock back; a failure is told and never thrown. @es Devuelve el lock; un fallo se cuenta y nunca se lanza. */
function giveBack(lock, say) {
  try {
    lock.release();
  } catch (error) {
    say.complain('release-failed', { detail: faultDetail(error) });
  }
}

/**
 * Runs `request.command` under the lock.
 *
 * @param {{ chain: string, project: string, session: string, command: string, args: string[], waitMs: number, pollMs: number }} request
 * @param {{ lock: object, child: object, clock: object, say: object, processId: number }} ports
 * @returns {Promise<number>} the exit code of the whole run: the command's own, or one of `EXIT`.
 * @throws whatever the child port throws, after the lock was released.
 * @es Ejecuta `request.command` bajo el lock; devuelve el código de salida de toda la corrida: el del comando o uno de `EXIT`.
 */
export async function runChain(request, ports) {
  const { lock, child, clock, say, processId } = ports;
  const waitSeconds = request.waitMs / 1000;
  const startedAt = new Date(clock.now()).toISOString();
  const record = { session: request.session, project: request.project, chain: request.chain, pid: processId, startedAt, command: [request.command, ...request.args].join(' ') };
  const deadline = clock.now() + request.waitMs;
  let announced;
  let looked = false;

  for (;;) {
    let taken;

    try {
      taken = lock.tryTake(record);
    } catch (error) {
      say.complain('lock-fault', { detail: faultDetail(error) });

      return EXIT.lockFault;
    }

    if (taken) break;

    const holder = lock.readHolder();
    const identity = JSON.stringify(holder ?? null);

    // A record that is missing on the FIRST look is usually a holder between taking the lock and writing it; it is
    // announced as unreadable only if it is still missing at the next look.
    // @es Un registro ausente en la PRIMERA mirada suele ser un dueño entre tomar el lock y escribirlo; solo se anuncia como ilegible si sigue ausente en la siguiente.
    const settled = holder !== undefined || looked;

    looked = true;

    if (settled && identity !== announced) {
      announce(say, holder, waitSeconds);
      announced = identity;
    }

    const left = deadline - clock.now();

    if (left <= 0) {
      if (holder === undefined) say.complain('wait-expired-unreadable', { waitSeconds });
      else say.complain('wait-expired', { ...holderFields(holder), waitSeconds });

      return EXIT.waitExpired;
    }

    await clock.sleep(Math.min(request.pollMs, left));
  }

  try {
    return await child.run(request.command, request.args);
  } catch (error) {
    if (!(error instanceof CommandNotStarted)) throw error;

    say.complain(error.messageId, error.params);

    return EXIT.notStarted;
  } finally {
    giveBack(lock, say);
  }
}
