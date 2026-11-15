# Linhas intercaladas (zebra) em todas as tabelas do SGP.
# Uso (PowerShell, dentro da pasta deste arquivo):
#   Teste:     .\instalar.ps1 -AppDir <pasta do app de teste (porta 8083)>
#   Produção:  .\instalar.ps1            (padrão: C:\SGP\app)
# Faz backup do index.html, coloca um bloco <style id="zebra-tabelas"> antes do </head>
# (troca o bloco se já existir) e anota em C:\SGP\ALTERACOES.md. Sem mudança de banco.
param([string]$AppDir = 'C:\SGP\app')
$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$carimbo = Get-Date -Format 'yyyyMMdd-HHmmss'
$index = Join-Path $AppDir 'index.html'
if (-not (Test-Path $index)) { throw "Não achei $index. Confira o -AppDir." }

$backup = "C:\SGP\backups\index-antes-zebra-$carimbo.html"
Copy-Item $index $backup
Write-Host "Backup: $backup"

$css = [IO.File]::ReadAllText("$aqui\zebra.css", [Text.Encoding]::UTF8).Trim()
$bloco = "<style id=`"zebra-tabelas`">`r`n$css`r`n</style>"
$txt = [IO.File]::ReadAllText($index, [Text.Encoding]::UTF8)
if ($txt -match '<style id="zebra-tabelas">') {
  $txt = [regex]::Replace($txt, '(?s)<style id="zebra-tabelas">.*?</style>', [Text.RegularExpressions.MatchEvaluator]{ param($m) $bloco }, 1)
  Write-Host 'Bloco zebra-tabelas substituído'
} else {
  $i = $txt.IndexOf('</head>')
  if ($i -lt 0) { throw 'Não achei </head> no index.html' }
  $txt = $txt.Insert($i, "$bloco`r`n")
  Write-Host 'Bloco zebra-tabelas acrescentado antes do </head>'
}
[IO.File]::WriteAllText($index, $txt, (New-Object Text.UTF8Encoding($false)))

Add-Content 'C:\SGP\ALTERACOES.md' -Encoding UTF8 "`r`n## $(Get-Date -Format 'dd/MM/yyyy HH:mm') — Linhas intercaladas nas tabelas`r`n- App: $AppDir. index.html ganhou <style id=`"zebra-tabelas`"> (linhas pares com fundo dourado claro, hover vinho claro). Backup: $backup. Sem mudança de banco.`r`n"
Write-Host 'Pronto. Recarregue com Ctrl+F5.'
