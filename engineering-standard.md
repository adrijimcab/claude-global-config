# Engineering standard — binding, every session, every project

Decision rules, not slogans. Each one is applied BEFORE writing and named in the reply when it decided something. It
governs every decision, every reply to the owner and every judgment of his statements and premises, in every session
and agent, ODD or not. The owner's verbatim orders behind items 3-6 (2026-10-18) are in engram (state/2026-10-18-master).

1. **Tie-break order.** When options conflict: correctness and security, then the quality gates, then performance, then
   simplicity. Name the rejected alternative in one line. The senior stance lives in `rules/00-owner-mandates.md`.
2. **KISS and YAGNI.** The simplest design that meets the requirement MEASURED today. No speculative abstraction,
   option, parameter or layer for a need nobody has shown.
3. **SOLID and clean code, for what exists and for what comes.** One responsibility per unit, named for what it owns;
   dependencies point inward; a reader sees what it does from its entry point alone. A library, shared kit or global
   tooling serves future projects through SOLID, not by breaking YAGNI: open for extension and closed for
   modification, behind stable seams (ports, configuration, injected dependencies) a new project extends without
   editing the kit. Seams are designed in; the features behind them are built when a consumer needs them; no seam
   weakens a guarantee (no silent modes, the safe default stays). Existing code below this standard is refactored to
   it as tracked ODD work, area by area, from an audit that reads the code; "it already works" never keeps it below.
4. **Hexagonal architecture, everywhere.** Domain logic sits behind ports; every external system (HTTP, storage, the
   file system, processes, browser APIs, SDKs, git, engram) is reached through an adapter implementing a port, so a
   new connector is a new adapter, never an edit of the domain. A small script gets the port it needs to be
   replaceable and testable, and no layer that serves nothing (KISS).
5. **Route: tracked ODD for every non-trivial change**, however small or settled; `direct` only for trivial scope (a
   typo, a rename, a comment, a one-line no-logic change). Full text: `route-mandate.md` point 1 (single source).
6. **Model by task.** Each delegated agent runs on the cheapest model that does its task well: `haiku` for read-only and
   mechanical work, `sonnet` for implementation and review, `opus` only for a role whose definition names it. Full
   text: the orchestration directive of `rules/10-contracts.md`.
@es Estándar de ingeniería: reglas de decisión, no consignas; rige toda decisión, toda respuesta al dueño y todo juicio
de sus afirmaciones, en toda sesión y agente. (1) Desempate: corrección y seguridad, luego quality gates, luego
rendimiento, luego simplicidad; se nombra la alternativa descartada. (2) KISS y YAGNI: el diseño más simple que cumple
lo MEDIDO hoy, sin abstracción especulativa. (3) SOLID y código limpio, para lo existente y para lo que viene: una
responsabilidad por unidad, dependencias hacia adentro, legible desde su entrada; un kit compartido sirve a proyectos
futuros por SOLID y no rompiendo YAGNI: abierto a la extensión y cerrado a la modificación, con costuras estables
(puertos, configuración, dependencias inyectadas) que se diseñan desde el inicio, mientras lo que va detrás se construye
cuando un consumidor lo necesita, y ninguna debilita una garantía; el código existente por debajo del estándar se
refactoriza como ODD, área por área, desde una auditoría que lee el código; «ya funciona» no es excusa. (4) Hexagonal
en todo: el dominio detrás de puertos y cada sistema externo por un adaptador; un conector nuevo es un adaptador nuevo,
nunca una edición del dominio; un script chico recibe el puerto que necesita y ninguna capa que no sirva (KISS).
(5) Ruta: ODD seguido para todo cambio no trivial; `direct` solo para lo trivial. (6) Modelo según la tarea: `haiku`
para solo lectura y mecánico, `sonnet` para implementar y revisar, `opus` solo para el rol que lo declara.
