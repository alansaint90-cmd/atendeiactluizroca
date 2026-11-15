import test from "node:test";
import assert from "node:assert/strict";
import { estadoLote, chavesLote, lerLote } from "../src/lib/agent/lote";
import type Redis from "ioredis";
import type { IncomingMessage } from "../src/lib/agent/message";
test("última mensagem reinicia a espera e fragmentos antigos não geram respostas separadas", async()=>{
  const agora=Date.now(); const ultimo={identity:"ultima",text:"Pra levar?",at:agora};
  assert.equal(estadoLote("primeira",ultimo,0,agora+20000),"substituida");
  assert.equal(estadoLote("ultima",ultimo,0,agora+14000),"aguardar");
  assert.equal(estadoLote("ultima",ultimo,0,agora+15000),"processar");
  assert.equal(estadoLote("ultima",ultimo,30,agora+15000),"aguardar");
  const fragmentos=[{identity:"a",text:"Não, obrigada",at:agora-5000},{identity:"b",text:"Precisa de quê?",at:agora-2000},ultimo];
  const client={get:async()=>JSON.stringify(ultimo),lrange:async()=>fragmentos.map(v=>JSON.stringify(v))} as unknown as Redis;
  const mensagem={conversation:"chip-a:contato",identity:"ultima"} as IncomingMessage;
  const lote=await lerLote(client,mensagem);
  assert.equal(lote.texto,"Não, obrigada\nPrecisa de quê?\nPra levar?");
  assert.notDeepEqual(chavesLote("chip-a:contato"),chavesLote("chip-b:contato"));
});
