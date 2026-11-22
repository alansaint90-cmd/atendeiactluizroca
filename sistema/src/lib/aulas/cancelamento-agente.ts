import type Redis from "ioredis";
import type { BancoSql } from "../db/porta";
import { ErroDeNegocio } from "../acao";
import { owned, agentKeys, assertResult } from "../agent/redis";
import { formatarOcorrenciaCt } from "./calendario";
import { interpretarDataCt } from "./calendario";
import { interpretarTurno } from "./turno";
import { responderDuvidaCt } from "../ct/duvidas";
import { cancelarReservaDoContato, reservasFuturasDoContato, type ReservaContato } from "./alteracao-reserva";

const normalizar=(v:string)=>v.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/\s+/g,' ').trim();
export function pedidoAlteracaoExperimental(texto:string) {
 const t=normalizar(texto);
 if(/matricula|plano|contrato/.test(t))return null;
 if(/^(?:como|posso|se eu|qual|e se)\b/.test(t))return null;
 const afirmacao=t.replace(/\b(?:nao|nunca)\s+(?:quero\s+|preciso\s+)?(?:cancelar|remarcar|reagendar)\b/g,'');
 const pedido=afirmacao.match(/\b(?:quero|preciso|gostaria de|vou|pode|poderia)\s+(cancelar|remarcar|reagendar)\b|^(cancela|cancele|cancelar|remarcar|reagendar)\b/);
 if(pedido)return /remarc|reagend/.test(pedido[1]??pedido[2])?'remarcar':'cancelar';
 return null;
}
interface Estado { fase:'selecionar'|'motivo'|'alternativa'|'remarcar'|'encerrado'; reservas:ReservaContato[]; alvo?:ReservaContato; pedido:'cancelar'|'remarcar'; cancelarDireto?:boolean }
type Resultado = {resposta:string;cancelada?:string;manter?:boolean}|{remarcar:ReservaContato}|null;
const fim="Pronto, cancelei sua aula experimental. Obrigada por avisar! Até mais.";

export function cancelamentoDoAgente(banco:BancoSql,client:Redis,token:string,conversa:string,numero:string) {
 const chave=`atendeia:{evolution}:cancelamento-aula:${conversa}`,telefone=`+${numero}`;
 const salvar=async(e:Estado)=>assertResult(await client.eval(owned+"redis.call('SET', KEYS[2], ARGV[2], 'EX', 604800); return 1",2,agentKeys.lock,chave,token,JSON.stringify(e)));
 return async (texto:string,remarcacaoAtiva?:string):Promise<Resultado>=>{
  const pedido=pedidoAlteracaoExperimental(texto),raw=await client.get(chave);let e:Estado|null=raw?JSON.parse(raw) as Estado:null;
  if(e && (!Array.isArray(e.reservas) || !['selecionar','motivo','alternativa','remarcar','encerrado'].includes(e.fase)))e=null;
  const t=normalizar(texto);
  const recusa=/\b(?:nao quero(?: mais)?|nao tenho (?:mais )?interesse|nao vou (?:querer|mais)|prefiro cancelar|so cancel[ae]|pode cancelar|cancele mesmo|desisti|desisto|deixa pra la)\b/.test(t) || /^(?:nao(?:,? (?:obrigad[oa]|quero|precisa))?|cancel[ae]|cancelar)[.!\s]*$/.test(t);
  if(!pedido && (!e || e.fase==='encerrado' || e.fase==='remarcar' && (!recusa || remarcacaoAtiva!==e.alvo?.id)))return null;
  if(!pedido && /nao (?:quero |precisa |e para )?cancelar|manter (?:a |o )?(?:aula|reserva|agendamento)|deixa como esta/.test(t)) {
   await salvar({...e!,fase:'encerrado'});return {resposta:"Combinado, mantemos seu agendamento. Até a aula!",manter:true};
  }
  if(!pedido && responderDuvidaCt(texto))return null;
  if(!e || e.fase==='encerrado' || e.fase==='remarcar' && pedido) {
   const reservas=await reservasFuturasDoContato(banco,telefone);
   if(!reservas.length)return {resposta:"Não há uma aula experimental futura agendada neste número. Se a reserva foi feita em outro número, me avise para a equipe conferir."};
   e={fase:reservas.length>1?'selecionar':'motivo',reservas,alvo:reservas.length===1?reservas[0]:undefined,pedido:pedido!,cancelarDireto:recusa};
   if(e.fase==='selecionar'){await salvar(e);return {resposta:`Qual destas aulas você quer ${e.pedido}?\n\n${reservas.map((r,i)=>`${i+1}. ${r.nome} · ${r.modalidade} · ${formatarOcorrenciaCt(r.inicio)}`).join('\n')}`};}
   if(e.pedido==='remarcar'){e.fase='remarcar';await salvar(e);return {remarcar:e.alvo!};}
   if(!recusa){await salvar(e);return {resposta:/porque|pois|motivo/.test(t)?"Entendi. Quer tentar outro dia para a aula experimental?":"Opa! Pode me contar o motivo do cancelamento? Se for o horário, podemos tentar outro dia."};}
  }
  if(e.fase==='selecionar') {
   const indice=/^\d+[.!\s]*$/.test(t)?Number(t.replace(/\D/g,''))-1:-1;
   const nomes=e.reservas.filter(r=>normalizar(r.nome)===t);
   const alvo=e.reservas[indice] ?? (nomes.length===1?nomes[0]:undefined);
   if(!alvo)return {resposta:"Me diga o número da opção ou o nome completo do participante para eu alterar a aula certa."};
   e={...e,alvo,fase:e.pedido==='remarcar'?'remarcar':'motivo'};await salvar(e);
   if(e.pedido==='remarcar')return {remarcar:alvo};
   if(!e.cancelarDireto)return {resposta:"Opa! Pode me contar o motivo do cancelamento? Se for o horário, podemos tentar outro dia."};
  }
  if(recusa || e.cancelarDireto || pedido==='cancelar') {
   try {await cancelarReservaDoContato(banco,e.alvo!,telefone);}
   catch(erro){if(!(erro instanceof ErroDeNegocio))throw erro;await salvar({...e,fase:'encerrado'});return {resposta:erro.message};}
   await salvar({...e,fase:'encerrado'});return {resposta:fim,cancelada:e.alvo!.id};
  }
  const escolhaDePeriodo=(interpretarDataCt(texto)?.tipo==='data' || interpretarTurno(texto)!==undefined)
   && !/\bnao\b|compromisso|doente|trabalh|viaj/.test(t)
   && /^(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|de manha|a tarde|a noite)\b|\b(?:pode ser|prefiro|vamos|que tal|tem aula)\b/.test(t);
  if(pedido==='remarcar' || /^(?:sim|quero|pode ser|vamos|vamos sim|claro)[.!\s]*$/.test(t) || /outro dia|outro horario|(?:pode|quero|vamos).*remarcar/.test(t) || escolhaDePeriodo) {
   await salvar({...e,fase:'remarcar'});return {remarcar:e.alvo!};
  }
  if(/^(?:oi|ola|bom dia|boa tarde|boa noite)[.!\s]*$/.test(t))return {resposta:"Oi! Quer tentar outro dia para a aula ou prefere cancelar?"};
  await salvar({...e,fase:'alternativa'});
  return {resposta:"Entendi. Quer tentar outro dia para a aula experimental?"};
 };
}
