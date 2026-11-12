#!/usr/bin/env node
// Execução administrativa manual no container do CT, sem senha ou convite no Git.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const faltantes = ["DATABASE_URL", "AUTH_ORIGIN"].filter(nome => !process.env[nome]?.trim());
const programa = fileURLToPath(new URL("./provisionar-proprietario.cjs", import.meta.url));
if (faltantes.length) {
  console.error(`Configure no serviço: ${faltantes.join(", ")}. Nenhuma conta foi criada.`);
  process.exitCode = 1;
} else if (!existsSync(programa)) {
  console.error("Execute este comando na imagem de produção, que inclui provisionar-proprietario.cjs.");
  process.exitCode = 1;
} else {
  const arquivo = process.env.PROVISIONAR_ARQUIVO || path.join(tmpdir(), `ct-luiz-roca-${randomUUID()}.convite`);
  const resultado = spawnSync(process.execPath, [programa], {
    windowsHide: true, stdio: "inherit",
    env: { ...process.env, PROVISIONAR_NOME: process.env.PROVISIONAR_NOME || "Allan Nascimento",
      PROVISIONAR_EMAIL: process.env.PROVISIONAR_EMAIL || "alansaint90@gmail.com", PROVISIONAR_ARQUIVO: arquivo,
      PROVISIONAR_DIAGNOSTICO: "true" },
  });
  if (resultado.error) {
    console.error("Não foi possível iniciar o provisionamento. Nenhuma credencial foi exibida.");
    process.exitCode = 1;
  } else {
    process.exitCode = resultado.status ?? 1;
    if (resultado.status === 0) console.log(`Convite privado: ${arquivo}\nAbra /entrar/primeiro-acesso e defina sua senha em até 15 minutos. O convite não foi exibido nos logs.`);
  }
}
