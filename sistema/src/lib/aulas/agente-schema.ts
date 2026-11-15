import { z } from "zod";
export const acaoAulasSchema = z.discriminatedUnion("acao", [
  z.strictObject({ acao: z.literal("consultar"), modalidade: z.string().max(80).nullable(), idade: z.number().int().min(0).max(120).nullable() }),
  z.strictObject({ acao: z.literal("preparar"), opcao: z.number().int().min(1).max(6), nome: z.string().min(3).max(150), idade: z.number().int().min(0).max(120), responsavel: z.string().max(150) }),
]);
export type AcaoAulas = z.infer<typeof acaoAulasSchema>;
export const ferramentasAulas = [
  { type: "function", name: "consultar_aulas_experimentais", description: "Consulte datas reais para aula experimental na agenda do CT. Informe modalidade e idade se o cliente já disse; use null quando não souber. Não invente datas nem vagas.", strict: true, parameters: { type: "object", properties: { modalidade: { type: ["string", "null"] }, idade: { type: ["integer", "null"] } }, required: ["modalidade", "idade"], additionalProperties: false } },
  { type: "function", name: "preparar_reserva_aula", description: "Depois que o interessado escolher uma das opções numeradas retornadas pela agenda e informar nome completo e idade, prepare a conferência. Para menores obtenha o nome completo do responsável. Nunca invente dados. Isto ainda não confirma a reserva; o servidor pede confirmação explícita e grava depois.", strict: true, parameters: { type: "object", properties: { opcao: { type: "integer" }, nome: { type: "string" }, idade: { type: "integer" }, responsavel: { type: "string" } }, required: ["opcao", "nome", "idade", "responsavel"], additionalProperties: false } },
];
