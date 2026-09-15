-- ============================================================================
--  0027 — Escala de expediente em cascata (empresa → equipe → pessoa)
--
--  POR QUE ISSO EXISTE
--
--  Até aqui a jornada era um número solto: `jornada_padrao_minutos` na empresa e
--  `jornada_minutos_dia` na pessoa, mais uma hora de início/fim usada só por
--  horas extras. Não havia dia da semana, não havia equipe e não havia intervalo.
--  Com isso não dá para responder a pergunta que o gestor faz: "do expediente de
--  hoje ATÉ AGORA, quanto virou trabalho?".
--
--  Agora a escala é uma tabela: por dia da semana, com hora de início, hora de
--  fim e janela de intervalo (almoço). Ela é resolvida em cascata:
--
--      PESSOA  →  EQUIPE  →  EMPRESA  →  padrão (seg–sex 08:00–18:00, almoço 12–13)
--
--  A regra é "nível mais específico que tiver QUALQUER linha vence, inteiro".
--  Personalizar uma pessoa define a semana dela toda — não se mistura metade da
--  escala da equipe com metade da pessoa, que seria impossível de explicar a
--  quem configura.
--
--  O intervalo é uma JANELA (12:00–13:00), não uma duração. Sem saber ONDE ele
--  cai, não dá para calcular "expediente decorrido às 11h" — e é justamente
--  nesse número que o índice novo se apoia.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1. Auxiliares de minuto do dia
-- ----------------------------------------------------------------------------
create or replace function minutos_time(p_t time)
returns int
language sql
immutable
as $$
    select case when p_t is null then null
           else extract(hour from p_t)::int * 60 + extract(minute from p_t)::int end;
$$;

comment on function minutos_time is 'Hora do dia em minutos desde a meia-noite (08:30 → 510).';

create or replace function sobreposicao_min(a1 int, a2 int, b1 int, b2 int)
returns int
language sql
immutable
as $$
    select case
        when a1 is null or a2 is null or b1 is null or b2 is null then 0
        else greatest(0, least(a2, b2) - greatest(a1, b1))
    end;
$$;

comment on function sobreposicao_min is 'Minutos em que duas faixas do dia se sobrepõem. Zero quando não se cruzam ou quando alguma é nula.';

-- ----------------------------------------------------------------------------
--  2. A escala
-- ----------------------------------------------------------------------------
create table if not exists escalas_expediente (
    id             uuid primary key default gen_random_uuid(),
    org_id         uuid not null references organizations(id) on delete cascade,
    escopo         text not null check (escopo in ('EMPRESA', 'EQUIPE', 'PESSOA')),
    equipe_id      uuid references teams(id) on delete cascade,
    colaborador_id uuid references employees(id) on delete cascade,

    -- isodow: 1 = segunda ... 7 = domingo.
    dia_semana     smallint not null check (dia_semana between 1 and 7),
    trabalha       boolean not null default true,
    inicio         time not null default '08:00',
    fim            time not null default '18:00',
    -- Janela do intervalo. Nula = sem intervalo descontado.
    intervalo_inicio time,
    intervalo_fim    time,

    criado_em      timestamptz not null default now(),
    atualizado_em  timestamptz not null default now(),

    -- Coerência: cada escopo aponta para o alvo certo, e só para ele.
    constraint escala_alvo_coerente check (
        (escopo = 'EMPRESA' and equipe_id is null and colaborador_id is null)
     or (escopo = 'EQUIPE'  and equipe_id is not null and colaborador_id is null)
     or (escopo = 'PESSOA'  and equipe_id is null and colaborador_id is not null)
    ),
    constraint escala_horario_coerente check (fim > inicio),
    constraint escala_intervalo_coerente check (
        (intervalo_inicio is null and intervalo_fim is null)
     or (intervalo_inicio is not null and intervalo_fim is not null
         and intervalo_fim > intervalo_inicio
         and intervalo_inicio >= inicio and intervalo_fim <= fim)
    )
);

-- Um dia da semana por alvo. Índices parciais porque a chave muda com o escopo.
create unique index if not exists idx_escala_empresa
    on escalas_expediente (org_id, dia_semana) where escopo = 'EMPRESA';
create unique index if not exists idx_escala_equipe
    on escalas_expediente (equipe_id, dia_semana) where escopo = 'EQUIPE';
create unique index if not exists idx_escala_pessoa
    on escalas_expediente (colaborador_id, dia_semana) where escopo = 'PESSOA';

