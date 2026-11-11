import { horariosDoDia, proximasQuintas } from "C:/Users/Allan Nascimento/Documents/ChatGPT/atendeai dr juliana/src/lib/consultas/calendario";
import { conduzirCadastro } from "C:/Users/Allan Nascimento/Documents/ChatGPT/atendeai dr juliana/src/lib/consultas/fluxo";
(async () => {
 let estado: any = null;
 const vagas = horariosDoDia(proximasQuintas()[0]).map((v,i)=>({...v,id:String(i),disponivel:true,atualizadoEm:new Date().toISOString()}));
 console.log(await conduzirCadastro({ativo:async()=>true,ler:async()=>estado,salvar:async d=>{estado=d},vagas:async()=>vagas,reservar:async()=>{throw Error("Auditoria sem reserva")}},"auditoria-local","Quais horários disponíveis?",true));
})();
