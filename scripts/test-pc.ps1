$ErrorActionPreference = 'Stop'
Write-Host 'Django system check...' -ForegroundColor Cyan
docker compose exec backend python manage.py check
if ($LASTEXITCODE -ne 0) { throw 'Django check failed.' }
Write-Host 'Migration drift check...' -ForegroundColor Cyan
docker compose exec backend python manage.py makemigrations --check --dry-run
if ($LASTEXITCODE -ne 0) { throw 'Migration check failed.' }
Write-Host 'Finance tests...' -ForegroundColor Cyan
docker compose exec backend python manage.py test finance
if ($LASTEXITCODE -ne 0) { throw 'Finance tests failed.' }
Write-Host 'All commands returned success.' -ForegroundColor Green
