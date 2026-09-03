// ============================================================================
//  Edge Function: validar-codigo
//
//  Confere se um código de instalação (ou a chave hexadecimal antiga) resolve
//  para uma empresa, SEM matricular nada. Só para o instalador mostrar
//  "✓ Código válido — Empresa: Contoso Ltda" antes de seguir.
//
//  Não expõe nada sensível: devolve só nome e situação da conta. Se a
//  chamada falhar (função ainda não publicada, sem internet), o instalador
//  segue sem validar — a matrícula de verdade acontece no primeiro boot do
//  serviço e é ali que o código realmente é conferido contra o banco.
// ============================================================================
import { cabecalhosCors, clienteAdministrativo, erro, json } from "../_shared/comum.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cabecalhosCors });
  }
  if (req.method !== "POST") return erro("Método não suportado.", 405);

  let corpo: { codigo?: string };
  try {
    corpo = await req.json();
  } catch {
    return erro("JSON inválido.");
  }

  if (!corpo.codigo) return erro("Informe o código.");

  const supabase = clienteAdministrativo();
  const { data: idEmpresa, error: erroConsulta } = await supabase.rpc("empresa_por_chave", {
    p_chave: corpo.codigo,
  });

  if (erroConsulta) return erro("Falha ao consultar o código.", 500);
  if (!idEmpresa) return json({ valido: false });

  const { data: org } = await supabase
    .from("organizations")
    .select("name, status")
    .eq("id", idEmpresa)
    .maybeSingle();

  return json({
    valido: true,
    empresa: org?.name ?? null,
    conta_ativa: org?.status !== "SUSPENSA" && org?.status !== "CANCELADA",
  });
});
