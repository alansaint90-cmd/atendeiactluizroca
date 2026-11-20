import { encaminharFalhaHumana, telefoneAlertaHumano } from "./falha-humana";
import {selecionarFluxo,fluxoContinuaAtivo} from "../fluxos/repository";
import { agendaAulasDoAgente } from "../aulas/agente";
import { contextoDoContato, historicoDoContato } from "../operacao/memoria";
import { lerLote, concluirLote, estadoLote } from "./lote";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { effectiveSettings } from "../settings/repository";
import { evolutionEventSchema } from "../evolution/schema";
import { streamKey } from "../evolution/queue";
import { agentBaseConfigSchema, configurarAgente } from "./config";
import { incomingMessage, digest } from "./message";
import { generateReply, sendReply } from "./providers";
import { transcribeAudio } from "./audio";
import { processMessage } from "./processor";
import { agentRedis, agentKeys, owned } from "./redis";
import { finishEvent, messageStore } from "./store";
import { followupDaInstancia, settingsDaInstancia } from "../evolution/instancias";
import { followupStore } from "../followups/queue";
import { configuracaoPermiteFollowup, processFollowup } from "../followups/processor";
import { executarAgendamentos } from "../agendamentos/worker";
import { chatbotDaInstancia } from "../chatbots/server-repository";
import { db } from "../db/client";
import { registrarEnvioIa, type RespostaEnviadaIa } from "../operacao/atribuir-ia";
import { pausaManualAtiva, pausarTransferencia, encerrarAcompanhamentoHumano } from "./pausa";
import { transferirAtendimento } from "../operacao/transferir";
import { cadastroDaConversa } from "../consultas/fluxo-servidor";
import { deveAguardarResposta } from "./espera";
import { ativacaoValida } from "./ativacao";
import { atendimentoHumanoAtivo } from "../atendimento/atendimento";

const streamResult = z.array(z.tuple([z.string(), z.array(z.tuple([z.string(), z.array(z.string())]))]));
let started = false;
let lastLog = "";
function report(status: string) {
  if (lastLog !== status) { console.info(`Atende AI agente: ${status}`); lastLog = status; }
}

const dependenciasPadrao = { encaminharFalha: (instancia:string,numero:string,telefone:string,codigo:string,nome?:string|null) => encaminharFalhaHumana(db(),instancia,numero,telefone,codigo,nome), settings: effectiveSettings, generate: generateReply, send: sendReply,
  transferir: (instancia: string, numero: string, destino: string) => transferirAtendimento(db(), instancia, numero, destino),
  registrarEnvio: (instancia: string, id: string, resposta?: RespostaEnviadaIa) => registrarEnvioIa(db(), instancia, id, resposta),
  chatbot: (instancia: string) => chatbotDaInstancia(db(), instancia) };
