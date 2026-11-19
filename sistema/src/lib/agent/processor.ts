import { FalhaAtendimento } from "./falha-humana";
import { escalarFalha } from "./escalonamento";
import type { EntradaFluxo } from "../fluxos/schema";
import type { AcaoAulas } from "../aulas/agente-schema";
import { dividirResposta, mensagensDaAula } from "./blocos";
import type { AgentConfig } from "./config";
import type { IncomingMessage } from "./message";
import { digest } from "./message";
import { ProviderError, type Turn, type RespostaGerada } from "./providers";
import { extrairNomeInformado, instrucoesComNome, respostaComNome, personaDoAgente, mesmoNome, removerRotuloDaPersona } from "./nome";
import { deveConsultarAgenda } from "../consultas/intencao";
import { correspondeAoGatilho } from "./ativacao";
import { mensagensDaConsulta } from "../consultas/fluxo";

export interface DeliveryState { escalar?: boolean; fluxo?: {id:string;versao:number}; status: "gerando" | "gerada" | "enviando" | "enviada" | "incerta" | "falhou"; attempts: number; reply?: string; partes?: string[]; providerIds?: string[]; transcript?: string; code?: string; configHash?: string; providerId?: string; transferencia?: boolean; consulta?: boolean }
export interface ProcessingPort {
  fluxoEntrada?(texto:string):Promise<EntradaFluxo|null>;
  fluxoValido?(alvo:{id:string;versao:number}):Promise<boolean>;
  read(): Promise<DeliveryState | null>;
  write(state: DeliveryState): Promise<void>;
  history(): Promise<Turn[]>;
  contactName?(): Promise<string | null>;
  rememberName?(name: string): Promise<void>;
  complete(state: DeliveryState, turns: Turn[]): Promise<void>;
  enabled(): Promise<boolean>;
  autorizarAtivacao?(gatilho: string): Promise<boolean>;
  transcribe?(config: AgentConfig, message: IncomingMessage): Promise<string>;
  transferir?(destino: string): Promise<void>;
  falhaHumana?(codigo: string): Promise<void>;
  aulaExperimental?(texto: string, acao?: AcaoAulas): Promise<string | null>;
  contextoPersistido?(): Promise<string>;
  cadastroConsulta?(texto: string, iniciar: boolean): Promise<string | null>;
  generate(config: AgentConfig, history: Turn[], text: string): Promise<RespostaGerada>;
  send(config: AgentConfig, number: string, text: string): Promise<string>;
  registrarParte?(id: string, texto: string): Promise<void>;
}

