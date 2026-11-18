DROP INDEX "atendeia_agendamentos_reserva_aula";--> statement-breakpoint
ALTER TABLE "atendeia_agendamentos" ADD COLUMN "etapa_aula" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_agendamentos_reserva_aula_etapa" ON "atendeia_agendamentos" USING btree ("reserva_aula_id","etapa_aula");--> statement-breakpoint
ALTER TABLE "atendeia_agendamentos" ADD CONSTRAINT "atendeia_agendamentos_etapa_aula" CHECK ("atendeia_agendamentos"."etapa_aula" BETWEEN 0 AND 2);