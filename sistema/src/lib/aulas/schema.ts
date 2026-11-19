import { z } from "zod";

const texto = z.string().trim().min(1, "Preencha este campo.").max(150).regex(/^[^<>\x00-\x1f]+$/u, "Remova caracteres inválidos.");
export const aulaSchema = z.strictObject({
  modalidade: texto, turma: texto, professor: texto,
  inicio: z.iso.datetime({ offset: true }), duracao: z.number().int().min(15).max(240),
  capacidade: z.number().int().min(1).max(100).nullable(), diaSemana: z.number().int().min(0).max(6).nullable().optional(), idadeMinima: z.number().int().min(0).max(120),
  idadeMaxima: z.number().int().min(0).max(120),
}).refine(a => a.idadeMaxima >= a.idadeMinima, { message: "A idade máxima deve ser igual ou maior que a mínima.", path: ["idadeMaxima"] });
export const alunoSchema = z.strictObject({
  nome: texto.regex(/^\p{L}[\p{L}'’.-]*(?:\s+[\p{L}'’.-]+)+$/u, "Informe nome e sobrenome do aluno."),
  idade: z.number().int().min(0).max(120).nullable(), adultoSemIdade: z.boolean().optional(), telefone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Use telefone com DDI e DDD, como +5571999999999."),
  responsavel: z.string().trim().max(150),
}).refine(a => a.idade === null ? a.adultoSemIdade === true : !a.adultoSemIdade, {message:"Identifique o participante adulto ou informe a idade da criança.",path:["idade"]}).refine(a => a.idade === null || a.idade >= 18 || a.responsavel.trim().split(/\s+/).length >= 2, { message: "Informe nome e sobrenome do responsável pelo menor.", path: ["responsavel"] });
export const reservaAulaSchema = z.strictObject({ aulaId: z.uuid(), aluno: alunoSchema, solicitacaoId: z.uuid(), conferido: z.literal(true), inicio: z.iso.datetime({ offset: true }).optional() });
export const alvoAulaSchema = z.strictObject({ id: z.uuid(), atualizadoEm: z.iso.datetime({ offset: true }) });
export type AulaDados = z.infer<typeof aulaSchema>;
export type AlunoDados = z.infer<typeof alunoSchema>;
export interface Aula extends AulaDados { id: string; atualizadoEm: string }
export interface ReservaAula extends AlunoDados { id: string; inicio?: string | null; aulaId: string; solicitacaoId: string; status: "confirmada" | "cancelada"; atualizadoEm: string }
export interface AgendaAulas { aulas: Aula[]; reservas: ReservaAula[] }
export const formatarAula = (inicio: string) => new Date(inicio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export function validarVaga(aula: Aula, aluno: AlunoDados, reservas: ReservaAula[], agora = Date.now()) {
  if (Date.parse(aula.inicio) <= agora) throw new Error("Esta aula já começou. Escolha uma data futura.");
  if (!elegivelParaExperimental(aula, aluno.idade, aluno.adultoSemIdade)) throw new Error("A idade do aluno não corresponde à faixa etária desta turma.");
  if (aula.capacidade !== null && reservas.filter(r => r.aulaId === aula.id && r.status === "confirmada").length >= aula.capacidade) throw new Error("Esta turma está lotada. Escolha outra aula.");
  if (reservas.some(r => r.aulaId === aula.id && r.status === "confirmada" && r.telefone === aluno.telefone && r.nome.toLocaleLowerCase("pt-BR") === aluno.nome.toLocaleLowerCase("pt-BR"))) throw new Error("Este aluno já tem uma reserva confirmada nesta aula.");
}

/** Adulto sem idade numérica só entra em turma geral sem limite adulto específico. */
export function elegivelParaExperimental(aula: Aula, idade: number | null, adultoSemIdade = false) {
  return faixaCompativel(aula,idade,adultoSemIdade) && !(idade!==null && idade>=18 && /^kids/iu.test(aula.turma)) && !(idade===3 && aula.modalidade==="Taekwondo");
}
export function faixaCompativel(aula: Aula, idade: number | null, adultoSemIdade = false) {
  if (idade !== null && idade < 13 && aula.modalidade === "Taekwondo" && aula.turma === "Geral") return false;
  return idade === null ? adultoSemIdade && !/^kids/iu.test(aula.turma) && aula.idadeMinima <= 18 && aula.idadeMaxima === 120 : idade >= aula.idadeMinima && idade <= aula.idadeMaxima;
}
