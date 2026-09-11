-- ============================================================================
--  0024 — Linha do tempo do dia (estado minuto a minuto)
--
--  O gestor pediu uma faixa que mostre, ao longo do dia, se a estação estava
--  LIGADA (produtivo / neutro / improdutivo), OCIOSA, BLOQUEADA ou DESLIGADA.
--
--  A classificar_atividade só devolve por HORA — não serve para desenhar a
--  faixa. Esta função lê o minuto a minuto de activity_logs, decide um estado
--  por minuto e junta minutos iguais e contíguos em SEGMENTOS (gaps-and-islands),
--  para o payload ficar pequeno (dezenas de segmentos por dia, não 1440 linhas).
--
--  O estado "DESLIGADO / sem dado" NÃO vem daqui: é a ausência de minuto. Quem
--  desenha a faixa preenche visualmente os buracos entre os segmentos do dia —
--  assim não é preciso gerar uma série de minutos no banco.
--
--  Escopo de UMA entidade (uma pessoa OU uma estação): a faixa é individual. Sem
--  colaborador nem dispositivo, devolve vazio — uma faixa somando várias pessoas
--  não teria sentido (várias podem estar ativas no mesmo minuto).
--
--  Sem SECURITY DEFINER: roda como o usuário, então a RLS de activity_logs
--  (cada empresa vê o que é seu) continua valendo.
-- ============================================================================

create or replace function painel_linha_do_tempo(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_colaborador uuid default null,
    p_dispositivo uuid default null
)
returns table (
    dia     date,
    inicio  timestamptz,
    fim     timestamptz,
    estado  text,
    minutos int
)
language sql
stable
as $$
    with alvo as (
        -- Fuso da empresa dona da entidade escolhida, para cortar o dia certo.
        select coalesce(
                 (select o.fuso from organizations o
                    join employees e on e.org_id = o.id where e.id = p_colaborador),
                 (select o.fuso from organizations o
                    join devices d on d.org_id = o.id where d.id = p_dispositivo)
               ) as fuso
    ),
    -- Um estado por minuto. DISTINCT ON resolve o caso raro de dois processos
    -- no mesmo minuto: prioriza o minuto ATIVO e classificado.
    base as (
        select distinct on (date_trunc('minute', l."timestamp"))
            date_trunc('minute', l."timestamp") as minuto,
            case
                when l.is_locked then 'BLOQUEADO'
                when l.is_idle   then 'OCIOSO'
                when c.type = 'PRODUCTIVE'   then 'PRODUTIVO'
                when c.type = 'NEUTRAL'      then 'NEUTRO'
                when c.type = 'UNPRODUCTIVE' then 'IMPRODUTIVO'
                else 'SEM'
            end as estado
          from activity_logs l
          left join lateral (
              select m.category_id
                from app_mappings m
               where m.org_id = l.org_id
                 and (
                       (m.domain is not null and l.domain is not null
                            and lower(m.domain) = lower(l.domain))
                    or (m.process_name is not null
                            and lower(m.process_name) = lower(l.process_name))
                     )
               order by
                   (m.domain is not null and l.domain is not null
                        and lower(m.domain) = lower(l.domain)) desc,
                   m.created_at, m.id
               limit 1
          ) regra on true
          left join productivity_categories c on c.id = regra.category_id
         where l."timestamp" >= p_inicio
           and l."timestamp" <  p_fim
           and (p_colaborador is not null or p_dispositivo is not null)
           and (p_colaborador is null or l.employee_id = p_colaborador)
           and (p_dispositivo is null or l.device_id  = p_dispositivo)
         order by
             date_trunc('minute', l."timestamp"),
             l.is_locked asc, l.is_idle asc, (c.type is null) asc
    ),
    -- Quebra um segmento novo quando o estado muda OU há um buraco de tempo
    -- (minuto que não é o seguinte do anterior) — o buraco é máquina desligada.
    marcado as (
        select minuto, estado,
               case
                   when lag(minuto) over (order by minuto) is null
                     or minuto - lag(minuto) over (order by minuto) > interval '1 minute'
                     or estado <> lag(estado) over (order by minuto)
                   then 1 else 0
               end as novo
          from base
    ),
    grupos as (
        select minuto, estado, sum(novo) over (order by minuto) as grupo
          from marcado
    ),
    segmentos as (
        select min(estado)  as estado,
               min(minuto)  as inicio,
               max(minuto) + interval '1 minute' as fim,
               count(*)::int as minutos
          from grupos
         group by grupo
    )
    select (s.inicio at time zone a.fuso)::date as dia,
           s.inicio, s.fim, s.estado, s.minutos
      from segmentos s
      cross join alvo a
     order by s.inicio;
$$;

comment on function painel_linha_do_tempo is
    'Linha do tempo do dia de UMA pessoa ou estação: segmentos contíguos de estado (produtivo/neutro/improdutivo/ocioso/bloqueado). Buracos entre segmentos são a máquina desligada e são preenchidos por quem desenha. Não entra em cálculo de produtividade.';
