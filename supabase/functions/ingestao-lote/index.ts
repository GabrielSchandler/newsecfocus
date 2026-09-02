// ============================================================================
//  Edge Function: ingestao-lote
//  Recebe um lote de registros de atividade de um agente autenticado por token de
//  dispositivo (Authorization: Bearer). Insere em activity_logs com deduplicação
//  por (device_id, timestamp, process_name) — reenvios após queda de rede não
//  duplicam dado. Responde com a contagem aceita e o intervalo de sync do servidor.
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

interface LoteEntrada {
  agent_version?: string;
  sent_at?: string;
  logs: RegistroEntrada[];
}

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

  // 2. Normaliza os registros, carimbando org_id e device_id no servidor
  //    (o agente nunca decide em qual org grava).
  const linhas = lote.logs.map((r) => ({
    device_id: dispositivo.id,
    org_id: dispositivo.org_id,
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

  // 3. Upsert com ignore de duplicados. O count total nos diz quantos já existiam.
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

  // 4. Marca o dispositivo online e busca o intervalo de sync da organização.
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
    .select("sync_interval_minutes")
    .eq("id", dispositivo.org_id)
    .maybeSingle();

  return json({
    accepted: aceitos,
    duplicates: duplicados,
    next_sync_minutes: org?.sync_interval_minutes ?? null,
  });
});

function inteiroSeguro(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}