export async function processMessage(message: IncomingMessage, config: AgentConfig, port: ProcessingPort): Promise<string> {
  let state = await port.read();
  if (state?.status === "enviada" || state?.status === "incerta" || state?.status === "falhou") {
    if (state.status !== "enviada") await escalarFalha(config,port,state);
    return state.status;
  }
  // Não repetir um envio cujo resultado se perdeu durante queda ou timeout.
  if (state?.status === "enviando") {
    const interrompido: DeliveryState = { ...state, status: "incerta", code: "envio_interrompido", escalar:true };
    await port.write(interrompido);
    await escalarFalha(config,port,interrompido);
    return "incerta";
  }
  if (!await port.enabled()) return "pausada";
  if (config.AI_ACTIVATION_TRIGGER && !await port.autorizarAtivacao?.(config.AI_ACTIVATION_TRIGGER)) return "aguardando_gatilho";
  const configHash = digest(JSON.stringify(config));
  const revisao = digest(config.AI_SYSTEM_PROMPT);
  if (state?.configHash !== configHash) {
    if (state?.providerIds?.length) {
      await port.write({ ...state, status: "falhou", code: "configuracao_alterada_entre_partes" }); return "falhou";
    }
    state = null;
  }
  if ((state?.attempts ?? 0) >= 3 && !state?.reply) {
    await port.write({ ...state!, status: "falhou", code: "limite_tentativas" });
    return "falhou";
  }
  if (!state?.reply) {
    const attempts = (state?.attempts ?? 0) + 1;
    let transcript = state?.transcript;
    await port.write({ status: "gerando", attempts, configHash, transcript });
    let reply: string;
    let transferencia = false;
    let consulta = false;
    let fluxo: {id:string;versao:number}|undefined;
    let partes: string[] | undefined;
    try {
      if (message.audio && !transcript) {
        if (!port.transcribe) throw new ProviderError("audio_transcricao_indisponivel");
        const candidate = (await port.transcribe(config, message)).trim();
        if (!candidate || candidate.length > 12000) throw new ProviderError("audio_transcricao_invalida");
        transcript = candidate;
        await port.write({ status: "gerando", attempts, configHash, transcript });
        if (!await port.enabled()) return "pausada";
      }
      const historico = await port.history();
      const persona = personaDoAgente(config.AI_SYSTEM_PROMPT);
      const candidato = extrairNomeInformado(transcript ?? message.text, historico);
      const apresentacaoExplicita = extrairNomeInformado(transcript ?? message.text, []);
      const informado = mesmoNome(candidato, persona) && !apresentacaoExplicita ? null : candidato;
      const salvo = await port.contactName?.() ?? null;
      const confirmadoNoHistorico = historico.some(turno => turno.role === "user" && mesmoNome(extrairNomeInformado(turno.content, []), salvo));
      const nome = informado ?? (mesmoNome(salvo, persona) && !confirmadoNoHistorico ? null : salvo);
      if (informado && port.rememberName) await port.rememberName(informado);
      const memoria = await port.contextoPersistido?.() ?? "";
      const instrucoes = `${memoria}\n${instrucoesComNome(config.AI_SYSTEM_PROMPT, nome, historico.length === 0, !config.agendaAulas)}\nResponda primeiro à pergunta atual do cliente, de forma direta e objetiva. Não condicione informações sobre valor, pagamento, endereço da clínica, atendimento ou disponibilidade ao preenchimento do cadastro. Depois de esclarecer a dúvida, retome o fluxo na etapa em que parou, perguntando apenas o próximo dado pendente, sem reiniciar a conversa nem pedir novamente dados já informados. Se o cliente não quiser continuar, respeite a decisão. Não repita perguntas de cadastro no lugar da resposta solicitada. Não use o nome da assistente como rótulo ou prefixo das mensagens. Preserve a apresentação natural no início da conversa.`;
      // Preservar o histórico armazenado, mas não ensinar novamente uma persona ou roteiro antigo.
      const contextoAtual = persona ? historico.filter(turno => turno.role === "user" || turno.revisao === revisao) : historico;
      const saudacao = /^(?:oi+|ol[aá]+|bom dia|boa tarde|boa noite)[\s!.😊👋]*$/iu.test((transcript ?? message.text).trim());
      if (!historico.length && !message.midia && ((!nome && saudacao) || Boolean(config.AI_ACTIVATION_TRIGGER && correspondeAoGatilho(message, config.AI_ACTIVATION_TRIGGER))) && config.openingMessages?.length) partes = config.openingMessages;
      const respostaAula = config.agendaAulas ? await port.aulaExperimental?.(transcript ?? message.text) : null;
      if (!respostaAula && !historico.length && !message.midia && !/RESERVAS CONFIRMADAS NO BANCO/.test(memoria)) {
        const entrada = await port.fluxoEntrada?.(transcript ?? message.text);
        if(entrada){fluxo={id:entrada.id,versao:entrada.versao};partes=entrada.mensagens;}
      }
      let cadastro = respostaAula ?? (!partes && config.agendaConsultas && port.cadastroConsulta ? await port.cadastroConsulta(transcript ?? message.text, false) : null);
      if (!partes && !cadastro && config.agendaConsultas && port.cadastroConsulta && deveConsultarAgenda(transcript ?? message.text, historico)) {
        cadastro = await port.cadastroConsulta(transcript ?? message.text, true);
      }
      const gerada = cadastro ?? (partes ? partes.join("\n\n") : message.midia && config.atendimento?.transferMedia ? { transferir: true as const }
        : await port.generate({ ...config, AI_SYSTEM_PROMPT: instrucoes }, contextoAtual, transcript ?? message.text));
      if (cadastro) { consulta = true; partes = undefined; reply = cadastro; }
      else if (typeof gerada !== "string" && "falhaAtendimento" in gerada) {
        throw new FalhaAtendimento("inconsistencia_identificada_ia");
      } else if (typeof gerada !== "string" && "aula" in gerada) {
        const resposta = await port.aulaExperimental?.(transcript ?? message.text, gerada.aula);
        if (!resposta) throw new ProviderError("agenda_aulas_indisponivel");
        reply = resposta; partes = mensagensDaAula(reply);
      } else if (typeof gerada !== "string" && "agendar" in gerada) {
        if (!config.agendaConsultas || !port.cadastroConsulta) throw new ProviderError("agenda_indisponivel");
        const inicio = await port.cadastroConsulta(transcript ?? message.text, true);
        if (!inicio) throw new ProviderError("agenda_indisponivel");
        consulta = true; reply = inicio;
      } else if (typeof gerada !== "string") {
        if (!(config.atendimento?.transferHuman || (message.midia && config.atendimento?.transferMedia)) || !port.transferir) throw new ProviderError("transferencia_indisponivel");
        transferencia = true;
        reply = config.atendimento.transferNotice.replace(/\[(?:NOME|NOME DO CLIENTE)\]|\{NOME\}/giu, nome?.split(" ")[0] ?? "").trim()
          || "Vou encaminhar seu atendimento para nossa equipe.";
      } else reply = partes ? gerada : removerRotuloDaPersona(respostaComNome(gerada, nome, !config.agendaAulas), persona);
      if (consulta) partes = mensagensDaConsulta(reply);
      if (respostaAula) partes = mensagensDaAula(reply);
    }
    catch (error) {
      const code = error instanceof ProviderError || error instanceof FalhaAtendimento ? error.code : "geracao_falhou";
      const falhou = attempts >= 3 || error instanceof FalhaAtendimento;
      const falha: DeliveryState = {status:falhou ? "falhou" : "gerando",attempts,code,configHash,transcript,escalar:falhou};
      await port.write(falha);
      if (falhou) await escalarFalha(config,port,falha);
      return falhou ? "falhou" : "repetir";
    }
    state = { status: "gerada", attempts, reply, partes, configHash, transcript, transferencia, consulta, fluxo };
    await port.write(state);
  }
  if (!await port.enabled()) return "pausada";
  if (!state.partes && !state.transferencia && /\[(?:NOME|NOME DO CLIENTE)\]|\{NOME\}/iu.test(state.reply!)) {
    state = { ...state, reply: respostaComNome(state.reply!, await port.contactName?.() ?? null, !config.agendaAulas) };
    await port.write(state);
  }
  const semRotulo = state.transferencia || state.partes || state.consulta ? state.reply! : removerRotuloDaPersona(state.reply!, personaDoAgente(config.AI_SYSTEM_PROMPT));
  if (semRotulo !== state.reply) {
    state = { ...state, reply: semRotulo };
    await port.write(state);
  }
  const partes = state.partes ?? dividirResposta(state.reply!);
  if (!state.partes) { state = { ...state, partes }; await port.write(state); }
  for (let indice = state.providerIds?.length ?? 0; indice < partes.length; indice++) {
    if (!await port.enabled()) return "pausada";
    if(state.fluxo && !await port.fluxoValido?.(state.fluxo)){await port.write({...state,status:"falhou",code:"fluxo_alterado"});return "falhou";}
    await port.write({ ...state, status: "enviando" });
    // Reserva antes de cada saída; entrega incerta nunca é repetida.
    if (state.transferencia) await port.transferir!(config.atendimento!.destination);
    try {
      state.providerId = await port.send(config, message.number, partes[indice]);
      await port.registrarParte?.(state.providerId, partes[indice]);
    } catch (error) {
      const falha: DeliveryState = { ...state, status: "incerta", code: error instanceof ProviderError ? error.code : "envio_incerto", escalar:true };
      await port.write(falha);
      await escalarFalha(config,port,falha);
      return "incerta";
    }
    state = { ...state, providerIds: [...(state.providerIds ?? []), state.providerId!] };
    if (indice < partes.length - 1) await port.write({ ...state, status: "gerada" });
  }
  // Estado e histórico são confirmados juntos. Se falhar, permanece "enviando".
  await port.complete({ ...state, status: "enviada" }, [
    { role: "user", content: state.transcript ?? message.text, revisao }, { role: "assistant", content: state.reply!, revisao },
  ]);
  return "enviada";
}
