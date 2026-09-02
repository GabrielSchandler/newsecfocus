// ============================================================================
//  Edge Function: provisionar-empresa
//
//  Cria uma empresa cliente e, opcionalmente, convida o gestor dela por e-mail.
//  Só um administrador da PLATAFORMA (a revenda) pode chamar — a verificação é
//  feita perguntando ao banco com o JWT de quem chamou, não confiando no corpo
//  da requisição.
//
//  Este é o fluxo de venda: em vez de rodar INSERT no SQL Editor para cada
//  cliente novo (como pedia o guia da primeira versão), a operação vira um
//  formulário no painel da plataforma.
// ============================================================================
import {
  cabecalhosCors,
  clienteAdministrativo,
  clienteDoUsuario,
  erro,
  json,
} from "../_shared/comum.ts";

interface Entrada {
  nome: string;
  contato_email?: string;
  plano?: string;
  max_dispositivos?: number;
  fuso?: string;
  retencao_dias?: number;
  /** Se informado, cria/convida esse e-mail como OWNER da empresa. */
  email_gestor?: string;
  /** Para onde o convite leva depois do aceite. */
  url_retorno?: string;
}

const PLANOS = ["ESSENCIAL", "PROFISSIONAL", "CORPORATIVO"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cabecalhosCors });
  }
  if (req.method !== "POST") return erro("Método não suportado.", 405);

  // 1. Quem está chamando é admin da plataforma?
  const comoUsuario = clienteDoUsuario(req);
  const { data: ehAdmin, error: erroPermissao } = await comoUsuario.rpc("eh_admin_plataforma");

  if (erroPermissao) return erro("Falha ao verificar a permissão.", 500);
  if (!ehAdmin) return erro("Apenas a operação da plataforma pode provisionar empresas.", 403);

  let entrada: Entrada;
  try {
    entrada = await req.json();
  } catch {
    return erro("JSON inválido.");
  }

  const nome = (entrada.nome ?? "").trim();
  if (nome.length < 2) return erro("Informe o nome da empresa.");

  const plano = (entrada.plano ?? "ESSENCIAL").toUpperCase();
  if (!PLANOS.includes(plano)) return erro(`Plano inválido. Use: ${PLANOS.join(", ")}.`);

  const maxDispositivos = Number(entrada.max_dispositivos ?? 25);
  if (!Number.isFinite(maxDispositivos) || maxDispositivos < 1 || maxDispositivos > 10_000) {
    return erro("Limite de dispositivos fora da faixa permitida (1 a 10.000).");
  }

  const retencao = Number(entrada.retencao_dias ?? 90);
  if (!Number.isFinite(retencao) || retencao < 7 || retencao > 3650) {
    return erro("Retenção fora da faixa permitida (7 a 3650 dias).");
  }

  const admin = clienteAdministrativo();
  const { data: { user } } = await comoUsuario.auth.getUser();

  // 2. Slug único e legível para a URL da conta.
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "empresa";

  let slug = base;
  for (let tentativa = 2; tentativa <= 20; tentativa++) {
    const { data: existente } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existente) break;
    slug = `${base}-${tentativa}`;
  }

  // 3. Cria a empresa.
  const { data: empresa, error: erroEmpresa } = await admin
    .from("organizations")
    .insert({
      name: nome,
      slug,
      status: "TRIAL",
      plano,
      max_dispositivos: Math.floor(maxDispositivos),
      fuso: entrada.fuso ?? "America/Sao_Paulo",
      retencao_dias: Math.floor(retencao),
      contato_email: entrada.contato_email ?? null,
      trial_termina_em: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      criada_por: user?.id ?? null,
    })
    .select("id, name, slug, enrollment_key")
    .single();

  if (erroEmpresa) return erro(`Falha ao criar a empresa: ${erroEmpresa.message}`, 500);

  // 4. Convida o gestor, se houver.
  let gestor: string | null = null;
  let avisoGestor: string | null = null;

  const emailGestor = entrada.email_gestor?.trim().toLowerCase();
  if (emailGestor) {
    const { data: convite, error: erroConvite } =
      await admin.auth.admin.inviteUserByEmail(emailGestor, {
        redirectTo: entrada.url_retorno,
        data: { organizacao: nome },
      });

    if (erroConvite || !convite?.user) {
      // A empresa já existe; o convite pode ser refeito depois pelo painel.
      avisoGestor = erroConvite?.message ?? "Não foi possível enviar o convite.";
    } else {
      gestor = convite.user.id;
      const { error: erroPerfil } = await admin.from("profiles").insert({
        id: convite.user.id,
        org_id: empresa.id,
        full_name: emailGestor.split("@")[0],
        role: "OWNER",
      });
      if (erroPerfil) avisoGestor = `Convite enviado, mas o perfil falhou: ${erroPerfil.message}`;
    }
  }

  return json({
    empresa: {
      id: empresa.id,
      nome: empresa.name,
      slug: empresa.slug,
      enrollment_key: empresa.enrollment_key,
    },
    gestor,
    aviso: avisoGestor,
  });
});
