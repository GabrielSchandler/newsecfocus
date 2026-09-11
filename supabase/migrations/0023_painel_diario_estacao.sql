-- ============================================================================
--  0023 — Linha do tempo da estação para o painel
--
--  A 0018 já guardava os marcos do ciclo de vida (eventos_estacao), mas eles só
--  eram usados por dentro, para EXPLICAR buracos na coleta (painel_lacunas_coleta).
--  Nunca havia como o gestor simplesmente VER "às 08:12 ligou, às 12:03 bloqueou,
--  às 12:47 desbloqueou, às 18:30 desligou".
--
--  Esta função devolve esses eventos crus, do mais recente para o mais antigo,
--  para a tela de Dispositivos montar a linha do tempo. Não agrega nada: é
--  diário de bordo, não medição.
--
--  Sem SECURITY DEFINER de propósito: roda como o usuário, então a RLS de
--  eventos_estacao (cada empresa vê o que é dela) continua valendo. org_em_foco
--  resolve a empresa do usuário — ou a escolhida, quando é admin da plataforma.
-- ============================================================================

create or replace function painel_diario_estacao(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_org         uuid default null,
    p_dispositivo uuid default null,
    p_limite      int  default 500
)
returns table (
    id           bigint,
    device_id    uuid,
    machine_name text,
    tipo         tipo_evento_estacao,
    momento      timestamptz,
    versao       text
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id)
    select e.id, e.device_id, d.machine_name, e.tipo, e.momento, e.versao
      from eventos_estacao e
      join devices d on d.id = e.device_id
      cross join a
     where e.org_id = a.org_id
       and (p_dispositivo is null or e.device_id = p_dispositivo)
       and e.momento >= p_inicio
       and e.momento <  p_fim
     order by e.momento desc
     limit greatest(1, least(p_limite, 2000));
$$;

comment on function painel_diario_estacao is
    'Linha do tempo da estação: ligar, parar, suspender, retomar, bloquear, desbloquear e desligar, do mais recente ao mais antigo. Alimenta a tela de Dispositivos. Não entra em cálculo de produtividade.';
