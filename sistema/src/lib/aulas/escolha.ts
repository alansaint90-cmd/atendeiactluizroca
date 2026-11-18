import { fusoCt } from "./calendario";
/** Resolve somente escolhas curtas e explícitas entre os horários já apresentados. */
export function escolherHorario(texto: string, opcoes: {inicio:string}[]): number | "ambigua" | null {
  let t=texto.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().trim();
  const ordinal=t.match(/^(?:(?:a|opcao)\s+)?(primeira|segunda|[12])[.!\s]*$/);
  if (ordinal) { const n=ordinal[1]==="primeira"?1:ordinal[1]==="segunda"?2:Number(ordinal[1]); return opcoes[n-1]?n:null; }
  const numeros:Record<string,string>={seis:"6",sete:"7",oito:"8",nove:"9",dez:"10",onze:"11",doze:"12"};
  t=t.replace(/\b(seis|sete|oito|nove|dez|onze|doze)\b/g,v=>numeros[v]);
  const m=t.match(/^(?:(?:as?|o horario das?|pode ser as?)\s+)?(\d{1,2})(?:(?:h|:)(\d{2})?)?\s*(?:e (?:bom|boa|otimo|otima)|fica bom|pode ser|ta bom|funciona|pra mim)?[.!?\s]*$/) ?? t.match(/^(?:as?\s+)(\d{1,2})(?:(?:h|:)(\d{2})?)?[.!\s]*$/);
  if (!m || Number(m[1])>23 || Number(m[2]??0)>59) return null;
  const hora=Number(m[1]), minuto=Number(m[2]??0);
  const indices=opcoes.flatMap((o,i)=>{
    const horario=new Intl.DateTimeFormat("en-GB",{timeZone:fusoCt,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(o.inicio));
    const [h,min]=horario.split(":").map(Number);
    return min===minuto && (h===hora || hora<12 && h===hora+12) ? [i+1] : [];
  });
  return indices.length>1?"ambigua":indices[0]??null;
}
