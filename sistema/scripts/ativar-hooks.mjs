#!/usr/bin/env node
// Aponta o git para .githooks/ (roda no "prepare" do npm install).
// Fora de um repositorio git (ex.: build Docker) nao faz nada.
import { execFileSync } from "node:child_process";

try {
  const prefixo = execFileSync("git", ["rev-parse", "--show-prefix"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  execFileSync("git", ["config", "core.hooksPath", `${prefixo}.githooks`], { stdio: "ignore" });
} catch {
  // sem git ou sem repositorio: nada a ativar
}
