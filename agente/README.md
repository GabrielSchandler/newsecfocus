# Agente Windows — C# / .NET 8

Coleta de metadados de produtividade com baixo consumo, dividida em dois processos
que resolvem o isolamento da Sessão 0 (ver o README raiz para o porquê).

## Projetos

```
agente/
├── Telemetria.sln
├── src/
│   ├── Telemetria.Nucleo/     Config, modelos, buffer SQLCipher, cofre DPAPI, higienização
│   ├── Telemetria.Coletor/    Processo na sessão do usuário: hooks, foreground, idle, domínio, tray
│   └── Telemetria.Servico/    Windows Service (SYSTEM): lança o coletor + sincroniza + matrícula
└── implantacao/
    ├── publicar.bat           Publica serviço + coletor numa pasta pronta p/ instalar
    ├── install_service.bat    sc.exe create (SYSTEM, auto-restart) + ACL da pasta de dados
    └── uninstall_service.bat  Remove o serviço (preserva ou purga o buffer)
```

## Requisitos

- **.NET 8 SDK** (`dotnet --version` deve mostrar 8.x).
- Windows 10/11 x64.

## Build e publicação

```bat
cd agente\implantacao
publicar.bat
```

Gera `agente\publicado\` com o serviço e o coletor (em `publicado\coletor\`).

## Configuração

Antes de instalar, edite `publicado\appsettings.json`:

```json
{
  "Agente": {
    "UrlSupabase": "https://SEU-PROJETO.supabase.co",
    "ChaveAnonima": "ANON_KEY",
    "ChaveMatricula": "ENROLLMENT_KEY_DA_ORGANIZACAO",
    "MinutosEntreSincronizacoes": 60,
    "TamanhoLote": 120
  }
}
```

Em frota, prefira empurrar `C:\ProgramData\TelemetriaProdutividade\configuracao.json`
por GPO/MDM — ele sobrepõe o `appsettings.json` sem recompilar.

## Instalação (como Administrador)

```bat
cd agente\publicado
install_service.bat
```

O script copia os binários para `C:\Program Files\TelemetriaProdutividade`, cria a pasta
de dados protegida em `C:\ProgramData\TelemetriaProdutividade` (ACL via `icacls`), cria o
serviço `TelemetriaProdutividade` (SYSTEM, início automático atrasado, auto-restart) e o
inicia.

## Desinstalação

```bat
uninstall_service.bat            :: remove serviço e binários, preserva o buffer
uninstall_service.bat purgar     :: remove tudo, inclusive dados locais
```

## O que roda onde

| Recurso | Onde | API |
|---|---|---|
| Contagem de teclas/cliques/scroll | Coletor (sessão) | `WH_KEYBOARD_LL`, `WH_MOUSE_LL` |
| Janela ativa (exe + título) | Coletor | `GetForegroundWindow`, `QueryFullProcessImageName` |
| Ociosidade (>180s) | Coletor | `GetLastInputInfo` |
| Domínio do navegador | Coletor | UI Automation (thread STA com timeout) |
| Lançar coletor na sessão | Serviço | `WTSQueryUserToken` + `CreateProcessAsUser` |
| Buffer offline | Núcleo | SQLCipher + DPAPI |
| Sincronização em lote | Serviço | HTTP POST às Edge Functions |

## Diagnóstico

Logs em `C:\ProgramData\TelemetriaProdutividade\logs\` (`servico.log`, `coletor.log`).
Para depurar o serviço como console: `dotnet run --project src\Telemetria.Servico`.

## Notas

- SQLCipher vem do pacote `SQLitePCLRaw.bundle_e_sqlcipher` — não precisa de DLL externa.
- A extração de domínio usa o UI Automation gerenciado (por isso `UseWPF=true` no coletor,
  mas nenhuma janela WPF é criada); ela roda numa thread STA com timeout rígido para nunca
  travar a amostragem.
