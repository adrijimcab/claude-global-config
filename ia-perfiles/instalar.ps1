<#
.SYNOPSIS
  Installs the claude-empresa / claude-personal / codex-empresa / codex-personal commands for this Windows user.
  @es Instala los comandos claude-empresa / claude-personal / codex-empresa / codex-personal para este usuario de Windows.

.DESCRIPTION
  Run it from the folder that holds ia-perfil.ps1:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\instalar.ps1
  It shows every change before making it, asks once, and backs up every file it modifies (*.bak-<timestamp>).
  Running it again is safe: it replaces its own block and changes nothing that is already right.

  What it does:
  1. Copies ia-perfil.ps1 to %LOCALAPPDATA%\ia-perfiles and unblocks it.
  2. Adds the four commands to the PowerShell profiles (Windows PowerShell 5.1 and PowerShell 7) inside a marked block.
  3. Codex: writes the "gateway" profile (~/.codex/gateway.config.toml), and comments out a top-level
     model_provider = "base100" in ~/.codex/config.toml, which would send personal Codex to the gateway too.
  4. Claude Code: removes ANTHROPIC_* from the "env" block of ~/.claude/settings.json and from the user environment,
     because a global key overrides your personal login.
  5. Asks for YOUR gateway token and checks it against the gateway before storing it encrypted (DPAPI) for you only.

  -CarpetaUsuario <dir>  Install into another home folder (used to test the installer). @es Instala en otra carpeta de usuario (para probarlo).
  -Yes           Do not ask for confirmation. @es No pide confirmación.
  -NoToken       Skip the token step. @es Salta el paso del token.

  @es Ejecutalo desde la carpeta que contiene ia-perfil.ps1. Muestra cada cambio antes de hacerlo, pregunta una vez y
  @es guarda un backup de cada archivo que modifica. Volver a ejecutarlo es seguro: reemplaza su propio bloque y no toca
  @es lo que ya está bien. Pasos: 1) copia ia-perfil.ps1 a %LOCALAPPDATA%\ia-perfiles y lo desbloquea; 2) agrega los
  @es cuatro comandos a los perfiles de PowerShell dentro de un bloque marcado; 3) Codex: escribe el perfil "gateway" y
  @es comenta un model_provider = "base100" de primer nivel en config.toml, que mandaría también el Codex personal al
  @es gateway; 4) Claude Code: quita ANTHROPIC_* del bloque "env" de settings.json y del entorno de usuario, porque una
  @es key global le gana a tu login personal; 5) pide TU token del gateway y lo comprueba antes de guardarlo cifrado.
#>
param(
  # Not called -Home: $HOME is a read-only automatic variable and PowerShell names are case-insensitive.
  # @es No se llama -Home: $HOME es una variable automática de solo lectura y PowerShell no distingue mayúsculas.
  [string] $CarpetaUsuario,
  [switch] $Yes,
  [switch] $NoToken
)

$ErrorActionPreference = 'Stop'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Variables = @('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL')
$BlockStart = '# >>> ia-perfiles >>>'
$BlockEnd = '# <<< ia-perfiles <<<'

function Write-Bilingual([string] $English, [string] $Spanish, [string] $Color = 'Gray') {
  Write-Host "$English @es $Spanish" -ForegroundColor $Color
}

# --- Locations ------------------------------------------------------------------------------------------------------
$Testing = [bool] $CarpetaUsuario
$HomeDir = if ($Testing) { (Resolve-Path -LiteralPath $CarpetaUsuario).Path } else { $HOME }
$LocalDir = if ($Testing) { Join-Path $HomeDir 'AppData\Local\ia-perfiles' } else { Join-Path $env:LOCALAPPDATA 'ia-perfiles' }
$Documents = if ($Testing) { Join-Path $HomeDir 'Documents' } else { [Environment]::GetFolderPath('MyDocuments') }
$Profiles = @(
  (Join-Path $Documents 'WindowsPowerShell\Microsoft.PowerShell_profile.ps1'),
  (Join-Path $Documents 'PowerShell\Microsoft.PowerShell_profile.ps1')
)
$Launcher = Join-Path $LocalDir 'ia-perfil.ps1'
$CodexDir = Join-Path $HomeDir '.codex'
$CodexBase = Join-Path $CodexDir 'config.toml'
$CodexGateway = Join-Path $CodexDir 'gateway.config.toml'
$ClaudeSettings = Join-Path $HomeDir '.claude\settings.json'

