// ============================================================================
//  Dados SINTÉTICOS para o banco local de desenvolvimento.
//
//  Uma empresa de demonstração com três equipes, cadastros pendentes, duas
//  estações para a mesma pessoa, uma estação atrasada e três semanas de
//  atividade minuto a minuto gerada com semente fixa — a mesma tela sai igual
//  em toda execução, o que permite comparar capturas.
//
//  Nada daqui vai para produção: o banco local só existe em `npm run dev:local`.
// ============================================================================

import {
  classificar,
  consolidar,
  criarEmpresa,
  criarEquipe,
  criarEstacao,
  criarPessoa,
  criarUsuario,
} from "../../../supabase/testes/banco-local.mjs";

// PRNG determinístico (mulberry32).
function gerador(semente) {
  let a = semente >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const APPS = {
  Comercial: [
    ["crm.exemplo.com", "chrome.exe", 30], ["excel.exe", null, 18], ["whatsapp.exe", null, 12],
    ["outlook.exe", null, 10], ["teams.exe", null, 8], ["portal.exemplo.com", "chrome.exe", 6],
    ["youtube.com", "chrome.exe", 3], ["instagram.com", "chrome.exe", 2], ["notepad.exe", null, 2],
  ],
  Administrativo: [
    ["excel.exe", null, 34], ["erp.exemplo.com", "chrome.exe", 18], ["outlook.exe", null, 14],
    ["winword.exe", null, 10], ["teams.exe", null, 6], ["portal.exemplo.com", "chrome.exe", 6],
    ["acrord32.exe", null, 5], ["spotify.exe", null, 3],
  ],
  Jurídico: [
    ["winword.exe", null, 32], ["tribunal.jus.br", "chrome.exe", 20], ["acrord32.exe", null, 14],
    ["outlook.exe", null, 12], ["excel.exe", null, 6], ["teams.exe", null, 6], ["youtube.com", "chrome.exe", 3],
  ],
};

const CLASSIFICACAO = [
  { processo: "excel.exe", tipo: "PRODUCTIVE" },
  { processo: "winword.exe", tipo: "PRODUCTIVE" },
  { dominio: "crm.exemplo.com", tipo: "PRODUCTIVE" },
  { dominio: "erp.exemplo.com", tipo: "PRODUCTIVE" },
  { dominio: "tribunal.jus.br", tipo: "PRODUCTIVE" },
  { processo: "outlook.exe", tipo: "NEUTRAL" },
  { processo: "teams.exe", tipo: "NEUTRAL" },
  { processo: "whatsapp.exe", tipo: "NEUTRAL" },
  { processo: "chrome.exe", tipo: "NEUTRAL" },
  { processo: "spotify.exe", tipo: "UNPRODUCTIVE" },
  { dominio: "youtube.com", tipo: "UNPRODUCTIVE" },
  { dominio: "instagram.com", tipo: "UNPRODUCTIVE" },
  // acrord32.exe, notepad.exe e portal.exemplo.com ficam sem classificação.
];

const PESSOAS = [
  { nome: "Ana Souza", equipe: "Comercial", cargo: "Analista comercial", ritmo: 0.72 },
  { nome: "Bruno Lima", equipe: "Comercial", cargo: "Consultor", ritmo: 0.66, notebook: true },
  { nome: "Carla Mendes", equipe: "Comercial", cargo: "Consultora", ritmo: 0.64, extra: true },
  { nome: "Daniel Alves", equipe: "Comercial", cargo: "Consultor", ritmo: 0.6 },
  { nome: "Elisa Costa", equipe: "Comercial", cargo: "Coordenadora", ritmo: 0.58, extra: true },
  { nome: "Fábio Rocha", equipe: "Administrativo", cargo: "Assistente", ritmo: 0.62, atrasada: true },
  { nome: "Gabriela Nunes", equipe: "Administrativo", cargo: "Analista financeira", ritmo: 0.63 },
  { nome: "Henrique Dias", equipe: "Administrativo", cargo: "Assistente", ritmo: 0.57, escala: ["08:30", "17:30"] },
  { nome: "Isabela Prado", equipe: "Administrativo", cargo: "Analista de RH", ritmo: 0.61 },
  { nome: "João Ribeiro", equipe: "Jurídico", cargo: "Advogado", ritmo: 0.6, extra: true, sabado: true },
  { nome: "Larissa Teixeira", equipe: "Jurídico", cargo: "Advogada", ritmo: 0.58 },
  { nome: "Marcelo Pires", equipe: "Jurídico", cargo: "Estagiário", ritmo: 0.54 },
  { nome: "Marina Costa", equipe: null, cargo: null, ritmo: 0.5, semEquipe: true },
];

const DIAS = 21;

function spHora(dia, minutoDoDia) {
  // São Paulo sem horário de verão: UTC−3.
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 3, 0, 0) + minutoDoDia * 60_000);
}

