$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
New-Item -ItemType Directory -Force backups | Out-Null
docker compose exec -T db pg_dump -U nmfa -d nmfa | Out-File -Encoding ascii "backups\nmfa_$stamp.sql"
Write-Host "Database backup created in backups\"