$Source = Join-Path $PSScriptRoot 'ia-perfil.ps1'
if (-not (Test-Path -LiteralPath $Source)) {
  Write-Bilingual "ia-perfil.ps1 is missing next to the installer ($PSScriptRoot)." "Falta ia-perfil.ps1 junto al instalador ($PSScriptRoot)." 'Red'
  exit 2
}

# --- Text files read and written without changing their encoding ----------------------------------------------------
$Utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
function Read-TextFile([string] $Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
  try {
    $text = $Utf8Strict.GetString($bytes)
    if ($hasBom) { $text = $text.Substring(1) }
    return @{ Text = $text; Encoding = 'utf8'; Bom = $hasBom }
  }
  catch { return @{ Text = [Text.Encoding]::Default.GetString($bytes); Encoding = 'ansi'; Bom = $false } }
}
function Write-TextFile([string] $Path, [string] $Text, [hashtable] $Original) {
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  if ($Original -and $Original.Encoding -eq 'ansi') { [IO.File]::WriteAllText($Path, $Text, [Text.Encoding]::Default); return }
  # New files and UTF-8 files get a BOM, so Windows PowerShell 5.1 reads accents correctly.
  # @es Los archivos nuevos y los UTF-8 llevan BOM, así Windows PowerShell 5.1 lee bien las tildes.
  [IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($true)))
}
function Backup-File([string] $Path) {
  if (Test-Path -LiteralPath $Path) { Copy-Item -LiteralPath $Path -Destination "$Path.bak-$Stamp" -Force }
}

# --- Plan: compute every change first as data, apply only after confirmation ------------------------------------------
# Each step is a hashtable: Kind (launcher | write | unset-user), What/Que (the two-language description) and its data.
# @es Cada paso es un hashtable: Kind (launcher | write | unset-user), What/Que (la descripción en dos idiomas) y sus datos.
$Plan = New-Object System.Collections.ArrayList

# 1. Launcher
[void] $Plan.Add(@{ Kind = 'launcher'; What = "copy ia-perfil.ps1 -> $Launcher"; Que = "copiar ia-perfil.ps1 -> $Launcher" })

# 2. PowerShell profiles
$quotedLauncher = $Launcher.Replace("'", "''")
$Block = @(
  $BlockStart,
  '# Claude Code and Codex: Base100 gateway (empresa) or your own login (personal). Installed by perfiles-ia\instalar.ps1.',
  "function claude-empresa { & '$quotedLauncher' -Empresa -- @args }",
  "function claude-personal { & '$quotedLauncher' -Personal -- @args }",
  "function codex-empresa { & '$quotedLauncher' -Empresa -Codex -- @args }",
  "function codex-personal { & '$quotedLauncher' -Personal -Codex -- @args }",
  "function ia-perfil { & '$quotedLauncher' @args }",
  $BlockEnd
) -join "`r`n"

foreach ($profilePath in $Profiles) {
  $original = if (Test-Path -LiteralPath $profilePath) { Read-TextFile $profilePath } else { $null }
  $text = if ($original) { $original.Text } else { '' }
  $pattern = '(?s)' + [regex]::Escape($BlockStart) + '.*?' + [regex]::Escape($BlockEnd)
  if ($text -match $pattern) { $new = [regex]::Replace($text, $pattern, [Text.RegularExpressions.MatchEvaluator] { param($m) $Block }) }
  else {
    $separator = if ($text.Length -eq 0) { '' } elseif ($text.EndsWith("`n")) { "`r`n" } else { "`r`n`r`n" }
    $new = $text + $separator + $Block + "`r`n"
  }
  if ($new -ne $text) {
    [void] $Plan.Add(@{ Kind = 'write'; Path = $profilePath; Text = $new; Original = $original; What = "PowerShell profile: add or refresh the ia-perfiles block in $profilePath"; Que = "perfil de PowerShell: agregar o actualizar el bloque ia-perfiles en $profilePath" })
  }
  $outside = [regex]::Replace($text, $pattern, '')
  if ($outside -match '(?m)^\s*function\s+(claude|codex)-(empresa|personal)\b') {
    Write-Bilingual "Note: $profilePath already defines one of these commands outside the block; the block comes later, so it wins." "Nota: $profilePath ya define alguno de estos comandos fuera del bloque; el bloque va después, así que gana." 'Yellow'
  }
}

