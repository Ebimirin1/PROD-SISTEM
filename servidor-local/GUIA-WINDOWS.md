# SGP no servidor próprio (Windows Server, sem Docker)

Este guia tira o banco do Supabase (nuvem) e roda tudo num Windows Server da empresa, só com programas nativos do Windows. Testado com Windows Server 2022 em mente; vale também para Windows 10/11.

## O que fica no servidor

```
Computadores da fábrica ──► http://SERVIDOR:8080 ──► Caddy ─┬─► app (arquivos do GitHub, C:\SGP\app)
                                                            └─► /rest/v1 ──► PostgREST ──► PostgreSQL 17
```

| Programa | Para que serve | Como roda |
|---|---|---|
| **PostgreSQL 17** | o banco de dados | serviço do Windows (o instalador já cria) |
| **PostgREST** | a mesma API de tabelas que o Supabase usava | tarefa agendada, liga com o Windows |
| **Caddy** | mostra o app e repassa a API, tudo na porta 8080 | tarefa agendada, liga com o Windows |

O login deixa de ser do Supabase: ele passa a ser a função `public.login` do próprio banco. **Usuários e senhas continuam os mesmos.** Para rodar SQL à mão, use o **HeidiSQL** (tipo de rede "PostgreSQL (TCP/IP)", servidor 127.0.0.1, usuário postgres, banco sgp) ou o pgAdmin, que vem junto com o PostgreSQL, no lugar do SQL Editor do Supabase.

Todos os arquivos citados aqui estão na pasta `servidor-local/` do repositório.

---

## Passo 1. Instalar o PostgreSQL 17

1. Baixe o instalador do Windows em https://www.postgresql.org/download/windows/ (link "Download the installer", versão **17**, Windows x86-64).
2. Instale com as opções padrão. Anote a **senha do usuário postgres** que ele pede. Porta: **5432**. No fim, desmarque o "Stack Builder".
3. **Não** libere a porta 5432 no firewall. Só o próprio servidor fala com o banco.

Em todo PowerShell que for usar neste guia, rode antes estas duas linhas (elas deixam o `psql` disponível e os acentos corretos):

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\17\bin"
$env:PGCLIENTENCODING = "UTF8"
```

## Passo 2. Baixar PostgREST, Caddy e o app

Crie as pastas:

```powershell
New-Item -ItemType Directory -Force -Path C:\SGP\postgrest, C:\SGP\caddy, C:\SGP\app, C:\SGP\migracao, C:\SGP\backups
```

- **PostgREST**: em https://github.com/PostgREST/postgrest/releases, na versão mais nova, baixe o arquivo que termina em `windows-x86-64.zip` e extraia o `postgrest.exe` em `C:\SGP\postgrest\`.
- **Caddy**: em https://github.com/caddyserver/caddy/releases, na versão mais nova, baixe o arquivo que termina em `windows_amd64.zip` e extraia o `caddy.exe` em `C:\SGP\caddy\`.
- **App**: no GitHub do PROD-SISTEM, botão **Code → Download ZIP**. Extraia de forma que o `index.html` fique direto em `C:\SGP\app\index.html` (não numa subpasta).
- Copie também da pasta `servidor-local` do ZIP para `C:\SGP\migracao\`: `01_preparar_banco.sql` e `02_depois_da_importacao.sql`. Para `C:\SGP\`: `instalar-servicos.ps1` e `backup.ps1`. O `postgrest.conf` vai para `C:\SGP\postgrest\` e o `Caddyfile` para `C:\SGP\caddy\`.

O app não precisa de nenhuma alteração: quando ele é aberto por um endereço que não é o GitHub Pages, passa sozinho a usar o servidor local.

## Passo 3. Escolher as duas senhas novas

Invente e anote:

- **Senha da API** (ex.: 20 letras e números): usada pelo PostgREST para entrar no banco.
- **Frase secreta do login** (**32 ou mais** letras e números, sem espaço): assina os logins.

Coloque as duas em **dois arquivos**, nos lugares marcados com `TROQUE`:

| Arquivo | Senha da API | Frase secreta |
|---|---|---|
| `C:\SGP\migracao\01_preparar_banco.sql` | `TROQUE_SENHA_DA_API` | `TROQUE_POR_UMA_FRASE...` |
| `C:\SGP\postgrest\postgrest.conf` | `TROQUE_SENHA_DA_API` | `TROQUE_POR_UMA_FRASE...` |

Os valores têm que ser **iguais** nos dois arquivos.

## Passo 4. Levar o banco da nuvem para o servidor

> A partir daqui, ninguém deve lançar nada no sistema da nuvem, senão o lançamento não vem junto. Faça num horário sem produção.

**4.1 Pegar o endereço do banco da nuvem.** No painel do Supabase: botão **Connect** (no topo) → **Session pooler**. Anote o *host* (algo como `aws-0-sa-east-1.pooler.supabase.com`) e a senha do banco (se não lembrar: Project Settings → Database → Reset database password).

**4.2 Exportar** (PowerShell, com as duas linhas do Passo 1):

```powershell
$env:PGPASSWORD = "SENHA_DO_BANCO_NA_NUVEM"
$NUVEM = "host=aws-0-sa-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.ywnsowvomewoyedqozuh sslmode=require"

