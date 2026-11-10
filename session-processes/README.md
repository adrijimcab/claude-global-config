# session-processes

When a Claude Code session ends, this SessionEnd hook ends every process the session started and left alive, and nothing else.
@es Al terminar una sesión de Claude Code, este hook de SessionEnd termina todo proceso que la sesión inició y dejó vivo, y nada más.

## How a process is recognised / Cómo se reconoce un proceso

`session-temp/start.mjs` gives each session a private TEMP (`<temp root>/claude/session-tmp/<session id>`) that every Bash command of the session, and so every process those commands start, inherits. The environment of a process survives the death of its parent, so an **orphan** still carries it. The sweep reads the TEMP of every process of the machine and ends the ones whose TEMP is exactly this session's folder. The path is computed by `session-temp`'s own `sessionTempOf`, never a second way.
@es `session-temp/start.mjs` da a cada sesión un TEMP privado que heredan todos los comandos Bash de la sesión y, con ellos, todo proceso que inician. El entorno de un proceso sobrevive a la muerte de su padre, así que un **huérfano** lo sigue llevando. El barrido lee el TEMP de cada proceso de la máquina y termina los que llevan exactamente la carpeta de esta sesión. La ruta la calcula `sessionTempOf` de `session-temp`, nunca de otra forma.

## Shape / Forma (hexagonal)

| Piece | Owns |
|---|---|
| `ownership.mjs` | the pure decision: which processes are the session's, and alone or as a tree |
| `sweep.mjs` | the flow: read the table once, decide, end each entry through its port |
| `process-table.mjs` + `environment-reader.ps1` | the table adapter: pid, parent, name and TEMP of every process (PEB read through `NtQueryInformationProcess` and `ReadProcessMemory`) |
| `kill-process.mjs` | the adapter that ends one process; `process-control/process-port.mjs` ends a tree |
| `end.mjs` (+ `.hook-registration.json`) | the SessionEnd entry point |
| `environment-reader.probe.mjs` | the live probe of the reader, kept as a fixture |

## What it kills / Lo que mata

- Every process whose TEMP is exactly the session folder (comparison ignores `/` vs `\`, case and a trailing separator): the commands' children, their orphans, their console hosts.
- A process with everything below it (`taskkill /T /F`) only when everything below it also carries the session TEMP; otherwise that process alone, and each marked process below it on its own.

## What it never kills / Lo que nunca mata

- A process of another session (a different TEMP, even one that merely starts with this session's folder).
- A process with no TEMP, or whose environment cannot be read (another user, protected): it is unknown, so it is neither listed nor taken down by a tree end.
- The hook itself, its ancestors (the harness, the session's `claude`) and its descendants (the reader), even when they carry the TEMP.
- A **detached full chain** (`full-chain-lock/run.mjs --detach`) on purpose: its runner gives the chain a TEMP of its own, `<temp root>/fcl/<8 hex of the run dir path>` (outside the Claude home repository, which the mutation engine requires), removed when the chain ends, so it never carries the session's TEMP and outlives the session.
- Windows only. On another platform the reader throws and the hook reports it on stderr; it does not pretend there was nothing to sweep.

## Why not a Job Object / Por qué no un Job Object

The first design was a Job Object around the session, to contain everything at launch. It was rejected on a measurement (probe `IsProcessInJob` up the parent chain): `claude.exe` is in a job (the Windows Terminal one) and its `bash.exe` children are NOT in any job, so the harness launches children outside any job. A job around the session therefore contains nothing, and a job without breakaway could break the launches the harness makes. The session TEMP is an identity every child already inherits and that survives orphaning.
@es El primer diseño era un Job Object alrededor de la sesión. Se descartó por una medición: `claude.exe` está en un job (el de Windows Terminal) y sus hijos `bash.exe` NO están en ningún job, así que el harness lanza los hijos fuera de todo job. Un job alrededor de la sesión no contiene nada, y uno sin breakaway podría romper los lanzamientos del harness. El TEMP de la sesión es una identidad que todo hijo ya hereda y que sobrevive a la orfandad.

## Measured by the live probe / Medido por la sonda viva

`node session-processes/environment-reader.probe.mjs`: (a) the TEMP of a child node process is read; (b) the TEMP of an orphan whose parent exited is read; (c) another marker is never read as ours; (d) reading every process of the machine took about 0.3 s (500 processes, about 170 unreadable: other users and protected processes).

## Limits / Límites

- The hook ends only what is alive when it runs. A process the session starts with an environment that replaces TEMP is not recognised.
- The reader depends on the x64 layout of the process parameters (`ProcessParameters` at PEB+0x20, `Environment` at +0x80, `EnvironmentSize` at +0x3F0, Windows 8 and later); the probe is the proof to re-run on a new Windows build.
- `session-temp/end.mjs` removes the session folder in its own SessionEnd run; the two hooks are independent, so a folder a live process still holds may not go in that run.
