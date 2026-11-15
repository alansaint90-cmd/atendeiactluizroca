"use client";
import { useState } from "react";
import { CaixaEntrada } from "../conversas/caixa-entrada";
import { AnexoManual } from "../conversas/anexo-manual";
import type { MidiaManual } from "@/lib/atendimento/midia-manual";
import type { EstadoLocal } from "@/lib/ct/local";
export function InboxLocal({ estado, salvar, aoContatos }: { estado: EstadoLocal; salvar: (e: EstadoLocal) => void; aoContatos: () => void }) {
  const contatos = estado.registros.filter(r => r.tipo === "contacts");
  const [contatoId, setContatoId] = useState(""), [recebida, setRecebida] = useState(false), [erro, setErro] = useState("");
  const contato = contatos.find(c => c.id === contatoId) ?? contatos[0];
  const [midia, setMidia] = useState<MidiaManual | null>(null), [gravando, setGravando] = useState(false), [chave, setChave] = useState(0), [texto, setTexto] = useState("");
  const conversas = contatos.map(c => ({ id:c.id,nome:c.nome,telefone:c.telefone,canal:"Teste local",status:"open",mensagens:estado.mensagens.filter(m=>m.contatoId===c.id).map(m=>({id:m.id,conteudo:m.texto,direcao:m.recebida?"inbound":"outbound",instante:m.data})) }));
  return <div className="page-stack pagina-conversas"><header className="page-head"><div><h1>Caixa de entrada</h1></div><button className="secondary" onClick={aoContatos}>Cadastrar contato de teste</button></header>
    <CaixaEntrada conversas={conversas} selecionada={contato?.id ?? ""} aoSelecionar={id=>{setContatoId(id);setTexto("");setMidia(null);setChave(k=>k+1);setErro("");}} atualizar={()=>{}} resposta={contato && <div className="atendimento-manual"><label className="ct-check"><input type="checkbox" checked={recebida} onChange={e=>setRecebida(e.target.checked)}/>Simular mensagem recebida</label>
      <form onSubmit={e=>{e.preventDefault();if(gravando||(!texto.trim()&&!midia))return;try{const conteudo=midia?`[${{image:"Imagem",audio:"Áudio",video:"Vídeo",document:"Documento"}[midia.tipo]} de teste]${texto.trim()?` ${texto.trim()}`:""}`:texto.trim();salvar({...estado,mensagens:[...estado.mensagens,{id:crypto.randomUUID(),contatoId:contato.id,texto:conteudo,recebida,data:new Date().toISOString()}]});setTexto("");setMidia(null);setChave(k=>k+1);setErro("");}catch{setErro("Não foi possível salvar a mensagem de teste.");}}}>
        <AnexoManual key={`${contato.id}-${chave}`} ocupado={false} alterar={setMidia} avisar={setErro} aoGravar={setGravando} podeEnviar={!!texto.trim()||!!midia} bloquearEnvio={midia?.tipo==="audio"&&!!texto.trim()} emoji={v=>setTexto(t=>(t+v).slice(0,midia?1024:4000))}>
          <textarea aria-label="Mensagem de teste" rows={1} value={texto} maxLength={midia?1024:4000} disabled={gravando} onChange={e=>setTexto(e.target.value)} placeholder="Digite uma mensagem de teste"/>
        </AnexoManual>
      </form>{erro&&<p role="status">{erro}</p>}<small className="ct-note">Simulação local. Os arquivos não são armazenados e nenhuma mensagem é enviada ao WhatsApp.</small></div>}/>
  </div>;
}
