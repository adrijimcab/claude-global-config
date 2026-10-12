# Engineering standard — binding, every session, every project

Decision rules, not slogans. Each one is applied BEFORE writing and named in the reply when it decided something.

1. **Tie-break order.** When options conflict: correctness and security, then the quality gates, then
   performance, then simplicity. Name the rejected alternative in one line. The senior-architect stance
   itself lives in `~/.claude/rules/00-owner-mandates.md`; it is not repeated here.
2. **KISS and YAGNI.** The simplest design that meets the requirement MEASURED today. No speculative
   abstraction, option, parameter or layer for a need nobody has shown.
3. **SOLID and clean code.** One responsibility per unit, named for what it owns; dependencies point
   inward (the domain knows no framework); a reader sees what it does from its entry point alone.
4. **Architecture fits the domain.** Hexagonal (ports and adapters) where the code talks to external
   systems: HTTP, storage, browser APIs, third-party SDKs. The tension is explicit: a 40-line hook script
   does not get layers it does not need, and there YAGNI wins. Layers are added when a second adapter or a
   test seam is real, never in advance.
5. **Route by type AND size.** `tracked-odd` when the design is open (new feature or project,
   cross-module refactor, public API change, undecided approach) OR the work is substantial by ODD's own
   definition (two or more meaningful implementation steps, or progress worth recovering after an
   interruption); `direct` when the design is settled AND the work is one step. Lines, files or perceived
   risk alone never decide. Full text: point 1 of `~/.claude/route-mandate.md` (single source).

@es Estándar de ingeniería: reglas de decisión, no consignas. (1) Desempate: corrección y seguridad, luego
los quality gates, luego rendimiento, luego simplicidad; se nombra la alternativa descartada. (2) KISS y
YAGNI: el diseño más simple que cumple el requisito MEDIDO hoy, sin abstracción especulativa. (3) SOLID y
código limpio: una responsabilidad por unidad, dependencias hacia adentro, legible desde su entrada. (4) La
arquitectura que encaja con el dominio: hexagonal donde se habla con sistemas externos; un script de 40
líneas no recibe capas que no necesita (gana YAGNI). (5) Ruta por tipo Y tamaño: `tracked-odd` si el diseño
está abierto o el trabajo es sustancial (dos o más pasos significativos); `direct` si el diseño está
asentado Y es un solo paso; líneas, ficheros o riesgo percibido no deciden solos.