# Tabelas, funções, regras de permissão e todos os dados
pg_dump -d $NUVEM --schema=public --no-owner --no-privileges --no-publications --no-subscriptions -Fc -f C:\SGP\migracao\sgp_public.dump

# Usuários e senhas (criptografadas) do login
psql -d $NUVEM -c "\copy (select id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at from auth.users) to 'C:/SGP/migracao/usuarios.csv' csv header"
```

Troque o `host=` pelo que você anotou. Ao final, `C:\SGP\migracao` deve ter `sgp_public.dump` e `usuarios.csv`.

**4.3 Importar no servidor:**

```powershell
$env:PGPASSWORD = "SENHA_DO_POSTGRES_LOCAL"   # a do Passo 1
$LOCAL = "host=127.0.0.1 port=5432 user=postgres dbname=sgp"

psql -h 127.0.0.1 -U postgres -d postgres -c "create database sgp encoding 'UTF8' template template0"
psql -d $LOCAL -v ON_ERROR_STOP=1 -f C:\SGP\migracao\01_preparar_banco.sql
psql -d $LOCAL -v ON_ERROR_STOP=1 -c "\copy auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at) from 'C:/SGP/migracao/usuarios.csv' csv header"
pg_restore -d $LOCAL --no-owner --no-privileges --clean --if-exists --single-transaction --exit-on-error C:\SGP\migracao\sgp_public.dump
psql -d $LOCAL -v ON_ERROR_STOP=1 -f C:\SGP\migracao\02_depois_da_importacao.sql
```

Cada comando para no primeiro erro sem gravar nada pela metade. Se algum der erro, me mande a mensagem.

**4.4 Conferir** (no pgAdmin, banco `sgp` → Query Tool, ou com `psql -d $LOCAL`):

```sql
select email from auth.users order by email;                 -- usuários migrados
select relname as tabela, n_live_tup as linhas
  from pg_stat_user_tables where schemaname = 'public' order by relname;  -- compare com o Table Editor do Supabase
select public.login('admin@sgp-industrial.local', 'SENHA_DO_ADMIN') ->> 'expires_at';  -- troque pelo login/senha de um admin; deve voltar um número
```

## Passo 5. Ligar a API e o app

PowerShell **como Administrador**:

```powershell
powershell -ExecutionPolicy Bypass -File C:\SGP\instalar-servicos.ps1
```

Isso cria as tarefas "SGP PostgREST" e "SGP Caddy" (ligam sozinhas quando o Windows reinicia e se religam se caírem) e libera a porta **8080** no firewall.

## Passo 6. Testar

1. No próprio servidor: abra `http://localhost:8080` e entre com seu usuário de sempre.
2. Em outro computador da fábrica: `http://IP-DO-SERVIDOR:8080` (o IP aparece com `ipconfig` no servidor). Vale criar um atalho na área de trabalho dos computadores.

