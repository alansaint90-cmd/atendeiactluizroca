"use server";

import { revalidatePath } from "next/cache";
import { executar } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { db } from "../db/client";
import { atualizarEmpresa } from "../empresa/servico";

export async function salvarEmpresa(entrada: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao();
    await exigirPermissao(sessao, "super_admin");
    const dados = await atualizarEmpresa(db(), sessao, entrada);
    revalidatePath("/");
    revalidatePath("/perfil");
    return dados;
  });
}
