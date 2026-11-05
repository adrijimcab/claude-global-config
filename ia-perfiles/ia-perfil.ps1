<#
.SYNOPSIS
  Starts Claude Code or Codex through the Base100 AI gateway (-Empresa) or with your own login (-Personal).
  @es Arranca Claude Code o Codex por el gateway de IA de Base100 (-Empresa) o con tu propio login (-Personal).

.DESCRIPTION
  -GuardarToken  Asks once for your Base100 gateway token and stores it encrypted for this Windows user (DPAPI),
                 next to this script. Nobody else, and no other machine, can decrypt it.
  -Empresa       Through the Base100 gateway: sets ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY.
  -Personal      With your own login: removes every ANTHROPIC_* variable.
  -Codex         Starts Codex instead of Claude Code (-Empresa runs `codex -p gateway`).

  Nothing global is written: the variables exist only for the program this script starts, and the console's
  previous values come back when it exits. Arguments after -- reach the program unchanged.

  @es -GuardarToken pide una vez tu token del gateway de Base100 y lo guarda cifrado para este usuario de Windows
  @es (DPAPI), junto a este script. Nadie más, y ninguna otra máquina, puede descifrarlo.
  @es -Empresa va por el gateway de Base100: define ANTHROPIC_BASE_URL y ANTHROPIC_API_KEY.
  @es -Personal usa tu propio login: quita todas las variables ANTHROPIC_*.
  @es -Codex arranca Codex en vez de Claude Code (-Empresa corre `codex -p gateway`).
  @es No se escribe nada global: las variables existen solo para el programa que arranca este script, y al salir
  @es vuelven los valores previos de la consola. Los argumentos después de -- llegan al programa sin cambios.

.EXAMPLE
  ia-perfil.ps1 -GuardarToken
  ia-perfil.ps1 -Empresa
  ia-perfil.ps1 -Personal -Codex
  ia-perfil.ps1 -Empresa -- --resume <session-id>
#>
param(
  [switch] $Empresa,
  [switch] $Personal,
  [switch] $GuardarToken,
  [switch] $Codex,
  [Parameter(ValueFromRemainingArguments = $true)] [string[]] $ProgramArgs
)

$ErrorActionPreference = 'Stop'

# The Anthropic-compatible endpoint of the company guide «Configuración de Acceso al Endpoint IA Interno».
# @es El endpoint compatible con Anthropic de la guía de la empresa «Configuración de Acceso al Endpoint IA Interno».
$GatewayUrl = 'http://ai-server.nacional.com:2026'
$SecretFile = Join-Path $PSScriptRoot 'empresa-token.xml'
# CLAUDE_CODE_AUTO_MODE_SERVER=0 (company mode only): the gateway does not pass the auto mode "safeguards" fields
# through, so Claude Code runs its own classifier requests anyway; this states it up front, and the notice that
# holds the first action of every session does not appear (code.claude.com/docs/en/auto-mode-classifier-billing).
# @es CLAUDE_CODE_AUTO_MODE_SERVER=0 (solo en modo empresa): el gateway no deja pasar los campos "safeguards" de auto
# @es mode, así que Claude Code hace igual sus propias verificaciones; esto lo declara de entrada y no aparece el aviso
# @es que retiene la primera acción de cada sesión.
$ProfileVariables = @('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_AUTO_MODE_SERVER')

function Write-Bilingual([string] $English, [string] $Spanish) {
  Write-Host "$English @es $Spanish"
}

function ConvertTo-PlainText([Security.SecureString] $Secure) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

# Asks the gateway itself whether the token is valid, so a mistyped token is refused now and not at first use.
# It uses a one-token /v1/messages call: /v1/models answers 200 to ANY token (measured 2026-11-03), so it proves
# nothing, while /v1/messages answers 401 to a wrong token and 200 to a valid one.
# @es Le pregunta al propio gateway si el token es válido, así un token mal pegado se rechaza ahora y no al primer uso.
# @es Usa una llamada a /v1/messages de un solo token: /v1/models responde 200 a CUALQUIER token (medido el 2026-11-03),
# @es así que no prueba nada, mientras que /v1/messages responde 401 a un token erróneo y 200 a uno válido.
function Test-CompanyToken([string] $Token) {
  $body = '{"model":"claude haiku","max_tokens":1,"messages":[{"role":"user","content":"ok"}]}'
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 -Method Post -Uri "$GatewayUrl/v1/messages" -ContentType 'application/json' -Body $body -Headers @{ 'x-api-key' = $Token; 'anthropic-version' = '2023-06-01' }
    return @{ Ok = ($response.StatusCode -eq 200); Detail = "HTTP $($response.StatusCode)" }
  }
  catch {
    $status = if ($_.Exception.Response) { "HTTP $([int]$_.Exception.Response.StatusCode)" } else { $_.Exception.Message }
    return @{ Ok = $false; Detail = $status }
  }
}

