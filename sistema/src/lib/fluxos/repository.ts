import {sql} from "drizzle-orm";
import {linhas,type BancoSql} from "../db/porta";
import {ErroDeNegocio} from "../acao";
import {fluxoSchema,correspondeFluxo,type Fluxo,type EntradaFluxo} from "./schema";
import {aberturaAtualDoCt,INSTANCIA_CT} from "../ct/recepcao";
interface Registro{id:string;name:string;enabled:boolean;definition:unknown;version:number}
function ler(r:Registro):Fluxo|null {
 const p=fluxoSchema.safeParse({nome:r.name,ativo:r.enabled,definicao:r.definition});
 if(!p.success)return null;
 const fluxo={...p.data,id:r.id,versao:r.version};
 // Atualiza a recepção antiga do fluxo já instalado sem regravar a sua configuração.
 if(r.id==="00000000-0000-4000-8000-000000000021" && fluxo.definicao.instancia===INSTANCIA_CT)
  fluxo.definicao.mensagens=aberturaAtualDoCt(fluxo.definicao.mensagens);
 return fluxo;
}
export async function listarFluxos(banco:BancoSql,instancia:string){return linhas<Registro>(await banco.execute(sql`SELECT id,name,enabled,definition,version FROM atendeia_flows WHERE is_deleted=false AND definition->>'instancia'=${instancia} ORDER BY created_at,id LIMIT 100`)).flatMap(r=>{const f=ler(r);return f?[f]:[];});}
export async function salvarFluxoServidor(banco:BancoSql,entrada:unknown,alvo:{id:string;versao:number}|null,autor:string){
 const dados=fluxoSchema.parse(entrada);
 return banco.transaction(async tx=>{
  const definition=JSON.stringify(dados.definicao);
  const registros=alvo ? linhas<Registro>(await tx.execute(sql`UPDATE atendeia_flows SET name=${dados.nome},enabled=${dados.ativo},definition=${definition}::jsonb,description='Gatilho de mensagem recebida para novo contato',version=version+1,updated_at=now(),modified_by=${autor} WHERE id=${alvo.id} AND version=${alvo.versao} AND is_deleted=false AND definition->>'instancia'=${dados.definicao.instancia} RETURNING id,name,enabled,definition,version`)) : linhas<Registro>(await tx.execute(sql`INSERT INTO atendeia_flows(name,enabled,definition,description,modified_by) VALUES (${dados.nome},${dados.ativo},${definition}::jsonb,'Gatilho de mensagem recebida para novo contato',${autor}) RETURNING id,name,enabled,definition,version`));
  if(!registros[0])throw new ErroDeNegocio("O fluxo foi alterado por outra sessão. Recarregue antes de salvar.");
  const registro=registros[0];
  await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by) VALUES (${alvo?"fluxo_atualizado":"fluxo_criado"},'fluxo',${registro.id},'["name","definition","enabled"]'::jsonb,${autor})`);
  return ler(registro)!;
 });
}
export async function selecionarFluxo(banco:BancoSql,instancia:string,texto:string):Promise<EntradaFluxo|null>{const f=(await listarFluxos(banco,instancia)).find(f=>correspondeFluxo(f,texto));return f?{id:f.id,versao:f.versao,mensagens:f.definicao.mensagens}:null;}
export async function fluxoContinuaAtivo(banco:BancoSql,instancia:string,alvo:{id:string;versao:number}){return linhas(await banco.execute(sql`SELECT id FROM atendeia_flows WHERE id=${alvo.id} AND version=${alvo.versao} AND enabled=true AND is_deleted=false AND definition->>'instancia'=${instancia}`)).length===1;}