comment on table escalas_expediente is
    'Escala de expediente por dia da semana, resolvida em cascata pessoa → equipe → empresa. O nível mais específico que tiver qualquer linha vence a semana inteira.';

alter table escalas_expediente enable row level security;

drop policy if exists escala_select on escalas_expediente;
create policy escala_select on escalas_expediente
    for select using (org_id = auth_org_id() or eh_admin_plataforma());

drop policy if exists escala_escrita on escalas_expediente;
create policy escala_escrita on escalas_expediente
    for all using (org_id = auth_org_id() and auth_papel() in ('OWNER', 'MANAGER'))
    with check (org_id = auth_org_id() and auth_papel() in ('OWNER', 'MANAGER'));

-- ----------------------------------------------------------------------------
--  3. Semente: a empresa começa com a escala que já estava implícita
--
--  Usa a janela de jornada que existia (jornada_padrao_hora_inicio/fim) quando
--  havia; senão, 08:00–18:00. O intervalo só entra quando a janela o comporta —
--  inventar almoço fora do expediente quebraria a checagem de coerência.
-- ----------------------------------------------------------------------------
insert into escalas_expediente (org_id, escopo, dia_semana, trabalha, inicio, fim, intervalo_inicio, intervalo_fim)
select
    o.id,
    'EMPRESA',
    d.dia,
    true,
    coalesce(o.jornada_padrao_hora_inicio::time, '08:00'::time),
    coalesce(o.jornada_padrao_hora_fim::time,    '18:00'::time),
    case when coalesce(o.jornada_padrao_hora_inicio::time, '08:00'::time) <= '12:00'::time
          and coalesce(o.jornada_padrao_hora_fim::time,    '18:00'::time) >= '13:00'::time
         then '12:00'::time end,
    case when coalesce(o.jornada_padrao_hora_inicio::time, '08:00'::time) <= '12:00'::time
          and coalesce(o.jornada_padrao_hora_fim::time,    '18:00'::time) >= '13:00'::time
         then '13:00'::time end
  from organizations o
  cross join (select generate_series(1, 5) as dia) d
 where not exists (
     select 1 from escalas_expediente x where x.org_id = o.id and x.escopo = 'EMPRESA'
 );

-- ----------------------------------------------------------------------------
--  4. Resolução da cascata
-- ----------------------------------------------------------------------------
create or replace function expediente_do_dia(p_colaborador uuid, p_dia date)
returns table (
    trabalha         boolean,
    inicio           time,
    fim              time,
    intervalo_inicio time,
    intervalo_fim    time,
    origem           text
)
language plpgsql
stable
as $$
declare
    v_org    uuid;
    v_equipe uuid;
    v_dow    smallint := extract(isodow from p_dia)::smallint;
    v_nivel  text;
begin
    select e.org_id, e.team_id into v_org, v_equipe from employees e where e.id = p_colaborador;
    if v_org is null then
        return; -- colaborador inexistente: sem expediente, sem chute
    end if;

    -- Nível mais específico que tem qualquer linha.
    if exists (select 1 from escalas_expediente x
                where x.escopo = 'PESSOA' and x.colaborador_id = p_colaborador) then
        v_nivel := 'PESSOA';
    elsif v_equipe is not null and exists (select 1 from escalas_expediente x
                where x.escopo = 'EQUIPE' and x.equipe_id = v_equipe) then
        v_nivel := 'EQUIPE';
    elsif exists (select 1 from escalas_expediente x
                where x.escopo = 'EMPRESA' and x.org_id = v_org) then
        v_nivel := 'EMPRESA';
    else
        v_nivel := 'PADRAO';
    end if;

    if v_nivel = 'PADRAO' then
        -- Sem nada configurado: seg–sex 08:00–18:00 com almoço 12:00–13:00.
        return query select
            v_dow between 1 and 5,
            '08:00'::time, '18:00'::time,
            case when v_dow between 1 and 5 then '12:00'::time end,
            case when v_dow between 1 and 5 then '13:00'::time end,
            'PADRAO'::text;
        return;
    end if;

    return query
    select coalesce(x.trabalha, false),
           coalesce(x.inicio, '08:00'::time),
           coalesce(x.fim, '18:00'::time),
           x.intervalo_inicio,
           x.intervalo_fim,
           v_nivel
      from (select 1) u
      left join escalas_expediente x
             on x.dia_semana = v_dow
            and ((v_nivel = 'PESSOA'  and x.escopo = 'PESSOA'  and x.colaborador_id = p_colaborador)
              or (v_nivel = 'EQUIPE'  and x.escopo = 'EQUIPE'  and x.equipe_id = v_equipe)
              or (v_nivel = 'EMPRESA' and x.escopo = 'EMPRESA' and x.org_id = v_org));
