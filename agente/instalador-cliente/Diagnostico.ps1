#requires -Version 5.1
<#
============================================================================
 NewSec Focus — Diagnostico de instalacao

 Responde "por que esta maquina nao aparece no painel?" sem ninguem precisar
 abrir log, registro ou Gerenciador de Servicos. Grava um relatorio na Area
 de Trabalho para mandar ao suporte.

 So LE o estado local e testa a conexao. Nao instala, nao corrige, nao baixa
 nada — de proposito: um diagnostico que se comporta como instalador seria
 bloqueado pelo antivirus como o baixador foi, em 09/09/2026.
============================================================================
#>

$ErrorActionPreference = 'Continue'

try {
    & chcp.com 65001 > $null
    [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
} catch { }

$NomeServico  = 'TelemetriaProdutividade'
$PastaDados   = Join-Path $env:ProgramData 'TelemetriaProdutividade'
$ChaveReg     = 'HKLM:\SOFTWARE\NewSecFocus'
$UrlSupabase  = 'https://auwotdrgxjrrhhhmmekc.supabase.co'

$linhas = New-Object System.Collections.Generic.List[string]
function Dizer {
    param([string]$Texto = '', [string]$Cor = 'Gray')
    Write-Host $Texto -ForegroundColor $Cor
    $linhas.Add($Texto)
}
function Titulo { param([string]$T) Dizer ''; Dizer ("== " + $T + " " + ('=' * [Math]::Max(0, 56 - $T.Length))) 'DarkCyan' }

Clear-Host
Dizer ''
Dizer '  NewSec Focus — Diagnostico' 'Cyan'
Dizer ("  " + (Get-Date -Format 'dd/MM/yyyy HH:mm:ss')) 'DarkGray'
Dizer ("  Maquina: " + $env:COMPUTERNAME + "   Usuario: " + $env:USERNAME) 'DarkGray'

$problemas = New-Object System.Collections.Generic.List[string]

# ---------------------------------------------------------------------------
Titulo 'Servico'
$svc = Get-Service -Name $NomeServico -ErrorAction SilentlyContinue
if (-not $svc) {
    Dizer '  NAO INSTALADO — o servico nao existe nesta maquina.' 'Red'
    $problemas.Add('O instalador nao chegou a criar o servico. Rode o Instalar.bat como Administrador e veja se algum passo fica marcado com X.')
} else {
    $cor = if ($svc.Status -eq 'Running') { 'Green' } else { 'Red' }
    Dizer ("  Estado: " + $svc.Status) $cor
    if ($svc.Status -ne 'Running') {
        $problemas.Add('O servico existe mas nao esta rodando. Veja o erro no fim do log abaixo.')
    }
    try {
        $cfg = & sc.exe qc $NomeServico 2>&1 | Out-String
        $caminho = ([regex]::Match($cfg, 'BINARY_PATH_NAME\s*:\s*(.+)|CAMINHO_BIN\S*\s*:\s*(.+)')).Groups |
                   Where-Object { $_.Value -and $_.Value -notmatch 'BINARY|CAMINHO' } | Select-Object -First 1
        if ($caminho) { Dizer ("  Executavel: " + $caminho.Value.Trim()) }
    } catch { }
}

$proc = Get-Process -Name 'Telemetria.Servico' -ErrorAction SilentlyContinue
Dizer ("  Processo do servico: " + $(if ($proc) { "rodando (PID " + $proc.Id + ")" } else { "nao esta na memoria" })) `
      $(if ($proc) { 'Green' } else { 'Yellow' })
$col = Get-Process -Name 'Telemetria.Coletor' -ErrorAction SilentlyContinue
Dizer ("  Processo do coletor: " + $(if ($col) { "rodando (PID " + $col.Id + ")" } else { "nao esta na memoria" })) `
      $(if ($col) { 'Green' } else { 'Yellow' })

# ---------------------------------------------------------------------------
Titulo 'Identidade gravada pelo instalador'
$reg = Get-ItemProperty -Path $ChaveReg -ErrorAction SilentlyContinue
if (-not $reg) {
    Dizer '  NAO ENCONTRADA — o instalador nao gravou a identidade da empresa.' 'Red'
    $problemas.Add('Sem a chave do registro, o agente nao sabe para qual empresa enviar. Reinstale como Administrador.')
} else {
    $codigo = if ($reg.ChaveMatricula) { $reg.ChaveMatricula } else { '(vazio)' }
    Dizer ("  Codigo da empresa: " + $codigo) $(if ($reg.ChaveMatricula) { 'Green' } else { 'Red' })
    Dizer ("  Pessoa:            " + $(if ($reg.NomeColaborador) { $reg.NomeColaborador } else { '(nome da conta do Windows)' }))
    Dizer ("  Nome da estacao:   " + $(if ($reg.NomeExibicao) { $reg.NomeExibicao } else { '(usa o nome do Windows)' }))
    Dizer ("  Departamento:      " + $(if ($reg.EquipeId) { $reg.EquipeId } else { '(nenhum)' }))
    Dizer ("  Servidor:          " + $reg.UrlSupabase)
    if (-not $reg.ChaveMatricula) {
        $problemas.Add('O codigo da empresa nao foi gravado. Reinstale e confira se ele foi aceito na tela.')
    }
    if ($reg.UrlSupabase -and $reg.UrlSupabase -notlike '*auwotdrgxjrrhhhmmekc*') {
        $problemas.Add('O servidor gravado nao e o do NewSec Focus. Pacote antigo ou adulterado — baixe de novo do painel.')
    }
}

# O token so existe depois que o servico conseguiu se registrar no servidor.
# Servico rodando sem token = ele esta tentando e nao consegue chegar la.
$tokenDispositivo = Join-Path $PastaDados 'dispositivo.bin'
if (Test-Path $tokenDispositivo) {
    Dizer '  Registro no painel: feito (a estacao ja tem a credencial dela)' 'Green'
} else {
    Dizer '  Registro no painel: AINDA NAO — o servico nao conseguiu se registrar.' 'Red'
    if ($svc -and $svc.Status -eq 'Running') {
        $problemas.Add('O servico esta rodando mas ainda nao se registrou no painel. Quase sempre e rede: veja a secao Conexao abaixo.')
    }
}

# ---------------------------------------------------------------------------
Titulo 'Conexao com o servidor'
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $dns = [Net.Dns]::GetHostAddresses('auwotdrgxjrrhhhmmekc.supabase.co')
    Dizer ("  DNS resolvido: " + ($dns[0].IPAddressToString)) 'Green'
} catch {
    Dizer '  DNS NAO RESOLVE — a maquina nao consegue achar o servidor.' 'Red'
    $problemas.Add('A rede desta maquina nao resolve o endereco do servidor. Verifique DNS, proxy ou bloqueio de firewall.')
}

