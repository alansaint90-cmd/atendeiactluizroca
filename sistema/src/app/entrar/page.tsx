import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth/sessao";
import { FormularioLogin } from "./_components/formulario";
import { TelaAcesso } from "./_components/tela-acesso";
export const metadata = { title: { absolute: "Atende Aí" } };
export const dynamic = "force-dynamic";
export default async function Entrar() {
  if (process.env.NODE_ENV === "development" && process.env.ATENDEIA_PREVIA_LOCAL === "true") return <TelaAcesso><FormularioLogin previaLocal /></TelaAcesso>;
  if (process.env.AUTH_LOGIN_ENABLED !== "true") return <main className="content"><h1>Acesso individual em preparação</h1><p>A autenticação individual ainda não foi ativada neste ambiente. O responsável pela instalação precisa configurar o primeiro administrador e habilitar o acesso.</p></main>;
  if (await obterSessao()) redirect("/");
  return <TelaAcesso><FormularioLogin /></TelaAcesso>;
}
