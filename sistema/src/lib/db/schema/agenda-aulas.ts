import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, check, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "../schema";
import { colunasAuditoria, instante } from "./_compartilhado";
import { STATUS_AULA, listaSql } from "./_enums";

export const aulas = pgTable("atendeia_aulas", {
  id: uuid("id").primaryKey().defaultRandom(), modalidade: text("modalidade").notNull(), turma: text("turma").notNull(), professor: text("professor").notNull(),
  inicio: instante("inicio").notNull(), duracao: integer("duracao").notNull(), capacidade: integer("capacidade").notNull(),
  idadeMinima: integer("idade_minima").notNull(), idadeMaxima: integer("idade_maxima").notNull(), ...colunasAuditoria,
  modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [check("atendeia_aulas_limites", sql`${t.capacidade} BETWEEN 1 AND 100 AND ${t.duracao} BETWEEN 15 AND 240 AND ${t.idadeMinima}>=0 AND ${t.idadeMaxima}>=${t.idadeMinima} AND ${t.idadeMaxima}<=120`)]);

export const aulasReservas = pgTable("atendeia_aulas_reservas", {
  id: uuid("id").primaryKey().defaultRandom(), aulaId: uuid("aula_id").notNull().references(() => aulas.id, { onDelete: "restrict", onUpdate: "restrict" }),
  solicitacaoId: uuid("solicitacao_id").notNull(), nome: text("nome").notNull(), idade: integer("idade").notNull(),
  telefone: text("telefone").notNull(), responsavel: text("responsavel").notNull(), status: text("status").notNull().default("confirmada"), ...colunasAuditoria,
  modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("atendeia_aulas_reservas_solicitacao").on(t.solicitacaoId),
  check("atendeia_aulas_reservas_status", sql`${t.status} IN (${sql.raw(listaSql(STATUS_AULA))})`),
  check("atendeia_aulas_reservas_aluno", sql`${t.idade} BETWEEN 0 AND 120 AND (${t.idade}>=18 OR length(trim(${t.responsavel}))>2) AND ${t.telefone} ~ '^[+][1-9][0-9]{6,14}$'`)]);