# 3. Codex
$codexBaseText = if (Test-Path -LiteralPath $CodexBase) { (Read-TextFile $CodexBase).Text } else { '' }
$gentleDevHomeRoot = $codexBaseText -match '(?s)\[permissions\.gentle-dev\.workspace_roots\][^\[]*"~"\s*=\s*true'
$gatewayLines = @(
  '# Profile "gateway" (codex -p gateway, or codex-empresa): Base100 AI gateway, configuration of the company training.',
  '# The key is read from ANTHROPIC_API_KEY, which ia-perfil.ps1 -Empresa -Codex sets for that process only.',
  'model = "gpt-5.6-terra"',
  'model_reasoning_effort = "high"',
  'model_provider = "base100"',
  '',
  '[model_providers.base100]',
  'name = "BASE100 AI Gateway"',
  'base_url = "http://ai-server.nacional.com:2026/v1"',
  'env_key = "ANTHROPIC_API_KEY"',
  'wire_api = "responses"',
  'requires_openai_auth = false'
)
if ($gentleDevHomeRoot) {
  $gatewayLines += @(
    '',
    '# Your permissions profile gentle-dev makes the whole home folder a workspace root; the Windows sandbox then scans',
    '# every file under it and aborts on unreadable entries. The gateway profile limits the workspace to the open folder.',
    '[permissions.gentle-dev.workspace_roots]',
    '"~" = false',
    '',
    '[permissions.gentle-dev.filesystem]',
    '":root" = "read"'
  )
}
$gatewayText = ($gatewayLines -join "`r`n") + "`r`n"
$gatewayCurrent = if (Test-Path -LiteralPath $CodexGateway) { (Read-TextFile $CodexGateway).Text } else { $null }
if ($gatewayCurrent -ne $gatewayText) {
  [void] $Plan.Add(@{ Kind = 'write'; Path = $CodexGateway; Text = $gatewayText; Original = $null; What = "Codex: write the gateway profile $CodexGateway"; Que = "Codex: escribir el perfil gateway $CodexGateway" })
}

if ($codexBaseText) {
  $lines = $codexBaseText -split "`r?`n"
  $firstTable = [array]::FindIndex($lines, [Predicate[string]] { param($l) $l -match '^\s*\[' })
  if ($firstTable -lt 0) { $firstTable = $lines.Length }
  $changed = $false
  for ($i = 0; $i -lt $firstTable; $i++) {
    if ($lines[$i] -match '^\s*model_provider\s*=\s*"base100"' -or $lines[$i] -match '^\s*model\s*=\s*"gpt[- ][^"]*(terra|sol|luna)"') {
      $lines[$i] = '# (ia-perfiles: only in the gateway profile now) ' + $lines[$i]; $changed = $true
    }
  }
  if ($changed) {
    [void] $Plan.Add(@{ Kind = 'write'; Path = $CodexBase; Text = ($lines -join "`r`n"); Original = (Read-TextFile $CodexBase); What = "Codex: comment out the top-level base100 provider/model in $CodexBase (personal Codex must not use the gateway)"; Que = "Codex: comentar el proveedor/modelo base100 de primer nivel en $CodexBase (el Codex personal no debe usar el gateway)" })
  }
}

