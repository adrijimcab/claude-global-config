/**
 * The `launcher` port of `detach-chain.mjs`: starts the detached runner so that NO kill of the caller's process tree
 * can reach it, and answers its pid.
 *
 *   launch({ nodePath, runnerPath, runDir, cwd }) -> pid        (throws an Error with the reason when it cannot)
 *
 * WINDOWS goes through WMI `Win32_Process.Create`: the new process is a child of the WMI provider host, not of the
 * caller, so killing the caller's tree (what Claude Code does to a background shell) does not reach it. Measured
 * 2026-11-05: a child of `spawn({ detached: true })` died with its caller; a WMI-created one survived the same kill.
 * Start-Process was rejected: it survives only when its PowerShell has already exited when the kill lands. WMI cannot
 * redirect stdio and starts the process with the provider's environment, so the new process is the small detached
 * runner that reads its job from the run directory; the command line carries only three paths, and the PowerShell
 * script is a constant that reads them from environment variables, so no value is ever assembled into script text.
 *
 * ELSEWHERE a detached spawn with its stdio dropped starts a new session and process group.
 *
 * @es El puerto `launcher` de `detach-chain.mjs`: inicia el runner desacoplado de modo que NINGÚN kill del árbol de
 * quien llama lo alcance, y responde su pid. WINDOWS usa WMI `Win32_Process.Create`: el proceso nuevo cuelga del host
 * del proveedor WMI y no del llamador, así que matar el árbol del llamador no lo alcanza (medido el 2026-11-05: un
 * hijo de `spawn({ detached: true })` murió con su llamador y uno creado por WMI sobrevivió al mismo kill).
 * Start-Process se descartó. WMI no redirige stdio y arranca con el entorno del proveedor, así que el proceso nuevo
 * es el runner pequeño que lee su trabajo del directorio de corrida; la línea de comandos lleva solo tres rutas y el
 * script de PowerShell es una constante que las lee de variables de entorno. EN OTRAS PLATAFORMAS, un spawn
 * desacoplado sin stdio inicia una sesión y un grupo de procesos nuevos.
 */

import { spawn, spawnSync } from 'node:child_process';

/** The variables that carry the WMI command line and working directory to the PowerShell script. @es Las variables que llevan la línea de comandos y el directorio de trabajo al script de PowerShell. */
export const WMI_ENVIRONMENT = Object.freeze({ commandLine: 'FCL_WMI_COMMAND_LINE', directory: 'FCL_WMI_DIRECTORY' });

/** The constant PowerShell script: creates the process and prints `<ReturnValue> <ProcessId>`. @es El script constante de PowerShell: crea el proceso e imprime `<ReturnValue> <ProcessId>`. */
export const WMI_SCRIPT = [
  '$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create',
  `-Arguments @{ CommandLine = $env:${WMI_ENVIRONMENT.commandLine}; CurrentDirectory = $env:${WMI_ENVIRONMENT.directory} };`,
  "Write-Output ('{0} {1}' -f $r.ReturnValue, $r.ProcessId)"
].join(' ');

/** What WMI answers when it created the process. @es Lo que responde WMI cuando creó el proceso. */
const WMI_ANSWER = /^(\d+) (\d+)$/;

/** The real PowerShell, run to completion. @es El PowerShell real, ejecutado hasta terminar. */
function runPowershell({ script, environment }) {
  return spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, ...environment }, encoding: 'utf8', windowsHide: true });
}

/** A path that can sit between double quotes in a command line. @es Una ruta que cabe entre comillas dobles en una línea de comandos. */
function quoted(value) {
  if (value.includes('"')) throw new Error(`a path with a double quote cannot go in a WMI command line: ${value}. @es una ruta con comillas dobles no cabe en una línea de comandos de WMI: ${value}.`);

  return `"${value}"`;
}

/**
 * The Windows launcher, over WMI.
 * @param {{ runPowershell?: Function }} [ports] `runPowershell({ script, environment })` -> `{ status, stdout, stderr }`.
 * @es El lanzador de Windows, sobre WMI; `runPowershell` es inyectable.
 */
export function wmiLauncher({ runPowershell: run = runPowershell } = {}) {
  return {
    kind: 'wmi',
    launch({ nodePath, runnerPath, runDir, cwd }) {
      const commandLine = [nodePath, runnerPath, runDir].map(quoted).join(' ');
      const answer = run({ script: WMI_SCRIPT, environment: { [WMI_ENVIRONMENT.commandLine]: commandLine, [WMI_ENVIRONMENT.directory]: cwd } });
      const output = String(answer.stdout ?? '').trim();
      const parsed = WMI_ANSWER.exec(output);

      if (answer.status !== 0) throw new Error(`PowerShell failed (exit ${String(answer.status)}): ${String(answer.stderr ?? '').trim() || output}. @es PowerShell falló (salida ${String(answer.status)}): ${String(answer.stderr ?? '').trim() || output}.`);
      if (parsed === null) throw new Error(`WMI gave an answer that was not "<ReturnValue> <ProcessId>": ${output}. @es WMI dio una respuesta que no es "<ReturnValue> <ProcessId>": ${output}.`);
      if (Number(parsed[1]) !== 0) throw new Error(`WMI could not create the process (ReturnValue ${parsed[1]}). @es WMI no pudo crear el proceso (ReturnValue ${parsed[1]}).`);

      return Number(parsed[2]);
    }
  };
}

/**
 * The launcher for platforms without WMI: a detached spawn with its stdio dropped.
 * @param {{ spawnProcess?: Function }} [ports]
 * @es El lanzador para plataformas sin WMI: un spawn desacoplado sin stdio; `spawnProcess` es inyectable.
 */
export function spawnLauncher({ spawnProcess = spawn } = {}) {
  return {
    kind: 'spawn',
    launch({ nodePath, runnerPath, runDir, cwd }) {
      const child = spawnProcess(nodePath, [runnerPath, runDir], { detached: true, stdio: 'ignore', windowsHide: true, cwd });

      // A start that fails has no pid and is reported below; its asynchronous 'error' event must not crash this process.
      // @es Un inicio fallido no tiene pid y se informa abajo; su evento 'error' asíncrono no debe tumbar este proceso.
      child.once('error', () => undefined);

      if (child.pid === undefined) throw new Error('the detached runner could not be started (no pid). @es no se pudo iniciar el runner desacoplado (sin pid).');

      child.unref();

      return child.pid;
    }
  };
}

/** The launcher of a platform: WMI on Windows, a detached spawn elsewhere. @es El lanzador de una plataforma: WMI en Windows, un spawn desacoplado en el resto. */
export function detachedLauncher(platform = process.platform) {
  return platform === 'win32' ? wmiLauncher() : spawnLauncher();
}
