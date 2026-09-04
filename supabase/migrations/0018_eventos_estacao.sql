-- ============================================================================
--  0018 — Ciclo de vida da estação: por que a coleta parou
--
--  Achado ao olhar dados reais (04/09/2026): o painel não distingue MÁQUINA
--  DESLIGADA, MÁQUINA DORMINDO, AGENTE QUEBRADO e AGENTE DESINSTALADO — as
--  quatro produzem exatamente o mesmo silêncio. Um buraco de 907 minutos entre
--  18:09 e 09:16 é obviamente a noite; um de 39 minutos no meio da tarde não
--  se explica sozinho.
--
--  Isso tem consequência comercial direta: a aderência à jornada pune quem
--  estava com a máquina desligada igual a quem estava presente sem produzir, e
--  o alerta de "estação parada" não sabe separar férias de agente morto.
--
--  Tabela separada de propósito. Gravar estes marcos em activity_logs seria
--  mais fácil e estaria errado: aquela tabela alimenta os agregados de
--  produtividade, e um registro de "suspensa" viraria um minuto de atividade.
--  Aqui não há minuto, há instante — é diário de bordo, não medição.
-- ============================================================================

do $$
begin
    if not exists (select 1 from pg_type where typname = 'tipo_evento_estacao') then
        create type tipo_evento_estacao as enum (
            'AGENTE_INICIADO',   -- serviço subiu (boot, reinstalação ou atualização)
            'AGENTE_PARADO',     -- serviço encerrou de forma limpa
            'SUSPENSA',          -- máquina entrou em suspensão/hibernação
            'RETOMADA',          -- voltou da suspensão
            'DESLIGANDO'         -- Windows avisou que vai encerrar a sessão
        );
    end if;
end$$;

create table if not exists eventos_estacao (
    id         bigint generated always as identity primary key,
    org_id     uuid not null references organizations(id) on delete cascade,
    device_id  uuid not null references devices(id) on delete cascade,
    tipo       tipo_evento_estacao not null,
    momento    timestamptz not null,
    -- Versão do agente no instante do evento: é o que liga um "AGENTE_INICIADO"
    -- a uma atualização automática que acabou de acontecer.
    versao     text,
    detalhe    text,
    criado_em  timestamptz not null default now(),

    -- A estação reenvia o buffer inteiro quando um lote falha pela metade.
    -- Sem isto, cada retentativa duplicaria o diário de bordo.
    unique (device_id, tipo, momento)
);

create index if not exists idx_eventos_org_momento on eventos_estacao(org_id, momento desc);
create index if not exists idx_eventos_device on eventos_estacao(device_id, momento desc);

comment on table eventos_estacao is
    'Diário de bordo da estação: quando o agente subiu, parou, e quando a máquina dormiu ou acordou. Serve para explicar buracos na coleta — não entra em nenhum cálculo de produtividade.';

-- ----------------------------------------------------------------------------
--  RLS: mesma regra do resto — a empresa vê o que é dela, a plataforma vê tudo
-- ----------------------------------------------------------------------------
alter table eventos_estacao enable row level security;

drop policy if exists eventos_select on eventos_estacao;
create policy eventos_select on eventos_estacao
    for select using (org_id = auth_org_id() or eh_admin_plataforma());

-- Escrita só pela Edge Function (service_role), como activity_logs.

-- ----------------------------------------------------------------------------
--  Buracos na coleta, já explicados quando dá para explicar
--
--  Devolve cada intervalo sem registro acima do corte, dizendo o que o diário
--  de bordo tem a respeito. É o que transforma "sumiu" em "estava dormindo".
-- ----------------------------------------------------------------------------
create or replace function painel_lacunas_coleta(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_org         uuid default null,
    p_minutos_min int  default 15
)
returns table (
    device_id     uuid,
    machine_name  text,
    inicio        timestamptz,
    fim           timestamptz,
    minutos       int,
    explicacao    text
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id),
    seq as (
        select
            l.device_id,
            l."timestamp" as momento,
            lag(l."timestamp") over (partition by l.device_id order by l."timestamp") as anterior
          from activity_logs l
          cross join a
         where l.org_id = a.org_id
           and l."timestamp" >= p_inicio
           and l."timestamp" <  p_fim
    ),
    lacunas as (
        select device_id, anterior as inicio, momento as fim,
               (extract(epoch from (momento - anterior)) / 60)::int as minutos
          from seq
         where anterior is not null
           and momento - anterior > make_interval(mins => p_minutos_min)
    )
    select
        g.device_id,
        d.machine_name,
        g.inicio,
        g.fim,
        g.minutos,
        -- A explicação sai do que o diário registrou DENTRO do buraco.
        coalesce(
            (select string_agg(distinct
                        case e.tipo
                            when 'SUSPENSA'        then 'máquina suspensa'
                            when 'RETOMADA'        then 'retomada'
                            when 'DESLIGANDO'      then 'desligada pelo usuário'
                            when 'AGENTE_PARADO'   then 'agente encerrado'
                            when 'AGENTE_INICIADO' then 'agente reiniciado'
                        end, ', ')
               from eventos_estacao e
              where e.device_id = g.device_id
                and e.momento >= g.inicio
                and e.momento <= g.fim),
            'sem explicação registrada')
      from lacunas g
      join devices d on d.id = g.device_id
     order by g.inicio desc;
$$;

comment on function painel_lacunas_coleta is
    'Intervalos sem coleta e o que o diário de bordo diz sobre eles. "sem explicação registrada" é o caso que merece atenção — os outros são máquina desligada ou dormindo, que é normal.';
