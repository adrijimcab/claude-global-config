# `engram-v3-mcp-registration-assumed-from-plugin` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-12 (condensed)

- [global] 2026-10-12 — After engram 3.3.2 and plugin 0.1.7 the engram MCP server was absent in every restarted session, because plugin 0.1.7 ships no .mcp.json and engram docs say marketplace installation does not register the MCP server; the upgrade was verified by binary version and serve only -> root cause: the upgrade check did not cover MCP registration nor the jq prerequisite of the plugin hooks -> RULE: after an engram upgrade, verify that claude mcp get engram reports Connected at user scope and that jq and curl are on PATH before telling sessions to restart <!--fc:engram-v3-mcp-registration-assumed-from-plugin#1-->
