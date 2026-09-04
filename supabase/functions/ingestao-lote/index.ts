// ============================================================================
//  Edge Function: ingestao-lote
//  Recebe um lote de registros de atividade de um agente autenticado por token de
//  dispositivo (Authorization: Bearer). Insere em activity_logs com deduplicação
//  por (device_id, timestamp, process_name) — reenvios após queda de rede não
//  duplicam dado. Responde com a contagem aceita e o intervalo de sync do servidor.
//
//  Além de gravar, esta função RESOLVE A PESSOA: cada registro traz o usuário do
//  Windows, e aqui ele vira um colaborador (employees) da empresa. É o que liga
//  a atividade à hierarquia empresa → equipe → pessoa, em vez de parar na máquina.
// ============================================================================
import {
  clienteAdministrativo,
  cabecalhosCors,
  erro,
  hashToken,
  json,
  tokenDoCabecalho,
} from "../_shared/comum.ts";

interface RegistroEntrada {
  timestamp: string;
  process_name: string;
  window_title?: string;
  domain?: string | null;
  is_idle?: boolean;
  is_locked?: boolean;
  keystrokes_count?: number;
  mouse_clicks_count?: number;
  scroll_count?: number;
  active_seconds?: number;
  foreground_seconds?: number;
  os_user?: string;
}

interface EventoEntrada {
  tipo?: string;
  momento?: string;
  versao?: string;
  detalhe?: string;
}

interface LoteEntrada {
  agent_version?: string;
  sent_at?: string;
  logs: RegistroEntrada[];
  /** Diário de bordo da estação — opcional: agente antigo não manda. */
  eventos?: EventoEntrada[];
}

/** Espelha o enum tipo_evento_estacao. Tipo desconhecido é descartado. */
const TIPOS_EVENTO = new Set([
  "AGENTE_INICIADO", "AGENTE_PARADO", "SUSPENSA", "RETOMADA", "DESLIGANDO",
]);

