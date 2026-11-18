import { z } from "zod";
export const definicaoFluxoSchema=z.strictObject({tipo:z.literal("mensagem_recebida"),instancia:z.string().trim().min(1).max(100),gatilhos:z.array(z.string().trim().min(3).max(250)).min(1).max(10),mensagens:z.array(z.string().trim().min(1).max(450)).min(1).max(3)});
export const fluxoSchema=z.strictObject({nome:z.string().trim().min(1).max(100),ativo:z.boolean(),definicao:definicaoFluxoSchema});
export type DadosFluxo=z.infer<typeof fluxoSchema>;
export interface Fluxo extends DadosFluxo{id:string;versao:number}
export interface EntradaFluxo{id:string;versao:number;mensagens:string[]}
export const anuncioPadrao:DadosFluxo={nome:"Anúncio · Aula experimental",ativo:true,definicao:{tipo:"mensagem_recebida",instancia:"ctluizroca",gatilhos:["Olá, gostaria de mais informações sobre a aula.","Gostaria de mais informações."],mensagens:["Olá! Boas-vindas ao CT Luis Roca. Eu sou Luísa.","Claro! Posso te passar as informações e ajudar a marcar uma aula experimental. A aula é para você ou para outra pessoa?"]}};
export function normalizarGatilho(texto:string){return texto.normalize("NFD").replace(/\p{M}/gu,"").toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim().replace(/^(?:ola|oi)\s+/,"");}
export function correspondeFluxo(fluxo:Fluxo,texto:string){return fluxo.ativo && fluxo.definicao.gatilhos.some(g=>normalizarGatilho(g)===normalizarGatilho(texto));}
