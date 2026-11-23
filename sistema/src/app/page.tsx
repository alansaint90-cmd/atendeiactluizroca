import { Workspace } from "@/components/workspace";
import { obterSessao } from "@/lib/auth/sessao";
import { redirect } from "next/navigation";
import { nav } from "@/lib/demo/data";
import { db } from "@/lib/db/client";
import { podeAcessarRotaPainel } from "@/lib/auth/rotas-painel";
import { lerEmpresa } from "@/lib/empresa/servico";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/entrar");
  const { view } = await searchParams;
  const permitido = nav.some(([id]) => id === view && podeAcessarRotaPainel(sessao.papel, id));
  const empresa = await lerEmpresa(db());
  return <Workspace papel={sessao.papel} email={sessao.email} empresaInicial={empresa} rotaInicial={permitido && view ? view : "dashboard"} />;
}
