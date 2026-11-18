"use client";
import {useState} from "react";
import {gravarAgendamento} from "@/lib/actions/agendamentos";
import {validarData,type DadosAgendamento} from "@/lib/agendamentos/schema";
import type {MensagemFila} from "@/lib/agendamentos/fila-schema";
import {ModalConfirmacaoBlock} from "../modal-confirmacao-block";
export function EditorIndividual({item,instancias,aoSalvar,aoFechar}:{item?:MensagemFila;instancias:string[];aoSalvar:()=>void;aoFechar:()=>void}){
 const [dados,setDados]=useState<DadosAgendamento>(()=>({id:item?.id??crypto.randomUUID(),telefone:item?.telefone??"",instancia:item?.instancia??instancias[0]??"",mensagem:item?.mensagem??"",agendadoPara:item?.data??new Date(Date.now()+3600000).toISOString()}));
 const [horario,setHorario]=useState(()=>{const d=new Date(dados.agendadoPara);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);});
 const [erro,setErro]=useState(""),[ocupado,setOcupado]=useState(false),[confirmar,setConfirmar]=useState(false);
 async function salvar(){setOcupado(true);setErro("");try{const r=await gravarAgendamento(dados,item?{id:item.id,version:Number(item.versao)}:undefined);if(!r.ok){setErro(r.erro);return;}aoSalvar();}catch{setErro("Falha de conexão. Atualize a fila antes de tentar novamente.");}finally{setOcupado(false);setConfirmar(false);}}
 return <article className="panel"><form className="tag-editor" onSubmit={e=>{e.preventDefault();const d=new Date(horario);if(!Number.isFinite(d.getTime())||!validarData(d.toISOString())){setErro("Escolha um horário entre um minuto e um ano a partir de agora.");return;}setDados({...dados,agendadoPara:d.toISOString()});setConfirmar(true);}}>
  <h2>{item?"Editar envio individual":"Novo agendamento individual"}</h2>{erro&&<p role="alert" className="error-message">{erro}</p>}
  <div className="followup-grid"><label>Telefone com código do país<input required type="tel" pattern="\+[1-9][0-9]{6,14}" disabled={ocupado} value={dados.telefone} onChange={e=>setDados({...dados,telefone:e.target.value})}/></label>
  <label>Chip<select required disabled={ocupado} value={dados.instancia} onChange={e=>setDados({...dados,instancia:e.target.value})}>{!instancias.includes(dados.instancia)&&<option value="">Selecione um chip disponível</option>}{instancias.map(i=><option key={i}>{i}</option>)}</select></label></div>
  <label>Data e hora<input required type="datetime-local" disabled={ocupado} value={horario} onChange={e=>setHorario(e.target.value)}/></label>
  <small>Horários no fuso do navegador. O envio pode atrasar se o serviço estiver indisponível.</small>
  <label>Mensagem<textarea required maxLength={6000} rows={4} disabled={ocupado} value={dados.mensagem} onChange={e=>setDados({...dados,mensagem:e.target.value})}/></label>
  <div className="feature-actions"><button className="primary" disabled={ocupado}>Salvar agendamento</button><button type="button" className="secondary" disabled={ocupado} onClick={aoFechar}>Fechar formulário</button></div>
 </form><ModalConfirmacaoBlock aberto={confirmar} titulo="Confirmar agendamento" mensagem={`Agendar envio individual para ${dados.telefone} pelo chip ${dados.instancia}?`} carregando={ocupado} onConfirmar={()=>void salvar()} onCancelar={()=>setConfirmar(false)}/></article>;
}
