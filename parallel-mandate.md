# Parallel and asynchronous by default — binding, every session, every agent, every project

Owner directive of 2026-11-04, verbatim: «paralelizar todo lo posible y de hacer asincrono lo que se pueda y tenga
sentido para cada agente y para TODOS los proyectos como regla, es inaceptable que los mutantes y esto tarden tanto y se
haya hecho así habiéndolo podido hacer bien desde un principio».

1. **Concurrent from the first version.** Work made of independent units (suites, mutants, files, requests, probes,
   checks) runs them through a bounded pool; its concurrency comes from the cores and from the shared resource it uses
   (the mutation engine's `concurrencyOf`: the campaign value, else an environment override, else
   `min(8, cores - 2)`). Waiting on I/O or on a child process is asynchronous. A serial loop over independent units is
   a defect, never a first draft.
2. **Same verdict, serial or parallel.** Each unit is isolated (its own temp, sandbox or copy), so a parallel verdict
   means exactly what a serial one means. A check that observes SHARED state (a tree's `git status`, a port, a lock
   file) is designed for the batch: it measures once around the batch and, when that changed, re-runs serially only to
   name the unit responsible; it is never left to cross-attribute.
3. **Serial only for a measured reason, named in the code.** A real dependency between units, or a shared resource
   that cannot be isolated, is measured and written next to the loop that stays serial.
4. **One full chain at a time on the machine still holds.** `full-chain-lock` keeps two heavy chains from starving
   memory; parallelism lives INSIDE a run, bounded, never as two chains at once.
5. **Agents too.** Independent tool calls go in one batch; independent work units launch together, within the
   shared-resource caps of the lessons ledger.
6. **What exists is refactored, measured.** Every serial runner over independent units is tracked ODD work, with the
   time measured before and after (mutation engine: orphan-work campaign 90 → 9 minutes; the selftest runner next).

@es Paralelo y asíncrono por defecto — vinculante en toda sesión, todo agente y todo proyecto (directiva del dueño
2026-11-04, cita arriba). (1) Desde la primera versión: el trabajo hecho de unidades independientes las corre con un pool
acotado, con la concurrencia según los núcleos y el recurso compartido (`concurrencyOf` del motor de mutantes), y la
espera de E/S o de un proceso hijo es asíncrona; un bucle en serie sobre unidades independientes es un defecto. (2) El
mismo veredicto en serie o en paralelo: cada unidad va aislada (temporal, sandbox o copia propia), y una comprobación que
observa estado COMPARTIDO (el `git status` de un árbol, un puerto, un fichero de lock) se diseña para la tanda: mide una
vez alrededor de ella y, si cambió, repite en serie solo para nombrar a la unidad responsable. (3) Serie solo por una
razón medida y escrita junto al bucle. (4) Sigue valiendo una cadena completa a la vez en la máquina (`full-chain-lock`):
el paralelismo vive dentro de cada corrida. (5) Los agentes igual: llamadas independientes en un lote y unidades
independientes lanzadas juntas, dentro de los topes de recursos compartidos. (6) Lo existente se refactoriza como ODD,
medido antes y después (motor de mutantes: campaña de orphan-work de 90 a 9 minutos; el runner de selftests es el
siguiente).
