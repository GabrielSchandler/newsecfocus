# Guia de Instalação — ponta a ponta

Ordem recomendada: **banco → dashboard → agente**. Assim você já tem a chave de
matrícula e a URL do Supabase quando for configurar o agente.

## Pré-requisitos

- Conta no **Supabase** (projeto criado).
- **Node.js 18+** e conta na **Vercel** (para o dashboard).
- **.NET 8 SDK** numa máquina Windows (para compilar o agente).
- Direitos de **Administrador** nas estações onde o agente será instalado.

---

## 1. Banco de dados (Supabase)

```bash
cd supabase
supabase link --project-ref SEU_REF
supabase db push                 # aplica migrations 0001..0003
psql "$DATABASE_URL" -f seed.sql # cria org demo + categorias (opcional)
supabase functions deploy registrar-dispositivo
supabase functions deploy ingestao-lote
```

No painel do Supabase:

1. **Database > Replication:** habilite a replicação da tabela `activity_logs`
   (necessário para o Realtime da timeline).
2. **Authentication:** crie o usuário gestor (e-mail/senha).
3. Crie o perfil ligando o usuário à organização:
   ```sql
   insert into profiles (id, org_id, full_name, role)
   values ('<uuid-do-usuario>', '<org_id>', 'Gestor', 'OWNER');
   ```
4. Copie a `enrollment_key` da organização (o `seed.sql` a imprime, ou:
   `select enrollment_key from organizations;`).

Anote: **URL do projeto**, **anon key** e **enrollment_key**.

---

## 2. Dashboard (Vercel)

```bash
cd dashboard
npm install
cp .env.example .env.local   # preencha URL + anon key
npm run dev                  # teste local em http://localhost:3000
```

Deploy: importe na Vercel, **Root Directory = `dashboard`**, configure
`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`, e faça o deploy.
Entre com o usuário gestor criado no passo anterior.

---

## 3. Agente (estações Windows)

```bat
cd agente\implantacao
publicar.bat
```

Edite `agente\publicado\appsettings.json` com **UrlSupabase**, **ChaveAnonima** e
**ChaveMatricula** (a enrollment_key). Depois, como Administrador:

```bat
cd agente\publicado
install_service.bat
```

Verifique:

- Serviço `TelemetriaProdutividade` em execução (`sc query TelemetriaProdutividade`).
- Ícone de bandeja aparece na sessão do usuário (balão informativo no primeiro logon).
- Após ~1 min, há linhas em `C:\ProgramData\TelemetriaProdutividade\telemetry.db`.
- Após a primeira janela de sync, o dispositivo aparece em **Dispositivos** no dashboard.

### Implantação em frota

Empurre `C:\ProgramData\TelemetriaProdutividade\configuracao.json` por GPO/MDM com as
chaves e políticas (janela de coleta, intervalo de sync). Ele sobrepõe o
`appsettings.json` sem recompilar. Distribua os binários por SCCM/Intune executando o
`install_service.bat` com privilégio de sistema.

---

## Conformidade antes de ligar

Rode o checklist de [CONFORMIDADE-LGPD.md](CONFORMIDADE-LGPD.md) e entregue o
[termo de ciência](termo-ciencia-monitoramento.md) aos colaboradores.

---

## Solução de problemas

| Sintoma | Causa provável | Ação |
|---|---|---|
| Dispositivo não aparece | Chaves erradas no `appsettings.json` | Confira URL/anon/matrícula; veja `logs\servico.log` |
| Timeline não atualiza sozinha | Replicação de `activity_logs` desligada | Habilite em Database > Replication |
| Sem ícone de bandeja | Coletor não subiu na sessão | Veja `logs\coletor.log`; confirme sessão ativa |
| 401 na ingestão | Token de dispositivo revogado | O agente refaz matrícula sozinho; confira a enrollment_key |
| Nada coletado fora do horário | Janela de coleta configurada | Ajuste `JanelaColetaInicio/Fim` |
