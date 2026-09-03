// ============================================================================
//  Edge Function: convidar-usuario
//
//  Convida alguém para acessar o painel de uma empresa e já cria o perfil com
//  o papel escolhido.
//
//  Existe porque, sem ela, dar acesso a um gestor exigia rodar INSERT no banco
//  — o que na prática significa que só quem tem a senha do Postgres consegue
//  incluir uma pessoa. Inaceitável num produto vendido.
//
//  Quem pode chamar: OWNER ou MANAGER da própria empresa, ou a operação da
//  plataforma para qualquer empresa. A verificação é feita PERGUNTANDO AO BANCO
//  com o JWT de quem chamou — nunca confiando no corpo da requisição.
// ============================================================================
import {
  cabecalhosCors,
  clienteAdministrativo,
  clienteDoUsuario,
  erro,
  json,
} from "../_shared/comum.ts";

interface Entrada {
  email: string;
  nome?: string;
  papel: "OWNER" | "MANAGER" | "TEAM_LEAD" | "VIEWER";
  equipe_id?: string | null;
  /** Só a operação da plataforma pode informar: convida para outra empresa. */
  org_id?: string | null;
  url_retorno?: string;
}

const PAPEIS = ["OWNER", "MANAGER", "TEAM_LEAD", "VIEWER"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cabecalhosCors });
  }
  if (req.method !== "POST") return erro("Método não suportado.", 405);

  const comoUsuario = clienteDoUsuario(req);
  const { data: { user }, error: erroSessao } = await comoUsuario.auth.getUser();

  if (erroSessao || !user) return erro("Sessão inválida.", 401);

  let entrada: Entrada;
  try {
    entrada = await req.json();
  } catch {
    return erro("JSON inválido.");
  }

  const email = (entrada.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) return erro("Informe um e-mail válido.");
  if (!PAPEIS.includes(entrada.papel)) return erro("Papel inválido.");

  // Quem está convidando: papel e empresa vêm do banco, não do pedido.
  const admin = clienteAdministrativo();
  const { data: perfil } = await admin
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();

  const { data: ehPlataforma } = await comoUsuario.rpc("eh_admin_plataforma");

  const orgAlvo = entrada.org_id && ehPlataforma ? entrada.org_id : perfil?.org_id;

  if (!orgAlvo) return erro("Não foi possível identificar a empresa.", 403);

  const podeConvidar =
    ehPlataforma || (perfil && ["OWNER", "MANAGER"].includes(perfil.role));

  if (!podeConvidar) {
    return erro("Apenas proprietário e gestor podem convidar pessoas.", 403);
  }

  // Só o proprietário cria outro proprietário: um gestor não deve poder se
  // promover criando um OWNER e entrando por ele.
  if (entrada.papel === "OWNER" && !ehPlataforma && perfil?.role !== "OWNER") {
    return erro("Apenas o proprietário da conta pode criar outro proprietário.", 403);
  }

  // Líder de equipe sem equipe enxergaria nada — melhor recusar do que criar
  // um acesso que não funciona.
  if (entrada.papel === "TEAM_LEAD" && !entrada.equipe_id) {
    return erro("Escolha a equipe que esse líder vai acompanhar.");
  }

  if (entrada.equipe_id) {
    const { data: equipe } = await admin
      .from("teams")
      .select("id")
      .eq("id", entrada.equipe_id)
      .eq("org_id", orgAlvo)
      .maybeSingle();
    if (!equipe) return erro("Equipe não encontrada nesta empresa.");
  }

  // Convida ou reaproveita o usuário, se ele já existir no Auth.
  let idUsuario: string | null = null;
  let jaExistia = false;

  const { data: convite, error: erroConvite } = await admin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: entrada.url_retorno },
  );

  if (convite?.user) {
    idUsuario = convite.user.id;
  } else {
    const jaCadastrado = (erroConvite?.message ?? "").toLowerCase().includes("already");
    if (!jaCadastrado) {
      return erro(`Não foi possível enviar o convite: ${erroConvite?.message}`, 500);
    }

    // Já tem conta: procura o id para apenas vincular o perfil.
    const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    idUsuario = lista?.users?.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    jaExistia = true;
  }

  if (!idUsuario) return erro("Não foi possível localizar o usuário convidado.", 500);

  const { error: erroPerfil } = await admin.from("profiles").upsert(
    {
      id: idUsuario,
      org_id: orgAlvo,
      full_name: entrada.nome?.trim() || email.split("@")[0],
      role: entrada.papel,
      team_id: entrada.papel === "TEAM_LEAD" ? entrada.equipe_id : null,
      ativo: true,
    },
    { onConflict: "id" },
  );

  if (erroPerfil) {
    return erro(`Convite enviado, mas o perfil falhou: ${erroPerfil.message}`, 500);
  }

  return json({
    id: idUsuario,
    email,
    ja_tinha_conta: jaExistia,
    aviso: jaExistia
      ? "Essa pessoa já tinha conta; o acesso foi vinculado sem enviar convite novo."
      : null,
  });
});
