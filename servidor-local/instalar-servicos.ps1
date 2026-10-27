# Registra o PostgREST e o Caddy para ligarem sozinhos com o Windows e libera a porta 8080.
# Rodar no PowerShell COMO ADMINISTRADOR:  powershell -ExecutionPolicy Bypass -File C:\SGP\instalar-servicos.ps1

$config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$gatilho = New-ScheduledTaskTrigger -AtStartup

$acaoApi = New-ScheduledTaskAction -Execute "C:\SGP\postgrest\postgrest.exe" -Argument "C:\SGP\postgrest\postgrest.conf" -WorkingDirectory "C:\SGP\postgrest"
Register-ScheduledTask -TaskName "SGP PostgREST" -Action $acaoApi -Trigger $gatilho -Settings $config -User "SYSTEM" -RunLevel Highest -Force

$acaoWeb = New-ScheduledTaskAction -Execute "C:\SGP\caddy\caddy.exe" -Argument "run --config C:\SGP\caddy\Caddyfile" -WorkingDirectory "C:\SGP\caddy"
Register-ScheduledTask -TaskName "SGP Caddy" -Action $acaoWeb -Trigger $gatilho -Settings $config -User "SYSTEM" -RunLevel Highest -Force

New-NetFirewallRule -DisplayName "SGP App 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Domain,Private -ErrorAction SilentlyContinue

Start-ScheduledTask -TaskName "SGP PostgREST"
Start-ScheduledTask -TaskName "SGP Caddy"
Write-Host "Pronto. Abra http://localhost:8080 neste servidor para testar."
