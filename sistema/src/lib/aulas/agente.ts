import { limparNomeParticipante } from "./nome-participante";
import { escolherHorario } from "./escolha";
import { aberturaHorarios, semHorarios } from "./apresentacao";
import { identificarObjetivo, recomendarObjetivo, explicarBeneficioObjetivo, alternativasPorObjetivo, modalidadeMencionada, intencaoModalidade, type ObjetivoAula } from "./objetivo";
import { identificarParticipante } from "./participante";
import { LINK_LOCALIZACAO_CT } from "../ct/conhecimento";
import { interpretarTurno, correspondeTurno, type TurnoAula } from "./turno";
import { interpretarDataCt, dataLocalCt, rotuloDataCt, formatarOcorrenciaCt, formatarDiaHoraCt } from "./calendario";
import { selecionarExperimentais, priorizarInfantil } from "./oferta-experimental";
import { ZodError } from "zod";
import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import { systemUserId } from "../db/bootstrap";
import { ErroDeNegocio } from "../acao";
import { consultarAulas, reservarAula } from "./repository";
import { ocorrenciasAula } from "./recorrencia";
import { alunoSchema, elegivelParaExperimental, type AlunoDados, type Aula } from "./schema";
import { acaoAulasSchema, type AcaoAulas } from "./agente-schema";
import { owned, agentKeys, assertResult } from "../agent/redis";
interface Opcao { aulaId: string; inicio: string; modalidade: string; turma: string }
interface Cadastro { modalidadePreferida?: string | null; opcaoEscolhida?: number; objetivo?: ObjetivoAula; objetivoExplicado?: string; participante?: "adulto" | "crianca" | "outraPessoa"; adultoSemIdade?: boolean; turnoSolicitado?: TurnoAula | null; aguardandoAlteracao?: boolean; aguardandoAjuda?: boolean; opcoes: Opcao[]; dataSolicitada?: string | null; consulta?: { modalidade: string | null; idade: number | null; adultoSemIdade?: boolean; mostradas: string[]; turno?: TurnoAula | null; data?: string | null }; reserva?: { aulaId: string; inicio: string; aluno: AlunoDados; solicitacaoId: string; conferido: true }; confirmada?: string }
export function agendaAulasDoAgente(banco: BancoSql, client: Redis, token: string, conversa: string, numero: string, enabled: () => Promise<boolean>) {
  const chave = `atendeia:{evolution}:cadastro-aula:${conversa}`;
  const salvar = async (v: Cadastro) => assertResult(await client.eval(owned + "redis.call('SET', KEYS[2], ARGV[2], 'EX', 604800); return 1", 2, agentKeys.lock, chave, token, JSON.stringify(v)));
  return async function atender(texto: string, acao?: AcaoAulas): Promise<string | null> {
    if (!await enabled()) return null;
    const raw = await client.get(chave); let cadastro: Cadastro = raw ? JSON.parse(raw) as Cadastro : { opcoes: [] };
    try {
      const objetivoAtual = identificarObjetivo(texto);
      const participanteAtual = identificarParticipante(texto);
      const idadeInformada = texto.match(/\b(\d{1,3})\s*anos\b/iu);
      const interesse = intencaoModalidade(texto);
      if (!acao && !cadastro.confirmada && !cadastro.reserva && (interesse.modalidade || cadastro.consulta?.modalidade && interesse.negadas.includes(cadastro.consulta.modalidade))) {
        const modalidade = interesse.modalidade;
        if (modalidade !== cadastro.consulta?.modalidade || modalidade !== cadastro.modalidadePreferida) {
          const mudouModalidade = modalidade !== cadastro.consulta?.modalidade;
          cadastro = {...cadastro, modalidadePreferida:modalidade, ...(mudouModalidade ? {opcoes:[], opcaoEscolhida:undefined, consulta:{...cadastro.consulta, modalidade, idade:cadastro.consulta?.idade ?? null, mostradas:[]}} : {})};
          await salvar(cadastro);
        }
      }
      if (!acao && participanteAtual && (participanteAtual !== cadastro.participante || cadastro.confirmada && /pra mim|para mim|tamb[eé]m/iu.test(texto))) {
        const novoTurno = interpretarTurno(texto), novaData = interpretarDataCt(texto);
        const primeiraIdentificacao = cadastro.participante === undefined && !cadastro.confirmada && !cadastro.reserva;
        cadastro = {
          objetivo:objetivoAtual ?? (primeiraIdentificacao ? cadastro.objetivo : undefined),
          modalidadePreferida:primeiraIdentificacao ? cadastro.modalidadePreferida : interesse.modalidade,
          opcoes:primeiraIdentificacao ? cadastro.opcoes : [],
          consulta:primeiraIdentificacao ? cadastro.consulta : interesse.modalidade ? {modalidade:interesse.modalidade, idade:idadeInformada ? Number(idadeInformada[1]) : null, mostradas:[]} : undefined,
          participante:participanteAtual,
          adultoSemIdade:participanteAtual === "adulto" && !idadeInformada && !(primeiraIdentificacao && cadastro.consulta?.idade != null),
          turnoSolicitado:novoTurno === "ambiguo" ? null : novoTurno !== undefined ? novoTurno : primeiraIdentificacao ? cadastro.turnoSolicitado : undefined,
          dataSolicitada:novaData?.tipo === "data" ? novaData.data : primeiraIdentificacao ? cadastro.dataSolicitada : null,
        };
        await salvar(cadastro);
      }
      if (!acao && idadeInformada && cadastro.adultoSemIdade) { cadastro.adultoSemIdade=false; await salvar(cadastro); }
      if (!acao && !cadastro.confirmada && !cadastro.reserva && cadastro.consulta?.modalidade && (participanteAtual === "adulto" || idadeInformada && cadastro.participante)) return atender(texto,{acao:"consultar",modalidade:cadastro.consulta.modalidade,idade:idadeInformada?Number(idadeInformada[1]):cadastro.consulta.idade});
      if (!acao && participanteAtual === "adulto" && cadastro.objetivo) return atender(texto,{acao:"consultar",modalidade:null,idade:null});
      if (!acao && participanteAtual === "adulto" && !cadastro.consulta?.modalidade && !/taekwondo|muay|jiu/iu.test(texto) && !/onde|valor|pre[cç]o|pagamento/iu.test(texto)) return "Claro! Qual modalidade você gostaria de experimentar?";
      if (!acao && participanteAtual === "crianca" && !idadeInformada && cadastro.consulta?.idade == null && cadastro.reserva?.aluno.idade == null && !/onde|valor|pre[cç]o|pagamento/iu.test(texto)) return "Qual é a idade de quem vai fazer a aula?";
      if (!acao && objetivoAtual) { cadastro.objetivo=objetivoAtual; await salvar(cadastro);
        return atender(texto,{acao:"consultar",modalidade:modalidadeMencionada(texto),idade:cadastro.consulta?.idade ?? null});
      }
      const pediuAlternativas = /(?:outr[oa]s?|mais)\s+(?:hor[aá]rios?|op[cç][aã]o|op[cç][oõ]es|alternativas?)|n[aã]o (?:posso|consigo|d[aá]|serve)|dif[ií]cil/iu.test(texto);
      const turnoAtual = interpretarTurno(texto);
      if (turnoAtual === "ambiguo") return "Você prefere de manhã, à tarde ou à noite?";
      if (!acao && turnoAtual !== undefined) { cadastro.turnoSolicitado = turnoAtual; await salvar(cadastro); }
      if (!acao && turnoAtual !== undefined && cadastro.consulta && !cadastro.confirmada && !/remarc|cancel/iu.test(texto)) return atender(texto, {acao:"consultar",modalidade:cadastro.consulta.modalidade,idade:cadastro.consulta.idade,maisOpcoes:pediuAlternativas});
      const perguntaCalendario = /(?:que|qual)\s+(?:dia|data)|qual\s+(?:é|e)\s+(?:o dia|a data)/iu.test(texto) && !/agendar|marcar|aula|experimental|treinar|treino|hor[aá]rio/iu.test(texto);
      const dataAtual = perguntaCalendario ? null : interpretarDataCt(texto);
      if (dataAtual?.tipo === "ambigua") return `Você mencionou mais de uma data: ${dataAtual.datas.map(rotuloDataCt).join(" ou ")}. Qual delas você prefere?`;
      if (dataAtual?.tipo === "invalida") return dataAtual.mensagem;
      if (!acao && /(?:outr[oa]s? (?:datas?|dias?)|qualquer dia|sem prefer[eê]ncia de data)/iu.test(texto)) { cadastro.dataSolicitada = null; await salvar(cadastro); }
      if (!acao && dataAtual?.tipo === "data") { cadastro.dataSolicitada = dataAtual.data; await salvar(cadastro); }
      if (!acao && dataAtual?.tipo === "data" && cadastro.consulta && !cadastro.confirmada && !/remarc|cancel/iu.test(texto)) return atender(texto,{acao:"consultar",modalidade:cadastro.consulta.modalidade,idade:cadastro.consulta.idade,referenciaData:texto.slice(0,160),maisOpcoes:pediuAlternativas});
      if (!acao && cadastro.aguardandoAjuda && cadastro.confirmada) {
        await salvar({ ...cadastro, aguardandoAjuda: false });
        if (/^(?:n[aã]o(?:,? obrigad[oa])?|nada(?: mais)?|s[oó] isso)[.!\s]*$/iu.test(texto.trim())) {
          const reservas = await reservasDoContato(banco, numero);
          const reserva = reservas.find(r => r.inicio === cadastro.reserva?.inicio);
          return reserva ? `Combinado! Aguardo você na aula de ${reserva.modalidade}, ${formatarOcorrenciaCt(reserva.inicio)}. Até lá!` : "Combinado! Se precisar de algo, é só chamar.";
        }
        if (/^(?:sim|quero|pode ser)[.!\s]*$/iu.test(texto.trim())) return "Claro! Como posso te ajudar?";
      }
      if (!acao && cadastro.reserva && !cadastro.confirmada && /^(?:n[aã]o(?:,? obrigad[oa])?)[.!\s]*$/iu.test(texto.trim())) {
        await salvar({ ...cadastro, reserva: undefined, aguardandoAlteracao: true });
        return "O que você gostaria de alterar?";
      }
      if (!acao && cadastro.aguardandoAlteracao && /^(?:sim|confirmo)[.!\s]*$/iu.test(texto.trim())) return "O que você gostaria de alterar nos dados da aula?";
      if (!acao && cadastro.reserva && !cadastro.confirmada && /^(?:sim|confirmo|confirmar|pode (?:confirmar|agendar)|est[aá] (?:certo|correto)|confirmado)[.!\s]*$/iu.test(texto.trim())) {
        if (cadastro.dataSolicitada && dataLocalCt(Date.parse(cadastro.reserva.inicio)) !== cadastro.dataSolicitada) return `Você pediu ${rotuloDataCt(cadastro.dataSolicitada)}, mas a conferência anterior era de outra data. Precisamos consultar e conferir a data correta antes de reservar.`;
        if (!correspondeTurno(cadastro.reserva.inicio, cadastro.turnoSolicitado)) return "Precisamos consultar e conferir uma aula no turno que você pediu antes de confirmar.";
        const resultado = await reservarAula(banco, cadastro.reserva, systemUserId);
        await salvar({ ...cadastro, confirmada: resultado.id, aguardandoAjuda: false });
        const a = cadastro.opcoes.find(o => o.aulaId === cadastro.reserva?.aulaId && o.inicio === cadastro.reserva?.inicio);
        return `Sua experimental de ${a?.modalidade ?? "artes marciais"} está agendada para ${formatarDiaHoraCt(cadastro.reserva.inicio)}!\n\nVenha com roupa leve e traga uma garrafinha de água. Estamos esperando por você!\n\n👇 Tô deixando aqui a localização, caso você precise:\n${LINK_LOCALIZACAO_CT}\n\nAté lá!`;
      }
      if (!acao) {
        if (!cadastro.reserva && !cadastro.confirmada && !pediuAlternativas && cadastro.opcoes.length) {
          const escolha = escolherHorario(texto,cadastro.opcoes);
          if (escolha === "ambigua") return "Esse horário aparece em mais de uma opção. Qual delas você prefere?";
          if (escolha !== null) {
            const opcao=cadastro.opcoes[escolha-1];
            if (!correspondeTurno(opcao.inicio,cadastro.turnoSolicitado) || Date.parse(opcao.inicio)<=Date.now()) return "Vou precisar consultar de novo esse horário antes de seguir.";
            await salvar({...cadastro,opcaoEscolhida:escolha});
            const horario=new Date(opcao.inicio).toLocaleTimeString("pt-BR",{timeZone:"America/Bahia",hour:"2-digit",minute:"2-digit"});
            const pedirIdade=!cadastro.adultoSemIdade && cadastro.consulta?.idade == null;
            return `Boa! Vamos de ${horario}.\n\nPara prepararmos a aula de ${opcao.modalidade}, qual é o nome completo do participante${pedirIdade ? " e a idade" : ""}?`;
          }
        }
        if (cadastro.consulta && !cadastro.confirmada && pediuAlternativas) return atender(texto, { acao: "consultar", modalidade: cadastro.consulta.modalidade, idade: cadastro.consulta.idade, maisOpcoes: true });
        if (cadastro.reserva && !cadastro.confirmada && /^(?:n[aã]o(?:,? (?:obrigad[oa]|quero(?: mais)?))?|cancelar|cancela|desisto)[.!\s]*$/iu.test(texto.trim())) {
          await salvar({ participante:cadastro.participante,adultoSemIdade:cadastro.adultoSemIdade,opcoes: cadastro.opcoes, consulta: cadastro.consulta, turnoSolicitado: cadastro.turnoSolicitado, dataSolicitada: cadastro.dataSolicitada });
          return "Conferência cancelada. Nenhuma reserva foi feita. Se quiser outra data, podemos consultar a agenda.";
        }
        if (/^(?:oi+|ol[aá]+|bom dia|boa tarde|boa noite)[!.\s]*$/iu.test(texto.trim())) {
          const reservas = await reservasDoContato(banco, numero);
          if (reservas.length) return `Olá! Há uma experimental para ${reservas[0].nome} de ${reservas[0].modalidade} em ${formatarOcorrenciaCt(reservas[0].inicio)}. Ficou alguma dúvida sobre seu agendamento?`;
          if (cadastro.reserva && !cadastro.confirmada) return `Olá! Sua preferência é ${formatarOcorrenciaCt(cadastro.reserva.inicio)}. A reserva ainda não foi confirmada. Quer continuar de onde paramos?`;
        }
        return null;
      }
      const dados = acaoAulasSchema.parse(acao);
      if (dados.acao === "consultar") {
        const maisOpcoes = dados.maisOpcoes || pediuAlternativas;
        const agenda = await consultarAulas(banco);
        const normalizar = (v: string) => { const nome = v.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").replace(/[^a-z]/g, ""); return ({ jiu: "jiujitsu", muay: "muaythai", tae: "taekwondo" } as Record<string,string>)[nome] ?? nome; };
        const idade = cadastro.adultoSemIdade ? null : dados.idade ?? cadastro.consulta?.idade ?? null;
        const objetivo = objetivoAtual ?? dados.objetivo ?? cadastro.objetivo;
        const recomendacao = recomendarObjetivo(objetivo, idade, cadastro.participante === "crianca");
        const preferida = modalidadeMencionada(texto) ?? cadastro.modalidadePreferida ?? null;
        const modalidade = preferida ?? (objetivo ? recomendacao?.modalidade ?? dados.modalidade : cadastro.consulta?.modalidade ?? dados.modalidade ?? null);
        let chaveExplicacao = `${objetivo}:${modalidade}`;
        let introducao = objetivo && modalidade && (objetivoAtual || cadastro.objetivoExplicado !== chaveExplicacao) ? explicarBeneficioObjetivo(objetivo,modalidade,idade,cadastro.participante === "crianca") : "";
        const adultoSemIdade = idade === null && (cadastro.adultoSemIdade || cadastro.participante !== "crianca" && dados.adultoSemIdade === true);
        if (idade === null && !adultoSemIdade) {
          await salvar({...cadastro,objetivo,modalidadePreferida:preferida,consulta:{modalidade,idade,mostradas:[]}});
          return (introducao ? introducao+"\n\n" : "") + (cadastro.participante === "crianca" ? "Qual é a idade de quem vai fazer a aula?" : "A aula é para você ou para outra pessoa?");
        }
        const referencia = dataAtual ?? (!cadastro.dataSolicitada && dados.referenciaData ? interpretarDataCt(dados.referenciaData) : null);
        if (referencia?.tipo === "ambigua") return `Qual destas datas você prefere: ${referencia.datas.map(rotuloDataCt).join(" ou ")}?`;
        if (referencia?.tipo === "invalida") return referencia.mensagem;
        const data = referencia?.tipo === "data" ? referencia.data : cadastro.dataSolicitada ?? null;
        if (data && data < dataLocalCt()) return "A data que estávamos consultando já passou. Qual data futura você prefere?";
        const turno = turnoAtual !== undefined ? turnoAtual : cadastro.turnoSolicitado ?? dados.turno ?? null;
        const mostradas = maisOpcoes && turno === (cadastro.consulta?.turno ?? null) && data === (cadastro.consulta?.data ?? null) && normalizar(modalidade ?? "") === normalizar(cadastro.consulta?.modalidade ?? "") && idade === cadastro.consulta?.idade ? cadastro.consulta.mostradas : [];
        const elegivel = (a: Aula) => elegivelParaExperimental(a, idade, adultoSemIdade);
        const disponiveis = agenda.aulas.filter(elegivel).flatMap(a => ocorrenciasAula(a).filter(inicio => (!data || dataLocalCt(Date.parse(inicio)) === data) && correspondeTurno(inicio, turno) && (a.capacidade === null || agenda.reservas.filter(r => r.aulaId === a.id && r.status === "confirmada" && (!r.inicio || Date.parse(r.inicio) === Date.parse(inicio))).length < a.capacidade)).map(inicio => ({ aulaId: a.id, inicio, modalidade: a.modalidade, turma: a.turma })));
        let candidatas = disponiveis.filter(a => !modalidade || normalizar(a.modalidade) === normalizar(modalidade));
        let modalidadeOfertada = modalidade;
        if (!candidatas.length && objetivo && modalidade) {
          const alternativas = alternativasPorObjetivo(objetivo,modalidade).filter(m=>disponiveis.some(a=>a.modalidade===m));
          const alternativa = alternativas.find(m=>disponiveis.some(a=>a.modalidade===m && !mostradas.includes(a.aulaId))) ?? alternativas[0];
          if (alternativa) {
            modalidadeOfertada=alternativa;
            candidatas=disponiveis.filter(a=>a.modalidade===alternativa);
            chaveExplicacao=`${objetivo}:${alternativa}`;
            introducao=objetivoAtual || cadastro.objetivoExplicado!==chaveExplicacao ? explicarBeneficioObjetivo(objetivo,alternativa,idade,cadastro.participante === "crianca",recomendacao?.modalidade) : "";
          }
        }
        const opcoes = selecionarExperimentais(priorizarInfantil(candidatas, idade, modalidade, mostradas), mostradas);
        await salvar({ objetivo,modalidadePreferida:preferida,objetivoExplicado:introducao ? chaveExplicacao : cadastro.objetivoExplicado,participante:cadastro.participante,adultoSemIdade,opcoes, turnoSolicitado: turno, dataSolicitada: data, consulta: { modalidade, idade, adultoSemIdade, turno, data, mostradas: [...mostradas, ...opcoes.map(a => a.aulaId)] } });
        const resposta = opcoes.length ? `${aberturaHorarios(texto, opcoes.length, turno, Boolean(maisOpcoes))}\n\n${opcoes.map((a,i) => `${i+1}. ${a.modalidade} · ${a.turma} · ${formatarOcorrenciaCt(a.inicio)}`).join("\n")}\n\n${opcoes.length === 1 ? "Esse horário funciona pra você?" : "Qual fica melhor pra você?"}` : semHorarios(modalidadeOfertada,turno,data ? rotuloDataCt(data) : null,candidatas.length>0,idade);
        return (introducao ? introducao+"\n\n" : "") + resposta;
      }
      if (cadastro.opcaoEscolhida && dados.opcao !== cadastro.opcaoEscolhida) return "Você tinha escolhido outro horário. Quer manter a escolha anterior ou mudar?";
      const opcao = cadastro.opcoes[dados.opcao - 1];
      if (!opcao) return "Precisamos consultar as datas da agenda novamente antes de reservar.";
      if (cadastro.dataSolicitada && dataLocalCt(Date.parse(opcao.inicio)) !== cadastro.dataSolicitada) return `A opção anterior não é de ${rotuloDataCt(cadastro.dataSolicitada)}. Precisamos consultar a data solicitada antes de reservar.`;
      if (!correspondeTurno(opcao.inicio, cadastro.turnoSolicitado)) return "Precisamos consultar uma aula no turno que você pediu antes de conferir os dados.";
      const idadeAluno = cadastro.adultoSemIdade ? null : dados.idade;
      const adultoSemIdade = idadeAluno === null && (cadastro.adultoSemIdade || cadastro.participante !== "crianca" && dados.adultoSemIdade === true);
      const aluno = alunoSchema.parse({ nome: limparNomeParticipante(dados.nome), idade: idadeAluno, adultoSemIdade, telefone: `+${numero}`, responsavel: adultoSemIdade ? "" : dados.responsavel });
      const agenda = await consultarAulas(banco), aula = agenda.aulas.find(a => a.id === opcao.aulaId);
      if (!aula || !ocorrenciasAula(aula).includes(opcao.inicio) || !elegivelParaExperimental(aula, aluno.idade, aluno.adultoSemIdade)) return "Esta opção precisa de conferência da equipe para a idade informada. Nenhuma reserva foi feita.";
      await salvar({ ...cadastro, aguardandoAlteracao: false, aguardandoAjuda: false, reserva: { aulaId: opcao.aulaId, inicio: opcao.inicio, aluno, solicitacaoId: randomUUID(), conferido: true } });
      return `Confira sua aula experimental:\n\n${aluno.nome}${aluno.idade === null ? " · Adulto" : `, ${aluno.idade} anos`}\n${opcao.modalidade} · ${opcao.turma}\n${formatarOcorrenciaCt(opcao.inicio)}${aluno.responsavel ? `\nResponsável: ${aluno.responsavel}` : ""}\n\nOs dados estão corretos?`;
    } catch (erro) {
      if (erro instanceof ZodError) return `Para continuar, preciso conferir os dados: ${erro.issues[0]?.message ?? "informe os dados completos do participante"}. Nenhuma reserva foi feita.`;
      if (erro instanceof ErroDeNegocio) return `${erro.message} Nenhuma nova reserva foi confirmada.`;
      throw erro;
    }
  };
}
export async function reservasDoContato(banco: BancoSql, numero: string) {
  return linhas<{ nome: string; modalidade: string; inicio: string }>(await banco.execute(sql`SELECT r.nome,a.modalidade,coalesce(r.inicio,a.inicio) inicio FROM atendeia_aulas_reservas r JOIN atendeia_aulas a ON a.id=r.aula_id WHERE r.telefone=${`+${numero}`} AND r.status='confirmada' AND r.is_deleted=false AND a.is_deleted=false AND coalesce(r.inicio,a.inicio)>now() ORDER BY coalesce(r.inicio,a.inicio) LIMIT 5`)).map(r => ({ ...r, inicio: new Date(r.inicio).toISOString() }));
}
