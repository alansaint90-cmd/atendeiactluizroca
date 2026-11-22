/** Calendário interno do CT; o relógio é recalculado em cada atendimento. */
import { numerosDaFala, meses } from "../consultas/linguagem";
export const fusoCt = "America/Bahia";
const dias = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
export function dataLocalCt(agora = Date.now()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {timeZone:fusoCt,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(agora));
  const valor = (tipo:string) => partes.find(p=>p.type===tipo)!.value;
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}
export function somarDiasCt(data: string, quantidade: number) { return new Date(Date.parse(`${data}T12:00:00Z`)+quantidade*86400000).toISOString().slice(0,10); }
export function dataValidaCt(data: string) { return /^\d{4}-\d{2}-\d{2}$/.test(data) && !Number.isNaN(Date.parse(`${data}T12:00:00Z`)) && new Date(`${data}T12:00:00Z`).toISOString().slice(0,10)===data; }
export function rotuloDataCt(data:string) { return `${dias[new Date(`${data}T12:00:00Z`).getUTCDay()]}, ${data.slice(8,10)}/${data.slice(5,7)}/${data.slice(0,4)}`; }
export function contextoCalendarioCt(agora = Date.now()) {
  const hoje=dataLocalCt(agora);
  return `CALENDÁRIO INTERNO DO CT (${fusoCt}): hoje é ${rotuloDataCt(hoje)}. Amanhã é ${rotuloDataCt(somarDiasCt(hoje,1))}. Depois de amanhã é ${rotuloDataCt(somarDiasCt(hoje,2))}. Próximos dias: ${Array.from({length:7},(_,i)=>rotuloDataCt(somarDiasCt(hoje,i+1))).join("; ")}. Use este relógio atual, não datas antigas do histórico. “Próxima terça” significa a primeira terça futura; se hoje for terça, significa daqui a sete dias. Converta a expressão em data completa, consulte somente essa data e confira-a antes de reservar. Se não houver aula, explique isso; não troque a data silenciosamente. Este calendário é interno e não deve ser enviado como uma lista ao cliente.`;
}
export type DataInterpretada = {tipo:"data";data:string} | {tipo:"ambigua";datas:string[]} | {tipo:"invalida";mensagem:string};
export function interpretarDataCt(texto:string, agora=Date.now()): DataInterpretada | null {
  const hoje=dataLocalCt(agora), normal=numerosDaFala(texto);
  const encontradas:string[]=[];
  const semIso=normal.replace(/\b\d{4}-\d{2}-\d{2}\b/g,data=>{encontradas.push(data);return " ";});
  if(encontradas.some(data=>!dataValidaCt(data)))return {tipo:"invalida",mensagem:"Essa data não existe no calendário. Qual é a data correta?"};
  let restante=semIso.replace(/\bdepois de amanha\b/g,()=>{encontradas.push(somarDiasCt(hoje,2));return " ";});
  restante=restante.replace(/\bdaqui (?:a\s+)?(\d{1,2}) dias?\b/g,(_,dias)=>{encontradas.push(somarDiasCt(hoje,Number(dias)));return " ";});
  restante=restante.replace(/\bamanha\b/g,()=>{encontradas.push(somarDiasCt(hoje,1));return " ";});
  if(/\bhoje\b/.test(restante)) encontradas.push(hoje);
  const porDia:Record<string,number>={domingo:0,segunda:1,terca:2,quarta:3,quinta:4,sexta:5,sabado:6};
  for(const m of restante.matchAll(/\b(?:(proxim[ao])\s+)?(domingos?|segundas?|tercas?|quartas?|quintas?|sextas?|sabados?)(?:[ -]feiras?)?(?:\s+(que vem))?\b(?!\s+(?:opcao|alternativa))/g)) {
    let distancia=(porDia[m[2].replace(/s$/,"")]-new Date(`${hoje}T12:00:00Z`).getUTCDay()+7)%7;
    if(distancia===0 && (m[1] || m[3]))distancia=7;
    encontradas.push(somarDiasCt(hoje,distancia));
  }
  for(const m of restante.matchAll(/\b(\d{1,2})\s*[\/.-]\s*(\d{1,2})(?:\s*[\/.-]\s*(\d{4}|\d{2}))?\b(?!\s*(?:anos?|aninhos)\b)/g)) {
    let ano=m[3] ? Number(m[3])+(m[3].length===2 ? 2000 : 0) : Number(hoje.slice(0,4));
    let data=`${ano}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
    if(!m[3] && dataValidaCt(data) && data<hoje){ano++;data=`${ano}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;}
    if(!dataValidaCt(data))return {tipo:"invalida",mensagem:"Essa data não existe no calendário. Qual é a data correta?"};
    encontradas.push(data);
    restante=restante.replace(m[0],' ');
  }
  for(const m of restante.matchAll(new RegExp(`\\b(?:dia\\s+)?(\\d{1,2})\\s+(?:de\\s+)?(${meses.join('|')})(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`,'g'))) {
    let ano=Number(m[3] ?? hoje.slice(0,4));const mes=String(meses.indexOf(m[2])+1).padStart(2,'0');
    let data=`${ano}-${mes}-${m[1].padStart(2,'0')}`;
    if(!m[3] && dataValidaCt(data) && data<hoje)data=`${++ano}-${mes}-${m[1].padStart(2,'0')}`;
    if(!dataValidaCt(data))return {tipo:'invalida',mensagem:'Essa data não existe no calendário. Qual é a data correta?'};
    encontradas.push(data);
    restante=restante.replace(m[0],' ');
  }
  for(const m of restante.matchAll(/\bdia\s+(\d{1,2})\b/g)) {
    const data=`${hoje.slice(0,7)}-${m[1].padStart(2,'0')}`;
    if(!dataValidaCt(data))return {tipo:'invalida',mensagem:'Essa data não existe neste mês. Qual mês você quer consultar?'};
    encontradas.push(data);
  }
  const unicas=[...new Set(encontradas)];
  if(!unicas.length)return null;
  if(unicas.length>1)return {tipo:"ambigua",datas:unicas};
  if(unicas[0]<hoje)return {tipo:"invalida",mensagem:"Essa data já passou. Qual data futura você prefere?"};
  return {tipo:"data",data:unicas[0]};
}

export function formatarOcorrenciaCt(inicio:string) { return `${rotuloDataCt(dataLocalCt(Date.parse(inicio)))} às ${new Date(inicio).toLocaleTimeString("pt-BR",{timeZone:fusoCt,hour:"2-digit",minute:"2-digit"})}`; }

export function formatarDiaHoraCt(inicio:string) {
  const data=new Date(inicio);
  const dia=new Intl.DateTimeFormat("pt-BR",{timeZone:fusoCt,weekday:"long"}).format(data);
  const hora=new Intl.DateTimeFormat("pt-BR",{timeZone:fusoCt,hour:"numeric",minute:"2-digit",hourCycle:"h23"}).format(data).replace(":00","");
  return `${dia}, às ${hora}h`;
}
