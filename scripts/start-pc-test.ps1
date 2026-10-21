$ErrorActionPreference = 'Stop'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker command not found. Install Docker Desktop and reopen PowerShell.'
}
docker info | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running. Start Docker Desktop and retry.' }

$rootEnv = Join-Path (Get-Location) '.env'
$backendEnv = Join-Path (Get-Location) 'backend/.env'
if (-not (Test-Path $rootEnv)) {
  Copy-Item (Join-Path (Get-Location) '.env.example') $rootEnv
  Write-Host 'Created root .env from .env.example for local PC testing only.' -ForegroundColor Yellow
}
if (-not (Test-Path $backendEnv)) {
  Copy-Item (Join-Path (Get-Location) 'backend/.env.example') $backendEnv
  Write-Host 'Created backend/.env from backend/.env.example for local PC testing only.' -ForegroundColor Yellow
}
function Get-EnvValue([string]$path,[string]$key) {
  $line = Get-Content $path | Where-Object { $_ -match "^\s*$key\s*=" } | Select-Object -Last 1
  if (-not $line) { return $null }
  return (($line -split '=',2)[1]).Trim().Trim('"').Trim("'")
}
foreach ($key in @('POSTGRES_DB','POSTGRES_USER','POSTGRES_PASSWORD')) {
  $r = Get-EnvValue $rootEnv $key
  $b = Get-EnvValue $backendEnv $key
  if ([string]::IsNullOrWhiteSpace($r) -or [string]::IsNullOrWhiteSpace($b)) {
    throw "Missing $key. Set it in both .env and backend/.env before starting."
  }
  if ($r -cne $b) {
    throw "Database settings mismatch for $key. Make .env and backend/.env match. Password values are not printed. Do not delete the PostgreSQL volume."
  }
}
Write-Host 'Database configuration matches between root .env and backend/.env.' -ForegroundColor Green
Write-Host 'Building and starting NMFA. First run can take several minutes...' -ForegroundColor Cyan
docker compose up --build -d
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed. Check the output above.' }
Write-Host ''
Write-Host 'Containers started. Create your own administrator login with:' -ForegroundColor Green
Write-Host 'docker compose exec backend python manage.py createsuperuser'
Write-Host 'At the Username prompt, type a username (for example admin). If you press Enter on blank, Django uses root.'
Write-Host 'Password input is invisible while typing; type it and press Enter, then repeat it.'
Write-Host 'Then open http://localhost:5173 and sign in with that username/password.'
Write-Host 'For tests run: .\scripts\test-pc.ps1'
