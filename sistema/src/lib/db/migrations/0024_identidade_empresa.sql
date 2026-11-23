CREATE TABLE "atendeia_empresa" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"foto" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_empresa_identidade_unica" CHECK ("atendeia_empresa"."id" = '00000000-0000-4000-8000-000000000024'::uuid),
	CONSTRAINT "atendeia_empresa_nome_valido" CHECK (char_length(trim("atendeia_empresa"."nome")) BETWEEN 2 AND 120)
);
--> statement-breakpoint
ALTER TABLE "atendeia_empresa" ADD CONSTRAINT "atendeia_empresa_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;
--> statement-breakpoint
INSERT INTO "atendeia_empresa" ("id", "nome", "modified_by")
VALUES ('00000000-0000-4000-8000-000000000024', 'CT Luiz Roca', '00000000-0000-4000-8000-000000000001');
