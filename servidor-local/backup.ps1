# Backup diário do banco do SGP. Guarda 30 dias em C:\SGP\backups.
# Copiar para C:\SGP\backup.ps1, trocar a senha abaixo e agendar (ver GUIA-WINDOWS.md, passo 7).

$env:PGPASSWORD = "TROQUE_SENHA_DO_POSTGRES"
$pasta = "C:\SGP\backups"
New-Item -ItemType Directory -Force -Path $pasta | Out-Null

$arquivo = Join-Path $pasta ("sgp-" + (Get-Date -Format "yyyy-MM-dd") + ".dump")
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -h 127.0.0.1 -U postgres -d sgp -Fc -f $arquivo

Get-ChildItem $pasta -Filter "sgp-*.dump" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item
