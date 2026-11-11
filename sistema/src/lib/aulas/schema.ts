import { z } from "zod";

const texto = z.string().trim().min(1, "Preencha este campo.").max(150).regex(/^[^<>\x00-\x1f]+$/u, "Remova caracteres inválidos.");
export const aulaSchema = z.strictObject({
  modalidade: texto, turma: texto, professor: texto,
  inicio: z.iso.datetime({ offset: true }), duracao: z.number().int().min(15).max(240),
  capacidade: z.number().int().min(1).max(100), idadeMinima: z.number().int().min(0).max(120),
  idadeMaxima: z.number().int().min(0).max(120),
}).refine(a => a.idadeMaxima >= a.idadeMinima, { message: "A idade máxima deve ser igual ou maior que a mínima.", path: ["idadeMaxima"] });
export const alunoSchema = z.strictObject({
  nome: texto.regex(/^\p{L}[\p{L}'’.-]*(?:\s+[\p{L}'’.-]+)+$/u, "Informe nome e sobrenome do aluno."),
  idade: z.number().int().min(0).max(120), telefone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Use telefone com DDI e DDD, como +5571999999999."),
  responsavel: z.string().trim().max(150),
}).refine(a => a.idade >= 18 || a.responsavel.trim().split(/\s+/).length >= 2, { message: "Informe nome e sobrenome do responsável pelo menor.", path: ["responsavel"] });
export const reservaAulaSchema = z.strictObject({ aulaId: z.uuid(), aluno: alunoSchema, solicitacaoId: z.uuid(), conferido: z.literal(true) });
export const alvoAulaSchema = z.strictObject({ id: z.uuid(), atualizadoEm: z.iso.datetime({ offset: true }) });
export type AulaDados = z.infer<typeof aulaSchema>;
export type AlunoDados = z.infer<typeof alunoSchema>;
export interface Aula extends AulaDados { id: string; atualizadoEm: string }
export interface ReservaAula extends AlunoDados { id: string; aulaId: string; solicitacaoId: string; status: "confirmada" | "cancelada"; atualizadoEm: string }
export interface AgendaAulas { aulas: Aula[]; reservas: ReservaAula[] }
export const formatarAula = (inicio: string) => new Date(inicio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export function validarVaga(aula: Aula, aluno: AlunoDados, reservas: ReservaAula[], agora = Date.now()) {
  if (Date.parse(aula.inicio) <= agora) throw new Error("Esta aula já começou. Escolha uma data futura.");
  if (aluno.idade < aula.idadeMinima || aluno.idade > aula.idadeMaxima) throw new Error("A idade do aluno não corresponde à faixa etária desta turma.");
  if (reservas.filter(r => r.aulaId === aula.id && r.status === "confirmada").length >= aula.capacidade) throw new Error("Esta turma está lotada. Escolha outra aula.");
  if (reservas.some(r => r.aulaId === aula.id && r.status === "confirmada" && r.telefone === aluno.telefone && r.nome.toLocaleLowerCase("pt-BR") === aluno.nome.toLocaleLowerCase("pt-BR"))) throw new Error("Este aluno já tem uma reserva confirmada nesta aula.");
}
