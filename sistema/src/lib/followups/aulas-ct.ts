import type { FollowupConfig } from './schema';
export function padraoAulasCt(instance: string): FollowupConfig {
 return {mode:'aulas',aulasReferencia:'inicio',enabled:true,instance,target:'ai',startHour:0,endHour:24,timezone:'America/Sao_Paulo',days:[0,1,2,3,4,5,6],steps:[
  {enabled:true,text:'Opa, {nome}! {saudacao}! Tá tudo certo para a nossa aula experimental de hoje? Estamos aguardando você.',delay:2,unit:'hours'},
  {enabled:true,text:'Opa, {nome}! {saudacao}! Como foi sua experiência na aula experimental? Gostou da aula?',delay:2,unit:'hours'},
  {enabled:false,text:'',delay:1,unit:'hours'}]};
}

/** Atualiza somente a semântica antiga do CT, preservando textos, desligamentos e demais chips. */
export function atualizarIntervalosAulasCt(config:FollowupConfig):FollowupConfig {
 if(config.instance!=="ctluizroca" || config.mode!=="aulas" || config.aulasReferencia==="inicio")return config;
 const atualizado=structuredClone(config);atualizado.aulasReferencia="inicio";
 for(const i of [0,1]) {atualizado.steps[i].delay=2;atualizado.steps[i].unit="hours";}
 return atualizado;
}
