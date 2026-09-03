// ============================================================================
//  Edge Function: registrar-dispositivo
//  Troca a chave de matrícula da organização por um token exclusivo da máquina.
//  Chamada uma única vez por estação (o agente guarda o token cifrado com DPAPI).
//  Deduplica por (org_id, hardware_id): reinstalar o agente não cria dispositivo novo.
// ============================================================================
import {
  clienteAdministrativo,
  cabecalhosCors,
  erro,
  gerarToken,
  hashToken,
  json,
} from "../_shared/comum.ts";

interface PedidoMatricula {
  enrollment_key: string;
  machine_name: string;
  os_user?: string;
  agent_version?: string;
  hardware_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cabecalhosCors });
  }
  if (req.method !== "POST") {
    return erro("Método não suportado.", 405);
  }

  let corpo: PedidoMatricula;
  try {
    corpo = await req.json();
  } catch {
    return erro("JSON inválido.");
  }

  if (!corpo.enrollment_key || !corpo.machine_name || !corpo.hardware_id) {
    return erro("Campos obrigatórios: enrollment_key, machine_name, hardware_id.");
  }

  const supabase = clienteAdministrativo();

  // 1. Resolve a empresa. Aceita o CÓDIGO DE INSTALAÇÃO numérico (1234-5678-9012,
  //    com ou sem hífen) ou a chave hexadecimal antiga — quem já instalou não
  //    precisa mexer em nada.
  const { data: idEmpresa, error: erroOrg } = await supabase.rpc("empresa_por_chave", {
    p_chave: corpo.enrollment_key,
  });

  if (erroOrg) return erro("Falha ao validar a matrícula.", 500);
  if (!idEmpresa) return erro("Código de instalação inválido.", 401);

  const org = { id: idEmpresa as string };

  // 2. Gera token e persiste apenas o hash.
  const token = gerarToken();
  const token_hash = await hashToken(token);
  const token_prefix = token.slice(0, 8);

  // 3. Upsert do dispositivo por (org_id, hardware_id).
  const { data: dispositivo, error: erroUpsert } = await supabase
    .from("devices")
    .upsert(
      {
        org_id: org.id,
        machine_name: corpo.machine_name,
        os_user: corpo.os_user ?? null,
        hardware_id: corpo.hardware_id,
        agent_version: corpo.agent_version ?? null,
        token_hash,
        token_prefix,
        status_online: true,
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "org_id,hardware_id" },
    )
    .select("id")
    .single();

  if (erroUpsert || !dispositivo) {
    return erro("Não foi possível registrar o dispositivo.", 500);
  }

  // O agente recém-matriculado já sai com a configuração da empresa, sem
  // precisar esperar a primeira sincronização.
  const { data: configuracao } = await supabase.rpc("configuracao_agente", {
    p_org: org.id,
  });

  return json(
    {
      device_id: dispositivo.id,
      device_token: token,
      config: configuracao ?? null,
    },
    200,
  );
});
