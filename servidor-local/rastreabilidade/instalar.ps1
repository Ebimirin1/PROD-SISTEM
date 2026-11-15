# Instala a tela "Consultar Origem" (rastreabilidade por lote) no SGP.
# Uso (PowerShell como administrador, dentro da pasta deste arquivo):
#   Teste:     .\instalar.ps1 -AppDir <pasta do app de teste (porta 8083)> -Banco <banco de teste>
#   Produção:  .\instalar.ps1            (padrão: C:\SGP\app e banco sgp, porta 5433)
# Faz backup do app antes, copia a tela, acrescenta a linha no menu (js\screens.js),
# roda o SQL se achar o psql e a senha (variável PGPASSWORD), e anota em C:\SGP\ALTERACOES.md.
param(
  [string]$AppDir = 'C:\SGP\app',
  [string]$Banco = 'sgp',
  [int]$Porta = 5433,
  [string]$Usuario = 'postgres',
  [string]$Psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
)
$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$carimbo = Get-Date -Format 'yyyyMMdd-HHmmss'

if (-not (Test-Path "$AppDir\js\screens.js")) { throw "Não achei $AppDir\js\screens.js. Confira o -AppDir." }

# 1. Backup
$backup = "C:\SGP\backups\app-antes-rastreabilidade-$carimbo"
Copy-Item $AppDir $backup -Recurse
Write-Host "Backup: $backup"

# 2. Tela nova
Copy-Item "$aqui\js\views\traceability.js" "$AppDir\js\views\traceability.js" -Force
Write-Host 'Copiado js\views\traceability.js'

# 3. Linha no menu (só se ainda não existir)
$screens = "$AppDir\js\screens.js"
$txt = [IO.File]::ReadAllText($screens, [Text.Encoding]::UTF8)
if ($txt -notmatch "key:\s*'traceability'") {
  $linha = "  { key: 'traceability', title: 'Consultar Origem', icon: 'manage_search', includes: 'Rastreabilidade por lote: insumos e lotes de cada produto' },`r`n"
  if ($txt -match "\r?\n(\s*)\{\s*key:\s*'users'") {
    $txt = [regex]::Replace($txt, "(\r?\n)(\s*\{\s*key:\s*'users')", "`$1$linha`$2", 1)
  } else {
    $txt = [regex]::Replace($txt, "\r?\n\];", ",`r`n$($linha.TrimEnd(",`r`n"))`r`n];", 1)
  }
  [IO.File]::WriteAllText($screens, $txt, (New-Object Text.UTF8Encoding($false)))
  Write-Host 'Menu: linha Consultar Origem acrescentada em js\screens.js'
} else {
  Write-Host 'Menu: Consultar Origem já estava em js\screens.js'
}

# 4. Banco
$sql = "$aqui\migration_rastreabilidade.sql"
if ((Test-Path $Psql) -and $env:PGPASSWORD) {
  & $Psql -h localhost -p $Porta -U $Usuario -d $Banco -v ON_ERROR_STOP=1 -f $sql
  if ($LASTEXITCODE -ne 0) { throw 'O SQL falhou; o app já foi copiado, mas a tela vai avisar que falta o banco. Veja a mensagem acima.' }
  Write-Host "SQL aplicado no banco $Banco"
} else {
  Write-Host "ATENÇÃO: SQL não rodado. Abra $sql no HeidiSQL (banco $Banco, porta $Porta) e execute."
}

# 5. Registro
$log = 'C:\SGP\ALTERACOES.md'
Add-Content $log -Encoding UTF8 "`r`n## $(Get-Date -Format 'dd/MM/yyyy HH:mm') — Consultar Origem (rastreabilidade por lote)`r`n- App: $AppDir (backup em $backup). Arquivo novo js\views\traceability.js; linha 'traceability' em js\screens.js.`r`n- Banco $Banco`: visão vw_rastreabilidade_insumos, funções rastreabilidade_origem e rastreabilidade_por_lote_insumo, chave 'traceability' nas permissões.`r`n"
Write-Host 'Pronto. Recarregue o navegador com Ctrl+F5 e abra #traceability.'
