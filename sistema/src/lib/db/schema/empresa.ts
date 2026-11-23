import { check, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { colunasAuditoria } from "./_compartilhado";
import { users } from "../schema";

export const idEmpresa = "00000000-0000-4000-8000-000000000024";
export const empresa = pgTable("atendeia_empresa", {
  id: uuid("id").primaryKey(),
  nome: text("nome").notNull(),
  foto: text("foto"),
  ...colunasAuditoria,
  modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [
  check("atendeia_empresa_identidade_unica", sql`${t.id} = '00000000-0000-4000-8000-000000000024'::uuid`),
  check("atendeia_empresa_nome_valido", sql`char_length(trim(${t.nome})) BETWEEN 2 AND 120`),
]);