const LIMITE_LOTE = 500; // Trava de segurança contra payload gigante.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cabecalhosCors });
  }
  if (req.method !== "POST") {
    return erro("Método não suportado.", 405);
  }

  const token = tokenDoCabecalho(req);
  if (!token) return erro("Token de dispositivo ausente.", 401);

  let lote: LoteEntrada;
  try {
    lote = await req.json();
  } catch {
    return erro("JSON inválido.");
  }

  if (!Array.isArray(lote.logs) || lote.logs.length === 0) {
    return erro("Lote vazio.");
  }
  if (lote.logs.length > LIMITE_LOTE) {
    return erro(`Lote acima do limite de ${LIMITE_LOTE} registros.`, 413);
  }

  const supabase = clienteAdministrativo();

  // 1. Autentica o dispositivo pelo hash do token.
  const token_hash = await hashToken(token);
  const { data: dispositivo, error: erroDisp } = await supabase
    .from("devices")
    .select("id, org_id")
    .eq("token_hash", token_hash)
    .maybeSingle();

  if (erroDisp) return erro("Falha ao autenticar o dispositivo.", 500);
  if (!dispositivo) return erro("Token de dispositivo inválido.", 401);

  // 2. Resolve o colaborador de cada usuário do SO presente no lote.
  //    Um lote costuma ter 1 usuário; no máximo alguns numa estação
  //    compartilhada. Por isso resolvemos por usuário distinto, não por registro.
  const usuarios = [...new Set(lote.logs.map((r) => (r.os_user ?? "").trim()))];
  const porUsuario = new Map<string, string>();

  for (const usuario of usuarios) {
    const { data: colaboradorId, error: erroColab } = await supabase.rpc(
      "resolver_colaborador",
      { p_org: dispositivo.org_id, p_os_user: usuario },
    );
    if (erroColab) {
      return erro(`Falha ao resolver o colaborador: ${erroColab.message}`, 500);
    }
    porUsuario.set(usuario, colaboradorId as string);
  }

  // 3. Normaliza os registros, carimbando org_id, device_id e employee_id no
  //    servidor (o agente nunca decide em qual empresa nem em quem grava).
  const linhas = lote.logs.map((r) => ({
    device_id: dispositivo.id,
    org_id: dispositivo.org_id,
    employee_id: porUsuario.get((r.os_user ?? "").trim()) ?? null,
    timestamp: r.timestamp,
    process_name: (r.process_name ?? "desconhecido").slice(0, 260),
    window_title: (r.window_title ?? "").slice(0, 260),
    domain: r.domain ?? null,
    is_idle: !!r.is_idle,
    is_locked: !!r.is_locked,
    keystrokes_count: inteiroSeguro(r.keystrokes_count),
    mouse_clicks_count: inteiroSeguro(r.mouse_clicks_count),
    scroll_count: inteiroSeguro(r.scroll_count),
    active_seconds: limitar(inteiroSeguro(r.active_seconds), 0, 60),
    foreground_seconds: limitar(inteiroSeguro(r.foreground_seconds), 0, 60),
    os_user: r.os_user ?? null,
  }));

  // 4. Upsert com ignore de duplicados. O count total nos diz quantos já existiam.
  const { data: inseridos, error: erroInsert } = await supabase
    .from("activity_logs")
    .upsert(linhas, {
      onConflict: "device_id,timestamp,process_name",
      ignoreDuplicates: true,
    })
    .select("id");

  if (erroInsert) {
    return erro(`Falha ao gravar o lote: ${erroInsert.message}`, 500);
  }

  const aceitos = inseridos?.length ?? 0;
  const duplicados = linhas.length - aceitos;

  // 4b. Diário de bordo, se veio. Falha aqui não derruba o lote: perder um
  // marco de suspensão é chato, perder a telemetria do dia é grave.
  if (Array.isArray(lote.eventos) && lote.eventos.length > 0) {
    const eventos = lote.eventos
      .filter((e) => e.tipo && TIPOS_EVENTO.has(e.tipo) && e.momento)
      .slice(0, 200)
      .map((e) => ({
        org_id: dispositivo.org_id,
        device_id: dispositivo.id,
        tipo: e.tipo,
        momento: e.momento,
        versao: e.versao ?? null,
        detalhe: e.detalhe ?? null,
      }));

    if (eventos.length > 0) {
      const { error: erroEventos } = await supabase
        .from("eventos_estacao")
        .upsert(eventos, { onConflict: "device_id,tipo,momento", ignoreDuplicates: true });

      if (erroEventos) {
        console.error("Falha ao gravar eventos da estacao:", erroEventos.message);
      }
    }
  }

  // 5. Marca o dispositivo online e busca a configuração remota da empresa.
  await supabase
    .from("devices")
    .update({
      status_online: true,
      last_sync_at: new Date().toISOString(),
      agent_version: lote.agent_version ?? null,
    })
    .eq("id", dispositivo.id);

  const { data: org } = await supabase
    .from("organizations")
    .select("sync_interval_minutes, status")
    .eq("id", dispositivo.org_id)
    .maybeSingle();

  // Conta suspensa ou cancelada: o agente para de coletar até a regularização.
  const contaAtiva = org?.status !== "SUSPENSA" && org?.status !== "CANCELADA";

  // Configuração remota: é o que permite mudar como a frota coleta e envia sem
  // visitar máquina por máquina. O agente compara a assinatura com a que já
  // aplicou e só regrava o arquivo local quando mudou de fato.
  const { data: configuracao } = await supabase.rpc("configuracao_agente", {
    p_org: dispositivo.org_id,
  });

  return json({
    accepted: aceitos,
    duplicates: duplicados,
    next_sync_minutes: org?.sync_interval_minutes ?? null,
    collection_enabled: contaAtiva,
    config: configuracao ?? null,
  });
});

function inteiroSeguro(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}
