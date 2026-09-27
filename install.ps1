# Screendial Automated Web Installer for Windows
# Downloads the Screendial installer, runs it silently, and launches the app.
#
# Usage:
#   irm https://raw.githubusercontent.com/idaraabasiudoh/screendialpub/main/install.ps1 | iex

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

Write-Host "=================================================="
Write-Host "    Screendial Windows Automated Installer"
Write-Host "=================================================="
Write-Host ""

if ($env:OS -ne "Windows_NT") {
    Write-Host "Error: this installer is for Windows only." -ForegroundColor Red
    exit 1
}

$ExeUrl = "https://github.com/idaraabasiudoh/screendialpub/releases/download/v.0.1.0/Screendial_0.1.0_x64-setup.exe"
$TempExe = Join-Path $env:TEMP "Screendial_Setup.exe"

Write-Host "-> Downloading Screendial installer..."
try {
    Invoke-WebRequest -Uri $ExeUrl -OutFile $TempExe -UseBasicParsing
} catch {
    Write-Host "Error: Failed to download the Screendial installer." -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

if (-not (Test-Path $TempExe) -or (Get-Item $TempExe).Length -eq 0) {
    Write-Host "Error: Downloaded installer is missing or empty." -ForegroundColor Red
    exit 1
}

Write-Host "-> Installing Screendial (silent)..."
$proc = Start-Process -FilePath $TempExe -ArgumentList "/S" -Wait -PassThru

if ($proc.ExitCode -ne 0) {
    Write-Host "Error: Installer exited with code $($proc.ExitCode)." -ForegroundColor Red
    exit 1
}

Write-Host "-> Cleaning up installer file..."
Remove-Item $TempExe -Force -ErrorAction SilentlyContinue

# NSIS install location depends on installMode (perUser vs perMachine); check the
# common Tauri defaults rather than assume one, so "launch now" still works either way.
$Candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Screendial\Screendial.exe"),
    (Join-Path $env:LOCALAPPDATA "Screendial\Screendial.exe"),
    (Join-Path $env:ProgramFiles "Screendial\Screendial.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Screendial\Screendial.exe")
)
$AppPath = $Candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

Write-Host ""
Write-Host "=================================================="
Write-Host "    SUCCESS: Screendial has been installed!"
Write-Host "=================================================="

if ($AppPath) {
    Write-Host "Location: $AppPath"
    Write-Host "Launching Screendial now..."
    Start-Process $AppPath
} else {
    Write-Host "Launch Screendial from the Start Menu."
}
