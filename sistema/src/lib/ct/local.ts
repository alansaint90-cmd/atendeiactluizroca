import { z } from "zod";
import { aulaSchema, alunoSchema, validarVaga, type AgendaAulas } from "../aulas/schema";
import { chatbotSchema, type Chatbot } from "../chatbots/schema";

export const registroLocalSchema = z.strictObject({
  id: z.uuid(), tipo: z.enum(["contacts", "tags", "campaigns", "agendamentos", "team", "plans"]),
  nome: z.string().trim().min(1).max(150), detalhe: z.string().max(6000),
  telefone: z.string().max(20).default(""), data: z.string().max(40).default(""),
  status: z.enum(["Novo lead", "Em atendimento", "Experimental agendada", "Matriculado", "Rascunho", "Cancelado"]).default("Rascunho"),
});
export type RegistroLocal = z.infer<typeof registroLocalSchema>;
const estadoSchema = z.object({
  versao: z.literal(1),
  aulas: z.array(aulaSchema.and(z.object({ id: z.uuid(), atualizadoEm: z.iso.datetime({ offset: true }) }))),
  reservas: z.array(alunoSchema.and(z.object({ id: z.uuid(), aulaId: z.uuid(), solicitacaoId: z.uuid(), status: z.enum(["confirmada", "cancelada"]), atualizadoEm: z.iso.datetime({ offset: true }) }))),
  registros: z.array(registroLocalSchema), chatbot: chatbotSchema,
  mensagens: z.array(z.object({ id: z.uuid(), contatoId: z.uuid(), texto: z.string().min(1).max(6000), recebida: z.boolean(), data: z.iso.datetime({ offset: true }) })).default([]),
  followups: z.array(z.object({ texto: z.string().max(3000), minutos: z.number().int().min(1).max(43200) })).max(3),
  configuracao: z.object({ endereco: z.string().max(500), contato: z.string().max(100), orientacoes: z.string().max(3000), condicoes: z.string().max(3000) }),
});
export type EstadoLocal = z.infer<typeof estadoSchema>;
export const CHAVE_CT = "atendeai.ct-luiz-roca.teste.v1";
export function novoEstadoLocal(chatbot: Chatbot): EstadoLocal {
  return { versao: 1, aulas: [], reservas: [], registros: [], mensagens: [], chatbot, followups: [], configuracao: { endereco: "", contato: "", orientacoes: "", condicoes: "" } };
}
export function lerEstadoLocal(texto: string): EstadoLocal { return estadoSchema.parse(JSON.parse(texto)); }
export function reservarLocal(estado: AgendaAulas, entrada: { aulaId: string; aluno: unknown; solicitacaoId: string }): AgendaAulas {
  const aluno = alunoSchema.parse(entrada.aluno);
  const aula = estado.aulas.find(a => a.id === entrada.aulaId);
  if (!aula) throw new Error("Aula indisponível.");
  const existente = estado.reservas.find(r => r.solicitacaoId === entrada.solicitacaoId);
  if (existente) {
    if (existente.aulaId !== aula.id || existente.status !== "confirmada") throw new Error("Solicitação já processada.");
    return estado;
  }
  validarVaga(aula, aluno, estado.reservas);
  return { aulas: estado.aulas, reservas: [...estado.reservas, { ...aluno, aulaId: aula.id, id: crypto.randomUUID(), solicitacaoId: entrada.solicitacaoId, status: "confirmada", atualizadoEm: new Date().toISOString() }] };
}
