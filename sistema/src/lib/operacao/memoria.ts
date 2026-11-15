import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import { reservasDoContato } from "../aulas/agente";
import { formatarAula } from "../aulas/schema";
import type { Turn } from "../agent/providers";
export async function contextoDoContato(banco: BancoSql, instancia: string, numero: string) {
  const reservas = await reservasDoContato(banco, numero);
  return `Data atual do CT: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" })}.\n${reservas.length ? `RESERVAS CONFIRMADAS NO BANCO: ${reservas.map(r => `${r.modalidade}, ${formatarAula(r.inicio)}`).join("; ")}. Retome esse contexto quando o cliente voltar; não reinicie o atendimento.` : "Nenhuma reserva futura confirmada encontrada para este WhatsApp. Não afirme que já agendou."}\nInstância atual: ${instancia}. Nunca trate promessas antigas no histórico como prova de reserva.`;
}
export async function historicoDoContato(banco: BancoSql, instancia: string, numero: string, excluirProvedorId?: string): Promise<Turn[]> {
  const dados = linhas<{ role: "user" | "assistant"; content: string }>(await banco.execute(sql`SELECT CASE WHEN m.direction='inbound' THEN 'user' ELSE 'assistant' END role,m.content FROM atendeia_messages m JOIN atendeia_conversations c ON c.id=m.conversation_id JOIN atendeia_channels ch ON ch.id=c.channel_id JOIN atendeia_contacts p ON p.id=c.contact_id WHERE ch.instance_name=${instancia} AND p.phone=${`+${numero}`} AND m.is_deleted=false AND c.is_deleted=false AND ch.is_deleted=false AND p.is_deleted=false AND m.content IS NOT NULL AND (${excluirProvedorId ?? null}::text IS NULL OR m.provider_message_id<>${excluirProvedorId ?? null}) ORDER BY m.sent_at DESC,m.created_at DESC LIMIT 80`));
  return dados.reverse();
}
