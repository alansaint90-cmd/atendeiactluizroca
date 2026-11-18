"use server";
import {z} from "zod";
import {executar,ErroDeNegocio} from "../acao";
import {exigirSessao} from "../auth/sessao";
import {exigirPermissao} from "../auth/permissoes";
import {effectiveSettings} from "../settings/repository";
import {instanciasConfiguradas} from "../evolution/instancias";
import {db} from "../db/client";
import {ensureDatabase} from "../db/migrate";
import {listarFluxos,salvarFluxoServidor} from "../fluxos/repository";
import {fluxoSchema} from "../fluxos/schema";
export async function carregarFluxos(instancia?:string){return executar(async()=>{
 const sessao=await exigirSessao();await exigirPermissao(sessao,"admin");await ensureDatabase();
 const instancias=instanciasConfiguradas(await effectiveSettings());
 const atual=z.string().max(100).optional().parse(instancia)??instancias[0]??"";
 if(atual && !instancias.includes(atual))throw new ErroDeNegocio("Selecione um chip configurado.");
 return {instancias,instancia:atual,fluxos:atual?await listarFluxos(db(),atual):[]};
});}
export async function salvarFluxo(entrada:unknown,alvo:unknown){return executar(async()=>{
 const sessao=await exigirSessao();await exigirPermissao(sessao,"admin");await ensureDatabase();
 const dados=fluxoSchema.parse(entrada),identidade=z.object({id:z.uuid(),versao:z.number().int().min(0)}).nullable().parse(alvo);
 if(!instanciasConfiguradas(await effectiveSettings()).includes(dados.definicao.instancia))throw new ErroDeNegocio("Selecione um chip configurado.");
 return salvarFluxoServidor(db(),dados,identidade,sessao.userId);
});}
