import { selecionarExperimentais } from "./oferta-experimental";
import { ZodError } from "zod";
import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import { systemUserId } from "../db/bootstrap";
import { ErroDeNegocio } from "../acao";
import { consultarAulas, reservarAula } from "./repository";
import { ocorrenciasAula } from "./recorrencia";
import { alunoSchema, formatarAula, type Aula } from "./schema";
import { acaoAulasSchema, type AcaoAulas } from "./agente-schema";
import { owned, agentKeys, assertResult } from "../agent/redis";
interface Opcao { aulaId: string; inicio: string; modalidade: string; turma: string }
interface Cadastro { opcoes: Opcao[]; consulta?: { modalidade: string | null; idade: number | null; mostradas: string[] }; reserva?: { aulaId: string; inicio: string; aluno: { nome: string; idade: number; telefone: string; responsavel: string }; solicitacaoId: string; conferido: true }; confirmada?: string }
export function agendaAulasDoAgente(banco: BancoSql, client: Redis, token: string, conversa: string, numero: string, enabled: () => Promise<boolean>) {
  const chave = `atendeia:{evolution}:cadastro-aula:${conversa}`;
  const salvar = async (v: Cadastro) => assertResult(await client.eval(owned + "redis.call('SET', KEYS[2], ARGV[2], 'EX', 604800); return 1", 2, agentKeys.lock, chave, token, JSON.stringify(v)));
  return async function atender(texto: string, acao?: AcaoAulas): Promise<string | null> {
    if (!await enabled()) return null;
    const raw = await client.get(chave), cadastro: Cadastro = raw ? JSON.parse(raw) as Cadastro : { opcoes: [] };
    try {
      if (!acao && cadastro.reserva && !cadastro.confirmada && /^(?:sim|confirmo|confirmar|pode (?:confirmar|agendar)|est[aá] (?:certo|correto)|confirmado)[.!\s]*$/iu.test(texto.trim())) {
        const resultado = await reservarAula(banco, cadastro.reserva, systemUserId);
        await salvar({ ...cadastro, confirmada: resultado.id });
        const a = cadastro.opcoes.find(o => o.aulaId === cadastro.reserva?.aulaId && o.inicio === cadastro.reserva?.inicio);
        return `Aula experimental agendada no sistema!\n\n${cadastro.reserva.aluno.nome} · ${a?.modalidade ?? "Aula"}\n${formatarAula(cadastro.reserva.inicio)} (Brasília)\nProtocolo: ${resultado.id}\n\nEndereço: R. Maria dos Réis Silva, 16, Buraquinho — Lot. Miragem, Lauro de Freitas.`;
      }
      if (!acao) {
        if (cadastro.consulta && !cadastro.reserva && /(?:outros?|mais)\s+hor[aá]rios|outras?\s+op[cç][oõ]es|n[aã]o (?:posso|consigo|d[aá]|serve)|dif[ií]cil/iu.test(texto)) return atender(texto, { acao: "consultar", modalidade: cadastro.consulta.modalidade, idade: cadastro.consulta.idade, maisOpcoes: true });
        if (cadastro.reserva && !cadastro.confirmada && /^(?:n[aã]o(?:,? (?:obrigad[oa]|quero(?: mais)?))?|cancelar|cancela|desisto)[.!\s]*$/iu.test(texto.trim())) {
          await salvar({ opcoes: cadastro.opcoes, consulta: cadastro.consulta });
          return "Conferência cancelada. Nenhuma reserva foi feita. Se quiser outra data, podemos consultar a agenda.";
        }
        if (/^(?:oi+|ol[aá]+|bom dia|boa tarde|boa noite)[!.\s]*$/iu.test(texto.trim())) {
          const reservas = await reservasDoContato(banco, numero);
          if (reservas.length) return `Olá! Você tem uma experimental de ${reservas[0].modalidade} em ${formatarAula(reservas[0].inicio)}. Ficou alguma dúvida sobre seu agendamento?`;
          if (cadastro.reserva && !cadastro.confirmada) return `Olá! Sua preferência é ${formatarAula(cadastro.reserva.inicio)}. A reserva ainda não foi confirmada. Quer continuar de onde paramos?`;
        }
        return null;
      }
      const dados = acaoAulasSchema.parse(acao);
      if (dados.acao === "consultar") {
        const agenda = await consultarAulas(banco);
        const normalizar = (v: string) => { const nome = v.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").replace(/[^a-z]/g, ""); return ({ jiu: "jiujitsu", muay: "muaythai", tae: "taekwondo" } as Record<string,string>)[nome] ?? nome; };
        const modalidade = dados.maisOpcoes ? dados.modalidade ?? cadastro.consulta?.modalidade ?? null : dados.modalidade;
        const idade = dados.maisOpcoes ? dados.idade ?? cadastro.consulta?.idade ?? null : dados.idade;
        const mostradas = dados.maisOpcoes && normalizar(modalidade ?? "") === normalizar(cadastro.consulta?.modalidade ?? "") && idade === cadastro.consulta?.idade ? cadastro.consulta.mostradas : [];
        const aulas = agenda.aulas.filter(a => !modalidade || normalizar(a.modalidade) === normalizar(modalidade));
        const elegivel = (a: Aula) => idade == null || idade >= a.idadeMinima && idade <= a.idadeMaxima && !(idade >= 18 && a.turma.startsWith("Kids")) && !(idade < 18 && a.turma === "Geral") && !(idade === 3 && a.modalidade === "Taekwondo");
        const candidatas = aulas.filter(elegivel).flatMap(a => ocorrenciasAula(a).filter(inicio => a.capacidade === null || agenda.reservas.filter(r => r.aulaId === a.id && r.status === "confirmada" && (!r.inicio || Date.parse(r.inicio) === Date.parse(inicio))).length < a.capacidade).map(inicio => ({ aulaId: a.id, inicio, modalidade: a.modalidade, turma: a.turma })));
        const opcoes = selecionarExperimentais(candidatas, mostradas);
        await salvar({ opcoes, consulta: { modalidade, idade, mostradas: [...mostradas, ...opcoes.map(a => a.aulaId)] } });
        return opcoes.length ? `${dados.maisOpcoes ? "Também temos estas opções" : opcoes.length === 1 ? "Tenho esta opção para você" : "Tenho estas duas opções para você"} (horário de Brasília):\n\n${opcoes.map((a,i) => `${i+1}. ${a.modalidade} · ${a.turma} · ${formatarAula(a.inicio)}`).join("\n")}\n\nQual opção você prefere? A reserva só é concluída após conferir os dados e você confirmar.` : "Não encontrei outras opções compatíveis com os dados informados. Qual dia ou período funciona melhor para você? Nenhuma reserva foi feita.";
      }
      const opcao = cadastro.opcoes[dados.opcao - 1];
      if (!opcao) return "Precisamos consultar as datas da agenda novamente antes de reservar.";
      const aluno = alunoSchema.parse({ nome: dados.nome, idade: dados.idade, telefone: `+${numero}`, responsavel: dados.responsavel });
      const agenda = await consultarAulas(banco), aula = agenda.aulas.find(a => a.id === opcao.aulaId);
      if (!aula || !ocorrenciasAula(aula).includes(opcao.inicio) || aluno.idade < aula.idadeMinima || aluno.idade > aula.idadeMaxima || aluno.idade >= 18 && aula.turma.startsWith("Kids") || aluno.idade < 18 && aula.turma === "Geral" || aluno.idade === 3 && aula.modalidade === "Taekwondo") return "Esta opção precisa de conferência da equipe para a idade informada. Nenhuma reserva foi feita.";
      await salvar({ opcoes: cadastro.opcoes, consulta: cadastro.consulta, reserva: { aulaId: opcao.aulaId, inicio: opcao.inicio, aluno, solicitacaoId: randomUUID(), conferido: true } });
      return `Confira sua aula experimental:\n\n${aluno.nome}, ${aluno.idade} anos\n${opcao.modalidade} · ${opcao.turma}\n${formatarAula(opcao.inicio)} (Brasília)${aluno.responsavel ? `\nResponsável: ${aluno.responsavel}` : ""}\n\nOs dados estão corretos? Responda “confirmo” para gravar o agendamento ou informe a correção.`;
    } catch (erro) {
      if (erro instanceof ZodError) return `Para continuar, preciso conferir os dados: ${erro.issues[0]?.message ?? "informe os dados completos do participante"}. Nenhuma reserva foi feita.`;
      if (erro instanceof ErroDeNegocio) return `${erro.message} Nenhuma nova reserva foi confirmada.`;
      throw erro;
    }
  };
}
export async function reservasDoContato(banco: BancoSql, numero: string) {
  return linhas<{ modalidade: string; inicio: string }>(await banco.execute(sql`SELECT a.modalidade,coalesce(r.inicio,a.inicio) inicio FROM atendeia_aulas_reservas r JOIN atendeia_aulas a ON a.id=r.aula_id WHERE r.telefone=${`+${numero}`} AND r.status='confirmada' AND r.is_deleted=false AND a.is_deleted=false AND coalesce(r.inicio,a.inicio)>now() ORDER BY coalesce(r.inicio,a.inicio) LIMIT 5`)).map(r => ({ ...r, inicio: new Date(r.inicio).toISOString() }));
}
