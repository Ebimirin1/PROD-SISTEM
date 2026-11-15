# Pedido mínimo na geração de OP + lista "Tirar da loja" por cliente.
# Uso (PowerShell, dentro da pasta deste arquivo):
#   Teste:     .\instalar.ps1 -AppDir <pasta do app de teste (porta 8083)>
#   Produção:  .\instalar.ps1            (padrão: C:\SGP\app)
# Copia js\views\minimumCheck.js e aplica no planning.js (por texto, sem trocar o arquivo) só os trechos
# que ainda faltam: (1) checagem do mínimo antes de gerar, (2) porções de até 30 kg,
# (3) botão "Tirar da loja" na OP e (4) o clique dele. Faz backup e anota em C:\SGP\ALTERACOES.md.
# Sem mudança de banco. Pode rodar de novo: o que já existe não é duplicado.
param([string]$AppDir = 'C:\SGP\app')
$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$carimbo = Get-Date -Format 'yyyyMMdd-HHmmss'
$planning = Join-Path $AppDir 'js\views\planning.js'
$modulo = Join-Path $AppDir 'js\views\minimumCheck.js'
if (-not (Test-Path $planning)) { throw "Não achei $planning. Confira o -AppDir." }

$txt = [IO.File]::ReadAllText($planning, [Text.Encoding]::UTF8)
$crlf = $txt.Contains("`r`n")
$txt = $txt.Replace("`r`n", "`n")
function N([string]$s) { return $s.Replace("`r`n", "`n") }
function Conta([string]$t, [string]$a) { return ([regex]::Matches($t, [regex]::Escape($a))).Count }
$feito = @()

if (-not $txt.Contains('checkMinimumKg')) {
  $a1 = "    // Insumos de cada versão de formulação usada (uma consulta só)`n"
  $n1 = N @'
    // Pedido mínimo: produto abaixo de 15 kg não é produzido, sai da loja (lista na tela)
    {
      const { checkMinimumKg } = await import('./minimumCheck.js?v=20261115b');
      const keep = await checkMinimumKg(demands);
      if (keep === null) return; // usuário cancelou: nada foi gravado
      demands.splice(0, demands.length, ...keep);
      if (demands.length === 0) return; // todos abaixo do mínimo: nada para gerar
    }

'@
  $a2 = "    for (const g of sortedGroups) {`n"
  $n2 = (N @'
    // Porção tem no máximo 30 kg (limite do banco/embutimento): grupo maior vira partes iguais (54 kg = 27 + 27)
    const MAX_PORTION_G = 30000;
    const portionJobs = [];
    sortedGroups.forEach(g => {
      const parts = Math.max(1, Math.ceil(g.totalG / MAX_PORTION_G));
      const baseG = Math.floor(g.totalG / parts);
      for (let i = 0; i < parts; i++) portionJobs.push({ ...g, totalG: baseG + (i < g.totalG % parts ? 1 : 0) });
    });

    for (const g of portionJobs) {
'@) + "`n"
  foreach ($a in @($a1, $a2)) { if ((Conta $txt $a) -ne 1) { throw "Trecho esperado não encontrado (ou repetido) no planning.js: $a" } }
  $txt = $txt.Replace($a1, $n1 + "`n" + $a1).Replace($a2, $n2)
  $feito += 'checagem do mínimo e porções de até 30 kg'
}

if (-not $txt.Contains('op-store-list-btn')) {
  $a3 = "                  <span class=`"material-symbols-outlined text-[16px]`">print</span> Mapa Sabor × Destino`n                </button>`n"
  $n3 = (N @'
                <button class="op-store-list-btn text-xs font-bold text-bordeaux-primary flex items-center gap-1 hover:underline" data-opid="${op.id}" title="Itens abaixo de 15 kg, por cliente, que saem da loja">
                  <span class="material-symbols-outlined text-[16px]">storefront</span> Tirar da loja
                </button>
'@) + "`n"
  $a4 = "  // Mapa Sabor × Destino de uma OP só`n"
  $n4 = (N @'
  // Lista "Tirar da loja" (itens abaixo de 15 kg, por cliente) de uma OP
  container.querySelectorAll('.op-store-list-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const op = ops.find(o => o.id === e.currentTarget.dataset.opid);
      if (!op) return;
      const { openStoreList } = await import('./minimumCheck.js?v=20261115b');
      openStoreList(op.id, op.order_code);
    });
  });
'@) + "`n`n"
  foreach ($a in @($a3, $a4)) { if ((Conta $txt $a) -ne 1) { throw "Trecho esperado não encontrado (ou repetido) no planning.js: $a" } }
  $txt = $txt.Replace($a3, $a3 + $n3).Replace($a4, $n4 + $a4)
  $feito += 'botão Tirar da loja na OP'
}

# Mesma versão do módulo nos dois lugares (evita carregar a cópia antiga do cache)
$txt = $txt.Replace("minimumCheck.js?v=20261115'", "minimumCheck.js?v=20261115b'")

$bkDir = "C:\SGP\backups\app-antes-tirar-da-loja-$carimbo"
New-Item -ItemType Directory -Path $bkDir | Out-Null
Copy-Item $planning $bkDir
if (Test-Path $modulo) { Copy-Item $modulo $bkDir }
Write-Host "Backup: $bkDir"

if ($crlf) { $txt = $txt.Replace("`n", "`r`n") }
[IO.File]::WriteAllText($planning, $txt, (New-Object Text.UTF8Encoding($false)))
Copy-Item "$aqui\js\views\minimumCheck.js" $modulo -Force
$feito += 'minimumCheck.js (lista por cliente; reabre a lista em OP gerada)'
Write-Host ("Feito: " + ($feito -join '; '))

Add-Content 'C:\SGP\ALTERACOES.md' -Encoding UTF8 "`r`n## $(Get-Date -Format 'dd/MM/yyyy HH:mm') — Pedido mínimo / Tirar da loja`r`n- App: $AppDir. $($feito -join '; '). Mínimo de 15 kg por produto (sabor + tipo); lista por cliente ao gerar e no botão 'Tirar da loja' da OP (OP gerada: demandas cujo produto não virou porção). Backup: $bkDir. Sem mudança de banco.`r`n"
Write-Host 'Pronto. Recarregue com Ctrl+F5.'
