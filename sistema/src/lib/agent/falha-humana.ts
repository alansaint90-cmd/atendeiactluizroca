import { sql } from "drizzle-orm";
import { z } from "zod";
import { linhas, type BancoSql } from "../db/porta";
import { systemUserId } from "../db/bootstrap";
import type { AgentConfig } from "./config";

export class FalhaAtendimento extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function telefoneAlertaHumano(config: Pick<AgentConfig,"EVOLUTION_INSTANCE_NAME"|"AI_HUMAN_ALERT_PHONE">) {
  return config.AI_HUMAN_ALERT_PHONE || (config.EVOLUTION_INSTANCE_NAME === "ctluizroca" ? "+5571986639830" : null);
}
const motivos: Record<string,string> = {
  contexto_idade_contraditorio: "O cliente corrigiu uma idade que estava sendo usada no atendimento.",
  inconsistencia_identificada_ia: "O assistente identificou uma contradição de contexto ou agenda que precisa da equipe.",
  agenda_inconsistente: "A opção da agenda precisa ser conferida pela equipe.",
  muay_adaptado: "Avaliar treino adaptado de Muay Thai para menor de 14 anos antes de reservar.",
  pedido_humano: "O cliente foi encaminhado para atendimento humano.",
};
// A trava da conversa torna pausa, alerta e auditoria uma única operação idempotente.
export async function encaminharFalhaHumana(banco: BancoSql, instancia: string, numero: string, telefone: string, codigo: string, nomeInformado?: string|null) {
  z.string().regex(/^\+[1-9]\d{6,14}$/).parse(telefone);
  z.string().regex(/^[1-9]\d{6,14}$/).parse(numero);
  return banco.transaction(async tx => {
    const [c] = linhas<{id:string;version:number;human_takeover:boolean;nome:string}>(await tx.execute(sql`SELECT c.id,c.version,c.human_takeover,p.name nome
      FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id JOIN atendeia_contacts p ON p.id=c.contact_id
      WHERE ch.instance_name=${instancia} AND ch.provider='evolution' AND ch.is_deleted=false
      AND p.is_deleted=false AND c.remote_jid=${`${numero}@s.whatsapp.net`} AND c.is_deleted=false AND c.status<>'closed' FOR UPDATE OF c`));
    if (!c) throw new Error("Conversa indisponível para atendimento humano.");
    if (c.human_takeover) return false;
    await tx.execute(sql`UPDATE atendeia_conversations SET human_takeover=true,status='pending',assigned_to=NULL,
      version=version+1,updated_at=clock_timestamp(),modified_by=${systemUserId}
      WHERE id=${c.id} AND version=${c.version} AND is_deleted=false`);
    const motivo = motivos[codigo] ?? "Uma falha técnica impediu a continuação segura do atendimento.";
    const nome=(nomeInformado || c.nome || "Nome não informado").replace(/[\x00-\x1f\x7f]/g," ").slice(0,150);
    const alerta = `Atendimento humano necessário.\nNome: ${nome}\nWhatsApp do cliente: +${numero}\nChip: ${instancia}\nMotivo: ${motivo}\nA IA está pausada. Abra a caixa de entrada e localize o cliente pelo telefone.`;
    const [item] = linhas<{id:string}>(await tx.execute(sql`INSERT INTO atendeia_agendamentos(telefone,instancia,mensagem,agendado_para,modified_by)
      VALUES(${telefone},${instancia},${alerta},clock_timestamp(),${systemUserId}) RETURNING id`));
    await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
      VALUES('ia_encaminhada_humano','conversa',${c.id},'["human_takeover","status","assigned_to"]'::jsonb,${systemUserId}),
      ('alerta_humano_enfileirado','agendamento',${item.id},'[]'::jsonb,${systemUserId})`);
    return true;
  });
}
