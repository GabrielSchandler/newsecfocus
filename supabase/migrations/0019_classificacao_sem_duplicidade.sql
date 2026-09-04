-- ============================================================================
--  0019 — Um minuto, uma classificação
--
--  BUG ENCONTRADO OLHANDO O PAINEL (04/09/2026)
--
--  O gráfico mostrava 1h25 de atividade dentro de uma janela de 1 hora. Não era
--  erro de desenho: o agregado daquela hora dizia 85 minutos onde o dado cru
--  tinha 58.
--
--  A causa está no join de classificação. Um minuto de navegador casa com DUAS
--  regras ao mesmo tempo — uma por processo (chrome.exe) e outra por domínio
--  (chatgpt.com) — e o LEFT JOIN devolvia as duas linhas. Aquele minuto passava
--  a valer dois no agregado.
--
--  Medido antes da correção, nesta base: 323 minutos contados em dobro de 821
--  classificados; o agregado somava 1180 minutos onde a realidade eram 857.
--  Inflação de 38% em tudo que desce daqui — tempo total, aderência à jornada,
--  horas extras.
--
--  E havia um estrago pior que inflar total: quando as duas regras discordavam
--  (chrome.exe produtivo, chatgpt.com neutro), o MESMO minuto entrava nas duas
--  categorias e corrompia o índice de produtividade — o número que o cliente
--  compra.
--
--  A CORREÇÃO
--
--  Escolher exatamente UMA regra por minuto, com precedência para o domínio.
--  Estar em chatgpt.com diz mais do que "usando um navegador", e é a mesma
--  convenção que o resto do sistema já seguia sem estar escrita: o alvo
--  agregado sempre foi coalesce(domínio, processo).
--
--  O desempate por created_at existe para a consolidação continuar idempotente:
--  se duas regras de mesma especificidade casarem, rodar duas vezes tem de dar
--  o mesmo resultado.
-- ============================================================================

create or replace function classificar_atividade(p_inicio timestamptz, p_fim timestamptz)
returns table (
    org_id      uuid,
    employee_id uuid,
    device_id   uuid,
    hora        timestamptz,
    alvo        text,
    tipo        categoria_produtividade,
    estado      text,
    keystrokes_count   int,
    mouse_clicks_count int,
    scroll_count       int,
    active_seconds     int
)
language sql
stable
as $$
    select
        l.org_id,
        l.employee_id,
        l.device_id,
        date_trunc('hour', l."timestamp" at time zone o.fuso) at time zone o.fuso,
        coalesce(nullif(l.domain, ''), l.process_name) as alvo,
        c.type,
        case
            when l.is_locked then 'BLOQUEADO'
            when l.is_idle   then 'OCIOSO'
            else 'ATIVO'
        end,
        l.keystrokes_count,
        l.mouse_clicks_count,
        l.scroll_count,
        l.active_seconds
      from activity_logs l
      join organizations o on o.id = l.org_id
      -- LATERAL com LIMIT 1: garante uma linha de saída por minuto, aconteça o
      -- que acontecer nas regras. Era exatamente isto que faltava.
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
               -- Domínio primeiro: é a regra mais específica.
               (m.domain is not null and l.domain is not null
                    and lower(m.domain) = lower(l.domain)) desc,
               m.created_at,
               m.id
           limit 1
      ) regra on true
      left join productivity_categories c on c.id = regra.category_id
     where l."timestamp" >= p_inicio
       and l."timestamp" <  p_fim
       and l.employee_id is not null;
$$;

comment on function classificar_atividade is
    'Fonte única da classificação: UMA linha por minuto registrado, com a regra mais específica (domínio vence processo). O LATERAL com LIMIT 1 é o que impede um minuto de navegador casar com regra de processo e de domínio ao mesmo tempo e ser contado duas vezes.';
