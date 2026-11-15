import type Redis from "ioredis";
import type { IncomingMessage } from "./message";
import { owned, assertResult, agentKeys } from "./redis";
export const chavesLote = (conversa: string) => [`atendeia:{evolution}:lote:${conversa}`, `atendeia:{evolution}:lote-ultimo:${conversa}`] as const;
export interface Fragmento { identity: string; text: string; at: number }
export async function lerLote(client: Redis, mensagem: IncomingMessage) {
  const [lista, ultimo] = chavesLote(mensagem.conversation);
  const marco = await client.get(ultimo);
  const atual = marco ? JSON.parse(marco) as Fragmento : null;
  const fragmentos = (await client.lrange(lista, 0, -1)).map(v => JSON.parse(v) as Fragmento);
  return { atual, fragmentos, texto: fragmentos.filter(f => Date.now() - f.at <= 300000).map(f => f.text).join("\n").slice(-12000) };
}
export async function concluirLote(client: Redis, token: string, conversa: string, quantidade: number) {
  if (!quantidade) return;
  await assertResult(await client.eval(owned + "redis.call('LTRIM', KEYS[2], ARGV[2], -1); return 1", 2, agentKeys.lock, chavesLote(conversa)[0], token, quantidade));
}
/** Cada mensagem nova reinicia a janela; somente o último evento gera a resposta do grupo. */
export function estadoLote(identidade: string, ultimo: Fragmento | null, delay: number, agora = Date.now()) {
  if (!ultimo) return "processar";
  if (ultimo.identity !== identidade) return "substituida";
  return agora < ultimo.at + Math.max(15, delay) * 1000 ? "aguardar" : "processar";
}