function Save-CompanyToken {
  $token = Read-Host -AsSecureString 'Base100 gateway token / Token del gateway de Base100'
  if ($token.Length -eq 0) {
    Write-Bilingual 'No token was entered; nothing was saved.' 'No se ingresó ningún token; no se guardó nada.'
    exit 2
  }
  $check = Test-CompanyToken (ConvertTo-PlainText $token)
  if (-not $check.Ok) {
    Write-Bilingual "The gateway refused this token ($($check.Detail)); nothing was saved. Check the token and the corporate network or VPN." "El gateway rechazó este token ($($check.Detail)); no se guardó nada. Revisá el token y la red corporativa o la VPN."
    exit 2
  }
  $token | Export-Clixml -Path $SecretFile
  Write-Bilingual "Token checked against the gateway and saved, encrypted for this Windows user: $SecretFile" "Token comprobado contra el gateway y guardado, cifrado para este usuario de Windows: $SecretFile"
}

function Read-CompanyToken {
  if (-not (Test-Path -LiteralPath $SecretFile)) {
    Write-Bilingual 'No Base100 token is stored yet. Run: ia-perfil -GuardarToken' 'Todavía no hay token de Base100 guardado. Ejecutá: ia-perfil -GuardarToken'
    exit 2
  }
  try { $secure = Import-Clixml -Path $SecretFile }
  catch {
    Write-Bilingual 'The stored token cannot be decrypted by this Windows user (it was saved by another user or machine). Run: ia-perfil -GuardarToken' 'Este usuario de Windows no puede descifrar el token guardado (lo guardó otro usuario u otra máquina). Ejecutá: ia-perfil -GuardarToken'
    exit 2
  }
  return ConvertTo-PlainText $secure
}

$chosen = @($Empresa, $Personal, $GuardarToken | Where-Object { $_ })
if ($chosen.Count -ne 1) {
  Write-Bilingual 'Choose exactly one of -Empresa, -Personal or -GuardarToken.' 'Elegí exactamente uno: -Empresa, -Personal o -GuardarToken.'
  exit 2
}

if ($GuardarToken) { Save-CompanyToken; exit 0 }

$program = if ($Codex) { 'codex' } else { 'claude' }
if (-not (Get-Command $program -ErrorAction SilentlyContinue)) {
  Write-Bilingual "'$program' is not installed or not on PATH." "'$program' no está instalado o no está en el PATH."
  exit 2
}

$arguments = @($ProgramArgs | Where-Object { $_ -ne $null })

# Personal: no Anthropic variable exists, so the program uses your own login.
# @es Personal: no existe ninguna variable de Anthropic, así que el programa usa tu propio login.
$variables = @{}

if ($Empresa) {
  $variables = @{
    ANTHROPIC_API_KEY            = Read-CompanyToken
    ANTHROPIC_BASE_URL           = $GatewayUrl
    CLAUDE_CODE_AUTO_MODE_SERVER = '0'
  }
  # Codex reads the same token through env_key = "ANTHROPIC_API_KEY" of the gateway profile (~/.codex/gateway.config.toml).
  # @es Codex lee el mismo token por env_key = "ANTHROPIC_API_KEY" del perfil gateway (~/.codex/gateway.config.toml).
  if ($Codex) { $arguments = @('-p', 'gateway') + $arguments }
  Write-Bilingual "Base100 profile ($program): $GatewayUrl with the stored token." "Perfil Base100 ($program): $GatewayUrl con el token guardado."
}
else {
  Write-Bilingual "Personal profile ($program): your own login." "Perfil personal ($program): tu propio login."
}

# Claude Code updates itself before every start (about 2 s when it is already current). A failed update, for
# example without network, is reported and never blocks the start.
# @es Claude Code se actualiza antes de cada arranque (unos 2 s si ya está al día). Una actualización fallida, por
# @es ejemplo sin red, se informa y nunca bloquea el arranque.
if ($program -eq 'claude') {
  & claude update
  if ($LASTEXITCODE -ne 0) { Write-Bilingual "claude update failed (exit $LASTEXITCODE); starting the installed version." "claude update falló (salida $LASTEXITCODE); arranca la versión instalada." }
}

# The program runs at the top level, never inside a captured call, so an interactive session keeps the terminal.
# @es El programa corre en el nivel principal, nunca dentro de una llamada capturada: la sesión interactiva conserva la terminal.
$saved = @{}
foreach ($name in $ProfileVariables) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$exitCode = 1
try {
  foreach ($name in $ProfileVariables) { [Environment]::SetEnvironmentVariable($name, $variables[$name], 'Process') }
  & $program @arguments
  $exitCode = $LASTEXITCODE
}
finally {
  foreach ($name in $ProfileVariables) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
exit $exitCode
