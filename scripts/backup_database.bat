@echo off
setlocal EnableExtensions
rem Resolve project root relative to this script, then use its Compose project.
cd /d "%~dp0.."
set "BACKUP_DIR=%CD%\backups"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
set "OUT=%BACKUP_DIR%\nmfa_db_%STAMP%.sql"
echo Creating PostgreSQL logical backup to:
echo %OUT%
docker compose exec -T db sh -lc "pg_dump -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\"" > "%OUT%"
if errorlevel 1 (
  echo ERROR: pg_dump failed. Do not deploy or migrate.
  del "%OUT%" 2>nul
  exit /b 1
)
findstr /C:"PostgreSQL database dump complete" "%OUT%" >nul
if errorlevel 1 (
  echo ERROR: Backup completion marker not found. Treat this backup as invalid.
  exit /b 1
)
for %%F in ("%OUT%") do set "SIZE=%%~zF"
echo Backup file size: %SIZE% bytes
echo Backup dump completed. This confirms dump completion only, not restore validity.
echo Before production migration, restore this file into a separate test database and verify it.
endlocal