end;
$$;

comment on function expediente_do_dia is
    'Expediente de uma pessoa num dia, resolvendo pessoa → equipe → empresa → padrão. Dia sem linha no nível vigente = não trabalha.';

-- ----------------------------------------------------------------------------
--  5. Expediente decorrido, em minutos
--
--  É o denominador do índice novo: do início do expediente até AGORA (ou até o
--  fim, se o dia já passou), descontando o intervalo já vencido.
-- ----------------------------------------------------------------------------
create or replace function minutos_expediente(
    p_colaborador uuid,
    p_dia         date,
    p_agora       timestamptz,
    p_fuso        text
)
returns int
language sql
stable
as $$
    with x as (select * from expediente_do_dia(p_colaborador, p_dia)),
    lim as (
        select
            x.trabalha,
            minutos_time(x.inicio) as ini,
            minutos_time(x.fim)    as fim,
            minutos_time(x.intervalo_inicio) as int_ini,
            minutos_time(x.intervalo_fim)    as int_fim,
            case
                when (p_agora at time zone p_fuso)::date > p_dia then minutos_time(x.fim)
                when (p_agora at time zone p_fuso)::date < p_dia then minutos_time(x.inicio)
                else least(minutos_time(x.fim),
                           minutos_time((p_agora at time zone p_fuso)::time))
            end as ate
          from x
    )
    select case
        when not trabalha or ate <= ini then 0
        else greatest(0, (ate - ini) - sobreposicao_min(ini, ate, int_ini, int_fim))
    end
      from lim;
$$;

comment on function minutos_expediente is
    'Minutos de expediente já decorridos no dia (até p_agora), descontando o intervalo. Dia passado devolve o expediente inteiro.';

