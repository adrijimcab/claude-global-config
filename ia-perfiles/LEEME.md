# Claude Code and Codex: Base100 gateway or personal login

Two commands per tool, in any project folder:

| Command | What it does |
|---|---|
| `claude-empresa` | Claude Code through the Base100 AI gateway, with your own token |
| `claude-personal` | Claude Code with your own Anthropic login (`/login`) |
| `codex-empresa` | Codex through the Base100 AI gateway (`codex -p gateway`), with your own token |
| `codex-personal` | Codex with your own ChatGPT login |

Your configuration (`~/.claude`, `~/.codex`, rules, hooks, plugins, memory) is the same in both modes; only the
gateway variables change, and only for the window you start. Anything you type after the command reaches the tool
unchanged, for example `claude-empresa --resume <id>` or `codex-empresa exec "..."`.

## Install (once)

1. Ask Eva del Pino for your gateway access. You need only YOUR token; the user and password are for the web chat
   (`http://ai-server.nacional.com:5173`), not for these tools.
2. Copy this folder anywhere, open PowerShell in it and run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\instalar.ps1
   ```

3. Read the list of changes it shows, answer `s`, and paste YOUR token when it asks (it is not shown on screen). The
   installer checks the token against the gateway before saving it, encrypted for your Windows user only.
4. Open a NEW PowerShell window and use the commands.

The installer backs up every file it changes (`*.bak-<date>`) and can be run again safely. To replace the token later:
`ia-perfil -GuardarToken`.

## What the installer fixes on purpose

- An `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` in `~/.claude/settings.json` or in your user environment (as the old
  guide suggested): it is removed, because a global key overrides your personal login.
- A top-level `model_provider = "base100"` in `~/.codex/config.toml`: it is commented out, so personal Codex does not
  go to the gateway; the gateway lives only in the `gateway` profile.
- A PowerShell profile that does not end with a newline: the block is added on its own lines.

## Never share

Never send your token or the file `%LOCALAPPDATA%\ia-perfiles\empresa-token.xml` to anyone. That file only works for
your Windows user on your machine, and each person installs with their own token.

---

# Claude Code y Codex: gateway de Base100 o login personal

Dos comandos por herramienta, en cualquier carpeta de proyecto:

| Comando | Qué hace |
|---|---|
| `claude-empresa` | Claude Code por el gateway de IA de Base100, con tu propio token |
| `claude-personal` | Claude Code con tu propio login de Anthropic (`/login`) |
| `codex-empresa` | Codex por el gateway de IA de Base100 (`codex -p gateway`), con tu propio token |
| `codex-personal` | Codex con tu propio login de ChatGPT |

Tu configuración (`~/.claude`, `~/.codex`, reglas, hooks, plugins, memoria) es la misma en los dos modos; solo cambian
las variables del gateway, y solo para la ventana que arrancás. Lo que escribas después del comando llega igual a la
herramienta, por ejemplo `claude-empresa --resume <id>` o `codex-empresa exec "..."`.

## Instalación (una vez)

1. Pedile a Eva del Pino tu acceso al gateway. Solo necesitás TU token; el usuario y la contraseña son para el chat web
   (`http://ai-server.nacional.com:5173`), no para estas herramientas.
2. Copiá esta carpeta donde quieras, abrí PowerShell en ella y ejecutá:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\instalar.ps1
   ```

3. Leé la lista de cambios que muestra, respondé `s` y pegá TU token cuando lo pida (no se ve en pantalla). El
   instalador comprueba el token contra el gateway antes de guardarlo, cifrado solo para tu usuario de Windows.
4. Abrí una ventana NUEVA de PowerShell y usá los comandos.

El instalador hace backup de cada archivo que cambia (`*.bak-<fecha>`) y se puede volver a ejecutar sin riesgo. Para
cambiar el token más adelante: `ia-perfil -GuardarToken`.

## Qué corrige el instalador a propósito

- Un `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` en `~/.claude/settings.json` o en tu entorno de usuario (como sugería
  la guía anterior): se quita, porque una key global le gana a tu login personal.
- Un `model_provider = "base100"` de primer nivel en `~/.codex/config.toml`: se comenta, así el Codex personal no va al
  gateway; el gateway vive solo en el perfil `gateway`.
- Un perfil de PowerShell que no termina en salto de línea: el bloque se agrega en sus propias líneas.

## Nunca compartas

Nunca mandes tu token ni el archivo `%LOCALAPPDATA%\ia-perfiles\empresa-token.xml` a nadie. Ese archivo solo funciona
para tu usuario de Windows en tu máquina, y cada persona instala con su propio token.
