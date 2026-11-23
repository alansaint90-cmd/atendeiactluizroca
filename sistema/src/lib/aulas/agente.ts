import { responderDuvidaCt } from "../ct/duvidas";
import { perguntaMuayInfantil, respostaMuayInfantil } from "../ct/muay-infantil";
import { cancelamentoDoAgente } from "./cancelamento-agente";
import type { ReservaContato } from "./alteracao-reserva";
import { aulaProgramadaCt, consultaSabadoCt, RESPOSTA_SABADO_CT } from "../ct/sabado";
import { confirmacaoFinalAula } from "./confirmacao-final";
import { pediuOutrosDias } from "./outros-dias";
import { pedidoGradeInformativa, apresentarGradeInformativa } from "./grade-informativa";
import { funcionamentoNoDiaCt } from "../ct/funcionamento";
import type { AssuntoCt } from "../ct/politicas";
import { perguntaGradeDia } from "./aceite-consulta";
import { limparNomeParticipante } from "./nome-participante";
import { idadeParticipanteInformada, idadePropriaInformada, idadesNegadas } from "./idade-informada";
import { FalhaAtendimento } from "../agent/falha-humana";
import { escolherHorario } from "./escolha";
import { aberturaHorarios, semHorarios } from "./apresentacao";
import { identificarObjetivo, recomendarObjetivo, explicarBeneficioObjetivo, alternativasPorObjetivo, modalidadeMencionada, intencaoModalidade, type ObjetivoAula } from "./objetivo";
import { identificarParticipante } from "./participante";
import { interpretarTurno, correspondeTurno, type TurnoAula } from "./turno";
import { interpretarDataCt, dataLocalCt, rotuloDataCt, formatarOcorrenciaCt } from "./calendario";
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
interface Cadastro { remarcacao?: ReservaContato; participanteProprio?:boolean; dataAlternativa?:string; assuntoInformativo?:AssuntoCt; consultaPorDia?: boolean; modalidadePendente?: string; modalidadePreferida?: string | null; opcaoEscolhida?: number; objetivo?: ObjetivoAula; objetivoExplicado?: string; participante?: "adulto" | "crianca" | "outraPessoa"; adultoSemIdade?: boolean; turnoSolicitado?: TurnoAula | null; aguardandoAlteracao?: boolean; aguardandoAjuda?: boolean; opcoes: Opcao[]; dataSolicitada?: string | null; consulta?: { modalidade: string | null; idade: number | null; adultoSemIdade?: boolean; mostradas: string[]; turno?: TurnoAula | null; data?: string | null }; reserva?: { aulaId: string; inicio: string; aluno: AlunoDados; solicitacaoId: string; conferido: true }; confirmada?: string }
export function agendaAulasDoAgente(banco: BancoSql, client: Redis, token: string, conversa: string, numero: string, enabled: () => Promise<boolean>) {
  const alterar=cancelamentoDoAgente(banco,client,token,conversa,numero);
  const chave = `atendeia:{evolution}:cadastro-aula:${conversa}`;
  const salvar = async (v: Cadastro) => assertResult(await client.eval(owned + "redis.call('SET', KEYS[2], ARGV[2], 'EX', 604800); return 1", 2, agentKeys.lock, chave, token, JSON.stringify(v)));
  return async function atender(texto: string, acao?: AcaoAulas): Promise<string | null> {
    if (!await enabled()) return null;
    const raw = await client.get(chave); let cadastro: Cadastro = raw ? JSON.parse(raw) as Cadastro : { opcoes: [] };
    try {
      if (!acao) {
        const alteracao=await alterar(texto,cadastro.remarcacao?.id);
        if (alteracao && 'resposta' in alteracao) {
          if(alteracao.manter && cadastro.remarcacao)
            await salvar({opcoes:[],confirmada:cadastro.remarcacao.id,participante:cadastro.participante,adultoSemIdade:cadastro.adultoSemIdade,modalidadePreferida:cadastro.modalidadePreferida});
          if(alteracao.cancelada && (!cadastro.confirmada || cadastro.confirmada===alteracao.cancelada))
            await salvar({opcoes:[],participante:cadastro.participante,adultoSemIdade:cadastro.adultoSemIdade,modalidadePreferida:cadastro.modalidadePreferida});
          return alteracao.resposta;
        }
        if (alteracao && 'remarcar' in alteracao) {
          const r=alteracao.remarcar;
          cadastro={remarcacao:r,participante:r.idade!==null && r.idade<18?'crianca':'adulto',adultoSemIdade:r.adultoSemIdade,
            modalidadePreferida:r.modalidade,opcoes:[],consulta:{modalidade:r.modalidade,idade:r.idade,adultoSemIdade:r.adultoSemIdade,mostradas:[]}};
          await salvar(cadastro);
          if (interpretarDataCt(texto)?.tipo==='data' || interpretarTurno(texto)!==undefined)
            return atender(texto,{acao:'consultar',modalidade:r.modalidade,idade:r.idade,adultoSemIdade:r.adultoSemIdade});
          return "Claro! Para qual dia ou turno você quer mudar a aula? Seu horário atual fica mantido até escolhermos o novo.";
        }
      }
      const objetivoAtual = identificarObjetivo(texto);
      const esperandoIdade=!cadastro.confirmada && !cadastro.reserva && !cadastro.opcoes.length && cadastro.consulta?.idade==null && cadastro.participante==='crianca';
      const idadeInformada = idadeParticipanteInformada(texto,esperandoIdade);
      const detectado = identificarParticipante(texto) ?? (idadeInformada && !cadastro.confirmada && !cadastro.reserva && !cadastro.opcoes.length ? Number(idadeInformada[1])<18 ? "crianca" : "adulto" : null);
      const participanteAtual = detectado === "adulto" && !idadeInformada && cadastro.participanteProprio && cadastro.consulta?.idade != null && cadastro.consulta.idade < 18 && !/sou (?:o |a )?(?:pai|mae|mãe)/iu.test(texto) ? "crianca" : detectado;
      if (!acao && cadastro.consulta?.idade != null && idadesNegadas(texto).includes(cadastro.consulta.idade)) {
        const adulto = participanteAtual === "adulto" || cadastro.participante === "adulto";
        await salvar({...cadastro,participante:participanteAtual ?? cadastro.participante,adultoSemIdade:adulto && !idadeInformada,
          objetivo:undefined,opcoes:[],opcaoEscolhida:undefined,reserva:undefined,turnoSolicitado:undefined,dataSolicitada:null,
          consulta:{modalidade:cadastro.modalidadePreferida ?? null,idade:idadeInformada ? Number(idadeInformada[1]) : null,mostradas:[]}});
        throw new FalhaAtendimento("contexto_idade_contraditorio");
      }
      const idadeMuay=idadeInformada ? Number(idadeInformada[1]) : cadastro.participante==='crianca' && participanteAtual!=='adulto' ? cadastro.consulta?.idade : null;
      if(!acao && perguntaMuayInfantil(texto,idadeMuay)) {
        await salvar({...cadastro,assuntoInformativo:'idadeMuay'});
        return respostaMuayInfantil(idadeMuay);
      }
      const duvida=responderDuvidaCt(texto,cadastro.assuntoInformativo,cadastro.consulta?.modalidade);
      if (!acao && !duvida && consultaSabadoCt(texto)) {
        const agenda=await consultarAulas(banco);
        const data=interpretarDataCt(texto);
        await salvar({...cadastro,assuntoInformativo:undefined,opcoes:[],opcaoEscolhida:undefined,
          ...(!cadastro.confirmada ? {reserva:undefined}:{}),dataAlternativa:undefined,
          dataSolicitada:data?.tipo==="data" ? data.data : null,turnoSolicitado:null,
          ...(cadastro.consulta ? {consulta:{...cadastro.consulta,mostradas:[],turno:null,data:data?.tipo==="data" ? data.data : null}} : {})});
        // Sábado é política do CT inteiro; não reaproveitar modalidade/turno antigos.
        return apresentarGradeInformativa(agenda.aulas,texto,null);
      }
      const modalidadeGrade=modalidadeMencionada(texto) ?? cadastro.modalidadePreferida ?? cadastro.modalidadePendente ?? cadastro.consulta?.modalidade ?? null;
      const gradeDoDia=Boolean(modalidadeGrade) && perguntaGradeDia(texto);
      if (!duvida && !acao && (pedidoGradeInformativa(texto) || gradeDoDia) && (!/^(?:todos|todas)[!.\s]*$/iu.test(texto.trim()) || cadastro.consulta && !cadastro.assuntoInformativo)) {
        const modalidade=modalidadeGrade;
        const turno=interpretarTurno(texto),data=interpretarDataCt(texto);
        const agenda=await consultarAulas(banco);
        const resposta=apresentarGradeInformativa(agenda.aulas,texto,modalidade);
        if(turno!=="ambiguo" && (!data || data.tipo==="data")) await salvar({...cadastro,assuntoInformativo:undefined,consultaPorDia:false,
          modalidadePreferida:modalidade,modalidadePendente:modalidade ?? undefined,objetivo:undefined,objetivoExplicado:undefined,
          opcoes:[],opcaoEscolhida:undefined,...(!cadastro.confirmada ? {reserva:undefined}:{}),dataAlternativa:undefined,
          dataSolicitada:data?.data ?? null,turnoSolicitado:turno ?? null,
          consulta:{modalidade,idade:cadastro.consulta?.idade ?? null,adultoSemIdade:cadastro.adultoSemIdade,mostradas:[],turno:turno ?? null,data:data?.data ?? null}});
        return resposta;
      }
      if (duvida) {
        if (duvida.assunto === "funcionamento") {
          const agenda = await consultarAulas(banco);
          await salvar({...cadastro, assuntoInformativo:"funcionamento"});
          return funcionamentoNoDiaCt(agenda.aulas, texto);
        }
        const idade=idadeInformada, pessoal=idadePropriaInformada(texto) || /\bmeu filh[oa]\b/iu.test(texto);
        await salvar({...cadastro,assuntoInformativo:duvida.assunto,...(idade && pessoal ? {participanteProprio:idadePropriaInformada(texto),participante:Number(idade[1])<18?"crianca" as const:"adulto" as const,adultoSemIdade:false,consulta:{...cadastro.consulta,modalidade:cadastro.consulta?.modalidade ?? null,idade:Number(idade[1]),mostradas:[]},opcoes:[],opcaoEscolhida:undefined,reserva:undefined}: {})});
        return duvida.resposta;
      }
      const outrosDias=pediuOutrosDias(texto);
      if (!acao && outrosDias && cadastro.consulta && !cadastro.confirmada) {
        const turno=interpretarTurno(texto);
        if (turno === "ambiguo") return "Você prefere de manhã, à tarde ou à noite?";
        cadastro={...cadastro,dataSolicitada:null,dataAlternativa:undefined,reserva:undefined,opcaoEscolhida:undefined,
          turnoSolicitado:turno !== undefined ? turno : cadastro.turnoSolicitado,
          consulta:{...cadastro.consulta,data:null}};
        await salvar(cadastro);
        return atender(texto,{acao:"consultar",modalidade:modalidadeMencionada(texto) ?? cadastro.consulta!.modalidade,idade:cadastro.consulta!.idade,maisOpcoes:true});
      }
      const interesse = intencaoModalidade(texto);
      if (!acao && (interesse.modalidade || cadastro.consulta?.modalidade && interesse.negadas.includes(cadastro.consulta.modalidade))) {
        const modalidade = interesse.modalidade;
        if (modalidade !== cadastro.consulta?.modalidade || modalidade !== cadastro.modalidadePreferida) {
          const mudouModalidade = modalidade !== cadastro.consulta?.modalidade;
          cadastro = {...cadastro, consultaPorDia:false, modalidadePendente:modalidade ?? undefined, modalidadePreferida:modalidade, ...(mudouModalidade ? {opcoes:[], opcaoEscolhida:undefined, consulta:{...cadastro.consulta, modalidade, idade:cadastro.consulta?.idade ?? null, mostradas:[]}} : {})};
          await salvar(cadastro);
        }
      }
      if (!acao && participanteAtual && (participanteAtual !== cadastro.participante || cadastro.confirmada && /pra mim|para mim|tamb[eé]m/iu.test(texto))) {
        const novoTurno = interpretarTurno(texto), novaData = interpretarDataCt(texto);
        const primeiraIdentificacao = cadastro.participante === undefined && !cadastro.confirmada && !cadastro.reserva || esperandoIdade && Boolean(idadeInformada);
        cadastro = {
          participanteProprio:idadeInformada && idadePropriaInformada(texto) ? true : primeiraIdentificacao ? cadastro.participanteProprio : /\b(?:pra|para) mim\b|\bsou eu\b/iu.test(texto),
          consultaPorDia:primeiraIdentificacao ? cadastro.consultaPorDia : false,
          objetivo:objetivoAtual ?? (primeiraIdentificacao ? cadastro.objetivo : undefined),
          modalidadePreferida:primeiraIdentificacao ? cadastro.modalidadePreferida : interesse.modalidade ?? cadastro.modalidadePendente,
          opcoes:primeiraIdentificacao ? cadastro.opcoes : [],
          consulta:primeiraIdentificacao ? cadastro.consulta : (interesse.modalidade ?? cadastro.modalidadePendente) ? {modalidade:interesse.modalidade ?? cadastro.modalidadePendente ?? null, idade:idadeInformada ? Number(idadeInformada[1]) : null, mostradas:[]} : undefined,
          participante:participanteAtual,
          adultoSemIdade:participanteAtual === "adulto" && !idadeInformada && !(primeiraIdentificacao && cadastro.consulta?.idade != null),
          turnoSolicitado:novoTurno === "ambiguo" ? null : novoTurno !== undefined ? novoTurno : primeiraIdentificacao ? cadastro.turnoSolicitado : undefined,
          dataSolicitada:novaData?.tipo === "data" ? novaData.data : primeiraIdentificacao ? cadastro.dataSolicitada : null,
        };
        await salvar(cadastro);
      }
      if (!acao && idadeInformada) {
        cadastro={...cadastro,adultoSemIdade:false,consulta:{...cadastro.consulta,modalidade:cadastro.consulta?.modalidade ?? cadastro.modalidadePreferida ?? null,idade:Number(idadeInformada[1]),mostradas:cadastro.consulta?.mostradas ?? []}};
        await salvar(cadastro);
      }
      if (!acao && perguntaGradeDia(texto)) {
        cadastro={...cadastro,consultaPorDia:true,modalidadePreferida:null,modalidadePendente:undefined,objetivo:undefined,
          opcoes:[],opcaoEscolhida:undefined,reserva:undefined,consulta:{modalidade:null,idade:cadastro.consulta?.idade ?? null,mostradas:[]}};
        await salvar(cadastro);
        return atender(texto,{acao:"consultar",modalidade:null,idade:idadeInformada ? Number(idadeInformada[1]) : cadastro.consulta?.idade ?? null});
      }
      if (!acao && cadastro.consultaPorDia && (participanteAtual === "adulto" || idadeInformada && cadastro.participante)) return atender(texto,{acao:"consultar",modalidade:null,idade:idadeInformada ? Number(idadeInformada[1]) : cadastro.consulta?.idade ?? null});
      if (!acao && interesse.modalidade) return atender(texto,{acao:"consultar",modalidade:interesse.modalidade,idade:idadeInformada?Number(idadeInformada[1]):cadastro.consulta?.idade ?? null});
      if (!acao && !cadastro.confirmada && !cadastro.reserva && cadastro.consulta?.modalidade && (participanteAtual === "adulto" || idadeInformada && cadastro.participante)) return atender(texto,{acao:"consultar",modalidade:cadastro.consulta.modalidade,idade:idadeInformada?Number(idadeInformada[1]):cadastro.consulta.idade});
      if (!acao && idadeInformada && Number(idadeInformada[1])<12 && cadastro.participante==='crianca' && !cadastro.confirmada && !cadastro.reserva && !cadastro.consulta?.modalidade)
        return atender(texto,{acao:'consultar',modalidade:'Taekwondo',idade:Number(idadeInformada[1])});
      if (!acao && participanteAtual === "adulto" && cadastro.objetivo) return atender(texto,{acao:"consultar",modalidade:null,idade:null});
      if (!acao && participanteAtual === "adulto" && !cadastro.consulta?.modalidade && !/taekwondo|muay|jiu/iu.test(texto) && !/onde|valor|pre[cç]o|pagamento/iu.test(texto)) return "Claro! Qual modalidade você gostaria de experimentar?";
      if (!acao && participanteAtual === "crianca" && !idadeInformada && cadastro.consulta?.idade == null && cadastro.reserva?.aluno.idade == null && !/onde|valor|pre[cç]o|pagamento/iu.test(texto)) return "Qual é a idade de quem vai fazer a aula?";
      if (!acao && objetivoAtual) { cadastro.objetivo=objetivoAtual; await salvar(cadastro);
        return atender(texto,{acao:"consultar",modalidade:modalidadeMencionada(texto),idade:idadeInformada ? Number(idadeInformada[1]) : cadastro.consulta?.idade ?? null});
      }
      const pediuAlternativas = outrosDias || /(?:outr[oa]s?|mais)\s+(?:hor[aá]rios?|op[cç][aã]o|op[cç][oõ]es|alternativas?)|n[aã]o (?:posso|consigo|d[aá]|serve)|dif[ií]cil/iu.test(texto);
      const turnoAtual = interpretarTurno(texto);
      if (turnoAtual === "ambiguo") return "Você prefere de manhã, à tarde ou à noite?";
      if (!acao && turnoAtual !== undefined) { cadastro.turnoSolicitado = turnoAtual; await salvar(cadastro); }
      if (!acao && turnoAtual !== undefined && cadastro.consulta && !cadastro.confirmada && !/remarc|cancel/iu.test(texto)) return atender(texto, {acao:"consultar",modalidade:cadastro.consulta.modalidade,idade:cadastro.consulta.idade,maisOpcoes:pediuAlternativas});
      const perguntaCalendario = /(?:que|qual)\s+(?:dia|data)|qual\s+(?:é|e)\s+(?:o dia|a data)/iu.test(texto) && !/agendar|marcar|aula|experimental|treinar|treino|hor[aá]rio/iu.test(texto);
      const dataAtual = perguntaCalendario || outrosDias ? null : interpretarDataCt(texto);
      if (dataAtual?.tipo === "ambigua") return `Você mencionou mais de uma data: ${dataAtual.datas.map(rotuloDataCt).join(" ou ")}. Qual delas você prefere?`;
      if (dataAtual?.tipo === "invalida") return dataAtual.mensagem;
      if (!acao && /(?:outr[oa]s? (?:datas?|dias?)|qualquer dia|sem prefer[eê]ncia de data)/iu.test(texto)) { cadastro.dataSolicitada = null; await salvar(cadastro); }
      if (!acao && dataAtual?.tipo === "data") { cadastro.dataSolicitada = dataAtual.data; await salvar(cadastro); }
      if (!acao && dataAtual?.tipo === "data" && cadastro.consulta && !cadastro.confirmada && !/remarc|cancel/iu.test(texto)) return atender(texto,{acao:"consultar",modalidade:cadastro.consulta.modalidade,idade:cadastro.consulta.idade,referenciaData:texto.slice(0,160),maisOpcoes:pediuAlternativas});
      if (!acao && cadastro.dataAlternativa && !cadastro.assuntoInformativo && /^(?:sim|quero(?: sim)?|pode ser)[.!\s]*$/iu.test(texto.trim())) {
        cadastro={...cadastro,dataSolicitada:cadastro.dataAlternativa,consulta:cadastro.consulta ? {...cadastro.consulta,data:cadastro.dataAlternativa}:undefined,dataAlternativa:undefined};
        await salvar(cadastro);
        return cadastro.opcoes.length === 1 ? atender("1") : "Qual desses horários fica melhor pra você?";
      }
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
        const resultado = await reservarAula(banco, cadastro.reserva, systemUserId,cadastro.remarcacao);
        await salvar({ ...cadastro, remarcacao:undefined,confirmada: resultado.id, aguardandoAjuda: false });
        const a = cadastro.opcoes.find(o => o.aulaId === cadastro.reserva?.aulaId && o.inicio === cadastro.reserva?.inicio);
        return confirmacaoFinalAula(a?.modalidade ?? "artes marciais",cadastro.reserva.inicio);
      }
      if (!acao) {
        if (!cadastro.reserva && !cadastro.confirmada && !pediuAlternativas && cadastro.opcoes.length) {
          const escolha = escolherHorario(texto,cadastro.opcoes);
          if (escolha === "ambigua") return "Esse horário aparece em mais de uma opção. Qual delas você prefere?";
          if (escolha !== null) {
            const opcao=cadastro.opcoes[escolha-1];
            if (!correspondeTurno(opcao.inicio,cadastro.turnoSolicitado) || Date.parse(opcao.inicio)<=Date.now()) return "Vou precisar consultar de novo esse horário antes de seguir.";
            if (cadastro.dataAlternativa) cadastro={...cadastro,dataSolicitada:dataLocalCt(Date.parse(opcao.inicio)),dataAlternativa:undefined};
            await salvar({...cadastro,modalidadePendente:undefined,opcaoEscolhida:escolha});
            if(cadastro.remarcacao) {
              const r=cadastro.remarcacao;
              return atender(texto,{acao:'preparar',opcao:escolha,nome:r.nome,idade:r.idade,adultoSemIdade:r.adultoSemIdade,responsavel:r.responsavel});
            }
            const horario=new Date(opcao.inicio).toLocaleTimeString("pt-BR",{timeZone:"America/Bahia",hour:"2-digit",minute:"2-digit"});
            const pedirIdade=!cadastro.adultoSemIdade && cadastro.consulta?.idade == null;
            return `Boa! Vamos de ${horario}.\n\nPara reservar esse horário, qual o nome completo do participante${pedirIdade ? " e a idade" : ""}?`;
          }
        }
        if (cadastro.consultaPorDia && !cadastro.assuntoInformativo && !cadastro.reserva && !cadastro.confirmada && /^(?:sim|quero(?: sim)?|pode ser)[.!\s]*$/iu.test(texto.trim())) {
          if (!cadastro.adultoSemIdade && cadastro.consulta?.idade == null) return cadastro.participante === "crianca" ? "Qual é a idade de quem vai fazer a aula?" : "A aula seria para você ou para outra pessoa?";
          if (cadastro.opcaoEscolhida) return "Qual é o nome completo do participante?";
          if (cadastro.opcoes.length === 1 && !cadastro.opcaoEscolhida) return atender("1");
          if (cadastro.opcoes.length > 1) return "Qual desses horários fica melhor pra você?";
          return atender(texto,{acao:"consultar",modalidade:cadastro.consulta?.modalidade ?? null,idade:cadastro.consulta?.idade ?? null});
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
        if (modalidade === "Muay Thai" && idade !== null && idade < 14) {
          await salvar({...cadastro,assuntoInformativo:'idadeMuay',opcoes:[],opcaoEscolhida:undefined,
            ...(!cadastro.confirmada ? {reserva:undefined}:{}),consulta:{...cadastro.consulta,modalidade,idade,mostradas:[]}});
          return respostaMuayInfantil(idade);
        }
        let chaveExplicacao = `${objetivo}:${modalidade}`;
        let introducao = objetivo && modalidade && (objetivoAtual || cadastro.objetivoExplicado !== chaveExplicacao) ? explicarBeneficioObjetivo(objetivo,modalidade,idade,cadastro.participante === "crianca") : "";
        const adultoSemIdade = idade === null && (cadastro.adultoSemIdade || cadastro.participante !== "crianca" && dados.adultoSemIdade === true);
        if (idade === null && !adultoSemIdade) {
          await salvar({...cadastro,objetivo,modalidadePendente:interesse.modalidade ?? cadastro.modalidadePendente,modalidadePreferida:preferida,turnoSolicitado:turnoAtual !== undefined ? turnoAtual : cadastro.turnoSolicitado,dataSolicitada:dataAtual?.tipo === "data" ? dataAtual.data : cadastro.dataSolicitada,consulta:{modalidade,idade,mostradas:[]}});
          if (cadastro.consultaPorDia && dataAtual?.tipo === "data") {
            const modalidades=[...new Set(agenda.aulas.filter(a=>ocorrenciasAula(a).some(inicio=>dataLocalCt(Date.parse(inicio))===dataAtual.data)).map(a=>a.modalidade))];
            return (modalidades.length ? `Nesse dia temos ${modalidades.join(", ")}!\n\n` : "") + (cadastro.participante === "crianca" ? "Qual é a idade de quem vai fazer a aula?" : "A aula é para você ou para outra pessoa?");
          }
          const existe = interesse.modalidade && agenda.aulas.some(a=>normalizar(a.modalidade)===normalizar(interesse.modalidade!));
          return (existe ? `Temos ${interesse.modalidade}, sim!\n\n` : "") + (introducao ? introducao+"\n\n" : "") + (cadastro.participante === "crianca" ? "Qual é a idade de quem vai fazer a aula?" : "A aula é para você ou para outra pessoa?");
        }
        const referencia = dataAtual ?? (!outrosDias && !cadastro.dataSolicitada && dados.referenciaData ? interpretarDataCt(dados.referenciaData) : null);
        if (referencia?.tipo === "ambigua") return `Qual destas datas você prefere: ${referencia.datas.map(rotuloDataCt).join(" ou ")}?`;
        if (referencia?.tipo === "invalida") return referencia.mensagem;
        const data = referencia?.tipo === "data" ? referencia.data : cadastro.dataSolicitada ?? null;
        if (data && data < dataLocalCt()) return "A data que estávamos consultando já passou. Qual data futura você prefere?";
        const turno = turnoAtual !== undefined ? turnoAtual : cadastro.turnoSolicitado ?? dados.turno ?? null;
        const mostradas = maisOpcoes && turno === (cadastro.consulta?.turno ?? null) && data === (cadastro.consulta?.data ?? null) && normalizar(modalidade ?? "") === normalizar(cadastro.consulta?.modalidade ?? "") && idade === cadastro.consulta?.idade ? cadastro.consulta.mostradas : [];
        const elegivel = (a: Aula) => elegivelParaExperimental(a, idade, adultoSemIdade) && !(a.modalidade === "Muay Thai" && idade !== null && idade < 14);
        const todasDisponiveis = agenda.aulas.filter(elegivel).flatMap(a => ocorrenciasAula(a).filter(inicio => !(cadastro.remarcacao?.aulaId === a.id && Date.parse(cadastro.remarcacao.inicio) === Date.parse(inicio)) && correspondeTurno(inicio, turno) && (a.capacidade === null || agenda.reservas.filter(r => r.aulaId === a.id && r.status === "confirmada" && (!r.inicio || Date.parse(r.inicio) === Date.parse(inicio))).length < a.capacidade)).map(inicio => ({ aulaId: a.id, inicio, modalidade: a.modalidade, turma: a.turma })));
        const diasAnteriores=outrosDias ? new Set(cadastro.opcoes.map(a=>new Date(Date.parse(a.inicio)-3*3600000).getUTCDay())) : new Set<number>();
        const disponiveis=todasDisponiveis.filter(a=>(!data || dataLocalCt(Date.parse(a.inicio))===data) && !diasAnteriores.has(new Date(Date.parse(a.inicio)-3*3600000).getUTCDay()));
        let candidatas = disponiveis.filter(a => !modalidade || normalizar(a.modalidade) === normalizar(modalidade));
        let modalidadeOfertada = modalidade;
        if (!candidatas.length && objetivo && modalidade && !preferida) {
          const alternativas = alternativasPorObjetivo(objetivo,modalidade).filter(m=>disponiveis.some(a=>a.modalidade===m));
          const alternativa = alternativas.find(m=>disponiveis.some(a=>a.modalidade===m && !mostradas.includes(a.aulaId))) ?? alternativas[0];
          if (alternativa) {
            modalidadeOfertada=alternativa;
            candidatas=disponiveis.filter(a=>a.modalidade===alternativa);
            chaveExplicacao=`${objetivo}:${alternativa}`;
            introducao=objetivoAtual || cadastro.objetivoExplicado!==chaveExplicacao ? explicarBeneficioObjetivo(objetivo,alternativa,idade,cadastro.participante === "crianca",recomendacao?.modalidade) : "";
          }
        }
        let dataAlternativa:string|undefined;
        if (!candidatas.length && data) {
          const futuras=todasDisponiveis.filter(a=>(!modalidadeOfertada || normalizar(a.modalidade)===normalizar(modalidadeOfertada)) && dataLocalCt(Date.parse(a.inicio))>data).sort((a,b)=>a.inicio.localeCompare(b.inicio));
          if (futuras.length) { dataAlternativa=dataLocalCt(Date.parse(futuras[0].inicio)); candidatas=futuras.filter(a=>dataLocalCt(Date.parse(a.inicio))===dataAlternativa); }
        }
        const opcoes = selecionarExperimentais(priorizarInfantil(candidatas, idade, modalidade, mostradas), mostradas);
        const horariosJaConhecidos=outrosDias && todasDisponiveis.some(a=>!modalidadeOfertada || normalizar(a.modalidade)===normalizar(modalidadeOfertada));
        await salvar({ remarcacao:cadastro.remarcacao,participanteProprio:cadastro.participanteProprio,dataAlternativa,assuntoInformativo:undefined,consultaPorDia:cadastro.consultaPorDia,objetivo,modalidadePendente:interesse.modalidade ?? cadastro.modalidadePendente,modalidadePreferida:preferida,objetivoExplicado:introducao ? chaveExplicacao : cadastro.objetivoExplicado,participante:cadastro.participante,adultoSemIdade,opcoes, turnoSolicitado: turno, dataSolicitada: data, consulta: { modalidade, idade, adultoSemIdade, turno, data, mostradas: [...mostradas, ...opcoes.map(a => a.aulaId)] } });
        const resposta = opcoes.length ? `${dataAlternativa ? `Para ${rotuloDataCt(data!)} não temos turma${modalidadeOfertada ? ` de ${modalidadeOfertada}` : ""}${turno ? " no período que você pediu" : ""}${idade !== null ? " para essa idade" : ""}. Mas temos estas próximas aulas:` : outrosDias ? "Também temos:" : aberturaHorarios(texto, opcoes.length, turno, Boolean(maisOpcoes))}\n\n${opcoes.map((a,i) => `${i+1}. ${a.modalidade} · ${a.turma} · ${formatarOcorrenciaCt(a.inicio)}`).join("\n")}\n\n${opcoes.length === 1 ? "Esse horário funciona pra você?" : "Qual fica melhor pra você?"}` : semHorarios(modalidadeOfertada,turno,data ? rotuloDataCt(data) : null,candidatas.length>0 || horariosJaConhecidos,idade);
        const existeModalidade = preferida && !candidatas.length && agenda.aulas.some(a=>normalizar(a.modalidade)===normalizar(preferida));
        return (introducao ? introducao+"\n\n" : "") + (existeModalidade ? `Temos aulas de ${preferida} no CT. ` : "") + resposta;
      }
      if (cadastro.opcaoEscolhida && dados.opcao !== cadastro.opcaoEscolhida) return "Você tinha escolhido outro horário. Quer manter a escolha anterior ou mudar?";
      const opcao = cadastro.opcoes[dados.opcao - 1];
      if (!opcao) throw new FalhaAtendimento("agenda_inconsistente");
      if (Date.parse(opcao.inicio)<=Date.now()) {
        await salvar({...cadastro,opcoes:[],opcaoEscolhida:undefined,reserva:undefined});
        return "Esse horário já passou. Precisamos escolher uma próxima aula antes de agendar. Nenhuma reserva foi feita.";
      }
      if (cadastro.dataSolicitada && dataLocalCt(Date.parse(opcao.inicio)) !== cadastro.dataSolicitada) return `A opção anterior não é de ${rotuloDataCt(cadastro.dataSolicitada)}. Precisamos consultar a data solicitada antes de reservar.`;
      if (!correspondeTurno(opcao.inicio, cadastro.turnoSolicitado)) return "Precisamos consultar uma aula no turno que você pediu antes de conferir os dados.";
      if (!cadastro.opcaoEscolhida) return "Qual dos horários apresentados você quer agendar?";
      const idadeAluno = cadastro.adultoSemIdade ? null : dados.idade;
      if (opcao.modalidade === "Muay Thai" && idadeAluno !== null && idadeAluno < 14) throw new FalhaAtendimento("muay_adaptado");
      const adultoSemIdade = idadeAluno === null && (cadastro.adultoSemIdade || cadastro.participante !== "crianca" && dados.adultoSemIdade === true);
      const aluno = alunoSchema.parse({ nome: limparNomeParticipante(dados.nome), idade: idadeAluno, adultoSemIdade, telefone: `+${numero}`, responsavel: adultoSemIdade ? "" : dados.responsavel });
      const agenda = await consultarAulas(banco), aula = agenda.aulas.find(a => a.id === opcao.aulaId);
      if (aula && !aulaProgramadaCt(aula)) {
        await salvar({...cadastro,opcoes:[],opcaoEscolhida:undefined,reserva:undefined});
        return RESPOSTA_SABADO_CT;
      }
      if (!aula || !ocorrenciasAula(aula).includes(opcao.inicio) || !elegivelParaExperimental(aula, aluno.idade, aluno.adultoSemIdade)) return "Esta opção precisa de conferência da equipe para a idade informada. Nenhuma reserva foi feita.";
      const anterior=cadastro.reserva;
      const reserva=anterior && anterior.aulaId===opcao.aulaId && anterior.inicio===opcao.inicio && JSON.stringify(anterior.aluno)===JSON.stringify(aluno)
        ? anterior : {aulaId:opcao.aulaId,inicio:opcao.inicio,aluno,solicitacaoId:randomUUID(),conferido:true as const};
      await salvar({...cadastro,modalidadePendente:undefined,aguardandoAlteracao:false,aguardandoAjuda:false,reserva});
      const resultado=await reservarAula(banco,reserva,systemUserId,cadastro.remarcacao);
      await salvar({...cadastro,remarcacao:undefined,modalidadePendente:undefined,aguardandoAlteracao:false,aguardandoAjuda:false,reserva,confirmada:resultado.id});
      return confirmacaoFinalAula(opcao.modalidade,opcao.inicio);
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
