# Instala a tela "Importar Pedido" (planilha semanal -> OP da semana) no SGP.
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
$backup = "C:\SGP\backups\app-antes-importar-pedido-$carimbo"
Copy-Item $AppDir $backup -Recurse
Write-Host "Backup: $backup"

# 2. Tela nova
Copy-Item "$aqui\js\views\orderImport.js" "$AppDir\js\views\orderImport.js" -Force
Write-Host 'Copiado js\views\orderImport.js'

# 3. Linha no menu (só se ainda não existir)
$screens = "$AppDir\js\screens.js"
$txt = [IO.File]::ReadAllText($screens, [Text.Encoding]::UTF8)
if ($txt -notmatch "key:\s*'orderImport'") {
  $linha = "  { key: 'orderImport', title: 'Importar Pedido', icon: 'upload_file', includes: 'Planilha do pedido da semana para a Ordem de Produção' },`r`n"
  if ($txt -match "\r?\n(\s*)\{\s*key:\s*'catalogs'") {
    $txt = [regex]::Replace($txt, "(\r?\n)(\s*\{\s*key:\s*'catalogs')", "`$1$linha`$2", 1)
  } else {
    $txt = [regex]::Replace($txt, "\r?\n\];", ",`r`n$($linha.TrimEnd(",`r`n"))`r`n];", 1)
  }
  [IO.File]::WriteAllText($screens, $txt, (New-Object Text.UTF8Encoding($false)))
  Write-Host 'Menu: linha Importar Pedido acrescentada em js\screens.js'
} else {
  Write-Host 'Menu: Importar Pedido já estava em js\screens.js'
}

# 4. Banco
$sql = "$aqui\migration_importar_pedido.sql"
if ((Test-Path $Psql) -and $env:PGPASSWORD) {
  & $Psql -h localhost -p $Porta -U $Usuario -d $Banco -v ON_ERROR_STOP=1 -f $sql
  if ($LASTEXITCODE -ne 0) { throw 'O SQL falhou; o app já foi copiado, mas a tela vai avisar que falta o banco. Veja a mensagem acima.' }
  Write-Host "SQL aplicado no banco $Banco"
} else {
  Write-Host "ATENÇÃO: SQL não rodado. Abra $sql no HeidiSQL (banco $Banco, porta $Porta) e execute."
}

# 5. Registro
$log = 'C:\SGP\ALTERACOES.md'
Add-Content $log -Encoding UTF8 "`r`n## $(Get-Date -Format 'dd/MM/yyyy HH:mm') — Importar Pedido (planilha da semana -> OP)`r`n- App: $AppDir (backup em $backup). Arquivo novo js\views\orderImport.js; linha 'orderImport' em js\screens.js (depois de Pedido de Produção).`r`n- Banco $Banco`: tabelas order_imports, order_import_lines, order_import_code_map; funções order_import_preview, order_import_apply, order_import_history; chave 'orderImport' nas permissões.`r`n"
Write-Host 'Pronto. Recarregue o navegador com Ctrl+F5 e abra #orderImport.'
