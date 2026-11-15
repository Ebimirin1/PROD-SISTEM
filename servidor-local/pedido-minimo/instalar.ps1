# Gerar Ordens: lista de itens abaixo de 15 kg (tirar da loja) + porções de até 30 kg.
# Uso (PowerShell, dentro da pasta deste arquivo):
#   Teste:     .\instalar.ps1 -AppDir <pasta do app de teste (porta 8083)>
#   Produção:  .\instalar.ps1            (padrão: C:\SGP\app)
# Faz backup do planning.js, copia js\views\minimumCheck.js e aplica 2 trechos no planning.js
# (por texto, não substitui o arquivo). Anota em C:\SGP\ALTERACOES.md. Sem mudança de banco.
param([string]$AppDir = 'C:\SGP\app')
$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$carimbo = Get-Date -Format 'yyyyMMdd-HHmmss'
$planning = Join-Path $AppDir 'js\views\planning.js'
if (-not (Test-Path $planning)) { throw "Não achei $planning. Confira o -AppDir." }

$txt = [IO.File]::ReadAllText($planning, [Text.Encoding]::UTF8)
$crlf = $txt.Contains("`r`n")
$txt = $txt.Replace("`r`n", "`n")
if ($txt.Contains('checkMinimumKg')) { throw 'planning.js já tem o patch (checkMinimumKg). Nada feito.' }

$ancora1 = "    // Insumos de cada versão de formulação usada (uma consulta só)`n"
$novo1 = @'
    // Pedido mínimo: porção abaixo de 15 kg não é produzida, sai da loja (lista na tela)
    {
      const { checkMinimumKg } = await import('./minimumCheck.js?v=20261115');
      const keep = await checkMinimumKg(demands);
      if (keep === null) return; // usuário cancelou: nada foi gravado
      demands.splice(0, demands.length, ...keep);
      if (demands.length === 0) return; // todos abaixo do mínimo: nada para gerar
    }

'@.Replace("`r`n", "`n")

$ancora2 = "    for (const g of sortedGroups) {`n"
$novo2 = @'
    // Porção tem no máximo 30 kg (limite do banco/embutimento): grupo maior vira partes iguais (54 kg = 27 + 27)
    const MAX_PORTION_G = 30000;
    const portionJobs = [];
    sortedGroups.forEach(g => {
      const parts = Math.max(1, Math.ceil(g.totalG / MAX_PORTION_G));
      const baseG = Math.floor(g.totalG / parts);
      for (let i = 0; i < parts; i++) portionJobs.push({ ...g, totalG: baseG + (i < g.totalG % parts ? 1 : 0) });
    });

    for (const g of portionJobs) {

'@.Replace("`r`n", "`n").TrimEnd("`n") + "`n"

foreach ($a in @($ancora1, $ancora2)) {
  $n = ([regex]::Matches($txt, [regex]::Escape($a))).Count
  if ($n -ne 1) { throw "Trecho esperado aparece $n vezes no planning.js: $a" }
}

$bkDir = "C:\SGP\backups\app-antes-pedido-minimo-$carimbo"
New-Item -ItemType Directory -Path $bkDir | Out-Null
Copy-Item $planning $bkDir
Write-Host "Backup: $bkDir\planning.js"

$txt = $txt.Replace($ancora1, $novo1 + $ancora1).Replace($ancora2, $novo2)
if ($crlf) { $txt = $txt.Replace("`n", "`r`n") }
[IO.File]::WriteAllText($planning, $txt, (New-Object Text.UTF8Encoding($false)))
Copy-Item "$aqui\js\views\minimumCheck.js" (Join-Path $AppDir 'js\views\minimumCheck.js') -Force
Write-Host 'planning.js alterado e minimumCheck.js copiado.'

Add-Content 'C:\SGP\ALTERACOES.md' -Encoding UTF8 "`r`n## $(Get-Date -Format 'dd/MM/yyyy HH:mm') — Gerar Ordens: itens abaixo de 15 kg (tirar da loja) e porções de até 30 kg`r`n- App: $AppDir. Novo js/views/minimumCheck.js; planning.js: antes de gerar, grupos sabor+tipo+conservação abaixo de 15 kg aparecem numa lista (Imprimir / Cancelar / Gerar sem esses itens) e ficam fora das porções e bateladas; grupo acima de 30 kg é dividido em porções iguais (antes dava erro production_portions_planned_kg_check). Backup: $bkDir. Sem mudança de banco.`r`n"
Write-Host 'Pronto. Recarregue com Ctrl+F5.'