try {
    $r = Invoke-WebRequest -Uri ($UrlSupabase + '/storage/v1/object/public/agente/instalador/atual.json') `
                           -UseBasicParsing -TimeoutSec 15
    Dizer ("  HTTPS respondeu: " + $r.StatusCode) 'Green'
} catch {
    Dizer ("  HTTPS FALHOU: " + $_.Exception.Message) 'Red'
    $problemas.Add('A maquina nao consegue falar com o servidor por HTTPS. Firewall corporativo ou proxy costumam ser a causa.')
}

# ---------------------------------------------------------------------------
Titulo 'Registro de funcionamento (log)'
$log = Join-Path $PastaDados 'logs\servico.log'
if (-not (Test-Path $log)) {
    Dizer '  SEM LOG — o servico nunca chegou a iniciar nesta maquina.' 'Red'
    $problemas.Add('O servico nunca rodou. Provavelmente a instalacao falhou antes do fim.')
} else {
    $tam = [math]::Round((Get-Item $log).Length / 1KB, 1)
    Dizer ("  Arquivo: " + $log + "  (" + $tam + " KB)")
    Dizer ''
    Dizer '  Ultimas linhas relevantes:' 'DarkGray'
    Get-Content $log -Tail 400 |
        Where-Object { $_ -match '\[ERR\]|\[WRN\]|iniciando|Matricula|matricul|Lote enviado|Versao nova|Worker' } |
        Select-Object -Last 12 |
        ForEach-Object { Dizer ("    " + $_.Substring(0, [Math]::Min(150, $_.Length))) }

    $erros = Get-Content $log -Tail 400 | Where-Object { $_ -match '\[ERR\]' } | Select-Object -Last 1
    if ($erros) { $problemas.Add('O log tem erro recente: ' + $erros.Substring(0, [Math]::Min(120, $erros.Length))) }
}

# ---------------------------------------------------------------------------
Titulo 'Antivirus'
try {
    # So conta deteccao que aponta para ARQUIVO do agente. Deteccao cujo
    # recurso e uma linha de comando (CmdLine:) casa com qualquer coisa que
    # mencione o produto — inclusive o proprio instalador rodando — e viraria
    # alarme falso. Um diagnostico que grita a toa ninguem le.
    $det = Get-MpThreatDetection -ErrorAction SilentlyContinue | Where-Object {
        $r = @($_.Resources) | Where-Object { $_ -notlike 'CmdLine:*' }
        ($r -join ' ') -match 'Telemetria\.|NewSec Focus'
    }
    if ($det) {
        Dizer ("  O Defender marcou algo relacionado ao agente (" + @($det).Count + " vez(es)).") 'Red'
        $problemas.Add('O Defender bloqueou algo do agente nesta maquina. Pode ser preciso liberar a pasta de instalacao.')
    } else {
        Dizer '  Nada relacionado ao agente foi bloqueado.' 'Green'
    }
} catch {
    Dizer '  (nao foi possivel consultar o Defender nesta sessao)' 'DarkGray'
}

# ---------------------------------------------------------------------------
Titulo 'Conclusao'
if ($problemas.Count -eq 0) {
    Dizer '  Nada de errado encontrado localmente.' 'Green'
    Dizer '  A estacao aparece no painel segundos depois de o servico iniciar, e a' 'Gray'
    Dizer '  pessoa em cerca de 2 minutos. Se passou disso, envie este relatorio ao suporte.' 'Gray'
} else {
    $i = 1
    foreach ($p in $problemas) { Dizer ("  " + $i + ") " + $p) 'Yellow'; $i++ }
}

$destino = Join-Path ([Environment]::GetFolderPath('Desktop')) 'NewSecFocus-Diagnostico.txt'
try {
    $linhas | Out-File -FilePath $destino -Encoding UTF8
    Dizer ''
    Dizer ("  Relatorio salvo em: " + $destino) 'Cyan'
    Dizer '  Envie esse arquivo para o suporte.' 'Gray'
} catch {
    Dizer ''
    Dizer '  (nao consegui salvar o relatorio na Area de Trabalho)' 'Yellow'
}

Write-Host ''
Read-Host '  Pressione ENTER para fechar'