## Passo 7. Backup diário (agora é com vocês)

Na nuvem o Supabase fazia backup; aqui não. Edite `C:\SGP\backup.ps1` (senha do postgres local) e agende, PowerShell como Administrador:

```powershell
$acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File C:\SGP\backup.ps1"
Register-ScheduledTask -TaskName "SGP Backup" -Action $acao -Trigger (New-ScheduledTaskTrigger -Daily -At 2am) -User "SYSTEM" -RunLevel Highest
```

Fica um arquivo por dia em `C:\SGP\backups` (guarda 30 dias). **Copie essa pasta para fora do servidor** (outro computador, HD externo, nuvem): backup no mesmo disco não protege contra defeito no disco.

Para restaurar um backup num banco vazio: `pg_restore -h 127.0.0.1 -U postgres -d sgp --clean --if-exists C:\SGP\backups\sgp-AAAA-MM-DD.dump`.

---

## Depois da virada

- **Atualizar o app** (quando sair mudança no GitHub): baixe o ZIP de novo e substitua o conteúdo de `C:\SGP\app`. Não precisa reiniciar nada.
- **SQL novo** (migrations que eu mandar): rode no HeidiSQL ou pgAdmin, banco `sgp`, como fazia no SQL Editor do Supabase.
- **Projeto na nuvem**: deixe parado algumas semanas como cópia de segurança antes de apagar.
- **Internet**: o banco e a API funcionam sem internet, mas o app ainda carrega duas bibliotecas da internet (o visual Tailwind e o cliente Supabase). Se a fábrica ficar sem internet, a tela não abre. Dá para baixar essas bibliotecas para o servidor depois, se quiserem 100% offline.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Tela abre, mas o login dá "Usuário ou senha incorretos." para todos | `usuarios.csv` não foi importado (4.3, terceiro comando) |
| Login dá erro de "JWT" ou "invalid signature" | a frase secreta está diferente no `01_preparar_banco.sql` e no `postgrest.conf`. Corrija no `.conf` e reinicie a tarefa "SGP PostgREST" |
| Telas vazias, erro 503 ou "Failed to fetch" | PostgREST parado: senha da API errada no `postgrest.conf`. Teste rodando `C:\SGP\postgrest\postgrest.exe C:\SGP\postgrest\postgrest.conf` num PowerShell e leia a mensagem |
| Outros computadores não abrem | firewall: confira a regra "SGP App 8080"; teste no próprio servidor com `localhost:8080` |
| Porta 5432 ou 8080 já ocupada por outro sistema | instale o PostgreSQL em outra porta (ex.: 5433) e troque a porta em `postgrest.conf` (`db-uri`), `backup.ps1` (`-p 5433`) e nos comandos `psql`; troque `:8080` no `Caddyfile` e a regra de firewall em `instalar-servicos.ps1` (ex.: 8081) |
| PostgREST fecha na hora, sem mensagem clara | outro programa colocou uma `libpq.dll` antiga no PATH. Copie de `C:\Program Files\PostgreSQL\17\bin` para `C:\SGP\postgrest`: `libpq.dll`, `libssl-3-x64.dll`, `libcrypto-3-x64.dll`, `libintl-9.dll`, `libiconv-2.dll`, `libwinpthread-1.dll`, `zlib1.dll` |
| Senha do Supabase recusada logo depois do "Reset database password" | a senha nova leva alguns minutos para valer; espere antes de tentar de novo (muitas tentativas bloqueiam o IP por um tempo) |
| `pg_restore` reclama de algo do Supabase (papel, extensão) | me mande a mensagem exata; nada foi gravado |