-- ----------------------------------------------------------------------------
--  6. Produtividade contra o expediente — a métrica nova do produto
--
--  Uma linha por pessoa no recorte. O índice deixa de ser "do tempo
--  classificado, quanto foi produtivo" e passa a ser "do expediente, quanto
--  virou trabalho produtivo": máquina desligada, tela bloqueada e ociosidade
--  puxam para baixo, porque são expediente que não virou entrega.
--
--  Precisão: o tempo vem de resumo_horario (balde de hora) e é rateado pela
--  fração da hora que cai dentro do expediente. Para escalas fechadas na hora
--  — a esmagadora maioria — o rateio é exato; em escalas quebradas (08:30) o
--  erro fica limitado à hora de fronteira.
-- ----------------------------------------------------------------------------
create or replace function painel_produtividade(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_org         uuid default null,
    p_equipe      uuid default null,
    p_colaborador uuid default null
)
returns table (
    colaborador_id          uuid,
    colaborador             text,
    equipe_id               uuid,
    equipe                  text,
    minutos_expediente      bigint,
    minutos_registrados     bigint,
    minutos_produtivos      bigint,
    minutos_neutros         bigint,
    minutos_improdutivos    bigint,
    minutos_sem_classificar bigint,
    minutos_ociosos         bigint,
    minutos_bloqueado       bigint,
    minutos_desligado       bigint,
    dias_com_expediente     int,
    indice                  numeric,
    aderencia               numeric
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso),
    pessoas as (
        select e.id, coalesce(e.nome, e.os_user) as nome, e.team_id, t.nome as equipe
          from employees e
          cross join a
          left join teams t on t.id = e.team_id
         where e.org_id = a.org_id
           and (p_equipe is null or e.team_id = p_equipe)
           and (p_colaborador is null or e.id = p_colaborador)
    ),
    dias as (
        select d::date as dia
          from a, generate_series(
              (p_inicio at time zone a.fuso)::date,
              ((p_fim - interval '1 second') at time zone a.fuso)::date,
              interval '1 day'
          ) d
    ),
    -- Expediente de cada pessoa em cada dia do recorte.
    exp as (
        select p.id as employee_id,
               d.dia,
               x.trabalha,
               minutos_time(x.inicio) as ini,
               minutos_time(x.intervalo_inicio) as int_ini,
               minutos_time(x.intervalo_fim)    as int_fim,
               case
                   when (least(now(), p_fim) at time zone a.fuso)::date > d.dia then minutos_time(x.fim)
                   when (least(now(), p_fim) at time zone a.fuso)::date < d.dia then minutos_time(x.inicio)
                   else least(minutos_time(x.fim),
                              minutos_time((least(now(), p_fim) at time zone a.fuso)::time))
               end as ate
          from pessoas p
          cross join dias d
          cross join a
          cross join lateral expediente_do_dia(p.id, d.dia) x
         where x.trabalha
    ),
    expediente as (
        select employee_id, dia,
               greatest(0, (ate - ini) - sobreposicao_min(ini, ate, int_ini, int_fim)) as minutos,
               ini, ate, int_ini, int_fim
          from exp
    ),
    -- Horas registradas, rateadas pela fatia que cai dentro do expediente.
    horas as (
        select r.employee_id,
               (r.hora at time zone a.fuso)::date as dia,
               minutos_time((r.hora at time zone a.fuso)::time) as h_ini,
               r.minutos_registrados, r.minutos_ativos, r.minutos_ociosos, r.minutos_bloqueado,
               r.minutos_produtivos, r.minutos_neutros, r.minutos_improdutivos, r.minutos_sem_classificar
          from resumo_horario r
          cross join a
         where r.org_id = a.org_id
           and r.hora >= p_inicio
           and r.hora <  p_fim
           and r.employee_id in (select id from pessoas)
    ),
    rateado as (
        select h.employee_id, h.dia,
               -- Fatia da hora dentro do expediente, já sem o intervalo.
               (sobreposicao_min(h.h_ini, h.h_ini + 60, x.ini, x.ate)
                  - sobreposicao_min(greatest(h.h_ini, x.ini), least(h.h_ini + 60, x.ate), x.int_ini, x.int_fim)
               )::numeric / 60 as fator,
               h.minutos_registrados, h.minutos_ativos, h.minutos_ociosos, h.minutos_bloqueado,
               h.minutos_produtivos, h.minutos_neutros, h.minutos_improdutivos, h.minutos_sem_classificar
          from horas h
          join expediente x on x.employee_id = h.employee_id and x.dia = h.dia
    ),
    somas as (
        select employee_id,
               sum(minutos_registrados * fator)     as registrados,
               sum(minutos_produtivos * fator)      as produtivos,
               sum(minutos_neutros * fator)         as neutros,
               sum(minutos_improdutivos * fator)    as improdutivos,
               sum(minutos_sem_classificar * fator) as sem_classificar,
               sum(minutos_ociosos * fator)         as ociosos,
               sum(minutos_bloqueado * fator)       as bloqueado
          from rateado
         where fator > 0
         group by employee_id
    ),
    expediente_total as (
        select employee_id,
               sum(minutos)::bigint as minutos,
               count(*) filter (where minutos > 0)::int as dias
          from expediente
         group by employee_id
    )
    select
        p.id,
        p.nome,
        p.team_id,
        p.equipe,
        coalesce(et.minutos, 0),
        round(coalesce(s.registrados, 0))::bigint,
        round(coalesce(s.produtivos, 0))::bigint,
        round(coalesce(s.neutros, 0))::bigint,
        round(coalesce(s.improdutivos, 0))::bigint,
        round(coalesce(s.sem_classificar, 0))::bigint,
        round(coalesce(s.ociosos, 0))::bigint,
        round(coalesce(s.bloqueado, 0))::bigint,
        -- Desligado é o que sobra do expediente sem nenhum registro.
        greatest(0, coalesce(et.minutos, 0) - round(coalesce(s.registrados, 0)))::bigint,
        coalesce(et.dias, 0),
        case when coalesce(et.minutos, 0) > 0
             then round((coalesce(s.produtivos, 0) * 100.0) / et.minutos, 1)
             else null end,
        case when coalesce(et.minutos, 0) > 0
             then round((least(coalesce(s.registrados, 0), et.minutos) * 100.0) / et.minutos, 1)
             else null end
      from pessoas p
      left join expediente_total et on et.employee_id = p.id
      left join somas s on s.employee_id = p.id
     where coalesce(et.minutos, 0) > 0 or coalesce(s.registrados, 0) > 0
     order by p.nome;
$$;

comment on function painel_produtividade is
    'Produtividade medida contra o EXPEDIENTE (não contra o tempo classificado): índice = produtivo ÷ expediente decorrido; aderência = tempo com a estação ligada ÷ expediente decorrido. Desligado, bloqueado e ocioso puxam o índice para baixo. Uma linha por pessoa — o painel tira a média simples dos %.';
