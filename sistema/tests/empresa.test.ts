import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { atualizarEmpresa, lerEmpresa } from "../src/lib/empresa/servico";

test("salva a identidade compartilhada com permissão, validação de imagem e trava de edição", async () => {
  const cliente = new PGlite();
  const banco = drizzle(cliente);
  try {
    await applyMigrations(banco);
    const criarUsuario = async (papel: string) => (await cliente.query<{ id: string }>(
      "INSERT INTO atendeia_users(name,email,role,enabled,modified_by) VALUES ($1,$2,$1,true,$3) RETURNING id",
      [papel, papel + "@example.test", systemUserId],
    )).rows[0].id;
    const dono = { userId: await criarUsuario("super_admin"), papel: "super_admin" as const };
    const gerente = await criarUsuario("admin");
    const inicial = await lerEmpresa(banco);
    assert.equal(inicial.nome, "CT Luiz Roca");
    assert.equal(inicial.foto, null);
    const foto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
    const entrada = { nome: " Academia Teste ", foto, atualizadoEm: inicial.atualizadoEm };
    await assert.rejects(atualizarEmpresa(banco, { ...dono, userId: gerente }, entrada), /Sem permissao/);
    await assert.rejects(atualizarEmpresa(banco, dono, { ...entrada, foto: "data:image/svg+xml;base64,PHN2Zz4=" }), /JPG ou PNG/);
    assert.deepEqual(await lerEmpresa(banco), inicial);
    const salva = await atualizarEmpresa(banco, dono, entrada);
    assert.equal(salva.nome, "Academia Teste");
    assert.equal(salva.foto, foto);
    assert.deepEqual(await lerEmpresa(banco), salva);
    await assert.rejects(atualizarEmpresa(banco, dono, { ...entrada, nome: "Outra aba" }), /outra sessão/);
    const semFoto = await atualizarEmpresa(banco, dono, { ...salva, foto: null });
    assert.equal(semFoto.foto, null);
    assert.equal(semFoto.nome, "Academia Teste");
    const auditoria = (await cliente.query<{ changed_fields: string[] }>(
      "SELECT changed_fields FROM atendeia_audit_logs WHERE action='empresa_atualizada' ORDER BY jsonb_array_length(changed_fields) DESC",
    )).rows;
    assert.deepEqual(auditoria.map(registro => registro.changed_fields), [["nome", "foto"], ["foto"]]);
  } finally {
    await cliente.close();
  }
});