function diaSp(offsetDias) {
  const agora = new Date(Date.now() - 3 * 3_600_000);
  agora.setUTCDate(agora.getUTCDate() - offsetDias);
  return agora.toISOString().slice(0, 10);
}

export async function semear(db) {
  const rnd = gerador(20260916);
  const org = await criarEmpresa(db, { nome: "Empresa demonstração", intervalo: 5 });
  await db.query(
    `update organizations set status = 'ATIVA', plano = 'PROFISSIONAL', codigo_instalacao = '482913570264' where id = $1`,
    [org],
  );

  const equipes = {};
  for (const [nome, cor] of [["Comercial", "#1f9fb2"], ["Administrativo", "#3d5f8f"], ["Jurídico", "#8a6fb0"]]) {
    equipes[nome] = await criarEquipe(db, org, nome);
    await db.query(`update teams set cor = $1, descricao = $2 where id = $3`, [cor, `Equipe ${nome.toLowerCase()}`, equipes[nome]]);
  }

  for (const regra of CLASSIFICACAO) await classificar(db, org, regra);

  // Escala da empresa: seg–sex 08:00–18:00, almoço 12:00–13:00. Jurídico 09–18.
  for (let dow = 1; dow <= 7; dow++) {
    const util = dow <= 5;
    await db.query(
      `insert into escalas_expediente (org_id, escopo, dia_semana, trabalha, inicio, fim, intervalo_inicio, intervalo_fim)
       values ($1, 'EMPRESA', $2, $3, '08:00', '18:00', $4, $5)`,
      [org, dow, util, util ? "12:00" : null, util ? "13:00" : null],
    );
    await db.query(
      `insert into escalas_expediente (org_id, escopo, equipe_id, dia_semana, trabalha, inicio, fim, intervalo_inicio, intervalo_fim)
       values ($1, 'EQUIPE', $2, $3, $4, '09:00', '18:00', $5, $6)`,
      [org, equipes["Jurídico"], dow, util, util ? "12:00" : null, util ? "13:00" : null],
    );
  }

  const usuarios = {
    dono: await criarUsuario(db, org, { papel: "OWNER" }),
    gestor: await criarUsuario(db, org, { papel: "MANAGER" }),
    lider: await criarUsuario(db, org, { papel: "TEAM_LEAD", equipeId: equipes.Comercial }),
    leitor: await criarUsuario(db, org, { papel: "VIEWER" }),
  };
  const nomesUsuarios = { dono: "Gestor Demonstração", gestor: "Maria Silva", lider: "Carlos Lima", leitor: "Juliana Rocha" };
  for (const [chave, id] of Object.entries(usuarios)) {
    await db.query(`update profiles set full_name = $1 where id = $2`, [nomesUsuarios[chave], id]);
    await db.query(`update auth.users set email = $1 where id = $2`, [`${chave}@demonstracao.local`, id]);
  }

  const agora = Date.now();
  let versao = 0;

  for (const p of PESSOAS) {
    const pessoa = await criarPessoa(db, org, {
      nome: p.nome,
      equipeId: p.equipe ? equipes[p.equipe] : null,
      completo: !p.semEquipe,
    });
    if (p.cargo) await db.query(`update employees set cargo = $1 where id = $2`, [p.cargo, pessoa]);
    if (p.escala) {
      for (let dow = 1; dow <= 7; dow++) {
        const util = dow <= 5;
        await db.query(
          `insert into escalas_expediente (org_id, escopo, colaborador_id, dia_semana, trabalha, inicio, fim, intervalo_inicio, intervalo_fim)
           values ($1, 'PESSOA', $2, $3, $4, $5, $6, $7, $8)`,
          [org, pessoa, dow, util, p.escala[0], p.escala[1], util ? "12:00" : null, util ? "13:00" : null],
        );
      }
    }

    const sigla = (p.equipe ?? "GER").slice(0, 3).toUpperCase();
    const maquina = `${sigla}-${String(PESSOAS.indexOf(p) + 1).padStart(2, "0")}`;
    const estacao = await criarEstacao(db, org, maquina);
    const estacoes = [estacao];
    if (p.notebook) estacoes.push(await criarEstacao(db, org, `${maquina}-NB`));

    const inicioEscala = p.escala ? 510 : p.equipe === "Jurídico" ? 540 : 480;
    const fimEscala = p.escala ? 1050 : 1080;
    const apps = APPS[p.equipe ?? "Administrativo"];
    const pesoTotal = apps.reduce((s, a) => s + a[2], 0);
    const linhas = [];

    for (let off = DIAS; off >= 0; off--) {
      const dia = diaSp(off);
      const dow = ((new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
      const util = dow <= 5;
      if (!util && !(p.sabado && dow === 6 && off % 7 < 7 && rnd() < 0.6)) continue;
      if (util && rnd() < 0.04) continue; // dia sem registro nenhum

      let minuto = util ? inicioEscala - 15 + Math.floor(rnd() * 35) : 600;
      const saida = util
        ? fimEscala - 20 + Math.floor(rnd() * 40) + (p.extra && rnd() < 0.45 ? 40 + Math.floor(rnd() * 70) : 0)
        : 600 + 120 + Math.floor(rnd() * 90);
      const almoco = util ? 720 + Math.floor(rnd() * 20) : null;

      while (minuto < saida) {
        const instante = spHora(dia, minuto);
        if (instante.getTime() > agora - 2 * 60_000) break;
        if (almoco && minuto >= almoco && minuto < almoco + 60) { minuto++; continue; }

        // Sessão de um aplicativo.
        let sorteio = rnd() * pesoTotal;
        const app = apps.find((a) => (sorteio -= a[2]) < 0) ?? apps[0];
        const duracao = 4 + Math.floor(rnd() * 26);
        const estado = rnd();
        const ocioso = estado > p.ritmo + 0.3 && estado < p.ritmo + 0.38;
        const bloqueado = estado >= 0.97;
        for (let i = 0; i < duracao && minuto < saida; i++, minuto++) {
          if (almoco && minuto >= almoco && minuto < almoco + 60) break;
          const t = spHora(dia, minuto);
          if (t.getTime() > agora - 2 * 60_000) break;
          const [alvo, navegador] = app;
          const ehDominio = alvo.includes(".") && !alvo.endsWith(".exe");
          const est = estacoes.length > 1 && rnd() < 0.25 ? estacoes[1] : estacoes[0];
          linhas.push([
            est, t.toISOString(), ehDominio ? navegador : alvo, ehDominio ? alvo : null,
            ocioso, bloqueado, ocioso || bloqueado ? 0 : 30 + Math.floor(rnd() * 30),
            ocioso || bloqueado ? 0 : Math.floor(rnd() * 80), ocioso || bloqueado ? 0 : Math.floor(rnd() * 25),
            `${alvo.replace(".exe", "")} — janela de trabalho`,
          ]);
        }
      }
    }

    for (let i = 0; i < linhas.length; i += 800) {
      const fatia = linhas.slice(i, i + 800);
      const params = [];
      const valores = fatia.map((l) => {
        const b = params.length;
        params.push(org, pessoa, ...l);
        return `(${Array.from({ length: 12 }, (_, k) => `$${b + k + 1}`).join(", ")})`;
      });
      await db.query(
        `insert into activity_logs (org_id, employee_id, device_id, "timestamp", process_name, domain,
            is_idle, is_locked, active_seconds, keystrokes_count, mouse_clicks_count, window_title)
         values ${valores.join(", ")}
         on conflict do nothing`,
        params,
      );
    }

    const ultimo = linhas.length ? new Date(linhas[linhas.length - 1][1]).getTime() : agora - 86_400_000;
    for (const est of estacoes) {
      // Uma estação atrasada de propósito: parou de enviar há 40 minutos.
      const envio = p.atrasada ? new Date(agora - 40 * 60_000) : new Date(Math.min(agora, ultimo + 60_000));
      await db.query(
        `update devices set os_user = $1, agent_version = $2, last_sync_at = $3, status_online = $4 where id = $5`,
        [p.nome.split(" ")[0].toLowerCase() + "." + p.nome.split(" ").at(-1).toLowerCase(),
         versao++ % 5 === 4 ? "1.5.0" : "1.6.0", envio, !p.atrasada, est],
      );
      await db.query(
        `insert into eventos_estacao (org_id, device_id, tipo, momento, versao)
         values ($1, $2, 'AGENTE_INICIADO', $3, '1.6.0'), ($1, $2, 'BLOQUEADA', $4, '1.6.0'), ($1, $2, 'DESBLOQUEADA', $5, '1.6.0')
         on conflict do nothing`,
        [org, est, spHora(diaSp(0), 470), spHora(diaSp(0), 722), spHora(diaSp(0), 781)],
      );
    }
    if (p.atrasada) {
      await db.query(`delete from activity_logs where employee_id = $1 and "timestamp" > $2`, [pessoa, new Date(agora - 40 * 60_000)]);
    }
  }

  // Estação nova, ainda sem ninguém configurado.
  const nova = await criarEstacao(db, org, "COM-NOVA", { ultimoEnvio: new Date(agora - 5 * 60_000) });
  await db.query(`update devices set os_user = 'estagio.comercial', agent_version = '1.6.0', status_online = true where id = $1`, [nova]);
  await criarPessoa(db, org, { nome: "estagio.comercial", completo: false });

  await consolidar(db);
  return { org, usuarios };
}
