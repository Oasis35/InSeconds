param()
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "==> Arrêt d'un éventuel back sur :5172..." -ForegroundColor Cyan
$existing = Get-NetTCPConnection -LocalPort 5172 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Stop-Process -Id $existing.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep 1
}

Write-Host "==> Reset Docker..." -ForegroundColor Cyan
docker compose down -v
docker compose up -d
Write-Host "    PostgreSQL OK" -ForegroundColor Green

Write-Host "==> Création de la DB e2e..." -ForegroundColor Cyan
docker compose exec -T database psql -U inseconds -c "DROP DATABASE IF EXISTS inseconds_e2e;" 2>$null
docker compose exec -T database psql -U inseconds -c "CREATE DATABASE inseconds_e2e;"
Write-Host "    DB inseconds_e2e OK" -ForegroundColor Green

$connStr = 'Host=localhost;Port=5432;Database=inseconds_e2e;Username=inseconds;Password=REDACTED'

Write-Host "==> Démarrage du back Testing (port 5172)..." -ForegroundColor Cyan
$backJob = Start-Job -ScriptBlock {
    param($apiDir, $connStr)
    Set-Location $apiDir
    $env:ASPNETCORE_ENVIRONMENT = 'Testing'
    $env:ConnectionStrings__DefaultConnection = $connStr
    $env:AdminPassword = 'e2e-admin-password'
    $env:E2E_FRONT_PORT = '5174'
    dotnet run --no-launch-profile --urls http://localhost:5172
} -ArgumentList "$root\src\back\InSeconds.Api", $connStr

Write-Host "==> Attente du back..." -ForegroundColor Cyan
$tries = 0
while ($tries -lt 30) {
    try {
        $null = Invoke-WebRequest http://localhost:5172/health -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        break
    } catch {
        $tries++
        Start-Sleep 2
    }
}
if ($tries -eq 30) {
    Write-Host "==> Output du job back :" -ForegroundColor Yellow
    Receive-Job $backJob
    Stop-Job $backJob; Remove-Job $backJob
    Write-Error "Back non disponible sur :5172"
    exit 1
}
Write-Host "    Back OK" -ForegroundColor Green

Write-Host "==> Lancement des tests E2E..." -ForegroundColor Cyan
Set-Location "$root\src\front\InSeconds.Client"
npm run e2e
$e2eExit = $LASTEXITCODE

Write-Host "==> Arrêt du back..." -ForegroundColor Cyan
$port = Get-NetTCPConnection -LocalPort 5172 -State Listen -ErrorAction SilentlyContinue
if ($port) { Stop-Process -Id $port.OwningProcess -Force -ErrorAction SilentlyContinue }
Stop-Job $backJob -ErrorAction SilentlyContinue
Remove-Job $backJob -ErrorAction SilentlyContinue

exit $e2eExit
