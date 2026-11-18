import type { FollowupConfig } from './schema';
export function padraoAulasCt(instance: string): FollowupConfig {
 return {mode:'aulas',enabled:true,instance,target:'ai',startHour:0,endHour:24,timezone:'America/Sao_Paulo',days:[0,1,2,3,4,5,6],steps:[
  {enabled:true,text:'Opa, {nome}! {saudacao}! Tá tudo certo para a nossa aula experimental de hoje? Estamos aguardando você.',delay:1,unit:'hours'},
  {enabled:true,text:'Opa, {nome}! {saudacao}! Como foi sua experiência na aula experimental? Gostou da aula?',delay:1,unit:'hours'},
  {enabled:false,text:'',delay:1,unit:'hours'}]};
}