export async function runAgentTick(substituicoes: Partial<typeof dependenciasPadrao> = {}) {
  const dependencies = { ...dependenciasPadrao, ...substituicoes,
    chatbot: substituicoes.chatbot ?? (Object.keys(substituicoes).length ? async () => null : dependenciasPadrao.chatbot) };
  const settings = await dependencies.settings();
  if (!settings.REDIS_URL) { report("Redis não configurado"); return; }
  const client = agentRedis(settings.REDIS_URL);
  const token = randomUUID();
  try {
    await client.connect();
    if (!await client.set(agentKeys.lock, token, "PX", 120000, "NX")) return;
    const config = agentBaseConfigSchema.safeParse(settings);
    const status = settings.AI_ENABLED !== "true" ? "desativado" : config.success ? "ativo" : "configuracao_incompleta";
    const previous = await client.get(agentKeys.heartbeat);
    const last = previous ? JSON.parse(previous) as { lastResult?: string; lastCode?: string; lastAt?: string } : {};
    await client.set(agentKeys.heartbeat, JSON.stringify({ status, at: new Date().toISOString(),
      lastResult: last.lastResult, lastCode: last.lastCode, lastAt: last.lastAt }), "EX", 180);
    report(status);
    if (!config.success) return;
    const followups = followupStore(client, token);
    try { await client.xgroup("CREATE", streamKey, agentKeys.group, "0", "MKSTREAM"); }
    catch (error) { if (!(error instanceof Error) || !error.message.includes("BUSYGROUP")) throw error; }
    // Consumidor fixo + lease global recuperam o primeiro pendente antes de ler novos.
    let raw = await client.xreadgroup("GROUP", agentKeys.group, agentKeys.consumer, "COUNT", 1, "STREAMS", streamKey, "0");
    let entries = streamResult.parse(raw ?? [])[0]?.[1] ?? [];
    if (!entries.length) {
      raw = await client.xreadgroup("GROUP", agentKeys.group, agentKeys.consumer, "COUNT", 1, "STREAMS", streamKey, ">");
      entries = streamResult.parse(raw ?? [])[0]?.[1] ?? [];
    }
    for (const [id, fields] of entries) {
      const payload = fields[fields.indexOf("payload") + 1] ?? "{}";
      let value: unknown;
      try { value = JSON.parse(payload); } catch { value = null; }
      const parsed = evolutionEventSchema.safeParse(value);
      const instancia = parsed.success ? parsed.data.instance : "";
      const chatbot = settingsDaInstancia(settings, instancia) ? await dependencies.chatbot(instancia) : null;
      const config = configurarAgente(settingsDaInstancia(settings, instancia), chatbot);
      const followupConfig = followupDaInstancia(settings, instancia);
      if (parsed.success && config.success) await followups.observe(parsed.data, instancia);
      let message = parsed.success && config.success ? incomingMessage(parsed.data, instancia, Date.now(), config.data.atendimento?.transferMedia) : null;
      let result = "ignorada";
      const humanoAtivo = async (numero: string) => Object.keys(substituicoes).length === 0 && await atendimentoHumanoAtivo(db(), instancia, numero);
      if (message && config.success) {
        const lote = !message.audio && !message.midia ? await lerLote(client, message) : null;
        if (estadoLote(message.identity, lote?.atual ?? null, config.data.delay ?? 15) === "substituida") {
          await finishEvent(client, token, id, JSON.stringify({ event: parsed.success ? parsed.data.event : "invalido" }), "agrupada");
          return true;
        }
        const identidade = message.identity;
        if (estadoLote(message.identity, lote?.atual ?? null, config.data.delay ?? 15) === "aguardar") return false;
        if (lote?.fragmentos.length) message = { ...message, text: lote.texto };
        const mensagem = message;
        const eventoAtual = z.object({ key: z.object({ id: z.string() }) }).safeParse(parsed.success ? parsed.data.data : null);
        if (!await pausaManualAtiva(client, mensagem.conversation)
          && deveAguardarResposta(Math.max(15, config.data.delay ?? 15), message.timestamp)) return false;
        const store = messageStore(client, token, message);
        const atendimentoAtivo = async () => {
          const atual = configurarAgente(settingsDaInstancia(await dependencies.settings(), instancia), await dependencies.chatbot(instancia));
          return atual.success && JSON.stringify(atual.data) === JSON.stringify(config.data)
            && (!lote?.atual || (await lerLote(client, mensagem)).atual?.identity === identidade)
            && !await pausaManualAtiva(client, mensagem.conversation) && !await humanoAtivo(mensagem.number) && await client.get(agentKeys.lock) === token;
        };
        result = await pausaManualAtiva(client, mensagem.conversation) || await humanoAtivo(mensagem.number) ? "pausa_manual" : await processMessage(message, config.data, {
          ...store,
          fluxoEntrada: Object.keys(substituicoes).length ? undefined : texto=>selecionarFluxo(db(),instancia,texto),
          fluxoValido: Object.keys(substituicoes).length ? undefined : alvo=>fluxoContinuaAtivo(db(),instancia,alvo),
          history: async () => { const historico = await store.history(); return historico.length || Object.keys(substituicoes).length ? historico : historicoDoContato(db(), instancia, mensagem.number, eventoAtual.success ? eventoAtual.data.key.id : undefined); },
          aulaExperimental: Object.keys(substituicoes).length ? undefined : agendaAulasDoAgente(db(), client, token, mensagem.conversation, mensagem.number, atendimentoAtivo),
          contextoPersistido: Object.keys(substituicoes).length ? undefined : () => contextoDoContato(db(), instancia, mensagem.number),
          generate: dependencies.generate, send: dependencies.send, transcribe: transcribeAudio,
          cadastroConsulta: cadastroDaConversa(client, token, message, instancia, atendimentoAtivo, config.data),
          registrarParte: async (id, texto) => {
            await followups.outgoing(instancia, id);
            await dependencies.registrarEnvio(instancia, id, { numero: mensagem.number, texto });
          },
          falhaHumana: Object.keys(substituicoes).length && !substituicoes.encaminharFalha ? undefined : async codigo => {
            const telefone=telefoneAlertaHumano(config.data);
            if (!telefone) throw new Error("Destino de alerta não configurado.");
            if (await client.get(agentKeys.lock) !== token) throw new Error("Lease do agente indisponível.");
            await dependencies.encaminharFalha(instancia,mensagem.number,telefone,codigo,await store.contactName());
            await encerrarAcompanhamentoHumano(client,token,mensagem.conversation);
          },
          transferir: async destino => {
            const telefone=telefoneAlertaHumano(config.data);
            await dependencies.transferir(instancia, mensagem.number, destino);
            if (telefone && (!Object.keys(substituicoes).length || substituicoes.encaminharFalha)) await dependencies.encaminharFalha(instancia,mensagem.number,telefone,"pedido_humano",await store.contactName());
            if (telefone && (!Object.keys(substituicoes).length || substituicoes.encaminharFalha)) await encerrarAcompanhamentoHumano(client, token, mensagem.conversation);
            else await pausarTransferencia(client, token, mensagem.conversation);
          },
          enabled: atendimentoAtivo,
        });
        if (result === "pausada" && (await pausaManualAtiva(client, mensagem.conversation) || await humanoAtivo(mensagem.number))) result = "pausa_manual";
        if (result === "pausada" && lote?.atual && (await lerLote(client, mensagem)).atual?.identity !== identidade) result = "agrupada";
        const state = await store.read();
        if ((["enviada", "incerta", "falhou", "pausa_manual", "aguardando_gatilho"].includes(result) || result === "agrupada" && !!state?.providerIds?.length) && lote) await concluirLote(client, token, mensagem.conversation, lote.fragmentos.length);
        if (state?.status === "enviada" && state.providerId) {
          // Estados antigos não registravam cada parte antes da confirmação.
          if (!state.providerIds?.includes(state.providerId)) {
            await dependencies.registrarEnvio(config.data.EVOLUTION_INSTANCE_NAME, state.providerId, state.reply ? { numero: mensagem.number, texto: state.partes?.at(-1) ?? state.reply } : undefined);
            await followups.outgoing(config.data.EVOLUTION_INSTANCE_NAME, state.providerId);
          }
          if (!state.transferencia && !state.consulta && !await humanoAtivo(mensagem.number) && followupConfig.instance === config.data.EVOLUTION_INSTANCE_NAME && state.configHash === digest(JSON.stringify(config.data))) {
            await followups.schedule(message, followupConfig);
          }
        }
        await client.set(agentKeys.heartbeat, JSON.stringify({ status: "ativo", at: new Date().toISOString(),
          lastResult: result, lastCode: state?.code ?? null, lastAt: new Date().toISOString() }), "EX", 180);
      }
      if (result !== "repetir" && result !== "pausada") {
        const archive = JSON.stringify({ event: parsed.success ? parsed.data.event : "invalido", message });
        await finishEvent(client, token, id, archive, result);
      }
      report(result);
      return result !== "repetir" && result !== "pausada";
    }
    const job = await followups.due();
    if (job) {
      const instancia = job.instance ?? settings.EVOLUTION_INSTANCE_NAME ?? "";
      const chatbot = settingsDaInstancia(settings, instancia) ? await dependencies.chatbot(instancia) : null;
      const config = configurarAgente(settingsDaInstancia(settings, instancia), chatbot);
      if (!config.success || !await ativacaoValida(client, job.conversation, config.data.AI_ACTIVATION_TRIGGER)) {
        await followups.finish(job, "cancelado"); return;
      }
      const followupConfig = followupDaInstancia(settings, instancia);
      await processFollowup(job, followupConfig, {
        save: followups.save, finish: result => followups.finish(job, result),
        enabled: async () => {
          const currentSettings = await dependencies.settings();
          const currentFollowup = followupDaInstancia(currentSettings, instancia);
          const currentBot = await dependencies.chatbot(instancia);
          const current = configurarAgente(settingsDaInstancia(currentSettings, instancia), currentBot);
          return current.success && JSON.stringify(current.data) === JSON.stringify(config.data)
            && configuracaoPermiteFollowup(job, currentFollowup)
            && currentFollowup.instance === config.data.EVOLUTION_INSTANCE_NAME
            && await ativacaoValida(client, job.conversation, current.data.AI_ACTIVATION_TRIGGER)
            && !await pausaManualAtiva(client, job.conversation)
            && (Object.keys(substituicoes).length > 0 || !await atendimentoHumanoAtivo(db(), instancia, job.number))
            && await client.get(agentKeys.lock) === token && await client.xlen(streamKey) === 0;
        },
        send: (number, text) => dependencies.send(config.data, number, text),
        delivered: async (id, text) => {
          await dependencies.registrarEnvio(instancia, id, { numero: job.number, texto: text });
          await followups.outgoing(config.data.EVOLUTION_INSTANCE_NAME, id);
          await followups.history(job, text, digest(config.data.AI_SYSTEM_PROMPT));
        },
      });
    }
  } finally {
    if (client.status === "ready") await client.eval(owned + "redis.call('DEL', KEYS[1]); return 1", 1, agentKeys.lock, token).catch(() => {});
    client.disconnect();
  }
}

export function startAgentWorker() {
  if (started) return;
  started = true;
  const loop = async () => {
    let processed = false;
    try { await executarAgendamentos(); }
    catch { console.error("Atende AI: falha ao processar agendamentos; confira banco e configuração."); }
    try { processed = Boolean(await runAgentTick()); }
    catch { report("falha de configuração, Redis ou processamento; nova tentativa em 1 segundo"); }
    const timer = setTimeout(() => void loop(), processed ? 100 : 1000);
    timer.unref();
  };
  void loop();
}
