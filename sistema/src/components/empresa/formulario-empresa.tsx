"use client";

import { useState, type FormEvent } from "react";
import type { DadosEmpresa } from "@/lib/empresa/dados";
import { salvarEmpresa } from "@/lib/actions/empresa";
import { AvatarEmpresa } from "./avatar-empresa";

export function FormularioEmpresa({ inicial, aoSalvar }: { inicial: DadosEmpresa; aoSalvar: (salva: DadosEmpresa) => void }) {
  const [salva, setSalva] = useState(inicial);
  const [nome, setNome] = useState(inicial.nome);
  const [foto, setFoto] = useState(inicial.foto);
  const [salvando, setSalvando] = useState(false);
  const [lendoFoto, setLendoFoto] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const ocupado = salvando || lendoFoto;
  const mudou = nome.trim() !== salva.nome || foto !== salva.foto;

  function selecionarFoto(arquivo?: File) {
    if (!arquivo) return;
    setErro("");
    setMensagem("");
    if (!["image/jpeg", "image/png"].includes(arquivo.type) || !arquivo.size || arquivo.size > 2 * 1024 * 1024) {
      setErro("Escolha uma imagem JPG ou PNG de até 2 MB.");
      return;
    }
    const leitor = new FileReader();
    setLendoFoto(true);
    leitor.onload = () => {
      if (typeof leitor.result === "string") setFoto(leitor.result);
      else setErro("Não foi possível ler a foto.");
    };
    leitor.onerror = () => setErro("Não foi possível ler a foto.");
    leitor.onloadend = () => setLendoFoto(false);
    leitor.readAsDataURL(arquivo);
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado || !mudou) return;
    setSalvando(true);
    setErro("");
    setMensagem("");
    try {
      const resultado = await salvarEmpresa({ nome, foto, atualizadoEm: salva.atualizadoEm });
      if (!resultado.ok) { setErro(resultado.erro); return; }
      setSalva(resultado.dados);
      setNome(resultado.dados.nome);
      setFoto(resultado.dados.foto);
      aoSalvar(resultado.dados);
      setMensagem("Identidade da empresa salva.");
    } catch {
      setErro("Não foi possível salvar a identidade da empresa. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return <section className="panel form-panel empresa-formulario" aria-labelledby="identidade-empresa">
    <h2 id="identidade-empresa">Identidade da empresa</h2>
    <p>O nome e a foto aparecem no cabeçalho do painel para toda a equipe.</p>
    <form onSubmit={salvar}>
      <label htmlFor="nome-empresa">Nome da empresa</label>
      <input id="nome-empresa" value={nome} minLength={2} maxLength={120} required disabled={ocupado}
        onChange={evento => { setNome(evento.target.value); setMensagem(""); }} />
      <div className="profile-photo-row">
        <AvatarEmpresa nome={nome} foto={foto} tamanho={64} />
        <div className="profile-photo-actions">
          <div>
            <label className="profile-upload">Foto da empresa<input type="file" accept="image/jpeg,image/png" disabled={ocupado}
              onChange={evento => { selecionarFoto(evento.target.files?.[0]); evento.target.value = ""; }} /></label>
            {foto && <button type="button" className="secondary" disabled={ocupado}
              onClick={() => { setFoto(null); setErro(""); setMensagem(""); }}>Remover foto</button>}
          </div>
          <small>JPG ou PNG de até 2 MB.</small>
        </div>
      </div>
      {erro && <p role="alert">{erro}</p>}
      {mensagem && <p role="status">{mensagem}</p>}
      <button type="submit" className="primary" disabled={ocupado || !mudou}>{salvando ? "Salvando…" : "Salvar identidade"}</button>
    </form>
  </section>;
}
