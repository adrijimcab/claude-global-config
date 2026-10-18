# Engineering standard — binding, every session, every project

Decision rules, not slogans. Each one is applied BEFORE writing and named in the reply when it decided something.
It governs every decision, every reply to the owner and every judgment of the owner's statements and premises,
in every session and every agent, ODD or not.

1. **Tie-break order.** When options conflict: correctness and security, then the quality gates, then
   performance, then simplicity. Name the rejected alternative in one line. The senior-architect stance
   itself lives in `~/.claude/rules/00-owner-mandates.md`; it is not repeated here.
2. **KISS and YAGNI.** The simplest design that meets the requirement MEASURED today. No speculative
   abstraction, option, parameter or layer for a need nobody has shown.
3. **SOLID and clean code.** One responsibility per unit, named for what it owns; dependencies point
   inward (the domain knows no framework); a reader sees what it does from its entry point alone. SOLID is
   how a library, a shared kit or global tooling serves future projects without breaking YAGNI (owner,
   2026-10-18: «PARA TODO, el Discovery es lo mínimo pero hay que pensar en escalabilidad y en TENER TODAS
   LAS POSIBILIDADES POSIBLES PARA PROYECTOS FUTUROS»; and «Los principios son SOLID, KISS Y YAGNI»): it is
   open for extension and closed for modification, behind stable seams (ports, configuration, injected
   dependencies) that a new project extends without editing the kit. The seams are designed in; the features
   behind them are built only when a consumer needs them, and no seam weakens a guarantee (no silent modes;
   the safe default stays).
4. **Architecture fits the domain.** Hexagonal (ports and adapters) where the code talks to external
   systems: HTTP, storage, browser APIs, third-party SDKs. The tension is explicit: a 40-line hook script
   does not get layers it does not need, and there YAGNI wins. Layers are added when a second adapter or a
   test seam is real, never in advance.
5. **Route: tracked ODD for every non-trivial change.** `tracked-odd` for every change, however small or
   settled; `direct` only for trivial scope (a typo, a rename, a comment tweak, a genuinely one-line
   no-logic change). Full text: point 1 of `~/.claude/route-mandate.md` (single source).
6. **Model by task.** Every delegated agent runs on the cheapest model that can do its task well: `haiku`
   for read-only and mechanical work, `sonnet` for implementation and review, `opus` only for a role whose
   definition names it. Full text: the orchestration directive of `~/.claude/rules/10-contracts.md`.

@es Estándar de ingeniería: reglas de decisión, no consignas. Rige toda decisión, toda respuesta al dueño y todo juicio de sus afirmaciones y premisas, en toda sesión y todo agente, con o sin ODD. (1) Desempate: corrección y seguridad, luego
los quality gates, luego rendimiento, luego simplicidad; se nombra la alternativa descartada. (2) KISS y
YAGNI: el diseño más simple que cumple el requisito MEDIDO hoy, sin abstracción especulativa. (3) SOLID y
código limpio: una responsabilidad por unidad, dependencias hacia adentro, legible desde su entrada. SOLID es
cómo una librería, un kit compartido o el tooling global sirve a proyectos futuros sin romper YAGNI (dueño,
2026-10-18: «Los principios son SOLID, KISS Y YAGNI»): abierto a la extensión y cerrado a la modificación,
detrás de costuras estables (puertos, configuración, dependencias inyectadas) que un proyecto nuevo extiende
sin editar el kit; las costuras se diseñan, las funciones detrás se construyen cuando un consumidor las
necesita, y ninguna costura debilita una garantía (sin modos silenciosos; se mantiene el valor por defecto
seguro). (4) La
arquitectura que encaja con el dominio: hexagonal donde se habla con sistemas externos; un script de 40
líneas no recibe capas que no necesita (gana YAGNI). (5) Ruta: `tracked-odd` para todo cambio, por chico o
asentado que sea; `direct` solo para el alcance trivial (una errata, un renombre, un comentario, un cambio
de una línea sin lógica). (6) Modelo según la tarea: cada agente delegado corre en el modelo más barato que
la hace bien: `haiku` para trabajo de solo lectura y mecánico, `sonnet` para implementar y revisar, `opus`
solo para un rol cuya definición lo nombra.
