-- ============================================================================
--  0015 — "Online" volta a significar alguma coisa
--
--  Defeito encontrado com o agente rodando de verdade (03/09/2026): a estação
--  aparecia offline 45 de cada 60 minutos com a pessoa trabalhando o tempo
--  todo. Não era intermitência — era aritmética:
--
--      marcar_dispositivos_offline() derrubava quem passasse 15 min sem
--      sincronizar, e o agente sincronizava a cada 60 min (o padrão dele).
--
--  Quinze é menor que sessenta, então toda estação passava a maior parte da
--  hora marcada como offline. Isso contaminava a página Dispositivos, o LED de
--  presença e, principalmente, a linha do tempo que promete mostrar "quem está
--  fazendo o quê agora".
--
--  Correção em duas pontas. Aqui, o limiar deixa de ser fixo e passa a derivar
--  do intervalo que CADA empresa configurou: quem sincroniza de 5 em 5 min é
--  cobrado em minutos, quem escolheu 60 (site com internet ruim) é cobrado em
--  horas. Do outro lado, no agente, o padrão caiu de 60 para 5 minutos.
--
--  O fator 2,5 dá margem para uma sincronização perdida sem acusar queda: só
--  cai quem falhou duas seguidas. O piso de 10 minutos evita que uma empresa
--  com intervalo de 1 minuto veja a frota piscando por causa de uma perda de
--  pacote.
-- ============================================================================

create or replace function marcar_dispositivos_offline()
returns void
language sql
security definer
set search_path = public
as $$
    update devices d
       set status_online = false
      from organizations o
     where o.id = d.org_id
       and d.status_online = true
       and (
             d.last_sync_at is null
          or d.last_sync_at < now() - make_interval(
                 mins => greatest(
                     10,
                     -- 5 = padrão compilado no agente (OpcoesAgente.cs). Se um
                     -- dia mudar lá, muda aqui: são os dois lados do mesmo trato.
                     ceil(coalesce(o.sync_interval_minutes, 5) * 2.5)::int
                 ))
           );
$$;

comment on function marcar_dispositivos_offline is
    'Derruba para offline quem perdeu ~2 sincronizações seguidas, medido pelo intervalo configurado da própria empresa (piso de 10 min). Antes eram 15 minutos fixos contra um agente que sincronizava de hora em hora.';
