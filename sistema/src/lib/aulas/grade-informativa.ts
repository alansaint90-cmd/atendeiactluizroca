import { dataLocalCt, interpretarDataCt, formatarOcorrenciaCt } from "./calendario";
import { modalidadeMencionada } from "./objetivo";
import { interpretarTurno, correspondeTurno } from "./turno";
import type { Aula } from "./schema";

export function pedidoGradeInformativa(texto: string) {
  const t=texto.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().trim();
  if (/\b(?:agendar|agende|reservar|reserve|confirmar|confirma)\b/.test(t)) return false;
  if (/^(?:todos|todas)[!.\s]*$/.test(t)) return true;
  const horarios=/\b(?:horarios?|grade|turmas?)\b/.test(t);
  return horarios && (/\b(?:todos|todas|completa|completo|semana|semanal|grade)\b/.test(t) ||
    Boolean(modalidadeMencionada(texto)) && !/\b(?:outros?|outras?|mais)\b/.test(t) && !interpretarDataCt(texto) && interpretarTurno(texto)===undefined);
}

const dias=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
function lista(itens:string[]) {return itens.length<2 ? itens[0] : `${itens.slice(0,-1).join(", ")} e ${itens.at(-1)!}`;}

/** Grade informativa não é oferta de vaga nem preparação de reserva. */
export function apresentarGradeInformativa(aulas:Aula[],texto:string,modalidade:string|null) {
  const turno=interpretarTurno(texto),data=interpretarDataCt(texto);
  if(turno==="ambiguo") return "Você quer ver os horários da manhã, da tarde ou da noite?";
  if(data && data.tipo!=="data") return "Quais dias você quer consultar?";
  const dia=data ? new Date(`${data.data}T12:00:00Z`).getUTCDay() : null;
  const turmas=new Map<string,Map<number,string[]>>(),pontuais:string[]=[];
  for(const aula of aulas) {
    if(modalidade && aula.modalidade!==modalidade || !correspondeTurno(aula.inicio,turno ?? null)) continue;
    if(aula.diaSemana==null) {
      if(Date.parse(aula.inicio)>Date.now() && (!data || dataLocalCt(Date.parse(aula.inicio))===data.data)) pontuais.push(`${aula.modalidade} · ${aula.turma}: ${formatarOcorrenciaCt(aula.inicio)}.`);
      continue;
    }
    if(dia!==null && aula.diaSemana!==dia) continue;
    const chave=`${aula.modalidade} · ${aula.turma}`, horarios=turmas.get(chave) ?? new Map<number,string[]>();
    const hora=new Date(aula.inicio).toLocaleTimeString("pt-BR",{timeZone:"America/Bahia",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
    horarios.set(aula.diaSemana,[...new Set([...(horarios.get(aula.diaSemana) ?? []),hora])].sort());turmas.set(chave,horarios);
  }
  const blocos=[...turmas].map(([turma,horarios])=>{
    const grupos=new Map<string,string[]>();
    for(const d of [1,2,3,4,5,6,0]) {
      const horas=horarios.get(d);if(!horas)continue;
      const chave=lista(horas);grupos.set(chave,[...(grupos.get(chave) ?? []),dias[d].toLocaleLowerCase("pt-BR")]);
    }
    return `${turma}\n${[...grupos].map(([horas,d])=>`${lista(d).replace(/^./u,c=>c.toLocaleUpperCase("pt-BR"))}: ${horas}.`).join("\n")}`;
  });
  if(!blocos.length && !pontuais.length)return `Não há horários${modalidade ? ` de ${modalidade}` : ""} cadastrados nesse recorte. Posso te mostrar a grade de outros dias ou períodos.`;
  const semanal=data && !/\b(?:hoje|amanh[aã]|pr[oó]xim[ao]|que vem)\b|\d{1,2}[/-]\d{1,2}|\d{4}-\d{2}-\d{2}/iu.test(texto);
  return `Aqui estão os horários${modalidade ? ` de ${modalidade}` : ""}${data ? semanal ? "" : ` para ${data.data.slice(8,10)}/${data.data.slice(5,7)}/${data.data.slice(0,4)}` : " da semana"}:\n\n${[...blocos,...pontuais].join("\n\n")}`;
}

export const ORIENTACAO_GRADE_INFORMATIVA = "GRADE COMPLETA — 20/11/2026: pedidos de todos os horários, horários da semana ou grade de uma modalidade são informativos. Mostre a grade real solicitada, agrupando dias iguais, sem limitar a duas opções ou exigir dados para reservar. Abandone filtros antigos de data e turno quando o pedido for geral; mantenha somente filtros explícitos na mensagem atual. 'Todos' após uma oferta amplia para a grade da modalidade em conversa. Preserve idade e responsável conhecidos para uma eventual reserva futura. Mostrar a grade não confirma vaga nem reserva. Pedidos de outros horários continuam oferecendo alternativas no contexto; pedido da grade completa permite listar todos. Não repetir o aviso de indisponibilidade de uma data antiga.";
