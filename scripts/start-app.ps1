# Levanta el servidor de VDV Suite si no esta corriendo, y abre el navegador.
$ErrorActionPreference = "SilentlyContinue"

$appDir = Split-Path -Parent $PSScriptRoot
Set-Location $appDir

$running = $false
try {
    $null = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2
    $running = $true
} catch {
    $running = $false
}

if (-not $running) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c title VDV Suite - servidor && npm run dev" -WorkingDirectory $appDir -WindowStyle Minimized

    $ready = $false
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Seconds 1
        try {
            $null = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2
            $ready = $true
            break
        } catch {
            $ready = $false
        }
    }
}

Start-Process "http://localhost:3000"
