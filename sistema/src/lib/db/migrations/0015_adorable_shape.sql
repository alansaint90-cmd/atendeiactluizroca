CREATE TABLE "atendeia_aulas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"modalidade" text NOT NULL,
	"turma" text NOT NULL,
	"professor" text NOT NULL,
	"inicio" timestamp (3) with time zone NOT NULL,
	"duracao" integer NOT NULL,
	"capacidade" integer NOT NULL,
	"idade_minima" integer NOT NULL,
	"idade_maxima" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_aulas_limites" CHECK ("atendeia_aulas"."capacidade" BETWEEN 1 AND 100 AND "atendeia_aulas"."duracao" BETWEEN 15 AND 240 AND "atendeia_aulas"."idade_minima">=0 AND "atendeia_aulas"."idade_maxima">="atendeia_aulas"."idade_minima" AND "atendeia_aulas"."idade_maxima"<=120)
);
--> statement-breakpoint
CREATE TABLE "atendeia_aulas_reservas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aula_id" uuid NOT NULL,
	"solicitacao_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"idade" integer NOT NULL,
	"telefone" text NOT NULL,
	"responsavel" text NOT NULL,
	"status" text DEFAULT 'confirmada' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_aulas_reservas_status" CHECK ("atendeia_aulas_reservas"."status" IN ('confirmada', 'cancelada')),
	CONSTRAINT "atendeia_aulas_reservas_aluno" CHECK ("atendeia_aulas_reservas"."idade" BETWEEN 0 AND 120 AND ("atendeia_aulas_reservas"."idade">=18 OR length(trim("atendeia_aulas_reservas"."responsavel"))>2) AND "atendeia_aulas_reservas"."telefone" ~ '^[+][1-9][0-9]{6,14}$')
);
--> statement-breakpoint
ALTER TABLE "atendeia_aulas" ADD CONSTRAINT "atendeia_aulas_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_aulas_reservas" ADD CONSTRAINT "atendeia_aulas_reservas_aula_id_atendeia_aulas_id_fk" FOREIGN KEY ("aula_id") REFERENCES "public"."atendeia_aulas"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_aulas_reservas" ADD CONSTRAINT "atendeia_aulas_reservas_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_aulas_reservas_solicitacao" ON "atendeia_aulas_reservas" USING btree ("solicitacao_id");