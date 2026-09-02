# Conformidade com a LGPD

Este sistema foi desenhado sob o princípio de **privacidade desde a concepção**
(*privacy by design*). Este documento resume as medidas técnicas e organizacionais
e não substitui a orientação do encarregado de dados (DPO) e do jurídico da empresa.

## 1. Base legal

O monitoramento de produtividade em ambiente corporativo apoia-se, em regra, no
**legítimo interesse do empregador** (LGPD, art. 7º, IX) e na **execução do contrato
de trabalho** (art. 7º, V), desde que:

- haja **transparência**: o empregado sabe que a estação é monitorada;
- a coleta seja **proporcional e mínima** ao objetivo (gestão de produtividade);
- **não** se coletem dados sensíveis nem conteúdo de comunicações privadas.

> Recomenda-se formalizar a ciência do empregado (ver
> [termo-ciencia-monitoramento.md](termo-ciencia-monitoramento.md)) e registrar a
> política interna de monitoramento.

## 2. Minimização — o que é e o que NÃO é coletado

| Coletado (metadado) | NÃO coletado |
|---|---|
| Nome do executável em foco (`chrome.exe`) | Conteúdo digitado / teclas específicas |
| Título da janela, higienizado | Capturas de tela |
| Domínio do site (`portal.gov.br`) | URL completa (caminho/query) |
| Ocioso x ativo x bloqueado no minuto | Conteúdo de mensagens / e-mails |
| **Contagem** de teclas, cliques e rolagens | Nome de contatos, arquivos abertos |

### Salvaguardas técnicas no agente

- **Sem keylogging:** os hooks só **incrementam contadores**. O código da tecla
  (`lParam`) é ignorado — ver `ContadoresEntrada.cs`.
- **Mensageria protegida:** processos como WhatsApp, Telegram e Signal têm o título
  **omitido** (`ProcessosSigilosos`). Só se registra o executável e o estado ativo/ocioso.
- **Cofres de senha protegidos:** KeePass, 1Password, Bitwarden idem.
- **Higienização de título:** e-mails viram `[email]` e sequências de 6+ dígitos viram
  `######` (`HigienizadorTexto.cs`).
- **Só o domínio:** a UI Automation extrai apenas o host da barra de endereço.
- **Janela de coleta:** configurável para não coletar fora do expediente.

## 3. Segurança dos dados

- **Em repouso, na estação:** buffer local em **SQLCipher** (AES-256). A chave é
  gerada por máquina e protegida com **DPAPI** (`DataProtectionScope.LocalMachine`),
  numa pasta com ACL restrita a SYSTEM/Administradores.
- **Em trânsito:** HTTPS/TLS até as Edge Functions do Supabase.
- **No servidor:** **Row Level Security** garante que cada organização só enxergue os
  próprios dados. Os agentes autenticam com **token por dispositivo** (guardado só como
  hash no banco), nunca com credenciais de banco.
- **Retenção local:** registros não enviados expiram após `DiasRetencaoLocal` (padrão 14).

## 4. Direitos do titular

O empregado pode solicitar acesso, correção ou informações sobre o tratamento junto ao
RH/DPO. Como o dado é vinculado a `device` e `os_user`, é possível localizar e, se for o
caso, eliminar os registros de uma pessoa. Defina uma **política de retenção no servidor**
(ex.: apagar `activity_logs` com mais de N meses) conforme a necessidade do negócio.

## 5. Transparência operacional

- Ícone de bandeja informa a coleta e detalha, em português claro, o que é e o que não é
  coletado (`IconeBandeja.cs`), com balão no primeiro logon.
- Este repositório é a documentação técnica do tratamento — útil para o registro das
  operações de tratamento (ROPA).

## 6. Checklist de implantação responsável

- [ ] Política interna de monitoramento aprovada pelo jurídico.
- [ ] Termo de ciência assinado/entregue aos empregados.
- [ ] DPO ciente do tratamento e do fluxo de dados.
- [ ] Janela de coleta restrita ao horário de trabalho, se aplicável.
- [ ] Política de retenção definida no Supabase.
- [ ] Acesso ao Dashboard restrito a gestores autorizados (papéis OWNER/MANAGER).
