import Image from "next/image";
import type { ReactNode } from "react";
import { NomeMarca } from "@/components/marca";
import agente from "../_assets/agente-fxp-referencia.png";
import "../login.css";

export function TelaAcesso({children}:{children:ReactNode}) {
 return <main className="atende-login">
  <div className="atende-login-layout">
   <section className="atende-login-apresentacao" aria-label="Atende IA Pro">
    <span className="atende-login-etiqueta">SEU ATENDIMENTO, MAIS PERTO</span>
    <div className="atende-login-nome"><NomeMarca /></div>
    <p className="atende-login-chamada">Conversas que conectam.<br/>Um atendimento que acolhe.</p>
    <div className="atende-login-robo"><Image src={agente} alt="Agente virtual FXP com headset e notebook" priority sizes="(max-width: 700px) 660px, 1060px" /></div>
    <p className="atende-login-legenda"><span aria-hidden="true"/> Inteligência artificial. Conexões reais.</p>
   </section>
   <section className="atende-login-formulario" aria-label="Acesso ao sistema">{children}<p className="atende-login-rodape">Seu atendimento começa aqui.</p></section>
  </div>
 </main>;
}
