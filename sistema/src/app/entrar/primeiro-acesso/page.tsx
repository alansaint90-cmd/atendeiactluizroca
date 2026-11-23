import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth/sessao";
import { FormularioLogin } from "../_components/formulario";
import { TelaAcesso } from "../_components/tela-acesso";
export const metadata = { title: { absolute: "Atende IA Pro" } };
export const dynamic = "force-dynamic";
export default async function PrimeiroAcesso() {
  if (process.env.AUTH_LOGIN_ENABLED !== "true") return <main className="content"><h1>Acesso individual em preparação</h1><p>A autenticação individual ainda não foi ativada neste ambiente.</p></main>;
  if (await obterSessao()) redirect("/");
  return <TelaAcesso><FormularioLogin primeiroAcesso /></TelaAcesso>;
}
