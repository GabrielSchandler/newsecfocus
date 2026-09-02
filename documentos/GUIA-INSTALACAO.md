# Guia de Instalação — ponta a ponta

Ordem: **banco → painel → operação da plataforma → empresa cliente → agente**.

## Pré-requisitos

- Conta no **Supabase** (projeto criado) e o **Supabase CLI**.
- **Node.js 18+** e conta na **Vercel** (para o painel).
- **.NET 8 SDK** numa máquina Windows (para compilar o agente).
- Direitos de **Administrador** nas estações onde o agente será instalado.

---

## 1. Banco de dados (Supabase)

```bash
cd supabase
supabase link --project-ref SEU_REF
supabase db push                 # aplica migrations 0001..0006
psql "$DATABASE_URL" -f seed.sql # opcional: empresa e equipes de exemplo

supabase functions deploy registrar-dispositivo
supabase functions deploy ingestao-lote
supabase functions deploy provisionar-empresa
```

No painel do Supabase:

1. **Authentication:** crie o usuário da sua operação (o seu).
2. **Database > Extensions:** confirme `pg_cron` habilitado — é o que dispara a
   consolidação dos agregados a cada 10 minutos e o expurgo diário. Sem ele o painel
   fica parado no tempo.

Anote: **URL do projeto** e **anon key**.

> Não há mais passo de habilitar replicação: a tela de atividade em tempo real consulta
> periodicamente, em vez de depender de Realtime. Um passo manual esquecido na
> implantação de um cliente deixaria a tela congelada sem nenhum erro visível.

---

## 2. Painel (Vercel)

```bash
cd dashboard
npm install
cp .env.example .env.local   # preencha URL + anon key
npm run dev                  # teste local em http://localhost:3000
```

Deploy: importe na Vercel, **Root Directory = `dashboard`**, configure
`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`, e publique.

---

## 3. Liberar a área da revenda

Rode uma vez, com o UUID do seu usuário:

```sql
insert into plataforma_admins (user_id, nome)
values ('<uuid-do-seu-usuario>', 'Operação');
```

Entre no painel: o menu passa a mostrar **Plataforma**. É o único passo por SQL do
processo — daqui em diante, cada cliente novo é um formulário.

---

## 4. Provisionar uma empresa cliente

Em **Plataforma > Nova empresa cliente**, informe nome, plano, limite de estações,
retenção e o e-mail do gestor. O sistema:

1. cria a conta em avaliação por 14 dias;
2. envia convite ao gestor, que define a senha e entra como **OWNER**;
3. mostra a **chave de matrícula** — é ela que vai no agente das estações do cliente.

Depois, o gestor da empresa (ou você, no lugar dele) configura em **Administração**:

- **Equipes** — crie antes de vincular as pessoas.
- **Classificação** — categorias e regras de aplicativo/site. **Sem isso o índice de
  produtividade não é calculado** e o painel mostra "sem classificação" em vez de um
  número inventado. Ao salvar uma regra, os últimos 90 dias são recalculados.
- **Colaboradores** — as pessoas aparecem sozinhas na primeira sincronização de cada
  estação, identificadas pelo usuário do Windows; aqui você dá nome, cargo, equipe e a
  jornada esperada (base do indicador de aderência).
- **Empresa** — fuso horário (define a virada do dia em todo o painel) e retenção da
  atividade crua.

---

## 5. Agente (estações Windows)

```bat
cd agente\implantacao
publicar.bat
```

Edite `agente\publicado\appsettings.json` com **UrlSupabase**, **ChaveAnonima** e
**ChaveMatricula** (a chave da empresa cliente). Depois, como Administrador:

```bat
cd agente\publicado
install_service.bat
```

Verifique:

- Serviço `TelemetriaProdutividade` em execução (`sc query TelemetriaProdutividade`).
- Ícone de bandeja aparece na sessão do usuário (balão informativo no primeiro logon).
- Após ~1 min, há linhas em `C:\ProgramData\TelemetriaProdutividade\telemetry.db`.
- Após a primeira janela de sync, a estação aparece em **Dispositivos** e a pessoa em
  **Pessoas**.

> A matrícula respeita o limite de estações do plano. Ao atingir o teto, novas máquinas
> são recusadas com erro explícito — aumente o limite em **Plataforma > Gerenciar**.

### Implantação em frota

Empurre `C:\ProgramData\TelemetriaProdutividade\configuracao.json` por GPO/MDM com as
chaves e políticas (janela de coleta, intervalo de sync). Ele sobrepõe o
`appsettings.json` sem recompilar. Distribua os binários por SCCM/Intune executando o
`install_service.bat` com privilégio de sistema.

> **Antes de distribuir a clientes:** empacote em MSI e assine o executável com
> certificado de code signing. Binário não assinado que instala hooks de teclado é
> bloqueado por antivírus e pelo SmartScreen — é impeditivo comercial, não detalhe.

---

## Conformidade antes de ligar

Rode o checklist de [CONFORMIDADE-LGPD.md](CONFORMIDADE-LGPD.md) e entregue o
[termo de ciência](termo-ciencia-monitoramento.md) aos colaboradores.

---

## Solução de problemas

| Sintoma | Causa provável | Ação |
|---|---|---|
| Estação não aparece | Chaves erradas no `appsettings.json` | Confira URL/anon/matrícula; veja `logs\servico.log` |
| Estação recusada na matrícula | Limite de licenças do plano atingido | Aumente em Plataforma > Gerenciar |
| Painel com dados, mas sem gráficos do dia | `pg_cron` desabilitado ou consolidação sem rodar | Habilite a extensão; rode `select consolidar_resumos(now() - interval '7 days');` |
| Índice mostra "sem classificação" | Nenhuma regra de aplicativo cadastrada | Administração > Classificação |
| Índice não mudou após criar regra | Reconsolidação falhou | Rode `select reconsolidar_org('<org_id>', 90);` |
| Dia virando na hora errada | Fuso da empresa incorreto | Administração > Empresa > Fuso horário |
| Sem ícone de bandeja | Coletor não subiu na sessão | Veja `logs\coletor.log`; confirme sessão ativa |
| 401 na ingestão | Token de dispositivo revogado | O agente refaz matrícula sozinho; confira a chave de matrícula |
| Nada coletado fora do horário | Janela de coleta configurada | Ajuste `JanelaColetaInicio/Fim` |
| Coleta parou em todas as estações | Conta suspensa ou cancelada | Plataforma > Gerenciar > Situação |