# 4. Claude Code settings.json env block and user environment
if (Test-Path -LiteralPath $ClaudeSettings) {
  $settingsOriginal = Read-TextFile $ClaudeSettings
  try { $settings = $settingsOriginal.Text | ConvertFrom-Json }
  catch {
    Write-Bilingual "Cannot parse $ClaudeSettings; it is left untouched. Check it yourself for ANTHROPIC_* in its env block." "No se puede leer $ClaudeSettings; se deja como está. Revisá vos si su bloque env tiene ANTHROPIC_*." 'Yellow'
    $settings = $null
  }
  if ($settings -and $settings.PSObject.Properties['env']) {
    $found = @($Variables | Where-Object { $settings.env.PSObject.Properties[$_] })
    if ($found.Count -gt 0) {
      foreach ($name in $found) { $settings.env.PSObject.Properties.Remove($name) }
      $settingsNew = ($settings | ConvertTo-Json -Depth 100) + "`r`n"
      [void] $Plan.Add(@{ Kind = 'write'; Path = $ClaudeSettings; Text = $settingsNew; Original = $settingsOriginal; What = "Claude Code: remove $($found -join ', ') from the env block of $ClaudeSettings"; Que = "Claude Code: quitar $($found -join ', ') del bloque env de $ClaudeSettings" })
    }
  }
}
if (-not $Testing) {
  foreach ($name in $Variables) {
    if ([Environment]::GetEnvironmentVariable($name, 'User')) {
      [void] $Plan.Add(@{ Kind = 'unset-user'; Name = $name; What = "remove the user environment variable $name"; Que = "quitar la variable de entorno de usuario $name" })
    }
    if ([Environment]::GetEnvironmentVariable($name, 'Machine')) {
      Write-Bilingual "$name is set for the whole machine; only an administrator can remove it, and while it exists personal mode cannot work." "$name está definida para toda la máquina; solo un administrador puede quitarla, y mientras exista el modo personal no puede funcionar." 'Yellow'
    }
  }
}

# --- Show, confirm, apply --------------------------------------------------------------------------------------------
Write-Bilingual 'Changes to make:' 'Cambios a realizar:' 'Cyan'
foreach ($step in $Plan) { Write-Host "  - $($step.What)`n    @es $($step.Que)" }
if (-not $Yes) {
  $answer = Read-Host 'Continue? / ¿Continuar? (s/n)'
  if ($answer -notmatch '^[sSyY]') { Write-Bilingual 'Nothing was changed.' 'No se cambió nada.' 'Yellow'; exit 1 }
}
foreach ($step in $Plan) {
  switch ($step.Kind) {
    'launcher' {
      New-Item -ItemType Directory -Force -Path $LocalDir | Out-Null
      [IO.File]::WriteAllBytes($Launcher, [IO.File]::ReadAllBytes($Source))
      Unblock-File -LiteralPath $Launcher -ErrorAction SilentlyContinue
    }
    'write' { Backup-File $step.Path; Write-TextFile $step.Path $step.Text $step.Original }
    'unset-user' { [Environment]::SetEnvironmentVariable($step.Name, $null, 'User') }
  }
}
Write-Bilingual "Done: $($Plan.Count) change(s) applied; backups end in .bak-$Stamp." "Listo: $($Plan.Count) cambio(s) aplicado(s); los backups terminan en .bak-$Stamp." 'Green'

# --- Token ------------------------------------------------------------------------------------------------------------
if (-not $NoToken) {
  if (Test-Path -LiteralPath (Join-Path $LocalDir 'empresa-token.xml')) {
    Write-Bilingual 'A token is already stored; to replace it run: ia-perfil -GuardarToken' 'Ya hay un token guardado; para cambiarlo ejecutá: ia-perfil -GuardarToken'
  }
  else { & $Launcher -GuardarToken }
}

# --- Checks -----------------------------------------------------------------------------------------------------------
foreach ($program in 'claude', 'codex') {
  if (Get-Command $program -ErrorAction SilentlyContinue) { Write-Bilingual "$program found." "$program encontrado." 'Green' }
  else { Write-Bilingual "$program is not installed or not on PATH; its two commands will say so until it is." "$program no está instalado o no está en el PATH; sus dos comandos lo van a avisar hasta que lo esté." 'Yellow' }
}
$policy = Get-ExecutionPolicy
if ($policy -in 'Restricted', 'AllSigned') {
  Write-Bilingual "The execution policy is $policy, so PowerShell will not load your profile. Run: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned" "La política de ejecución es $policy, así que PowerShell no va a cargar tu perfil. Ejecutá: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned" 'Yellow'
}
Write-Bilingual 'Open a NEW PowerShell window and use: claude-empresa, claude-personal, codex-empresa, codex-personal.' 'Abrí una ventana NUEVA de PowerShell y usá: claude-empresa, claude-personal, codex-empresa, codex-personal.' 'Cyan'
