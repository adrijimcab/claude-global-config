# `npm-fixavailable-read-as-a-non-breaking-fix` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-09-29 — El informe de re-medición contó 6 paquetes con arreglo sin major leyendo fixAvailable:true de npm audit --json y yo los metí en el backlog PRE como hecho; al aplicar, @sigstore/sign y @sigstore/verify ya estaban en la última versión de su major y dentro del rango vulnerable, y vite solo salía con un override -> causa: fixAvailable:true significa que npm conoce ALGÚN camino de arreglo (a veces vía un padre), no que exista una versión parcheada compatible -> RULE: antes de prometer un arreglo de audit, verificar con npm view que exista una versión fuera del rango vulnerable dentro del mismo major y quién la fija; y un recuento de otro agente sobre ese campo va al dueño marcado como no verificado. <!--fc:npm-fixavailable-read-as-a-non-breaking-fix#1-->
