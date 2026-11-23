import { sql } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio } from "../acao";
import type { SessaoAtiva } from "../auth/permissoes";
import { atorCrm } from "../crm/acesso";
import { linhas, type BancoSql, type TransacaoSql } from "../db/porta";
import { empresa, idEmpresa } from "../db/schema/empresa";
import { travaDeColisao, vivos } from "../db/soft-delete";
import { validarFotoPerfil } from "../validators/perfil";
import type { DadosEmpresa } from "./dados";

const dadosEmpresaSchema = z.strictObject({
  nome: z.string().trim().min(2, "Informe o nome da empresa.").max(120, "Informe um nome de até 120 caracteres.")
    .regex(/^[^\u0000-\u001f\u007f]+$/u, "Use um nome sem quebras de linha ou caracteres de controle."),
  foto: z.string().max(2_800_000, "A foto deve ter até 2 MB.").nullable(),
  atualizadoEm: z.iso.datetime({ precision: 3 }),
});
const colunas = sql`nome, foto, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "atualizadoEm"`;

export async function lerEmpresa(banco: TransacaoSql): Promise<DadosEmpresa> {
  const [dados] = linhas<DadosEmpresa>(await banco.execute(sql`
    SELECT ${colunas} FROM ${empresa} WHERE id=${idEmpresa} AND ${vivos(empresa)}`));
  if (!dados) throw new ErroDeNegocio("Identidade da empresa indisponível.");
  return dados;
}

export async function atualizarEmpresa(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown): Promise<DadosEmpresa> {
  const dados = dadosEmpresaSchema.parse(entrada);
  validarFotoPerfil(dados.foto);
  return banco.transaction(async tx => {
    await atorCrm(tx, sessao, "super_admin");
    const anterior = await lerEmpresa(tx);
    const erroColisao = "A identidade da empresa mudou em outra sessão. Recarregue a página e tente novamente.";
    if (dados.atualizadoEm !== anterior.atualizadoEm) throw new ErroDeNegocio(erroColisao);
    const campos: string[] = [];
    if (dados.nome !== anterior.nome) campos.push("nome");
    if (dados.foto !== anterior.foto) campos.push("foto");
    if (!campos.length) return anterior;

    const versaoAnterior = new Date(dados.atualizadoEm);
    const atualizadoEm = new Date(Math.max(Date.now(), versaoAnterior.getTime() + 1));
    const [salva] = linhas<DadosEmpresa>(await tx.execute(sql`
      UPDATE ${empresa} SET nome=${dados.nome}, foto=${dados.foto}, updated_at=${atualizadoEm.toISOString()}, modified_by=${sessao.userId}
      WHERE ${travaDeColisao(empresa, idEmpresa, versaoAnterior)} RETURNING ${colunas}`));
    if (!salva) throw new ErroDeNegocio(erroColisao);
    await tx.execute(sql`INSERT INTO atendeia_audit_logs (action,entity_type,entity_id,changed_fields,modified_by)
      VALUES ('empresa_atualizada','empresa',${idEmpresa},${JSON.stringify(campos)}::jsonb,${sessao.userId})`);
    return salva;
  });
}
